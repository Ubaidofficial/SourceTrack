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
