# Paid Beta Go / No-Go Master Audit — Session 134

**Date:** 2026-06-10
**Branch:** `main`
**Auditor stance:** Brutally honest. No rubber-stamp. Previous AI session summaries were treated as untrusted and re-verified against the actual repo, code, and provider boundaries.
**Scope:** Sessions 133B–133W operational-readiness sprint + supporting code.

This audit answers one question: **is SourceTrack/TrackIQ ready for a small, controlled, paid beta?**

---

## 1. Executive Verdict

```
CONDITIONAL GO
```

SourceTrack is **good enough for a tiny, hand-picked, manually-operated paid beta (target 3–5, hard ceiling ~10 customers)** — and **not ready for anything broader**. The application code is functional, the ingestion/attribution pipeline works, pageview limits are genuinely enforced, billing is wired, and the operational documentation produced in 133B–133W is honest and unusually complete for this stage.

The remaining risk is **no longer missing features. It is unproven operations under real customers**, plus a small set of concrete gaps that must close before money changes hands.

### Conditions that MUST be true before the first paying customer (P0)

1. **Stripe test-mode checkout + webhook evidence captured** end-to-end (checkout → subscription → `pv_limit` applied → portal cancel → downgrade). Documented in 133Q but **no human-run evidence exists in the repo**.
2. **Provider-console separation verified** for staging vs production across Supabase, PostHog, Stripe, Resend, Railway (133R parameterizes config in code but explicitly does not prove separation). A Stripe live/test key mix is a self-inflicted P0.
3. **Supabase backups + PITR confirmed enabled** in the Supabase console (133H/backup_recovery.md flags this as "Not Verified").
4. **`ST_IP_RESOLVER_MODE=railway`** and rate-limit / log-hash secrets set on the production Railway service (the API hard-exits in production if `ST_LOG_HASH_SECRET`/`TRACKER_SALT` is missing — verified in `api/middleware/rate-limit.js:55-59`).
5. **Beta Terms/Privacy presented to each customer** with explicit "private beta, as-is, no SLA, no compliance guarantee" language (already drafted in `Terms.jsx`; legal not lawyer-reviewed — acceptable for beta if disclosed).

### Conditions before the first ~10 customers (P1)

6. Lightweight exception monitoring (Sentry or equivalent) — currently the **single largest operational blind spot**.
7. Onboarding `/api/onboarding/site` validation hardening so abuse-guard/trigger rejections return a clean `400`, not a generic `500`.
8. Transactional report-digest **suppression/unsubscribe** handling before enabling broad email digests.
9. A documented decision on the **unenforced monthly-conversion cap** (see §3) — either enforce it or stop advertising it as a hard limit.

If conditions 1–5 are met and 6–9 are scheduled, this is a **GO for a tiny beta**. Until 1–5 are met, it is effectively a **NO-GO for taking payment**, because the failure modes are silent and customer-facing.

---

## 2. Top Launch Blockers

### P0 — Must fix before ANY paid beta customer
| # | Blocker | Why it's P0 | Evidence |
|---|---------|-------------|----------|
| P0-1 | No Stripe test-mode checkout/webhook **evidence** | Billing is the contract with a paying customer. Documented ≠ proven. A broken `pv_limit` propagation = customer tracking silently stops or never enforces. | `docs/billing_checkout_test_mode_qa.md` (checklist only); `api/routes/billing.js:107-140` applies `pv_limit` from price metadata — untested live |
| P0-2 | Staging/production separation unverified in consoles | A live/test Stripe key mismatch, or shared Supabase/PostHog project, corrupts real customer data or billing. | `docs/staging_production_separation_audit.md` (status "must verify in console"); `.env.example` is parameterized but proves nothing about deployed values |
| P0-3 | Supabase backups + PITR not verified | If there is no PITR, accidental deletion is **unrecoverable**. Recovery playbook assumes a capability that is unconfirmed. | `docs/backup_recovery.md` lists PITR as "Not Verified" |
| P0-4 | Production env secrets / IP resolver mode | Wrong IP resolver = rate limits keyed on the proxy IP (everyone shares one bucket) or trust-proxy spoofing. Missing log-hash secret = API refuses to boot. | `api/middleware/rate-limit.js:55-59`, `SESSION_STATE.md` warning |

