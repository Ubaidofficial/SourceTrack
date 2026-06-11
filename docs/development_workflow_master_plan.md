# Development Workflow Master Plan — SourceTrack / TrackIQ

**Status:** Engineering control document (authoritative)
**Created:** Session 138B planning pass — 2026-06-11
**Repo state at authoring:** `4b58b4a` (Session 138A), branch `main`, working tree clean, CI green.
**Mode:** Planning-only. No application or backend code changed. No production mutation. No secrets printed or committed.

> This is the new engineering control document. Every future session maps back to it. When a future session's plan conflicts with this document, this document wins unless the session explicitly amends it with evidence.

---

## 0. How to use this document

- Sections 1–9 are the **verdict and roadmap**: read these first every session.
- Sections 10–11 are **hard rules and checklists**: enforce these on every commit/deploy.
- Sections 12–25 are **strategy chapters**: read the relevant chapter before the matching session.
- Sections 26–27 are the **refactor backlog and the definition of "done"**.
- The roadmap in §4 is the source of truth for session ordering. Do not reorder without repo evidence that a different order is safer.

Every claim of "verified" in this document is backed by a file/line reference that was read during the 138B planning pass. Claims about provider consoles (Supabase/Stripe/Railway/PostHog/Resend) are **NOT** verified here — they can only be closed with console evidence, per §10.

---

## 1. Executive verdict on the current engineering workflow

SourceTrack is a **real, working multi-touch attribution product** with genuinely strong security hygiene in places (consistent route guards, `esc()`-disciplined HogQL in most paths, a singleton service-role client, a boot-time secret check, and a QA guard that refuses to mutate production). It is not fake and not garbage.

But the **operational foundation was built slower than the product**. The workflow — not the feature set — is now the bottleneck. The defining facts:

1. **There is no separate staging environment.** Local `.env` points at the production Supabase project (`zxjjjsipafojhzkkumvh`). "Local development" reads and writes the production database. The only thing standing between a careless local run and production data corruption is `scripts/qa-guard.js`'s `verifySafeEnvironment()` — and that guard protects **QA scripts only**, not application routes or the Stripe webhook handler.
2. **There is no automated test framework.** No Vitest/Jest/Playwright anywhere. QA is a set of 36 hand-run `.mjs` scripts. CI runs only syntax checks, whitespace, `qa:static`, and the dashboard build — it does **not** gate `qa:attribution`, `qa:smoke`, or `qa:edge`. An attribution regression can ship green.
3. **The product cannot be safely deployed by an unreviewed agent loop.** Session 137 saw agents commit before review. There is no enforced review-before-commit gate, no confirmed branch protection, and no release checklist that blocks deploy on env/secrets/backups/staging verification.
4. **Production has no backups.** Production Supabase is on the Free tier; backups and PITR are disabled. There is no rehearsed restore path.

**Workflow verdict: NOT YET A PRODUCTION ENGINEERING WORKFLOW.** It is a fast prototyping workflow operating directly against production infrastructure. It is acceptable for a *tiny, hand-operated, disciplined beta* only after Phase 0 and Phase 1 below are complete. It is **not** ready for self-serve, high-volume ecommerce, or autonomous AI-agent implementation loops.

---

## 2. Current readiness grade

| Dimension | Grade | Basis |
|---|---|---|
| **Product correctness** | B | Attribution math is sound and `esc()`-disciplined; nightly-batch multi-touch is honest in copy. |
| **Code quality** | C+ ("messy but manageable") | 2,892-line attribution monolith, 5× duplicated `group_by` gating in `attribution.js`, 1,400–2,700-line dashboard pages, raw date interpolation into HogQL. |
| **Security / tenant isolation** | C | Strong route-guard discipline, but service-role bypasses RLS and `/api/jobs/attribution/status` is not tenant-scoped. |
| **Testing** | D | No test framework; CI does not gate attribution/smoke/edge. |
| **Infra / environments** | D− | No staging; local `.env` → production; no backups/PITR. |
| **Release discipline** | D | No branch protection confirmed, no review gate, no release checklist, agents committed before review. |
| **Observability** | D | No exception monitoring; outages discovered via hourly cron at best. |
| **Billing reliability** | C− | Wired and signature-verified, but E2E never run; webhook unrated; redirect URLs caller-controlled. |

