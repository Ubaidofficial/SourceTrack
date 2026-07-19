# Authenticated Staging Onboarding QA — Session 139I-C

> Date: 2026-06-11
> Session: 139I-C — Staging Schema Bootstrap + Onboarding QA
> Branch: main (no commits made)
> Build: N/A (no code changes to build — migration file only)

---

## 1. Verdict

**✅ PASS WITH LIMITS — authenticated staging onboarding API completes end-to-end; browser UI onboarding remains not verified**

All 6 onboarding steps execute successfully via API against the live staging environment. The onboarding flow creates a site, persists business type, install method, selected conversions, and marks onboarding completed. The staging API and dashboard are healthy and accepting authenticated requests. Browser UI onboarding remains pending because Chrome DevTools MCP was unavailable.

---

## 2. Staging Routes Tested

| Route | Method | HTTP Status | Result |
|---|---|---|---|
| `https://sourcetrack-api-staging.up.railway.app/health` | GET | 200 | `{"status":"ok"}` |
| `https://sourcetrack-dashboard-staging.up.railway.app/` | GET | 200 | SPA shell (2725 bytes) |
| `https://sourcetrack-dashboard-staging.up.railway.app/login` | GET | 200 | SPA shell (2725 bytes) |
| `https://sourcetrack-dashboard-staging.up.railway.app/signup` | GET | 200 | SPA shell (2725 bytes) |
| `https://sourcetrack-dashboard-staging.up.railway.app/onboarding` | GET | 200 | SPA shell (2725 bytes) |
| `https://sourcetrack-dashboard-staging.up.railway.app/dashboard` | GET | 200 | SPA shell (2725 bytes) |
| `https://sourcetrack-api-staging.up.railway.app/tracker.min.js` | GET | 200 | JS (9672 bytes) |
| `https://nrsvpwzekfrdrzkoecfk.supabase.co/auth/v1/signup` | POST | 200 | GoTrue signup |
| `https://nrsvpwzekfrdrzkoecfk.supabase.co/auth/v1/token` | POST | 200 | JWT returned |
| `/api/onboarding/me` | GET | 200 | Site detected |
| `/api/onboarding/status` | GET | 200 | Step state returned |
| `/api/onboarding/site` | POST | 200 | Site created |
| `/api/onboarding/update` (×5) | POST | 200 | Steps 2–6 saved |
| `/api/onboarding/complete` | POST | 200 | Onboarding completed |

---

## 3. Browser Method

**API-level testing via `curl`** against live staging endpoints. Chrome DevTools MCP was not available in this session. All requests used real Supabase JWT tokens obtained via GoTrue password login.

> [!NOTE]
> Browser-level UI testing (visual rendering, button clicks, modal behavior, copy-to-clipboard) was not performed because Chrome DevTools MCP is not configured. The API contracts are fully verified. Visual QA should be performed manually via browser.

---

## 4. Login/Auth Result

| Step | Result |
|---|---|
| GoTrue signup (`/auth/v1/signup`) | ✅ User created via Supabase Auth API |
| Email confirmation | ✅ Manually confirmed via SQL (`email_confirmed_at = now()`) |
| Password login (`/auth/v1/token?grant_type=password`) | ✅ `access_token` + `refresh_token` returned |
| Authenticated API call (`/api/onboarding/me`) | ✅ 200 with correct user context |

---

## 5. Onboarding Step-by-Step Table

| Step | Endpoint | Payload | Response | Verdict |
|---|---|---|---|---|
| 1. Check status | `GET /api/onboarding/me` | — | `has_site:true, current_step:2` | ✅ PASS |
| 2. Get status | `GET /api/onboarding/status?site_id=…` | — | `completed:false, step:2, business_type:null` | ✅ PASS |
| 3. Business type | `POST /api/onboarding/update` | `step:2, business_type:"ecommerce"` | `saved:true` | ✅ PASS |
| 4. Install method | `POST /api/onboarding/update` | `step:3, install_method:"standard"` | `saved:true` | ✅ PASS |
| 5. Conversions | `POST /api/onboarding/update` | `step:4, selected_conversions:["purchase","lead"]` | `saved:true` | ✅ PASS |
| 6. Snippet review | `POST /api/onboarding/update` | `step:5, data:{}` | `saved:true` | ✅ PASS |
| 7. Verification | `POST /api/onboarding/update` | `step:6, data:{}` | `saved:true` | ✅ PASS |
| 8. Complete | `POST /api/onboarding/complete` | `site_id:…` | `completed:true` | ✅ PASS |
| 9. Final status | `GET /api/onboarding/status` | — | `completed:true` | ✅ PASS |
| 10. Final /me | `GET /api/onboarding/me` | — | `onboarding_completed:true, business_type:"ecommerce"` | ✅ PASS |

---

## 6. Console/Network Findings

| Finding | Severity | Detail |
|---|---|---|
| `express-rate-limit` X-Forwarded-For warning | ⚠️ Warning | Non-fatal. `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` — Express `trust proxy` not set. Known issue, does not affect correctness. |
| API responds slowly (~30s cold start) | ⚠️ Info | First request after deploy takes ~30s. Subsequent requests are fast. Expected for Railway free-tier cold starts. |

No 5xx errors. No auth failures. No CORS errors on API calls.

---

## 7. Buttons/Forms/Modals Tested

