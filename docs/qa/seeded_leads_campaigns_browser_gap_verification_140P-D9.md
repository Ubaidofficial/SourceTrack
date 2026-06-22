# QA Report — Seeded Leads + Campaigns Browser Gap Verification (140P-D9)

## Final Verdict: PASS
All D5 Leads selected-row dark mode styling and Campaigns visual/functional behaviors have been verified on deployed staging.

---

## 1. Test Environment Details

* **Staging Dashboard URL:** `https://sourcetrack-dashboard-staging.up.railway.app`
* **Test Account:** `stripe-e2e-139j@sourcetrack.ai`
* **Test Site Domain:** `stripe-e2e-test-139j.com`
* **Site Key:** `619e934a-1b1c-48cd-ac93-3ab2b2e84287`

---

## 2. Plan Mutations & Cleanup

### Baseline State
* **Site Plan:** `starter`
* **Trial Ends:** `null`
* **Campaigns Route Behavior:** Redirected automatically to `/billing` due to billing gates on manual spend cost features.

### Mutation Performed
1. Temporarily updated `plan` from `starter` to `growth` in the Supabase `sites` table for site key `619e934a-1b1c-48cd-ac93-3ab2b2e84287` to bypass manual spend gates.
2. Evaluated a PATCH settings request to `/api/integrations/settings` inside the authenticated browser to invalidate the API server's site cache.
3. Verified Campaigns page loaded successfully without redirecting to `/billing`.

### Cleanup & Restoration
1. Reverted `plan` of the site back to `starter` in the staging database.
2. Dispatched another PATCH settings request to invalidate the cache.
3. Verified that navigating to `/campaigns` immediately redirects to `/billing` once again.

---

## 3. Browser Evidence

All screenshots are saved locally in the artifacts directory:
`/Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/`

### Leads Page Viewport Verification
* **Dark Desktop with Row:** [leads_dark_desktop.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/leads_dark_desktop.png)
  * *Verifies leads list showing actual tracked leads with `Direct / None` source chips.*
* **Selected Row Dark Highlight:** [leads_dark_selected.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/leads_dark_selected.png)
  * *Verifies that selecting a row applies the premium desaturated olive green highlight background and checkbox checked state without any light-mode bleed. Bottom action bar displays cleanly.*
* **Visitor Journey Slide-over:** [leads_dark_journey.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/leads_dark_journey.png)
  * *Verifies visitor journey details page loads correctly.*
* **Mobile View (390px):** [leads_dark_mobile.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/leads_dark_mobile.png)
  * *Verifies table responsiveness (horizontal scroll) and bottom action bar behavior on small screens.*

### Campaigns Page Viewport Verification
* **Dark Desktop Overview:** [campaigns_dark_desktop.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/campaigns_dark_desktop.png)
  * *Verifies search filter bar, date range presets, dimension tabs, KPI metrics, and campaigns table rendering correctly with appropriate dark mode contrast.*
* **Light Desktop Sanity:** [campaigns_light_desktop.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/campaigns_light_desktop.png)
  * *Verifies light mode theme rendering for campaigns table and controls.*
* **Tablet Layout (768px):** [campaigns_dark_tablet.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/campaigns_dark_tablet.png)
  * *Verifies wrapping behavior of action buttons in the top right header.*
* **Mobile Layout (390px):** [campaigns_dark_mobile.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/campaigns_dark_mobile.png)
  * *Verifies that filter inputs, KPI cards, and header elements wrap and stack cleanly without clipping.*
* **Import Modal Open:** [campaigns_dark_import_modal.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/campaigns_dark_import_modal.png)
  * *Verifies ad cost CSV/paste modal opens and displays correctly.*

---

## 4. Console & Network Log Findings

* **Console Errors:** None. Only a standard layout warning (`A form field element should have an id or name attribute (count: 3)`) was detected, which does not affect functional flow or styling.
* **Failed Requests:** None. All XHR/fetch requests returned `200 OK` status codes.

---

## 5. Detailed Findings & UX Evaluation

### Leads Selected Row Highlight
* The selected lead row displays a desaturated olive-green background (`#1E2318`) in dark mode, matching the premium Piqo-simple aesthetic.
* Text elements inside the selected row retain high contrast and are perfectly readable.
* Checkboxes toggle instantly and the checked state matches the styling perfectly.
* Source chips (`Direct / None`) render with correct alignment, margin, and typography.
* Mobile and tablet viewports are fully responsive: the leads table scroll horizontally within the card, and the action bar remains pinned to the bottom of the screen.

### Campaigns UI & Gating
* Gating behavior is robust: accounts on the `starter` plan are correctly redirected to `/billing` when querying manual cost entry routes.
* With a valid upgraded plan (`growth` or `trial`), the Campaigns page renders beautifully in dark mode. The filter wrapper is styled with a dark background (`dark:bg-dark-card`) and borders, correcting the light gray wrapper bug.
* Action buttons wrap gracefully:
  * At 1440px/1280px: all buttons fit in a single row.
  * At 768px: buttons wrap into a dual-row stack without clipping.
  * At 390px: elements wrap and stack cleanly.
* KPI cards are visually well-proportioned and align correctly.

---

## 6. Paid Beta Status

Paid beta remains **NOT READY**.