**Overall workflow readiness: D+ / "CONDITIONAL GO for a tiny beta, after Phase 0+1."** This matches the Session 134 master audit verdict of **CONDITIONAL GO** and the code-quality verdict of **MESSY BUT MANAGEABLE**.

---

## 3. P0 / P1 / P2 risk matrix

### P0 — blocks the first paying beta customer

| ID | Risk | Evidence | Closes in |
|---|---|---|---|
| **P0-1** | Stripe E2E never run end-to-end (checkout → webhook → DB → portal → enforcement). Test prices stale ($49/$99/$199 vs public $29/$79/$149+). | `docs/billing_checkout_test_mode_qa.md` F1; webhook code `api/routes/billing.js:70` never exercised against a DB. | 139C |
| **P0-2** | No staging environment; local `.env` → production Supabase `zxjjjsipafojhzkkumvh`; provider-console separation unverified. | `verifySafeEnvironment()` hardcodes the prod ref; `docs/staging_production_separation_audit.md`. | 138B (DB safety) + 139D (console) |
| **P0-3** | Production Supabase on Free tier — backups + PITR disabled; no rehearsed restore. | `docs/backup_recovery.md`; Session 137. | 139A + 139B |
| **P0-4** | Production env/secrets unverified in console (`NODE_ENV`, `ST_IP_RESOLVER_MODE=railway`, `ST_LOG_HASH_SECRET`/`TRACKER_SALT`, `ALLOWED_ORIGINS`). | `api/middleware/rate-limit.js:55-59` boot check; route-level CORS. | 139D |
| **P0-5** | No review-before-commit gate; agents committed unreviewed in Session 137. | SESSION_HANDOFF Session 137. | 138D |

### P1 — blocks the first ~10 customers / public launch readiness

| ID | Risk | Evidence | Closes in |
|---|---|---|---|
| **P1-1** | No exception monitoring; outages found late. | Session 134 audit. | 140A/140B |
| **P1-2** | CI does not gate `qa:attribution`/`qa:smoke`/`qa:edge`; regressions ship green. | `.github/workflows/ci.yml:57-63`. | 140C |
| **P1-3** | No branch protection / required review confirmed. | `.github/workflows/ci.yml` (console setting unverified). | 140E |
| **P1-4** | `/api/jobs/attribution/status` not tenant-scoped — any authenticated user reads global `job_runs`. | `api/routes/job-status.js:7-22`. | 142C |
| **P1-5** | Stripe webhook has no rate limiter; signature-validation flood possible. | `api/routes/billing.js:70`. | 142D |
| **P1-6** | Billing redirect URLs (`success_url`/`cancel_url`/`returnUrl`) taken raw from request body. | `api/routes/billing.js:215,271`. | 142E |
| **P1-7** | HogQL date params raw-interpolated (`toDateTime('${fromDate}')`) — validated at route, not serialized in engine. | `api/lib/attribution-engine.js:59-60` and ~20 sites; `toHogDate` imported but unused for dates. | 142A |
| **P1-8** | No code-quality gates (file size, route-guard coverage, duplication, bundle size, docs truth). | absence. | 140D |

### P2 — blocks scale / high-volume ecommerce

| ID | Risk | Evidence | Closes in |
|---|---|---|---|
| **P2-1** | In-memory rate limits + dedupe → single-instance only. | `api/middleware/rate-limit.js:5-11`. | 144D |
| **P2-2** | Webhook idempotency in-memory (`NodeCache`) — lost on restart/deploy. | `api/routes/billing.js:16`. | 144E |
| **P2-3** | `/api/collect` synchronous Supabase writes. | Session 134 audit. | 144G |
| **P2-4** | No schema/index/migration safety audit; no migration rehearsal. | absence. | 143C |
| **P2-5** | Dependency/supply-chain not audited. | absence. | 143A |
| **P2-6** | Conversion caps shown but not enforced at ingestion. | `docs/safe_qa_test_backlog.md`. | 144H |
| **P2-7** | No tracker/ingestion API contract tests. | absence. | 144B |
| **P2-8** | 1.7 MB dashboard bundle, giant pages not code-split. | dashboard pages 1,434–2,678 lines. | 142G/142H |