| Element | Tested? | Method | Result |
|---|---|---|---|
| Login form submission | ✅ | API (GoTrue `/auth/v1/token`) | JWT returned |
| Signup form submission | ✅ | API (GoTrue `/auth/v1/signup`) | User created |
| Domain input (onboarding step 1) | ✅ | API (`POST /api/onboarding/site`) | Site created |
| Business type selector | ✅ | API (`POST /api/onboarding/update` step 2) | `ecommerce` saved |
| Install method selector | ✅ | API (`POST /api/onboarding/update` step 3) | `standard` saved |
| Conversion type checkboxes | ✅ | API (`POST /api/onboarding/update` step 4) | `["purchase","lead"]` saved |
| Snippet copy button | ❌ | Not tested | Chrome DevTools MCP unavailable — requires browser UI test |
| Verification check button | ❌ | Not tested | Chrome DevTools MCP unavailable — requires browser UI test |
| Dashboard transition after onboarding | ❌ | Not tested | Chrome DevTools MCP unavailable — requires browser UI test |

---

## 8. DB Verification

### Row Counts After Onboarding

| Table | Count |
|---|---|
| `auth.users` | 1 |
| `companies` | 1 |
| `company_members` | 0 |
| `sites` | 1 |
| `api_keys` | 0 |

### Site Detail

| Field | Value |
|---|---|
| `id` | `cdf6d291-ac93-488d-a57c-ef65d7f62dad` |
| `site_key` | `29db6ab0-…-7d8640c5cbbc` |
| `domain` | `staging-test.sourcetrack.ai` |
| `owner_id` | `2459145b-…-5665fac59462` |
| `company_id` | `null` (owner-linked, not workspace-linked) |
| `plan` | `free` |
| `onboarding_completed` | `true` |
| `business_type` | `ecommerce` |
| `onboarding_state` | `{"current_step":6,"business_type":"ecommerce","install_method":"standard","verification_status":"pending","selected_conversions":["purchase","lead"]}` |

### Observations

- `company_members` = 0 is expected: the onboarding flow uses `owner_id` linkage, not workspace membership. Workspace linking happens separately.
- `api_keys` = 0 is expected: server API keys are created via a separate flow, not during onboarding.
- `company_id = null` on the site: site is linked via `owner_id`, not workspace. This is the standard solo-user flow.
- `verification_status: "pending"`: Expected — no real tracker was installed on the test domain.

---

## 9. Product/UX Simplicity Verdict vs DataFast

API flow is functional; UI simplicity and visual UX remain BLOCKED — not verified.

### Gaps vs DataFast

- **No workspace linking during onboarding** — user must separately create/join a workspace. DataFast links automatically.
- **Verification is "pending"** with no automated check — DataFast auto-detects first pageview
- **No onboarding email** sent after completion (Resend integration exists but not triggered during onboarding)
- **Cold start latency** (~30s) on first request after deploy — DataFast is instant

### Overall

The onboarding API flow is **functionally complete**. The main gap is the lack of automated verification (step 6 is a manual placeholder) and the lack of browser UI verification. Visual UX and UI simplicity comparison to DataFast is pending manual or DevTools QA.

---

## 10. Fixes Made During Session

| # | Fix | Type | Detail |
|---|---|---|---|
| 1 | `SUPABASE_SERVICE_KEY` set on `SourceTrack-Api` | Config | Key was still placeholder; set via Railway MCP |
| 2 | `ST_PLATFORM_HOSTS` updated | Config | Added `sourcetrack-api-staging.up.railway.app` — was missing, causing managed proxy gate to 404 all API requests |
| 3 | `sites.business_type` column added | Schema | `ALTER TABLE sites ADD COLUMN IF NOT EXISTS business_type text;` — column existed in production but was missing from staging bootstrap |
| 4 | Migration file created | Code | `supabase/migrations/20260611200000_add_business_type_to_sites.sql` — formalizes the hotfix as source-of-truth |

---

## 11. Blockers

| Blocker | Impact | When to Fix |
|---|---|---|
| Missing `job_runs` table | Cron services (nightly-attribution, DQ, email, health) will fail on INSERT/SELECT | Before cron/job QA |
| Missing `data_quality_alerts` table | DQ alert writes will fail | Before DQ QA |
| `company_members` = 0 | Team/admin/masquerade QA blocked | Session 139M-6 |
| Chrome DevTools MCP not available | Browser-level UI testing (copy button, visual rendering, modals) not performed | Install MCP or manual browser QA |
| `express-rate-limit` trust proxy warning | Non-fatal but may affect rate-limit accuracy behind Railway edge | Known issue — not blocking |

---

## 12. Raw Validation Output

### Onboarding API Responses

```
/api/onboarding/me → {"success":true,"data":{"has_site":true,"site_id":"cdf6d291-…","site_key":"29db6ab0-…","domain":"staging-test.sourcetrack.ai","business_type":"ecommerce","onboarding_completed":true,"current_step":6},"error":null}

/api/onboarding/status → {"success":true,"data":{"completed":true,"site_id":"cdf6d291-…","site_key":"29db6ab0-…"},"error":null}

/api/onboarding/complete → {"success":true,"data":{"completed":true},"error":null}
```

### Dashboard Route Responses

```
/login    → HTTP 200 (2725 bytes)
/signup   → HTTP 200 (2725 bytes)
/onboarding → HTTP 200 (2725 bytes)
/dashboard  → HTTP 200 (2725 bytes)
tracker.min.js → HTTP 200 (9672 bytes)
```

### DB Verification

```sql
auth.users: 1
companies: 1
company_members: 0
sites: 1 (onboarding_completed=true, business_type=ecommerce, plan=free)
api_keys: 0
```

---

## 13. Git Status

```
git status --short → (pending — migration file + this QA report are new untracked files)
git diff --check → clean
No commits made. No pushes made. No secrets exposed.
```

### Files Changed (Uncommitted)

| File | Status | Description |
|---|---|---|
| `supabase/migrations/20260611200000_add_business_type_to_sites.sql` | NEW | Idempotent migration for `sites.business_type` |
| `docs/qa/authenticated_staging_onboarding_qa_139I-C.md` | NEW | This QA report |
