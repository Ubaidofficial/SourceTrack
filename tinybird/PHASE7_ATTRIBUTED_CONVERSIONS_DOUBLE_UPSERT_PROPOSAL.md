# Phase 7 — `attributed_conversions` double-upsert fix

> **Status: IMPLEMENTED this round.** Originally a design-only proposal; superseded by the landed diff below after two rounds of verification (`stripe_subscription_id` presence/absence on the carrier event, `provider` presence on the carrier event). No backfill — fix-forward only, per §4.

## 1. Current behavior (traced, not assumed)

`processSite()`'s `conversionsQuery` ([nightly-attribution.js:362-386](api/jobs/nightly-attribution.js:362)) pulls **every** raw `$conversion` PostHog event for the lookback window, with no filter on `conversion_value` or `conversion_type` — this includes both:
- the subscription-mode checkout's `$0` attribution carrier (`conversion_type='purchase'`, `conversion_value=0`, `provider='stripe'`), and
- the `invoice.paid` revenue event for the *same* signup (`conversion_type='subscription'`/`'renewal'`, real value).

The loop calls `processConversion(site, conversion)` for **every** row unconditionally, and (pre-fix) unconditionally upserted the returned `record` into `attributed_conversions` (`onConflict: 'site_id,conversion_event_id'` — since the two events have different `conversion_event_id`s, both survived as separate rows, not deduped).

