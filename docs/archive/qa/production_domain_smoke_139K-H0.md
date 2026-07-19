# Session 139K-H0 — Production Domain Smoke: Website + App Shell Only

## Verdict

🟢 **PASS**

We have safely verified the production public website and app shell domains. All checks completed successfully without any production database mutations, tracking events, or network/console leaks.

## Safety & Invariant Confirmations

*   **No production users** were created.
*   **No production sites** were registered.
*   **No production tracking events** were sent.
*   **No production webhooks** were triggered.
*   **No billing actions** were performed.
*   **No direct production Supabase database reads, writes, or mutations** were performed by the tester.
*   **No secrets, cookies, auth headers, passwords, tokens, or session values** were printed, recorded, or logged in this document or the console.
*   The smoke test was strictly limited to read-only route, domain, and app-shell inspection.

## Route Verification Details

### 1. Route: https://sourcetrack.ai
*   **Exact URL Checked**: `https://sourcetrack.ai`
*   **Page Title / Visible State**: Redirected to target.
*   **Redirect Behavior**: `HTTP/2 301` redirect to `https://www.sourcetrack.ai/`.
*   **Console Findings**: N/A (Redirected)
*   **Network Findings**: Successfully redirected with no errors.
*   **4xx/5xx Status Codes**: None.
*   **Staging Configuration Leakage**: None.
*   **Production Mutation**: None.

### 2. Route: https://www.sourcetrack.ai
*   **Exact URL Checked**: `https://www.sourcetrack.ai/`
*   **Page Title / Visible State**: `SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies`
*   **Redirect Behavior**: None (`200 OK`). Serves the marketing website page.
*   **Console Findings**: Clean console, no errors.
*   **Network Findings**: Loaded index page shell and marketing assets successfully.
*   **4xx/5xx Status Codes**: None.
*   **Staging Configuration Leakage**: None.
*   **Production Mutation**: None.

### 3. Route: https://app.sourcetrack.ai
*   **Exact URL Checked**: `https://app.sourcetrack.ai/`
*   **Page Title / Visible State**: `SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies`
*   **Redirect Behavior**: None (`200 OK`). Serves the landing page content as the app shell.
*   **Console Findings**: Clean console, no errors.
*   **Network Findings**: Loaded index page shell and assets successfully.
*   **4xx/5xx Status Codes**: None.
*   **Staging Configuration Leakage**: None.
*   **Production Mutation**: None.

### 4. Route: https://app.sourcetrack.ai/login
*   **Exact URL Checked**: `https://app.sourcetrack.ai/login`
*   **Page Title / Visible State**: `Log in to SourceTrack | SourceTrack`
*   **Redirect Behavior**: None (`200 OK`). Correctly displays the SourceTrack login form ("Sign in to your account", email, password inputs, Google auth option).
*   **Console Findings**: Clean console (only verbose DOM/autocomplete warnings from chrome layout system, no JavaScript errors).
*   **Network Findings**: Loaded app shell and login components successfully.
*   **4xx/5xx Status Codes**: None.
*   **Staging Configuration Leakage**: None.
*   **Production Mutation**: None.

### 5. Route: https://app.sourcetrack.ai/signup
*   **Exact URL Checked**: `https://app.sourcetrack.ai/signup`
*   **Page Title / Visible State**: `Start free with SourceTrack | SourceTrack`
*   **Redirect Behavior**: None (`200 OK`). Correctly displays the signup form ("Create your account", email, password inputs, Google auth option).
*   **Console Findings**: Clean console (only verbose DOM autocomplete warnings, no JavaScript errors).
*   **Network Findings**: Loaded app shell and signup components successfully.
*   **4xx/5xx Status Codes**: None.
*   **Staging Configuration Leakage**: None.
*   **Production Mutation**: None.

### 6. Protected App Route (Logged Out): https://app.sourcetrack.ai/dashboard
*   **Exact URL Checked**: `https://app.sourcetrack.ai/dashboard`
*   **Page Title / Visible State**: `Log in to SourceTrack | SourceTrack`
*   **Redirect Behavior**: Bounced instantly (client-side redirect) to `https://app.sourcetrack.ai/login` via the auth guard.
*   **Console Findings**: Clean console, no errors.
*   **Network Findings**: Redirected successfully to `/login`.
*   **4xx/5xx Status Codes**: None.
*   **Staging Configuration Leakage**: None.
*   **Production Mutation**: None.

## curl Headers Verification

```text
https://sourcetrack.ai
HTTP/2 301
location: https://www.sourcetrack.ai/

https://www.sourcetrack.ai
HTTP/2 200
content-type: text/html; charset=utf-8

https://app.sourcetrack.ai
HTTP/2 200
content-type: text/html; charset=utf-8

https://app.sourcetrack.ai/login
HTTP/2 200
content-type: text/html; charset=utf-8

https://app.sourcetrack.ai/signup
HTTP/2 200
content-type: text/html; charset=utf-8
```

## Staging Leakage Audit Grep Results

Targeted search for staging domains (`sourcetrack-dashboard-staging`, `sourcetrack-api-staging`), staging database project reference (`nrsvpwzekfrdrzkoecfk`), and staging PostHog project ID (`469905`):
- Source Code (`dashboard/src`, `api`): **No leakage found.** (Only hit was a safeguard console message warning in `api/lib/environment-safety.js` advising developers to point to the staging ref instead of production).
- Documentation/QA records (`docs/`): Contained references to staging setups as intended.
- **Leakage Status**: Staging references found only in docs/QA or intentional environment-safety code are not runtime leakage.

## Product routing / domain-separation review notes

1.  **app.sourcetrack.ai root currently renders the public marketing/app shell**, while `/login` and `/signup` render auth views.
2.  This behavior was accepted for Session H0 as representing successful app-shell reachability, but should be reviewed later as a product routing/domain-separation decision (e.g. deciding whether `app.sourcetrack.ai/` should redirect to `/login` automatically for unauthenticated users instead of rendering the landing page).

## Validation output

*   **git diff --check**: Passed cleanly.
*   **npm run qa:env-safety**:
    ```text
    Running offline environment safety guard tests...
    ✅ All offline environment safety tests passed successfully.
    ```
*   **npm run qa:static**:
    ```text
    PASS — Release readiness checklist verified (all blockers open).
    PASS — static launch QA passed
    ```

## Git status

```text
 A docs/qa/production_domain_smoke_139K-H0.md
```
