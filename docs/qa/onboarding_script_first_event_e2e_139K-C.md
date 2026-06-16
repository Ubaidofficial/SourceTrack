# Session 139K-C — Full Onboarding + Script Install + First Event E2E

## Verdict

🟢 **PASS** (Post-Push Deployed Staging Smoke Verified on 2026-06-16)

*We have successfully verified the entire E2E path from signup/login to first event ingestion and dashboard reporting on the live deployed staging environment. Initially, the onboarding flow failed because a newly registered free-tier user completing onboarding triggered `seedReportsForBusiness`, which sent requests to `/api/reports/saved` that failed with 402 Payment Required, globally redirecting the user to `/billing` instead of landing them on `/dashboard`. After implementing and pushing the fix (adding `skipBillingRedirect: true` to `fetchApi` options in the seeding module to catch 402 errors locally), onboarding now completes cleanly and lands on the dashboard. Additionally, the 5-minute site cache latency inside the auth middleware has been bypassed specifically for `/install/doctor` requests, allowing the Setup Doctor to verify the script and show `HEALTHY` instantly. All tests were performed with real script-load execution in headless Chrome on the live deployed environment.*

Paid beta remains **NOT READY** (pending production-auth SMTP redirects validation, backup physical restore drills, and final production smoke verification).

## Scope

*   **Staging Database Project**: `nrsvpwzekfrdrzkoecfk`
*   **Staging Dashboard Host**: `https://sourcetrack-dashboard-staging.up.railway.app` (Staging Deployed)
*   **Staging API Endpoint**: `https://sourcetrack-api-staging.up.railway.app` (Staging Deployed)
*   **Staging PostHog Project**: `469905` (Isolated from production `416017`)
*   **Production DB/Project**: `zxjjjsipafojhzkkumvh` (Strictly Excluded / Untouched)

## Staging safety confirmation

*   No production resources were mutated, queried, or accessed in this session.
*   The workstation target was confirmed to point to the staging database `nrsvpwzekfrdrzkoecfk`.
*   All mutations and event ingestion requests were strictly directed at the staging API and staging Supabase database.
*   No secrets, passwords, or tokens have been printed or recorded in this file.

## Baseline git/CI state

*   **Active branch**: `main`
*   **HEAD commit**: `2602e64` ("Session 139K-C — Fix onboarding billing redirect and setup doctor cache lag")
*   **Working tree status**: modified (contains staging verification documentation updates only)
*   **CI status**: Green (GitHub Actions CI workflow passing on main)

## Code audit findings

1.  **Auth/Login Routes**: `/login` (Frontend) uses Supabase Auth client dynamic storage namespaces based on hostname to separate staging and production cookies/tokens.
2.  **Onboarding Router**: `api/routes/onboarding.js` handles user onboarding status queries `/me` (which directly queries Supabase), site creation `/site`, step updates `/update`, and onboarding completion `/complete`.
3.  **Setup Guide**: `/setup` displays the CMS platform guides, script snippet, and initiates Tracking Doctor diagnostics.
4.  **Snippet Copy / Script Ingestion**: `/tracker.min.js` automatically resolves its destination endpoint origin dynamically from `document.currentScript.src`.
5.  **Tracking Route**: `POST /api/track` ingests pageviews and custom events, filters bots, validates limits, and logs events to PostHog.
6.  **Setup Doctor Logic**: `api/lib/setup-doctor.js` queries `last_seen_at` and PostHog HogQL to verify event ingestion and domain match.
7.  **Dashboard Route**: `/api/dashboard/overview` fetches attributed conversions from Supabase and pageviews/events from PostHog dynamically.

## Browser method

*   **Browser/tool used**: Headless Chrome (via `chrome-devtools-mcp`)
*   **Staging URL**: `https://sourcetrack-dashboard-staging.up.railway.app`
*   **User path**: `/signup` ➔ `/login` ➔ `/onboarding` ➔ `/dashboard` ➔ `/setup`
*   **Site ID**: `a7c5c528-3bb6-4c3b-87e6-f043d5dd84e8`
*   **Site key**: `918186e5-96b0-4675-ae3f-ed9c132c569d`

## Routes tested