### P1 — Must fix before the first ~10 customers
| # | Blocker | Why |
|---|---------|-----|
| P1-1 | No real-time exception monitoring (no Sentry, no structured error logs, no paging) | Hourly health cron means an outage can go unnoticed up to ~59 min. You will learn about failures from customers. | `docs/production_observability_incident_response.md` "Key Observability Gaps" |
| P1-2 | Onboarding abuse-guard rejections return `500` not `400` | Legitimate PaaS-subdomain users get a confusing failure; abuse signal is muddied. | `api/routes/onboarding.js:200-202` (generic catch → 500); `docs/abuse_rate_limit_spam_audit.md` P1 |
| P1-3 | Report-digest emails have no automated unsubscribe/suppression | Sending recurring digests without suppression risks spam complaints and sender-reputation damage. | `docs/transactional_email_readiness.md` ("Unimplemented") |
| P1-4 | Account/site deletion does **not** bulk-erase PostHog | Privacy request for full erasure leaves visitor events in PostHog. Only the per-visitor erase endpoint calls PostHog (best-effort). | `api/routes/gdpr.js:42-65` (visitor only), `:142-228` (account delete has no PostHog bulk erase) |
| P1-5 | Stripe webhook endpoints have **no rate limiter** | An attacker can flood `/api/billing/webhook` with invalid signatures, forcing CPU-heavy `constructEvent` calls. | `api/index.js:301-302` (raw body, no limiter); `api/routes/stripe-webhook.js:66` |

### P2 — Acceptable to start beta with, fix during
| # | Item | Note |
|---|------|------|
| P2-1 | Monthly **conversion** cap and structural (sites/seats) limits not enforced backend-side | Pricing page advertises "30/150/750/2,500 conversions/mo" but only **pageviews** are metered. See §3. Honesty/billing-fairness issue, not a safety issue at tiny scale. |
| P2-2 | In-memory rate limits, single-instance only | Fine for one container. Hard blocker before horizontal scaling. |
| P2-3 | CI does not run attribution/smoke/edge QA harnesses | CI catches syntax/static/build breaks only — not attribution-logic regressions. See §3 CI row. |
| P2-4 | No public status page; manual incident emails | Acceptable and documented for beta. |
| P2-5 | Anonymous conversions bypass idempotency; conversion endpoints not bot-filtered | Low impact at tiny scale. |

---

## 3. Readiness Matrix

| Area | Status | Repo-proven evidence | Remaining external verification | Risk | Required next action |
|------|--------|----------------------|-------------------------------|------|----------------------|
| CI / regression pipeline | ⚠️ Partial | `.github/workflows/ci.yml`: `node --check`, `git diff --check`, `npm run qa:static`, dashboard build — all green (run 27305431837) | — | CI does **not** run `qa:attribution`/`qa:smoke`/`qa:edge`. Add at least `qa:attribution` to CI to catch attribution regressions. (P2) |
| Deployment / rollback | ✅ Documented, partly proven | `COMMANDCODE_RUNBOOK.md` rollback section; Railway 1-click rollback "Verified" in `backup_recovery.md` | Railway console | Dry-run a rollback in staging once. |
| Staging / production separation | ⚠️ Code-parameterized only | `.env.example` fully parameterized (STAGING_HOSTS, ALLOWED_ORIGINS, separate STRIPE/SUPABASE/POSTHOG keys) | **Supabase, PostHog, Stripe, Resend, Railway consoles** | P0-2 — verify in all five consoles. |
| Production observability | ⚠️ Weak | `/health` liveness, hourly health-agent cron (`api/jobs/health-agent.js`) | Slack webhook delivery | P1-1 — add Sentry-class exception capture. |
| Incident response | ✅ Documented | `docs/production_observability_incident_response.md` severity table + checklists | — | Acceptable for beta. |
| Customer incident comms | ✅ Documented | `docs/customer_incident_communication_plan.md` templates, 30-min boundary, read-only target queries | — | Acceptable for beta. |
| Billing checkout + webhook | ⚠️ Wired, unproven | `api/routes/billing.js` checkout/portal/webhook; idempotency cache; `/api/billing/webhook` mounted before `express.json` (`api/index.js:301`) | **Stripe test-mode run** | P0-1 — capture end-to-end evidence. |
| Pricing / plan limits / gates | ⚠️ Mostly aligned | Pricing.jsx (5k/30, 50k/150, 150k/750, 500k+/2,500) **matches** `plan-features.js`; feature gates return 402 (`requireFeature`); pageview cap enforced via `checkTierLimit` on track/collect/conversion (`api/index.js:328,348,376`) | — | P2-1 — conversion cap + sites/seats limits defined in `PLAN_STRUCTURAL_LIMITS` but **never enforced** backend. Decide: enforce or restate copy. |
| Security / rate-limits / abuse | ⚠️ Adequate for 1 instance | Layered visitor/IP/site/global limiters (`api/middleware/rate-limit.js`); HMAC log hashing; bot UA filter; webhook signature verify (timing-safe) | — | P1-5 (webhook limiter), P2-2 (Redis before scaling). |
| Privacy deletion / requests | ⚠️ Partial | DB hard-delete verified (`gdpr.js`); per-visitor PostHog best-effort erase (`gdpr.js:42-65`); sole-admin block | PostHog console | P1-4 — account delete does not bulk-erase PostHog; no self-serve export UI. Do not promise certified deletion. |
| Legal / policy | ⚠️ Draft only | `Terms.jsx` "as-is, no SLA, no guarantees"; `docs/legal_policy_readiness.md` | **Legal review; DPA** | Disclose beta status; DPA before EU/B2B scale. |
| Transactional email | ⚠️ Partial | Resend integration (`email-reports.js`, `usage-threshold-emails.js`); usage dedup via `usage_email_log` | **Resend SPF/DKIM/DMARC, domain** | P1-3 — digest suppression; no `reply_to` header (replies to unmonitored mailbox). |
| Support readiness | ✅ Documented | `docs/support_readiness.md` email-only, read-only triage SQL | — | Acceptable. No 24/7, no SLA, no refund guarantee. |
| Docs truth / install QA | ✅ Good | `docs/docs_truth_audit.md`, `docs/install_qa_map.md`; tracker path `/tracker.min.js` consistent | — | Note: standalone `ci_/deployment_/observability_runbook.md` files referenced in the session plan **do not exist** — content lives in `COMMANDCODE_RUNBOOK.md`. Doc-naming drift only. |
| Backup / recovery | ⚠️ Partial | Stripe webhook idempotency/replay "Verified"; Railway rollback "Verified" | **Supabase PITR/backups** | P0-3. |
| Admin / operator access | ⚠️ Code-guard dependent | `admin.js:12` `requireRole('super_admin')` global; admin_audit_log | — | Service-role client bypasses RLS — safety depends entirely on middleware. Any future route missing `requireSiteMembership` = cross-tenant leak. |
| Event pipeline capacity | ⚠️ Ready-to-test, not proven | PostHog batching tuned; `/api/collect` does **synchronous** Supabase inserts (`analytics.js:94,115`) | **Real staging load test** | Synchronous write on collect is the top scaling bottleneck. Fine at tiny scale. No production load testing was run (per constraints). |
| Public marketing / demo / pricing claims | ✅ Clean | Overclaim grep over `dashboard/src` + `api` returns only a Terms.jsx disclaimer that *denies* SLA, SLACK env vars, and a code comment | — | No false "GDPR compliant / SOC2 / native Shopify app / 24/7 / guaranteed" claims found. |
| Product UX simplicity | ✅ Good | Lightweight single-card flows consistent with positioning | — | Maintained. |
| Attribution accuracy / trust | ✅ Functional | `qa:attribution` harness exists and passes locally; attribution engine intact | — | Add to CI (P2-3). Do not claim "100% accurate" / "perfect attribution" (none found — good). |

