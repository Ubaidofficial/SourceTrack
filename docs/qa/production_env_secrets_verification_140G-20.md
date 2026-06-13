# QA Report — Session 140G-20 — Production Env + Secrets Verification Evidence Pack

## Verdict
🟡 PARTIAL

## Scope
Verified environment variables and project credentials separation across:
- **Railway Console**: Checked all 6 services (`SourceTrack-Api`, `SourceTrack-Dashboard`, `nightly-attribution`, `sourcetrack-email`, `sourcetrack-dq`, `sourcetrack-health`) in both `staging` and `production` environments.
- **Supabase Console**: Queried projects `zxjjjsipafojhzkkumvh` (Production) and `nrsvpwzekfrdrzkoecfk` (Staging) to verify publishable keys and database status.
- **PostHog**: Inspected API keys and project IDs configured in Railway environment settings.

---

## Evidence Table

| Service | Environment | Variable / Setting | Expected | Observed Safe Evidence | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SourceTrack-Api** | Production | `NODE_ENV` | `production` | `production` | ✅ PASS | Normalizes routing and enforces production rules. |
| **SourceTrack-Api** | Production | `SUPABASE_URL` | Points to prod ref (`zxjjjsipafojhzkkumvh`) | Matches production Supabase project ref | ✅ PASS | Correctly points to production database. |
| **SourceTrack-Api** | Production | `SUPABASE_SERVICE_KEY` | Production service-role key | Present — value not printed | ✅ PASS | Actual key is present and distinct from staging. |
| **SourceTrack-Api** | Production | `SUPABASE_ANON_KEY` | Production anon key | Present — matches production Supabase project ref | ✅ PASS | Matches production Supabase publishable key. |
| **SourceTrack-Api** | Production | `ST_IP_RESOLVER_MODE` | `railway` | `railway` | ✅ PASS | Required for proper IP extraction behind Railway router. |
| **SourceTrack-Api** | Production | `ST_LOG_HASH_SECRET` | Stable salt for IP log hashing | Present — value not printed | ✅ PASS | Hashing secret is configured. |
| **SourceTrack-Api** | Production | `TRACKER_SALT` | Stable salt for visitor-id hashing | **MISSING** | 🚨 **BLOCKER** | Will cause runtime error on cookieless visitor ID requests. |
| **SourceTrack-Api** | Production | `ALLOWED_ORIGINS` | Commas-separated prod origins | **MISSING** | 🟡 PARTIAL | Falls back to hardcoded production domains. |
| **SourceTrack-Api** | Production | `FRONTEND_URL` | `https://app.sourcetrack.ai` | **MISSING** | 🟡 PARTIAL | Falls back to hardcoded default. |
| **SourceTrack-Api** | Production | `DASHBOARD_URL` | `https://app.sourcetrack.ai` | `https://app.sourcetrack.ai` | ✅ PASS | Points to production dashboard. |
| **SourceTrack-Api** | Production | `POSTHOG_HOST` | Proxy URL or `us.i.posthog.com` | Present — value not printed | ✅ PASS | Points to production proxy. |
| **SourceTrack-Api** | Production | `POSTHOG_PROJECT_ID` | Production project ID | Shared PostHog project detected | 🟡 SHARED | Shared with staging PostHog environment. |
| **SourceTrack-Api** | Production | `POSTHOG_API_KEY` | PostHog write token | Present — value not printed | 🟡 SHARED | Shared with staging PostHog environment. |
| **SourceTrack-Api** | Production | `POSTHOG_PERSONAL_API_KEY` | PostHog query token | Present — value not printed | ✅ PASS | Personal API key is configured. |
| **SourceTrack-Api** | Production | `STRIPE_SECRET_KEY` | Production Stripe key | **MISSING** | 🚨 **BLOCKER** | Main API lacks Stripe configuration. |
| **SourceTrack-Api** | Production | `STRIPE_WEBHOOK_SECRET` | Production webhook token | **MISSING** | 🚨 **BLOCKER** | Main API lacks Stripe webhook secret. |
| **SourceTrack-Api** | Production | `STRIPE_PUBLISHABLE_KEY` | Production Stripe pub key | **MISSING** | 🟡 PARTIAL | Not required by current API service unless checkout/frontend Stripe initialization depends on it; verify separately in dashboard/billing flow. |
| **SourceTrack-Dashboard** | Production | `VITE_SUPABASE_URL` | Points to prod ref (`zxjjjsipafojhzkkumvh`) | Matches production Supabase project ref | ✅ PASS | Correctly points to production database. |
| **SourceTrack-Dashboard** | Production | `VITE_SUPABASE_ANON_KEY` | Production anon key | Present — matches production Supabase project ref | ✅ PASS | Correctly references production anon key. |
| **SourceTrack-Dashboard** | Production | `VITE_API_URL` | `https://api.srctk.com` | `https://api.srctk.com` | ✅ PASS | Points to production API domain. |
| **SourceTrack-Dashboard** | Production | `VITE_POSTHOG_KEY` | PostHog write key | Present — value not printed | 🟡 SHARED | Shared project API key. |
| **SourceTrack-Dashboard** | Production | `ALLOWED_ORIGINS` | Approved CORS domains | Comma-separated list (no wildcards) | ✅ PASS | Restricts origins to approved dashboard/marketing domains. |
| **SourceTrack-Api** | Staging | `NODE_ENV` | `staging` | `production` | 🟡 MISMATCH | Set to `production` instead of `staging`. |
| **SourceTrack-Api** | Staging | `SUPABASE_URL` | Points to staging ref (`nrsvpwzekfrdrzkoecfk`) | Matches staging Supabase project ref | ✅ PASS | Correctly points to staging database. |
| **SourceTrack-Api** | Staging | `SUPABASE_SERVICE_KEY` | Staging service-role key | Present — value not printed | ✅ PASS | Correctly uses staging-specific service-role secret. |
| **SourceTrack-Api** | Staging | `SUPABASE_ANON_KEY` | Staging anon key | Present — matches staging Supabase project ref | ✅ PASS | Correctly uses staging anon key. |
| **SourceTrack-Api** | Staging | `STRIPE_SECRET_KEY` | Staging Stripe key | Present — Mode: test | ✅ PASS | Uses test-mode Stripe keys. |
| **SourceTrack-Api** | Staging | `STRIPE_WEBHOOK_SECRET` | Staging webhook key | Present — Mode: test | ✅ PASS | Uses test-mode Stripe webhook secret. |
| **SourceTrack-Api** | Staging | `TRACKER_SALT` | Staging visitor-id salt | **MISSING** | 🚨 **BLOCKER** | Will crash on cookieless visitor ID requests. |
| **SourceTrack-Api** | Staging | `STRIPE_PUBLISHABLE_KEY` | Staging Stripe pub key | **MISSING** | 🟡 PARTIAL | Not required by current API service unless checkout/frontend Stripe initialization depends on it; verify separately in dashboard/billing flow. |
| **sourcetrack-health** | Production | `STRIPE_SECRET_KEY` | Production Stripe key | Present — Mode: test | 🚨 **MISMATCH** | Health agent uses Stripe test key in production. |
| **sourcetrack-health** | Production | `STRIPE_WEBHOOK_SECRET`| Production webhook key | Present — Mode: test | 🚨 **MISMATCH** | Health agent uses Stripe test webhook secret in production. |

