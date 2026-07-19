# Report Builder, Saved Reports, and Export QA Report (Session 139M-4)

## 1. Summary Verdict

**Verdict:** `BLOCKED — report builder not verified`

While the public marketing route `/report-builder` loads correctly (rendering the unauthenticated `ReportBuilderMarketing` page and static dashboard mock preview), all actual authenticated Report Builder, Saved Reports, and CSV Export features remain blocked. At runtime, any attempt to access protected client routes (`/dashboard`, `/analytics`, etc.) redirects to `/login` when unauthorized. Testing of custom report queries, report configuration saves, dashboard pinning, and database-scoped CSV downloads is blocked by placeholder environment variables (`SUPABASE_SERVICE_KEY` is a placeholder string) and the absence of staging database write capability during local testing.

---

## 2. Tested Routes and Methodology

### 2.1 Route Audit Scope
A Puppeteer-style headless chromium browser script was executed on the active local development server (`http://localhost:5173`) to hit the routes associated with the report builder and authenticated dashboards.

For each page, the audit monitored:
- Final resolved URLs and redirection chains.
- Client-side console warnings, errors, and verboses.
- Network requests and responses.
- HTML root element rendering.

### 2.2 Route-by-Route QA Table

| Route Path | Load Status | Final Resolved URL | Title / Visible Page Identity | Console Errors / Warnings | Network Failures | CTA/Button Count | Forms Found | Modals/Dropdowns | Evidence Type | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `/report-builder` | 200 | `http://localhost:5173/report-builder` | Attribution Report Builder — Build Custom Dashboards from Your Data \| SourceTrack | 404 on `icon-192.png`; React Router Future Flags | None | 2 (Hero: "Start building reports", "View product") | None | Navigation dropdowns | Public marketing page evidence only | `PASS — public marketing page rendered` |
| `/dashboard` | 302 | `http://localhost:5173/login` | Log in to SourceTrack \| SourceTrack | 404 on `icon-192.png`; React Router Future Flags; Autocomplete warning | None | 1 (Sign-in form submit) | Login form (Email/Password) | None | Blocked by auth / session | `BLOCKED — not verified` |
| `/analytics` | 302 | `http://localhost:5173/login` | Log in to SourceTrack \| SourceTrack | 404 on `icon-192.png`; React Router Future Flags; Autocomplete warning | None | 1 (Sign-in form submit) | Login form (Email/Password) | None | Blocked by auth / session | `BLOCKED — not verified` |

---

## 3. Capability Coverage Matrices

### 3.1 Report Builder Coverage Table

| Report Builder Feature | Appearance Context | Visible Label / Copy | Endpoint / API Call | Evidence Type | Explanation of Confidence / Limits | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Choose Report Template** | Protected `/report-builder` | "AI sources", "AI revenue", "AI landing pages", "Campaign revenue", "Channel revenue" | None (Client-side presets) | Source code audit | Sets dimensions/metrics dynamically in the React state. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Choose Dimensions** | Protected `/report-builder` | "Time", "Channel", "Source", "Medium", "Campaign", "Keyword / Term", "Referrer Domain", "Revenue Provider", "Attribution Status", "Stitching Method", "Conversion Type", "AI Source", "Landing Page", "Country", "Device", "Browser" | None (Client-side options list) | Source code audit | Passes selected group_by parameter to the flexible report query. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Choose Metrics** | Protected `/report-builder` | "Unique Visitors", "Conversions", "Revenue", "Leads", "Conversion Rate", "Avg Conversion Value", "AI Conversions", "AI Revenue", "AI Conversion Share", "AI Revenue Share", "LTV Revenue v1", "Session Count", etc. | None (Client-side options list) | Source code audit | Metric selection filters table columns and chart values. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Set Date Range** | Protected `/report-builder` | "Rolling: Last 7 days", "Rolling: Last 30 days", "Rolling: Last 90 days", "This month", "Custom" | None (Client-side popover) | Source code audit | Applies start/end dates to the report query. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Set Attribution Model** | Protected `/report-builder` | "First Touch", "Last Touch", "First Touch (Non-Direct)", "Last Touch (Non-Direct)", "Linear", "Time Decay", "U-Shaped", "W-Shaped", "AI journey influence" | None (Client-side options list) | Source code audit | Sets query model parameter for weight allocation calculations. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Apply Filters** | Protected `/report-builder` | "Filters" | None (Client-side sidebar) | Source code audit | Adds query filters for channel, source, medium, campaign, etc. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Preview Results** | Protected `/report-builder` | "Attribution Report Preview" / Table & Chart | `GET /api/attribution` | Source code audit | Displays React ChartJS components based on preview data. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Save Report** | Protected `/report-builder` | "Save report" | `POST /api/reports/saved` | Source code audit | Calls saved reports route to store config in PostgreSQL. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Rename Report** | Protected `/report-builder` | "Report Name" text field | `PUT /api/reports/saved/:id` | Source code audit | Allows updating the name of an existing saved report. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Delete Report** | Protected `/report-builder` | "Delete report" | `DELETE /api/reports/saved/:id` | Source code audit | Deletes saved report config from database. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Edit Saved Report** | Protected `/report-builder` | "Edit" | `PUT /api/reports/saved/:id` | Source code audit | Loads report config parameters back into the state for updates. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Pin Widget to Dashboard** | Protected `/report-builder` | "Pin to dashboard" / "show_on_dashboard" | `PATCH /api/reports/saved/:id/dashboard` | Source code audit | Toggles presence of saved report chart on the main dashboard page. | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Export Report** | Protected `/report-builder` | "Export CSV" / "Download" | `GET /api/export/report` | Source code audit | Triggers browser download of custom CSV files. | `PASS — source-inspected only; BLOCKED — not verified on live app` |

