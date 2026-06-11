# SourceTrack Production & Staging Environment Verification Guide

**Engineering Control Document**  
**Verification Status:** 🚨 **NOT YET VERIFIED / OPERATOR ACTION REQUIRED**  
*No active provider console screenshots or console command outputs have been presented to the AI agent. Production environment verification remains blocked until manual verification by the operator is performed.*

---

## 1. Purpose & Status

This document defines the checklist, security rules, and verification procedures for the environment configurations of SourceTrack / TrackIQ across **Local Development**, **Staging**, and **Production** environments. 

To ensure absolute environment isolation and prevent production data corruption, the backend enforces boot-time checks and local safety guardrails. This guide maps out the required values and parameters that the operator must verify in the Railway and Supabase consoles before launch.

---

## 2. Production Environment Checklist (Railway Console)

The operator must verify that the following variables are configured on the Railway production service (`SourceTrack-Api` / `SourceTrack-Dashboard`):

| Variable Key | Required Behavior / Value Description | Status |
| :--- | :--- | :--- |
| `NODE_ENV` | Must be set to `production` to activate production routing, disable debugging paths, and enforce strict decryption checks. | 🚨 **PENDING** |
| `SUPABASE_URL` | Must point to the production Supabase database ref (`zxjjjsipafojhzkkumvh`). | 🚨 **PENDING** |
| `SUPABASE_SERVICE_KEY` | Must be the production `service-role` secret key. Do not commit or log this. | 🚨 **PENDING** |
| `SUPABASE_ANON_KEY` | Must be the production `anon` publishable key. | 🚨 **PENDING** |
| `ST_IP_RESOLVER_MODE` | Must be set to `railway` to enable parsing of the `x-forwarded-for` header for client IP extraction. | 🚨 **PENDING** |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed production CORS origins (e.g., `https://app.sourcetrack.ai,https://sourcetrack.ai`). | 🚨 **PENDING** |
| `ENCRYPTION_KEY` | Must be a stable, 64-character hex string or 32-byte base64 string. Changing this key breaks integration secret decryption. | 🚨 **PENDING** |
| `ST_MANAGED_PROXY_TARGET` | Target domain or path for managed proxy requests (fails fast in prod if missing). | 🚨 **PENDING** |
| `ST_PLATFORM_HOSTS` | Platform hosts allowed for routing and configuration checks (fails fast in prod if missing). | 🚨 **PENDING** |
| `TRACKER_SALT` | Cryptographic salt used for hashing telemetry keys (fails fast if missing). | 🚨 **PENDING** |
| `ST_LOG_HASH_SECRET` | Secret key used to hash IP addresses in diagnostic logging (fails fast if missing). | 🚨 **PENDING** |
| `POSTHOG_HOST` | Production PostHog API endpoint (e.g., `https://us.i.posthog.com`). | 🚨 **PENDING** |
| `POSTHOG_API_KEY` | Production PostHog project write key. | 🚨 **PENDING** |
| `POSTHOG_PROJECT_ID` | Production PostHog project identifier. | 🚨 **PENDING** |
| `POSTHOG_PERSONAL_API_KEY`| Production PostHog personal API key for admin queries. | 🚨 **PENDING** |
| `STRIPE_SECRET_KEY` | Production Stripe secret API key (starts with Stripe live secret prefix). | 🚨 **PENDING** |
| `STRIPE_PUBLISHABLE_KEY` | Production Stripe publishable key (starts with Stripe live publishable prefix). | 🚨 **PENDING** |
| `STRIPE_WEBHOOK_SECRET` | Production Stripe webhook endpoint signing secret (starts with Stripe webhook secret prefix). | 🚨 **PENDING** |
| `STRIPE_PRICE_ID_STARTER` | Production price ID matching the $29/mo Starter tier. | 🚨 **PENDING** |
| `STRIPE_PRICE_ID_GROWTH`  | Production price ID matching the $79/mo Growth tier. | 🚨 **PENDING** |
| `STRIPE_PRICE_ID_SCALE`   | Production price ID matching the $149/mo Scale tier. | 🚨 **PENDING** |
| `RESEND_API_KEY` | Production Resend API token for sending system and report emails. | 🚨 **PENDING** |

