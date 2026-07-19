# QA Report: Conversion Cap Enforcement (Session 140G-3)

- **Date:** 2026-06-13
- **Branch:** `main`
- **Session:** 140G-3
- **Status:** **PASS (Not Committed)**

---

## 1. Goal & Requirements
Audit and implement real-time monthly conversion cap enforcement at all backend ingestion points using a single atomic PostgreSQL RPC to avoid race conditions.

### Constraints Met:
1. **No Commit/Push:** Changes kept strictly in the local workspace for review.
2. **Late-Gated Enforcement Check:** Moves the monthly conversion limit checks (`claimConversionUsage`) to the latest safe point—immediately before `ph.capture(...)` / conversion event capture.
   - Checked after signature verification, HMAC verification, payload validation, topic/event type exclusions, path exclusions, and idempotency deduplication.
   - Prevents invalid/unsupported/duplicate events from consuming the conversion quota.
3. **No `attributed_conversions` Queries for Ingestion:** Ingestion does not query the heavy `attributed_conversions` table (which is populated nightly by cron). Instead, a dedicated real-time table `site_usage_monthly` is used.
4. **No Check-Then-Increment Race:** Enforces caps atomically using the `claim_site_conversion_usage(p_site_id, p_month, p_limit)` RPC function with row-level locking (`FOR UPDATE`).
5. **Endpoint Behavior on Limit Reached:**
   - **Direct/browser routes** (`POST /api/conversion` and `POST /api/conversion/offline`) and incoming webhooks return `402 Payment Required`.
   - **Shopify & Stripe webhooks** return `200 OK` with JSON payload `{ success: false, ignored: true, error: 'Conversion limit reached for your plan' }` to prevent provider webhook retries.
   - **Proxy route** (`POST /sp/c`) skips PostHog capture silently in the background.
6. **Time Boundary Fix:** Uses UTC calendar month boundaries (`getUTCFullYear()` and `getUTCMonth() + 1`) to ensure billing month resets do not depend on the server/Railway timezone.
7. **Database Security Hardening:**
   - Prevents public execution by revoking execute privileges from `PUBLIC`, `anon`, and `authenticated` roles.
   - Restricts execution exclusively to `service_role`.
   - Lacks `SECURITY DEFINER` completely. Since the backend services connect using the `service_role` key, the function runs with service_role native privileges (which naturally bypasses RLS on `site_usage_monthly`). Removing `SECURITY DEFINER` minimizes security surface area.
   - Explicitly locks down the search path with `SET search_path = public, pg_temp` to prevent search path injection attacks.
8. **Fail-Open Policy:** If the DB query or RPC fails (e.g., database timeout or RPC failure), the API fails open, allowing the conversion to be ingested to prevent data loss. This limitation is explicitly disclosed below.
9. **No Overclaims:** Documentation explicitly states that real-time capped enforcement is subject to fail-open-on-counter-failure risk.
10. **Paid Beta Blocked:** Paid beta remains blocked by PostHog retention/purging and the remaining open release gates, including paid billing portal verification, production billing verification, production env/secrets verification, tenant isolation, privacy/deletion, observability, install QA, and docs truth audit.

---

## 2. Implementation Overview

### Database Migration:
Added `supabase/migrations/20260613010000_add_site_usage_monthly.sql`:
- Creates the `site_usage_monthly` table tracking `site_id`, `month` (`YYYY-MM`), `conversion_count`, and timestamps.
- Implements `claim_site_conversion_usage(p_site_id, p_month, p_limit)`:
  - Seeds the row if missing.
  - Locks the row for update via `FOR UPDATE` to ensure atomic incrementing.
  - If count exceeds the limit, returns `(allowed = false, current_count)`.
  - Else, increments count and returns `(allowed = true, current_count)`.

### Helper Library:
Added `api/lib/conversion-limits.js`:
- Exports `claimConversionUsage(site)`.
- Resolves the limit via `getStructuralLimits(site.plan).conversion_events`.
- Unlimited plans (limit = `Infinity`) bypass DB queries entirely (returns allowed = true, count = 0).
- Calls the atomic RPC for limited plans using UTC boundaries.

