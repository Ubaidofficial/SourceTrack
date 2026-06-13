# QA Report — Session 140G-21 — Env Blocker Fix + Tracker ID Smoke

## Verdict
🟡 PARTIAL

## Changes Made
Staged and verified environment-only changes through the Railway MCP server:
1. **TRACKER_SALT Configured**: Set cryptographically secure, 64-character hex strings for `TRACKER_SALT` in both the `production` and `staging` environments for the `SourceTrack-Api` service.
2. **NODE_ENV Set to Staging**: Changed `NODE_ENV` from `production` to `staging` on the staging `SourceTrack-Api` service. This activates the `enforceEnvironmentSafety` boot guard on staging to prevent accidental production database calls if URL parameters are mismatched.
3. **Stripe Credentials Audit**: Audited `sourcetrack-health` and confirmed Stripe credentials are only used in a presence checklist (`env_vars`) in `api/jobs/health-agent.js`. No Stripe API methods are called by this agent.

---

## Evidence Table

| Service | Environment | Item | Before | After | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SourceTrack-Api** | Production | `TRACKER_SALT` | `Missing` | Present — value not printed | ✅ PASS | Secure cryptographic salt configured on production API. |
| **SourceTrack-Api** | Staging | `TRACKER_SALT` | `Missing` | Present — value not printed | ✅ PASS | Secure cryptographic salt configured on staging API. |
| **SourceTrack-Api** | Staging | `NODE_ENV` | `production` | `staging` | ✅ PASS | Enables active environment safety checks on staging. |
| **sourcetrack-health** | Production | Stripe Credentials | Test credentials configured | Test credentials configured | 🚨 MISMATCH | Required only by `health-agent.js` presence check; recommend removing requirement. |

---

## Tracker ID Smoke

| Endpoint | Environment | Request Shape | Status | Safe Response Evidence | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /api/tracker/id` | Staging | Query: `?site_key=[redacted_test_site_key]` | `200 OK` | JSON containing `visitor_id` and `session_id` (64-character hex hashes), with `x-request-id` header present | ✅ PASS |

Staging API returned:
```json
{
  "visitor_id": "[64-char hex hash]",
  "session_id": "[64-char hex hash]"
}
```
Along with headers:
- `cache-control: no-store, no-cache, must-revalidate`
- `access-control-allow-origin: *`
- `x-request-id: [uuidv4]`

---

## Remaining Blockers
- **Production Stripe Credentials**: The main production `SourceTrack-Api` lacks `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Paid checkout is blocked.
- **Stripe Test Keys in Production Health**: Production `sourcetrack-health` uses test-mode credentials (`sk_test_...` and `whsec_...`) to pass its presence check.
- **PostHog Sharing**: The staging and production environments continue to share PostHog Project ID `416017` and keys, causing telemetry cross-pollution.

---

## Secrets Handling
No private secret values are intentionally committed in this report. All observed environment values are redacted to presence, mode, or project-ref classification only.

---

## Release Readiness Impact
The **Production Env/Secrets Verification** gate remains **PARTIAL (PENDING/BLOCKED)**. While the `TRACKER_SALT` blocker has been successfully resolved for both production and staging, and the staging safety check has been reinforced by setting `NODE_ENV=staging`, the gate cannot be marked `PASS` until production Stripe secrets are configured and the PostHog project separation is addressed.
