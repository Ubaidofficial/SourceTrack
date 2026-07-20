# SourceTrack Privacy-Friendly Analytics & GA4 Lightweight Readiness Audit

---

## 1. Executive Verdict

* **Is the current launch feature plan correct?**  
  No, with one key adjustment: **PII URL/Referrer Redaction** must be performed *before* **SourceTrack Doctor** and **Site Switcher**. Raw page URLs and referrers currently leak PII query parameters (e.g. emails, phone numbers, tokens) directly to ingestion caches and PostHog, which is a critical privacy blocker for the paid beta launch.
* **Is SourceTrack analytics privacy-friendly enough for paid beta?**  
  **No, not yet.** While it transiently discards raw IP addresses and user agents, it captures and forwards the raw page URL including all query parameters to PostHog and stores them on Supabase conversion entities. This creates a high risk of leaking PII (emails, phone numbers, auth tokens, checkout IDs). Implementing a lightweight query parameter redactor is an immediate blocker.
* **Is SourceTrack GA4-comparable in the lightweight areas that matter?**  
  Yes. SourceTrack successfully tracks pageviews, custom events, UTM acquisitions, campaigns, and conversions, and presents them in an interactive timeline explainer which outshines GA4's complex exploration screens.
* **Biggest end-user blocker:**  
  The lack of a **Layout Client/Site Switcher Dropdown** in the sidebar. Digital marketing agencies are the most lucrative first customer segment willing to pay $50/mo, and they cannot manage multiple client sites without it.
* **Biggest privacy blocker:**  
  Leaking potential PII query parameters (e.g. `?email=...`, `?checkout_id=...`, `?token=...`) in `page_url` and `referrer` parameters on event ingestion.
* **Biggest feature to avoid:**  
  Building automated Shopify app store integration plugins, CRM connectors (HubSpot/Salesforce), or a custom multi-touch weights editor.
* **Recommended next session:**  
  `Session 102.2 — PII URL/Referrer Redaction` (to resolve the privacy leak blocker first).

---

## 2. Current Launch Plan Validation

| Planned Item | Keep / Move Earlier / Move Later / Defer | Why | End-user Impact | Launch Risk |
| ------------ | ---------------------------------------- | --- | --------------- | ----------- |
| **PII URL/Referrer Redaction** | **Move Earlier** (Session 102.2) | Capturing unredacted URL parameters is a critical privacy exposure. Sanitization must be implemented at the front of the queue. | Low (background compliance update) | High (leaks PII if deferred) |
| **SourceTrack Doctor** | **Keep/Move Later** (Session 102.3) | Health monitoring is a key trust checkpoint. Users need alerts if pixel tracking goes silent, but URL redaction takes privacy precedence. | High (prevents silent data drop anxiety) | Low (uses simple daily database query) |
| **Deduplication visibility** | **Keep/Move Later** (Session 102.4) | Critical for establishing baseline tracking trust. Exposes duplicates discarded in memory to reassure users of event accuracy. | Medium (validates system trust) | Low (adds simple in-memory count pill) |
| **Export/share scope security** | **Keep/Move Later** (Session 102.5) | Metric leaks across sites or shared token boundaries are critical vulnerabilities. This security audit must happen before scaling site switchers. | Low (background security fix) | High (downtime/data leak risk if deferred) |
| **Site switcher** | **Keep/Move Later** (Session 102.6) | Needed for agencies. Moving it directly after the security audit ensures multi-tenant queries are safe before users switch. | High (enables agency client handling) | Medium (involves layout state changes) |
| **Plan gates** | **Keep/Move Later** (Session 102.7) | Apply server-side checks restricting CSV downloads and premium attribution models to paid tiers. | High (protects revenue streams) | Low (adds backend gate middleware) |
| **Public Docs & Domain Cleanup** | **Keep** (Session 102.8) | Clean up references to `app.sourcetrack.ai` and `api.srctk.com` prior to marketing. | Medium (improves professional copy) | Low (copy and code links update) |
| **Custom property explanations** | **Defer** (post-beta) | Presenting custom properties in conversion modals can be deferred until the ingestion engine is fully commercialized. | Low (nice-to-have UX polish) | Low |

---

## 3. End-User Analytics Feature Checklist

