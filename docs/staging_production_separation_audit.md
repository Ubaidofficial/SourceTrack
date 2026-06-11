# SourceTrack Staging & Production Separation Audit

This document outlines the architecture, environment mappings, environment variable inventory, provider separation matrices, and verification checklists necessary to guarantee complete isolation between development, staging, and production environments for the SourceTrack platform.

---

## 1. Environment Map

SourceTrack is organized around three primary execution environments:

| Environment | Purpose | Target URL / Port | Mode / Config |
| :--- | :--- | :--- | :--- |
| **Local Development** | Local feature building and validation | API: `http://localhost:3000`<br>Dashboard: `http://localhost:5173`<br>Static test: `http://localhost:8080` | Local `.env` + local Supabase Docker or staging DB, Stripe Test Mode, PostHog Dev. |
| **Staging** | Pre-release QA, pipeline validation, and load testing | Dashboard: `https://staging-app.sourcetrack.ai`<br>API: `https://staging-api.sourcetrack.ai` | Staging is supported/intended via separate env vars and `STAGING_HOSTS`, but actual staging Railway/Supabase/PostHog/Stripe/Resend resources require provider-console verification. |
| **Production** | Live tenant ingestion, billing, and report generation | Dashboard: `https://app.sourcetrack.ai`<br>API: `https://api.sourcetrack.ai`<br>Canonical host: `www.sourcetrack.ai` | Production Railway environment, production Supabase, Stripe Live Mode, production PostHog project. |

---

## 2. Environment Variable Inventory

To maintain separation, environment configurations must be isolated. Below is the inventory of variables and how they vary across environments:

| Env Variable | Local Dev | Staging | Production | Description / Mode |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development` | `production` | `production` | Node execution environment |
| `PORT` | `3000` | `3000` | `3000` | Server listening port |
| `FRONTEND_URL` | `http://localhost:5173` | `https://staging-app.sourcetrack.ai` | `https://app.sourcetrack.ai` | Dashboard application URL |
| `TRACKER_BASE_URL` | `http://localhost:3000` | `https://staging-api.sourcetrack.ai` | `https://api.sourcetrack.ai` | Public base URL serving tracker scripts |
| `API_URL` | `http://localhost:3000` | `https://staging-api.sourcetrack.ai` | `https://api.sourcetrack.ai` | Backend API base url |
| `STAGING_HOSTS` | (Optional) | `staging-app.sourcetrack.ai` | (Empty or other staging domains) | Allows staging dashboard to bypass canonical redirects |
| `SUPABASE_URL` | Local Supabase or staging URL | Staging Supabase URL | `https://zxjjjsipafojhzkkumvh.supabase.co` | Supabase API connection URL |
| `SUPABASE_SERVICE_KEY` | Staging service key | Staging service key | Production service role key | Secret service key (backend only) |
| `SUPABASE_ANON_KEY` | Staging anon key | Staging anon key | Production anon key | Public anonymous key |
| `POSTHOG_API_KEY` | Staging PostHog token | Staging PostHog token | Production PostHog token | Public write-only ingestion token |
| `POSTHOG_PROJECT_ID` | Staging project ID | Staging project ID | Production project ID | PostHog dashboard project reference |
| `POSTHOG_PERSONAL_API_KEY`| Staging personal key | Staging personal key | Production personal key | Used for backend HogQL reporting queries |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | `https://us.i.posthog.com` | `https://us.i.posthog.com` | Ingestion endpoint proxy target |
| `STRIPE_SECRET_KEY` | Test key (`sk_test_...`) | Test key (`sk_test_...`) | Live key (`sk_live_...`) | Stripe private API credential |
| `STRIPE_PUBLISHABLE_KEY` | Test key (`pk_test_...`) | Test key (`pk_test_...`) | Live key (`pk_live_...`) | Stripe public client token |
| `STRIPE_WEBHOOK_SECRET` | Local CLI signature secret | Staging webhook secret | Production webhook secret | Secret to verify platform billing webhooks |
| `RESEND_API_KEY` | (Unset / logs to console) | Staging or test Resend key | Production Resend API key | Private key to authorize Resend emails |
| `SLACK_WEBHOOK_URL` | (Optional) | Staging Slack channel | Production Slack channel | Incoming webhook for health notifications |
| `ENCRYPTION_KEY` | Unique random hex | Unique random hex | Unique stable production hex | Key used to encrypt customer keys |
| `ALLOW_PRODUCTION_QA_MUTATION`| `false` | `false` | `false` | Must be `false` unless temporary override needed |

---

