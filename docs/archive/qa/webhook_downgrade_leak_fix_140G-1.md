# Webhook Downgrade Leak Fix Report (Session 140G-1)

**Session:** 140G-1 — Fix Webhook Downgrade Leak
**Date:** 2026-06-12
**Verdict:** PASS (Fix validated via unit tests; post-deploy staging verification pending)

---

## 1. Executive Summary

During the Session 140G Billing/Limits Enforcement audit, we identified a downgrade leak where outbound webhooks, once configured and activated on an eligible tier (e.g. Growth/Scale), would continue to be dispatched by the background worker even if the owner site subsequently downgraded to a plan where outbound webhooks are disabled (e.g. Free/Starter).

This session applies the safest backend fix (Option B) to query the owner site's plan features separately from the active webhook destination lookup, avoiding any nested PostGrest relationship queries. This ensures that a missing or unmapped foreign key relationship does not break webhook routing, while guaranteeing that downgraded accounts fail-closed.

---

## 2. Code Changes

The following files were modified:

### `api/lib/webhook.js`
*   Imported `hasFeature` from `api/lib/plan-features.js`.
*   Retained the flat lookup for active webhook destinations:
    ```javascript
    const { data: dest, error: destErr } = await supabase
      .from('webhook_destinations')
      .select('id, url, secret, active, site_key')
      .eq('site_key', siteKey)
      .eq('active', true)
      .maybeSingle()
    ```
*   Added a separate query to fetch the owner site's current plan dynamically:
    ```javascript
    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('plan')
      .eq('site_key', siteKey)
      .maybeSingle()
    ```
*   Ensured the workflow fails closed (silently aborts dispatch) on any database error, missing site, missing plan, or plan without the `webhook_outbound` feature:
    ```javascript
    if (siteErr) {
      console.error('[webhooks] failed to query site plan:', siteErr.message)
      return
    }

    if (!site || !site.plan || !hasFeature(site.plan, 'webhook_outbound')) {
      return // Silent skip: plan downgraded or missing site/plan
    }
    ```
*   No secrets, payloads, customer info, or target endpoint URLs are leaked to logs or console outputs.

---

## 3. Automated Unit Tests Added

We added dedicated unit tests in `api/tests/billing-middleware.test.js` under the test block `"dispatchWebhook plan limit enforcement"`. These mock the database client and global fetch to assert the following behaviors:
1.  **Allowed Tier Dispatch:** Asserts that when a site's plan has `webhook_outbound: true` (e.g., plan `growth`), the fetch request is made and the webhook delivery log is written.
2.  **Downgraded Tier Skip:** Asserts that when a site's plan has `webhook_outbound: false` (e.g., plan `free`), the background worker silently skips the HTTP post and records no delivery log.
3.  **Missing Site/DB Error Fail-Closed:** Asserts that database errors or missing site/destination records safely abort the promise chain before attempting to connect to external endpoints or writing log entries.

All unit tests run and pass successfully.

---

## 4. Remaining Blocker Status

While the webhook downgrade leak is fixed, the paid-beta milestone remains **BLOCKED** because the remaining volume-limit gating gaps remain open:
*   Standard tracker pageview limits are bypassed (due to counting from the empty Supabase `pageviews` table instead of PostHog).
*   Conversion caps are not enforced.
*   Site limits are not enforced.
*   PostHog retention is not purged.
*   Staging restore backup drill is not performed.
*   Production credentials/secrets verification is not completed.