| Feature | SourceTrack Status | Evidence | Needed Before Paid Beta? | Needed Before Public Launch? | Notes |
| ------- | ------------------ | -------- | -----------------------: | ---------------------------: | ----- |
| **Pageview Tracking** | ✅ Verified Present | `tracker/tracker.js`, `api/routes/track.js` | Yes | Yes | Capture `$pageview` client and server side. |
| **Custom Event Tracking** | ✅ Verified Present | `tracker/tracker.js` | No | Yes | `sourcetrack.track(event, properties)` |
| **Conversion Tracking** | ✅ Verified Present | `tracker/tracker.js`, `api/routes/conversion.js` | Yes | Yes | Client-side conversion capture with metadata. |
| **Revenue/Value Tracking** | ✅ Verified Present | `api/routes/conversion.js` | Yes | Yes | `conversion_value` pre-aggregated on Supabase. |
| **UTM Tracking** | ✅ Verified Present | `tracker/tracker.js` | Yes | Yes | Normalizes medium, source, campaign. |
| **Referrer Tracking** | ✅ Verified Present | `tracker/tracker.js` | Yes | Yes | Extracts document referrer client-side. |
| **Source/Channel Classification**| ✅ Verified Present | `api/lib/channel-classifier.js` | Yes | Yes | Classifies Social, Organic, and AI Search. |
| **Landing Page Capture** | ⚠️ Partial | `api/routes/dashboard.js` | No | Yes | Data exists in PostHog but dashboard returns `[]`. |
| **Sessionization** | ✅ Verified Present | `tracker/tracker.js` | Yes | Yes | Session ID `st_sid` stored in sessionStorage. |
| **Visitor/User ID** | ✅ Verified Present | `tracker/tracker.js` | Yes | Yes | Persistent visitor ID `st_aid` in localStorage. |
| **Identify Support** | ✅ Verified Present | `tracker/tracker.js` | Yes | Yes | Maps email/traits via `/api/identify`. |
| **Journey/Timeline View** | ✅ Verified Present | `dashboard/src/pages/Journey.jsx` | Yes | Yes | Shows touchpoints for selected visitors. |
| **Source-to-Revenue Dashboard**| ✅ Verified Present | `dashboard/src/pages/Dashboard.jsx` | Yes | Yes | Pre-aggregated Supabase data query. |
| **Attribution Model Clarity** | ✅ Verified Present | `dashboard/src/pages/Attribution.jsx` | Yes | Yes | Interactive walkthrough modals explaining models. |
| **Date Ranges** | ✅ Verified Present | `dashboard/src/pages/Dashboard.jsx` | Yes | Yes | Standard 30/60/90 days query controls. |
| **Report Builder** | ✅ Verified Present | `dashboard/src/pages/ReportBuilder.jsx` | Yes | Yes | Allows custom dimensions selection. |
| **Saved Reports** | ✅ Verified Present | `api/routes/saved-reports.js` | Yes | Yes | Full CRUD routes integrated. |
| **Public/Share Reports** | ✅ Verified Present | `api/routes/public-dashboard.js` | Yes | Yes | Generates unique sharing links. |
| **Exports** | ✅ Verified Present | `api/routes/export.js` | Yes | Yes | Exposes `/report` GET route returning raw CSV. |
| **Event Debugger** | ✅ Verified Present | `dashboard/src/pages/EventDebugger.jsx` | Yes | Yes | Real-time tracking payload visualization. |
| **Install Verification** | ✅ Verified Present | `api/routes/install.js` | Yes | Yes | Polling status using direct telemetry lookup. |
| **Tracking Health** | 🔍 Needs Runtime QA | `api/routes/events.js` | Yes | Yes | Check daily alerts job inserts database events. |

---

## 4. Privacy-Friendly Analytics Audit

