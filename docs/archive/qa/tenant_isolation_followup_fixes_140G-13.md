# Tenant Isolation Follow-up Fixes Report (Session 140G-13)

This report documents the security fixes and unit tests implemented to resolve three tenant-isolation risks identified in the Session 140G-12 audit.

---

## Files Audited & Changed

### Exact Files Audited
* [api/routes/ai-chat.js](../../api/routes/ai-chat.js)
* [api/routes/journey.js](../../api/routes/journey.js)
* [api/routes/job-status.js](../../api/routes/job-status.js)
* [api/middleware/user-auth.js](../../api/middleware/user-auth.js)
* [api/index.js](../../api/index.js)
* [package.json](../../package.json)

### Exact Files Changed
* [api/routes/ai-chat.js](../../api/routes/ai-chat.js) — Hardened HogQL query validator.
* [api/routes/journey.js](../../api/routes/journey.js) — Disabled external PostHog Persons API query; built local site-scoped person context.
* [api/routes/job-status.js](../../api/routes/job-status.js) — Gated endpoint to super-admin role.
* [package.json](../../package.json) — Added the new test script.
* [api/tests/ai-chat.test.js](../../api/tests/ai-chat.test.js) (NEW) — Unit test suite for HogQL validator.

---

## Technical Details of Fixes

### Fix 1 — AI Chat HogQL Isolation

* **Risky Before:** The query validator only verified that the HogQL string contained `FROM events` and `properties.site_id` somewhere in the text. This was vulnerable to SQL syntax chaining and prompt injection (e.g. using `OR`, `UNION`, `WITH`, or subqueries) which could bypass the filter and retrieve event records of other tenants in the shared PostHog project.
* **Why the New Fix is Safer:** The query validator now strictly enforces that the HogQL string:
  1. Is a single, read-only query starting with `SELECT`.
  2. Queries only `FROM events` (exactly one FROM clause allowed).
  3. Rejects all comments (`--`, `/*`, `*/`) and multiple statements (chained by semicolons `;`).
  4. Rejects destructive or boundary-traversing keywords (`UNION`, `JOIN`, `WITH`, `INSERT`, `UPDATE`, `DELETE`, etc.).
  5. Rejects any `OR` keyword in the entire query.
  6. Enforces that all occurrences of `properties.site_id` correspond exactly to a strict equality comparison (`=`) against the user's active site ID, preventing inequality operators (`!=`, `<>`), pattern matches (`LIKE`), or set matching (`IN`).
  7. Fails closed on any invalid formats.

#### AI Chat Query Examples
* **Rejected Queries:**
  ```sql
  -- Chained statement
  SELECT * FROM events WHERE properties.site_id = 'correct'; SELECT * FROM events

  -- Alternative matching (IN)
  SELECT * FROM events WHERE properties.site_id IN ('correct','other')

  -- Union retrieval
  SELECT * FROM events WHERE properties.site_id = 'correct' UNION SELECT * FROM events

  -- OR bypass
  SELECT * FROM events WHERE properties.site_id = 'correct' OR properties.site_id = 'other'
  ```
* **Valid Queries:**
  ```sql
  SELECT event, count() FROM events WHERE properties.site_id = 'correct' AND timestamp >= now() - INTERVAL 7 DAY GROUP BY event LIMIT 10
  ```

---

### Fix 2 — Journey PostHog Person Scoping

* **Risky Before:** The journey route resolved the visitor profile by issuing a request to `/api/projects/{projectId}/persons/{visitorId}/` using a shared PostHog personal API key. Because the PostHog project is shared, brute-forcing a `visitorId` belonging to another tenant would return that visitor's email, name, and custom profile properties.
* **Why the New Fix is Safer:** The external PostHog Persons API fetch has been completely removed from [journey.js](../../api/routes/journey.js). The response shape is preserved by building a minimal, local `person` object derived strictly from local events already scoped to `req.site.id` (mapping the `visitorId` and the event-derived `userId` only).

---

### Fix 3 — Job Status Endpoint Gating

* **Risky Before:** `/api/jobs/attribution/status` only required `requireUserAuth`, permitting any logged-in tenant customer to view global nightly attribution task runs, runtimes, and status logs.
* **Why the New Fix is Safer:** The endpoint now applies `requireRole('super_admin')` in addition to `requireUserAuth`. Any standard tenant customer trying to access the endpoint will receive a `403 Forbidden` response.

---

## Test & Validation Execution

### Tests Added / Updated
* Created [api/tests/ai-chat.test.js](../../api/tests/ai-chat.test.js) with 17 test scenarios verifying correct validation of compliant queries, rejection of comments, semicolon chaining, multiple tables, OR injection, UNIONs, WITH subqueries, inequality checks, and set/list matches.
* Added `api/tests/ai-chat.test.js` to the `qa:tracker:unit` script in `package.json`.

### Validation Output
```bash
npm run qa:tracker:unit
# Output:
# ▶ AI Chat HogQL Validation Tenant Isolation Tests
#   ✔ Valid test case with correct site ID equality (0.910291ms)
#   ...
#   ✔ Bypass test case: Multiple properties.site_id with one invalid (0.073917ms)
# ✔ AI Chat HogQL Validation Tenant Isolation Tests (155.897ms)
# ...
# ℹ tests 69
# ℹ pass 69
# ℹ fail 0
# ℹ duration_ms 276.50975
```

All 98 identity/billing unit tests (`npm run qa:identity:unit`) and static checks (`npm run qa:static`) pass cleanly.

---

## Safety Grep Output Summary

A grep scanning for hardcoded local paths, JWTs, and credentials returned only pre-existing mock examples (like `sk_live_abc123` in documentation components) and code validation prefixes (`whsec_` checks in integration setups). No real credentials or sensitive secrets are stored in the codebase.

---

## Remaining Paid-Beta Blockers

The three tenant-isolation risks have been resolved. The remaining open gating release items from `docs/release_checklist_gate.md` include:
* Stripe test-mode E2E browser billing portal flow verification.
* Production environment variables configuration (e.g. `ST_IP_RESOLVER_MODE=railway`).
* Production Supabase Auth URLs and SMTP validation.
* Exception/Sentry monitoring E2E tests.
* Production deploy smoke verification.