## 3. Provider Separation Matrix

### Railway
- **Staging:** Railway service configurations should be grouped under a `staging` environment flag within the Railway project (or in a separate Railway project entirely).
- **Production:** Configured under the `production` environment, mapping custom domains (`api.sourcetrack.ai` and `app.sourcetrack.ai`) to the respective Railway services.
- **Vite Env Compilation:** Vite variables must be explicitly set on the dashboard service environment settings (Vite embeds them into static assets during `npm run build`).

### Supabase
- **Separation Status:** Partially documented. The repo parameterizes Supabase via environment variables and includes a production project-ref guard in QA scripts, but actual staging/production Supabase project separation must be verified in Railway/Supabase provider consoles.
- **Production:** The primary production Supabase database (`zxjjjsipafojhzkkumvh`). Production credentials must **never** be injected into any staging instances or local `.env` files.

### PostHog
- **Separation Status:** Parameterized in code. Separate staging/production PostHog projects are expected via environment variables, but actual project separation must be verified in PostHog and Railway environment settings.

### Stripe
- **Staging:** Stripe **Test Mode** dashboard. All price IDs (Starter, Growth, Scale) must be created in test mode and populated in staging configurations.
- **Production:** Stripe **Live Mode** dashboard. Production price IDs must be created in live mode and populated in production configs. Live and test keys must **never** be mixed.

### Resend
- **Separation Status:** Usage threshold emails skip sending when `RESEND_API_KEY` is absent. Report digest behavior must be verified per job before assuming safe local/staging no-send behavior. Staging/dev should not set a production Resend API key.
- **Production:** Production Resend account with fully verified SPF, DKIM, and DMARC records for the sending domain (`sourcetrack.ai`).

### GitHub Actions
- **Lightweight CI Pipeline:** Runs static syntax validation, linting, git diff whitespace checks, and compiles the React dashboard.
- **Secret Separation:** CI does **not** contain any repository secrets or credentials, preventing the leak of database keys, Stripe secrets, or PostHog personal keys.

---

## 4. Webhook & URL Isolation

### Webhook Paths
1. **Platform Billing Webhooks:**
   - **Local Dev:** Forwarded via Stripe CLI: `stripe listen --forward-to localhost:3000/api/billing/webhook`
   - **Staging:** Configured in Stripe Test Dashboard pointing to `https://staging-api.sourcetrack.ai/api/billing/webhook`
   - **Production:** Configured in Stripe Live Dashboard pointing to `https://api.sourcetrack.ai/api/billing/webhook`
2. **Customer Conversion Webhooks:**
   - Isolated per environment because the site key (`:site_key`) is tied to the environment database. Stripe events sent to a production site key on staging (or vice-versa) will fail database lookups.

### CORS Isolation & Staging Host Gaps
- **Dashboard CORS Restriction:** Dashboard routes check request origins against `HARDCODED_ALLOWED_ORIGINS` (localhost + production) plus `ALLOWED_ORIGINS` loaded from the environment.
- > [!WARNING]
  > **STAGING CORS REQUIREMENT:** Because the staging dashboard domain (e.g. `https://staging-app.sourcetrack.ai`) is not hardcoded, operators **must** explicitly append the staging dashboard URL to the `ALLOWED_ORIGINS` environment variable on the staging API server. If omitted, dashboard requests will be blocked by CORS.

---

## 5. Security & Migration Safety

### Migration Safety Notes
- **No Automated Deploy Migrations:** No automated deploy-time migrations were found, which reduces accidental production mutation risk. However, manual Supabase SQL execution is not technically gated by the repo and remains an operator/process risk. Production migrations require explicit provider-console verification and manual checklist discipline.
- **Analytic Verification:** Run `ANALYZE` commands in the production Supabase editor after schema changes to refresh query planner stats.

### Local Development Safety Notes
- **Database Guardrail:** The `verifySafeEnvironment()` script (`scripts/qa-guard.js`) runs before executing any mutating QA script. It stops immediately if `SUPABASE_URL` contains the production project ref (`zxjjjsipafojhzkkumvh`) or if `NODE_ENV` / `APP_ENV` / `RAILWAY_ENVIRONMENT` is set to `'production'`.
- **Operator Override:** If mutating tests are explicitly required in production, the operator must set `ALLOW_PRODUCTION_QA_MUTATION=true`.

---

## 6. Provider-Console Verification Checklist

Before launch, operators must log into provider consoles and verify:

- [ ] **Supabase Console:**
  - Verify that the production Supabase database uses project reference `zxjjjsipafojhzkkumvh`.
  - Verify that a separate Supabase project is active for staging, with unique keys.