| Privacy Area | Current Behavior | Risk | Recommended Lightweight Fix | Priority |
| ------------ | ---------------- | ---- | --------------------------- | -------- |
| **IP handling** | Resolved in `api/routes/track.js` to look up country string via `geoip-lite`. Raw IP is discarded and never stored in database or sent to PostHog. | **Low** | No action required for paid beta, but document clearly. Raw IP is transient. | *Low Risk* |
| **User-Agent handling** | Parsed in `api/routes/track.js` to map browser, OS, and device type. Raw agent is discarded. | **Low** | No action required for paid beta, but document clearly. | *Low Risk* |
| **URL/Query param handling** | Raw `page_url` and `referrer` (including all parameters) are captured in `tracker/tracker.js`, forwarded to PostHog and stored in conversion payloads. | **High** | Introduce a regex pattern in the ingestion router to redact/sanitize obvious PII query keys (e.g. `email`, `phone`, `token`, `checkout_id`) from incoming page URLs. | **P0** |
| **PII redaction** | No automated regex stripping on incoming strings. | **High** | Create a helper `redactPiiFromUrl(url)` and apply it prior to `ph.capture` calls. | **P0** |
| **Visitor identifiers** | A client-derived UUID is persisted to localStorage (`st_aid`). | **Low** | In cookieless mode, the system uses a server-derived daily rotating hash. Appears privacy-friendly, but needs legal/policy review. | *Low Risk* |
| **Cookies / LocalStorage** | Uses `localStorage` to save permanent visitor ID `st_aid`, first touch parameters, and consent preferences `st_consent`. Uses `sessionStorage` for `st_sid`. | **Medium** | Ensure the privacy policy documentation clearly informs users of browser storage items. | **P2** |
| **Fingerprinting** | No passive canvas/audio browser fingerprinting is performed. | **Low** | No action required. | *Low Risk* |
| **Consent / Opt-out** | Opt-out signals respected via header check. Data consent check gated if script tag includes `data-consent-required="true"`. | **Low** | Gated opt-out helpers are active. Appears privacy-friendly, but needs legal/policy review. | *Low Risk* |
| **DNT / GPC** | Checked in `tracker/tracker.js`. Script execution halts immediately if GPC/DNT is signaled. | **Low** | Appears privacy-friendly, but needs legal/policy review. | *Low Risk* |
| **Third-party forwarding** | Sends aggregated events directly to PostHog (`ph.capture`) for ingestion storage. | **Medium** | Lower risk based on code inspection, provided data transfers do not contain unredacted PII in URL paths. | **P1** |
| **Data retention** | Deletes old conversions inside `api/jobs/nightly-attribution.js`. | **Low** | Purges database metrics based on site settings. Needs runtime/legal verification. | *Low Risk* |
| **Data deletion / Export** | `/api/gdpr/visitor` route deletes visitor rows from Supabase and triggers a PostHog delete. | **Low** | Supports deletion workflows, but needs runtime/legal verification. | *Low Risk* |
| **Share / Export scope** | Security gates verify `site_id` is queried inside auth contexts. | **Low** | Re-verify in the upcoming Security Hardening session to block leaks. | **P1** |
| **Docs / Privacy copy** | Copy states cookieless mode is compliant. | **Medium** | Provide simple templates in docs for privacy statements. | **P2** |

---

## 5. Lightweight GA4 Comparison

| Capability | GA4 Has | SourceTrack Today | Should SourceTrack Add? | Priority | Notes |
| ---------- | ------- | ----------------- | ----------------------- | -------- | ----- |
| **Custom events** | Yes (e.g. clicks) | Yes (`track()`) | No | *Done* | Tracks custom triggers cleanly. |
| **Acquisition reports** | Yes | Yes | No | *Done* | UTM categorization outperforms GA4. |
| **Campaign reports** | Yes | Yes | No | *Done* | Maps campaign names correctly. |
| **Landing page reports** | Yes | No (gap) | Yes | **P2** | Fetch and render the top landing pages list. |
| **Ecommerce value** | Yes (heavy schemas)| Yes (simple values) | No | *Done* | Simple flat revenue value is sufficient. |
| **User paths** | Yes (Path finder) | Yes (visitor timeline)| No | *Done* | Interactive timeline exceeds GA4. |
| **Attribution modeling** | Data-Driven weights| Single touch models| No | *Done* | neutral single-touch models are enough. |
| **PII Redaction** | Yes | No | Yes | **P0** | Strip PII from page URLs on ingestion. |
| **Debug logs** | DebugView | Event Debugger | No | *Done* | Live ingestion table works perfectly. |
| **Data deletion** | Yes | Yes | No | *Done* | GDPR endpoints exist. |

---

## 6. Must Fix Before Charging

1. **PII Query Parameter Redaction (Privacy Risk Reduction)**:
   - Ensure raw page URLs and referrer fields are sanitized before being forwarded to PostHog or stored in Supabase conversions to block accidental PII leaks.
2. **Export & Share Scope Security (Vulnerability Prevention)**:
   - Perform a thorough auth scope check on `/api/export` and `/api/public` dashboard share tokens to ensure they cannot leak metrics of unrelated site contexts.