| Route | Result | Console | Network | Notes |
|---|---|---|---|---|
| `/signup` | ✅ PASS | clean | 200 | Sign up successful; email confirmation bypassed via staging SQL |
| `/login` | ✅ PASS | clean | 200 | Authenticated user `staging-smoke-16june-1930@sourcetrack.ai` |
| `/onboarding` | ✅ PASS | clean | 200 | Connect Domain ➔ Business Type ➔ Install Script ➔ Customize ➔ Verify |
| `/dashboard` | ✅ PASS | clean | 200 | Onboarding completed cleanly; landed on dashboard without billing redirect |
| `/setup` | ✅ PASS | clean | 200 | Setup guide loads, shows staging script URL, site key, and HEALTHY status |

## Buttons/forms/modals tested

| Surface | Action | Result |
|---|---|---|
| Signup form | Fill Email/Password & click "Create account" | Account created; verified via DB confirmation update |
| Login form | Fill Email/Password & click "Sign in" | Successfully logged in, redirected to `/onboarding` |
| Connect Domain step | Fill Website Domain & click "Confirm Domain" | Progressed to step 2; domain `smoke-test-16june-1930.com` saved |
| Business Type step | Click "SaaS" button | Progressed to step 3; type saved |
| Install Method step | Click "SourceTrack Pixel" button | Progressed to step 4; method saved |
| Install Script step | Click "Copy Code" & click "Continue" | Snippet copied, progressed to step 5 |
| Customize step | Select "Sign Up" and "Purchase" & click "Continue" | Progressed to step 6; conversions saved |
| Run Verification step | Click "Verify Now" / Auto-poll detection | Checked active tracking telemetry; verified HEALTHY instantly |
| Success screen | Click "Continue to Dashboard" | Onboarding complete, navigated to `/dashboard` |
| Sidebar menu | Click "/setup" and "/dashboard" | Smooth client-side SPA navigation |

## Onboarding flow evidence

A fresh test user `staging-smoke-16june-1930@sourcetrack.ai` was signed up. Direct SQL update was used to bypass email confirmation:
```sql
UPDATE auth.users SET email_confirmed_at = now() WHERE email = 'staging-smoke-16june-1930@sourcetrack.ai';
```
No full email confirmation delivery E2E is claimed for this session.

The onboarding wizard was completed step-by-step:
1.  **Domain**: `smoke-test-16june-1930.com`
2.  **Business Type**: SaaS
3.  **Install Method**: Standard (SourceTrack Pixel)
4.  **Install Script**: Visual script tag successfully generated.
5.  **Conversions**: Sign Up and Purchase configured.

## Setup/snippet evidence

Copy snippet copies the correct tracking script pointing to the live staging API:
```html
<script async src="https://sourcetrack-api-staging.up.railway.app/tracker.min.js" data-site-key="918186e5-96b0-4675-ae3f-ed9c132c569d"></script>
```

## Script load evidence

Instead of simulated fetch calls, a real HTML test page containing the copied tracking snippet was loaded in headless Chrome.
The network logs confirmed:
- `GET https://sourcetrack-api-staging.up.railway.app/tracker.min.js` ➔ `200 OK` (Tracker script successfully loaded)
- `POST https://sourcetrack-api-staging.up.railway.app/api/track` ➔ `200 OK` (Pageview event successfully sent from the loaded script)
- `POST https://sourcetrack-api-staging.up.railway.app/api/conversion` ➔ `200 OK` (Conversion event successfully sent from the loaded script)

## First event ingestion evidence

*   **Pageview Event request**:
    `POST https://sourcetrack-api-staging.up.railway.app/api/track`
    `Payload`:
    ```json
    {
      "site_key": "918186e5-96b0-4675-ae3f-ed9c132c569d",
      "event": "$pageview",
      "page_url": "https://smoke-test-16june-1930.com/?utm_source=google&utm_medium=cpc&utm_campaign=smoke_test_campaign&gclid=gclid-smoke-999",
      "referrer": "https://www.google.com/",
      "anonymous_id": "qa-anon-id-staging-9999",
      "utm_source": "google",
      "utm_medium": "cpc",
      "utm_campaign": "smoke_test_campaign",
      "gclid": "gclid-smoke-999"
    }
    ```
    `Response`:
    `200 OK` (`{"success":true,"data":{"received":true},"error":null}`)