- [ ] **PostHog Console:**
  - Verify that the staging dashboard uses the staging PostHog project write key.
  - Verify that the production dashboard uses the production PostHog project write key.
  - Verify that the staging API server does not have access to the production personal API key.
- [ ] **Stripe Dashboard:**
  - Verify Stripe Test Mode is selected when retrieving keys for staging.
  - Verify Stripe Live Mode is selected when retrieving keys for production.
  - Verify Customer Billing Portal settings are active and configured with redirect origins in both test and live dashboards.
- [ ] **Resend Console:**
  - Verify that DKIM, SPF, and DMARC status reads "Verified" in the production Resend domain configuration.
  - Verify that the staging environment uses dummy keys or a separate sandbox.
- [ ] **Railway Console:**
  - Verify that staging variables (API, Supabase, PostHog, Stripe) contain test keys.
  - Verify that production variables contain live keys.

---

## 7. Staging & Production Separation Risks

### P0: Stripe Mode Mixup (High Risk)
- **Description:** A simple copy-paste error mixing a production `sk_live_` key with test Price IDs or test webhook secrets will cause immediate API crashes or client checkout failures.
- **Mitigation:** Ensure double-verification of Stripe variables during deployment.

### P1: CORS Origin Miss (Medium Risk)
- **Description:** Omitting the staging dashboard hostname from the staging API's `ALLOWED_ORIGINS` variable will block frontend queries due to CORS policy.
- **Mitigation:** Ensure `ALLOWED_ORIGINS` is configured with staging hosts on the staging Railway app.

### P2: Resend Sender Domain Block (Low Risk)
- **Description:** Running staging email cron jobs using a production Resend key might trigger spam filters or domain blocks if test emails are sent to arbitrary non-team addresses.
- **Mitigation:** Leave `RESEND_API_KEY` empty on staging so mail logs default safely to the console.

---

## Session 136 Provider-Console Verification

**Date/time:** 2026-06-11 (session 136)
**Environment:** Local dev workstation (`darwin`), repo `main` @ `b431f6a`. No provider consoles were reachable from this environment.
**Method:** Repo inspection + a no-secret local `.env` presence audit (key presence/mode only; no values printed). Provider-console (Railway/Supabase/PostHog/Stripe/Resend) UIs were **not** accessed.

### Verdict: P0-2 remains **OPEN**

> **P0-2 remains OPEN — repo and local env are parameterized, but provider-console separation is not verified, and the local `.env` currently points at the production Supabase project.**

The repository is correctly parameterized for environment separation (all provider clients are env-driven; `railway.json` files carry no secrets; CORS/`STAGING_HOSTS` are supported). However, **separation is a deployment-time/console concern that cannot be proven from the repo**, and the one piece of live config visible here (the local `.env`) shows the dev workstation is wired to the **production** Supabase project — not a separate staging project. No separate staging Supabase/PostHog/Stripe-live/Resend resources could be confirmed.

### 🚩 Headline finding — F5 (P0 for staging safety / blocks 135B): local `.env` targets the production Supabase project

- The no-secret audit resolved local `SUPABASE_URL` to host **`zxjj…umvh.supabase.co`** — the same project ref this document already labels as **production** (§2, §5). The local `.env` also carries a real `SUPABASE_SERVICE_KEY` (RLS-bypassing) and a real PostHog project + API key.
- Local Stripe is test mode and `FRONTEND_URL`/`ALLOWED_ORIGINS` are `localhost:5173` (dev), **but the database target is production.** "Local dev" is therefore reading/writing against the production database.
- **Mitigating control:** `scripts/qa-guard.js` `verifySafeEnvironment()` blocks *mutating QA scripts* when `SUPABASE_URL` contains `zxjj…umvh` (unless `ALLOW_PRODUCTION_QA_MUTATION=true`). This protects the `qa-*.mjs` scripts — but the **billing webhook handler is normal app code, not behind that guard**, so a Session 135B webhook→DB run on this machine with the current `.env` would mutate **production** `sites` rows.
- **Consequence:** **Session 135B remains BLOCKED.** It must run only against a *confirmed separate staging Supabase project*, which does not exist / cannot be confirmed from here.

### What was VERIFIED IN REPO ✅

