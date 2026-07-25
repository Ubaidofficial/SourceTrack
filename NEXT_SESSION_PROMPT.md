# Next Session — Status as of 2026-07-25, head 422a31a

## KI-62 (refund attribution inheritance): FULLY CLOSED
All 3 steps done and verified in prod: stamp (prior session) → prod Tinybird
deploy #22 → PR #403 (nightly-attribution.js inheritance logic, merged, deployed).
No longer the top priority. Do not re-open unless a real regression surfaces.

## What shipped this session (9 PRs + 1 prod Tinybird deploy, all merged & deployed)

| # | What | Why it mattered |
|---|---|---|
| Tinybird #22 | KI-62 Step A: original_conversion_event_id column, prod | Unblocked #403 |
| #403 | KI-62 Step C: refund attribution inheritance | Refunds now inherit real source instead of Direct |
| #404 | Removed 4 seeded reports using GATED_METRICS metrics | Fixed broken canned reports on signup (ecommerce, saas, leadgen) |
| #405 | Removed 5th dead seed (date dim, PREAGG_DIMS gap) | Same class, different cause |
| #406 | week/year granularity, 2 live readers (ai_platforms, multi-touch) | Fixed silent daily-bucket collapse — additive only |
| #407 | granularity in getSessionReport (Tier 2) | Same bug, 4 sites not 2, all 9 models — fixed month/quarter too (deliberately not additive) |
| #408 | shared flexibleReportCacheKey() builder | Pure dedup, closed the same cache-key hazard #407 fixed elsewhere |
| #409 | campaigns.js model guard | Closed a LIVE fabrication-risk gap — API accepted model=linear/ai_platforms/etc and returned conversion counts mislabeled as sessions |
| #410 | cookieless_mode routed through API, not direct Supabase | Prod RLS silently dropped the write — UI said "enabled", nothing persisted |
| #411 | site name/domain routed through API, not direct Supabase | Same RLS gap as #410, worse (no error check at all on either branch) |

