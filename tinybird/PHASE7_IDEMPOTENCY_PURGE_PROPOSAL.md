# Phase 7 — `tinybird_revenue_idempotency_keys` retention/purge (PROPOSAL ONLY)

> **Status: DESIGN ONLY. No migration, no code written.** For founder review. Nothing gets built until this is approved.

## 1. Current usage pattern (verified, not assumed)

- **Table not yet wired to any producer.** `createRevenueIdempotency()` (`tinybird/adapter/idempotency.js:32`) is defined and unit-tested (`tinybird/adapter/__tests__/idempotency.test.js`) but `grep`-confirmed **not called** anywhere in `api/` or `tinybird/` outside its own file/tests. No `dualWriteEvent` call site claims a Tinybird-plane key today.
- **Row count today (staging, `nrsvpwzekfrdrzkoecfk`, read-only `execute_sql`):** `0` rows, `min/max created_at` both `null`. Confirms the code finding — this is inert.
- **Sibling table for scale context:** the older, currently-live `revenue_idempotency_keys` (Stripe rail, `api/lib/idempotency.js`) has `71` rows on staging. That table has **no purge job either** (checked `20260606180000_revenue_foundation.sql` — only the `claim_revenue_idempotency_keys` RPC, no retention). This is a pre-existing, separate gap — flagging for awareness, not proposing a fix for it here (out of scope of this task).
- **Insert/lookup shape (from the code, once wired):** one `INSERT` per emitted event (claim-before-emit), keyed on `(site_id, event_id)` with a `UNIQUE` constraint as the dedup; a `DELETE` (rollback) only on the rare emit-failure path. No read/lookup query exists beyond the insert's own unique-violation check — this table is write-once, dedup-by-constraint, never SELECTed by app code.
- **Volume expectation:** given the sibling table's 71 rows on staging and SourceTrack's current customer scale (per memory: early free-tier stage), this table will stay small (low hundreds to low thousands of rows/month even at moderate growth) — a purge job here is a hygiene measure, not a performance-critical one.

## 2. Proposed retention window

**90 days**, matching the task's suggestion, for these reasons:
- The row's only job is deduping a *retry* of the same `event_id`. Once past the realistic redelivery window, the row does nothing except take up space.
- Stripe's automatic webhook retry window is a few days; the more dangerous edge case is a **manual resend from the Stripe Dashboard** (an admin re-triggering a webhook while debugging), which has no hard time limit but is rare beyond weeks, not months.
- The comment in the migration also calls out **offline↔browser `external_event_id` cross-dedup** — a customer's CRM/offline-conversion batch importer could conceivably replay an upload weeks after the original event if a sync job was paused/misconfigured. 90 days covers this comfortably without hoarding rows indefinitely.
- At current/projected volume the storage cost of 90d retention is negligible — there is no pressure to go shorter (e.g. 30d) purely for space reasons.

## 3. Where the purge job should live

**Recommend: piggyback on the existing `nightly-attribution.js` job**, not a new Supabase scheduled function or `pg_cron`.

- Checked staging for `pg_cron`/`pg_net` extensions — **neither is installed.** Introducing DB-native cron would mean enabling a new extension (a DDL/infra decision requiring separate sign-off), where the app already has a working, scheduled nightly job with an established retention-purge pattern.
- `nightly-attribution.js` already has this exact shape: `runRetentionPurge(sites)` (line 1005) and `runFreeTierPageviewPurge()` (line 1046) are called from `main()` at lines 204/245 respectively, both simple "DELETE rows older than cutoff" sweeps that run once per nightly invocation.
- **Difference from `runRetentionPurge`:** that function is *per-site*, keyed off each site's `data_retention_days` setting (customer-configurable data retention for their own conversion data). `tinybird_revenue_idempotency_keys` is **not** customer data — it's an internal dedup marker with no FK to `sites` (deliberately, per the migration's own comment: `site_id` is the raw Tinybird tenant string, not `sites.id`). It doesn't need per-site scoping or a customer-facing retention setting — it needs one **global** sweep: `DELETE FROM tinybird_revenue_idempotency_keys WHERE created_at < now() - INTERVAL '90 days'`.
- Proposed shape (for review, not written): a new function alongside `runFreeTierPageviewPurge()`, e.g. `runTinybirdIdempotencyPurge()`, called once from `main()` — no site loop, no site-specific config, just the one global cutoff delete. Should log a row count on delete, matching the existing purge functions' logging convention (`log(...)` calls with counts).

## 4. Risk: purging a key still needed for a late-arriving duplicate

- **The failure mode:** if a duplicate webhook/event arrives with the *same* `event_id` **after** its key has been purged, the claim `INSERT` succeeds (no more unique-row to collide with) and the event is treated as fresh — i.e., **silent double-ingestion** of that revenue event, past the retention window.
- **Mitigating factors, in order of strength:**
  1. This table dedups a **narrower, riskier case** than the already-existing `revenue_idempotency_keys` (Stripe-specific) claim — since `revenue_idempotency_keys` has no purge either today, this isn't a new class of risk being introduced, just extending an existing accepted risk shape to a second table.
  2. 90 days is generous relative to realistic redelivery timelines (see §2) — a duplicate arriving *that* late is an edge case, not a normal retry path.
  3. Downstream, `dualWriteEvent`'s target (`events.datasource`) has its own `event_id` column and is queryable — a very-late duplicate would still be *detectable* after the fact (two rows, same `event_id`, different `timestamp`) even if not *prevented* at ingest. Not automatic, but not silent-forever either.
- **Residual risk to flag explicitly:** if the offline/CRM batch-replay scenario in §1 turns out to be a real, recurring pattern (not hypothetical) for a specific customer's integration, 90 days may be too short for *that customer* specifically. No such customer is known today — this is a "watch for it" flag, not a blocker.
- **Alternative not recommended:** purging only rows with no matching `events` row would require a cross-store (Postgres → Tinybird) check per row, adding real complexity for a table that's currently empty and low-value. Not worth it until real volume exists.

## 5. Open question for founder review

Should this purge job be built now (table is unused, no urgency) or deferred until `createRevenueIdempotency` is actually wired into a producer? Building it now means it's in place before the table sees real traffic; deferring means not spending review/build time on dead code. Recommend deferring the *build* until the wiring lands, but keeping this proposal on file as the agreed design — no action needed until then.