- **All provider clients are env-driven**, no hardcoded endpoints/secrets in source:
  - `api/lib/supabase.js` — single service-role client from `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`; comment explicitly forbids bundling into frontend; uses `realtime: { transport: WebSocket }`.
  - `api/lib/posthog.js` — `POSTHOG_API_KEY`/`POSTHOG_HOST`/`POSTHOG_PROJECT_ID`/`POSTHOG_PERSONAL_API_KEY`; `flushAt`/`flushInterval` branch on `NODE_ENV`.
  - `api/routes/billing.js` — Stripe client from `STRIPE_SECRET_KEY`; price→plan map from env (`getPriceMap()`).
- **`railway.json` (api + dashboard) contain build/deploy config only — no env vars** (env is set per Railway service/environment in the console). So the repo cannot encode env separation; it can only be verified in Railway.
- **No hardcoded provider hosts in source** — the only `sourcetrack.ai` literals are mailto/support addresses, email `from:` headers, a demo display string, and PaaS abuse-blocklists; no Supabase/PostHog endpoints baked in.
- **`scripts/qa-guard.js`** production-ref guard is present and references `zxjj…umvh`.

### What was VERIFIED FROM LOCAL `.env` (no secrets printed) 🔍

| Key | Presence/mode | Note |
|-----|---------------|------|
| `NODE_ENV` | missing | → dev default (not `production`) |
| `FRONTEND_URL` / `ALLOWED_ORIGINS` | `localhost:5173` | local dev origin |
| `STAGING_HOSTS` | missing | no staging host configured locally |
| `SUPABASE_URL` | host = **production ref `zxjj…umvh`** | 🚩 local points at production DB |
| `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY` | set | service-role present locally |
| `POSTHOG_API_KEY` / `POSTHOG_PROJECT_ID` | set | real PostHog project |
| `POSTHOG_HOST` | `us.posthog.com` | doc §2 lists `us.i.posthog.com` — minor host discrepancy to reconcile |
| `STRIPE_SECRET_KEY` | `sk_test` (redacted) | test mode ✅ |
| `STRIPE_WEBHOOK_SECRET` | set (redacted) | |
| `STRIPE_PRICE_ID_STARTER` / `_PRO` / `_AGENCY` | set | legacy names (Session 135 stale-price F1 still open) |
| `STRIPE_PRICE_ID_GROWTH` / `_SCALE` | missing | resolved via legacy fallback |
| `RESEND_API_KEY` | missing | → emails log to console (safe locally) ✅ |
| `ST_IP_RESOLVER_MODE` / `ST_LOG_HASH_SECRET` / `TRACKER_SALT` | missing | prod-required; absent locally (expected for dev). **Note:** `ST_IP_RESOLVER_MODE` and `ST_LOG_HASH_SECRET` are also absent from `.env.example` — doc gap (TRACKER_SALT does satisfy the prod log-hash boot check). |

### What was VERIFIED IN PROVIDER CONSOLES

- **None.** No Railway/Supabase/PostHog/Stripe/Resend console was accessed in this session. All console-side separation claims remain operator-verified only.

### What remains UNVERIFIED / requires operator (console)

| Provider | Unverified item |
|----------|-----------------|
| **Railway** | Separate staging vs production services/environments; production has `NODE_ENV=production`, `ST_IP_RESOLVER_MODE=railway`, `ST_LOG_HASH_SECRET`, `TRACKER_SALT`; `ALLOWED_ORIGINS`/`STAGING_HOSTS` correct per env; staging holds no live secrets; rollback available. |
| **Supabase** | That a **separate staging project** exists (distinct from prod `zxjj…umvh`); that staging keys are unique; backups/PITR (→ Session 137); Auth provider settings per-env. |
| **PostHog** | Separate staging vs production projects; staging events don't pollute production; event-volume/cost guardrails on production. |
| **Stripe** | Live mode uses live price IDs only; test/live webhook secrets are environment-specific; **Session 135 F1 stale test prices not yet corrected**. |
| **Resend** | Production sender domain verified (SPF/DKIM/DMARC); staging uses no production sender. |
| **Domains** | `app`/`api`/`www`/tracker domains map to expected environments; production UI never serves a staging tracker snippet. |

### BLOCKED

- **Session 135B (full Stripe E2E with webhook→DB mutation)** is blocked until a **confirmed separate staging Supabase project** is wired into a staging env. With the current local `.env` (production project ref), a webhook→DB run would mutate production data and is therefore prohibited this session.

### Blocker list (to close P0-2)