## Pattern found TWICE this session, now fully closed for Settings.jsx — but check the rest of the dashboard
Direct `supabase.from(...).update(...)` calls from dashboard frontend code bypass
the Express API's auth/validation/plan-gating AND are vulnerable to a specific
silent-failure mode: if RLS is enabled with only a SELECT policy (no UPDATE
policy) but the `authenticated` role still holds the UPDATE grant, Postgres does
NOT reject the write — RLS just filters the row out, PostgREST reports "0 rows"
as success, supabase-js returns `error: null`. The UI reports success; nothing
persists. Confirmed FUNCTIONALLY on prod (not just policy inference) via EXPLAIN
with role impersonation: `Update on sites -> Result -> One-Time Filter: false` —
the planner statically proves zero rows are updatable.
Found on cookieless_mode (#410) and name/domain (#411), both on `sites`. Every
known direct-write instance in Settings.jsx is now fixed. **Recommend: grep the
REST of dashboard/src for any other direct `supabase.from(...).update(` calls
(other pages, other tables) before assuming this class of bug is fully closed
project-wide.**

## New, separate finding from #411 — worth knowing, not urgent
`sites_normalized_domain_uniq` is a GLOBAL unique index (not per-tenant) on
normalized domain. A user entering a domain another tenant already holds is
reachable user input — previously an opaque 500, now a clean 400 ("That domain
is already registered to another site."). This is existing, correct DB behavior,
not a new hole — #411 only improved the error message. The deeper question (can
someone claim a domain they don't actually own/control?) is a domain-verification
question orthogonal to this fix, not solved here, not urgent, just worth knowing
it exists.
Also confirmed: `sites_free_tier_abuse_guards` trigger (BEFORE INSERT OR UPDATE)
already covers UPDATE, reads `paas_subdomain_blocklist` — the DB is the
authority here, NOT the client-side `PAAS_SUFFIXES` array in Settings.jsx (which
is now a UX pre-check only; if it drifts from the blocklist table, the DB fails
cleanly with a 400 instead of an opaque 500, thanks to #411's error mapping).

## Item 14 (sessions/conversion_rate): DOWNGRADED FROM URGENT TO BACKLOG
Root cause confirmed (attribution-engine.js's multi-touch/ai_platforms live
readers mislabel conversion counts as sessions for any non-revenue/conversions
metric) but the ONLY live exposure was api/routes/campaigns.js, already fixed by
 #409. Confirmed via investigation, verified twice independently (once via direct
code read, once via Antigravity after a re-run requiring visible tool-call
evidence):
- attribution.js and export.js both call gatedReportReason() BEFORE
  getFlexibleReport(), and GATED_METRICS already includes 'sessions' — already
  protected, not exposed.
- The internal multiTouchAttributionHelper hardcodes metric:'revenue' — not
  exposed either.
No other route is exposed. Safe to deprioritize. The actual feature build (teach
the live readers to count distinct visitors, then reconsider un-gating
sessions/conversion_rate) remains real but non-urgent, multi-step.

## `date` for pre-agg — STILL NO BACKEND, STILL THE BIGGEST OPEN ITEM
first/last-touch × date: real gap, needs granularity+attributeBy threaded through
getPreAggregatedAttribution (the data's already in the SELECT, just needs 2 new
params). Multi-touch × date: STRUCTURAL — the stored touchpoint object never
captures conversion date, only touchpoint timestamp (wrong clock, deliberately
excluded as a dim per NON_DIM_TOUCH_KEYS). PREAGG_DIMS is a single shared
contract pinned by multitouch-preagg-dims.test.js to BOTH reader families — must
be split per-family before any real fix. Multi-touch fix would need a write-path
schema change — do not attempt without a deliberate decision.

## tz-aware date bucketing — DEFERRED 3 TIMES NOW (twice this session, once historically per KNOWN_ISSUES.md #12)
getMultiTouchAttributionLive, getSessionReport, getAiPlatformAttributionLive all
bucket dates in UTC while the surrounding pipeline is tz-aware. Fixing this would
silently move existing month/quarter numbers for every non-UTC site. Needs its
own blast-radius decision, not a bundled fix.

## Item 2 (API-key UI): CONFIRMED ALREADY BUILT — remove from backlog
The prior "backend exists, no frontend" framing was stale/wrong. Verified via code
read (GET/POST/DELETE routes + full frontend wiring) AND a live browser
click-through via Antigravity (create → list → revoke, zero console/network
errors). Genuinely done. Do not re-dispatch.

## Item 10 (usage caps): NOT STARTED — next real feature item
Sites/seats/conversions advertised but not enforced. plan-features.js and
site-limits.js exist as the likely home. Check for Settings.jsx collision with
any future UI work before parallelizing with anything else touching that file.

## Onboarding — one real bug, plus an old audited backlog never actioned

**Priority pick for next session, if picking one:** the account-vs-site gate bug
below — it's the most recent, most concretely scoped, and has a clear owner-
flagged fix shape.

**Onboarding gate checks the SELECTED SITE, not the ACCOUNT** (logged
2026-07-23, still open). Confirmed directly against `onboarding.js:63-67`
(`resolveDashboardSite()`): it prioritizes whatever site was explicitly
requested via `site_key`/`site_id`; if that site is incomplete but the account
has OTHER fully-onboarded sites, the user can get pushed back into onboarding
they already finished. Deliberately deferred out of `#366` (which fixed a
different, related bug — silent site-substitution). Per the log: "a correct
fix is an auth-gate refactor (account-level onboarding state)... not a
one-line change." Needs its own scheduled pass, not a quick patch — start
with an investigation dispatch (same pattern as tonight's Item 14/date-gap
work) to scope the actual refactor before writing code.

**Older, audited-but-never-built backlog** (from a prior session's onboarding
audit — states below reflect what's ACTUALLY built, not the design spec's
aspiration):
- CSP-block detection: confirmed hard. Current "Browser Connection Check"
  pings the wrong context (dashboard→API, not the visitor-site's real CSP
  header). Needs fetch+parse of the customer domain's CSP. Scoped post-launch,
  not started.
- Tabbed installer breadth: only standard-script + GTM have real in-wizard
  code. Shopify/WordPress/Framer/Webflow are doc-links only, no guided flow.
  Partial, not built.
- No-scrape framework detection: cheap, low-risk, never built. Detect stack
  from the first pageview's User-Agent/generator meta (already received, zero
  new infra), nudge the matching install guide. Founder chose "audit first,
  decide later" — audited, decision never actually made.
- Step-count mismatch: design spec (docs/archive/ONBOARDING_FLOW_SPEC.md)
  specifies 5 steps (Create Account → Connect Domain → Install Script →
  Customize → Run Verification); a prior audit found the shipped wizard is
  6-step. Cosmetic, never reconciled.

**Doc inconsistency worth someone resolving, not urgent:**
`docs/archive/ONBOARDING_FLOW_SPEC.md`'s own header claims "✅ Visually
implemented... logic complete," but `KNOWN_ISSUES.md` separately lists it as
"Implementation status unverified." The two docs disagree about the same
thing — don't trust either claim at face value until reconciled.

## Other flagged, not fixed
- KNOWN_ISSUES.md #13: 3 pipes (session_report_pageviews,
  session_report_conversions, seo_revenue_landing_pages) have a channel
  classifier that disagrees with the JS engine's — live misclassification,
  already documented, not actioned.
- handleSave's insert branch (new-site creation) is unreachable dead code
  (function early-returns when `site` is falsy) — pre-existing, deliberately left
  alone (#411), now pinned by a test so it can't be silently assumed fixed.

## MCP / tooling notes (orchestrator-side, confirmed this session)
- GitHub MCP: connected, authenticates correctly as Ubaidofficial, but genuinely
  404s on the private SourceTrack repo — confirmed via search_repositories
  showing only 8 public repos visible. Access/auth gap on the connector's grant,
  not a bug — needs reconnect with explicit private-repo access granted. Every
  PR check/diff/merge this session went through the founder's own terminal (gh
  CLI), not this MCP.