---

## 4. Ordered session roadmap

> Use this sequence. Each session has its own acceptance criteria in §11 and the strategy chapter it belongs to. **Do not start a session until the prior phase's blockers are addressed or explicitly deferred with reasoning.** CI must be green before the next session begins.

**The immediate next session is Session 138E.**

**No new feature work / Phase C-D work should begin while any P0 operational blocker remains open unless explicitly approved by the user.**

**Phase 0 — Stop the bleeding (process + local safety)**
- **138B** — Master workflow plan/control document *(Completed)*
- **138C** — Create/confirm separate staging Supabase project; rewire local `.env` away from production. *(Completed)*
- **138D** — Add local/dev boot guard refusing non-production API startup when `SUPABASE_URL` targets the production Supabase ref. *(Completed)*
- **138E** — Codify no-commit-before-review workflow into the AI-agent rules. *(Completed)*
- **139G** — Release Checklist Gate + Paid-Beta Operational Readiness Alignment. Add/update the deploy checklist gate (docs/release_checklist_gate.md) so staging, backups, secrets, CI, and production-safety prerequisites are verified. *(Completed)*

**Phase 1 — Close paid-beta P0 blockers**
- **139H** — Production Supabase Backup/PITR Review + Staging Restore Drill Plan.
- **139I** — Staging Schema Bootstrap / Safe Schema Setup.
- **139J** — Stripe Test Catalog Correction + Stripe E2E on Staging Only.
- **139K** — Verify Production Env/Secrets, IP Resolver Mode, CORS, Tracker/API URLs in consoles.
- **139L** — Confirm beta Terms/Privacy disclosure flow before payment.

**Phase 2 — Observability and release gates**
- **140A** — Add Sentry (or equivalent) exception monitoring.
- **140B** — Trigger a staging error; verify alert routing.
- **140C** — Add `qa:attribution`/`qa:smoke`/`qa:edge` to CI or a mandatory pre-deploy gate.
- **140D** — Add code-quality gates (file size, route-guard audit, duplication, bundle, copy/docs truth).
- **140E** — Enable branch protection / required CI / PR review checklist.

**Phase 3 — Testing foundation**
- **141A** — Introduce Vitest for backend pure logic.
- **141B** — Attribution-engine unit suite (all models + date serialization safety).
- **141C** — Billing helper + plan-gate unit tests.
- **141D** — Cross-tenant route regression tests (staging/test DB).
- **141E** — Playwright smoke tests (core flows).
- **141F** — Seeded staging dataset for repeatable E2E.

**Phase 4 — High-risk code-quality debt**
- **142A** — Attribution-engine date-serialization hardening (no raw HogQL date interpolation).
- **142B** — Deduplicate `attribution.js` `group_by` logic.
- **142C** — Fix `/api/jobs/attribution/status` tenant scoping.
- **142D** — Stripe webhook rate limiter.
- **142E** — Billing redirect hardening (server-derived/allow-listed URLs).
- **142F** — Refactor attribution monolith into modules (behavior-preserving).
- **142G** — Split giant dashboard pages.
- **142H** — Frontend code-splitting for heavy routes.

**Phase 5 — Security, dependency, schema, docs truth**
- **143A** — Dependency audit + supply-chain.
- **143B** — Secrets rotation + key hygiene.
- **143C** — DB schema/index/migration safety audit.
- **143D** — RLS + tenant-isolation defense-in-depth.
- **143E** — Docs truth gate.

**Phase 6 — Support, cost, contracts, pre-scale**
- **144A** — Cost guardrails (Supabase/PostHog/Railway/Resend/Stripe).
- **144B** — Tracker/ingestion API contract tests.
- **144C** — Customer support + incident drill.
- **144D** — Redis/Upstash shared rate-limit design + staging test.
- **144E** — Persistent webhook idempotency.
- **144F** — Event-pipeline load tests (staging only).
- **144G** — Queue/batch ingestion design for `/api/collect`.
- **144H** — Conversion-cap enforcement or pricing-copy decision.