---

## 4. What IS Paid-Beta Safe Today

- **A small number of hand-selected customers (3–5, ceiling ~10).**
- **Single Railway instance only.** Do not horizontally scale — rate limits and dedup caches are in-process.
- **Founders, SaaS, lead-gen, and light ecommerce.** These have modest, predictable event volume.
- **Manual, email-only support** with read-only DB triage.
- **Manual incident communication** (no status page) — documented and honest.
- **Pageview-metered billing** — this part is genuinely enforced and will stop runaway free usage.
- **Privacy/erasure for individual visitors** (best-effort PostHog) and full DB account deletion.
- Customers who are **told, in writing, this is a private beta with no SLA and no compliance guarantee.**

---

## 5. What is NOT Safe Yet

- **Horizontal scaling / multi-instance.** In-memory rate limits and idempotency caches break the moment a second container exists. Requires Redis/Upstash first.
- **High-volume ecommerce / large Shopify stores.** Synchronous Supabase writes on `/api/collect` and burst-unfriendly site rate limits (10k/min vs 200–1000 ev/s spikes) will throttle or stall.
- **Public self-serve launch.** Signup abuse controls partly depend on unverified Supabase Auth config; onboarding returns confusing `500`s; no exception monitoring to catch the resulting fires.
- **Heavy agencies** (many client sites/seats) — structural sites/seats limits are not enforced backend-side.
- **Compliance-sensitive customers (EU/regulated).** No DPA, no lawyer-reviewed policies, PostHog deletion best-effort, ePrivacy responsibility pushed to customer.
- **Strong deletion/compliance promises.** Account deletion does not bulk-erase PostHog; Stripe records retained. Never claim certified deletion.
- **High-concurrency ingestion** without a real staging load test (none run).
- **Enterprise customers.** Out of scope by design.

---

## 6. Repo-Proven Facts vs External Verification

**Verified in repo (this session):**
- All `api/`, `scripts/*.mjs` pass `node --check`. `git diff --check` clean. `qa:static` PASS. `dashboard` vite build succeeds.
- Pageview limit enforced via `checkTierLimit` mounted on `/api/track`, `/api/collect`, `/api/conversion`.
- Plan feature gates return `402` via `requireFeature` (ad-platforms, cohorts, funnels, revenue, etc.).
- Pricing copy in `Pricing.jsx` matches `plan-features.js` numbers exactly.
- Rate limiting is layered and in-memory (express-rate-limit default `MemoryStore`).
- Webhook signature verification present and timing-safe; Stripe webhook mounted before `express.json` with raw body.
- Overclaim grep clean across user-facing code and docs.

