# Next Session — Status as of 2026-07-27, head `735a3ae65806b34661a04f4909bc6110591fe0ae`

## What shipped this session (10 PRs, all merged)

| PR | What | CI |
|---|---|---|
| #442 | Realtime Visitors panel moved above Top Sources | --admin |
| #443 | Revenue per Visitor KPI tile | --admin |
| #444 | health-agent Slack error handling + stale admin statuses corrected | ✅ Real CI |
| #445 | FEATURE_MAP stale template claims corrected | ✅ Real CI |
| #446 | Custom Goals section in Analytics page | ✅ Real CI |
| #448 | Billing: getSiteByCustomerId silently discarded Supabase error | ✅ Real CI |
| #449 | Honest skips for 5 live-integration test suites + qa:all | ✅ Real CI |
| #450 | Widen test-registration-guard to adapter tests + register idempotency.test.js | ✅ Real CI |
| #452 | schema-drift: skip 5 unused containers (52s/run saved) | ✅ Real CI |
| #453 | Settings page split into 4 tabs (General/Tracking/Attribution & Privacy/Advanced) | ✅ Real CI |

> CI column verified per-PR against the Actions API by head SHA (conclusion + executed step
> count), not from memory. #442 and #443 are the only two that merged without a real run:
> both show `conclusion=failure, steps=0` — the quota signature, no step ever executed.
> The other eight each have a genuine run with **18 executed steps**.
> **#445 got real CI** (run 30267219696, `pull_request`, 12:45:12→12:48:03Z, 18 steps,
> success) — it was drafted as `--admin` before the quota reset but did not need it.
> "Deployed" is NOT asserted here: merge state is verifiable from the API, Railway deploy
> state is not, and no agent confirmed it.

## CI status — RESTORED
GitHub Actions spending limit raised to $20/month. CI is fully
operational. All future PRs should get real CI greens — no more
--admin merges except genuine emergencies.

## Key findings this session

### Billing getSiteByCustomerId (FIXED — #448)
getSiteByCustomerId at billing.js:98-105 was destructuring only
{ data } from supabase-js, discarding the error field. A real DB
failure (PostgREST 5xx, connection loss, RLS denial) returned
{data: null, error} — indistinguishable from absent site. The
invoice.payment_succeeded handler then logged UNRESOLVED → 200
→ Stripe stops retrying → customer paid but site stayed
plan: 'inactive'. Fixed: const { data, error } = ...; if (error)
throw error. Test 5a pins error → 500; test 5 (no-site → 200)
unchanged.

### Test coverage recovered (FIXED — #449, #450)
- 5 live-integration test suites were silently scoring PASSED
  while asserting nothing (dotenv loading triggered real network
  calls, guard fired, suite exited without running). Now honest
  t.skip with explicit SOURCETRACK_API_URL requirement.
- idempotency.test.js (7 assertions) was on disk, named by no
  script, running nowhere. Now registered in qa:tinybird:unit
  (559 → 566 assertions).
- qa:all script added: node --test api/tests/*.test.js
  tinybird/adapter/__tests__/*.test.js — 1909 tests, ~23s local.

### CI cost reductions (FIXED — #452)
schema-drift.yml now runs supabase start -x
studio,realtime,imgproxy,edge-runtime,vector. Measured on real
GitHub runners: 139s → 90s (−49s), 4 billed min → 3 billed min
per schema-drift run. Validated both arms pass.

### CI further optimization — BACKLOG (do not skip)
Two items measured but not yet shipped:
A. Collapse 4 qa:* into single node --test invocation via qa:all.
   Saves ~30% CI time. The isolation bug (timezone-reconciliation
   test loading dotenv and making live calls) is now FIXED (#449).
   Next step: update ci.yml to use qa:all instead of 4 sequential
   invocations. Measure actual CI time change before claiming 30%.
   One PR: .github/workflows/ci.yml only.
B. supabase start -x is ALREADY SHIPPED (#452). Done.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PRIORITIZED BACKLOG FOR NEXT SESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### P0 — Must do before launch

1. **Collapse qa:* into qa:all in ci.yml**
   - ci.yml currently runs 4 sequential node --test invocations
   - qa:all exists (#449), isolation bug fixed (#449)
   - Change ci.yml to: npm run qa:all
   - Measure actual CI time on a real green run before claiming
     the 30% saving
   - One PR: .github/workflows/ci.yml only

2. **Conversion Funnels backend fix**
   - api/routes/analytics.js:1032 has a funnels endpoint that
     reads from the `pageviews` Supabase table (0 rows in prod)
   - Must be repointed to Tinybird events table before UI is built
   - Own session — do not combine with UI work
   - Verify returns real data on techrupt.pk before building UI

3. **tracker/analytics.js dead code decision**
   - Unbuilt file, no .min.js artifact, no verified consumer
   - KNOWN_ISSUES: determine if any live site loads it
   - If none: DELETE it and confirm legacy /api/analytics/collect
     route's remaining consumers before touching that
   - If consumer found: fix via keepalive transport

4. **Tinybird migration — overarching priority (paused)**
   - 49+ uncommitted .pipe files still in working tree on
     migration branch (claude/tinybird-phase1-events-schema)
   - XFF cherry-pick working-directory state unresolved
   - Phase 7/9/10 incomplete
   - Commit checkpoint urgently needed before anything else
     on the migration branch

### P1 — Next milestone

5. **Saved Segments**
   - localStorage persistence, same pattern as #435 (time range)
   - No backend needed for V1

6. **Scroll tracking**
   - Tracker has no scroll event
   - DataFast uses data attributes pattern
   - Needs tracker.js change — own session

7. **Goals test coverage (issue #447)**
   - No unit test for /api/analytics/goals route
   - Uses _queryTinybirdPipe seam, testable like
     live-visitors-degraded.test.js
   - Should cover: refund exclusion, null-read throw,
     client-side rate calculation

8. **Admin drift comparison index bug**
   - admin.js arrays don't align (17 probe entries, 18
     prevFeatures)
   - 11/17 features report wrong previous status
   - Fix: key by name not index
   - One PR, admin.js only

9. **Supabase direct-write grep**
   - KNOWN from prior session: grep dashboard/src for any
     remaining direct supabase.from(...).update( calls on
     pages OTHER than Settings.jsx
   - Pattern confirmed dangerous (#410, #411)
   - Must close before launch

### P2 — Pre-cutover / Tinybird migration

10. **Tinybird token rotation** (4 tokens exposed in chat)
    - st_endpoint_read
    - dual_write_append
    - Tinybird workspace admin token
    - Tinybird MCP connector token

11. **flexible_report:2457 parity diff** (BLOCKED — founder
    investigation)

12. **Merged-identity coverage** (visitor_id ≠ distinct_id,
    no fixture)

13. **Phase 9 harness** — 5 models still need completion

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Carry-forward from previous sessions (still open)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- `date` for pre-agg — STILL NO BACKEND (first/last-touch ×
  date needs 2 new params; multi-touch × date is structural,
  needs write-path schema change)
- tz-aware date bucketing — DEFERRED 3 TIMES
- MRR-by-source + trial→paid — NOT BUILT
- tracker/analytics.js dead-code decision (above)
- domain verification question (can someone claim a domain they
  don't own?) — orthogonal, not urgent