---

## 5. What must happen before paid beta

All P0 closed:
- Staging Supabase exists; local/staging env no longer points at production (138B).
- Local boot guard prevents accidental production mutation (138C).
- Review-before-commit rule + release checklist enforced (138D, 138E).
- Production backups + PITR enabled and restore rehearsed on staging (139H, 139I).
- Stripe test-mode E2E complete on staging with event IDs and before/after rows (139J).
- Production env/secrets verified in consoles (139K).
- Beta Terms/Privacy disclosure shown before payment (139L).

**No P0 open. No exceptions.** This is the §11 "Before paid beta" checklist.

---

## 6. What must happen before the first 10 customers

- Exception monitoring active and alert routing verified (140A, 140B).
- `qa:attribution`/`qa:smoke`/`qa:edge` gated in CI or a documented mandatory pre-deploy gate (140C).
- Branch protection + required review enabled (140E).
- `/api/jobs/attribution/status` tenant-scoped (142C).
- Stripe webhook rate limiter + redirect hardening (142D, 142E).
- Onboarding returns clean 400 (not 500) on invalid input; email suppression/unsubscribe handled (P1 carryover from 134 audit).

---

## 7. What can wait until public launch

- Full Vitest/Playwright test suites and seeded staging dataset (Phase 3).
- Attribution monolith refactor and dashboard page splits (142F–142H).
- Dependency audit, secrets rotation, schema/migration audit, RLS defense-in-depth, docs truth gate (Phase 5).
- Cost guardrails, support drill, tracker contract tests (144A–144C).

---

## 8. What can wait until scale / high-volume ecommerce

- Shared (Redis/Upstash) rate limits (144D).
- Persistent webhook idempotency (144E).
- Staging load tests at 200–1,000 events/sec (144F).
- Queue/batch ingestion for `/api/collect`; event-warehouse decision (144G).
- Conversion-cap enforcement decision (144H).

---

## 9. What should never be done again

- **Never point local `.env` at production again.** This is the root workflow failure.
- **Never let an agent commit before user review.**
- **Never claim a provider-console blocker is closed from a repo-only check.**
- **Never run webhook→DB or mutating QA against production.**
- **Never weaken or skip a test to make CI green.**
- **Never hide a broad refactor inside an audit/planning session.**
- **Never overclaim product capability** (real-time multi-touch, compliance guarantees, native Shopify app, automatic ad sync) without code + test evidence — per RULES.md R9.

---

## 10. Non-negotiable AI-agent rules

> [!IMPORTANT]
> AI-agent workflow rules are governed by [ai_agent_workflow_rules.md](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md).
> No AI-agent may commit or push before raw diff review and explicit user approval.

```
No local mutation while .env points at production.
No webhook-to-DB, billing E2E, restore rehearsal, or mutation testing may run until a separate staging Supabase project exists and local/staging envs no longer point at production.
No webhook→DB tests without confirmed staging Supabase.
No production load testing.
No live Stripe testing for QA.
No commits before user review unless explicitly approved.
No silently weakening tests.
No broad refactors hidden inside audit sessions.
No claiming provider-console verification without actual console evidence.
No accepting AI summaries without code/diff/validation proof.
No moving to the next session until CI is green.
No user-facing claim without code/docs/test evidence.
No backend tenant-data route without auth + site membership proof or documented safe exemption.
No billing change without separate review.
No new dependency without dependency/security review.
No production migration without staging rehearsal and backup/PITR confirmation.
```

---

## 11. Release checklist

### Before every commit
```
git status reviewed
git diff reviewed
validation run (node --check, qa:static, dashboard build as applicable)
secret-leak check clean
session docs updated (SESSION_STATE / SESSION_LOG / SESSION_HANDOFF)
no production mutation
explicit commit approval received
```

### Before every deploy
```
git clean
CI green
qa:static pass
qa:attribution pass
qa:smoke pass
qa:edge pass
dashboard build pass
secret-leak check clean
environment target confirmed (not production from a local/dev workstation)
rollback path known
session handoff updated
```