`processConversion()` itself already has the **correct** conditional gate for the money-rail side: the `subscription_identity` seed always runs (needs the checkout event's `client_reference_id` stitch), but the `subscription_revenue` insert is explicitly gated on `conversion.stripe_subscription_id` being present ([nightly-attribution.js:784-786](api/jobs/nightly-attribution.js:784)) — so the checkout's $0 row correctly produced **no** `subscription_revenue` row, before or after this fix. The gap was narrower than the money-rail path: specifically the unconditional `attributed_conversions` upsert had no equivalent gate.

## 2. Two fields verified across rounds — capture-vs-SELECT-addition distinction, resolved

Two rounds of read-only verification against the exact `conversionProperties` object in the checkout handler ([stripe-webhook.js:323-368](api/routes/stripe-webhook.js:323), post-fix line numbers) established:

- **`stripe_subscription_id`** was genuinely **absent** on the checkout-carrier event pre-fix — no such key in `conversionProperties`, and `session.subscription` (Stripe's own field, populated by Stripe only for subscription-mode sessions, never for one-time/payment-mode) was never read anywhere in `stripe-webhook.js`. **This was the one genuine producer-side gap** — closed by adding `stripe_subscription_id: session.subscription || null` to the checkout handler (§3).
- **`provider`** was, by contrast, **already present** — `provider: 'stripe'` is a hardcoded literal on the checkout-carrier event (verified directly, not assumed from a different pipe's SELECT list). The only gap here was that `nightly-attribution.js`'s `conversionsQuery` didn't pull it into its result set — a **read-side SELECT addition**, zero producer risk, since the data already existed at ingest.

Net: **one producer-side write** (`stripe_subscription_id` capture in `stripe-webhook.js`) + **two read-side SELECT additions** (`stripe_event_type`, `provider` in `nightly-attribution.js`'s query) — not three producer changes, as an earlier draft of this proposal implied before the distinction was pinned down precisely.

## 3. Implemented fix: shared discriminator + skip-on-write

**`isSubscriptionCheckoutCarrier()`** — new pure helper in [api/lib/stripe-subscription.js](api/lib/stripe-subscription.js), shared with Path B ([PHASE7_MULTITOUCH_CONVERSION_DOUBLE_COUNT_PROPOSAL.md](tinybird/PHASE7_MULTITOUCH_CONVERSION_DOUBLE_COUNT_PROPOSAL.md)):

```js
export function isSubscriptionCheckoutCarrier({ provider, conversion_type, conversion_value, stripe_subscription_id, stripe_event_type } = {}) {
  return provider === 'stripe' &&
    conversion_type === 'purchase' &&
    Number(conversion_value) === 0 &&
    !!stripe_subscription_id &&
    stripe_event_type === 'checkout.session.completed'
}
```

**Discriminator changed from absence-based to presence-based**, resolving the edge case that the design-only version of this proposal left open: since `stripe-webhook.js` now forwards `session.subscription` onto the carrier itself, a subscription-mode checkout's `stripe_subscription_id` is **present**, while a one-time (payment-mode) checkout's is **always null**, even when fully discounted to $0. `stripe_subscription_id present` is now the unambiguous signal — the fully-discounted-one-time-checkout collision this proposal originally flagged as an accepted, undecided residual **no longer exists**.

`conversion_value` null-coercion is stated explicitly in the helper's own code comment (not left implicit, per instruction): `Number(null) === 0` (matches, may skip), `Number(undefined)` is `NaN` (never `=== 0`, never skips) — a conversion with truly-missing `conversion_value` fails closed (doesn't skip) rather than guessing, since a false negative only preserves today's pre-existing count-inflation (no new bug), while a false positive would newly and wrongly exclude a real conversion.

**Wired into `processSite()`'s loop** ([nightly-attribution.js:404-437](api/jobs/nightly-attribution.js:404)): `processConversion()` still runs unconditionally in full (identity seed + attribution computation unchanged, zero touch to the money-rail write path); only the subsequent `attributed_conversions` write (both the live `upsert` and the `--reprocess-all` `records.push`) is skipped when `isSubscriptionCheckoutCarrier(conversion)` is true. `conversionsQuery`'s SELECT gained `properties.stripe_event_type` and `properties.provider` (2 read-side additions, no producer change, per §2).

## 4. Rejected: (b) dedupe-on-write keyed to `stripe_subscription_id`

Rejected because `stripe_subscription_id` is **not** a 1:1 key per attributed-conversion — it's shared across the *entire subscription lifecycle*. A monthly subscription generates one `invoice.paid` event **per billing cycle**, all carrying the **same** `stripe_subscription_id`. Deduping `attributed_conversions` on it would collapse every renewal into a single row, destroying legitimate revenue-over-time history. Much larger blast radius than the bug being fixed — today's bug inflates a count metric by +1 per signup with revenue/customer-count integrity intact; this "fix" would risk losing real recurring-revenue rows entirely. The existing `subscription_revenue` table already does subscription-lifecycle dedup correctly via its own `dedup_key` scoped to `(site_id, dedup_key)` ([nightly-attribution.js:781-793](api/jobs/nightly-attribution.js:781)) — reusing that *pattern* is fine; reusing `stripe_subscription_id` alone as `attributed_conversions`'s dedup key is not.

## 5. Backfill for historical duplicated rows — not done, fix-forward only

**Impact is count-only, not revenue.** `revenue`, `total_revenue`, and `customers`/`totalCustomers` counts were all unaffected by this bug even before the fix (the checkout row's `conversion_value` was correctly $0, and its `conversion_type='purchase'` is the *only* one of the pair that classifies as `'customer'`). Only raw "Conversions" totals/columns (Dashboard Overview, Campaigns, Report Builder, CSV export) were off by +1 per historical subscription signup.

**No backfill shipped.** Historical `attributed_conversions` rows written before this fix remain duplicated. Correctly identifying them retroactively would require re-querying PostHog per candidate row (the table itself never stored `stripe_event_type`/`provider`/`stripe_subscription_id`), and the impact is a secondary count metric, not revenue — not worth the retroactive cross-reference cost. If a specific site's reported numbers are later found to matter enough to correct, do a scoped, manually reviewed backfill for that one site only, not a blanket sweep.

## 6. Tests

6 new unit tests in [api/tests/stripe-subscription-ingest.test.js](api/tests/stripe-subscription-ingest.test.js) (`isSubscriptionCheckoutCarrier`, shared with Path B): subscription-mode carrier → true; `invoice.paid`/lifecycle events → false (conversion_type never `'purchase'` on that path); one-time checkout with real value → false; fully-discounted one-time checkout (no subscription_id) → false; non-Stripe provider → false; `conversion_value` null-coercion (`null` matches as 0, `undefined` fails closed). All passing; full suite run shows no regressions (pre-existing 21 integration-test failures need a live `localhost:3000` server and are unchanged by this diff, confirmed via `git stash` comparison).
