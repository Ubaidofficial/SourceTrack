# SourceTrack Segment Launch Readiness Audit

---

## 1. Executive Verdict

* **Best first paid segment:** Lead Gen and simple SaaS founders (Reason: Lead gen and simple SaaS have the lowest integration burden. Serious ecommerce should wait until dedupe visibility, manual spend polish, and revenue reconciliation guidance are stronger).
* **Best second segment:** Serious ecommerce stores (should wait until dedupe visibility, manual spend polish, and revenue reconciliation guidance are stronger).
* **Segment to avoid first:** Enterprise agencies needing DNS white-label portals or custom multi-touch weighting editors.
* **Biggest shared blocker:** **PII URL/Referrer Redaction** (privacy risk affecting all categories).
* **Biggest ecommerce blocker:** Lack of dedupe visibility, manual spend polish, and revenue reconciliation guidance.
* **Biggest SaaS blocker:** Lacking copy-paste examples for user identification (`sourcetrack.identify()`) and lifecycle events (trial/paid upgrades) in onboarding and settings.
* **Biggest lead-gen blocker:** Lacking hidden-field mapping documentation.
* **Biggest agency blocker:** The sidebar layout hardcodes a single-site database limit, blocking client-site switching.
* **Recommended next implementation session:** `Session 102.2 — PII URL/Referrer Redaction`

---

## 2. Segment Readiness Scorecard

| Segment | Pay $50/month Today? | Private Beta Ready? | Public Launch Ready? | Biggest Blocker | Priority |
| ------- | -------------------- | ------------------- | -------------------- | --------------- | -------- |
| **SaaS** | **Yes** | **Yes** | No | Missing lifecycle/identify documentation. | High |
| **Lead Gen**| **Yes** | **Yes** | No | Missing hidden form capture guides. | Medium |
| **Agencies**| No | No | No | Sidebar client-site switcher dropdown. | High |
| **Ecommerce**| No | No | No | Lacks dedupe visibility and manual spend polish. | Low |

---

## 3. Segment Feature Matrix

| Feature | Agency | Ecommerce | SaaS | Lead Gen | SourceTrack Status | Needed Before Paid Beta? | Needed Before Public Launch? |
| ------- | ------ | --------- | ---- | -------- | ------------------ | -----------------------: | ---------------------------: |
| **PII URL/referrer redaction**| Yes | Yes | Yes | Yes | Missing | Yes | Yes |
| **Install verification** | Yes | Yes | Yes | Yes | Verified Present | Yes | Yes |
| **SourceTrack Doctor** | Yes | Yes | Yes | Yes | Missing / next after PII redaction | Yes | Yes |
| **Dedupe visibility** | No | Yes | Yes | No | Backend dedupe present, UI visibility missing | Yes | Yes |
| **Source-to-revenue table** | Yes | Yes | Yes | Yes | Verified Present | Yes | Yes |
| **Conversion journey** | Yes | Yes | Yes | Yes | Verified Present | Yes | Yes |
| **Share/export safety** | Yes | Yes | Yes | Yes | Present but needs scope hardening | Yes | Yes |
| **Site switcher** | Yes | No | No | No | Missing | Yes (for Agency) | Yes |
| **Report templates** | Yes | No | No | No | Verified Present | No | Yes |
| **Manual spend/CAC/ROAS** | Yes | Yes | No | Yes | Verified Present | Yes | Yes |
| **Purchase tracking** | No | Yes | Yes | No | Verified Present | Yes | Yes |
| **Order_id dedupe** | No | Yes | No | No | Verified Present | Yes | Yes |
| **Signup/trial/paid events** | No | No | Yes | No | Supported as custom conversion types, docs/examples missing | Yes | Yes |
| **Identify examples** | No | No | Yes | Yes | Missing | Yes | Yes |
| **Lead form tracking** | No | No | No | Yes | Verified Present | Yes | Yes |
| **Qualified lead event** | No | No | No | Yes | Supported as custom conversion type, docs/examples missing | No | Yes |
| **Docs/snippet examples** | Yes | Yes | Yes | Yes | Missing | Yes | Yes |

---

## 4. Ecommerce Verdict

* **What already works:**
  - Standard client-side conversion value capture mapped to `attributed_conversions`.
  - In-memory 24-hour NodeCache order deduplication on `/api/conversion` (api/routes/conversion.js).
  - Manual campaign spend input dividing campaign costs to return CAC/ROAS fallbacks on the dashboard.
* **What is missing:**
  - Clear deduplication count visibility on the frontend.
  - Manual campaign spend UI polish and automated spend APIs.
* **Paid beta minimum:**
  - purchase/conversion snippet examples
  - revenue/value capture
  - order_id/event_id dedupe
  - dedupe visibility
  - source-to-revenue table
  - manual spend/CAC/ROAS
  - revenue reconciliation guidance
  - Shopify/WooCommerce manual install guidance
* **Public launch minimum:**
  - None (can launch ecommerce tracking publicly with manual JS snippets, dedupe visibility, and manual spend inputs; Shopify webhooks are deferred to P2 to keep SourceTrack lightweight).
* **What to avoid:**
  - Building a full Shopify App Store listing.
* **Later / P2:**
  - Shopify app
  - Shopify webhook ingestion
  - automated ads API spend sync
  - refund/cancel automation

---

## 5. SaaS Verdict

* **What already works:**
  - Custom `conversion_type` tags (e.g. `trial`, `subscription`, `signup`) handled inside `/api/conversion`.
  - Distinct customer journey pathways mapped to unique anonymous IDs (`st_aid`).
  - AI Referral classification grouping ChatGPT, Gemini, Claude, and Perplexity traffic (api/lib/channel-classifier.js).
