# Phase 7 — `nightly-attribution.js` touchpoints N+1 (money-rail-adjacent)

> **Status: DEFERRED — no current production cost to justify implementation.** Design-only; not implemented. Revisit when `subscription_identity`/`subscription_revenue` show real write volume, or ahead of a specific launch event expected to drive subscription signups (e.g. the outstanding production checkout test, or actual paid-beta launch). Recorded here so the investigation isn't re-done from scratch later.

## 1. Current behavior (traced, not assumed — verified against `main` post tonight's 3 merges)

`processConversion()` ([nightly-attribution.js:548-824](api/jobs/nightly-attribution.js:548)) runs a fresh PostHog touchpoints query per conversion — `distinct_id = '<X>' AND timestamp <= conv.timestamp AND timestamp >= conv.timestamp - INTERVAL windowDays DAY`, `ORDER BY timestamp ASC LIMIT 500` ([nightly-attribution.js:559-593](api/jobs/nightly-attribution.js:559)) — called sequentially, once per row, from both `processSite()`'s loop ([nightly-attribution.js:411-455](api/jobs/nightly-attribution.js:411)) and `runBackfill()`'s loop ([nightly-attribution.js:300-320](api/jobs/nightly-attribution.js:300)). Classic N+1: N conversions in a run → N touchpoint queries.

This is **not just a read-side cost** — the touchpoints result is a **write-path input**:

- Feeds `record.first_touch_source/medium/campaign/timestamp` ([nightly-attribution.js:742-745](api/jobs/nightly-attribution.js:742)).
- Step 2 ([nightly-attribution.js:798](api/jobs/nightly-attribution.js:798)): `buildSubscriptionIdentitySeed({conversion, touchpoints, record})` → [stripe-subscription.js:104-108](api/lib/stripe-subscription.js:104) returns `null` (no write) when `(touchpoints?.length || 0) === 0`. `subscription_identity`'s upsert is `ON CONFLICT DO NOTHING` (write-once, no-downgrade) — a wrong `touchpoints.length` on the acquisition event is a **permanent** miss, not a retryable one.
- Step 3 ([nightly-attribution.js:830-871](api/jobs/nightly-attribution.js:830)): `insertSubscriptionRevenue` re-reads `subscription_identity` fresh and denormalizes `first_touch_source/channel` into `subscription_revenue`. If Step 2 never wrote, the revenue row inserts with `first_touch_source: null, attribution_status: 'unknown'` — also write-once (`ignoreDuplicates: true`), fixable later only by the backfill sweep ([nightly-attribution.js:498](api/jobs/nightly-attribution.js:498)) if the identity subsequently resolves.

So: a wrong touchpoints result doesn't skew a report number here — it can silently and permanently misattribute real subscription revenue. This is why the verification bar for any rewrite is stricter than a typical read-path optimization (§4).

## 2. Tonight's Stripe carrier-discriminator work — confirmed no interaction, one flag carried forward

Traced `isSubscriptionCheckoutCarrier` (Phase 7, [stripe-subscription.js:152-158](api/lib/stripe-subscription.js:152)) against this path directly:

- `processConversion()` still runs in full for the $0 carrier event — explicit comment at [nightly-attribution.js:430-435](api/jobs/nightly-attribution.js:430): the carrier is the only event with the `client_reference_id` stitch, so its own touchpoints query and Step 2 seed gate fire exactly as before tonight's fixes. `isSubscriptionCheckoutCarrier` only gates the downstream `attributed_conversions` write ([nightly-attribution.js:437-439](api/jobs/nightly-attribution.js:437)) and the Step 3 revenue insert ([nightly-attribution.js:819](api/jobs/nightly-attribution.js:819)) — neither the touchpoints fetch nor Step 2.
- The one new field, `first_subscription_id: conversion.stripe_subscription_id || null` ([stripe-subscription.js:111](api/lib/stripe-subscription.js:111)), is write-once/informational per its own doc comment — not part of the `ON CONFLICT` target, never read back. No behavioral change to the gate.
- **Flag carried into §4**: any batched touchpoints-fetch design must still include the carrier's `distinct_id` in the batch input — the carrier can't be pre-filtered out before the fetch just because it's excluded from `attributed_conversions`/revenue writes later. The exclusion must stay exactly where it is today (after `processConversion` returns), not move earlier into the batch-collection step.

