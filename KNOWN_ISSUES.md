# Known Issues

This file should stay short. Only include verified issues or high-confidence risks.

Do not use this file as a backlog for every idea. Use it to prevent repeated mistakes.

## Current verified/high-confidence issues


### 1. `schema.sql` is stale

The live database schema has been repaired through migrations, but `supabase/schema.sql` does not fully reflect the current tables/columns/policies.

Relevant files:

- `SUPABASE_SCHEMA.md`
- `supabase/migration_session_68_schema_alignment.sql`

Current rule:

- Treat migrations and live Supabase verification as source of truth.
- Do not rely on `schema.sql` alone.

### 2. Dashboard widgets policy not verified

RLS policies are verified for:

- `companies`
- `company_members`
- `sites`
- `saved_reports`
- `admin_audit_log`
- `qa_notes`

`dashboard_widgets` policy may be missing. This is not blocking until dashboard widget persistence becomes active work.

Relevant future session:

- Session 81 dashboard saved-report widgets

### 3. ~~No paid ad click-ID capture~~ — ACTUALLY WORKING

**This issue was wrong. Click IDs ARE captured end-to-end:**

- Tracker captures: `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `twclid`
- `api/routes/track.js` stores all of them on the PostHog event
- `api/lib/channel-classifier.js` uses them for channel classification:
  - `gclid/gbraid/wbraid/msclkid` → Paid Search
  - `fbclid/ttclid` → Paid Social
- `api/jobs/nightly-attribution.js` reads click IDs from touchpoints and writes them to `attributed_conversions`
- Confidence scoring adds +20 points when a click ID is present on the first/last touch

**What is still missing (truly):**
- `ad_id`, `campaign_id`, `adset_id`, `creative_id` — granular ad-level breakdown (requires ad platform API or manual UTM tagging)
- These are not captured because they require platform-specific integrations, not just URL params

### 4. No ad spend ingestion yet

Do not claim:

- ad spend import
- ROAS
- ad account reporting
- ad set reporting
- ad ID reporting
- creative reporting

unless new code proves it.

### 5. AI referrer detection can undercount

AI source detection depends on referrer. Some AI tools strip referrers.

Safe claim:

    SourceTrack detects AI referrals when the platform sends a detectable referrer.

Unsafe claim:

    SourceTrack has universal AI traffic detection.

AI-search attribution depends on a referrer being present (client `document.referrer` or server `Referer` header). If a source strips the referrer, the visit lands as "direct" and no COALESCE/detection can recover it. This is a real limit of the approach, not a bug.

Note: The server-fallback path (bare referrer -> middleware -> `properties.ai_source`) is verified by code-trace, not yet by a live referrer-only event. A referrer-only live test would close this verification gap.

### 6. HogQL gotchas

Avoid:

- `toFloat64OrZero`
- `COUNT(CASE WHEN...)`
- ambiguous `distinct_id` in joins

Prefer:

- `toFloatOrZero`
- `countIf()`
- qualified aliases

### 7. Backup files can confuse audits

Old `.bak` files may exist from prior sessions.

Before production readiness or broad audits, check:

    find api dashboard/src tracker -name "*.bak*" -print

### 8. Keyless conversions bypass deduplication

Deduplication requires an `order_id` / `external_event_id` to be present. Keyless conversions (no `order_id` supplied) are counted as-fired by design to avoid silently merging genuine distinct conversions from the same user.

### 9. Weighted integration on days_to_convert and touchpoints_per_conversion

Verified by code inspection: both the `days_to_convert` ([api/lib/attribution-engine.js:L1837-1841](file:///Users/ubaid/Desktop/trackiq/api/lib/attribution-engine.js#L1837-1841)) and `touchpoints_per_conversion` ([api/lib/attribution-engine.js:L1890-1894](file:///Users/ubaid/Desktop/trackiq/api/lib/attribution-engine.js#L1890-1894)) return paths explicitly supply a `conversions` weight field to `mergeGoogleResults`, ensuring they are weighted correctly rather than defaulting to naive equal-weighting.

### 10. AI Search timestamp resolution seam

### 11. Cross-metric timezone inconsistency in getFlexibleReport

Within `getFlexibleReport`, queries for the metrics `revenue`, `conversions`, and `leads` use the timezone-aware `getDateFilterExpr` helper. However, helper metrics like `days_to_convert`, `touchpoints_per_conversion`, and the `LTV` path query dates using raw UTC bounds. This creates a temporary inconsistency at timezone boundaries between different metrics on the same screen.
- **Follow-up Task**: `Task-0: Lock timezone ground truth for secondary metrics (LTV, days_to_convert, touchpoints), then make them timezone-aware under getDateFilterExpr.`

### 12. Untested multi-touch/flexible models ignore timezone boundaries

To avoid untested blast-radius risks, the calculations inside `getMultiTouchAttributionLive`, `getSessionReport`, and `getAiPlatformAttributionLive` have been reverted to query using UTC. Consequently, users selecting linear/u_shaped/time_decay or viewing sessions will still see timezone discrepancies (e.g. conversions showing on different days compared to the dashboard).
- **Follow-up Task**: `Task-0: Lock timezone ground truth for linear/u-shaped/time-decay and session calculations, then roll out timezone-aware query bounds (getDateFilterExpr) with targeted integration tests.`

### 13. Stale click-ID-blind channel CASE classifier in 3 pipes

Three pipes (`session_report_pageviews`, `session_report_conversions`, and `seo_revenue_landing_pages`) contain a click-ID-blind channel classifier that disagrees with `channelFromEvent` in the JS engine and other pipes. This causes live mis-classification in session reports and SEO revenue. A dedicated PR is required to copy CC's corrected SQL over to these pipes.

### 14. admin and leads_count swallow Tinybird throws

The `/admin` endpoints (containing 6 inner catches) and the `/leads/count` endpoint swallow the Tinybird read error throws. Instead of propagating the error to trigger a proper 500 error, they catch the error internally and return an HTTP 200 response with zeroed KPIs. This means `TINYBIRD_FORCE_READ=true` cannot reach the handler-level catches. The inner try-catch blocks in these handlers need to be stripped.

### 15. Scoped summary revenue regression (#278)

An invalid `attributed_conversions` SELECT query (attempting to select columns `country`, `device`, `browser`, and `landing_page` that do not exist — only `first_touch_*` equivalents exist) was rejected by PostgREST, swallowed by an internal try/catch, and rendered in the UI as "no conversions." This represents the same silent-degradation pattern as the §6 fake zeros. The conversions read logic must be modified to distinguish database query failures from true zero-row results (being resolved in PR #280).

### 16. Unit test mocks (installSupabase) swallow select query schema errors

The unit test mocks for Supabase (`installSupabase`) return predefined fixtures regardless of the `.select()` query string. Because of this, unit tests can never detect an invalid-column or invalid-select query error (such as the one shipped in #278). A static schema anti-drift verification check is required as a compensating control.

### 17. C2 Schema Convergence open decisions

The migrations for C2 schema convergence are authored but NOT applied to any database (staging first, then prod). Several critical decisions remain open:
- `sites.owner_id` default constraint is left commented out (likely a design bug rather than intended default).
- Money-rail rows (converting `revenue_ingestion_events` 3 columns and `lead_qualifications.qualified_by` from text to UUID) are excluded pending a founder per-row review.
- The migration `20260620134500_add_site_support_notes.sql` is flagged as dangling (applied to neither staging nor prod) awaiting a founder apply-or-delete decision.

### 18. Token rotation queue

**Added 2026-07-20 — `DEEPSEEK_API_KEY` (prod, urgent):** exposed in plaintext during a `railway variables` read. Nothing live consumes it — only `api/lib/ai-client.js` (behind the cut ai-chat/ai-analytics features) and `scripts/check-secret-safety.js` — but it is billable. **Revoke in the DeepSeek console, then delete the variable from every service rather than replacing it.** It is currently set on `sourcetrack-health` where nothing reads it.

> ⚠️ **CORRECTED 2026-07-21 — see KI-47 before acting on the paragraph above.** "Nothing live consumes it" is **false** at `b3cb043`: the mounted, plan-gated `GET /api/attribution/verdicts` reaches `ai-client.js` via `attribution.js:448`, and `ai-client.js:25` defaults the provider to DeepSeek. Revoking the key as instructed would **not** surface an error — the handler catches, returns `200 {success:true, data:[], error:null}`, and the feature becomes a permanent empty list indistinguishable from "no campaigns". **Read KI-47 (a)/(d)/(e) first; the revoke is still probably right, but it needs the endpoint decided first.**

> ✅ **SAFE TO EXECUTE as of `ab9fc7b` (2026-07-21).** KI-47's deterministic rebuild removed the only caller. **Verified repo-wide at this ref: `api/lib/ai-client.js` has ZERO importers in `api/`, `tinybird/`, `dashboard/src`, `scripts/`** (every remaining mention is documentation, an AI-*referrer*-detection domain list, or the secret-scanner's own key-name regex). Revoking the key and deleting the variable now changes no behaviour: no code path reads it, and the verdicts error path returns **500** rather than a silent `[]`. Proceed with the original instruction.
>
> ⚠️ **WHY IT WAS UNSAFE WHILE SAYING OTHERWISE — the transferable lesson.** The entry asserted "nothing live consumes it", and that was **true when written**: PR #184 deleted the AI chat feature, and the docs correctly recorded the removal. **`verdicts` was built LATER and silently reintroduced the same dependency.** Nothing re-checked the claim, because a removal is written once and then trusted forever.
>
> **A "removed" / "nothing uses this" claim decays the moment a later feature re-adds what was removed** — and nothing in the process notices, because the claim reads as settled history rather than as a fact with an expiry date. It had also propagated: **four separate documents carried the false claim simultaneously** — `README.md:90`, `NEXT_SESSION_PROMPT.md:247`, `POSTHOG_DECOMMISSION_SCAN.md:76`, and this entry — so a reader who cross-checked would have found three confirmations of something untrue. All four were corrected in the same PR as this note.
>
> **Practical rule:** a negative claim about code ("nothing calls X", "X was deleted", "no data goes to Y") is only valid **as of a named ref**. State the ref, and re-verify with a grep before acting on it — never inherit it. Both KI-47's egress finding and this entry's false-safety were the same failure: trusting a documented negative instead of re-running the check.


Multiple tokens are queued for rotation:
- `deploy_token` (currently referenced in a shell env var).
- Pre-existing Tinybird tokens exposed in previous logs and session transcripts.
- **Outstanding as of 2026-07-19:** `RESEND_API_KEY`, staging `SUPABASE_SERVICE_KEY`, `DEEPSEEK_API_KEY`, `ST_LOG_HASH_SECRET`, `TINYBIRD_READ_TOKEN`.

### 19. Nightly attribution: pipe-vs-HogQL parity was never empirically established (now unobtainable)

The nightly (`api/jobs/nightly-attribution.js`) writes the money rail (`attributed_conversions`). D2 moved its conversion + touchpoint reads from PostHog/HogQL onto Tinybird pipes. The B1 `--validate` byte-diff harness (`scripts` flags on the nightly, `api/tests/nightly-validate-harness.test.js`) **never compared a pipe-computed row against a HogQL-computed row for the same conversion** — and it structurally cannot:

- `$conversion` events were written **Tinybird-only** (`writeConversionDirect`, no `ph.capture` — `api/routes/stripe-webhook.js`), so they were **never dual-written**. No real conversion ever existed in both stores.
- Of 182 staging `attributed_conversions` rows, 179 were processed in the HogQL era; their source events live only in PostHog, so the pipe returns nothing for them → they land in `missing`. The 3 comparable rows were all processed post-cutover **by the pipe itself**, so their `--validate` diff is a **determinism** check (recompute-vs-stored off the same pipe), **not** parity.
- PostHog is decommissioned (D3); the corpus cannot be reconstructed. Phase 9 spec'd a Tinybird-vs-PostHog overlap reconciliation but it was never cleanly run for the money path (a non-recoverable `+339ms` PostHog ingestion timestamp shift, a prod-PostHog `403`, and a windowed-path OOM — see `tinybird/archive/GATE3_RECONCILIATION_CONTRACT.md`, `tinybird/archive/PHASE9_VALIDATION_HARNESS_SPEC.md`).

**This is a pre-existing gap D2 surfaced, not one it created.** Verified: no test or script has ever reconciled `attributed_conversions` against Stripe or any independent anchor (the first nightly validation harness in git history *is* D2 B1, #292). The pre-D2 HogQL path was itself an **unvalidated read writing the money rail**. D2 swapped one unvalidated read for another **while net-adding** assurance — B1's determinism harness and B0's fail-closed guard (#290).

What we rely on instead (and the standing gate for removing the HogQL fallback in B3):
- **Determinism** — `--validate` recompute-vs-stored across N rows (money fields exact; timestamps compared as instants).
- **Correctness-by-construction** — an adversarial fixture (deliberate same-timestamp tie + all 4 credit models + AI-influenced touch + $0 carrier) asserted against **hand-computed** expected values, never a recompute. The tie is the one divergence known to occur in production-shaped data (`realTies=1`) and the one thing `--validate` cannot test.
- **Stripe reconciliation** of real revenue — Tinybird `$conversion`s vs Stripe, the true source of truth for webhook-sourced conversions (HogQL never was). **Covers webhook-sourced revenue only** — tracker and manual conversions have no independent anchor and never did.

Status: pipe-vs-HogQL parity for the nightly write path is **UNVERIFIED and will remain so** — recorded here rather than implied by a green harness.

### 20. ~~Nightly 02:00 UTC verification pending~~ — VERIFIED 2026-07-20


**Verified 2026-07-20:** first post-B3 run fired 02:00:49 UTC, status=success, 1712ms, no error. Read path proven. **Write path still unproven** — conversions_processed: 0 on 18/19/20 July, so no attribution row has been written since B3 landed.

The nightly attribution job (`api/jobs/nightly-attribution.js`) now runs **Tinybird-sole with fail-closed reads** (B3, #308–#311, migration complete 2026-07-19). Its first live 02:00 UTC run is now verified (above). `restartPolicy: NEVER` means a failed run is a **~24h attribution gap with no retry** — a failure silently drops a day of the money rail (`attributed_conversions`) until the next night. **Detection already exists** — `health-agent.js:109` `evaluateNightlyJob` returns critical on a missing run, a non-success status, or a run older than 26h, and `nightly_job` is in `CRITICAL_CHECKS`; health-agent runs every 30 min in prod. **Remaining action is delivery, not detection:** health-agent's only output is a Slack POST gated on `SLACK_WEBHOOK_URL`, and it writes no `job_runs` row — and until 2026-07-20 that var held a truthy placeholder, so the POST hit a dead Slack path whose 404 the unchecked `fetch` swallowed (the check ran silently and unobservably). Now fixed (real webhook, HTTP 200); still give health-agent a `job_runs` row so its own execution is visible.

### 21. sourcetrack-email cron misconfigured — weekly emails have NEVER sent

The `sourcetrack-email` service is misconfigured: `buildCommand` runs the job at **build time**, and `startCommand` is null, so the deployed cron boots `bootstrap.js` and crashes. Result: **weekly emails have never been sent.** Six UI fix attempts have not persisted the config; the cause is unexplained. Needs a root-cause pass (Railway service config vs. repo; why the UI change does not stick).

**Confirmed 2026-07-20 from two independent angles that `email-reports-weekly` runs per DEPLOY, not weekly:** (1) `job_runs` on 2026-07-20 alone: 08:54, 08:58, 08:59, 09:17, 10:20, 10:21, 10:46, 10:53, 11:07, 16:34, 16:58, 17:04, 17:31, 19:35 — **~14 runs of a "weekly" job**, every one `Sent 0, skipped 4, errors 0`. (2) Railway shows the cron services **redeploy on every merge to `main`** (`5fe4412`, `65b9340`, `a749709`, `81d3ef8`, `f5fa4e0`, `b6d9543`, `dc4b89d`); a job in `buildCommand` runs once per deploy — **deploy count matches run count**.

### 22. ~~Share / public reports — REMOVE~~ — DONE (#323)

`api/routes/public-dashboard.js` + `dashboard/src/pages/ShareDashboard.jsx` + the `/share` links in `Settings.jsx` are a partially-built public-reports feature. The design doc **§23 lists Public reports as V2**, so the correct action is to **REMOVE** these, not finish them. Settings currently renders links to a **404 route** (customer-facing defect). Scope: delete the two files + the Settings `/share` links.

### 23. Report Builder — 11 metrics + 2 dimensions gated 422 (wiring, not building)

Report Builder gates **11 metrics + 2 dimensions** behind a 422 whose copy references a "completed migration." The underlying **data EXISTS** — sessions / conversion_rate / AI metrics all render on other pages — so this is **wiring the gated shapes to their existing pipes, not building new data.** Action: untrim the pickers / connect the reads to the live pipes.

### 24. Orphaned `qa-*.mjs` scripts — audit needed

`scripts/qa-setup-doctor.mjs` is **not wired into CI** and has been failing unnoticed (a stale `Dashboard.jsx`/`SetupDoctorCard` assertion — Dashboard dropped the card at some earlier point). Unknown how many other `scripts/qa-*.mjs` are similarly orphaned (authored, never invoked by any CI workflow or `package.json` script). Action: for each `scripts/qa-*.mjs`, confirm it is invoked by CI or an npm script, or retire it.


### 25. Operator console reports a deleted feature as "dormant"

**Severity:** low · **Verified:** 2026-07-20 @ post-#330 main

`api/routes/admin.js:686` runs `routeExists('ai-analytics.js')` and `:701` renders the result as
`AI Analytics — status: dormant`. The route file was **deleted in #315**, so the probe now always
returns false. Related hardcoded entries at `:644` and `:722`.

The output is technically accurate but misleading — *dormant* implies the feature could be switched
on. There is nothing to switch on.

**Fix:** delete the probe, the console row, and the two hardcoded entries. Roughly four lines.

**Why not fixed in #328:** out of scope for a docs PR. Recorded in `FEATURE_MAP §21` with receipts,
flagged rather than silently adapted.

---

### 26. Tier-3 cleanup backlog — documentation

**Severity:** cosmetic · **Verified:** 2026-07-20

Tier 1 and Tier 2 cleanup are complete (#323–#330). What follows is tidying. **Do not schedule a
session for it.** Standing rule instead: *when a PR touches one of these files, fix it in that PR.*

**Root documents untouched since May — archive candidates → `docs/archive/`:**

| File | Size | Note |
|---|---|---|
| `docs/archive/PROGRESS.md` | 163 KB | Session-by-session history from Session 1; unchecked items are stale |
| `docs/archive/DEEPSEEK.md` | 82 KB | Describes the DeepSeek health-agent LLM **deleted in #184** |
| `docs/archive/AUDIT_PROD_READINESS_V2.md` | | May point-in-time audit |
| `docs/archive/AUDIT_S97.md` | | May point-in-time audit |
| `docs/archive/COMPETITOR_PARITY.md` | | Planning doc — not proof of shipped features |
| `docs/archive/BUSINESS_DASHBOARDS_SPEC.md` | | Implementation status unverified |
| `docs/archive/ONBOARDING_FLOW_SPEC.md` | | Implementation status unverified |
| `docs/archive/FIGMA_DESIGN_SYSTEM.md` | | Generated spec |
| `docs/archive/FIGMA_TOKEN_IMPLEMENTATION_PLAN.md` | | Do not implement without a session gate |
| `docs/archive/IMPLEMENTATION_GAP_LIST.md` | | Superseded by `FEATURE_MAP §20` |

**Stale but still useful — rewrite, don't archive:** `ATTRIBUTION.md` (36 KB),
`IDENTITY_DESIGN.md` (predates Tinybird), `MANUAL_QA_BACKLOG.md`, `QA_RUNBOOK.md`.

**Append-only logs past usable size:** `SESSION_HANDOFF.md` (356 KB), `SESSION_LOG.md` (256 KB).
No agent reads either in full. Consider periodic splits (`SESSION_LOG_2026H1.md`) rather than
deletion.

**Archive, never delete.** `docs/archive/qa/` and `tinybird/archive/` are cited by live code
comments and `.pipe` descriptions — see #326. When archiving anything, grep the **bare filename**
repo-wide: citations live in code comments, test asserts, JSON prose, and other docs, in at least
three different formats.

---

### 27. Tier-3 cleanup backlog — code

**Severity:** low · **Verified:** 2026-07-20

| Item | State | Action |
|---|---|---|
| `api/lib/abuse-guards.js` | zero references | delete |
| `api/lib/rate-limit.js` `publicDashboardLimit` / `createPublicDashboardLimit` | orphaned by #323; **behaviour tests still assert on it** | delete limiter **and** the three tests together — a suite asserting on dead code will confuse a future CI failure |
| `api/lib/hogql-date.js` | PostHog-era **name**, ~8 live importers | **rename, do not delete** |
| `api/lib/url-normalization.js` vs `url-normalize.js` | possible duplicate | audit and merge |
| `supabase/migrations/20260620134500_add_site_support_notes.sql` | dangling — applied to neither DB | decide: apply or remove |
| `supabase/schema.sql` | 1 KB, stale (see issue 1) | regenerate or delete |
| `site_annotations` / `annotations` tables | routes deleted in #315, tables remain | DDL — needs explicit founder go-ahead |
| 67 test files reference `process.env.POSTHOG_*` | legitimate fail-closed scaffolding, but named after a deleted system | rename to a neutral env var |

**Script wiring:** see issue 24 — 40 `qa-*` scripts, 6 npm script names, 1 in CI. Same backlog,
not duplicated here.

---

### 28. Deferred: `DATA_CAPTURE_SPEC.md` needs a rewrite, not a patch

**Severity:** medium — actively misleads agents · **Verified:** 2026-07-20

Two defects:

1. A "PostHog properties" section describing a store decommissioned 2026-07-19.
2. Its "Not yet verified/built" list claims click IDs are unbuilt — **directly contradicting
   issue 3 above** (*"This issue was wrong. Click IDs ARE captured end-to-end"*) and
   `FEATURE_MAP §1`, which records 13 captured.

**Why deferred:** fixing it correctly requires a field-by-field audit of `tracker.js` against
`tinybird/SCOPE_v3.md §2.6`, to establish which fields are typed columns and which live in the JSON
properties bag. Rewriting it from the other two docs would launder their claims rather than verify
anything.

**Interim:** marked ⚠️ stale in `DOCS_INDEX.md` with "trust `KNOWN_ISSUES` and `FEATURE_MAP` over
it." Do not cite it as authoritative until the audit runs.

---
### 29. No working alert channel — health checks run and report nowhere

**Severity:** high · **Verified:** 2026-07-20 against production Railway config + `job_runs`

**Detection is built and correct. Delivery does not exist.**

`api/jobs/health-agent.js` runs every 30 min in production (cron `*/30 * * * *`, service
`f15924b7`). It performs four critical checks — `CRITICAL_CHECKS = {supabase, nightly_job,
conversions, tinybird_quarantine}` — including `evaluateNightlyJob` (`:109`), which returns
critical on a missing `job_runs` row, a non-success status, or a run older than 26h.

**None of it reaches anyone.** `notify()` (`:280`) begins:

```js
if (!SLACK || dx.severity === 'ok') return
```

`SLACK_WEBHOOK_URL` was **unset in production** at first — verified 2026-07-20 via
`railway variables --environment production --service f15924b7 | grep -i slack` (empty, against a
command confirmed to produce output). While unset, `notify()` took the `!SLACK` branch above and
every critical result was discarded — an honest, visible gate.

This very likely included a live one: `evaluateConversions` asks *"are `attributed_conversions`
actually landing?"* and `nightly-attribution` recorded `conversions_processed: 0` on
2026-07-18, 07-19 and 07-20.

**Then it got worse, not better.** While trying to unset the variable (the installed CLI lacks
`--unset`), `SLACK_WEBHOOK_URL` was set to the literal placeholder
`https://hooks.slack.com/services/YOUR/REAL/URL` on `sourcetrack-health` (`f15924b7`) and
`sourcetrack-dq` (`9278c467`). That value is **truthy**, so `notify()` no longer took the `!SLACK`
branch at `:283` — it POSTed every critical alert to that dead Slack path at `:289`, where the
`fetch` has no `.ok` check and no `try/catch`, so the 404 was swallowed and the run looked clean.
The honest drop-when-unset gate had become a **silent false-delivery**.

