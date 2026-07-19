# QA Report: Pageview Limit Enforcement (Session 140G-4)

- **Date:** 2026-06-13
- **Branch:** `main`
- **Session:** 140G-4
- **Status:** **PASS (Not Committed)**

---

## 1. Goal & Requirements
Audit and implement real-time monthly pageview limit enforcement at all backend ingestion points using a single atomic PostgreSQL RPC to avoid race conditions.

### Constraints Met:
1. **No Commit/Push:** Changes kept strictly in the local workspace for review.
2. **Late-Gated Enforcement Check:** Moves the monthly pageview limit checks (`claimPageviewUsage`) to the latest safe point—immediately before `ph.capture(...)` / pageview event capture.
   - Checked after bot filtering, path exclusions, custom url parsing, and basic validation.
   - Prevents invalid/unsupported/bot events from consuming the pageview quota.
3. **No Supabase `pageviews` Table Queries for Ingestion:** Ingestion does not query the heavy `pageviews` table. Instead, a dedicated real-time counter column `pageview_count` on the `site_usage_monthly` table is used.
4. **No Check-Then-Increment Race:** Enforces caps atomically using the `claim_site_pageview_usage(p_site_id, p_month, p_limit)` RPC function with row-level locking (`FOR UPDATE`).
5. **Endpoint Behavior on Limit Reached:**
   - **Direct/browser routes** (`POST /api/track`, `/api/collect`, `/track`) return `402 Payment Required` with JSON error payload `{ success: false, data: { received: false, limit_reached: true }, error: 'Monthly pageview limit reached' }`.
   - **Legacy collect route** (`POST /api/analytics/collect`) returns `402 Payment Required` with JSON error payload `{ ok: false, error: 'Monthly pageview limit reached' }`.
   - **Proxy routes** (`POST /sp/e` and `GET /sp/pixel.gif`) skip PostHog capture silently in the background.
6. **Time Boundary Fix:** Uses UTC calendar month boundaries (`getUTCFullYear()` and `getUTCMonth() + 1`) to ensure billing month resets do not depend on the server/Railway timezone.
7. **Database Security Hardening:**
   - Prevents public execution by revoking execute privileges from `PUBLIC`, `anon`, and `authenticated` roles.
   - Restricts execution exclusively to `service_role`.
   - Lacks `SECURITY DEFINER` completely. Since the backend services connect using the `service_role` key, the function runs with service_role native privileges (which naturally bypasses RLS on `site_usage_monthly`). Removing `SECURITY DEFINER` minimizes security surface area.
   - Explicitly locks down the search path with `SET search_path = public, pg_temp` to prevent search path injection attacks.
8. **Fail-Open Policy:** If the DB query or RPC fails (e.g., database timeout or RPC failure), the API fails open, allowing the pageview to be ingested to prevent data loss. This limitation is explicitly disclosed below.
9. **No Overclaims:** Documentation explicitly states that real-time capped enforcement is subject to fail-open-on-counter-failure risk.
10. **Paid Beta Blocked:** Paid beta remains blocked by PostHog retention/purging and the remaining open release gates, including paid billing portal verification, production billing verification, production env/secrets verification, tenant isolation, privacy/deletion, observability, install QA, and docs truth audit.

---

## 2. Implementation Overview

### Database Migration:
Added `supabase/migrations/20260613020000_add_pageview_count_to_usage.sql`:
- Extends the `site_usage_monthly` table by adding a `pageview_count` integer column.
- Implements `claim_site_pageview_usage(p_site_id, p_month, p_limit)`:
  - Seeds the row if missing (shares the same month row as conversion limits).
  - Locks the row for update via `FOR UPDATE` to ensure atomic incrementing.
  - If count exceeds the limit, returns `(allowed = false, current_count)`.
  - Else, increments count and returns `(allowed = true, current_count)`.

### Helper Library:
Added `api/lib/pageview-limits.js`:
- Exports `claimPageviewUsage(site)`.
- Resolves the limit via `getPvLimit(site.plan, site.pv_limit)`.
- Inactive or archived plans (limit = 0) bypass DB queries entirely and return allowed = false.
- Unlimited plans (limit = `Infinity`) bypass DB queries entirely (returns allowed = true, count = 0).
- Calls the atomic RPC for limited plans using UTC boundaries.