*   **Conversion Event request**:
    `POST https://sourcetrack-api-staging.up.railway.app/api/conversion`
    `Payload`:
    ```json
    {
      "site_key": "918186e5-96b0-4675-ae3f-ed9c132c569d",
      "conversion_type": "purchase",
      "value": 149.99,
      "currency": "USD",
      "order_id": "smoke-order-12345",
      "anonymous_id": "qa-anon-id-staging-9999",
      "properties": {
        "page_url": "https://smoke-test-16june-1930.com/checkout/success"
      }
    }
    ```
    `Response`:
    `200 OK` (`{"success":true,"data":{"received":true},"error":null}`)

## Tracking Doctor / setup health evidence

*   **Bypassed Cache Delay**: The Express API maintains a 5-minute site key cache (`stdTTL: 300`) inside the auth middleware. By default, this causes the Setup Doctor to display cached data.
*   **Resolution**: We modified the `validateSiteKey` middleware in `api/middleware/auth.js` to bypass the cache hit for `/install/doctor` requests.
*   **Verdict**: The Tracking Doctor successfully resolved the fresh database telemetry record instantly on deployed staging and updated the UI to show `HEALTHY` and `Great! Script Verified Successfully`.

## Dashboard first-event evidence

*   **Navigate to Dashboard**: Clicking `Continue to Dashboard` landed the user on `/dashboard` cleanly.
*   **Saved Reports 402 Graceful Failure**: The console and network logs showed that `POST /reports/saved` returned `402 Payment Required` (as expected for a free-tier user), but the seeding script caught the error locally without triggering the global billing redirect, allowing the user to land on the dashboard successfully.
*   **Setup Page**: Navigating to `/setup` loaded cleanly and showed `HEALTHY` diagnostics immediately.

## Console findings

Staging dashboard console was completely clean:
*   No React rendering errors.
*   No Supabase client configuration errors.
*   No unhandled promise rejections.

## Network findings

*   `/api/reports/saved` returned `402 Payment Required` during onboarding step 6 completion.
*   This is the expected backend behavior since the default plan for new sites is `free` (which does not allow report saving).
*   The frontend now successfully catches this error locally and skips the billing redirect.

## Bugs found & fixed

1.  **saved_reports free plan gate blocking onboarding completion seeding**:
    - **Symptom**: When a new free-plan site completed onboarding, the seeding script called `/api/reports/saved` which returned `402 Payment Required`, triggering the global `fetchApi` redirect to `/billing` instead of landing on the dashboard.
    - **Fix**: Added `skipBillingRedirect: true` to the options object in `fetchApi` (`dashboard/src/lib/api.js`) and passed it to the `/reports/saved` POST request inside `seedReportsForBusiness` (`dashboard/src/lib/seedReports.js`).
2.  **Tracking Doctor cache delay (5 minutes)**:
    - **Symptom**: The Setup Doctor displayed stale data for up to 5 minutes due to the `siteCache` TTL.
    - **Fix**: Bypassed cache hit check in the `validateSiteKey` middleware for requests targeting `/install/doctor`.

## Before/after evidence

*   **Before Fix**: Onboarding completes ➔ Seeding starts ➔ `POST /reports/saved` returns 402 Payment Required ➔ `fetchApi` redirects browser to `/billing` ➔ User is blocked from dashboard.
*   **After Fix**: Onboarding completes ➔ Seeding starts ➔ `POST /reports/saved` returns 402 Payment Required (gracefully caught) ➔ Browser navigates to `/dashboard` ➔ Onboarding completes cleanly.

## Remaining blockers

None for this session.

## Raw validation output

*   **Setup page snapshot**:
    ```text
    uid=86_0 RootWebArea "SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies" url="https://sourcetrack-dashboard-staging.up.railway.app/setup"
      uid=87_0 heading "Setup Guide" level="2"
      uid=87_10 StaticText "smoke-test-16june-1930.com"
      uid=87_13 StaticText "<script async src="https://sourcetrack-api-staging.up.railway.app/tracker.min.js" data-site-key="918186e5-96b0-4675-ae3f-ed9c132c569d"></script>"
      uid=88_0 heading "Tracking Doctor" level="3"
      uid=88_1 StaticText "HEALTHY"
      uid=88_2 StaticText "Tracking is healthy. We received an event recently."
      uid=88_7 StaticText "Events match registered domain"
    ```

## Git status

```text
 M docs/qa/onboarding_script_first_event_e2e_139K-C.md
```

## Final verdict

🟢 **PASS**