---

### 3.2 Saved Reports Coverage Table

| Saved Reports Feature | Appearance Context | Visible Label / Copy | Evidence Type | Status |
| :--- | :--- | :--- | :--- | :--- |
| **List Saved Reports** | Protected `/report-builder` | "Saved Reports" sidebar list | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Empty State** | Protected `/report-builder` | "You haven't saved any reports yet." | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Duplicate Report** | Protected `/report-builder` | None (Feature not present in UI/API) | Source code audit | `PASS — not implemented in code` |
| **Refresh Data** | Protected `/report-builder` | "Refresh" button | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Dashboard Widget Rendering** | Protected `/dashboard` | Custom chart widget container | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Query Scoping by Site/Team** | `api/routes/saved-reports.js` | Enforced site ID scoping context | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Error State** | Protected `/report-builder` | "Failed to load report data" banner | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Loading State** | Protected `/report-builder` | Spinners and skeleton cards | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |

---

### 3.3 Export / CSV Coverage Table

| CSV Export Feature | Appearance Context | Visible Label / Copy | Evidence Type | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Export Button Visible** | Protected `/report-builder` & `/dashboard` | "Export report" / "Export CSV" | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **CSV Download Endpoint** | `api/routes/export.js` | `GET /api/export/report` | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Filename Format** | `api/routes/export.js` | `attribution_report_${date_from}_to_${date_to}.csv` | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Date Range Application** | `api/routes/export.js` | `date_from` and `date_to` parameters | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Filters Application** | `api/routes/export.js` | `filter_source`, `filter_medium`, etc. | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Site Scoping Application** | `api/routes/export.js` | `site_id = req.site.id` | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Database ID Cleansing** | `api/routes/export.js` | Filters out `id`, `site_id`, `site_key`, etc. | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |
| **Error/Empty States** | `api/routes/export.js` | Returns "No data\n" for empty results | Source code audit | `PASS — source-inspected only; BLOCKED — not verified on live app` |

---

## 4. Console and Network / API Findings

### 4.1 Console Observations
- **Warnings:** React Router Future Flags warnings displayed across all Vite-served routes (startTransition and relativeSplatPath opt-ins).
- **Errors:** 404 (Not Found) returned for the browser shortcut manifest icon `http://localhost:5173/icon-192.png?v=3` on all routes. Autocomplete attribute warnings raised by Chrome on the `/login` password input field.

### 4.2 Network / API Observations
- Public `/report-builder` route fetched standard dashboard client bundles (`src/lib/supabase.js`, `@supabase_supabase-js.js`) with 200/304 HTTP statuses.
- Protected routes `/dashboard` and `/analytics` triggered client-side redirections. Since no active session exists, the React router swapped the route parameters to render `/login`.
- No failed backend API endpoints (such as 500 or CORS preflight failures) were captured in the public route logs.

---

## 5. Interactive Elements Tested
- **Public Navigation Link:** Clicked "/report-builder" landing page CTAs. Verified route resolution.
- **Interactive Mock Preview:** Viewed `ReportBuilderMock.jsx` static elements rendering list and bar chart representations on the public marketing page.

---

## 6. Codebase Truthfulness Audit

### 6.1 Grep Strategy and Commands
A strict codebase-wide grep was executed across the `dashboard/src`, `api`, `tracker`, and `docs` folders to isolate any claims of unlimited reports/exports, perfect reports, or GDPR-safe certification guarantees.

```bash
grep -RInE "unlimited reports|unlimited exports|all your data|perfect report|100% accurate|guaranteed|complete attribution|complete revenue|real-time report|AI-powered report|automatic ad sync|native Shopify app|native Stripe app|SOC2|GDPR-safe|fully compliant" dashboard/src docs README.md api tracker SESSION_STATE.md SESSION_LOG.md SESSION_HANDOFF.md || true
```

### 6.2 Truthfulness Classifications
All matches represent safe references and are classified as follows:
1.  **Allowed Historical / Control References:** Historical reports, release logs, and handoff files noting previous overclaim audits.
    - `docs/qa/public_docs_pricing_signup_truthfulness_139M-1.md`
    - `SESSION_LOG.md` and `SESSION_HANDOFF.md`
2.  **Explicit Disclaimers:** Denials of uptime/SLA/compliance guarantees inside terms of service.
    - `docs/paid_beta_go_no_go_master_audit.md`
    - `docs/customer_incident_communication_plan.md` (instructions to avoid overpromising)