**Requires Railway console verification:** production env vars (`ST_IP_RESOLVER_MODE=railway`, secrets), rollback dry-run, single-instance config.
**Requires Supabase console verification:** backups + PITR enabled; staging vs prod project separation; RLS posture.
**Requires PostHog console verification:** separate projects per environment; deletion/erasure capability.
**Requires Stripe test-mode verification:** full checkout → webhook → `pv_limit` → portal → downgrade evidence; test vs live key isolation.
**Requires Resend/domain verification:** SPF/DKIM/DMARC; sender mailbox routing; bounce monitoring.
**Requires staging test:** real event-pipeline load test; deployment + rollback rehearsal.
**Requires legal review:** Terms/Privacy finalization; B2B DPA with sub-processors.

---

## 7. Harsh Project Orchestra Review

**Product readiness:** Real. This is a working attribution product, not a fake MVP. The core loop (install → ingest → attribute → report → bill) is intact and tested locally.

**UX readiness:** Good and on-philosophy. Lightweight, low-surface, progressive. No dashboard bloat. This is a genuine strength.

**Attribution readiness:** Functional and covered by a QA harness — but that harness **does not run in CI**, so an attribution regression could ship green. Add it. Do not advertise accuracy you don't test continuously.

**Backend readiness:** Solid for one instance. The honest weak spots are well-known and documented: synchronous writes on `/api/collect`, in-memory state, no queue. None matter at 5 customers. All matter at 500.

**Frontend readiness:** Builds clean, claims are scrubbed, pricing matches backend. Fine. (One cosmetic: 1.7MB JS bundle — not a blocker.)

**Security readiness:** Adequate for a controlled beta. Layered rate limits, HMAC log hashing, webhook signatures, bot filtering. The structural risk is the **service-role Supabase client that bypasses RLS** — tenant isolation lives entirely in middleware. One forgotten `requireSiteMembership` and you leak across tenants. Treat every new route as a security review.

**Privacy readiness:** Honest but incomplete. DB deletion is real; PostHog erasure is best-effort and **not triggered on account deletion**. The docs correctly refuse to claim certified deletion. Keep that discipline.

**Infra readiness:** This is the soft underbelly. Everything important — separation, backups, PITR, env isolation — is **parameterized in code but unverified in the consoles where it actually counts.** The repo cannot prove your production is separate from your staging. You must.

**Billing readiness:** Wired correctly, idempotent, mounted correctly — but **never proven with a real Stripe test-mode run.** This is the most dangerous "documented but unverified" item, because it directly touches money.

**Support readiness:** Appropriately scoped. Email-only, read-only triage, no over-promises. Good.

**Legal readiness:** Beta-grade. Drafts exist, claims are softened, no compliance lies. Not lawyer-reviewed, no DPA. Acceptable **only** if every beta customer is told it's a private beta in writing.

**Docs readiness:** Strong and unusually honest — the 133B–133W docs consistently flag their own gaps. Minor drift: three runbook filenames referenced in the plan don't exist as standalone files (content folded into `COMMANDCODE_RUNBOOK.md`). Observability gap: the single biggest one (no exception monitoring) is correctly called out by the docs themselves.

**Launch readiness:** The app is much closer to a controlled beta than it was. **It is not ready for broad self-serve launch.** It can probably survive 3–5 carefully selected, manually-supported beta customers on a single instance. It should not be thrown at high-volume ecommerce or large Shopify stores. The biggest risk is no longer missing features — it is unproven operations and a handful of money-touching paths that have been written but never run.

---

## 8. Feature Workflow Readiness Matrix

Workflow-level verdict for every customer-facing path. "Beta-safe" = works correctly for a careful, small, single-instance beta. Evidence is from direct code inspection this session.

