# Phase 7 — `getMultiTouchAttributionLive` double-count (Path B)

> **Status: IMPLEMENTED this round.** Originally a design-only companion to [PHASE7_ATTRIBUTED_CONVERSIONS_DOUBLE_UPSERT_PROPOSAL.md](tinybird/PHASE7_ATTRIBUTED_CONVERSIONS_DOUBLE_UPSERT_PROPOSAL.md) (Path A); superseded by the landed diff below after two rounds of verification (`stripe_subscription_id` presence/absence on the carrier event, `provider` presence on the carrier event). Same root cause as Path A, different mechanism, different file — landed in the same commit set.

## 1. Where the double-count actually happens (traced, not assumed)

`getMultiTouchAttributionLive` ([attribution-engine.js:1439](api/lib/attribution-engine.js:1439)) is the live engine behind `linear`/`u_shaped`/`time_decay`/`w_shaped` models. It reads PostHog directly (`convSql`), not the `attributed_conversions` Supabase table — an independent data source from Path A, with no ordering dependency between the two fixes.

**The aggregation loop** ([attribution-engine.js:1641](api/lib/attribution-engine.js:1641), post-fix line numbers) is where the actual double-crediting happens, and it's **not limited to the zero-touchpoint fallback** — traced `calculateAttribution()` ([:2954](api/lib/attribution-engine.js:2954)) and confirmed: when `touchpoints.length === 0`, it returns `linear: [], u_shaped: [], time_decay: [], w_shaped: []` — **empty for all four models identically**, uniformly. The caller then hits a no-touchpoints fallback which synthesizes a single synthetic "direct" share with `fraction: 1.0` regardless of which model was requested. **But even when the checkout-carrier conversion *does* have touchpoints** (same visitor, same touchpoint set within the attribution window as the paired `invoice.paid` conversion), `calculateAttribution()` still returns real per-model shares summing to a total `fraction` of 1.0 across those touchpoints — so the double-count isn't only the zero-touchpoint edge case, it's structural: **every** conversion row processed in the loop contributes up to 1.0 total fraction to `conversions`, whether via the fallback or via real touchpoint math, and the checkout carrier and its paired `invoice.paid` event usually share the *same* touchpoint set — so both would double-attribute into the *same* dimension bucket(s), not just inflate an unrelated bucket.

## 2. Two fields verified across rounds — capture-vs-SELECT-addition distinction, resolved

Same finding as Path A (§2 of that doc), re-verified independently for this file: `stripe_subscription_id` was genuinely **absent** on the checkout-carrier event pre-fix (closed by the one producer-side write in `stripe-webhook.js`, shared with Path A). `provider` was **already present** on the carrier event (`provider: 'stripe'`, hardcoded) — the only gap here was that `convSql` didn't select it. Since `convSql` already selected `provider` before this round even began (unlike `nightly-attribution.js`'s query, which needed it added), Path B needed exactly **2 read-side SELECT additions** (`stripe_subscription_id`, `stripe_event_type`) and **zero producer-side changes of its own** — it benefits from Path A's one producer write for free.

## 3. Implemented fix: shared discriminator, skip in the aggregation loop

Uses the same `isSubscriptionCheckoutCarrier()` helper as Path A ([api/lib/stripe-subscription.js](api/lib/stripe-subscription.js) — see that proposal for the full signature and the explicit `conversion_value` null-coercion comment). **Fix lives in the JS aggregation loop, not a SQL `WHERE` clause** — no performance case for filtering earlier (`convSql` already caps at `LIMIT 10000`; one extra row per signup is immaterial), and this codebase has a documented history of subtle HogQL/ClickHouse bugs (Phase 5's ~15 deploy-check blockers) that a plain JS `continue` avoids entirely. Also keeps the same shape as Path A's fix (a conditional skip, not a query-level exclusion).

`convSql`'s SELECT gained `properties.stripe_subscription_id AS stripe_subscription_id` and `properties.stripe_event_type AS stripe_event_type` ([attribution-engine.js:1476-1477](api/lib/attribution-engine.js:1476)); both are threaded through the row-mapping destructure and returned on each `conv` object. At the top of the `for (const conv of conversions)` loop:

```js
if (isSubscriptionCheckoutCarrier(conv)) continue
```

This skips the row entirely — no touchpoint filtering, no share computation, no `aggregated[dimVal].conversions` contribution at all for that `conv`. One shared helper, imported into both `nightly-attribution.js` and `attribution-engine.js` — not two independent copies of the condition, avoiding the fork CLAUDE.md's channel-classifier rule warns against.

## 4. Does this affect all 4 models identically?

**Yes — confirmed, not assumed.** The double-count mechanism sits entirely in the *shared* aggregation loop and the *shared* `calculateAttribution()` call, both executed identically regardless of `model`. The only per-model difference is which attribution array (`attribution.linear` / `.u_shaped` / `.time_decay` / `.w_shaped`) is selected — all four are populated (or emptied, in the zero-touchpoint case) by the same `calculateAttribution()` call using the same touchpoint set, so the skip at the loop's entry point removes the checkout-carrier's contribution identically for `linear`, `u_shaped`, `time_decay`, and `w_shaped`.

## 5. Edge case — resolved, not just documented

The design-only version of this proposal flagged a collision: a genuinely fully-discounted (`$0`), *one-time* (payment-mode) Stripe checkout would have been indistinguishable from the subscription-mode $0 carrier by every field the (then absence-based) condition checked. **This is now resolved, not merely accepted as bounded** — because `stripe-webhook.js` now forwards Stripe's own `session.subscription` onto the carrier event, and Stripe only ever populates that field for subscription-mode sessions (never for one-time/payment-mode, even when fully discounted to $0), `stripe_subscription_id present` is an unambiguous signal. A fully-discounted one-time checkout will have `conversion_value===0`, `conversion_type==='purchase'`, `provider==='stripe'`, `stripe_event_type==='checkout.session.completed'` — but `stripe_subscription_id` absent — correctly failing the discriminator and remaining counted.

## 6. Tests

Same 6-test suite as Path A ([api/tests/stripe-subscription-ingest.test.js](api/tests/stripe-subscription-ingest.test.js)) covers `isSubscriptionCheckoutCarrier` directly — one helper, one set of unit tests, exercised identically by both call sites. No additional Path-B-specific tests were added for `getMultiTouchAttributionLive`/`convSql` themselves, since testing those requires live PostHog/HogQL mocking not present in this codebase's existing test conventions; the discriminator's correctness (where the actual risk concentrates) is fully covered at the unit level.

## 7. Interaction with Path A

Path A (`attributed_conversions`) and Path B (multi-touch live models) are independent code paths reading independent data sources (Supabase table vs. live PostHog query) — landed in the same commit set since they share the discriminator helper and the producer-side `session.subscription` capture, not because either depends on the other's runtime behavior.