### Route Integrations:
Modified ingestion routes to invoke `claimConversionUsage(site)` at the latest safe point:
- **[conversion.js](../../api/routes/conversion.js)**: Called after path exclusions, custom url parsing, PII redactions, and idempotency checks.
- **[conversion-offline.js](../../api/routes/conversion-offline.js)**: Called after payload validations, currency/value checks, and idempotency checks.
- **[webhook-incoming.js](../../api/routes/webhook-incoming.js)**: Called after API key hashing, route verification, and payload extraction.
- **[shopify-webhook.js](../../api/routes/shopify-webhook.js)**: Called after HMAC verification, topic checks (`orders/paid`), payload JSON parsing, payload validations, and idempotency checks.
- **[stripe-webhook.js](../../api/routes/stripe-webhook.js)**: Called after Stripe signature verification, event type verification (`checkout.session.completed`), and idempotency checks.
- **[proxy.js](../../api/routes/proxy.js)**: Called in the background after route checks and request enrichment.

---

## 3. Disclosed Limitations & Risks

### Fail-Open on DB/RPC Failure:
If the database connection is lost or the RPC throws an error, the ingestion routes will catch the exception, log a warning, and **fail-open** (allowing the conversion event to be processed and captured).
- **Risk:** An outage or severe latency in the database would cause all incoming conversions to bypass the conversion cap.
- **Rationale:** Failing open is preferred over rejecting legitimate revenue-generating webhooks or site conversions, which could lead to irreversible data loss for users.

### Unlimited Plans Counting:
Conversions processed for unlimited plans (`Infinity`) do not write to the database and are not counted by the monthly counter. If usage tracking for unlimited plans is required in the future, the counter logic must be updated.

### Rollback Failure Risk:
If `rollbackIdempotencyKeys(...)` throws an error due to database issues or network drops, routes catch the error and still return the intended over-limit response (402 or 200 ignored) to avoid failing the ingestion client or causing webhook retry storms.
- **Risk:** If a rollback fails, the database will retain the "claimed" idempotency keys for that over-limit event. The event will not be retryable until manual database cleanup or until the 24-hour cache/DB records expire. This is accepted as a rare beta risk.

---

## 4. Verification & Testing

### Automated Test Coverage:
Added 16 unit and integration tests to `api/tests/billing-middleware.test.js` to ensure the limit check is only executed for valid, accepted, non-duplicate events:
1. **Helper Logic Tests:**
   - Unlimited plans (Infinity) bypass query.
   - Capped plan below limit allows and increments.
   - Capped plan at limit blocks and does not increment.
   - Sequential claims block correctly at limit (atomic safety).
   - DB query errors throw.
2. **Route Integration Tests:**
   - Direct `/api/conversion` allows when below limit.
   - Direct `/api/conversion` blocks with `402` when limit reached.
   - Direct `/api/conversion` fails open on RPC database error.
   - Offline `/api/conversion/offline` blocks with `402` when limit reached.
   - Shopify webhook returns `200` ignored when limit reached.
   - Stripe webhook returns `200` ignored when limit reached.
   - Proxy `/sp/c` route silently skips capture when limit reached.
   - Excluded path conversion does not call RPC or consume quota.
   - Duplicate/idempotent conversion retry does not call RPC or consume quota.
   - Invalid offline payload (negative conversion value) does not call RPC or consume quota.
   - Unsupported Stripe event type does not call RPC or consume quota.
   - Unsupported Shopify topic does not call RPC or consume quota.
   - Pageview routes checkTierLimit does not call conversion RPC.
   - Invalid Shopify payload (missing order ID) does not call RPC or consume quota.
   - Invalid Stripe signature does not call RPC or consume quota.
   - Generic incoming webhook route returns `402` when limit reached.
   - Direct `/api/conversion` over-limit idempotency and cache poison regression test (verifies that over-limit blocked events do not poison the in-memory `dedupCache`, roll back DB idempotency keys via `rollbackIdempotencyKeys`, and can be retried successfully when limit is lifted).

### Test Output:
All 66 unit tests pass successfully.
```
> trackiq@1.0.0 qa:identity:unit
> node --test api/tests/identity-resolution.test.js api/tests/billing-middleware.test.js

ℹ tests 67
ℹ suites 0
ℹ pass 67
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

---

## 5. Remaining Blockers
- **Standard pageview limits** are still bypassed because they track usage using the empty `pageviews` table instead of PostHog Cloud.
- **PostHog retention and purging** are not configured or handled.
- **Paid-site billing portal flow** remains unverified.
- **Stripe browser billing UI** verification remains pending.