### Before paid beta
```
staging Supabase exists
local/staging env does not point to production
production Supabase backups/PITR enabled
Stripe test E2E complete
production env secrets verified in console
exception monitoring active
beta Terms/Privacy disclosure ready
no P0 blockers open
```

### Before public launch
```
branch protection enabled
PR review required
unit/integration tests in CI
cross-tenant regression tests
docs truth gate
dependency audit clean
cost guardrails configured
support drill completed
load testing completed on staging
```

### Before high-volume ecommerce
```
shared rate limits
persistent webhook idempotency
queue/batch ingestion plan
staging load tests
capacity plan
event warehouse decision after beta data
```

### Per-session acceptance criteria

| Session | Acceptance criterion |
|---|---|
| 138B | Master workflow plan/control document created and committed. |
| 138C | Local `.env`, `.env.local`, and `.env.staging` now target the staging Supabase project ref for URL/publishable-key configuration, but `SUPABASE_SERVICE_KEY` remains a placeholder. Local backend mutation tests remain blocked until the real staging service-role key is manually added to gitignored local env files. No env files are tracked by git. Stripe E2E remains blocked until: 1. staging schema/bootstrap is completed safely; 2. real staging service-role key is added locally/staging-only; 3. local/dev production boot guard is added; 4. Stripe test catalog is corrected; 5. billing/webhook E2E runs only against staging. |
| 138D | Local/dev API boot guard is implemented via api/bootstrap.js and blocks non-production startup when SUPABASE_URL targets production ref zxjjjsipafojhzkkumvh. Offline qa:env-safety is wired into qa:static. |
| 138E | Every future AI-agent session has enforced review-before-commit rules. |
| 139G | Release checklist gate (docs/release_checklist_gate.md) created and verified by scripts/qa-release-readiness.mjs. |
| 139H | P0-3 closes only when backups/PITR are verified in console and documented. |
| 139I | Restore/recovery has been rehearsed safely on staging, not just documented. |
| 139J | P0-1 closes only after checkout → webhook → DB → portal → inactive enforcement is proven on staging. |
| 139K | Production env safety verified in provider consoles, not assumed from repo. |
| 139L | First paid beta customer sees/receives the beta legal disclosure before payment. |
| 140A | An unhandled staging error appears in the monitoring tool within seconds. |
| 140B | Operators are alerted without waiting for customers to report failures. |
| 140C | Attribution regressions cannot ship green without deterministic QA passing. |
| 140D | Messy-code trends are detected before they become unmanageable. |
| 140E | Production release cannot happen by accident from an unreviewed commit. |
| 141A | Pure backend logic has real assertion-based tests. |
| 141B | Attribution logic has coverage strong enough to refactor safely. |
| 141C | Billing logic can change without relying only on manual Stripe tests. |
| 141D | Every tenant-data route proves auth + site membership or documents why it is safely exempt. |
| 141E | Core customer flows are tested through the browser on staging. |
| 141F | E2E tests are repeatable and do not depend on production data. |
| 142A | HogQL date params are defensively serialized in the engine, not only route-validated. |
| 142B | Adding a new `group_by` special case requires one edit, not five. |
| 142C | No authenticated user can see global `job_runs` unless explicitly authorized. |
| 142D | Webhook endpoint resists abuse without blocking legitimate Stripe delivery. |
| 142E | Checkout/portal redirects are trusted-origin-derived, not arbitrary request-body URLs. |
| 142F | Attribution monolith is smaller without changing attribution outputs. |
| 142G | Largest dashboard pages become reviewable without changing UX. |
| 142H | Initial bundle size drops, or the warning is documented with a clear reason. |
| 143A | No high/critical dependency vulnerabilities ignored without documented risk acceptance. |
| 143B | Production keys are scoped, rotated if needed, never used in local mutation workflows. |
| 143C | Every production migration has a staging rehearsal, rollback note, and backup/PITR confirmation. |
| 143D | Every tenant-data route proves auth + site membership or documents a safe exemption. |
| 143E | Docs/marketing claims cannot drift from code without a failing QA check. |
| 144A | Provider spend alerts and kill-switches configured before broader launch. |
| 144B | Tracker/ingestion APIs have schema/contract tests before public launch. |
| 144C | An operator can handle the first 10 support cases without inventing process live. |
| 144D | Horizontal scaling does not bypass or multiply rate limits. |
| 144E | Webhook idempotency survives process restarts and deploys. |
| 144F | High-volume claims are backed by staging load evidence, not guesses. |
| 144G | There is a clear path away from synchronous ingestion before high-volume ecommerce. |
| 144H | Pricing limits match actual product behavior. |