### Route Integrations:
Modified ingestion routes to invoke `claimPageviewUsage(site)` at the latest safe point:
- **[track.js](../../api/routes/track.js)**: Called after bot filtering and path exclusions, and only for true `$pageview` events. Custom events are excluded.
- **[analytics.js](../../api/routes/analytics.js)**: Called before inserting to the Supabase `pageviews` table, and only for true pageviews (not custom/outbound).
- **[proxy.js](../../api/routes/proxy.js)**: `/sp/e` (when event is `$pageview`) and `/sp/pixel.gif` are protected by pageview limits before async PostHog capture.
- **[index.js](../../api/index.js)**: Removed `checkTierLimit` from `/api/conversion` (conversion routes have their own caps and should not consume pageview quota).

---

## 3. Disclosed Limitations & Risks

### Fail-Open on DB/RPC Failure:
If the database connection is lost or the RPC throws an error, the ingestion routes will catch the exception, log a warning, and **fail-open** (allowing the pageview event to be captured).
- **Risk:** An outage or severe latency in the database would cause all incoming pageviews to bypass the pageview cap.
- **Rationale:** Failing open is preferred over rejecting legitimate client traffic, which would break customer websites or lead to irreversible data loss.

### Unlimited Plans Counting:
Pageviews processed for unlimited plans (`Infinity`) do not write to the database and are not counted by the monthly counter. If usage tracking for unlimited plans is required in the future, the counter logic must be updated.

---

## 4. Verification & Testing

### Automated Test Coverage:
Added comprehensive tests to `api/tests/billing-middleware.test.js` covering both helper functions and route integrations:
1. **Helper Logic Tests:**
   - Free plan below limit: allowed true, counter increments.
   - Free plan at limit: allowed false, does not increment.
   - Per-site `pv_limit` override is used over plan default.
   - Sequential claims block correctly at limit (atomic safety).
   - Inactive/archived plan (pv_limit=0) blocked without RPC call.
   - UTC month format is `YYYY-MM`.
   - RPC/DB error throws.
2. **Route Integration Tests:**
   - `$pageview` below limit: captured and quota claimed.
   - `$pageview` at limit: `402` returned, `ph.capture` NOT called.
   - Custom event (not `$pageview`): does not call RPC, capture proceeds.
   - Bot UA: filtered before quota claim, no capture.
   - Excluded path: filtered before quota claim, no capture.
   - RPC failure on `$pageview`: fail-open (capture still proceeds).

### Test Output:
All 80 unit and integration tests in `billing-middleware.test.js` pass successfully.

```
▶ claimPageviewUsage — pageview limit enforcement helper (140G-4)
  ✔ free plan below limit: allowed true, counter increments (0.186625ms)
  ✔ free plan at limit: allowed false, does not increment (0.103875ms)
  ✔ per-site pv_limit override is used over plan default (0.071042ms)
  ✔ sequential claims reach then block at limit (0.108417ms)
  ✔ inactive plan (pv_limit=0): blocked without RPC call (0.068916ms)
  ✔ archived plan (pv_limit=0): blocked without RPC call (0.059333ms)
  ✔ site_id scoping: different site_ids use independent counters (0.09575ms)
  ✔ UTC month format is YYYY-MM (0.078792ms)
  ✔ RPC/DB error throws (caller is responsible for fail-open) (0.125917ms)
  ✔ missing site.id throws immediately (0.093167ms)
✔ claimPageviewUsage — pageview limit enforcement helper (140G-4) (1.566958ms)
▶ track.js handler — pageview quota integration (140G-4)
  ✔ $pageview below limit: captured and quota claimed (0.742917ms)
  ✔ $pageview at limit: 402 returned, ph.capture NOT called (0.296792ms)
  ✔ custom event (not $pageview): does not call RPC, capture proceeds (0.157041ms)
  ✔ bot UA: filtered before quota claim, no capture (0.07475ms)
  ✔ excluded path: filtered before quota claim, no capture (0.071458ms)
  ✔ RPC failure on $pageview: fail-open (capture still proceeds) (0.242333ms)
✔ track.js handler — pageview quota integration (140G-4) (2.82325ms)
```

---

## 5. Remaining Blockers
- **PostHog retention/purging** remains unresolved.
- **Remaining open release gates:** paid billing portal verification, production billing verification, production env/secrets verification, tenant isolation, privacy/deletion, observability, install QA, and docs truth audit.