3. **Sidebar Site Switcher Dropdown (Usability)**:
   - Agencies running beta tests cannot manage clients without a simple dropdown selectors in the main layouts.

---

## 7. Should Build Soon, But Not Block Paid Beta

1. **Landing Pages Report Widget**:
   - Query the top visited paths on pageviews to populate the empty `landing_pages` array in `/overview` and display them on the dashboard.
2. **Settings Privacy Templates**:
   - Provide copy-paste text inside settings showing the user how to document SourceTrack's cookieless/privacy mode on their website's privacy page.

---

## 8. Do Not Build Yet

- **Custom Multi-Touch Weight Calculators**: Bloated enterprise feature. Hardcoded standard attribution weights (First, Last, Linear) are sufficient.
- **Automated Ads APIs Integrations**: Google/Meta ad network integrations are complex. Stick to manual campaign spend updates during beta.
- **Shopify App Store Listing**: Avoid Shopify marketplace review delays. Offer a simple JS snippet block or webhook integration manual instead.

---

## 9. Recommended Revised Order

1. **Session 102.2: PII URL/Referrer Redaction** (Next Recommended Build)
2. **Session 102.3: SourceTrack Doctor & Tracking Health Alerts**
3. **Session 102.4: Conversion Deduplication UI Visibility**
4. **Session 102.5: Export & Share Scope Security Hardening**
5. **Session 102.6: Agency Layout Client/Site Switcher Dropdown**
6. **Session 102.7: Server-Side Plan Feature Gate Middleware**
7. **Session 102.8: Public Docs & Ingest Domain Cleanup**

---

## 10. Exact Next Implementation Prompt

Copy and paste the prompt below into the chat to start the next session.

---

```markdown
We are starting **Session 102.2 — PII URL/Referrer Redaction**.

Please perform the work for this session following these requirements:

### Goal
Implement a query parameter redactor that sanitizes raw page URLs and referrers during event ingestion to prevent PII leaks.

### Context & Baseline
- Currently, `tracker/tracker.js` captures `location.href` and `document.referrer` raw, and routes like `api/routes/track.js` and `api/routes/conversion.js` forward or store them unredacted.
- We need to redact common PII parameter keys (e.g. `email`, `phone`, `token`, `checkout_id`, `invite`, `password`, `key`) before storing or forwarding.

### Files to Inspect
- `tracker/tracker.js` — Client tracker gathering URLs.
- `api/routes/track.js` — Pageview ingestion router.
- `api/routes/conversion.js` — Conversion ingestion router.
- `api/routes/identify.js` — Ingestion route for identity mapping.

### Requirements to Implement
1. **Develop Ingest-Side Redaction Helper**:
   - Write a helper utility function (e.g. `redactPiiFromUrl(url)`) in a shared backend file (like `api/lib/utils.js` or in the route files directly).
   - Use safe regex replacement to detect query parameter keys indicating PII and replace their values with a redaction placeholder (e.g. `[REDACTED]`).
   - Query keys to redact: `email`, `phone`, `first_name`, `last_name`, `name`, `token`, `checkout_id`, `invite_code`, `invite`, `password`, `secret`, `key`.
2. **Apply Redaction in Ingestion Routes**:
   - Apply the helper to sanitize incoming URLs/referrers inside `api/routes/track.js`, `api/routes/conversion.js`, and `api/routes/identify.js` before they are sent to `ph.capture` (PostHog) or processed/written to the DB.
   - Keep attribution UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, etc.) and click IDs (`gclid`, `fbclid`, etc.) unredacted/safe to preserve marketing metrics.
3. **Important Limitations**:
   - Do not alter the underlying attribution logic.
   - Do not make any database schema changes.
   - Run `npm run build:tracker` ONLY if you change client-side tracker code (prefer resolving this purely on the API ingest side if possible, to minimize client script updates).

### Validation
- Run syntax checks:
  `node --check api/routes/track.js api/routes/conversion.js api/routes/identify.js`
- Verify tracker build compiles cleanly (if modified):
  `npm run build:tracker`
- Verify dashboard build compiles:
  `cd dashboard && npm run build`
- Ensure all tests pass.

### Committing & Output
- Provide the exact terminal outputs of:
  - `git diff --stat`
  - `git diff -- api/routes/track.js api/routes/conversion.js api/routes/identify.js`
  - `git status --short`
- DO NOT commit until reviewed.
```