## 3. Real query-count grounding (prod `zxjjjsipafojhzkkumvh`, not a hypothetical extrapolation)

Pulled directly from `job_runs` (`job_name='nightly-attribution'`) and cross-checked against `attributed_conversions`/`subscription_identity`/`subscription_revenue` row counts, since `job_runs` has a known prior silent-write bug (fixed separately, commit `0e7c796`):

- 58 real runs, 2026-05-15 → 2026-07-01 (~47 days).
- `conversions_processed`: max **8** in a single run, median **0**, avg **0.52**, sum **30** across all 47 days, 51/58 runs processed zero conversions (any type — not subscription-specific).
- `attributed_conversions`: **6 rows, ever**, spanning 2 days, 2 sites.
- `subscription_identity` / `subscription_revenue`: **0 rows each**. Zero subscription conversions have ever reached this code path in production.

**No "N conversions today → M/100 batch queries after" ratio can be honestly projected from this.** The worst real day on record was 8 touchpoint queries total (all conversion types combined) — that's 1 batch query after a rewrite, not a case where N+1 batching has anything to amortize. An extrapolated number here would be a guess dressed as a projection, not a real estimate — declining to produce one rather than doing that.

## 4. Batching design (recorded for later implementation, not built)

Same shape as `aiplatform_pageviews_live_batch` ([attribution-engine.js:466-520](api/lib/attribution-engine.js:466)): collect all conversions' `distinct_id`s for the run, chunk into batches (~100), one `distinct_id IN (...)` query per batch instead of one per conversion. Because `windowDays` is site-level (not per-conversion), a per-visitor window of `[min(conv.timestamp) - windowDays, max(conv.timestamp)]` covers every conversion for that visitor in one fetch; slice client-side per conversion using the exact same `timestamp <= conv.timestamp` / `>= conv.timestamp - windowDays` bounds as today.

Three guardrails this rewrite needs that the read-side `aiplatform` batch did not (because that one only feeds a report aggregate, not a write gate):

1. **Re-apply `LIMIT 500` per-conversion after client-side slicing**, not just at the batch-query level. A visitor with >500 pageviews spread across multiple conversions could get a truncated/reordered touchpoint set for one specific conversion if the cap is only enforced batch-wide — and a truncated set can flip `touchpoints.length` across the 0/nonzero boundary, flipping the Step 2 seed-write decision for that conversion.
2. **Preserve today's failure-isolation blast radius.** [nightly-attribution.js:596-601](api/jobs/nightly-attribution.js:596) currently falls back to `touchpointRows = []` on a per-conversion query failure — silently treating one conversion as unstitched. A batched query failure treated the same way would zero out touchpoints for up to 100 conversions at once instead of 1. The rewrite must fall back to per-conversion queries for just the failed batch, not blanket-empty it.
3. **No shared array references across conversions for the same visitor** — each conversion's touchpoints slice must be its own array (different per-conversion timestamp bound), never a shared reference into the batch result.

Plus the carrier-inclusion point from §2: the carrier's `distinct_id` must stay in the batch input set; only the later writes stay gated as they are today.

**Verification bar, stricter than a read-path rewrite**: diff the resulting touchpoints array **per individual conversion** (order + content + length) between today's per-conversion query and the batched query, for a real multi-conversion visitor — not just a matching aggregate count or report total. Explicitly test the >500-touchpoints-across-multiple-conversions edge case and a forced single-batch-query failure to confirm sibling conversions in the same batch aren't silently zeroed.

## 5. Revisit triggers

- `subscription_identity` or `subscription_revenue` show real write volume (currently 0 rows each), or
- Ahead of a specific launch event expected to drive subscription signups (the outstanding production checkout test, or actual paid-beta launch).

Until one of those, this stays deferred — implementing against data that can't validate it would mean shipping an untested-at-real-scale change to a money-rail write path for no measurable benefit today.
