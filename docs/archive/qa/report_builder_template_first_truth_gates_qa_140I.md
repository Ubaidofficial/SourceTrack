# QA Report — Session 140I — Report Builder Template-First UI and Truth Gates QA

## 1. Executive Verdict
*   **Overall Verdict:** 🟢 **PASS** (Personalized Template Hub defaulted to SaaS + Universal recommendations, collapsible secondary sections for other business models, truth-gated empty states, lock badges in metric dropdown, and SourceChip table cells E2E verified locally; static checks and dashboard builds passed; paid beta remains NOT READY).
*   **Usability & State Preservation:** 🟢 **PASS** — Verified that saving, loading, pinning, and CSV export controls are functional under the template-first hub structure and correctly conform to local data constraints.
*   **Paid Beta Status:** 🔴 **NOT READY** (billing portal integrations, production SMTP verification, and end-to-end stripe checkout webhooks remain pending staging/production configuration).

---

## 2. Environment & Browser Configuration
*   **Browser Used:** Google Chrome (via DevTools MCP automation)
*   **Local URL:** `http://localhost:5173/report-builder`
*   **Auth State:** Logged in as `test-local@sourcetrack.ai` (verified)
*   **Active Local Site:** `test-local.sourcetrack.ai` (Site Key: `f6f4647e-c911-47b4-9300-2c72233ec9f0`, Plan: `growth`, Business Type: `saas`)

---

## 3. Detailed Browser QA Verification

Each of the following flows was executed and verified in the browser:

*   **Template Hub Default Render**: Navigating to `/report-builder` loads the Template Hub landing page first. No blank builder configuration or preview charts/tables are visible on initial load.
*   **Removal of Old Preset Pills**: Old preset pills that rendered all templates (SaaS, Ecommerce, Lead Gen, Universal) as equal buttons in builder mode are completely removed.
*   **Template Hub as Main Surface**: The Template Hub remains the primary template selection surface. In builder mode, the only option is to click the secondary "Back to templates" button to return to the Template Hub, ensuring no irrelevant templates leak as first-class options.
*   **Personalized Heading & Layout**: Heading reads "Recommended templates for SaaS" based on the active site's `saas` business type.
*   **Primary Recommendations List**: The main grid displays SaaS templates (such as Trials by Source, Demo Bookings, AI-assisted Trials, MRR, Trial-to-Paid) and Universal templates (such as Channel revenue, Campaign revenue, Unique Visitors, Conversion Rate) only. Ecommerce and Lead Gen templates are hidden from the primary grid by default.
*   **Show Other Template Types (Disclosure)**: Clicking the secondary "Show other template types" disclosure reveals Ecommerce and Lead Gen / Agency categories in a collapsible section. Other categories are secondary, not primary sections.
*   **Start from Blank**: Clicking "Start from Blank (Advanced)" resets all active builder configuration settings (filters, group-by, secondary dimensions, date preset, rolling settings, chart type, and editing ID) to safe, ungated defaults (Unique Visitors/sessions by Channel). This ensures the workspace opens into a fully usable state and does not immediately display a revenue integration locked warning or inherit stale template context.
*   **Supported Template Configuration**: Clicking a supported/available template (such as "Trials by Source") opens the builder config, correctly selects "Conversions" and "Source", and triggers a query request.
*   **Gated Template Unavailable State**: Gated templates (like "AI-assisted Trials") show a lock badge on the card and render an honest locked empty state description panel ("No AI Referral Traffic Detected") in the preview area rather than empty charts or fake metrics.
*   **Metric Lock Badges**: Opening "+ Add metric" in the sidebar shows a `🔒` lock icon next to gated metrics (`Revenue`, `Avg Conversion Value`, and all LTV/AI metrics).
*   **No Fake $0.00 States**: Gated states render a dedicated descriptive integration panel explaining the setup steps needed. They do not render fake metrics, empty charts, or dummy tables showing `$0.00`.
*   **Saved Reports Drawer**: Clicking the "Saved Reports" button opens the slide-over drawer showing saved reports.
*   **Saving Reports**: Clicking the "Save" button updates the state and saves the report configuration to the database (returning "✓ Report saved successfully").
*   **Pinning Reports**: Clicking the "Pin" button successfully pins the report configuration to the dashboard (returning "✓ Pinned to dashboard").
*   **Loading Saved Reports**: Clicking "Load" in the Saved Reports drawer loads the saved configurations (restoring the custom name, metric list, dimension selection, date preset, and pinned status).
*   **Export Controls**: The "CSV" export control button appears only when appropriate (unlocked states) and does not appear in locked/gated empty states.
*   **Reset Configuration**: Clicking "Reset Configuration" clears all configuration states and returns the page back to the Template Hub view.
*   **Console Cleanliness**: Verified that the workspace loads and performs transitions without any route-breaking Javascript console errors.

---

## 4. Codebase Personalization Fallback Path Verification

*   **SaaS site personalization**: SaaS site shows SaaS + Universal as primary templates (Verified in browser E2E).
*   **Ecommerce & Lead Gen visibility**: Ecommerce and Lead Gen are hidden behind "Show other template types" (Verified in browser E2E).
*   **Unknown business type fallback**: Unknown business type shows Universal only + Settings guidance (Verified via code path: "Choose a business type in Settings to personalize templates.").
*   **Secondary categories layout**: Other categories are secondary, not primary sections (the old first-class tabs design is completely removed).

---

## 5. Visual Evidence & Screenshots
Local screenshots captured in this session:
*   Local Template Hub: [staging_report_builder_v3.png](file:///Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/staging_report_builder_v3.png)