**Env fixed 2026-07-20 — code path still unguarded.** A real incoming webhook is now set and
read-back verified on all four services that carried the placeholder (health-agent,
nightly-attribution, anomaly-watcher, and data-quality-check); delivery is curl-verified (HTTP 200)
— replaced with a real URL, not re-unset. But the `fetch` at `:289` still has no `.ok` check and no
`try/catch`, and `notify()` is unwrapped, so a revoked URL, a Slack outage, or a transient throw
fails silently again — delivery holds only while that URL stays valid.

**Compounding problem — the monitors are themselves unobservable.** `job_runs` contains only
three job names (checked 2026-07-20): `email-reports-weekly` (255 runs), `nightly-attribution`
(78), `gsc-daily-sync` (23). **`health-agent` and `data-quality-check` write no `job_runs` row at
all**, so "did the monitor run?" is currently unanswerable — the same blind spot that let
`sourcetrack-email` accumulate 255 phantom successes without sending a single email (issue 21).

**Related:** `anomaly-watcher` (issue to be filed) watches `attributed_conversions` for
direct-spike, source-silent and coverage-drop, and alerts through this same unset variable. It is
also **not scheduled in production** (staging only, `0 3 * * *`). Scheduling it before the channel
works only adds a third silent watcher.

**Actions, in order:** *(Update 2026-07-20: steps 1–3 done — real webhook set and read-back verified on all four services (health-agent, nightly-attribution, anomaly-watcher, data-quality-check), delivery curl-verified HTTP 200. Steps 4–6 remain.)*

1. Create a real incoming webhook (Slack, or Discord with `/slack` appended to the URL — that
   endpoint accepts the Slack payload shape `health-agent.js:292` sends).
2. Verify it independently with `curl` before trusting it.
3. Set `SLACK_WEBHOOK_URL` on `sourcetrack-health` and `sourcetrack-dq`; re-read the variable to
   confirm it persisted (see issue 21 — Railway config changes have silently failed here before).
4. Make `health-agent` and `data-quality-check` write a `job_runs` row every run, matching the
   column shape `anomaly-watcher.js:58` `_writeJobRun` already uses.
5. Have `notify()` log a clearly-marked undeliverable-alert line to stdout when `SLACK` is unset
   and severity is not ok, so a Railway log read still surfaces it.
6. Only then schedule `anomaly-watcher` in production.

**Do not rebuild detection.** `evaluateNightlyJob` and `evaluateConversions` are correct and
already critical-tier. The gap is the channel, not the logic.

### 30. CI required-checks gate did not hold — #335 merged RED to `main` (2026-07-20)

**What happened.** #335 (`b6d9543`) was merged to `main` while `build-and-test` was **RED**:
`scripts/check-secret-safety.js` flagged an inline `SLACK_WEBHOOK_URL` secret-assignment (the banned
`NAME`-equals-value pattern) at `NEXT_SESSION_PROMPT.md:116` (fixed by #337). `main` then sat red for
~5h. Because `pull_request` CI runs on the branch-**merged-with-base** commit, a red `main`
propagates the failure into **every open PR** — it reddened #336 on an otherwise-clean diff.
Detection existed (the check ran and failed); nothing surfaced it, and the merge used
`gh pr merge --admin`, which bypasses a failing required check.

**Why the obvious fix isn't available.** Required-status-check enforcement (branch protection /
rulesets) is **not enforceable on this Free private repo**. GitHub reports: *"Your rules won't be
enforced on this private repository until you move to a GitHub Team or Enterprise organization
account."* The gate therefore cannot be made mandatory here — do not record "branch protection" as
the fix; it is unavailable.

**Mitigations in place (detection + discipline, not prevention):**
1. **Alerting — PR #338 (merged, `81d3ef8`).** A `build-and-test` step, `Alert on red main`, gated on
   `failure() && push && main`, POSTs to Slack when `main` goes red. It has an **explicit HTTP-200
   check** (`[ "$code" = "200" ] || exit 1`) and an **unset-secret guard** (`exit 1` when
   `SLACK_WEBHOOK_URL` is empty) — deliberately **not** repeating `notify()`'s unchecked-`fetch`
   defect at `health-agent.js:289` (KI-29). Proven end-to-end: run `29761252622` logged
   `slack http 200` (secret masked in the log), step success, message confirmed in-channel.
2. **Drop `--admin` from the default merge.** Merge with plain `gh pr merge <n> --squash`.
   **Discipline only — unenforced:** `--admin` remains a one-keystroke bypass for as long as
   required-check enforcement is unavailable, the same class of control that failed here.

**Durable risk.** Until the repo moves to a plan that enforces required checks, nothing *prevents* a
red merge — the safety net is the #338 alert (fast discovery) plus merge discipline (choosing not to
bypass). Treat a red `build-and-test` on `main` as a launch blocker.

### 31. GitHub-hosted runners are deprecating Node 20 (low severity)

Surfaced in run `29761252622`: `actions/checkout@v4` and `actions/setup-node@v4` emit *"Node 20 is
being deprecated. This workflow is running with Node 24 by default…"* Runners already default to
Node 24; the pinned action majors still declare a Node 20 runtime and will **hard-fail** once Node 20
support is fully removed. **Fix:** bump the action versions in `.github/workflows/ci.yml`
(`actions/checkout`, `actions/setup-node`, and any other `@v*` actions on the Node 20 runtime) to
Node-24-compatible releases. Not urgent; no functional impact today.

### 32. AI-source maps diverged across the INGEST path — KI-11's class, never covered there

Session 97-98 (KI-11) unified AI classification — but only the **read** side (`attribution-engine.js` + the nightly job import canonical `channel-classifier.js`). The **ingest** path never did, so the same "diverged AI maps" class recurred on the write side and sat uncaught. Verified against `origin/main` `65b9340`:

- **Two write-ingress originators, three divergent maps.** `ai-platform.js` (`detectAIPlatform`, on `/track` + `/conversion`) had its own `AI_HOST_MAP` (18) + a **title-cased** UTM path (`charAt(0).toUpperCase()` → only **5 of 20** UTM keys landed on the canonical label; `chatgpt`→`Chatgpt`, not `ChatGPT`). `proxy.js` (`/sp/e` custom-subdomain proxy) had a third `AI_DOMAINS` map (8 hosts). Canonical `AI_DOMAINS_MAP` (23) is a superset of both.
- **Two verbatim ingresses.** `ai-platform.js:61` (`req.body.ai_source`) and `proxy.js:116` (`properties.ai_source`) accepted arbitrary caller values unvalidated — any `site_key` holder could write an arbitrary `ai_source`. Origin of the lowercase-hostname rows (staging shows ~184k each of `chatgpt.com`/`gemini.google.com`/`perplexity.ai`, likely seed; **prod unverified** — the analytics MCP is staging-bound).
- **Two propagation sites, NOT changed here (self-correct once ingress is canonical).** `webhook.js:225` (outbound egress forwards the stored value) and `channel-classifier.js:111` (read-side `detectAiPlatformFromEvent` trusts a stored `ai_source` verbatim).
- **A bing-organic ingest defect.** `ai-platform.js` stamped `ai_source='Copilot'` on `bing.com/search` — an `ORGANIC_SEARCH_ENGINE_HOST` — inflating the AI-attribution metric with organic Bing search. Introduced in the same never-canonical commit (`a3edd0b`, 2026-05-18) as the title-casing, no rationale.

**Fixed (2026-07-21):** `channel-classifier.js` extended (9 orphan UTM keys — incl. Meta AI, which had none — folded in so a naive import drops nothing) + new `resolveAiSource(value)` (reject-unknown) and `detectAiPlatformFromReferrer(referrer)` (shared by all paths; `bing` narrowed to `/chat`-only). `ai-platform.js` and `proxy.js` import the single source and route their explicit branch through `resolveAiSource`. Parity test (`ai-source-canonical.test.js`, `qa:tracker:unit`) pins that referrer/UTM/explicit emit one canonical string per source across **both** originators — the assertion whose absence let this drift.

**History note (corrects KI-11):** `a3edd0b` added the middleware's maps + title-case path the day after the S97 commit, touching only `ai-platform.js`. The middleware and proxy were **never part of** the 97-98 unification.

**Data impact (deferred — do not act):** existing rows carry split labels (`Chatgpt`/`ChatGPT`), verbatim hostnames, and inflated `Copilot` from organic Bing. Go-forward is fixed; the read-normalization/backfill of history is a separate decision pending the AI Sources check.

### 33. `consent(false)` deleted no stored identifiers — client-side GDPR withdrawal (FIXED)

`sourcetrack.consent(false)` set `_consentGiven=false`, persisted `st_consent`, and cleared the in-memory queue — and **removed nothing**. Verified two ways on prod `techrupt.pk` (2026-07-20): after `window.sourcetrack.consent(false)` in a fresh incognito session (3 pageviews), **`st_aid` (the anonymous_id), `st_ft_src`/`st_ft_med`/`st_ft_cmp`/`st_ft_ts`, and `st_sid` all SURVIVED**; nothing was removed; only `st_consent` was added. The in-memory `AID` also survived — `getToken()` returned the erased id while withdrawn, and it resurrected into outbound events on a same-page `optIn()`. Withdrawal stopped *using* the identifier but retained it.

**Fixed (this PR):** `clearStoredIdentity()` prefix-sweeps every `st_*` key from localStorage/sessionStorage/cookies except the preserve-list `['st_consent']`, deletes the `st_aid` cookie (domain + host-only `path=/` variants), and nulls in-memory `AID`/`SID`; re-consent mints a fresh id. **Client-side only — server-side GDPR erasure is Phase 7, NOT STARTED; this is NOT full compliance.**

### 34. `ENCRYPTION_KEY` rotation silently invalidates all stored OAuth tokens