---

## 3. Staging Environment Checklist (Railway Staging Console)

The operator must verify that the following variables are configured on the Railway staging service (targeting project `nrsvpwzekfrdrzkoecfk`):

| Variable Key | Required Behavior / Value Description | Status |
| :--- | :--- | :--- |
| `NODE_ENV` | Set to `staging`. This ensures the safety boot guard allows startup with staging database connection, but keeps testing paths available. | 🚨 **PENDING** |
| `SUPABASE_URL` | Must point to the staging Supabase database ref (`nrsvpwzekfrdrzkoecfk`). | 🚨 **PENDING** |
| `SUPABASE_SERVICE_KEY` | Real staging `service-role` secret key (retrieved from the staging Supabase project settings). | 🚨 **PENDING** |
| `SUPABASE_ANON_KEY` | Real staging `anon` publishable key. | 🚨 **PENDING** |
| `ST_IP_RESOLVER_MODE` | Set to `railway` (if hosted behind staging Railway router) or `connection` (for local debug). | 🚨 **PENDING** |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed staging CORS origins (e.g., `https://staging-app.sourcetrack.ai`). | 🚨 **PENDING** |
| `ENCRYPTION_KEY` | Staging-specific 32-byte key (different from production). | 🚨 **PENDING** |
| `POSTHOG_HOST` | Staging/sandbox PostHog API endpoint. | 🚨 **PENDING** |
| `POSTHOG_API_KEY` | Staging/sandbox PostHog project write key. | 🚨 **PENDING** |
| `STRIPE_SECRET_KEY` | Staging Stripe test-mode API key (starts with Stripe test secret prefix). | 🚨 **PENDING** |
| `STRIPE_PUBLISHABLE_KEY` | Staging Stripe test-mode publishable key (starts with Stripe test publishable prefix). | 🚨 **PENDING** |
| `STRIPE_WEBHOOK_SECRET` | Staging Stripe test-mode webhook secret (starts with Stripe webhook secret prefix). | 🚨 **PENDING** |
| `RESEND_API_KEY` | Sandbox Resend API token or test email configuration. | 🚨 **PENDING** |

---

## 4. Local / Development Safety Checklist

To prevent developers or AI loops from accidentally reading or modifying production database state, the following local security rules are permanently enforced:

1. **Safety Boot Guard**: The backend entry point runs `enforceEnvironmentSafety()` inside `api/bootstrap.js`. If `NODE_ENV` is not `production`, and `SUPABASE_URL` contains the production ref `zxjjjsipafojhzkkumvh`, the server terminates with exit code `1`.
2. **Local Environment Files**: `.env`, `.env.local`, and `.env.staging` must target the staging project ref (`nrsvpwzekfrdrzkoecfk`).
3. **Placeholder Keys**: The service-role secret key `SUPABASE_SERVICE_KEY` in git-tracked `.env.example` must remain a placeholder. Developers must manually populate gitignored local `.env` files with the actual staging key.
4. **Git Isolation**: Active env files (`.env`, `.env.local`, `.env.staging`) must never be added to git or committed.

---

## 5. Railway-Specific Routing & IP Resolution

### The Railway IP Resolution Problem
Railway Edge routers act as reverse proxies, distributing requests to internal containers. In doing so, they terminate requests and append the client's original IP address to the `x-forwarded-for` (XFF) header. The connection socket's remote address itself becomes a private Railway CGNAT address (typically `100.64.x.x` or similar private block).

If the backend relies on standard Express `req.ip` or socket properties directly, it will capture these internal platform IPs instead of the visitor's public IP. This breaks:
- Cookieless visitor salt generation (visitor hashes will overlap).
- IP-based rate limiting (legitimate requests will block one another).
- Geo-location lookup (all visitors will resolve to the platform hosting center).
- Conversions API (CAPI) dispatches.