---

## Cross-Environment Separation
- **Supabase DB Separation**: **PASS**. Production services point cleanly to production Supabase database ref (`zxjjjsipafojhzkkumvh`) and use production API keys. Staging services point cleanly to staging Supabase database ref (`nrsvpwzekfrdrzkoecfk`) and use staging API keys. No cross-env leaks are present.
- **Stripe separation**: **BLOCKED / PENDING**. No live Stripe credentials (`sk_live_...` or similar live mode prefixes) are configured in either environment. Staging utilizes test-mode credentials. Production lacks Stripe credentials on `SourceTrack-Api` entirely and incorrectly utilizes a test-mode key on the `sourcetrack-health` service.
- **PostHog separation**: **FAILED / SHARED**. Both production and staging point to the exact same PostHog Project ID and share project keys, meaning staging telemetry runs will pollute production dashboard charts.

---

## Blockers
- `TRACKER_SALT` missing in production API and staging API
- Production `SourceTrack-Api` missing Stripe secret/webhook variables
- `sourcetrack-health` production has test-mode Stripe credentials
- staging API has `NODE_ENV=production`
- PostHog project appears shared between staging and production

---

## Secrets Handling
No private secret values are intentionally committed in this report. All observed environment values are redacted to presence, mode, or project-ref classification only.

---

## Remaining Release Risk
Paid-beta readiness remains **NOT READY** (Blocked). 
The lack of production Stripe credentials, shared staging/production PostHog projects, and missing `TRACKER_SALT` are critical P0 blockers that must be resolved prior to launch.