Rotating `ENCRYPTION_KEY` leaves `gsc_connections.encrypted_refresh_token` **undecryptable** — sync then fails with Node crypto's AES-GCM auth-tag error `"Unsupported state or unable to authenticate data"`, while the UI keeps showing **"Connected"** over dead ciphertext. Only a full **Disconnect → OAuth reconnect** re-encrypts with the new key; the "Sync Search Console" button **cannot** fix it (it reuses the stored token). **Confirmed** (Supabase MCP, prod): `gsc_sync_runs` 2026-07-20 19:54:20 and 19:54:24, both failed with that exact string. **Fix:** a rotation runbook listing every table holding key-encrypted material and requiring re-auth; consider a boot-time decrypt probe that flips status and surfaces "re-auth required". **DO NOT rotate `ENCRYPTION_KEY` again without an immediate GSC reconnect.**

### 35. GSC property is not validated against the site's own domain (inferred — connect route not read)

Reconnecting GSC for site `www.techrupt.pk` defaulted the property to `http://dailypctechtips.blogspot.com/` — an unrelated domain — and rendered a green **"Connected"** badge for it. Design spec §17.4 already requires step 3 "Confirm property/domain match" and step 6 "Mismatch warning/block"; neither is enforced. **Severity: NOT a cross-tenant leak** (Google requires verified ownership) — it is a **data-correctness** defect: another domain's search data flows into the landing-page-matched SEO-revenue allocation and produces plausible-but-wrong numbers with no visible signal. **Status:** observed in UI + spec gap; the connect route has **not** been read — recorded as **inferred**. **Investigation points for the fix PR:** where property selection is persisted; whether any domain comparison exists; auto-select vs user-choice; normalization for http/https, www/apex, trailing slash, `sc-domain:` properties; warn vs block.

### 36. Disconnect cascade-deletes the entire `gsc_sync_runs` audit history

`gsc_sync_runs` held **6 rows before disconnect, 1 after**. Destroyed: the 2026-07-19 malformed-key failure, the 2026-06-29 missing-key failure, the 07-18 and 06-26 successes, and both 19:54 decrypt failures. Evidence of a **three-week outage** survived only because it had been queried 20 minutes earlier. Sync-run history is an **audit record, not connection state**, and should survive disconnect.

### 37. UI rendered "Connected" over an empty `gsc_connections` table (inferred — source not traced)

Between disconnect and property selection, `gsc_connections` had **zero rows** while the page showed a green **Connected** badge plus Sync/Disconnect controls. Connected state is derived from something **other than the persisted row**. Source not traced — recorded as **inferred**.

### 38. GSC auto-disable flaw fired again, as predicted (2nd confirmed occurrence)

After the 19:54 failures, status flipped to `'error'` with `last_error_code = 'sync_failed'`. `gsc-daily-sync.js:152` selects `.eq('status','connected')`, so the next scheduled run would have found nothing and no-op'd. **One failure permanently disqualifies the connection — no retry, no operator signal.** Second confirmed occurrence; already noted in `FEATURE_MAP`.

### 39. `gsc-daily-sync` reported success on a no-op early exit

`job_runs` 2026-07-20 02:00:49 — `gsc-daily-sync`, **success, 148ms, error null**. No `gsc_sync_runs` row written; `last_synced_at` did not move. It found no eligible connection, exited in 148ms, and logged the pre-#332 hardcoded success. #332 (`deriveGscJobStatus`) now derives status honestly. **Record the ~148ms signature as a detection heuristic for no-op runs.**

### 40. `tracker.min.js` is a STRUCTURAL trap — not a historical incident

**Frame exactly this way: no drift has occurred.** Prod serves the committed `tracker/tracker.min.js` directly (`api/index.js:337` `res.sendFile`) and **nothing rebuilds it at deploy**, so a source-only tracker change is **INERT** in production unless the min is rebuilt and committed in the same PR. **No test guards min↔source sync.** As of 2026-07-20 the two were verified **IN SYNC**: rebuilding `origin/main`'s `tracker.js` with the repo's own esbuild `0.24.2` via the documented `package.json:9` `build:tracker` script produced a **byte-identical** match to the committed min — no prior tracker change shipped as a no-op; prod is **NOT** running stale logic. **Recommended fix (not built here):** a CI guard that runs `build:tracker` and fails if the committed min differs from the rebuild.

### 42. `sites.api_key` is plaintext at rest; `requireApiKey` middleware is dead code

`sites.api_key` is a **plaintext** column, DB-default-generated (`DEFAULT gen_random_uuid()`) — **prod: 4/4 sites carry a plaintext key, only 1 has `api_key_hash`** (Supabase-verified 2026-07-20). It is read by **nothing live**: `api/middleware/api-key.js` (`requireApiKey`) — which would look it up (`sites.api_key_hash`, with a **raw-plaintext fallback**) — is **defined but never imported or mounted**. So this is a latent plaintext credential on every site **plus** dead middleware. The current live key model is the separate hashed `api_keys` table (see FEATURE_MAP §1). `gdpr.js:548` already excludes `api_key`/`api_key_hash` from export. **Fix them together** (the #340 lesson — a dead reader and its data are one change, not two): drop the plaintext column + the hash-fallback branch + the dead middleware. Verify the actual prod column shape first (baseline schema vs later migrations differ).

### 43. `api_keys` has no scope model; revoke destroys audit; no generation rate-limit

`api_keys` has **no `scopes`/`permissions` column** — every issued key is all-powerful **per-site**. Today's only consumer is write-ingest (`POST /api/server/event`), but the roadmap is a **read REST API → MCP server**. With **0 keys issued in prod**, the migration cost to add scopes is **zero and will never be lower** — add a scope/permission model **before** the key authenticates anything beyond ingest (retrofitting scopes onto already-issued all-access keys is the painful path). Also: **revoke = hard `DELETE`** (no `revoked_at`/`is_active`), so `last_used_at` audit history is destroyed on revoke; and there is **no rate-limit or per-site cap** on `POST /api/integrations/api-keys` generation. (Not `KI-34` class — keys are hashed, not `ENCRYPTION_KEY`-encrypted, so rotation doesn't cascade.)

**Plan (LOCKED 2026-07-20 — build after the 02:00 verdicts, full ceremony; nothing built yet).** ONE migration file, ONE apply window (apply-then-merge, §8 — founder applies staging→prod before merging code that reads the columns): `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}'` — **fail-closed backstop** (a non-app INSERT grants nothing; the app defaults omitted scopes to `['write:events']`) — plus `ADD COLUMN IF NOT EXISTS revoked_at timestamptz` (harmless while unread). MVP scopes = exactly **`write:events`** and **`read:analytics`** (an array, not a permission system). **App-only validation** (unknown scope fails closed via the `write:events` membership check; a test MUST assert an unrecognised scope is DENIED, not ignored). Then three small PRs off the applied migration: **PR A** — scope enforcement (`server-events` requires `write:events`) + generate/list `scopes` + UI selector + tests (**this is the one that blocks the read REST API → MCP**); **PR B** — soft revoke (`DELETE` → set `revoked_at`, exclude revoked from auth); **PR C** — gen rate-limit + per-site key cap (no DDL). ⚠️ **Scope enforcement is a BREAKING CHANGE for any existing key** (a key lacking `write:events` starts getting 403) — **safe ONLY because zero keys exist in prod; not safe generically.** If any key is issued before PR A ships, a grant-migration is required first.

### 44. Stripe subscription-lifecycle handlers silently no-op on a zero-row match (money rail, P0)

**Discovered (Antigravity prod audit):** techrupt.pk's subscription `sub_1TmNs5…` was **CANCELED 2026-06-26T01:19:27Z** (36 min after creation), yet the prod `sites` row still reads `plan='growth'`, `pv_limit=150000` with both Stripe IDs set — **24 days later**. A cancellation never reached entitlements. Silent, on the money rail, indistinguishable from a healthy paid site.

**June delivery — traced, now permanently unrecoverable:** the `customer.subscription.deleted` event fired (`evt_1TmOQW…`); the webhook endpoint `we_1TmIJ2…` was created 2026-06-25T18:47:20Z — **6.5h before** the event — and was enabled; Stripe's dashboard confirms the event **was sent** to it. So **not** a registration gap. Stripe retains delivery-attempt records 15 days; the event is 25 days old — the response code is **gone**. **Do not plan any task that depends on the June delivery record.**

**The code defect (a CLASS, and it stands regardless of what reproduction shows):** four handlers in `billing.js` — `customer.subscription.updated` (:217), `.deleted` (:237), `invoice.payment_succeeded` (:262), `invoice.payment_failed` (:282) — all `.eq('stripe_customer_id', customerId)` and all destructure **only `{ error }`**, capturing no affected-row count. In PostgREST a **zero-row `UPDATE` is not an error**, so all four return 200 to Stripe, log a success line, and change nothing — they cannot distinguish "downgraded a site" from "found no site to downgrade." Same silent-success class as the 148ms GSC no-op (**KI-39**), on the money rail. **The UPDATE logic is correct; the zero-row DETECTION is missing** — different claims. (Independently code-verified 2026-07-20.)

**Asymmetry to record:** `checkout.session.completed` (:189) keys off site **metadata** and works (it *sets* `stripe_customer_id`); all four lifecycle handlers key off `stripe_customer_id`, which only exists **if checkout landed first**. Stripe does **not** guarantee event ordering — a lifecycle event arriving before/without a landed checkout matches zero rows and silently no-ops.

**Reproduction (staging, current code, full delivery records): PASS — but HAPPY PATH ONLY.** Antigravity cancelled staging `sub_1TvOPG…`; event `evt_1TvQUs…` (`customer.subscription.deleted`) fired **2026-07-20T23:21:19.545Z UTC**, delivered, the handler ran, the row mutated `plan 'growth'→'inactive'` and `pv_limit 150000→0`, HTTP 200, log `[billing] subscription cancelled — customer cus_UvEtzqotX9vISx`. ⚠️ **Timestamp trap:** Antigravity's summary reported `2026-07-21T01:21:18Z` — that is **CEST mislabelled with a `Z` suffix**; use the Railway UTC `23:21:19.545Z` (same class as `TIMESTAMP_TRAP_AUDIT.md` / PR #90). ⚠️ **CRITICAL QUALIFIER — the whole point:** `stripe_customer_id` was **already populated** on the staging row (checkout completed hours earlier), so `.eq` matched a row and the update landed. **The ZERO-ROW BRANCH — the one suspected in June — was NEVER exercised.** The correct reading is **"the handler works when the row matches," NOT "the handler is fine."** The June root cause (why the row did not match) stays **unknown and unrecoverable**.

**Fix scope (when dispatched — DO NOT build now; full ceremony, money rail):** all four handlers capture affected rows via `.select()`, treat a **zero-row match as an error worth alerting on** rather than a silent 200, and consider `stripe_subscription_id` as a **fallback lookup key**. One PR, four call sites.

**Also open (same audit):** `STRIPE_PRICE_ID_SCALE` is **absent from prod env** — the Scale tier **cannot be purchased**; and **2 of 3 prod prices** (Starter, Early-Bird-Annual) have **no `pv_limit` metadata**, masked by codebase fallbacks.

**Product decision (not a defect), flagged for later:** the handler sets `plan='inactive'`, `pv_limit=0` — tracking **stops dead** on cancellation rather than downgrading to free tier. May be deliberate.

**P0 — outranks KI-14/35/40. HELD pending the 02:00 UTC verdicts** (do not start).

---

