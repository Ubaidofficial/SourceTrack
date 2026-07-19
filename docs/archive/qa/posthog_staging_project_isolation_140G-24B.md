# QA Report — Session 140G-24B — PostHog Staging / Production Separation + Runtime Isolation Verification

## Verdict
PASS

## Token Exposure & Rotation
- The initial staging PostHog write token was exposed in agent output.
- The staging write token was rotated/regenerated in the PostHog console before approval.
- The rotated token was successfully applied to the Railway staging services.
- The affected staging services were redeployed to ensure the rotated key is live.
- Runtime isolation was reverified after token rotation.
- The post-rotation test event (`stg_sep_140G_24B_rotated_1781438681`) successfully appeared in the staging PostHog project 469905.
- The post-rotation test event did not appear in the production PostHog project 416017.
- No raw token fragments or prefix/suffix fingerprints are included in any reports or control docs.

## Environment Audit
Service | Environment | Variable | Safe Evidence | Shared With Other Env? | Status
--- | --- | --- | --- | --- | ---
SourceTrack-Api | Production | `POSTHOG_PROJECT_ID` | Present (`416017`) | No | ✅ PASS
SourceTrack-Api | Production | `POSTHOG_API_KEY` | Present (phx_[REDACTED] personal key) | No | ⚠️ Warning (Query token)
SourceTrack-Api | Production | `POSTHOG_PERSONAL_API_KEY` | Present (phx_[REDACTED] personal key) | No | ✅ PASS
SourceTrack-Api | Production | `POSTHOG_HOST` | Present (Reverse proxy URL) | Yes | ✅ PASS (Shared proxy)
SourceTrack-Api | Staging | `POSTHOG_PROJECT_ID` | Present (`469905`) | No | ✅ PASS
SourceTrack-Api | Staging | `POSTHOG_API_KEY` | Present (phc_[REDACTED] project key) | No | ✅ PASS
SourceTrack-Api | Staging | `POSTHOG_PERSONAL_API_KEY` | Present (phx_[REDACTED] personal key) | No | ✅ PASS
SourceTrack-Api | Staging | `POSTHOG_HOST` | Present (Reverse proxy URL) | Yes | ✅ PASS (Shared proxy)
SourceTrack-Dashboard | Production | `VITE_POSTHOG_API_KEY` | Present (phc_[REDACTED] project key) | No | ✅ PASS
SourceTrack-Dashboard | Production | `VITE_POSTHOG_HOST` | Present (us.i.posthog.com) | Yes | ✅ PASS
SourceTrack-Dashboard | Staging | `VITE_POSTHOG_API_KEY` | Present (phc_[REDACTED] project key) | No | ✅ PASS
SourceTrack-Dashboard | Staging | `VITE_POSTHOG_HOST` | Present (us.i.posthog.com) | Yes | ✅ PASS
sourcetrack-health | Production | `POSTHOG_PROJECT_ID` | Present (`416017`) | No | ✅ PASS
sourcetrack-health | Production | `POSTHOG_API_KEY` | Present | No | ✅ PASS

### Redacted Fingerprint / Hash Comparison Evidence

No full key values are printed. Redacted fingerprint analysis details:

```text
POSTHOG_PROJECT_ID:
- staging: 469905 (SourceTrack Staging)
- production: 416017 (Default project)
- verdict: isolated (different projects)

POSTHOG_API_KEY (SourceTrack-Api):
- staging: phc_[REDACTED] (write token)
- production: phx_[REDACTED] (personal key)
- verdict: isolated (different keys)

VITE_POSTHOG_API_KEY (SourceTrack-Dashboard):
- staging: phc_[REDACTED] (write token)
- production: phc_[REDACTED] (write token)
- verdict: isolated (different keys)

POSTHOG_HOST (SourceTrack-Api):
- staging: posthog-reverse-proxy-production-2b25.up.railway.app
- production: posthog-reverse-proxy-production-2b25.up.railway.app
- verdict: shared proxy host (acceptable path-routing separation)
```

## Runtime Verification
Test | Expected | Observed | Status
--- | --- | --- | ---
Discover separate project | Multiple projects found in PostHog account | Checked via `projects-get`: project `416017` and project `469905` exist | ✅ PASS
Staging Ingest test event capture | Staging test event captured in Staging PostHog | Event `stg_sep_140G_24B_rotated_1781438680` and `stg_sep_140G_24B_rotated_1781438681` captured in project `469905` | ✅ PASS
Production Ingest isolation | Staging test event is absent from Production PostHog | Event count for `stg_sep_140G_24B_rotated_%` returned 0 records in project `416017` | ✅ PASS

### Runtime Verification Evidence

Staging PostHog (`469905`) Query:
```sql
SELECT event, timestamp FROM events WHERE timestamp >= now() - INTERVAL 10 MINUTE LIMIT 100
```
Result:
```text
event|timestamp
stg_sep_140G_24B_rotated_1781438681|2026-06-14T10:52:03.243000Z
stg_sep_140G_24B_rotated_1781438680|2026-06-14T10:51:33.974000Z
```

Production PostHog (`416017`) Query:
```sql
SELECT count() AS cnt FROM events WHERE event LIKE 'stg_sep_140G_24B_rotated_%' AND timestamp >= now() - INTERVAL 1 DAY
```
Result:
```text
cnt
0
```

## Post-Rotation Deployment Verification
- SourceTrack-Api: redeployed after rotated token applied — PASS
- SourceTrack-Dashboard: rebuilt/redeployed after rotated token applied — PASS
- nightly-attribution: redeployed after rotated token applied — PASS / not applicable
- sourcetrack-dq: redeployed after rotated token applied — PASS / not applicable
- sourcetrack-health: redeployed after rotated token applied — PASS / not applicable
- sourcetrack-email: redeployed after rotated token applied — PASS / not applicable

## Data Contamination Risk
Future staging-to-production contamination risk for verified staging API/browser telemetry is mitigated after 140G-24B. Historical contamination from before the separation may still exist in production PostHog and pre-140G-24B QA evidence should not be treated as clean.

## Remaining Blockers
None for this gate. Session 140G-25 browser QA can now safely proceed.
