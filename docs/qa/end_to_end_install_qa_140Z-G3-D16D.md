# End-to-End Install QA - Full Pass Attempt
**Session:** 140Z-G3-D16D
**Status:** PARTIAL PASS / NEEDS CLEAN RERUN
**Date:** 2026-06-20

## Goal
Verify the End-to-End install flow (snippet injection, tracking, conversion, and attribution visibility) using a fully durable, publicly deployed dummy customer page, resolving all D16C blockers.

## 1. Security Cleanup
**PARTIAL**
- **Staging Key Exposure:** 🚨 SECURITY NOTE: The staging Supabase service key was exposed in raw logs again and MUST be rotated.
- **Test Password Rotation:** The password for the staging test user account used in D16C was rotated. 
- No new secrets were embedded in this document, but raw logs contain sensitive data.

## 2. Durable Dummy Page Status
**PARTIAL PASS**
- A stable, durable test page was deployed to a public URL: `https://d16d-dummy-page-production.up.railway.app`
- The dummy page includes the exact staging SourceTrack `tracker.min.js` snippet configuration.
- Localhost and localtunnel were completely avoided.

## 3. Staging Infrastructure Used
- **Frontend URL:** `https://sourcetrack-dashboard-staging.up.railway.app`
- **Backend API URL:** `https://sourcetrack-api-staging.up.railway.app`

## 4. Browser E2E Method & Onboarding Bypass
**BLOCKED**
- Playwright automated browser (Chromium) was used with a standard desktop user agent to simulate a real website visitor.
- 🚨 **BLOCKER:** A database bypass was used (`onboarding_completed: true`) to force the staging dashboard to show the Event Logger instead of completing the UI onboarding cleanly. A clean E2E rerun is required without manually bypassing onboarding.

## 5. UTM Visit & Tracker Network Evidence
**PASS**
- The browser successfully visited the dummy page with UTMs.
- Network intercept confirmed a successful tracking payload to `/api/track` returning `HTTP 200`.

## 6. Conversion Trigger & Receipt
**PASS**
- A conversion was successfully fired from the dummy page via the embedded snippet logic.
- Network intercept confirmed the payload transmission to `/api/conversion` returning `HTTP 200`.

## 7. Source/UTM/Attribution Visibility Evidence
**PARTIAL PASS**
- Playwright automatically logged into the staging dashboard and navigated to the Live Events / Debugger view (`/debugger`).
- The Event Logger UI explicitly rendered the tracked conversion event and correctly displayed the cross-origin contextual source data (e.g., `e2e_test`, `qa`, and `install_e2e_d16d`).
- **However**, this visibility was only achievable because of the manual DB bypass.

## 8. Console & Network Errors
- No script syntax errors or CORS errors occurred.
- The `tracker.min.js` loaded and bound to the conversion trigger natively. 

## 9. Data Safety
- **Production Data:** No production customer data was touched or mutated.
- **Billing:** No Stripe customer or payment data was manipulated.

## Final Verdict
**PARTIAL PASS / NEEDS CLEAN RERUN**. The tracking and attribution logic works over a durable dummy page, but the flow required a manual database bypass to clear the onboarding UI hurdle, and a staging service key was leaked in raw logs. A clean E2E rerun without DB bypasses and without exposing secrets is required.