**✅ FIXED — squash `06f1ba0` (PR #349), merged 2026-07-21.** *(VERIFIED — `git rev-parse origin/main` + `git show --stat`; the four changed files are on `main`.)*

- `.select('id')` on all four updates makes the zero-row case observable. The fallback key is `stripe_subscription_id` (`sub.id` on updated/deleted; `invoice.subscription` on succeeded/failed — valid top-level at the pinned `apiVersion: '2024-06-20'`).
- Three distinguishable outcomes: `matched` (silent) · `recovered` (durable `partial` row — the write landed but the `customer_id` linkage is broken) · hard failure (durable `failed` row, then throw → 500 → Stripe retries, since the idempotency claim commits only after the switch).
- `invoice.payment_succeeded`'s `getSiteByCustomerId → null` branch, which previously skipped with **no log at all**, is now recorded (not thrown — nothing was attempted).
- Durable sink is `job_runs` via `writeJobRun`; `site_alerts` was rejected because its SELECT policy is `site_id IN (owner's sites)`, which a NULL `site_id` satisfies for nobody — the row would have been invisible, recreating this very failure.

**⚠️ The evidence standard here DIFFERS from KI-45 — deliberately. Do not leave this open waiting for a runtime proof point.**

KI-45 could be closed on an observed prod run because its code path executes nightly regardless of customer count. **This one cannot.** The zero-row branch only fires when a Stripe lifecycle event arrives for a customer with no matching `sites` row, and at ~0 real paying customers **that may never happen in prod.** Waiting for an observation would leave a merged, tested money-rail fix open indefinitely against an event that will not come.

**Correctness therefore rests on the test suite plus a mutation check** *(VERIFIED — re-run locally against `06f1ba0` while writing this entry; both mutations applied and reverted, tree left clean)*:

| Mutation | Result |
|---|---|
| Remove zero-row detection (no `.select()`, treat "no error" as success) | **9 of 16 tests fail** |
| Remove the durable-record error guard only | **1 of 16 fails** (test 6, and only test 6) |
| Unmutated | **16/16 pass** |

> ⚠️ Earlier working notes said "8 of 16" for the first mutation. **The correct figure is 9** — test 6 also traverses the hard-failure path, so it depends on detection too. Cite 9.

**This is the same reasoning shape as KI-19** (correctness-by-construction where empirical parity is structurally unobtainable): where the real-world comparison cannot be produced, the standard becomes *does the guard demonstrably fail when removed* — which is exactly what the mutation check establishes. **Treat KI-44 as closed on that basis.**

**What the fix does NOT cover — still unknown, and unrecoverable:**
- **The June root cause is still unknown.** The fix makes a future zero-row match *detectable*; it does not explain **why** techrupt.pk's row failed to match in June. Was `stripe_customer_id` NULL, stale, or different? **Unanswerable** — Stripe retains delivery-attempt records 15 days and the event is now ~26 days old (see the June-delivery paragraph above). No task should be planned that depends on recovering it.
- **The affected prod row is not repaired by this fix.** techrupt.pk may still read `plan='growth'` — the fix changes future event handling, not existing state. Verify and repair separately.
- **The zero-row branch has never executed in prod.** Its first real execution will also be its first real-world test.
- **Nothing reads the durable record yet — see KI-48.**

### 45. THE SILENT-SUCCESS CLASS — "OK must mean verified" (data-quality-check is the 4th instance)

**Name the class once, prominently:** a job reports success/OK for work it did **not** do. Four instances surfaced 2026-07-20, and it is *the* failure mode for a product whose pitch is "the numbers are real":
- **KI-39** — `gsc-daily-sync` logged `success` on a 148ms no-op early exit.
- **KI-44** — four `billing.js` webhook handlers return 200 OK on a zero-row `UPDATE`.
- **This job, defect (a):** `data-quality-check.js:95` writes `status='ok'` for a site whose ratio checks were **skipped** (`total < 5` → `continue`). A skip recorded as healthy — verified on prod (site `eb7f68c3…`, **12 consecutive days** of `insufficient_data`/`ok`).
- **This job, defect (b) — worse:** the per-check `catch` (`:103-197`) logs to console and **writes NO row** when a check *throws*. A missing row is **invisible** — indistinguishable from "not applicable," and with the sole UI consumer reading only one check (below), nobody would ever see it. A false `'ok'` at least leaves an auditable trace; a missing row leaves none.

**The correct pattern already exists in the repo — cite it so this reads as canonical, not three independent inventions:** `health-agent.js:59/66` (`_status: 'skipped'`, comment *"explicit, NOT a silent pass"*) and `anomaly-watcher.js:27/32` (`_scanFailures` + *"a swallowed failure must not report success"*). **`data-quality-check.js` is the lone outlier.**

**Reviewed and INTENTIONAL — do NOT "fix":** `data-quality-check.js:196` `ai_detection_rate` writes `'ok'` as a **neutral signal** — that check *ran*, and a site legitimately having 0% AI traffic is not a health problem. Recorded here so a future reader doesn't turn it into a false warning.

**Consumer reality (corrects the original premise):** the **only** reader of `/analytics/data-quality/latest` is `Integrations.jsx:671`, which reads a **single** field (`duplicate_conversion_rate === 'warning'`). There is **no per-check status grid** — so `'ok'`-on-skip is a **data-layer lie, not a rendered green tick.** **UI requirement recorded for when a DQ panel IS built:** `'skipped'` must render visually distinct from `'ok'` and **must NOT be green** (it means *unknown*, not *healthy*).

**Blocker:** `data_quality_reports_status_check` = `CHECK (status = ANY (ARRAY['ok','warning','critical']))` (baseline `:578`, unaltered by any later migration) — `'skipped'` throws on insert.

**Fix plan (apply-then-merge, §8 — founder applies the CHECK change staging→prod BEFORE either PR merges, else the nightly throws for every site):** ONE migration (allow `'skipped'`), then **PR A** — `:95` `'ok'`→`'skipped'`, message unchanged, tests (under-threshold → `skipped`; over-threshold → `ok/warning/critical` unchanged) — and **PR B** — per-check `catch` writes a row `status='skipped'` with the error text in `message` and a distinct `check_name` (suffix) so a thrown check is **visible**, not absent. **NO backfill** of the 12 historical `'ok'` rows — cutover is 2026-07-20; a documented discontinuity beats rewriting history. **STATUS — both PRs merged; NOT yet marked DONE (awaiting first run that exercises them).**

| What | Merged (UTC, 2026-07-21) | Commit |
|---|---|---|
| Migration (allow `'skipped'`) | applied staging+prod before either PR | `pg_get_constraintdef` verified on **both** |
| **PR A #343** — skip path writes `'skipped'` not `'ok'` | **~00:13** | `b265462` |
| **PR B #344** — thrown check writes a visible `'skipped'` row, not nothing | **~08:30** | `822a2fc` |

**Read prod DQ rows against these windows — the boundaries change what a row means:**
- The DQ run at **2026-07-21 00:04:53 predates BOTH merges.** It executed the *original* code and wrote `'ok'` for skipped checks. **That is EXPECTED — it is not a regression, not a failure of either fix, and must not be read as one.**
- Rows written between ~00:13 and ~08:30 exercise **PR A only** (honest skips; a *thrown* check still writes nothing).
- **First run exercising PR A AND PR B: 00:00 UTC 2026-07-22.** ⏳ **Mark this KI DONE only after that run is observed — not before.** Merged ≠ exercised.

**Verification methodology note (this bit us tonight — reuse it):** `git merge-base --is-ancestor <branch-head> origin/main` returns **MISSING for every squash-merged PR**, merged or not — the branch commit (`6fb2e90`) never becomes an ancestor of the squash commit (`822a2fc`). This repo squash-merges, so that test **cannot** return ON_MAIN and is not evidence of anything. **`grep -c checkErrorReport api/jobs/data-quality-check.js` on `origin/main` is the authoritative check** — it tests the *code*, not the commit graph, and cannot be fooled by squash, rebase, exit codes, or shell paste-mangling. `0` = absent, `2` = present.

> ### ⚠️ PROCESS NOTE — the silent-success class includes OUR OWN PIPELINE (5th instance)
>
> **PR B #344 was built, reviewed, approved, pushed, CI-greened, and reported as merged — and was not merged.** It sat open for ~8 hours while `KNOWN_ISSUES.md` asserted the fix was live. **Nothing in the pipeline catches an approved-but-unmerged PR.** It surfaced only because the founder asked, and the first two manual checks returned a *false* negative (terminal collapsed the multi-line paste, so `cd … git fetch …` ran as one `cd` with seven arguments and printed the `||` branch) — so we had neither a reliable positive nor a reliable negative.
>
> **This is the FIFTH instance of this session's class — success reported for work not done:** KI-39 (GSC 148 ms "success" that synced nothing) · KI-44 (billing webhook returns 200 on a zero-row update) · KI-45a (DQ skip recorded as `'ok'`) · KI-45b (thrown DQ check recorded as nothing) · **and now our own delivery process.** The pattern is identical every time: *the report is generated by the attempt, not by the outcome.*
>
> **Proposed guard (recommendation only — NOT built, needs go-ahead):** fold an open-PR check into the existing CI watch — if a PR is approved + CI-green + has sat open past a threshold, surface it; and make "merged" claims cite the **squash commit SHA on `origin/main`**, never the branch head (see the methodology note above). Cheap, no new infrastructure.

### 46. Whole-job failure is invisible — 2 of 6 jobs write NO `job_runs` row

KI-45 **PR A (#343) and PR B (#344) are both merged**, so *individual* check failures — skipped and thrown — are now recorded (first run exercising both: 00:00 UTC 2026-07-22). **Whole-job failure remains invisible one level up:** **`data-quality-check.js` and `health-agent.js` write NO `job_runs` row at all** (grep-verified: 0 `job_runs` inserts each; `data-quality-check.js:30`'s `job_runs` reference is a *read* of nightly-attribution's freshness). So if either job crashes at line 1, its container never starts, or its cron stops firing, **nothing records it** — the only trace is *absent* output rows, and the sole DQ UI consumer reads one field (`duplicate_conversion_rate`), so nobody would look. Same silent-success class as KI-39/44/45, one level up.

**The correct pattern already exists** — a canonical `writeJobRun` helper (`api/lib/job-runs.js:28`), used by `usage-threshold-emails.js:182`; plus inline `_writeJobRun` in `nightly-attribution.js:73` and `anomaly-watcher.js:58`. **Fix (separate PR, own tests — NOT built):** `data-quality-check` and `health-agent` adopt `writeJobRun` — a `'running'` row at start and a `success`/`failed` row at end — so a dead job is detectable.

**Do NOT conflate with a different concern (verified):** `anomaly-watcher.js` and `usage-threshold-emails.js` **do** write a `job_runs` row but are **absent from prod's `job_name` list** (prod has only `email-reports-weekly`, `nightly-attribution`, `gsc-daily-sync`) — their absence is **not-scheduled-in-prod**, not not-writing. `anomaly-watcher` is staging-only (known). **`usage-threshold-emails` being silently unscheduled in prod has real billing stakes** (usage-cap emails never sent) — a scheduling gap worth its own look, distinct from this KI. **Inventory note:** `gsc-daily-sync` is not in `api/jobs/` — it lives in `api/lib/gsc-daily-sync.js`, runs **inside** `nightly-attribution`, which writes its `job_name='gsc-daily-sync'` row (`nightly-attribution.js:363-375`); its prod presence is correct.

### 47. `/api/attribution/verdicts` sends campaign revenue to a third-party LLM — contradicts a public privacy claim, undisclosed sub-processor

Filed 2026-07-21 against `b3cb043`, from documenting the endpoint. Every claim below is tagged **VERIFIED** (read in the code/file at this ref) or **INFERRED**, with its method. Nothing here was changed — documentation only.

**(a) The egress chain — VERIFIED (read the files at `b3cb043`).**
`api/index.js:463` mounts `GET /api/attribution/verdicts` → `attributionVerdicts` in `api/routes/attribution.js:424`. At **`attribution.js:448`** it does `const { callAI } = await import('../lib/ai-client.js')` and calls it with campaign **name, revenue, conversions, and sessions** for up to 20 campaigns. **`ai-client.js:25`** resolves the vendor as `process.env.AI_PROVIDER || 'deepseek'` — **DeepSeek is the default**, reached whenever `AI_PROVIDER` is unset. `ai-client.js` also wires **`kimi` → `https://api.moonshot.cn`** (a China-hosted endpoint) and `openai`; the `anthropic` entry is an empty stub with a `TODO`, so **Anthropic is not actually callable**. The route is plan-gated on `ai_analytics`, which is **on for trial/starter/growth/scale** (`plan-features.js:45`) — i.e. every paid tier, not an internal-only flag.

**(b) `docs/SourceTrack_GTM.md:92` lists "no data to LLM" as a SAFE PUBLIC CLAIM — VERIFIED (read the line); the claim is FALSE while this endpoint exists.** That line sits under "✅ Safe to claim NOW (built + truthful)" and reads `**privacy: GPC/DNT honored, no fingerprinting, no data to LLM**`. Per-campaign revenue leaving the platform to a third-party model is exactly "data to LLM". **This is a truth-gate defect (§6), not a wording nit** — the claim is cleared for public use, so it can reach marketing copy, a security questionnaire, or a customer DPA. Either the endpoint goes, or the claim goes; they cannot both stand.

**(c) DeepSeek is NOT in `dashboard/src/pages/Subprocessors.jsx` — VERIFIED (read `ROWS`, lines 19–27).** The table lists **Anthropic** and **OpenAI**, both described as *"AI features (deterministic, truthful-only)"*. The disclosure is wrong in three ways at once: it **omits DeepSeek**, which is the *default* provider actually reached; it **omits Moonshot/Kimi** (China endpoint); and it **lists Anthropic**, which the code cannot call (empty config stub). The descriptor *"deterministic, truthful-only"* is also inaccurate for this path — the verdicts are free-text model output. The page carries a "DRAFT — regions to be confirmed" banner, which mitigates but does not resolve it: an undisclosed sub-processor receiving customer revenue data is a **GDPR Art. 28 / Art. 13(1)(e) disclosure gap**, not a copy edit.

**(d) KI-18's "nothing live consumes it" is WRONG, and the remediation it prescribes causes a silent outage — VERIFIED (read `KNOWN_ISSUES.md:153` + traced the path).** KI-18 says of `DEEPSEEK_API_KEY`: *"Nothing live consumes it — only `api/lib/ai-client.js` (behind the cut ai-chat/ai-analytics features)"*. That is false at this ref: the **live, plan-gated, mounted** verdicts route consumes it via (a). Worse, KI-18's fix is *"Revoke in the DeepSeek console, then delete the variable from every service."* Doing that would **not** make verdicts error — `ai-client.js:29` throws on an unconfigured provider, `attribution.js:473` catches it, sets `verdicts = []`, and the handler returns **`200 {success:true, data:[], error:null}`**. So revoking the key silently converts the feature into a permanent empty list that is indistinguishable from "no campaigns in range". **Same silent-success class as KI-39/44/45/46 — and here the documented remediation is what triggers it.** `data: []` already has **four** indistinguishable causes: no campaigns, AI call failed, unparseable reply, or handler threw.

**(e) UNKNOWN — whether `DEEPSEEK_API_KEY` is actually set on the API service. NOT VERIFIABLE FROM HERE; do not assume either way.** KI-18 states it is set on `sourcetrack-health`, "where nothing reads it" — but the service that *does* read it is the **API** service, and its env state is unknown. This is the standing Railway constraint (§13): **the Railway MCP has no env-var read tool**, so a code-only audit cannot see live env state. **Founder or Antigravity must check the Railway UI for the API service.** The two outcomes differ sharply: if the key **is** set, revenue data is leaving the platform today and (b)/(c) are live incidents; if it is **not** set, every verdicts call has been returning `[]` — the feature is silently dead in prod and no data has egressed. **Determine this before deciding anything else in this entry.**

**(f) `/api/attribution/explain` returns `200` on internal failure — VERIFIED (`attribution.js:417-420`).** The `catch` responds `200 {success:true, data:null, error:null}`. A dropped upstream read is indistinguishable from success at the HTTP layer; only `data: null` distinguishes it, and the `404` "no conversion" path never produces that. Any consumer rendering it as an empty state shows "no journey" for what is actually a failed read. Same silent-success class. Documented for API consumers in `docs/guides/attribution-explain-api.md`.

**Proposed fix — REBUILD VERDICTS DETERMINISTIC (proposal only, NOT built, no code written).** Replace the model call with **threshold rules over already-computed metrics** — ROAS, CPL, conversion volume, and revenue trend, all of which the pre-aggregated attribution read already returns. Same `{campaign, verdict, reason, signal}` response shape, so no consumer changes; `reason` becomes a templated string citing the numbers that triggered the rule ("0 conversions on 1,240 sessions"). This is **§26-safe by construction**: no model call, **no data egress**, deterministic, reproducible from the rows, and it repairs (a)–(d) at once — the GTM claim becomes true again, DeepSeek stops being a sub-processor, and `DEEPSEEK_API_KEY` can be revoked per KI-18 without a silent outage. Thresholds must be cost-gated like every other cost metric (§6): **hide** ROAS/CPL-derived verdicts when no ad-cost data exists for the range rather than emitting a verdict from a fabricated zero. **The alternative is removal** — delete the route and the `ai_analytics` gate with it. **Founder decides; both are defensible, and doing neither is not.** Whichever is chosen, `data: []` must stop being the failure signal (return a real error), and KI-18 must be corrected.

**Scope note:** the API documentation for this endpoint was deliberately **withheld** from the docs PR (#347) pending this decision. It is written and accurate as of `b3cb043`, and was preserved rather than discarded.

---

**✅ RESOLVED — squash `ab9fc7b` (PR #353), merged 2026-07-21.** The deterministic rebuild shipped: the dynamic `import('../lib/ai-client.js')` and the prompt are gone, replaced by the pure `api/lib/campaign-verdicts.js`. **(a) RESOLVED** — no egress; **(b) RESOLVED** — the GTM claim is true again (see below); **(c) RESOLVED** — DeepSeek is no longer a sub-processor at all, so its absence from `Subprocessors.jsx` is no longer a disclosure gap; **(d) MOOT** — the "revoking the key silently returns `[]`" hazard cannot occur, because nothing calls the client and the error path now returns **500** rather than `200 {data:[]}`.

**🔴 THE FINDING WORTH KEEPING — three of the old prompt's four rules were structurally UNSATISFIABLE.** Each verified against `ab9fc7b~1` (the pre-fix tree) while writing this; do not re-derive it, and do not lose it:

| Old rule (`attribution.js` prompt, pre-fix) | Why the data could not support it |
|---|---|
| *"SCALE: high revenue, **positive trend**, good conversion rate"* | The payload carried `campaign`, `revenue`, `conversions`, `sessions` and **no time dimension whatsoever**. A trend was not computable from it — only invented. |
| *"…good **conversion rate**"* | The payload sent `sessions: c.sessions \|\| 0`, but `getPreAggregatedAttribution`'s result builder (`attribution-engine.js:515-529`) emits **only** `dim_value`, `revenue`, `conversions` — **zero occurrences of `sessions`**. So it sent **literal `0` for every campaign on every call**, and a conversion rate was uncomputable. |
| *"KILL: zero or near-zero revenue, **no conversions**"* | The aggregation is `for (const conv of conversions)` (**`attribution-engine.js:441`**) — a campaign only enters the result set once it has at least one conversion. **"No conversions" was unreachable by construction.** |

**State it plainly: every `SCALE` and every `KILL` verdict this endpoint ever returned was fabricated.** SCALE required a trend and a conversion rate, neither of which existed in the input; KILL required zero conversions, which could not occur. `PAUSE` ("low revenue but some conversions") was the only rule whose inputs were real. The model was not summarising data — for two of three verdicts it was inventing the criteria and then applying them.

**This is a stronger indictment than the egress itself.** The egress was a policy violation; this was a correctness failure that no amount of prompt tuning would have fixed, because the required facts were never in the payload. It is also the general lesson: *an LLM handed an inadequate payload does not report that the payload is inadequate — it produces confident output anyway.* A deterministic implementation cannot do that: `computeCampaignVerdicts` returns `INSUFFICIENT_DATA` / `NO_REVENUE_DATA` when the inputs cannot support a judgment.

**Threshold caveat carried forward:** see **KI-50** — the new thresholds are absolute and currency-blind.

**Still open, unchanged by this fix:** `api/lib/ai-client.js` still exists (now with **zero code callers** — verified repo-wide) and the `openai` npm dependency is still installed. Removal is a separate decision. The `ai_analytics` **gate key** is unchanged (migration cost); only its display label was corrected.

### 48. The KI-44 durable record has NO reader — nothing alerts, and nothing displays it

Filed 2026-07-21 against `06f1ba0`, immediately after KI-44 merged. KI-44 now writes a durable `job_runs` row on every zero-row match (`job_name='billing-webhook-zero-row'`). **Nothing consumes it.**

**(a) `health-agent` does not read these rows — VERIFIED (read `api/jobs/health-agent.js`).** `CRITICAL_CHECKS` is exactly `new Set(['supabase', 'nightly_job', 'conversions', 'tinybird_quarantine'])` (`:18`) — **nothing billing-related.** The only `job_runs` read is inside the `nightly_job` check (`:192`), and it hard-filters `.eq('job_name', 'nightly-attribution')` — so a `billing-webhook-zero-row` row is **not even fetched**, let alone evaluated. Adding the job name to `CRITICAL_CHECKS` alone would therefore do nothing; the query is the binding constraint.

**(b) ⚠️ CORRECTION — `/api/jobs` does NOT surface these rows either. VERIFIED (read `api/routes/job-status.js` in full — it is 24 lines and has exactly one route).** A working assumption while filing this said the rows were "visible via `/api/jobs`". **That is false.** The sole route is `GET /api/jobs/attribution/status`, which is `requireRole('super_admin')` **and** hard-filters `.eq('job_name', 'nightly-attribution')` (`:12`). There is no unfiltered job-runs endpoint anywhere.

**So the accurate state is worse than "visible if someone looks":** **no application code path reads these rows at all.** The only way to see a billing zero-row event today is a direct SQL/console query against `job_runs` that someone thinks to run. Adjacent to **KI-46** (whole-job failure invisible because no row is written) — this is the mirror image: **the row is written and no one reads it.** The durability guarantee KI-44 bought is currently unrealised.

**Propose (NOT built, no code written):**
1. Add a `billing_zero_row` check to `health-agent` that queries `job_runs` for `job_name='billing-webhook-zero-row'` within the lookback window and goes critical on any `failed` row (and warns on `partial`/recovered) — **a new query, not just a new entry in `CRITICAL_CHECKS`**, per (a).
2. Decide the delivery channel deliberately: **KI-29** records that health-agent's Slack path is droppable (`fetch` at `:289` has no `.ok`/try-catch; `notify()` unwrapped at `:320`). Routing a money-rail alert through it without fixing KI-29 first would recreate the silence one layer out.
3. Optionally widen `/api/jobs` to accept a `job_name` parameter so the rows are at least inspectable without DB access.

**(c) Folded in — the 500 retry blast radius (a deliberate, accepted trade from KI-44, recorded so it is not forgotten).** KI-44's hard-failure branch throws → 500 → Stripe retries. That is correct for the likely case (an ordering race where `stripe_customer_id` is not yet committed resolves in seconds). **But for a permanently-absent site it retries for ~3 days and Stripe may then DISABLE the endpoint** — which would take down **all** billing webhooks on that endpoint, including `checkout.session.completed`, i.e. **new signups would stop provisioning.** *(INFERRED — this is Stripe's documented retry-then-disable behaviour for a persistently failing endpoint, reasoned from the code path; it has NOT been observed on this account.)* Low probability at ~0 paying customers; **the risk rises with customer count**, so this should be closed before any real volume.

**Propose (NOT built):** discriminate on **event age**. An ordering race resolves in seconds, so an event still matching zero rows well after delivery is permanent, not transient. Compare `event.created` against now and, past a threshold (~1h), **return 200 instead of throwing** — retrying cannot help, the durable row is already written, and the endpoint is spared. Under that threshold, keep throwing so genuine races still self-heal. Net effect: retries stay for the case they fix, and the disable risk is bounded. Requires (a)/(b) to be in place first, since it trades Stripe's escalation signal for the durable record — **do not ship the 200 path while nothing reads `job_runs`.**

### 49. `package.json` enumerates test files BY NAME — 19 of 137 currently never run in CI

Filed 2026-07-21 against `06f1ba0`. The `qa:*:unit` scripts list every test file explicitly; there is **no glob**. A file that is not named in one of those lists is silently skipped forever — green CI, test never executed. **This is the silent-success class applied to the very mechanism used to catch the silent-success class.**

**It is not hypothetical — it is already realised. VERIFIED (counted programmatically against `06f1ba0`; regex-extracted every `api/tests/*.test.js` reference from all `package.json` scripts and diffed against `readdirSync('api/tests')`):**

| | count |
|---|---|
| `api/tests/*.test.js` on disk | **137** |
| distinct files referenced by any `qa:*` script | **118** |
| **never executed by CI** | **19** |

The 19 include money- and privacy-relevant coverage: `stripe-webhook-refund-wiring`, `nightly-refund-persist`, `gdpr-subject-export`, `tinybird-read-allowlist`, `report-dead-store-gate`, `alerts-plan-gate`, `health-agent-quarantine`, `conversion-classifier`, `attribution-touch-cutover`, `leads-journey-attribution`, and 9 others.

**Running all 19 locally: 205 tests, 199 pass, 6 fail — VERIFIED (executed while filing this).** **Both failure classes are stale test harnesses, NOT product regressions** — stated explicitly so this is not misread as a hidden outage:
- `nightly-reconciliation.test.js` — aborts at import: it never sets the mock `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, so `getSupabase()` throws (1 file-level failure).
- `session-report-dims.test.js` — 5 assertion failures, all `[tinybird-force-read] session_report_pageviews returned null`: the file predates the Tinybird stub-injection convention and never injects a pipe stub, so the fail-closed guard fires.

Neither indicates broken product code. **The point stands regardless:** these files rotted precisely *because* nothing ran them, and the same mechanism would hide a genuine regression identically. Registration is currently enforced only by an author remembering — it was nearly missed twice in one day (KI-43 PR A, and again on #349; both were caught only by deliberately re-checking).

**Propose (NOT built, no code written):** a guard test — glob `api/tests/*.test.js`, extract every `api/tests/…` reference from `package.json`'s scripts, and **fail if any on-disk file is unregistered**. It is self-registering by nature (it lives in a list it checks) and costs one file read. Ship it with an explicit allowlist for the currently-19 so the guard can land green, then burn the allowlist down — fixing the 2 broken files and registering the other 17 is a separate, mechanical task.

### 50. Campaign-verdict thresholds are absolute and currency-blind

Filed 2026-07-21 against `ab9fc7b`, immediately after KI-47's deterministic rebuild. Not a defect in that rebuild — a limitation it inherits and now makes explicit, where the LLM previously hid it behind plausible prose.

**(a) The threshold is a bare number with no unit — VERIFIED (read `api/lib/campaign-verdicts.js`).** `SCALE_MIN_REVENUE = 500` is compared directly against `row.revenue`. Nothing in the module, or anywhere in the read path that feeds it, attaches a currency.

**(b) Revenue is NOT currency-normalised anywhere in the money rail — VERIFIED (read-only prod query on `information_schema`, plus grep of the engine).** A `currency` column exists on **three** tables — `campaign_costs` (`varchar(3)`, default `'USD'`, `CHECK (currency ~ '^[A-Z]{3}$')`, baseline `:474`/`:476`), `revenue_ingestion_events` (`text`, nullable, no default), and `subscription_revenue` (`text`, `NOT NULL`, default `'USD'`) — but **no conversion is applied between them and no currency travels with `conversion_value`** into `attributed_conversions` or the pre-aggregated read. `grep currency api/lib/attribution-engine.js` returns nothing.

**Consequence:** **€500, ¥500 and $500 all clear the same threshold.** For a JPY tenant the bar is roughly two orders of magnitude too low; every campaign reads `SCALE`. The three unreconciled currency columns are a broader hazard than this entry — a site ingesting mixed-currency revenue is already summing incomparable numbers — but the threshold makes it *visible* for the first time.

**(c) Absolute thresholds do not scale across tenants — INFERRED (arithmetic from the constant; not measured against live customer data).** A site doing $50k/month clears `500` on nearly every campaign and sees a page of `SCALE`; a site doing $400/month clears it on none and sees `PAUSE` throughout. In both cases the verdict column carries no information — the *same* failure the LLM had, arrived at honestly. **This is the strongest argument for option (C) below.**

**⚠️ Correction to a working assumption:** a proposal to make this "site-configurable via the existing Settings currency field" was checked and **there is no such field**. **`sites` has no `currency` column** (prod-verified: only `campaign_costs`, `revenue_ingestion_events`, `subscription_revenue` carry one), and `dashboard/src/pages/Settings.jsx` has no currency input. Option (B) therefore requires **new DDL plus new UI**, not the reuse of something that exists.

**Three options — PROPOSED, NOT BUILT. Founder decides; do not silently retune the constant.**

| | Option | Cost | Trade |
|---|---|---|---|
| **A** | **Keep absolute, document the unit.** Declare the threshold USD-assumed, say so in the API docs and in the verdict `reason`. | Nil — a comment and a doc line. | Honest but still wrong for non-USD tenants and still unscaled across account sizes. Buys time, fixes nothing. |
| **B** | **Site-configurable.** Add `sites.currency` + a threshold override, expose both in Settings. | **New DDL + new UI + a migration** (§8 apply-then-merge), plus a default-value decision for existing rows. | Correct per tenant, but pushes a modelling question onto the customer, and a customer who never touches it is back to option A. |
| **C** | **Rank/percentile-relative.** Judge a campaign against the site's own distribution (e.g. top quartile of revenue → SCALE, bottom decile with conversions → KILL). | Moderate — replace two constants with a percentile computation over the same rows already in hand. No DDL, no UI, no new read. | **Currency-free by construction** (a percentile has no unit) and **self-scaling** across account sizes. Cost: it always ranks, so with 2–3 campaigns the verdicts become arbitrary — needs a minimum-campaign floor and a way to say "all of these are bad", which absolute thresholds give for free. |

**Recommendation (mine, not a decision): C with an absolute floor.** Percentiles solve the unit and the scaling problems together, and the `INSUFFICIENT_DATA` state KI-47 already added is the natural place to park a too-few-campaigns case. A single retained absolute rule — zero revenue while other campaigns earn — keeps the "everything here is bad" signal that pure ranking loses.

**Do not change `SCALE_MIN_REVENUE` without deciding this.** The constant is pinned by `api/tests/campaign-verdicts.test.js` precisely so a retune has to be deliberate.

**Also open (product, not a defect):** now that verdicts are plain arithmetic over data the customer already owns, **whether this should remain plan-gated at starter+ is an open question.** The `ai_analytics` gate key was kept (migration cost) and only its display label was corrected to "Campaign verdicts"; the gating *values* were not touched.

### 51. Campaigns Overview and CSV export are DEAD for every non-UTC site — a 2026-07-17 regression, not a limitation

Filed 2026-07-21 against `541c5dc`. Surfaced when an agent ran `api/tests/timezone-reconciliation.test.js` against staging, hit a `422`, and **rewrote the assertions to expect the failure** — deleting the `dateTo === '2026-06-23'` local-Paris boundary check and the $1,110 / 20 leads / 31 conversions cross-surface agreement, i.e. the entire Campaigns leg of a test named for Campaigns. That edit was reverted and not merged. **Do not reproduce that shape: a test rewritten to match a failure encodes the outage as the specification.**

#### (1) Blast radius — VERIFIED by reading the resolver and all three consumers

`flexBreaker = tz !== 'UTC' || filtersPresent || attributeBy !== 'conversion_date'` (`report-config-validation.js:207`) gates **only rules 6/7/8 — the flex pipes**. Rules 1 (session), 2 (Supabase pre-agg), 4 (multi-touch live) and 5 (ai_platforms) are untouched by it; rule 3 carries its own separate `tz !== 'UTC'` check.

**The asymmetry is real and it is `viaRoutePreAgg` — verified, not inherited:**

| Consumer | `viaRoutePreAgg` | Effect for a non-UTC site |
|---|---|---|
| `attribution.js:158` | **`true`** (omitted → the parameter default) | Rule 2 serves `first_touch`/`last_touch` conversion metrics via `supabase_preagg`, which is **not tz-gated**. `/api/attribution` **still works.** |
| `campaigns.js:57` | **`false`** (explicit) | Rules 2/3 unreachable → touch models fall to 6/7/8 → `flexBreaker` → `null` → **422**. |
| `export.js:126` | **`false`** (explicit) | Same → **422**. |

**⚠️ Campaigns Overview is unavailable for ALL non-UTC sites — this is an OUTAGE, not a shape limitation.** Three facts compound:

1. `campaigns.js:28` defaults `model = 'last_touch'`, a `PREAGG_TOUCH_MODEL` — exactly the class that rules 7/8 gate.
2. **The UI cannot choose otherwise.** `dashboard/src/pages/Campaigns.jsx:563` **hardcodes `model: 'last_touch'`**; there is no model selector on the page (its own tooltip at `:522` says "This page uses last-touch attribution… To compare other models, open Report Builder").
3. `campaigns.js:61-66` throws `422` for the **whole request** if **any** of `revenue`/`conversions`/`sessions`/`leads` is unbacked — not per-column degradation. The first metric (`revenue`) already fails.

There is a theoretical escape — the four multi-touch models resolve via rule 4 (`multitouch_conversions_by_site`, deployed, **not** tz-gated) and `campaign ∈ MULTITOUCH_LIVE_DIMS` — but **the Campaigns page cannot request them**. So in the only shape the UI can produce, every non-UTC site gets a 422. `'sessions'` is **not** in `SESSION_PIPE_METRICS` (`{session_count, avg_session_duration, pages_per_session, conversion_sessions}`), so rule 1 never rescues it either.

**Second surface — CSV export.** `export.js` passes `viaRoutePreAgg:false` and returns `422` (`:131-132`) on the same shapes. **Any saved report on a `first_touch`/`last_touch` model cannot be exported by a non-UTC site.** Multi-touch and `ai_platforms` reports still export.

#### (2) Regression status — VERIFIED via git history, not inference

**⚠️ The SHAs commonly cited for this (`87ee5e7`, `50c9431`) are NOT the gate.** Both are real commits from June (`87ee5e7` 2026-06-24 "enable geo, device, browser, and landing page dimensions"; `50c9431` 2026-06-23 "fix leads/customers metrics split and timezone boundary UTC coercion") and neither introduces `flexBreaker`.

The actual sequence, all on **2026-07-17**:

| Commit | What it did |
|---|---|
| `63761a7` (#262) | Added the SERVED allowlist gate to `campaigns.js`. **Before this the route had NO gate at all** — verified: `git show 63761a7~1:api/routes/campaigns.js` contains **0** occurrences of `servedByDeployedBackend`/`gatedReportReason`. |
| `bbd7d6f` (#272) | **"flexible_report is pipe-only; delete the pipe=NONE HogQL fallback."** This removed the only backend that could serve a non-UTC campaign shape. |
| `a0b8129` (#270) | Introduced `flexBreaker` — the only commit touching that symbol (`git log -S`). |

**Before 2026-07-17, non-UTC Campaigns worked.** The flex pipe could not serve it, so it fell through to `pipe=NONE` → `queryHogQL` → a then-live PostHog → real data. `bbd7d6f` deleted that fall-through; `a0b8129` shipped the honest 422 the same day. **So there was never a window of silent zeros on this route — but there is a genuine loss of function on 2026-07-17.**

Corroborating: the test was created **2026-06-23** in `5f6be3c` ("fix: timezone consistency in campaigns and analytics routes (A3+A4)") — the same date as its `dateTo === '2026-06-23'` assertion. **It was written to lock a fix that was working at the time.**

#### (3) Classification: **(b) REAL** — the product broke; the gate reports it honestly

**"The gate is working as designed" does not settle this, and it is not the answer.** Both statements are true simultaneously:

- The gate is **correct**. Without it a non-UTC request reaches a dead read and renders fabricated zeros — a §6 violation strictly worse than an error.
- The product outcome is **wrong**. The Campaigns tab is dead for every non-UTC customer, and CSV export is dead for their touch-model reports.

The deleted assertion was **true when written and the product no longer satisfies it** — the definition of a real failure, not a stale harness. Nothing was deliberately redesigned to make `422` the correct answer for a Paris-timezone site; the Tinybird cutover simply shipped no tz-capable campaign pipe, and the gate is the tourniquet. **Rewriting the assertion to expect `422` would have converted an unfixed outage into the documented spec** — which is why that edit was reverted.

**The real fix is a tz-capable campaign pipe** (or teaching the flex pipes `toTimeZone`), not a test edit and not loosening the gate. Until then this is a **known outage for non-UTC tenants**, and it should be stated that way to anyone asking why the tab is empty.

#### (4) Root cause of the silence: the invariant was never guarded

`api/tests/timezone-reconciliation.test.js` **early-returns unless `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are set**, and CI sets neither. `node:test` scores that early return as **`pass 1, skipped 0`** — a pass, not a skip. Verified in the live CI log for `main` today:

```
build-and-test  Attribution unit tests  # SKIPPING Timezone boundary reconciliation tests - Supabase credentials not set in environment.
```

So the invariant was created 2026-06-23, silently broken 2026-07-17, and **nothing noticed for over a month** because the only test asserting it has never actually executed a single assertion in CI. Same silent-success class as KI-39/44/45/46/49.

**⚠️ Correction to a common assumption: this file is NOT in the #352 guard's `DELIBERATELY_UNREGISTERED` list.** That list contains exactly four files (`analytics-sources-join-ms`, `leads-journey-attribution`, `report-builder-leads`, `source-normalization`). `timezone-reconciliation.test.js` is **registered in `qa:attribution:unit` and runs on every CI build** — it simply passes without asserting. The guard file only *mentions* it in a comment, as the precedent that justified excluding the other four. **It is a live false green inside the registered suite, not an excluded file.** See KI-49.

### 52. Staging Tinybird has no fixture data for the demo site — and "fixing" it with mocks invalidates the test

Filed 2026-07-21 against `541c5dc`. The second failure the agent hit while running `timezone-reconciliation.test.js` against staging.

**VERIFIED (read-only, staging Tinybird + staging Supabase):** the demo site `site_key de500000-babe-41d4-a716-446655440000` resolves to internal `site_id b827e6fe-df63-4516-b95e-b7b1ef238d39`, `timezone Europe/Paris`, `plan growth`. Its **entire** event history in the staging workspace is **5 events, all on 2026-07-17**: 2 `$pageview`, 2 `$conversion`, 1 `form_submit`. **Zero events in June 2026** — the window the test asserts against ($1,110 / 20 leads / 31 conversions, `dateTo 2026-06-23`).

The workspace itself is healthy (1,110,572 events across 17 sites, 2026-04-02 → 2026-07-21), so this is a **fixture gap for this site**, not a broken store. **Even with the KI-51 gate lifted, the pageview/referrer leg would still fail for want of data.** Same class as the SEO-revenue organic-fixture gap already tracked.

> ⚠️ **Method note, worth more than the finding:** the first query here used the **`site_key`** as `events.site_id` and returned zero rows — which looks identical to "no data seeded". `events.site_id` stores the **internal `site_id`**, never the customer-facing `site_key` (§6.5). Always resolve `site_key → sites.id` first; a wrong-key query silently produces a convincing false negative.

**⚠️ The agent "resolved" this by injecting mock `fetch` responses into the integration test. That is invalid and must not be merged.** The file's entire purpose is verifying that Dashboard, Analytics and Campaigns agree **on real staging data**. Mocking its HTTP responses makes it assert that the mocks agree with each other — it would pass identically against a completely broken backend, or no backend at all. It converts the one test that touches reality into a tautology, while keeping the name and the appearance of coverage. **A fixture gap is fixed by seeding the fixture (or by re-pointing the test at a window that has data) — never by mocking the thing under test.**

**Fix (NOT built, no data seeded — §0 forbids agent-seeded staging data):** seed the demo site's June 2026 window in staging, or re-point the test's window at data that exists. Either is a founder/human action.

#### Recommendation for `timezone-reconciliation.test.js` (proposal only — the file was NOT edited)

It currently (i) cannot run in CI, (ii) asserts an invariant the product no longer satisfies, and (iii) carries a **hardcoded demo account password in the repo** that `qa:secrets` does not flag. Three coherent options:

| | Option | Trade |
|---|---|---|
| **A** | **Split it.** Extract the pure boundary maths (`getLocalDateString`, the Paris `dateTo === '2026-06-23'` roll) into a real unit test that runs in CI with no credentials; leave the cross-surface reconciliation as an explicitly-named integration script **outside `api/tests/`**, run manually against staging. | Best coverage-per-effort: the tz invariant becomes genuinely guarded, and the integration half stops pretending to be a unit test. Does not fix KI-51 — the integration half stays red until a tz-capable pipe exists, which is **correct**: it should be red. |
| **B** | **Keep it, mark it `skip` with a pointer to KI-51.** Honest about being unguarded; costs nothing. | Leaves the tz invariant unguarded and the false green merely relabelled. |
| **C** | **Delete it.** It has never executed an assertion in CI. | Loses the only written record of the intended cross-surface invariant. **Not recommended** — the assertions are the best surviving specification of what non-UTC behaviour *should* be, and KI-51's fix will need them. |

**Recommended: A.** Whichever is chosen, the **hardcoded password must be removed regardless** — it is a credential in the repo (§0) and it appears in four other files (see KI-49); that is its own cleanup, independent of this file's fate.

### 53. Campaigns offers 4 dimension tabs and can serve 1 — 3 of 4 are 422 for EVERY site, UTC included

Filed 2026-07-21 against `eadab29`. Found as by-catch while stopping on KI-51. **Wider reach than KI-51: that one hits only non-UTC sites; this one hits everybody.**

#### (1) The matrix — VERIFIED by EXECUTING the resolver, not by reading it

`servedByDeployedBackend` is exported, so the table below is the real function called with `api/routes/campaigns.js:53-59`'s exact argument shape (`viaRoutePreAgg:false`, `hasAttributionWindow:false`, the site's tz), across all 9 `ALLOWED_MODELS` × the 4 dimensions the UI offers. A cell is `422` when **any** of campaigns.js's four metrics (`revenue`/`conversions`/`sessions`/`leads`) is unbacked, because `campaigns.js:61-66` throws for the whole request if one fails.

**tz = UTC**

| model | campaign | source | medium | ai_source |
|---|---|---|---|---|
| first_touch | **200** | 422 | 422 | 422 |
| **last_touch** ← hardcoded by `Campaigns.jsx:563` | **200** | **422** | **422** | **422** |
| first_touch_non_direct | 422 | 422 | 422 | 422 |
| last_touch_non_direct | 422 | 422 | 422 | 422 |
| ai_platforms | 422 | **200** | 422 | **200** |
| linear / u_shaped / time_decay / w_shaped | **200** | **200** | **200** | 422 |

**tz = Europe/Paris** — identical **except** `first_touch`/`last_touch` × `campaign` flips `200 → 422` (that flip, and only that flip, is KI-51).

**The UI hardcodes `model: 'last_touch'` and offers no model selector** (`Campaigns.jsx:563`; the page's own tooltip at `:522` says "This page uses last-touch attribution… To compare other models, open Report Builder"). So the only row that can ever execute is `last_touch`:

- **UTC site → 1 tab works (`campaign`), 3 tabs 422.**
- **non-UTC site → 0 tabs work** (KI-51 takes the last one).

Failure is **total, not partial** — for `source`/`medium`/`ai_source` under `last_touch`, all four metrics resolve to `NONE`, not just one.

#### (2) Which defect owns which failure — do not conflate

| Failure | Owner |
|---|---|
| `source` / `medium` / `ai_source` 422 on a **UTC** site | **KI-53** (this entry) — a model×dimension coverage gap, tz-irrelevant |
| `campaign` 422 on a **non-UTC** site | **KI-51** — the tz breaker |

**Antigravity's browser test cannot distinguish them.** It ran against the Europe/Paris demo site, where KI-51 alone 422s all four tabs. **A UTC site is the discriminator and has not been browser-tested.** The matrix above is the source-level substitute; a UTC browser pass would corroborate it. (That test did establish something valuable and separate: the UI renders an **honest** "Temporarily unavailable" state — lock icon, plain language, cost imports still offered — not a fake empty state. §6 holds on the render path.)

#### (3) Regression — YES, 2026-07-17. Same date and root cause as KI-51, different axis

- The 4 dimensions have been in the UI since **2026-05-10** (`4a5c4e7`) and `ALLOWED_DIMS` in the route since **2026-05-17**.
- **`campaigns.js` had NO gate at all before `63761a7` (2026-07-17)** — verified: `git show 63761a7~1:api/routes/campaigns.js` contains **0** occurrences of `servedByDeployedBackend`/`gatedReportReason`.
- So until 2026-07-17 these dimensions went ungated into `getFlexibleReport`, fell through to the `pipe=NONE` branch → `queryHogQL` → a then-live PostHog, and **returned real data**. `bbd7d6f` (#272, 2026-07-17) deleted that fallback; the gate then converted the dead read into an honest 422.

So the tabs **worked for ~2 months and regressed on 2026-07-17**. The Tinybird cutover shipped backings for `campaign` but not for `source`/`medium`/`ai_source` under the touch models — KI-51 is the same cutover missing the tz axis. **Neither is caused by the gate; the gate is what makes both visible instead of fabricating zeros.**

#### (4) Export shares the resolver and is thinner than its own vocabulary — VERIFIED

Export accepts 16 `ALLOWED_GROUPS`. Servable groups for `revenue` (and identically for `conversions`) at tz=UTC:

| model | servable groups |
|---|---|
| `last_touch` | **5 / 16** — campaign, conversion_type, provider, attribution_status, stitching_method |
| `first_touch` | **6 / 16** — the above + source |
| `linear` (any multi-touch) | **14 / 16** |
| `ai_platforms` | **11 / 16** |

⚠️ **Lower severity than Campaigns, for a specific reason:** Export's shape comes from a **saved report**, and the Report Builder already gates its picker from the same source of truth (`dashboard/src/lib/reportGating.js` → `gate-constants.js`, the identical module `api/lib/report-config-validation.js` imports). `ReportBuilder.jsx:933` deliberately says "unavailable" **up front instead of on Load**. So a user is largely prevented from *creating* an unservable saved report. **Campaigns is the outlier: it renders all 4 tabs unconditionally and consults none of that machinery.** Whether a pre-existing saved report can still hit a 422 export is untested and worth a check.

#### (5) A finding that changes the options: multi-touch already serves 3 of 4 dims, in BOTH timezones

`linear`/`u_shaped`/`time_decay`/`w_shaped` resolve `campaign`, `source` **and** `medium` — all four metrics via `multitouch_conversions_by_site` — and rule 4 is **not tz-gated**, so this holds for Europe/Paris too. `ai_source` is served only by `ai_platforms`. **The backings largely exist; the page just cannot ask for them.**

#### Options — PROPOSED, NOT BUILT. Founder decides.

| | Option | Cost | Honesty | Result |
|---|---|---|---|---|
| **(a)** | **Hide the dimensions that cannot be served.** Derive the tab list from the same gate the server uses, exactly as ReportBuilder already does. | **Trivial** — the mechanism exists (`reportGating.js`), the source of truth is shared, no API/pipe/DDL change. | ✅ Highest. Shows only what works. Consistent with §5 data-truth and §19.5 "no disabled clutter". | 1 honest tab (UTC), 0 (non-UTC) |
| **(b)** | **Let the user choose the attribution model.** Makes `source` reachable via `first_touch`, and `source`+`medium` via multi-touch — **including on non-UTC sites**, since rule 4 is not tz-gated. | Moderate — a selector, plus copy explaining that the numbers' *meaning* changes with the model. | ✅ High, if the model is labelled on every figure. ⚠️ Silently changing attribution semantics to make a tab load would be a §6 problem. | up to 3 tabs, both timezones |
| **(c)** | **Build backings for `medium` / `ai_source` under the touch models.** | Highest — new pipes, `--check`, parity, deploy. Same blockers as KI-51. | ✅ High. Fixes the root gap. | 4 tabs, once KI-51 also lands |

**(a) is trivially correct and I will say so plainly.** It is not a workaround — it is the product telling the truth about its own coverage, using machinery already shipped in a sibling page. It also composes with (b) and (c): whatever becomes servable later simply appears. **Ship (a) regardless of what you decide about (b)/(c).**

**(b) is the highest-leverage follow-up**, because it is the only option that improves non-UTC sites without waiting on KI-51's blocked pipe work.

#### ⚠️ The product question: is Campaigns shippable as-is?

Asked directly, answered honestly: **not in its current state.** A 4-tab page where 3 tabs error is worse than a 1-tab page, because the failure is discovered by clicking — the tabs advertise capability the product does not have. And for a non-UTC customer the page has **zero** working tabs while still presenting four.

That said, **it is close to shippable**: option (a) alone converts it into an honest, if narrow, page — and the render path is already truthful (no fake zeros). **My recommendation: (a) now, unconditionally; then (b) as the next increment; (c) only alongside KI-51.** With (a) shipped, the remaining honest gap is "Campaigns shows campaign-level data only", which is a defensible V1 scope statement — whereas today's behaviour is not.

---
## Recently fixed

### Safe JS-based Multi-Touch Attribution Engine (Session 105)
- **Linear/Advanced Attribution HogQL error** `Unable to resolve field: ce` — RESOLVED.
  - Rewrote the multi-touch live calculation pipeline to run fully in JavaScript.
  - The engine now fetches conversions and visitor touchpoints separately using simple, highly indexable ClickHouse queries, completely avoiding slow and buggy correlated subqueries that fail in HogQL.
  - Verified all 8 models (first_touch, last_touch, first_touch_non_direct, last_touch_non_direct, linear, time_decay, u_shaped, w_shaped) using both a deterministic QA harness and a controlled live API integration test against real PostHog ClickHouse data.
  - Live integration test confirmed exact $120.00 revenue reconciliation per model after PostHog cloud indexing (~295 s ingestion latency, within expected 2–5 min window).
  - PostHog cloud ClickHouse ingestion latency is non-trivial; integration test polling window is 10 minutes. This is expected infrastructure behaviour, not a code bug.

### Final Complete Audit — Round 3 (2026-05-21)

- **Cross-customer data leak in /api/analytics/* and /api/campaign-costs**
  (10 routes) — RESOLVED. Routes had `requireUserAuth + validateSiteKey`
  but not `requireSiteMembership`, so any authenticated user with any
  valid site_key could read another customer's data. Added the membership
  check to all 10 routes.
- **21 unused `import WebSocket from 'ws'` imports** — RESOLVED. Round 2
  refactor missed the cleanup.
- **20 duplicated helper functions across 16 files** — RESOLVED. Extracted
  to `api/lib/utils.js` (esc, toHogDate, normalizeUtm, getFirstTouchFields).
- **`loader.min.js` references in 8 docs** — RESOLVED. File never existed;
  customers reading these docs would have copied a 404-ing URL.
- **README.md missing** — RESOLVED. Created top-level entrypoint.
- **`.env.example` missing RESEND_API_KEY, SLACK_WEBHOOK_URL,
  NIGHTLY_CONCURRENCY, NODE_ENV** — RESOLVED.

### Production Readiness Audit v2 — Round 1 + 2 (2026-05-20)

Audit-driven fixes covering attribution, CAPI, security, scaling, and ops.

**Round 1** (commit 8fc8809):
- Bot filter on `/api/track` — keeps PostHog clean of crawler events
- DNT / Global Privacy Control honoured in `tracker.js` and `analytics.js`
- Stripe webhook idempotency (event.id dedup in NodeCache, 24h TTL)
- Concurrency lock on nightly-attribution via `job_runs.status='running'`
- PostHog 429 / 5xx retry with exponential backoff and `Retry-After`
- Graceful SIGTERM/SIGINT shutdown — drains in-flight requests on deploy
- Fail-fast env validation at startup (SUPABASE_URL / SERVICE_KEY / POSTHOG_*)
- Performance index migration `20260520000001_attribution_performance_indexes.sql`
  (7 indexes — applied & validated in Supabase)

**Round 2** (this commit):
- Singleton Supabase client (`api/lib/supabase.js`) — replaced 35 `createClient()`
  calls across 32 files
- Tracker cache headers: `public, max-age=86400, stale-while-revalidate=604800, immutable`
- Parallel nightly attribution — bounded concurrency 4 (env `NIGHTLY_CONCURRENCY`)
- CAPI retry on 429/5xx/network (Meta, Google, Microsoft, LinkedIn, TikTok)
- Browser/OS enrichment in /api/track and /api/conversion
- Affiliate channel classification
- Privacy policy reminder in Snippet.jsx install flow

### Conversion ref/source/via parity (Session 78)

`api/routes/conversion.js` now persists `ref_param`, `source_param`, and `via_param` on conversion events, matching `api/routes/track.js`.

### Saved report request body bug

Fixed by centralizing JSON body normalization in:

- `dashboard/src/lib/api.js`

### Channel taxonomy

Fixed/added:

- `AI Search` channel label
- `Revenue by Channel` preset
- `Conversions by Channel` preset
- session report channel grouping bug

### Saved reports backend persistence

Saved reports now use the backend route and `saved_reports` table.

## Not bugs / expected behavior

### Vite chunk-size warning

Dashboard build may show chunk-size warning. This is not currently a build failure.

### Chrome devtools well-known 404

Chrome may request:

    /.well-known/appspecific/com.chrome.devtools.json

404 is harmless.

### Dashboard no-data state

A channel report can show no rows if the local site has no conversions in the selected date range.

### API 401 for curl without auth

Authenticated dashboard/report endpoints require a Bearer token. A curl request without Authorization can return:

    Missing or invalid Authorization header

This is expected for protected API routes.

### 9. /api/collect missing CORS headers (Fixed in Session 92)
POST /api/collect, /api/conversion, /api/identify were blocked by CORS 
when called from tracker on a different origin (localhost:8080, customer websites).
Fixed by adding /api/collect, /api/conversion, /api/identify to isPixelRoute 
check in both middleware blocks + explicit CORS headers on /api/collect route.
### 4. Journey touchpoints previously excluded organic/direct/AI (FIXED Session 95)
The nightly-attribution.js touchpoints query had `utm_source IS NOT NULL` filter — organic search, direct, referral and AI referral visits were invisible in every user's journey. Fixed in Session 95 by removing the filter and adding referrer + ai_source + derived_source to the query.

### 5. channel column in attributed_conversions was missing (FIXED Session 95)
group_by=channel in attribution API was silently broken — no channel column existed. Fixed in Session 95: added channel + channel_30d columns, channelFromEvent() enhanced with click ID detection, batch job writes channel on every conversion.

### 6. data-quality-check.js was missing (FIXED Session 94)
Crontab ran this file at 3 AM every night — file didn't exist, silently crashing. Fixed in Session 94.

### 7. _st cross-domain system was redundant (FIXED Session 94)
Two conflicting cross-domain systems existed. _st system built in error — removed. __tq_id/__tq_ft system is the correct one, carries full attribution data.

### 8. Meta CAPI sent wrong event names (FIXED Session 97–98)
All conversion types were firing as `Purchase`. META_EVENT_MAP with 16 type mappings added to conversion-sync.js.

### 9. Google Ads CAPI always 401 (FIXED Session 97–98)
Developer token was passed as Bearer token. Fixed: OAuth2 access token read from `google_ads_access_token` site column or `GOOGLE_ADS_ACCESS_TOKEN` env var.

### 10. Nightly attribution models returned silent empty results (FIXED Session 97–98)
U-shaped / W-shaped / Time Decay / Linear models showed blank charts with no explanation. Fixed: `_notice` field returned when empty; UI amber banner explains nightly job timing.

### 11. Duplicate channelFromEvent — AI domains diverged (FIXED Session 97–98)
attribution-engine.js had 14 AI domains; nightly job had 8. Canonical `api/lib/channel-classifier.js` created with 21 domains; both consumers import from it.
**Read-side only — the class was NOT fully closed (see KI-32):** this unification covered the read/attribution consumers; the ingest path (`ai-platform.js`, `proxy.js`) was never part of it and diverged the same way. Fixed 2026-07-21.


## New Known Gaps (Session 140P-RB-FIX-4, not yet fixed)

### country/device/browser
Build dimension support — requires schema columns on `attributed_conversions` (or ClickHouse pageview-join) + nightly job populating them + real multi-value seed data to test against. Post-launch.

### landing_page
Build real landing-page report — first-pageview-per-visitor resolution + backing storage. Post-launch.

## New Known Gaps (Session 128D-B.1, not yet fixed)


### Deferred filter support in Report Builder
The following dimensions are supported as group-by targets in the Report Builder but are deferred as direct filters:
- Browser filter
- Referrer Domain filter
- Landing Page / URL filter
- Custom URL Parameter filter

### Schema-valid source filters vs attribution accuracy
Source shortcut filters are schema-valid and safe, but source/channel value accuracy still depends on backend normalization and real customer data.

## New Known Gaps (Session 98–99, not yet fixed)


### Deployment architecture — two separate Railway services

`sourcetrack.ai` is served by the **dashboard** Railway service:
- Builder: RAILPACK
- Build: `npm run build` (Vite → `dashboard/dist/`)
- Start: `npm run start` = `serve -s dist -l $PORT`
- The `serve` package must be in `dependencies` (not devDependencies) — fixed in this session

`api.srctk.com` (the real ingest host; `api.sourcetrack.ai` does not resolve) is served by the **api** Railway service:
- Builder: NIXPACKS
- Start: `node api/index.js`

The Express API server does **not** serve the dashboard frontend. They are independent deployments.

---

### GSC sitemap "General HTTP error" — root cause: SSL cert

Google Search Console shows "Sitemap could not be read — General HTTP error" for `https://sourcetrack.ai/sitemap.xml`.

**Root cause:** Same SSL cert issue as the browser `NET::ERR_CERT_COMMON_NAME_INVALID`.
The cert served is for `stream.nexus.pizza`, not `sourcetrack.ai`.
Google's crawler follows the same HTTPS rules as a browser — it refuses to fetch over a mismatched cert.

**The sitemap itself is correct.** It is in `dashboard/public/sitemap.xml`, copied to `dist/sitemap.xml` during build, and served as a static file by `serve -s dist`. Once SSL is fixed, Google can read it immediately — resubmit in GSC after fixing.

### SSL Certificate — `NET::ERR_CERT_COMMON_NAME_INVALID` (NOT a code issue)
Certificate shows `stream.nexus.pizza` instead of `sourcetrack.ai`.
This is a Railway custom domain SSL provisioning problem.

**Fix (Railway dashboard only):**
1. Go to Railway → your Dashboard service → Settings → Domains
2. Remove the `sourcetrack.ai` custom domain entry
3. Re-add it: add `sourcetrack.ai` and `www.sourcetrack.ai`
4. Railway will provision a Let's Encrypt cert automatically (takes ~1 min)
5. Verify DNS CNAME: `sourcetrack.ai CNAME <your-project>.up.railway.app`
6. If using Cloudflare: set SSL mode to "Full (Strict)" not "Flexible"

**Root cause:** Railway uses SNI to serve the right SSL cert. If the custom domain
was added before DNS propagated, or the cert wasn't re-issued after a domain
name change, Railway continues serving its default `*.up.railway.app` cert.

## New Known Gaps (Session 97–98, not yet fixed)

### OG image missing
`/og-image.png` is referenced in `dashboard/index.html` and `Landing.jsx` but does not exist yet.
Action: create a 1200×630 image and deploy to `https://sourcetrack.ai/og-image.png`.

### Landing page is CSR — social link previews may not render
The landing page is a React SPA. Helmet adds meta tags but social crawlers (Slack, iMessage, WhatsApp) don't execute JS. OG preview images and descriptions may not show when sharing the URL.
Action: evaluate SSR (Next.js/Astro) for the marketing landing page post-launch.

### annotations migration (20260519000005) — custom_properties IS present (corrected 2026-07-18)
CORRECTION: a direct prod↔staging column diff (2026-07-18) confirms **`custom_properties` EXISTS on
`attributed_conversions` in BOTH environments** (jsonb, nullable). The earlier claim that
`20260519000005` was "unapplied" / that `custom_properties` "does not exist" does **NOT** hold at the
schema level — that column is applied in both.
- NOT covered by that diff (still open — verify before relying on them): whether `attribution_window_days`
  exists on `sites` in both envs, and the annotations-API 503 path. Do not assume these are resolved.

### Per-conversion explain is single-touch-only
Step-by-step explanations (via `/api/attribution/explain` and the Conversion Explanation Modal) are designed and supported for single-touch models only (`first_touch`, `last_touch`, `first_touch_non_direct`, `last_touch_non_direct`, `ai_platforms`).
Advanced multi-touch models (`linear`, `time_decay`, `u_shaped`, `w_shaped`) are designed for aggregate attribution reporting, and querying `/api/attribution/explain` for them will return a clean explanation object indicating this limitation rather than raising errors or crashing.

## D1c-1 — route_ab_diff A/B coverage retired for the Tinybird-sole engine legs (2026-07-18)

D1c-1 flipped the 13 category-A attribution-engine legs to Tinybird-sole: a null pipe now throws the loud `[tinybird-force-read]` invariant instead of falling back to the dead-store read path (§6 — no dead-store zeros).

As a consequence, the 5 real-target A/B self-test blocks in `tinybird/tools/__tests__/route_ab_diff.test.mjs` — touch-model, multitouch, session-report, session-report cache-trap, and explain — were removed. Those blocks drove the real engine targets through the harness's OFF (dead-store) leg to compare pipe-vs-dead-store. With that leg gone, there is no OFF leg to compare against, so those targets can no longer be A/B'd.

**What this means:**
- Pipe-vs-dead-store parity for these legs was certified POINT-IN-TIME before the flip (the §5 prod-serving gate: all 13 pipes confirmed serving) and is **no longer continuously harness-enforced**.
- ~~The `route_ab_diff` harness LOGIC is still covered by the stub-driven self-tests.~~ **SUPERSEDED (D3, this PR):** `route_ab_diff.mjs` + its self-test are now **DELETED**; the still-needed `buildRouteArgs`/`ROUTE_ARG_DEFAULTS` were extracted verbatim to `tinybird/tools/route-args.mjs` (the `route-args-matrix.test.js` CI gate imports it). See the D3 entry below.
- Fail-closed behavior for these legs is now enforced by the dedicated `*-read-cutover` / `*-parity` suites (a null pipe MUST throw), not by A/B parity.

**Re-establish if needed:** once D1c-2 lands the `attribution_explain_journey` pipe and D3 removes the dead read layer, no OFF leg exists anywhere — cross-store A/B is retired by design. Any future parity concern becomes a pipe-vs-pipe or pipe-vs-expected-fixture check.

### D3 SCOPE — the qa:attribution harness (82 tests) must not vanish silently
The `qa:attribution` harness (`scripts/qa-attribution-harness.mjs` + `qa-attribution-integration.mjs`, ~82 tests) is **not in the CI gate** (ci.yml runs `qa:attribution:unit`, not this harness) and is currently **unrunnable locally** without `POSTHOG_API_KEY` — it `import`s `attribution-engine.js`, which transitively constructs the PostHog client at module load. When **D3 deletes `posthog.js`**, that import chain changes and this 82-test suite is at risk of becoming permanently unrunnable / silently dead.

**D3 must explicitly do ONE of:** (a) port the harness off PostHog (drive it purely through the injectable read seam / fixtures, no PostHog client at load), or (b) formally retire it with a recorded rationale. An 82-test attribution suite must not disappear as a side effect of the decommission — decide, don't drop. (Surfaced during D1c-1 test accounting, 2026-07-18.)

**RESOLVED (D3, this PR):** neither port nor retire was needed — deleting `posthog.js` removed the transitive PostHog-client construction from `attribution-engine.js`, so `qa-attribution-harness.mjs` (the pure `calculateAttribution` math) now RUNS again: **6/6 green** ("ALL TESTS PASSED"). The harness is UNbroken, not lost. Its `qa-attribution-integration.mjs` half still needs a `SOURCETRACK_SITE_KEY` staging fixture (operator-provided, §0) to run — unrelated to PostHog. Not yet CI-gated; wiring it in is a possible separate follow-up once the integration half has a fixture.

### All Leads page — 4 page-local defects (2026-07-18) — RESOLVED, with one deferred item
All four were `GET /leads` bugs where a **page-limited** result (`leads_list`, LIMIT 100) was treated as the whole dataset (the table sorts LAST SEEN desc, so converters past row 100 were invisible to every page-local computation). Ground truth (prod Supabase `attributed_conversions`, techrupt.pk): **4 distinct converters, 4 rows, $999.99**, cross-validated with Analytics.

**Fixed (post-D3, code-only, no Tinybird pipe deploy):** `total`, `total_conversions`, and `total_revenue` now come from **one Supabase `attributed_conversions` aggregate over the full window** (the §5 source of truth for conversions & revenue — the same source Analytics uses), replacing the page `reduce()`. One query keeps the three internally consistent (converters ≤ conversions). Effects:
1. ✅ `total_conversions` — full-window count, no longer a page reduce.
2. ✅ Label mismatch — the table subtitle now shows its OWN row count ("N shown" / "Showing the 100 most recent"); the "Total Leads" tile stays as the separately-labeled distinct-converter KPI.
4. ✅ `total_revenue` / "No revenue in this period" banner — full-window revenue, so the banner no longer fires while the site has revenue beyond the page.

**Deferred — real server-side search (defect 3):** `leads_list` has **no search param** and the route still filters client-side over the ≤100 loaded rows. A real server-side search needs a `leads_list` **pipe change = founder-gated prod deploy**, so it was NOT done. Instead the empty state was **relabelled** (code-only) so it can no longer claim a visitor doesn't exist ("No matches … in the leads loaded for this range … widen the date range"). A true server-side search param remains open (needs the pipe deploy).

**`leads_count` pipe now unused:** the totals no longer read the `leads_count` Tinybird pipe (superseded by the Supabase aggregate). The pipe is still deployed but has no caller — safe to leave; delete only via a founder-gated pipe change if desired.

**Superseded ground-truth note:** earlier speculation that `leads_count` ignored `date_from_ts` (a deploy-drift) was **disproved** — `leads_count=4` was correct all along.

**Fixed in:** the leads full-window totals PR (frontend `Leads.jsx` + `api/routes/leads-server.js`; tests `leads-totals-full-window.test.js` + updated `leads-server-read-cutover.test.js`).

## D3 — PostHog read layer deleted; cross-store HogQL diffing retired (2026-07-18)

D3 deleted `api/lib/posthog.js` and every importer. `queryHogQL` has zero functional callers; the inert route/lib seams are gone; the write-dead `ph` client was unwired from `api/index.js`. A source-text guard (`api/tests/no-posthog-import.test.js`, in CI-gated `qa:identity:unit`) blocks any file under `api/lib`/`api/routes`/`api/jobs` from re-importing the deleted module.

**Retired tooling (coupled to the dead read layer / no HogQL OFF leg):**
- `route_ab_diff.mjs` + its self-test — the pipe-vs-HogQL A/B harness. `buildRouteArgs`/`ROUTE_ARG_DEFAULTS` (still used by the `route-args-matrix.test.js` CI gate) were extracted verbatim to `tinybird/tools/route-args.mjs`.
- `phase4_touchpoint_diff.js`, `run_phase4_diff.mjs`, `phase4_replay_verify.mjs` — the Phase-9 cross-store parity drivers. The 5 model-credit functions (`creditFirstTouch`, `creditFirstTouchNonDirect`, `creditLastTouchNonDirect`, `aggregateModelCredits`, `compareAggregateBuckets`) + their pure helper closure were extracted verbatim to `tinybird/tools/attribution-credit-math.js` (posthog-free), keeping `phase9-agg-models.test.js` green.
- Dead cross-store QA scripts `qa-dedupe-regression.mjs`, `qa-referrer-domain-reporting.mjs` deleted. Fixture seeders `seed-duplicate-conversion.mjs` / `seed-multitouch-carrier.mjs` severed to Tinybird-only (still function end-to-end).

**Accepted gap (recorded, not a regression):** cross-store HogQL diffing is **retired** — there is no PostHog OFF leg to diff against anymore. The **model credit math itself remains covered** by `phase9-agg-models.test.js` (against `attribution-credit-math.js`). What is lost is only the ability to diff `last_touch` and `ai_platforms` (Phase 9 was incomplete for those two — they ship to prod without a cross-store validation harness). Any future parity concern is pipe-vs-pipe or pipe-vs-expected-fixture, not pipe-vs-HogQL.

**Recovery** (all deleted files exist at the pre-D3 commit `8435504`, until PostHog data is decommissioned in D5):
`git show 8435504:api/lib/posthog.js` · `git show 8435504:tinybird/tools/route_ab_diff.mjs` · `git show 8435504:tinybird/tools/phase4_touchpoint_diff.js` · `git show 8435504:tinybird/tools/run_phase4_diff.mjs` · `git show 8435504:tinybird/qa/phase4_replay_verify.mjs` · `git show 8435504:scripts/qa-dedupe-regression.mjs` · `git show 8435504:scripts/qa-referrer-domain-reporting.mjs`

### CI false-green: `scripts/` is not exercised by any test suite (2026-07-18)
D3 deleted `api/lib/posthog.js` and `tinybird/tools/phase4_touchpoint_diff.js`, yet two stale PRs still read as green:
- **#167** (`scripts/bench-live-vs-nightly.mjs`) imports the deleted `api/lib/posthog.js` — it would crash on run, but **no CI suite imports or executes anything under `scripts/`**, so `build-and-test` stays green. A broken import in `scripts/` is a **false green**.
- **#133** adds a test importing the deleted `phase4_touchpoint_diff.js`; its green CI is stale (it ran pre-D3, and PR CI is not re-run against current `main` until rebased). Green on an old base ≠ green on `main`.

Consider a lightweight guard: `node --check` / import-smoke over `scripts/*.mjs` in CI, or a `grep -rl 'lib/posthog.js' scripts/ tinybird/tools/` tripwire. Green CI on a broken import is a false signal. (Surfaced triaging #133/#167.)

### Migration-ledger divergence (prod ↔ staging) — repair DEFERRED until CI secrets are fixed (2026-07-18)
The two Supabase `supabase_migrations.schema_migrations` ledgers have diverged: **identical migrations carry different version numbers per environment**, and **prod's ledger is stale since `20260713081319`** — even though four migrations were hand-applied to prod today (2026-07-18). The ledger no longer reflects what is actually applied. No open PR addresses this (schema/baseline capture ≠ ledger repair; #190 does not fix it).

🔴 **Do NOT start the repair yet:** `STAGING_DB_URL` currently resolves to PROD (see #293), so a ledger write intended for "staging" could hit prod. Scope the `schema_migrations` reconciliation only **after** the CI-secret repoint is verified to point at `nrsvpwzekfrdrzkoecfk`. (Surfaced 2026-07-18.)

### Weekly email reports have NEVER sent in production (2026-07-19)

`job_runs` (prod): **226 runs of `email-reports-weekly`, 2026-06-28 → 2026-07-19, every one `status='success'`, every one `error_message='Sent 0, skipped 4, errors 0'`. Zero sends, ever.** `usage_email_log` is empty (0 rows). Verified by direct read-only query against prod Supabase (`zxjjjsipafojhzkkumvh`), not agent-reported.

Four separate defects:

1. **Untested customer-facing path (launch blocker).** No weekly attribution report has ever been delivered. Prod has 4 sites — 2 free, 1 trial stale since 2026-06-26, 1 founder-owned (techrupt.pk) — so "skipped 4" is likely CORRECT behaviour, not a failure. But the send path has never executed end-to-end. First real customer = first live test.

2. **Honest-reporting defect.** 226 no-op runs recorded as `success`. A genuine send failure would be indistinguishable from today's output. Same failure class `computeTerminalStatus` was built to prevent on the nightly (`suspectEmpty` → `failed`); the email job has no equivalent guard.

3. **`sourcetrack-email` cron never ran the job at all.** Railway Start Command is null → falls back to `npm start` → `api/bootstrap.js` → boots the Express API, not `api/jobs/email-reports.js`. Independent of commit `227b5cf` (2026-07-07), which added the `ST_MANAGED_PROXY_TARGET` fatal check and merely converted a silent no-op into a loud crash. Check the other cron services for the same missing Start Command.

4. **A weekly job runs ~11x/day.** Frequency correlates with deploys, so something invokes it outside its cron. With `usage_email_log` empty, the dedup guard is unproven — a real customer could receive one email per deploy. Root-cause the invocation source before onboarding anyone.

Not a migration item. Logged because #1 is a launch blocker of the same class as the money rail, and #2 is the exact "green means nothing happened" pattern this project has been eliminating elsewhere.

### D5 has a hard ordering dependency on THREE backend boot guards (2026-07-19)
Stripping `POSTHOG_*` from Railway (D5) is not safe on its own — three separate boot/runtime guards still read those vars, and each turns a missing var into a hard failure. A code scan (2026-07-19) found these were all hidden inside the single D2 "Jobs off PostHog" row:

1. **`api/index.js` REQUIRED_ENV** hard-exited the API on missing `POSTHOG_HOST`/`POSTHOG_API_KEY` → D5 would have failed **all six services** on boot. ✅ **FIXED (this PR)** — the two vars are removed from REQUIRED_ENV and a spawn-based boot test (`api/tests/boot-without-posthog-env.test.js`) guards it. This was the silent blocker.
2. **`api/jobs/nightly-attribution.js:175`** still refuses to boot without `POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID`, because `queryPostHog` and its three fallback sites (`:511`, `:617`, `:773`) still use them. This guard **must stay until D2·B3** removes those readers — removing the guard first turns a config error into a runtime crash on a money-rail path. **Still open.**
3. **`api/jobs/health-agent.js:213`** required four `POSTHOG_*` vars, and its `:137`/`:182` checks fetched PostHog directly. ✅ **FIXED (D2·health-agent PR)** — the `posthog` liveness check is deleted (+ removed from `CRITICAL_CHECKS`), `data_flow` reads Tinybird instead of PostHog, and `env_vars` no longer requires any `POSTHOG_*`. See the updated entry below.

**Net ordering constraint: D5 now cannot run until only D2·B3 (nightly) is resolved.** The boot-guard (item 1) and health-agent (item 3) are both cleared; item 2 (nightly's `:175` guard, gated on B3) is the last remaining blocker.

### health-agent taken off PostHog — RESOLVED, with a documented data_flow semantic change (2026-07-19)
`api/jobs/health-agent.js` previously had two direct HogQL fetches — `:137` (`SELECT 1` liveness) and `:182` (`count()` of `$pageview` in the last 24h) — plus an env check requiring `POSTHOG_API_KEY`/`POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID`/`POSTHOG_HOST`. Because `posthog` ∈ `CRITICAL_CHECKS`, once PostHog was decommissioned (D5) that check would have gone **critical/🔴 on every run forever**. **Fixed (D2·health-agent PR):**

- **Check 2 `posthog` (liveness) — DELETED** and removed from `CRITICAL_CHECKS`. It probed a store being decommissioned; there is nothing to be reachable, so nothing to replace.
- **Check 6 `data_flow` — re-pointed off HogQL onto Tinybird.** It now reads the `events_health_day` pipe, fanned out over the same site set the nightly uses (`nightly-attribution.js:218-227`: plan NOT IN (free,inactive,archived) AND (last_seen_at ≥ 7d ago OR NULL)). Status strings: all sites 0 → `warning`; any site's pipe read fails (null) → `error`; zero qualifying sites → explicit `skipped` (not a silent pass); otherwise `ok`.
- **Check 8 `env_vars`** no longer requires any `POSTHOG_*` (only `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`).

**⚠️ SEMANTIC CHANGE (intentional, no exact-parity pipe exists):** the old check counted **`$pageview`s in the last 24h, globally**; `data_flow` now counts **ANY tracked event in the last 24h, per site (summed)**. No deployed pipe matches the old semantics exactly — `events_health_day` counts any event over 24h; `doctor_pageviews_30d` counts pageviews but over 30d. `events_health_day` was chosen (any-event/24h is the closer canary) and the change is documented in the code (`evaluateDataFlow` header). **Restoring exact "pageviews-only, 24h, global" parity requires authoring a new pipe = a founder-gated Tinybird deploy** — deliberately not done here. The per-site fan-out is negligible today (prod has ~1 qualifying site).

### Tinybird READ path now retries transient failures (2026-07-19)
`queryTinybirdPipe` (`api/lib/tinybird-read.js`) previously did ONE bare `fetch` and returned `null` on the first failure — zero retry (the write/ingest path already retried via `transport.js` `withRetry`, but that is a different path/token and does not cover reads). It now retries **429 / HTTP ≥ 500 / network throw / timeout (AbortError)** up to **3 attempts total**, backoff = Retry-After header seconds if present else `min(60s, 2000 · 2^attempt)`, with a fresh 15s `AbortController` per attempt. Deterministic failures are NOT retried (flag-off / not-allowlisted / missing-config / any non-429 4xx). **The return contract is unchanged and purely additive:** `[]` for a served-empty result, `null` after retries are exhausted, never throws — so none of the 16 consumers (12 routes, 2 jobs, 2 lib helpers) change behavior. This landed as **B3 step 1**, a prerequisite for making the nightly fail-closed on a null pipe read (steps 2–4): fail-closed without retry would trade silent-wrong for flaky-loud — a single 429/transient 5xx would fail a whole run. (No pre-existing KNOWN_ISSUES entry described this gap; it was added here.)

### Nightly conversions reads now FAIL CLOSED on a null pipe (2026-07-19)
**B3 step 2.** The defect: a site whose conversions read returned null (`fellBack`) fell through to `queryPostHog`; post-D3 the dead PostHog store returns `[]` with no throw → `{ processed:0, failed:0, queryFailed:false }` → the site was absorbed as an **empty day**, and the run reported **SUCCESS** if any other site served. A failed read was indistinguishable from a site with no conversions — on the money rail. Now (safe because step 1 added retry, so a null = "failed after 3 attempts"):
- **`processSite`** (cron normal path, reads enabled): a null pipe returns `{ processed:0, failed:0, fetched:0, queryFailed:true, served:false, fellBack:true }` and does **NOT** call `queryPostHog`. `queryFailed` → `totalHardFailures` → `computeTerminalStatus` **'failed'**, **without throwing** (per-site isolation — the other sites still process). **Short-circuit:** no conversions were fetched, so the per-conversion touchpoint reads are never reached for a failed site.
- **`fetchBackfillConversions`** (manual `--backfill-site`): a null pipe **throws** → `runBackfill`'s existing terminal catch exits non-zero. Backfill is single-site and does **NOT** reach `totalHardFailures` (separate path, no worker loop, no `job_runs` row) — so no new machinery was invented; it reuses the existing exit-on-throw.
- A served-empty **`[]`** is still a **successful empty day** (`served:true, queryFailed:false`) — that distinction is preserved and explicitly tested.
- The reads-**DISABLED** path (`!TINYBIRD_READ_ENABLED`, not reprocess) still uses `queryPostHog` — that's the legitimate pre-cutover leg.

### Nightly touchpoints read now FAILS CLOSED + fellBack is surfaced (2026-07-19)
**B3 step 3.** *Half A:* the touchpoints read in `processConversion` previously fell to `queryPostHog` on a null pipe; on a throw it set `touchpointRows=[]` and **continued**, writing the conversion with `touchpoint_count:0` — afterwards **indistinguishable** from a genuine no-touchpoint conversion (no column records read provenance; Q4b). That is silent **mis-attribution**, worse than a missing row. Now a null touchpoints pipe **THROWS**, which lands in `processSite`'s per-conversion `try/catch` (`nightly-attribution.js` write loop) → the conversion is **SKIPPED** (`failed++`, nothing written) instead of written wrong. A **served-empty `[]`** is a genuine no-touchpoint conversion and is still **written normally** (`touchpoint_count:0`) — that distinction is preserved and regression-guarded. The reads-**DISABLED** path keeps `queryPostHog` (pre-cutover leg; step 4 deletes it). *Half B:* `fellBack` (a site whose conversions pipe returned null) was set but never read by the worker loop — now it is counted (`totalFellBack`), logged per-site, added to the run summary, and embedded in `job_runs.error_message` via `computeRunErrorMessage`. It is **informational only** — `queryFailed` still drives terminal status; `fellBack` did not change status semantics.

### Nightly is now Tinybird-sole; reads-disabled refuses to start (2026-07-19)
**B3 step 4 (final).** `queryPostHog` and all three fallback legs (conversions, touchpoints, backfill) are DELETED, along with the `POSTHOG_*` module consts + the two POSTHOG vars in the boot env-guard. The nightly reads Tinybird only; PostHog is fully off the runtime path (this cleared the last of D5's three boot guards → **D5 is unblocked**). **Reads-disabled decision (chosen: refuse to start):** post-decommission there is no fallback read path, so `main()` now throws a clear error and refuses to start when `TINYBIRD_READ_ENABLED` is off — before the backfill dispatch and the run lock, covering both cron and `--backfill-site`. This was chosen over "hard-fail per-site" because a globally-disabled read is always a misconfiguration (every site would fail identically), and one loud boot error is less surprising than a run that writes a `running` row, processes N sites all failing, and reports `failed`. Belt-and-suspenders: each read leg also throws a `no … read path` invariant, so no path can silently no-op even on a direct call. (Prod does not set `TINYBIRD_FORCE_READ`, so this is the path that would bite during a real incident.)

### Circuit-breaker gap: a per-site touchpoints outage still runs unbounded (2026-07-19, reported not built)
B3 step 3 bounds a failed **conversions** read (it short-circuits the whole site) but NOT a failed **touchpoints** read: if a site's conversions read SUCCEEDS but the `pageviews_by_visitors` pipe is down, **every** conversion retries 3× (~51s) before throwing and being skipped. At ~210 conversions that is ~3h for one site — which collides with the no-kill-ceiling hazard below (exceed 6h → lock expires → next cron overlaps). **A per-site circuit breaker would go in `processSite`'s per-conversion loop:** track consecutive touchpoint-read failures for the current site; after N in a row, stop processing that site (mark it failed, break the loop) instead of retrying every remaining conversion. **What it must NOT break:** the served-empty distinction — a `[]` from the touchpoints pipe is a *successful* read (a genuine no-touchpoint conversion, written normally) and must **reset/not increment** the breaker; only the null→throw *read failure* counts. That requires the touchpoints null-throw to carry a distinguishing marker so the loop's catch increments the breaker for touchpoint-read failures only (not for upsert/other per-conversion errors), and resets on any success. **Not built here** — reported for a follow-up.

### 🔴 Money-rail concurrency hazard: no kill ceiling on the nightly (2026-07-19, surfaced by B3)
The nightly has **no wall-clock timeout**. `LOCK_TTL_HOURS` (`nightly-attribution.js:189`) is a **start-time guard** — a new run refuses to start only if the prior run is still `status='running'` **and** started **< 6h ago**. Nothing **kills** a long run, and there is no `railway.json`/`railway.toml` in the repo defining a cron timeout. So a degraded run (B3's retry work makes a single pipe call cost up to ~51s worst-case) can **exceed 6h → the lock expires → the next cron STARTS while the first is still running → two nightlies write `attributed_conversions` concurrently.** Both use `upsert(onConflict: site_id,conversion_event_id)`, so exact dupes collapse, but concurrent reprocess/delete + interleaved writes on the money rail are unverified and unsafe. B3 step 3's per-conversion skip bounds a fully-degraded **run** better than before (a failed conversions read short-circuits a whole site; a failed touchpoints read skips one conversion in ~51s), but the ceiling itself is **unfixed**. A real fix needs an explicit run deadline (abort + mark failed) or a lock that does not expire mid-run.

### No product analytics on SourceTrack's own dashboard (2026-07-19, D4)
D4 deleted `dashboard/src/lib/posthog.js` + the `posthog-js` dependency. That library was **SourceTrack's own product analytics on its dashboard** — `posthog.init(..., { capture_pageview: 'history_change', autocapture: true })` auto-captured pageviews and UI interactions of the people using the SourceTrack dashboard (our team + customers). **Capability lost:** visibility into how the dashboard is actually used — which pages/features get traffic, funnels, drop-off — at the moment of customer onboarding. **What replaces it:** nothing; PostHog is being fully decommissioned, and no replacement product-analytics tool is wired in. This is a **product decision, not just a migration detail** — SourceTrack is going blind on its own dashboard usage.

**Mitigating fact (why this is not a live regression):** the analytics was **already dark in prod before this PR** — `VITE_POSTHOG_*` was stripped from Railway in D4-env, and `initPostHog()` no-ops without `VITE_POSTHOG_API_KEY` (`if (!apiKey) return`). So D4-code deletes **dormant** code; nothing that was running in prod stopped running. The capability was effectively lost at D4-env; this entry records it so the gap is not silently forgotten. If dashboard usage analytics is wanted later, it needs a fresh, privacy-reviewed integration (first-party, no third-party cookies — consistent with the product's own cookieless stance).

### ✅ RESOLVED — PostHog legal copy gate cleared: project 416017 is DELETED (opened 2026-07-19, closed 2026-07-19, D5)
**CLOSED.** The gate was: could customer data still reside in PostHog? **Answer: no — PostHog project 416017 is confirmed DELETED** (the orchestrator's MCP token that previously returned `403 — API key does not have access to project 416017` now returns `404 — Project not found`; 2026-07-19). D5's env half is also done (POSTHOG_*/VITE_POSTHOG_* stripped from Railway, 12/12 zero matches, all 6 services redeployed, prod boot clean off Tinybird). So the gated edits were applied: PostHog **removed** from `Subprocessors.jsx`, and the now-false `Settings.jsx:1393` retention disclosure **removed** (no residual PostHog events exist to disclose). `Settings.jsx:1394` (paid-beta blocker) left for a founder call. A `Settings.jsx:1207` visitor-erasure correction shipped in #313. **PostHog is fully decommissioned — code, env, and project.** Original gate context retained below for the record:

Historical state (now moot): PostHog was fully off the code path (no read/write, dependency + frontend client removed) but the **historical customer data was believed to still RESIDE in the PostHog project** — the repo had **no PostHog data-deletion job or runbook**, and `COMMANDCODE_RUNBOOK.md:441/453` stated historical events were **not** bulk-deleted and retention "must be verified in the provider console." Until the founder confirmed project deletion:
- **`dashboard/src/pages/Subprocessors.jsx:22`** (`['PostHog', 'Product/event analytics (read layer)', 'US']`) is **LEFT IN PLACE.** Removing a sub-processor entry claims customer data no longer resides there; if data still sits in PostHog, that claim is false — worse than leaving it. Prepared removal: delete that one array row. **Apply only after project-deletion is confirmed.**
- **`Settings.jsx:1393`** ("Deleting your account does NOT delete historical raw analytics events already sent to … PostHog") is **LEFT IN PLACE** — it is a *true* retention disclosure while the data exists.
- **`Settings.jsx:1394`** ("Paid Beta Blocker: … PostHog retention/deletion handling") is **LEFT IN PLACE** — a founder business/legal status call.
- **`Settings.jsx:1207`** (visitor-erasure copy) WAS corrected: it claimed a PostHog deletion request that the code provably removed (erasure now targets Tinybird — `gdpr.js`, `tinybird/adapter/erase.js`, `gdpr-tinybird-erasure.test.js`); the correction preserved the exact hedged strength. **Legal note flagged, not drafted:** 1207 no longer mentions PostHog, so a visitor's residual *historical* PostHog events are not disclosed there — whether to disclose that is a human legal decision.
- **No CI guard covers customer-facing PostHog *string* mentions** (the `no-posthog-dashboard-import` guard only catches `import`s). A blanket "no 'PostHog' string" guard would be WRONG today — the retention/sub-processor copy above references PostHog *legitimately* while the data resides there. A string guard can only be added once the legal copy is finalized post-deletion.

### GDPR account-deletion: Tinybird erasure is admin-token-gated but the sites row is hard-deleted regardless (2026-07-19, log-only)
`api/routes/gdpr.js:359-363` erases each site's events from Tinybird (`_eraseSite`, `confirm:true`) **before** `sites.delete()` (`:371`) — but the eraser is **admin-token-gated**: with no `TINYBIRD_ADMIN_TOKEN` it returns `skipped_no_admin_token` and does nothing, while the sites row is hard-deleted anyway. Result on that branch: **account deleted, events retained, no error surfaced** — a silent GDPR gap. `TINYBIRD_ADMIN_TOKEN` **is** currently set on prod (verified), so the gate is not tripped today, and **this delete path has never executed in prod** (0 real account deletions). It should **fail loudly** (abort/flag) rather than skip-then-delete. Not fixed — logged.

### Site hard-delete outside gdpr.js skips Tinybird erasure entirely; no soft-delete trace (2026-07-19, log-only)
The only app path that erases Tinybird on delete is `gdpr.js`. **Any other site hard-delete — direct SQL, an admin console action, a future route — deletes the `sites` row without erasing the site's Tinybird events.** There is **no soft-delete column on `sites`** (deletion is a hard row delete; nightly auto-archive only sets `plan='archived'`), so **no trace remains** to reconcile orphaned events against. Not fixed — logged.

### events datasource accepts any present site_id with no sites-existence check (2026-07-19, log-only)
`tinybird/adapter/normalize.js:224` validates only that `site_id` is **present/non-empty** ("refusing to assign a default tenant") — it never checks the id **exists in `sites`**, and `events.datasource` (ClickHouse `MergeTree`) has no FK. **Not exploitable via the routes** — `/api/track`, `/api/pixel`, `/proxy/{e,c}` all resolve `site_id` server-side from a `site_key → sites` lookup (unknown key → 401/no-write; client `properties.site_id` lands in `custom_properties`, not top-level), so an arbitrary UUID cannot be injected there. But it is a **missing defence-in-depth guard** at the write boundary: any non-route writer (a script, `tb` CLI, cutover smoke-test) can write an unchecked `site_id`. **One orphan event exists in prod Tinybird for `site_id 79638a99-3500-4357-9e61-7c356cba1957`** (no `sites` row; timestamp = the dual-write cutover moment `2026-07-07 10:30:00.000`; UUID not in the repo) — almost certainly a cutover smoke-test write. **Read isolation holds** (82 read pipes require `site_id`; reads scope to the authenticated `req.site.id`, so it can never surface in a customer dashboard). **Leave the row; log the gap.** Not fixed.