---

## 12. Testing strategy

**Current reality:** zero test framework; 36 hand-run `.mjs` QA scripts; CI gates only syntax/whitespace/`qa:static`/dashboard-build.

**Target layered model:**
1. **Static (CI, every push)** — `node --check`, `git diff --check`, `qa:static`, dashboard build. *Already in place.*
2. **Pure-logic unit (CI, every push)** — Vitest over attribution math, billing helpers, plan gates, date/timezone utils. No DB. *(141A–141C.)*
3. **Deterministic QA in CI (140C)** — promote `qa:attribution`/`qa:smoke`/`qa:edge` to CI where they need no DB; document any that remain manual staging-only gates.
4. **Cross-tenant regression (staging DB)** — assert user A cannot read user B's data; run pre-release. *(141D.)*
5. **Browser E2E (staging)** — Playwright over onboarding, billing, dashboard, reports, integrations, journey, plan-gated states, against a seeded dataset. *(141E, 141F.)*

**Rules:** DB-mutating tests run only on confirmed staging. No test may be weakened to pass. New product logic ships with a unit test or a documented reason it cannot have one.

---

## 13. Code-quality strategy

**Known debt (verified):**
- `api/lib/attribution-engine.js` — 2,892 lines, monolith (split in 142F).
- `api/routes/attribution.js` — the `group_by` exclusion conditional is duplicated 5× (lines 143/163/179/195/211); deduplicate in 142B.
- Dashboard pages: Integrations 2,678 / ReportBuilder 2,165 / Dashboard 1,770 / Settings 1,434 (split in 142G; code-split in 142H).

**Automated gates (140D):** file-size warning (flag >1,500-line source files), route-guard coverage audit (every tenant-data route shows auth + membership), duplication scan, bundle-size warning, forbidden-copy scan, docs-truth scan. Gates warn first, then graduate to blocking once the backlog is paid down.

**Standing rules:** surgical changes only; behavior-preserving refactors land with tests first; match existing style; no speculative abstraction (CLAUDE.md §2/§3, RULES.md R2/R3).

---

## 14. Infra / staging strategy

**Target promotion flow:** local → staging → production, with **no path from a dev workstation to production data**.

- **138C** creates a separate staging Supabase project (project ref must differ from `zxjjjsipafojhzkkumvh`), with its own anon/service keys; local `.env` is rewired to staging; safe-local-mutation rules documented.
- **138D** adds an app boot/dev guard that refuses non-production API startup when `SUPABASE_URL` targets the production Supabase ref, unless an explicit, deliberate override is set — extending the QA-script-only protection in `verifySafeEnvironment()` to the application itself.
- **Railway:** confirm staging and production are separate services/environments (139D); production carries `NODE_ENV=production`, `ST_IP_RESOLVER_MODE=railway`, and the log-hash secret.
- **PostHog / Stripe / Resend:** separate projects/keys/domains per environment, verified in console (139D).

---

## 15. Security / tenant-isolation strategy

**Architecture fact:** the backend uses the Supabase **service-role** key (`api/lib/supabase.js`), which **bypasses RLS**. Therefore route middleware is the *only* tenant boundary and must be perfect.

**Verified gap:** `api/routes/job-status.js` (`GET /attribution/status`) runs `requireUserAuth` only, then selects from `job_runs` **with no tenant filter** — any authenticated user reads every site's job-run history. Fix in 142C (scope to the caller's sites, or restrict to an explicit admin role).

**Strategy:**
- 141D / 143D — cross-tenant regression suite: for every tenant-data route, prove `auth + site membership`, or document a safe exemption.
- Treat the service-role bypass as the central isolation risk; no new tenant-data route ships without a membership check.
- RLS posture is documented even though it is bypassed, so a future least-privilege key migration is possible.