- Tinybird MCP: BOTH connector entries ("SourceTrack TB" and "TinyBird") are the
  SAME underlying connection, bound to ST_Staging only. No prod Tinybird MCP
  access exists from chat. Prod Tinybird work requires the founder's own
  terminal + tb CLI — full runbook re-verified working this session (workspace
  switch → --check → deploy → verify via bench query → switch back to staging).
- Supabase MCP: full read access to PROD (zxjjjsipafojhzkkumvh) confirmed
  working directly from chat — used this session to independently verify RLS
  policies, triggers, and unique indexes (pg_policies, pg_class.relrowsecurity,
  has_table_privilege, pg_trigger, pg_indexes) without needing the founder's
  terminal. Useful pattern for future data-integrity questions.
- Railway MCP: full read access confirmed, used after every single merge this
  session to independently verify all 6 services reached SUCCESS post-deploy.

### ⚠️ TRAPS — Tinybird (read before ANY `tb` command; see KI-58 / KI-59). **Full procedure: `docs/tinybird_cutover_runbook.md`.** — STILL CURRENT

1. **The MAIN worktree's `tinybird/.tinyb` is authenticated to PROD**, `TB_TOKEN` unset — `tb --cloud deploy` from that directory hits **production with no prompt**. **ALWAYS read the `Running against Tinybird Cloud: Workspace <X>` line** every `tb --cloud` command prints. `tb --cloud workspace ls` lists only `imubaid93_workspace` and does **NOT** show the workspace you're actually pointed at — it is **not** a reliable check. **Use `tb workspace current` instead** — the runbook's form pipes it so the token is never printed: `tb workspace current 2>&1 | grep -iE "Workspace |^name:"`. If it names the wrong workspace, **STOP**.
2. **Deploys need `st_staging_deploy` (`WORKSPACE:DEPLOY`).** The default token → `workspace requires scope WORKSPACE:DEPLOY`. Pass the token **inline, single-quoted**, for one command: `PD='<token>'; TB_TOKEN="$PD" tb --cloud deploy; unset PD`. **Do NOT use `pbpaste`** (it captures whatever was last copied — usually the command, not the token) and **NOT `read -rs`** (silently returned empty twice on 2026-07-24). Don't re-auth `.tinyb` to prod.
3. **`TB_TOKEN` persists in a shell** and silently overrides `.tinyb` for every later command. **Unset it explicitly** after use.
- **Staging dashboard = `https://sourcetrack-dashboard-staging.up.railway.app/`** — the `-production` URL is PROD. **Browser cache masks fresh deploys** — hard-reload before concluding a change didn't ship.

### ORCHESTRATOR TOOLING NOTE — reason about PROD from ORG-LEVEL datasources, not staging data — STILL CURRENT

The orchestrator's Tinybird MCP is bound to **ST_Staging**, and this caused **four** wrong conclusions in one session, all in the same direction — **reasoning about PROD from STAGING data**: the `de200000-refd` phantom refund row; the `'tiktok'` fixture that masked the real `first_touch_source='stripe'` behaviour; the `privacy_signals` "0 rows" KI, which was simply staging having no GPC traffic; and a claim that Railway MCP could not see the SourceTrack project, when it is there under the name **`determined-reverence`**.

What actually reaches prod are the **ORG-LEVEL service datasources**, readable from the staging-bound connection:

- `organization.workspaces` → all workspace ids incl. prod `SourceTrack` (`3c371bb9-2021-429c-b0d7-0758bff75f9d`)
- `organization.pipe_stats` → per-workspace pipe call/error counts
- `organization.datasources_ops_log` → append/create ops per workspace; this is what proved `privacy_signals` works in prod

**Reach for `organization.*` before concluding anything about prod.** They expose operational **metadata only**, not row-level event data.

## Worktree convention actually used this session
Per-task ad-hoc worktrees off ~/Desktop/trackiq (reserved founder-merges-only per
§13), NOT a fixed set of 4. Used tonight: -seed, -seed2, -gran, -sess, -flexkey,
-cmpguard, -cookieless, plus whatever handleSave/#411 used. All cleared after
merge (except whichever is still active). This works fine — update CLAUDE.md's
"4 mandatory worktrees" framing if it's meant to be a hard cap; tonight's
practice was flexible-per-task with zero collisions once file-overlap was
checked before dispatching in parallel.

## Verification discipline notes (what actually caught real problems this session)
- Independently checking CC/Antigravity's specific line/file citations against
  the real repo (not just trusting confident-sounding reports) caught: a missed
  seed (ai_conversions in GATED_METRICS, SAAS's "AI-Assisted Signups"), a wrong
  self-diagnosis (RLS failure mode — "permission denied" assumed, actually
  "silent 0-row filter", corrected on #411 with functional EXPLAIN proof), and
  one investigation submitted with zero visible tool-call evidence (Antigravity's
  first Item 14 attempt — re-sent requiring "show your work," second attempt
  properly sourced and matched independent verification).
- CC's own self-corrections (mid-investigation, unprompted) were checked
  independently multiple times and were consistently accurate — a good trust
  signal, but still verified each time rather than assumed.