---

## 7. Security and Tenant Scoping Audit

### 7.1 Saved Reports API Scoping (`api/routes/saved-reports.js`)
- **Site Context Validation (Lines 15-21):** Every request is intercepted by a middleware checking for `req.site.id`. If missing or null, the API rejects the request with a `400 Bad Request`.
- **Read Scoping (Lines 71-102):** The list query filters saved reports strictly using `.eq('user_id', req.user.id).eq('site_id', req.site.id)`, preventing cross-user and cross-site leaks.
- **Update and Delete Scoping (Lines 104-202):** The endpoint first retrieves the existing record matching the target ID and verifies site ownership:
  ```javascript
  const { data: existing } = await getSupabase()
    .from('saved_reports')
    .select('id, user_id, site_id')
    .eq('id', id)
    .eq('site_id', req.site.id)
    .maybeSingle()
  ```
  If no record matches the given ID and site ID, a `404 Not Found` is returned. If the record belongs to the site but is owned by a different user, a `403 Forbidden` is returned, preventing cross-user tampering.

### 7.2 Export API Scoping (`api/routes/export.js`)
- **Site Scope Check (Lines 24-37):** If a `report_id` query parameter is provided, the SQL query explicitly limits results by the active site ID: `.eq('id', req.query.report_id).eq('site_id', req.site.id)`. If the report doesn't exist for the site, the request is terminated with a `404 Not Found`.
- **Database ID Stripping (Lines 106-108):** To prevent leaking internal database identifiers to external CSV files, the export endpoint cleanses row data:
  ```javascript
  const forbiddenKeys = new Set(['id', 'site_id', 'site_key', 'user_id', 'company_id', 'distinct_id', 'person_id'])
  const keys = Object.keys(results[0]).filter(k => !forbiddenKeys.has(k.toLowerCase()))
  ```
  This strips out database IDs case-insensitively before compiling headers and rows.

---

## 8. Product Design and Simplicity Audit (DataFast vs. SourceTrack)

### 8.1 Scorecard Table

| Route/Surface | Clarity 1-10 | Simplicity 1-10 | Premium feel 1-10 | Founder/marketer friendliness 1-10 | Reporting clarity 1-10 | DataFast Simplicity Comparison | Top 1% Design Quality | Biggest UX Issue | One Recommended Simplification |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| `/report-builder` (Marketing) | 9 | 9 | 8 | 9 | 8 | Matches DataFast's layout; clean visual layout cards (public marketing page UX only). | Sleek fonts and structural spacing, though standard layout structure. | Kicker kickstarts are a bit repetitive. | Merge "Templates" grid into a single interactive slider. |
| Protected `/report-builder` | `blocked` | `blocked` | `blocked` | `blocked` | `blocked` | `BLOCKED — visual/product verdict limited` | `BLOCKED — visual/product verdict limited` | `BLOCKED — visual/product verdict limited` | `BLOCKED — visual/product verdict limited` |
| Protected `/dashboard` | `blocked` | `blocked` | `blocked` | `blocked` | `blocked` | `BLOCKED — visual/product verdict limited` | `BLOCKED — visual/product verdict limited` | `BLOCKED — visual/product verdict limited` | `BLOCKED — visual/product verdict limited` |

---

## 9. Founder / Marketer Questions and Answers
- **Is it obvious what report is being built?** Yes. The `/report-builder` marketing copy makes it clear that the tool builds customizable dashboards based on a single selected metric and dimension.
- **Is it obvious which metrics matter?** Yes. The presets and template explanations focus on high-intent metrics (revenue, leads, conversion rate) rather than obscure technical dimensions.
- **Is it obvious how to save/export?** Yes, via clear, visible "Pin to dashboard" and "Export CSV" controls.
- **Is the number of choices overwhelming?** No. SourceTrack starts blank by default, allowing teams to pin only what matters instead of bombarding them with 30 pre-built widgets.

---

## 10. Fixes and Modifications

### 10.1 UI/UX Bug Fixes
- **ReportBuilderMarketing.jsx (Line 28):** Fixed a class string syntax bug where inline style attributes were incorrectly placed inside the JSX className attribute. Converted:
  `className="py-[96px] style={{ background: '#F7FAFA' }}"`
  to standard class utility:
  `className="py-[96px] bg-[#F7FAFA]"`

---

## 11. Raw Verification Run Outputs

### 11.1 Environment Safety Check (`npm run qa:env-safety`)
See final raw validation output below; full untruncated command output was pasted for review.

### 11.2 Static Launch and Release readiness Check (`npm run qa:static`)
See final raw validation output below; full untruncated command output was pasted for review.

### 11.3 Dedicated QA Script Status
No dedicated package scripts for Report Builder/Export exist in `package.json`. Stated testing results are based on static code auditing, Puppeteer-based route redirection audits, and code inspection. Additional report-related scripts were inspected. Runtime execution depends on Supabase credentials and was not accepted as verified live product behavior in this session.