---

## 16. Attribution-engine hardening strategy

**Verified risk:** dates reach HogQL as raw interpolations — `AND timestamp >= toDateTime('${fromDate}')` appears ~20+ times in `attribution-engine.js` (e.g. lines 59-60, 110-111, 370-371, 763-764). Route handlers validate `date_from`/`date_to` with `new Date()` parsing, but the **original string** is passed through to the engine and interpolated directly. `esc()` is used (31×) and `toHogDate` is *imported* — yet not applied to these date params. This is "validated at the route, not serialized in the engine."

**Strategy:**
- **142A** — route every date param through `toHogDate`/`esc` (or a single shared HogQL date helper) inside the engine before interpolation. Behavior-preserving.
- **141B (first)** — write the attribution unit suite (first/last touch ± non-direct, linear, U-/W-shaped, time-decay, AI touch selection, date serialization) **before** 142A/142F so refactors are provably safe.
- **142F** — split the monolith into modules along existing function boundaries, no output changes, with before/after line counts.

> CLAUDE.md: read `nightly-attribution.js` and `attribution-engine.js` before changing attribution logic. Attribution accuracy > speed.

---

## 17. Billing test strategy

**Verified state:** billing is wired and signature-verified (`api/routes/billing.js:76`), with in-memory idempotency (`NodeCache`, line 16). E2E has **never** run; test prices are stale; redirect URLs are caller-controlled (lines 215, 271); the webhook has no rate limiter.

**Strategy:**
- **139C** — fix the Stripe test catalog (align prices to public $29/$79/$149+; product names Growth/Scale; add `pv_limit` metadata or document fallback), then run the full E2E on staging: hosted checkout → webhook delivery → DB mutation → portal cancel/downgrade → inactive enforcement → idempotency replay → invalid-signature rejection. Capture event IDs + before/after rows.
- **141C** — unit-test the pure billing helpers (`getPriceMap`/`planFromPriceId`/`pvLimitFromPrice`/plan gates) so logic changes don't depend on manual Stripe runs.
- **142D / 142E** — webhook rate limiter (preserve raw body + Stripe retries) and server-derived/allow-listed redirect URLs.
- **144E** — persist webhook idempotency beyond the in-memory cache.

**Rule:** no live-Stripe QA; no billing change without separate review.

---

## 18. Monitoring / incident strategy

**Current:** no exception monitoring; an hourly health cron means up to a ~59-minute blind window.

**Strategy:** 140A adds Sentry (or equivalent) to API and dashboard with environment separation and no PII/secrets in events; 140B triggers a staging error and verifies alert routing without production spam, then updates the runbook. Incident playbooks already exist in `docs/backup_recovery.md` §3 — keep them as the operator reference; 144C drills them.

---

## 19. Dependency / security strategy

**Strategy (143A):** `npm audit` on root and dashboard; identify outdated/abandoned packages and transitive vulns; verify `package-lock` integrity; document risk acceptance for anything not fixed. **No new dependency may be added by an agent without dependency/security review** (§10).

---

## 20. Secrets / key-rotation strategy

**Verified controls:** secrets are env-driven; a boot check (`rate-limit.js:55-59`) fails fast in production if `ST_LOG_HASH_SECRET`/`TRACKER_SALT` is missing; `.env` is not committed.

**Strategy (143B):** decide whether the production service-role key should be rotated (it has been exposed to local-dev usage); confirm no secrets are committed or printed in logs; enforce separate local/staging/prod keys; name a rotation owner and schedule. **Hard rule: local dev must never use the production service-role key** — this is the same root cause as P0-2.

---

## 21. Database schema / index / migration strategy

**Strategy (143C):** audit table-growth risk, missing indexes, slow queries, FK/cascade behavior, and migration drift. Establish a schema-change checklist requiring, for every production migration: a **staging rehearsal**, a **rollback note**, and **backup/PITR confirmation** before apply. No production migration without all three (§10).

---

## 22. API contract / testing strategy

