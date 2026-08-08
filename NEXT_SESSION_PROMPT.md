# Next Session — Status as of 2026-08-08, head `0290b51677ef3494b5e23fa596615898543ae535`

## §0.5 Session Handoff — Shipped this session

### What Shipped
1. **Real 8-screen Interactive Demo Workspace**:
   * Consolidated prototype files into a single SSR-safe React module: [`RealDemoApp.jsx`](file:///Users/ubaid/Desktop/trackiq/marketing/src/components/v3/demo/RealDemoApp.jsx).
   * Resolved redeclaration collisions for global symbols (`PATHS`, `NAV`, `TITLES`, `D`, `money`, `num`, `pct`).
   * Bundled and imported scoped stylesheets (`demo-avatars.css`, `demo-workspace.css`, `demo-figma.css`, `demo-dashboard.css`) directly into the React tree, resolving broken layouts.
   * Mounted `<RealDemoApp client:visible start="dashboard" full={false} />` on the landing page in [`index.astro`](file:///Users/ubaid/Desktop/trackiq/marketing/src/pages/index.astro).
   * Rebuilt [`demo.astro`](file:///Users/ubaid/Desktop/trackiq/marketing/src/pages/demo.astro) as a clean, full-bleed standalone layout rendering `<RealDemoApp client:load start="dashboard" full={true} />`.
2. **Spend Calculator ("Smarter allocation")**:
   * Previously merged layout CSS verified live on production.

### Verification Results
* **Production Build**: Clean pass, compiling all 55 static pages: `ASTRO_TELEMETRY_DISABLED=1 npm run build` (Completed in 22.89s).
* **Test Suite**: `pass 36 / fail 0` — 100% of marketing and copywriting checks passed.
* **Local Visual Audit**: Visual flow tested via browser automation, verifying routing tabs, active models, lead timelines, integration toggles, and journey slide-overs work cleanly.
* **Committed and Pushed**: Pushed directly to `main` at `0290b516`.

---

## What shipped prior (10 PRs, all merged)

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

### CI collapse — INVESTIGATED, MEASURED, REFUTED (#455, closed unmerged)
The "collapse 4 qa:* invocations into one qa:all, saves ~30% CI
time" idea was built and measured on real CI. It saves nothing.
DO NOT re-attempt it.

  Before (4 steps, 5 green runs on main):
    unit-test steps  118, 120, 120, 121, 122s  -> mean ~120s
    job total        166-173s
  After (1 x qa:all, run 30291793144, green):
    unit-test step   121s
    job total        174s

121s sits INSIDE the 118-122s baseline band. Not a saving; the job
total landed at the top of its band. The ~30% figure came from a
laptop (31s -> 22s) and did not survive a GitHub runner.

Why it was never going to work: `node --test` already spawns a
child process PER FILE, so collapsing four invocations saves only
~4 node/npm startups — a second or two, not a fraction of 120s.
The local gain came from pooling ~186 files into one concurrency
pool on a many-core machine; a 2-core runner has no such headroom.
(Mechanism is a hypothesis; the 121s is measured.)

It also had a real cost: one step instead of four removes per-suite
failure locality in the CI UI.

qa:all itself STAYS in package.json (#449) — it is a useful local
one-shot, just not a CI win.

### CI cost reduction — supabase start -x (SHIPPED #452). Done.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PRIORITIZED BACKLOG FOR NEXT SESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### P0 — Must do before launch

> The former P0 #1 ("Collapse qa:* into qa:all in ci.yml") is GONE from this
> list on purpose — it was done, measured, and refuted. See "CI collapse —
> investigated and refuted" under Key findings. Do not re-open it as a P0.

1. **Conversion Funnels backend fix**
   - api/routes/analytics.js:1032 has a funnels endpoint that
     reads from the `pageviews` Supabase table (0 rows in prod)
   - Must be repointed to Tinybird events table before UI is built
   - Own session — do not combine with UI work
   - Verify returns real data on techrupt.pk before building UI

2. **tracker/analytics.js dead code decision**
   - Unbuilt file, no .min.js artifact, no verified consumer
   - KNOWN_ISSUES: determine if any live site loads it
   - If none: DELETE it and confirm legacy /api/analytics/collect
     route's remaining consumers before touching that
   - If consumer found: fix via keepalive transport

3. **Tinybird migration — overarching priority (paused)**
   - 49+ uncommitted .pipe files still in working tree on
     migration branch (claude/tinybird-phase1-events-schema)
   - XFF cherry-pick working-directory state unresolved
   - Phase 7/9/10 incomplete
   - Commit checkpoint urgently needed before anything else
     on the migration branch

### P1 — Next milestone

4. **Saved Segments**
   - localStorage persistence, same pattern as #435 (time range)
   - No backend needed for V1

5. **Scroll tracking**
   - Tracker has no scroll event
   - DataFast uses data attributes pattern
   - Needs tracker.js change — own session

6. **Goals test coverage (issue #447)**
   - No unit test for /api/analytics/goals route
   - Uses _queryTinybirdPipe seam, testable like
     live-visitors-degraded.test.js
   - Should cover: refund exclusion, null-read throw,
     client-side rate calculation

7. **Admin drift comparison index bug**
   - admin.js arrays don't align (17 probe entries, 18
     prevFeatures)
   - 11/17 features report wrong previous status
   - Fix: key by name not index
   - One PR, admin.js only

8. **Supabase direct-write grep**
   - KNOWN from prior session: grep dashboard/src for any
     remaining direct supabase.from(...).update( calls on
     pages OTHER than Settings.jsx
   - Pattern confirmed dangerous (#410, #411)
   - Must close before launch

### P2 — Pre-cutover / Tinybird migration

9. **Tinybird token rotation** (4 tokens exposed in chat)
    - st_endpoint_read
    - dual_write_append
    - Tinybird workspace admin token
    - Tinybird MCP connector token

10. **flexible_report:2457 parity diff** (BLOCKED — founder
    investigation)

11. **Merged-identity coverage** (visitor_id ≠ distinct_id,
    no fixture)

12. **Phase 9 harness** — 5 models still need completion

13. **IF CI time ever becomes a real priority: profile inside the
    two slow suites** (backlog, NOT urgent — nothing depends on it)
    - The only useful thing to come out of the refuted #455: the
      unit steps are ~120s of a ~168s job, and two suites dominate:
        Tracker              44s
        Tinybird dual-write  43s
        Identity             30s
        Attribution           3s
    - So the target is what is SLOW INSIDE Tracker and Tinybird —
      not how many times node --test is invoked. That question is
      settled and measured (see Key findings); do not re-litigate
      invocation count.
    - Measure before and after on real CI, same as #455. A laptop
      number is not evidence.

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