| # | Workflow | Status | Repo evidence | Risk | Beta verdict |
|---|----------|--------|---------------|------|--------------|
| 1 | Signup / onboarding / site creation | ⚠️ Works, rough edges | `onboarding.js` validates domain (400), but abuse-guard/trigger rejection → generic `500` (`:200-202`) | P1-2 | Conditional — fix 500→400 before scale |
| 2 | Tracker install + event capture | ✅ Solid | `tracker/tracker.js` (491 ln); `/api/track` PostHog-routed, `/api/collect` Supabase-routed; bot UA filter both paths; install verify reads `sites` telemetry | Low | Beta-safe |
| 3 | First-touch / last-touch attribution | ✅ Solid | `attribution-engine.js:45-251` direct HogQL, `esc(siteId)` applied; non-direct variants present | Low | Beta-safe |
| 4 | Multi-touch (linear/u-shaped/time-decay/w-shaped) | ⚠️ Nightly-dependent | Computed by `nightly-attribution.js` (~2AM UTC); route returns `_notice` not error when empty (`attribution.js:159-176`) | P1/P2 | Conditional — confirm nightly cron scheduled; data is not real-time |
| 5 | AI / referrer / source classification | ✅ Strong | `channel-classifier.js` AI domain/UTM maps, `detectAiPlatformFromEvent`, same-domain referrer guard | Low | Beta-safe |
| 6 | UTM / campaign attribution | ✅ Solid | `normalizeUtm` on ingest; `channelFromEvent` handles cpc/paid_social/display/affiliate; click-id precedence | Low | Beta-safe |
| 7 | Identity stitching / user_id fallback | ✅ Solid | `identity-links.js` upsert on `(site_id,user_id,anonymous_id)`, hashed logging, `resolveAnonymousId` fallback | Low | Beta-safe |
| 8 | Conversion capture + dedupe | ⚠️ Good w/ caveat | `conversion.js` + `idempotency.js`: in-mem NodeCache (24h) + atomic DB RPC `claim_revenue_idempotency_keys` — **only when `order_id` present**; anonymous conversions skip persistent dedupe | P2 | Beta-safe (small scale) |
| 9 | Offline / server-side conversions | ✅ Works | `/api/conversion/offline` site-key auth (no membership — correct for S2S ingestion) | Low | Beta-safe |
| 10 | Dashboard / reporting / journey / campaign | ✅ Works | `dashboard.js`, `journey.js`, `campaigns.js`; all guarded `requireUserAuth+validateSiteKey+requireSiteMembership` | Low | Beta-safe |
| 11 | Saved reports + CSV export gating | ✅ Gated | `export.js:20-21` returns `402` without `csv_export`; matches Free-tier copy | Low | Beta-safe |
| 12 | Billing checkout / portal / plan gates / Stripe webhooks | ⚠️ Wired, unproven | `billing.js` checkout/portal/webhook; gates via `requireFeature` | **P0-1** | Conditional — needs test-mode evidence |
| 13 | Stripe / Shopify / manual revenue | ⚠️ Works, unproven live | `stripe-webhook.js`/`shopify-webhook.js` timing-safe HMAC; raw-body mounted before json | P1-5 (no webhook rate limit) | Conditional |
| 14 | Ad cost imports + GSC/SEO attribution | ⚠️ Manual only | `ad-cost-imports.js` CSV import; `google-search-console.js` gated `gsc_seo_revenue` (growth+). No automated ad-spend sync (correctly not claimed) | Low | Beta-safe (manual) |
| 15 | Privacy deletion / visitor erasure | ⚠️ Partial | `gdpr.js` DB hard-delete + per-visitor best-effort PostHog; **account delete does not bulk-erase PostHog** (`:142-228`) | P1-4 | Conditional — never promise certified deletion |
| 16 | Admin / operator access + tenant boundaries | ⚠️ Guard-dependent | `admin.js:12` `requireRole('super_admin')` global; 23 routes use full triple guard; **`/api/jobs/attribution/status` is authed but NOT tenant-scoped** (`job-status.js:7-17`, `select('*')`) | P2 | Beta-safe with discipline |
| 17 | Support / incident communication | ✅ Documented | `support_readiness.md`, `customer_incident_communication_plan.md` | Low | Beta-safe |

---

## 9. Functional Test Reality Check

**Hard truth: there is no automated functional/unit/integration test suite that runs in CI.**