### The Solution: `ST_IP_RESOLVER_MODE=railway`
When `ST_IP_RESOLVER_MODE=railway` is set, the API uses the resolver utility in `api/lib/ip-resolver.js`:
1. It reads the raw `x-forwarded-for` header chain.
2. It parses and filters the chain from left to right, testing each IP with `isPublicIp()`.
3. It selects the **first valid public IP** in the chain. This prevents internal platform IPs from being used and rejects spoofed headers.

> [!IMPORTANT]
> The setting `ST_IP_RESOLVER_MODE=railway` must be explicitly configured in the Railway dashboard for the production service. In local development or local docker environments, it should remain unset or configured as `connection` to prevent warning flags when no XFF headers are sent by the browser.

---

## 6. CORS & Allowed Origins Checklist

* **Hardcoded Allowed Origins**: The backend has a permanent list of authorized admin/dashboard origins:
  - `https://www.sourcetrack.ai`
  - `https://sourcetrack.ai`
  - `https://app.sourcetrack.ai`
  - `http://localhost:5173`
  - `http://localhost:8080`
* **Dynamic CORS**: For customer domains, the CORS handler queries the Supabase database. Incoming origins are validated against registered sites:
  1. The handler extracts the hostname from the request's `Origin` header.
  2. It queries `sites` to check if a record matching the hostname exists.
  3. If a match is found, it dynamically appends the domain to `Access-Control-Allow-Origin`.
* **Telemetry Endpoints CORS**: Pixel-tracking, pageview, conversion, and identifier endpoints (/api/track, /api/collect, /api/conversion, /api/identify, /api/tracker/id) dynamically echo the client origin `Access-Control-Allow-Origin: *` to prevent blocking ingestion scripts on third-party domains.

---

## 7. Tracker & API URL Assumptions

1. **Canonical Ingestion Path**: All snippets served in settings and quick-start docs point to:
   - `https://api.srctk.com/tracker.min.js` (Standard)
   - `https://api.srctk.com/tracker.cookieless.min.js` (Cookieless)
2. **Backward Compatibility**: The legacy paths `/tracker/tracker.min.js` and `/tracker/tracker.cookieless.min.js` must be preserved.
3. **CAPI & Server-side Events**: Server-side events use `/api/server/event` and require the header `Authorization: Bearer` containing a private server token. These tokens must never be embedded in client-side script snippets.

---

## 8. Secrets Handling Rules

1. **No secrets in code**: Never hardcode client secrets, tokens, or credentials in any file in the repository.
2. **No console logs with secrets**: Ensure that uncaught exception handlers or query loggers strip JWT headers (like eyJ...), database URLs containing passwords, Stripe secret keys, and Resend API keys.
3. **Safe Environment Diagnostic Mode**: The endpoint `/api/diag/ip` is guarded by `ST_IP_DIAGNOSTIC_SECRET`. This secret must be random and is recommended to be left unset in production to fully deactivate the diagnostic router.

---

## 9. Verification Evidence Template

*When the operator manually audits the Railway and Supabase consoles, they must fill out and append this verification log:*

```markdown
### Environment Verification Log - [DATE]
* **Verified By:** [Operator Name]
* **Production Railway Console Audited:** [Yes/No]
* **Production Supabase Console Audited:** [Yes/No]
* **ST_IP_RESOLVER_MODE Verified as 'railway' in Prod:** [Yes/No]
* **ENCRYPTION_KEY Configured and Verified:** [Yes/No]
* **CORS allowed origins match registered routes:** [Yes/No]
* **No local workstation paths in console variables:** [Yes/No]
* **Staging Env safety guard verified:** [Yes/No]
* **Staging and Production Credentials Fully Isolated:** [Yes/No]
* **Verification Status:** [SUCCESS / FAILED]
```

---

## 10. Remaining Blockers

1. **Staging Schema Setup (139I-C)**: The staging Supabase project database schema must be bootstrapped and incremental migrations applied before Stripe E2E testing can proceed.
2. **Staging credentials provision**: Staging DB credentials and staging service-role key must be added locally to unblock the bootstrap script execution.
3. **Manual Production Env Verification**: The operator must execute the verification steps described in this document and fill out the evidence template before release.