**Strategy (144B):** contract/schema tests for `/api/track`, `/api/collect`, `/api/conversion`, `/api/tracker/id`, and the server-side conversion API — asserting payload schemas, backward-compatible tracker paths (`/tracker/tracker.min.js`, never `loader.min.js`), snippet compatibility, and cookieless behavior. These protect the ingestion surface that customers' installed snippets depend on.

---

## 23. Docs-truth strategy

**Strategy (143E):** a CI-enforced docs-truth gate asserting pricing copy matches backend limits, plan gates match pricing, tracker paths match docs, GSC/SEO limitations are visible, and there are **no** unsupported claims (compliance guarantees, native Shopify app, automatic ad sync, real-time multi-touch) unless implemented. Backed by RULES.md R9 / PROJECT_CONTEXT_COMPACT guardrails. Docs and marketing cannot drift from code without a failing check.

---

## 24. Customer-support and incident-drill strategy

**Strategy (144C):** rehearse, read-only, the first realistic cases — billing issue, ingestion outage, attribution discrepancy, deletion request, refund/cancellation — with support templates and an escalation path. Only read-only SQL during drills. Goal: an operator handles the first 10 beta cases without inventing process live.

---

## 25. Cost-guardrail strategy

**Strategy (144A):** spend/volume alerts on Supabase, PostHog (event volume), Railway (usage), and Resend (email volume); awareness of Stripe-webhook abuse cost; ingestion-spike kill-switches. Configure before broader self-serve launch.

---

## 26. Backlog of refactors

| Item | Target | Session | Constraint |
|---|---|---|---|
| `attribution.js` `group_by` exclusion → single helper | one edit per new case | 142B | behavior-preserving + test |
| `attribution-engine.js` monolith → modules | < monolith, same outputs | 142F | tests first |
| HogQL date interpolation → shared serializer | all date params escaped | 142A | behavior-preserving |
| `/api/jobs/attribution/status` tenant scoping | no global `job_runs` leak | 142C | + regression test |
| Stripe webhook rate limiter | abuse-resistant, retry-safe | 142D | preserve raw body |
| Billing redirect hardening | trusted-origin URLs | 142E | + test |
| Dashboard page splits (Integrations/ReportBuilder/Dashboard/Settings) | reviewable components | 142G | UX-preserving |
| Frontend code-splitting | smaller initial bundle | 142H | no UX regression |
| Persistent webhook idempotency | survives restart | 144E | scale-phase |
| Shared rate-limit store | multi-instance safe | 144D | scale-phase |
| Queue/batch `/api/collect` | async ingestion | 144G | scale-phase, no premature rewrite |

---

## 27. Acceptance criteria for calling the workflow production-ready

The workflow is **production-ready** (not the product — the *workflow*) when **all** of the following hold:

1. A separate staging Supabase project exists; no local/dev/CI path mutates production. *(138C, 138D)*
2. Production has backups + PITR, and a restore has been rehearsed on staging. *(139H, 139I)*
3. Branch protection + required review + required CI are enabled on `main`; no agent can commit/deploy unreviewed. *(138E, 140E)*
4. The release checklist (docs/release_checklist_gate.md) is enforced and blocks deploy on unmet conditions. *(139G)*
5. Exception monitoring is active with verified alert routing. *(140A, 140B)*
6. CI gates `qa:attribution`/`qa:smoke`/`qa:edge` (or a documented mandatory pre-deploy gate runs them). *(140C)*
7. A real test framework exists with attribution, billing, and cross-tenant coverage. *(141A–141D)*
8. Every tenant-data route proves auth + site membership or documents a safe exemption; `job-status` is fixed. *(142C, 143D)*
9. HogQL date params are serialized in the engine; the monolith and giant pages are split. *(142A, 142F, 142G)*
10. Dependency audit is clean (or risk-accepted), secrets are scoped/rotated, the docs-truth gate passes. *(143A, 143B, 143E)*
11. Code-quality gates run and the verified debt in §13 is paid down or warning-documented. *(140D)*

Until then, the workflow remains **"disciplined-operator only"**: safe for a tiny hand-run beta, never for autonomous agent loops or self-serve scale.

---

*End of master plan. This document supersedes ad-hoc session ordering. Amend only with repo/console evidence, and record the amendment in SESSION_LOG.*