- **No test framework.** `package.json` and `dashboard/package.json` have no `jest`/`vitest`/`mocha`/`playwright`. The only files matching `*test*`/`*spec*` are `sourcetrack-test.html` (a manual fixture) and `docs/billing_checkout_test_mode_qa.md` (a checklist). There are **zero** assertion-based test files.
- **The "tests" are QA harness scripts** in `scripts/` (`qa-attribution-harness.mjs`, `qa-attribution-integration.mjs`, `qa-runtime-smoke.mjs`, `qa-edge-cases.mjs`, `qa-static-launch-check.mjs`, plus ~30 domain-specific `qa-*.mjs`). These are real and useful — but they are **run by hand**, not by CI.
- **CI runs only the cheapest layer:** `node --check` (syntax), `git diff --check` (whitespace), `npm run qa:static` (grep/structural lint), and the dashboard build. CI does **not** run `qa:attribution`, `qa:smoke`, or `qa:edge`.
- **Consequence:** an attribution-logic regression, a broken conversion dedupe, or a plan-gate regression **can ship green**. The attribution math is only as safe as the human remembering to run `npm run qa:attribution` before pushing.
- **No live-DB / live-PostHog integration test exists** (by design — keys aren't in CI). So end-to-end ingestion→attribution→report is never machine-verified.

**Verdict on test reality:** Adequate-by-discipline, not adequate-by-automation. For a 3–5 customer beta this is survivable **only if** `qa:attribution` + `qa:smoke` are run before every deploy as a hard gate. It is not adequate for self-serve scale.

---

## 10. Safe Workflow Test Plan (non-destructive, pre-beta)

Run all of this against **staging** with test keys. No production data, no `ALLOW_PRODUCTION_QA_MUTATION`.

1. **Local/staging harness gate (must pass):** `npm run qa:attribution && npm run qa:smoke && npm run qa:edge && npm run qa:static`.
2. **Install + capture:** Install tracker on a staging test page → confirm pageview lands (`/api/collect` row in `pageviews`, PostHog `$pageview`) → confirm install-status flips via `sites` telemetry.
3. **Attribution sanity:** Seed a known journey (utm_source=test → AI referrer → conversion). Verify first_touch, last_touch, and one nightly model (run `nightly-attribution.js` manually in staging) produce the expected credit.
4. **Conversion dedupe:** POST the same conversion with identical `order_id` twice → second must be flagged duplicate (in-mem + RPC). POST anonymous conversion twice → confirm documented bypass behavior.
5. **Plan gates:** As a Free site, hit CSV export, funnels, cohorts, ad-platforms → expect `402`. Exceed pageview cap in staging → expect `402` from `checkTierLimit`.
6. **Billing (P0-1):** Stripe **test mode** full loop: checkout → `pv_limit` applied to site → portal cancel → downgrade to `inactive` → ingestion blocked. Capture event IDs.
7. **Webhook resilience:** Replay a Stripe test webhook → confirm idempotent. Send a bad-signature webhook → confirm rejected (note: no rate limit, P1-5).
8. **Privacy:** Visitor-erase a test anonymous_id → confirm DB rows gone + PostHog best-effort call fired. Account-delete a test user → confirm DB purge; **note PostHog events remain** (P1-4).
9. **Tenant boundary spot-check:** As user A, attempt to read user B's site data via every authed route → expect 403/empty.

---

## 11. Principal Engineer Code Review

**Overall: clean ESM, good security hygiene, real maintainability debt in a few hotspots. "Messy but manageable," not spaghetti.**

Strengths (verified):
- **Consistent ESM** — `import`/`export` throughout, matches CLAUDE.md rule. No `require()` in app code.
- **Single Supabase accessor** — `getSupabase()` singleton (`lib/supabase.js`); routes don't call `createClient()` directly.
- **HogQL escaping discipline is mostly good** — `esc()` used 31× in the attribution engine; `siteId` always escaped.
- **Security plumbing is real** — HMAC-salted log hashing (no raw IPs/keys in logs), layered rate limiters, timing-safe webhook HMAC, bot UA filter, PII redaction on ingest (`redactPiiFromObject`), `requireRole('super_admin')` on all admin routes, 23 routes with the full `requireUserAuth + validateSiteKey + requireSiteMembership` triple.
- **Low cruft** — exactly **one** real `TODO` in app code (`ai-client.js:20`). "legacy/deprecated" hits are almost entirely the express-rate-limit `legacyHeaders:false` option and documented backwards-compat aliases.

Debt (verified, harsh):
- **`attribution-engine.js` is 2,892 lines** — the single largest file in the codebase and the highest-stakes logic. It works, but it is a monolith; any change carries blast radius and there is no unit test backstop.
- **Duplicated gating logic** — the same ~250-character `group_by !== "keyword" && req.query.group_by2 !== "keyword" && …` conditional is **repeated 5×** in `attribution.js`. Add one new special-cased groupBy and you must edit 5 places correctly. Classic copy-paste hazard.
- **Date values reach HogQL without `esc()`** — `toHogDate()` only reformats; it does not sanitize. Dates are gated only by a route-layer `new Date()`+`isNaN` check (`attribution.js:43-46`) and then the **raw string** is passed to the engine (`:148`). Today's callers are safe; a future caller of `getAttribution()` that skips the route gate would be injectable. Should parse-then-reserialize (`fromDate.toISOString()`), not validate-then-pass-raw.
- **Giant dashboard pages** — `Integrations.jsx` (2,678), `ReportBuilder.jsx` (2,165), `Dashboard.jsx` (1,770), `Settings.jsx` (1,434), `Campaigns.jsx` (1,201). Functional, but hard to review/modify safely.
- **1.7 MB JS bundle (458 KB gzip), no code-splitting** — vite warns. Cosmetic/perf, not a blocker for beta.
- **Dead code kept intentionally** — e.g. `attribution-engine.js:1659` "Linear attribution: legacy, dead code kept for safety/documentation." Fine, but it inflates the monolith.

---

## 12. Attribution Engine Review

This is the product. It must be right, not just present.

- **Models implemented (verified):** `first_touch`, `last_touch`, `first_touch_non_direct`, `last_touch_non_direct`, `linear`, `u_shaped`, `time_decay`, `w_shaped`, `ai_platforms` — dispatched in `getAttribution()` (`:637-687`) with a matching explanation path in `getAttributionExplanation()`. Marketing's "9 models" claim is backed by code.
- **First/last-touch** run as direct HogQL with `esc(siteId)` and reasonable `COALESCE(...,'direct'/'none')` fallbacks — sound.
- **Multi-touch (linear/u/w/time-decay) are NOT real-time.** They are produced by the nightly job (`nightly-attribution.js`, ~2 AM UTC). The route honestly surfaces a `_notice` instead of a blank chart when data is absent — but a beta customer who converts at 10 AM sees no multi-touch credit until the next nightly run. **This must be told to customers, and the nightly cron must be confirmed scheduled in the deploy environment** (it is not provable from the repo).
- **AI-platform attribution** (`selectAiTouchForConversion`, `detectAiPlatformFromEvent`) is well-structured: windowed lookback, sorted touchpoints, scans backward for the most recent AI touch, falls back to the conversion event. This is a genuine differentiator and looks correct.
- **Escaping:** `esc()` everywhere for `siteId`; the **date interpolation gap** above is the one blemish — currently mitigated at the route layer, but architecturally fragile.
- **No automated correctness test in CI** (see §9). The `qa-attribution-harness.mjs` and `qa-attribution-integration.mjs` exist and are the right tools — but they don't gate merges.

**Attribution honesty:** No "100% accurate" / "perfect attribution" claims anywhere (grep clean). Good.

---

## 13. UX Simplicity Review

- **On-philosophy.** The customer-facing flows (onboarding, snippet install, dashboard cards, journey/conversion modals) are genuinely lightweight, single-card/single-modal, progressive-disclosure. The positioning ("simpler than Usermaven/Cometly/Triple Whale") is honestly reflected in the UX.
- **Marketing claims are clean** — overclaim grep over `dashboard/src` returns only a Terms.jsx disclaimer that *denies* SLA/guarantees. No false native-Shopify/automatic-sync/24-7 claims.
- **Internal complexity ≠ user complexity.** The big files (`Integrations.jsx`, `ReportBuilder.jsx`) are dense for *us* to maintain, but the user surface stays simple. That's an acceptable trade for beta.
- **Perf caveat:** the un-split 1.7 MB bundle means a heavier first paint than a "lightweight" product implies. Worth code-splitting before public launch; fine for beta.

**UX verdict:** Simple where it counts. The simplicity claim is earned on the customer side.

---

## 14. Top 10 Code Risks

1. **No CI-gated functional tests** — attribution/conversion/gate regressions can ship green (§9). *Highest code risk.*
2. **HogQL date params not `esc()`-escaped** — engine relies on route-layer `isNaN`; fragile for future callers (`attribution-engine.js` + `attribution.js:148`).
3. **2,892-line attribution monolith** — high blast radius, no unit backstop.
4. **5× duplicated group_by gating conditional** in `attribution.js` — copy-paste regression hazard.
5. **`/api/jobs/attribution/status` not tenant-scoped** — `select('*')` on `job_runs` returned to any authed user (`job-status.js`); low-sensitivity but a real boundary inconsistency that could leak job error strings.
6. **Service-role client bypasses RLS everywhere** — one missing `requireSiteMembership` = cross-tenant leak; isolation is entirely middleware-enforced.
7. **In-memory state (rate limits + conversion dedup cache)** — single-instance only; resets on deploy; breaks on horizontal scale.
8. **Stripe webhook endpoints unrated** — invalid-signature flood forces CPU-heavy `constructEvent` (`index.js:301-302`).
9. **Synchronous Supabase writes on `/api/collect`** — every pageview blocks on DB insert; top scaling bottleneck.
10. **Large dashboard pages (2,678 / 2,165 / 1,770 lines)** + 1.7 MB unsplit bundle — review difficulty and first-paint cost.

---

## 15. Top 10 Product / Workflow Risks

1. **Billing never run live** — checkout/webhook/`pv_limit` propagation untested in Stripe test mode (P0-1). Money path.
2. **Staging/prod separation unverified** — a live/test key mix corrupts real billing/data (P0-2).
3. **No verified backups/PITR** — accidental deletion may be unrecoverable (P0-3).
4. **Multi-touch models are nightly, not real-time** — customers may perceive "missing" attribution for hours; must be disclosed (§12).
5. **Account deletion leaves PostHog events** — a full-erasure privacy request is not actually fully honored (P1-4).
6. **Monthly conversion cap + sites/seats limits advertised but not enforced** — only pageviews metered; billing-fairness/honesty gap (P2-1).
7. **No exception monitoring** — failures surface via customers, not alerts (P1-1).
8. **Onboarding rejections return 500** — confusing failure for legitimate PaaS-subdomain users (P1-2).
9. **Report digests have no unsubscribe/suppression** — sender-reputation risk if enabled broadly (P1-3).
10. **Anonymous conversions bypass persistent dedupe** — conversion inflation possible without `order_id` (P2).

---

## 16. Required Verdicts

```
Master verdict:        CONDITIONAL GO
Attribution beta-safe: CONDITIONAL — code is sound and esc-disciplined, but (a) no
                       attribution test runs in CI, (b) multi-touch models are
                       nightly-batch not real-time, (c) date params reach HogQL
                       validated only at the route layer. Safe for a tiny beta IF
                       qa:attribution is a hard pre-deploy gate and the nightly cron
                       is confirmed scheduled. NOT safe to claim real-time multi-touch.
UX beta-safe:          YES — customer-facing flows are genuinely lightweight and
                       claims are clean. (Minor: code-split the 1.7 MB bundle before
                       public launch.)
Code quality verdict:  MESSY BUT MANAGEABLE — clean ESM, strong security hygiene,
                       near-zero TODO cruft, consistent route guards; offset by a
                       2,892-line attribution monolith, 5× duplicated gating logic,
                       an unescaped-date HogQL pattern, and several 1,500–2,700 line
                       dashboard pages. Not spaghetti; not pristine. Maintainable
                       enough for a small beta by a disciplined operator. Pay down the
                       attribution monolith + test gap before scaling the team.
```

---

## 17. Recommended Next 5 Sessions

> Do **not** start Phase C/D features until P0 conditions are met. Phase C is not the biggest launch risk; unproven billing and unverified infra are.

### Session 135 — Stripe Test-Mode Checkout & Webhook Evidence
- **Goal:** Run the full Stripe test-mode flow and capture human evidence: checkout → subscription created → `pv_limit` applied to site → usage enforcement → portal cancel → downgrade to `inactive`.
- **Why it matters:** Closes P0-1. Billing is the contract; it has never been run live.
- **Acceptance:** Annotated evidence log in `docs/billing_checkout_test_mode_qa.md` showing each transition with Stripe event IDs (test mode).
- **Validation:** `qa:static`, `node --check`, no live keys, no production mutation; Stripe **test mode only**.

### Session 136 — Provider-Console Separation & Secrets Verification
- **Goal:** Verify and document staging vs production separation across Supabase, PostHog, Stripe, Resend, Railway; confirm `ST_IP_RESOLVER_MODE`, log-hash secret, CORS origins on prod.
- **Why it matters:** Closes P0-2 and P0-4. The repo cannot prove this; only the consoles can.
- **Acceptance:** Each checklist item in `docs/staging_production_separation_audit.md` marked verified with screenshot/console reference (redacted).
- **Validation:** No production data mutation; read-only console verification.

### Session 137 — Supabase Backup / PITR Verification + Rollback Rehearsal
- **Goal:** Confirm Supabase backups + PITR are enabled; rehearse a Railway rollback and (in staging) a PITR restore.
- **Why it matters:** Closes P0-3. "Recovery playbook" is worthless if the capability isn't enabled.
- **Acceptance:** `docs/backup_recovery.md` PITR row flipped to "Verified" with retention window noted; rollback rehearsal logged.
- **Validation:** Staging only; no production restore.

### Session 138 — Lightweight Exception Monitoring (Sentry or equivalent)
- **Goal:** Add minimal exception capture for API + dashboard; route alerts to the existing Slack webhook.
- **Why it matters:** Closes P1-1, the biggest standing operational blind spot. (This session *does* touch code — schedule it explicitly as an implementation session, not an audit.)
- **Acceptance:** A thrown error in staging surfaces in the monitoring tool within seconds; documented in observability runbook.
- **Validation:** `node --check`, `qa:static`, dashboard build, CI green.

### Session 139 — Onboarding Validation Hardening + Email Suppression
- **Goal:** Make `/api/onboarding/site` return clean `400`s on abuse-guard/trigger rejection (P1-2); add report-digest unsubscribe/suppression handling (P1-3).
- **Why it matters:** Removes confusing signup failures and protects sender reputation before scaling email.
- **Acceptance:** Express-level validation tests for blocked subdomains/disposable emails return `400` with a clear message; digest opt-out writes to a suppression list and is honored.
- **Validation:** `node --check`, `qa:static`, targeted manual test, CI green.

> **Deferred (not before tiny beta):** Redis/Upstash shared rate-limiter design (Session 14x) — only needed once horizontal scaling is on the table. Conversion-cap/structural-limit enforcement decision (P2-1) — resolve copy-vs-enforcement before the first invoice dispute.

---

## 18. Session 134 Constraints Confirmation

- ✅ No production data mutated.
- ✅ No production secrets used.
- ✅ No production load testing performed.
- ✅ No app/backend feature code changed (audit + session docs only).
- ✅ `ALLOW_PRODUCTION_QA_MUTATION` not set.
- ✅ No GDPR/CCPA/SOC2/uptime/SLA/24-7 compliance claims made or implied.