* **What is missing:**
  - Clear documentation inside settings/onboarding outlining code snippet templates for `/api/identify` and Stripe reconciliation events.
* **Paid beta minimum:**
  - Provide copy-paste JS examples for `sourcetrack.identify(userId, traits)` and `sourcetrack.conversion({ type: 'trial' })` in the dashboard.
* **Public launch minimum:**
  - Stripe webhook listener endpoint supporting automatic MRR upgrades and account cancellations.
* **What to avoid:**
  - Churn prediction models or predictive LTV calculations.
* **Exact implementation sessions needed:**
  - *Session 102.2: PII URL/Referrer Redaction* (Security Blocker)
  - *Session 102.8: Developer Integration Snippet Snippets & Docs*

---

## 6. Lead Gen Verdict

* **What already works:**
  - Standard form submission event listener hook inside the tracker script (`tracker/tracker.js`).
  - Division of manual campaign spend by form conversion counts to calculate Cost Per Lead (CPL) (api/routes/dashboard.js).
* **What is missing:**
  - Clear copy-paste guidelines for parsing hidden form values or capturing lead attributes across iframes.
* **Paid beta minimum:**
  - Simple settings copy-paste block for standard form mapping.
* **Public launch minimum:**
  - Outgoing lead webhook integration (Zapier trigger) to send lead sources to the user's CRM.
* **What to avoid:**
  - Custom CRM contact managers inside SourceTrack.
* **Exact implementation sessions needed:**
  - *Session 102.3: SourceTrack Doctor & Tracking Health Alerts* (Alerts when leads go silent)
  - *Session 102.8: Developer Integration Snippet Snippets & Docs*

---

## 7. Agency Verdict

* **What already works:**
  - Unique public shared read-only dashboard tokens (api/routes/public-dashboard.js).
  - Custom Report Builder presets (Revenue by Channel, Conversions by Channel).
* **What is missing:**
  - Client/Site Switcher selector widget in layout sidebars.
  - Multi-tenant query protection audit.
* **Paid beta minimum:**
  - Site selector dropdown in layout sidebars. Clarification: Site switcher is required for agency/multi-site beta, but site switcher is not required for single-site SaaS or lead-gen beta.
* **Public launch minimum:**
  - CSV export limits and read-only agency permissions.
* **What to avoid:**
  - White-labeled portals using custom domains.
* **Exact implementation sessions needed:**
  - *Session 102.5: Export & Share Scope Security Hardening*
  - *Session 102.6: Agency Layout Client/Site Switcher Dropdown*

---

## 8. Cross-Segment Must-Haves Before Charging (Shared Blockers)

These are the core shared blockers required to establish the baseline Attribution and Tracking Trust Chain for all customers before charging:
1. **PII URL/Referrer Redaction (Privacy Risk Reduction)**:
   - Must strip email, token, invite, password, and contact properties from URLs before storing or forwarding.
2. **Install Verification**:
   - The direct Supabase polling verifier must validate key presence and check domain registrations cleanly.
3. **Tracking Health / SourceTrack Doctor**:
   - Daily health agent must monitor for pixel silence and report alerts.
4. **Deduplication Visibility**:
   - Prevent double-counting suspicions by exposing duplicate event drops on the UI.
5. **Source-to-Revenue Clarity**:
   - Accurate attribution tables mapping conversions and manual campaigns cost cleanly.
6. **Export & Share Scope Security (Security)**:
   - Hardening public dash tokens and CSV downloads to prevent cross-customer data leaks.

---

## 9. Segment-Specific Blockers & Nice-To-Haves

### Segment-Specific Blockers (Required for Target Launch)
* **Agency Site Switcher Dropdown (Usability - Agency Blocker)**:
  - Required for agencies to manage client dashboards from the side menu. This is a critical blocker for the agency segment, though not required for single-site SaaS/Lead-Gen users.
* **SaaS/Lead-Gen Onboarding Integration Examples (Docs - SaaS/Lead Gen Blocker)**:
  - Copy-paste snippets for `sourcetrack.identify()` and lifecycle event tracking are required before paid beta.

### Segment-Specific Nice-To-Haves (Can Wait)
* **Landing Pages Widget**: Querying visited routes to populate top entry lists.
* **Form Hidden Fields Captures**: Auto-ingesting UTMs passed inside form input tags.

---

## 10. Do Not Build Yet

- **Shopify App Listing**: High marketplace friction. Use webhook configuration documentation instead.
- **CRM Integrations**: No direct HubSpot/Salesforce sync. Offer outgoing webhooks instead.
- **Ads CAPI Logs Dashboard**: Keep Meta/Google conversion syncing silent.
- **Autonomous Ad Buying**: Avoid predictive bidding logic.
- **White-Label Agency Portal**: Avoid DNS mapping.
- **Custom Multi-Touch Modeling**: Keep standard First, Last, and Linear pre-aggregated models.
- **GA4 Clone Reports**: Avoid bounce rates and scroll depth tracking.

---

## 11. Recommended Revised Launch Roadmap

1. **Session 102.2: PII URL/Referrer Redaction** (Next Build Session)
2. **Session 102.3: SourceTrack Doctor & Tracking Health Alerts**
3. **Session 102.4: Conversion Deduplication UI Visibility**
4. **Session 102.5: Export & Share Scope Security Hardening**
5. **Session 102.6: Agency Layout Client/Site Switcher Dropdown**
6. **Session 102.7: Server-Side Plan Feature Gate Middleware**
7. **Session 102.8: Public Docs & Ingest Domain Cleanup**
8. **Later/P2:** ecommerce webhooks, ad API sync, CRM integrations, Shopify app

---

## 12. Exact Next Implementation Prompt

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