1. Confirm in the **Supabase console** that a staging project exists separate from production `zxjj…umvh`, with its own keys. *(Hard blocker for 135B.)*
2. Confirm in the **Railway console** that staging and production are separate services/environments with correctly scoped env vars (live keys only in prod; test keys only in staging) and that prod has `NODE_ENV=production` + `ST_IP_RESOLVER_MODE=railway` + log-hash/tracker secrets.
3. Confirm **PostHog** project separation + production cost guardrails.
4. Confirm **Stripe** live/test isolation and correct **production** price IDs; correct the Session 135 F1 stale **test** prices.
5. Confirm **Resend** production domain verification and that staging does not use the production sender.
6. Provide a non-production `.env` (or a staging env) for any future local mutation testing so the dev workstation is not pointed at production.

### Next actions

- Operator performs the §6 Provider-Console Verification Checklist (above) and records results (redacted) in a follow-up "Session 136B Console Evidence" subsection. Only then can P0-2 be marked CLOSED.
- Proceed to **Session 137 (Supabase Backup/PITR Verification + Rollback Rehearsal)** which is also console-driven and overlaps the Supabase checks here — it does not require 135B and can run next.
- **Do not** run Session 135B until blocker #1 (separate staging Supabase project) is confirmed.

### Safety confirmation (this session)
- ✅ No production data mutated; no SQL run; no webhook handler executed.
- ✅ No secrets, full keys, full database URLs, tokens, or webhook secrets printed or committed (project ref redacted to `zxjj…umvh`; it also already appears in §2/§5 of this doc as a known production reference).
- ✅ No live payments; no production load testing; `ALLOW_PRODUCTION_QA_MUTATION` not set.
- ✅ No app/backend feature code changed.

---

## Session 138C — Staging Supabase & Env Rewire Progress

**Date/time:** 2026-06-11 (Session 138C)
**Environment:** Local dev workstation (`darwin`), repo `main` @ `d0e68c5`.
**Method:** MCP query + project creation.

### Status Update:
1. **Production Upgraded to Pro & Backups Verified:** Daily scheduled backups were manually verified in the Supabase dashboard by the operator. MCP did not independently expose/verify backup settings. Visible physical backups were shown for June 3 through June 10, with latest visible backup on June 10, 2026. No restore was run.
2. **PITR Status:** PITR is not enabled / not accepted as enabled. Do not enable PITR without explicit cost approval. Daily backups are now verified; PITR remains an optional but strongly recommended paid add-on / accepted risk if left disabled.
3. **Staging Project Created:** The staging Supabase project has been created successfully:
   - **Name:** `sourcetrack-staging`
   - **Project Ref:** `nrsvpwzekfrdrzkoecfk`
   - **Region:** `eu-west-1`
   - **Status:** `ACTIVE_HEALTHY`
4. **Environment Isolation & Rewire:** Local `.env`, `.env.local`, and `.env.staging` now target the staging Supabase project ref for URL/publishable-key configuration, but `SUPABASE_SERVICE_KEY` remains a placeholder. Local backend mutation tests remain blocked until the real staging service-role key is manually added to gitignored local env files. No env files are tracked by git.
5. **Stripe E2E Status:** Stripe E2E remains blocked until:
   1. staging schema/bootstrap is completed safely
   2. real staging service-role key is added locally/staging-only
   3. local/dev production boot guard is added (Completed in Session 138D)
   4. Stripe test catalog is corrected
   5. billing/webhook E2E runs only against staging

---

## Session 138D — Local/Dev Boot Guard Against Production Supabase Mutation

**Date/time:** 2026-06-11 (Session 138D)
**Environment:** Local dev workstation (`darwin`), repo `main` @ `08d696a`.
**Method:** Added reusable environment safety boot guard (`api/lib/environment-safety.js`) and executed it early via the bootstrap entrypoint (`api/bootstrap.js`) before (`api/index.js`) is evaluated.

### Status Update:
1. **Safety Boot Guard:** If `NODE_ENV !== 'production'`, the API refuses to start when `SUPABASE_URL` contains the production ref `zxjjjsipafojhzkkumvh`.
2. **Emergency Override:** `ALLOW_PRODUCTION_SUPABASE_IN_NON_PROD=true` is supported for emergency overrides, but is strictly forbidden for normal development and is not set locally or in `.env.example`.
3. **Verified Behavior:** Added offline test script `scripts/qa-env-safety.mjs` verifying development/test refusal of production ref, production allow behavior, staging allow behavior, and emergency override allow warnings. Wired into `qa:static`.
4. **Stripe E2E Status:** Stripe E2E remains blocked until staging schema/bootstrap, real staging service-role key, local/dev production boot guard (completed), and Stripe test catalog are corrected.
5. **RLS Policies:** The RLS policy audit remains separate.
