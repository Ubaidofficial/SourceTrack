# SourceTrack Public Pages, Docs, Pricing, & Signup Truthfulness QA (Session 139M-1)

## 1. Summary Verdict
**PASS WITH FIXES**

---

## 2. Route-by-Route QA Table (All 37 Routes)

| Exact Route | Load Status | Title / Visible Page Identity | Console Errors / Warnings | Network Failures | CTA / Button Count | Forms Found | Modals / Dropdowns / Accordions | Load Time (ms) | Notes | Status |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- | :---: | :--- | :--- |
| `/` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "Know which sources actually create revenue." | Warnings: React Router v7 flags, Vite HMR | None | 63 | 0 | None | 265 | Marketing Landing page | PASS |
| `/product` | PASS | SourceTrack Product — Revenue Attribution Without the Analytics Maze / "Revenue attribution without the analytics maze." | Warnings: React Router v7 flags, Vite HMR | None | 40 | 0 | None | 157 | Product capabilities overview | PASS |
| `/attribution` | PASS | Marketing Attribution Software — Track Which Sources Create Revenue \| SourceTrack / "Know the source behind every lead, trial, and purchase." | Warnings: React Router v7 flags, Vite HMR | None | 40 | 0 | None | 106 | Attribution models details | PASS |
| `/ai-referral-tracking` | PASS | AI Referral Tracking — Track ChatGPT, Claude, Gemini & Perplexity Traffic \| SourceTrack / "Your GA4 calls it direct. SourceTrack calls it a customer from ChatGPT." | Warnings: React Router v7 flags, Vite HMR | None | 41 | 0 | None | 97 | AI referral details | PASS |
| `/pricing` | PASS | SourceTrack Pricing — Simple Attribution Pricing, Free Forever Tier \| SourceTrack / "Simple attribution pricing that grows with you." | Warnings: React Router v7 flags, Vite HMR | None | 44 | 0 | FAQ grid (static) | 91 | Pricing cards & comparison matrix | PASS |
| `/compare/ga4` | PASS | SourceTrack vs. Google Analytics 4 (GA4) \| SourceTrack / "GA4 tells you what happened. SourceTrack tells you which source made it happen." | Warnings: React Router v7 flags, Vite HMR | None | 40 | 0 | Comparison matrix | 91 | Comparison with GA4 | PASS |
| `/use-cases/saas` | PASS | B2B SaaS Attribution Software \| SourceTrack / "See which channels drive trial starts. And which ones actually convert to paid." | Warnings: React Router v7 flags, Vite HMR | None | 17 | 0 | None | 87 | SaaS solutions page | PASS |
| `/use-cases/ecommerce` | PASS | E-commerce Order Attribution Software \| SourceTrack / "Stop over-crediting your last ad. See every touchpoint that drove the sale." | Warnings: React Router v7 flags, Vite HMR | None | 17 | 0 | None | 93 | eCommerce solutions page | PASS |
| `/use-cases/lead-generation` | PASS | B2B Lead Generation Attribution \| SourceTrack / "Your CPC reports look great. But which leads are actually closing?" | Warnings: React Router v7 flags, Vite HMR | None | 17 | 0 | None | 85 | Lead gen solutions page | PASS |
| `/use-cases/agencies` | PASS | Multi-Site Agency Attribution Reporting \| SourceTrack / "Attribution reporting your clients will actually believe." | Warnings: React Router v7 flags, Vite HMR | None | 17 | 0 | None | 84 | Agency solutions page | PASS |
| `/integrations` | FAIL (direct hit) | (Direct load failed due to proxy) | Console Error: 404 (Not Found) | None | 0 | 0 | None | 372 | Local direct route returned Envoy 404; client-side route worked after navigating from `/` | NEEDS FOLLOW-UP |
| `/security` | PASS | Data Privacy & Tracking Security Standards \| SourceTrack / "Clean tracking built for transparency." | Warnings: React Router v7 flags, Vite HMR | None | 41 | 0 | None | 232 | Security/compliance overview | PASS |
| `/demo` | PASS | Interactive Marketing Attribution Demo \| SourceTrack / "Explore attribution with sample data." | Warnings: React Router v7 flags, Vite HMR | None | 57 | 0 | None | 83 | Interactive marketing demo dashboard | PASS |
| `/privacy` | PASS | Privacy Policy Overview — SourceTrack / "Privacy & Data Handling" | Warnings: React Router v7 flags, Vite HMR | None | 40 | 0 | None | 85 | Privacy policy | PASS |
| `/terms` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "Terms of Service" | Warnings: React Router v7 flags, Vite HMR | None | 39 | 0 | None | 83 | Terms of service | PASS |
| `/login` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies | Warnings: React Router v7 flags, Vite HMR | None | 3 | 1 | None | 75 | Login form. Database authentication not verified locally. | BLOCKED — not verified |
| `/signup` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies | Warnings: React Router v7 flags, Vite HMR | None | 0 | 1 | None | 76 | Signup form. Database insertion not verified locally. | BLOCKED — not verified |
| `/docs` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "SourceTrack Docs" | Warnings: React Router v7 flags, Vite HMR | None | 61 | 0 | None | 78 | Docs home | PASS |
| `/docs/quickstart` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "Quickstart Guide" | Warnings: React Router v7 flags, Vite HMR | None | 52 | 0 | None | 77 | Quickstart setup | PASS |
| `/docs/install` | PASS | Installing the Tracking Script \| SourceTrack Docs / "Install Script" | Warnings: React Router v7 flags, Vite HMR | None | 51 | 0 | None | 79 | Manual installation snippet guide | PASS |
| `/docs/platforms/google-ads` | PASS | Google Ads Setup Guide \| SourceTrack Docs / "Google Ads Setup Guide" | Warnings: React Router v7 flags, Vite HMR | None | 51 | 0 | None | 100 | Google Ads setup guide | PASS |
| `/docs/platforms/google-tag-manager` | PASS | Google Tag Manager Setup Guide \| SourceTrack Docs / "Google Tag Manager" | Warnings: React Router v7 flags, Vite HMR | None | 51 | 0 | None | 87 | Google Tag Manager setup guide | PASS |
| `/docs/platforms/webflow` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "Webflow Setup Recipe" | Warnings: React Router v7 flags, Vite HMR | None | 51 | 0 | None | 82 | Webflow installation guide | PASS |
| `/docs/platforms/wordpress` | PASS | WordPress Setup Guide \| SourceTrack Docs / "WordPress Setup Recipe" | Warnings: React Router v7 flags, Vite HMR | None | 52 | 0 | None | 84 | WordPress installation guide | PASS |
| `/docs/platforms/framer` | PASS | Framer Setup Guide \| SourceTrack Docs / "Framer Setup Recipe" | Warnings: React Router v7 flags, Vite HMR | None | 51 | 0 | None | 72 | Framer setup guide | PASS |
| `/docs/platforms/shopify` | PASS | Shopify Manual Revenue Attribution Recipe \| SourceTrack Docs / "Shopify Manual Revenue Attribution Recipe" | Warnings: React Router v7 flags, Vite HMR | None | 53 | 0 | None | 83 | Shopify webhook setup guide | PASS |
| `/docs/platforms/stripe` | PASS | Stripe Webhook/API Revenue Attribution Recipe \| SourceTrack Docs / "Stripe Webhook / API Revenue Attribution Recipe" | Warnings: React Router v7 flags, Vite HMR | None | 51 | 0 | None | 85 | Stripe webhook setup guide | PASS |
| `/docs/troubleshooting` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "Troubleshooting Guide" | Warnings: React Router v7 flags, Vite HMR | None | 51 | 0 | None | 83 | Troubleshooting installation | PASS |
| `/developers` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "Developer Portal" | Warnings: React Router v7 flags, Vite HMR | None | 55 | 0 | None | 79 | Developer center | PASS |
| `/developers/api` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "API Reference" | Warnings: React Router v7 flags, Vite HMR | None | 49 | 0 | None | 74 | REST API reference | PASS |
| `/developers/tracker` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "Tracker SDK" | Warnings: React Router v7 flags, Vite HMR | None | 49 | 0 | None | 82 | Tracker JavaScript API | PASS |
| `/developers/conversions` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "Browser Conversions" | Warnings: React Router v7 flags, Vite HMR | None | 49 | 0 | None | 75 | Conversion ingestion endpoint details | PASS |
| `/developers/offline-conversions` | PASS | SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies / "Offline Conversions" | Warnings: React Router v7 flags, Vite HMR | None | 49 | 0 | None | 74 | Offline conversions endpoint details | PASS |
| `/developers/identify` | PASS | User Stitching (Identify) SDK Reference \| SourceTrack Docs / "User Identification" | Warnings: React Router v7 flags, Vite HMR | None | 48 | 0 | None | 152 | Identify API details | PASS |
| `/developers/webhooks` | PASS | Webhooks & Signature Verification Reference \| SourceTrack Docs / "Webhooks & HMAC Verification" | Warnings: React Router v7 flags, Vite HMR | None | 49 | 0 | None | 115 | Outbound webhooks documentation | PASS |
| `/developers/campaign-costs` | PASS | Campaign Cost CSV & API Reference \| SourceTrack Docs / "Campaign Cost Imports" | Warnings: React Router v7 flags, Vite HMR | None | 49 | 0 | None | 88 | Campaign costs schema reference | PASS |
| `/developers/security` | PASS | Technical Security & Privacy Specs \| SourceTrack Docs / "Security Specifications" | Warnings: React Router v7 flags, Vite HMR | None | 48 | 0 | None | 84 | API security keys context | PASS |

---

## 3. Browser-Preview / Side-Panel Method Used
*   **Harness:** Launched local API backend server (`http://localhost:3000`) and frontend Vite dev server (`http://localhost:5173`).
*   **Headless Browser:** Executed Puppeteer-core script targeting Google Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) on macOS.
*   **Interaction Mode:** Navigated to all routes sequentially, registered console listeners to capture console logs, registered request-failed network listeners, and simulated interactive user behaviors (nav clicks, CTA clicks, input validations).

---

## 4. Console Findings
*   All public and doc routes loaded successfully without JavaScript runtime crashes or compilation blockages.
*   The only console warnings captured were React Router future flag warnings (v7 transition flags) and Vite HMR connection signals.
*   One console error occurred on direct hit to `/integrations` due to local IDE proxy (Envoy) intercepting the URL path and returning a 404. Navigating to `/` first and transitioning client-side bypassed this proxy successfully.

---

## 5. Network Findings
*   Local asset network requests successfully loaded.
*   `/icon-192.png?v=3` and `/icon-512.png?v=3` requests triggered 404 errors due to wildcard Envoy path interception in the IDE workspace proxy. The physical image files exist in `dashboard/public` and build successfully.

---

## 6. Real CTA & Form Testing Evidence

### Header Nav Links Clicked & Verified
Simulated mouse clicks on the main navigation bar elements starting from `/`.
*   `Product` clicked -> transitioned successfully to `http://localhost:5173/product` in 574ms.
*   `Attribution` clicked -> transitioned successfully to `http://localhost:5173/attribution` in 581ms.
*   `AI Tracking` clicked -> transitioned successfully to `http://localhost:5173/ai-referral-tracking` in 578ms.
*   `Pricing` clicked -> transitioned successfully to `http://localhost:5173/pricing` in 573ms.
*   `Demo` clicked -> transitioned successfully to `http://localhost:5173/demo` in 573ms.
*   `Docs` clicked -> transitioned successfully to `http://localhost:5173/docs` in 583ms.

### Footer Links Clicked & Verified
Simulated mouse clicks on footer anchors starting from `/`.
*   `Privacy Policy` clicked -> transitioned successfully to `http://localhost:5173/privacy`.
*   `Terms of Service` clicked -> transitioned successfully to `http://localhost:5173/terms`.
*   `Security` clicked -> transitioned successfully to `http://localhost:5173/security`.

### Pricing CTAs Clicked & Destination Verified
Simulated mouse clicks on product tier action cards on `/pricing`.
*   `Start free` clicked -> transitioned successfully to `http://localhost:5173/signup`.
*   `Choose Starter` clicked -> transitioned successfully to `http://localhost:5173/signup`.
*   `Choose Growth` clicked -> transitioned successfully to `http://localhost:5173/signup`.

### Login Form Field Validation Checked
Visited `/login`, waited for inputs to render, and checked native HTML5 constraints.
*   Empty form submission blocked by native browser validation.
*   `emailInput.checkValidity()` -> `false` with validation message `"Please fill out this field."`
*   `passwordInput.checkValidity()` -> `false` with validation message `"Please fill out this field."`

### Signup Form Field Validation Checked
Visited `/signup`, waited for inputs to render, and checked validation state.
*   Empty form submission blocked by native browser validation.
*   `emailInput.checkValidity()` -> `false` with validation message `"Please fill out this field."`
*   `passwordInput.checkValidity()` -> `false` with validation message `"Please fill out this field."`
*   **Disposable Email UX Abuse Guard Verification:**
    *   Typed disposable email address `test@mailinator.com` and password `secretpassword`.
    *   Submitted form.
    *   The React client-side form validator intercepted the request before network dispatch.
    *   Error message successfully rendered in UI: `"Disposable email addresses are not allowed. Please use a real work or personal email."`

### FAQ Accordions
*   *Note:* The FAQ section on `/pricing` consists of a static grid card layout (`FAQSection`). There are no collapsible accordions or click triggers. **(Inventoried only)**.

### Docs & Developer Internal Links Spot-Checked
*   Navigated to `/docs/quickstart`, `/docs/install`, `/docs/platforms/shopify`, `/docs/platforms/stripe`, `/developers/api`, `/developers/tracker`, `/developers/identify` directly. All sidebar documentation anchors loaded successfully. All other anchors are **inventoried only**.

---

## 7. Direct-Hit Integrations Behavior
*   **Path `/integrations` status:** `NEEDS FOLLOW-UP`
*   **Explanation:** When hit directly from the browser address bar (HTTP GET `/integrations`), the Envoy proxy in the IDE/workstation environment intercepts the URL path and returns a 404 response. When navigating to `/` first and then clicking into `/integrations`, React Router client-side routing mounts the `PublicIntegrations` component successfully. Direct-hit URL resolution outside the IDE proxy has not been verified.

---

## 8. Truthfulness & Overclaims Audit Findings
*   A codebase-wide grep for overclaims (`100% accurate`, `guaranteed`, `fully compliant`, `GDPR-safe`, `SOC2`, `native Shopify app`, `automatic ad sync`, `server-side CAPI`, `40% more conversions`, `AI-powered`, `perfect attribution`, `no data loss`, `real-time attribution`, `Stripe marketplace app`, `native Stripe app`) was performed.
*   All matches in user-facing code/documentation are clean. No false claims of GDPR/SOC2 certification, and no references to "guaranteed conversions" exist. All hits represent documentation disclaimers denying SLAs or internal comments about deterministic hashes.

### Raw Audit Grep Output
```
docs/customer_incident_communication_plan.md:96:- **Do NOT claim guaranteed uptime or SLAs:** Do not use "guaranteed uptime" or "SLA-backed".
docs/customer_incident_communication_plan.md:98:- **Do NOT promise automatic refunds or compensation:** Never state that "compensation is guaranteed" or "refunds will be issued automatically."
docs/customer_incident_communication_plan.md:99:- **Do NOT promise full resolution for all parties:** Avoid stating "fully resolved for everyone" or "guaranteed restored" until individual data flows have been verified.
docs/paid_beta_go_no_go_master_audit.md:92:| Public marketing / demo / pricing claims | ✅ Clean | Overclaim grep over `dashboard/src` + `api` returns only a Terms.jsx disclaimer that *denies* SLA, SLACK env vars, and a code comment | — | No false "GDPR compliant / SOC2 / native Shopify app / 24/7 / guaranteed" claims found. |
docs/paid_beta_go_no_go_master_audit.md:94:| Attribution accuracy / trust | ✅ Functional | `qa:attribution` harness exists and passes locally; attribution engine intact | — | Add to CI (P2-3). Do not claim "100% accurate" / "perfect attribution" (none found — good). |
docs/paid_beta_go_no_go_master_audit.md:263:**Attribution honesty:** No "100% accurate" / "perfect attribution" claims anywhere (grep clean). Good.
docs/paid_beta_go_no_go_master_audit.md:377:- ✅ No GDPR/CCPA/SOC2/uptime/SLA/24-7 compliance claims made or implied.
api/routes/live.js:8:// requireSiteMembership, so req.site is guaranteed populated here.
SESSION_LOG.md:760:- Softened the server-side CAPI claim in `README.md` to truthfully state the platform supports outbound conversion forwarding.
SESSION_LOG.md:1045:- Required overclaim grep (`perfect attribution`, `100% accurate`, `guaranteed attribution`, `cross-device`, `identity graph`, `deterministic`) → 2 hits, both legitimate and pre-existing (`google-search-console.js:262` deterministic-hash comment; `admin.js:439` "no cross-device sync" disclaimer about localStorage-only saved reports).
SESSION_LOG.md:1088:- Stripe/Shopify category description rewritten: "Manual webhook recipes for payment platforms and ecommerce carts. SourceTrack is not a Shopify App or Stripe marketplace app — these are listener URLs you configure in those platforms yourself."
SESSION_LOG.md:1099:- Original Session 131 denial copy used phrases like "Not a marketplace app", "Shopify App or one-click install", "Stripe marketplace app", "native Shopify integration", "one-click install" — semantically *denying* the claim, but the required pre-commit grep treats them as literal hits.
SESSION_LOG.md:1102:  - `PublicIntegrations.jsx:36` "SourceTrack is not a Shopify App or Stripe marketplace app — these are listener URLs you configure" → "These are listener URLs you configure inside Stripe or Shopify yourself — SourceTrack is not distributed as a plugin in those platforms".
SESSION_LOG.md:1122:- Overclaim grep (`native Shopify app`, `SOC2`, `100% accurate`, `guaranteed`, `automatic ad sync`, `Stripe marketplace app`, `native Stripe app`) → only false positive is the deliberate disclaimer in `PublicIntegrations.jsx` that *denies* those claims.
SESSION_LOG.md:1179:- Overclaim grep (`native Shopify app`, `SOC2`, `100% accurate`, `guaranteed`, `automatic ad sync`, etc.) → no hits in dashboard pages.
SESSION_HANDOFF.md:887:- Overclaim grep (`perfect attribution`, `100% accurate`, `guaranteed attribution`, `cross-device`, `identity graph`, `deterministic`) → 2 hits, both legitimate and pre-existing (`google-search-console.js:262` deterministic-hash comment; `admin.js:439` accurate "no cross-device sync" disclaimer about saved reports).
SESSION_HANDOFF.md:905:5. **Forbidden-phrase scrub.** Replaced denial copy that contained the strict-grep forbidden literals (`marketplace app`, `Stripe marketplace app`, `one-click`, `native Shopify integration`) with synonym phrasing (`Manual setup`, `is not distributed as a plugin`, `no automatic install`, `Manual recipe`) across PublicIntegrations.jsx (2 spots), Integrations.jsx (1 spot), DocsShopify.jsx (1 spot), and DocsGTM.jsx (1 spot). Required grep now returns zero hits.
SESSION_HANDOFF.md:909:7. **PublicIntegrations.jsx — softened claims.** Stripe/Shopify category description now reads "Manual webhook recipes … SourceTrack is not a Shopify App or Stripe marketplace app — these are listener URLs you configure in those platforms yourself." Per-item descriptions now state the exact event scope and stitching key. GTM item now says "Not a marketplace app — you paste the snippet into your own GTM container."
SESSION_HANDOFF.md:952:- **Privacy / overclaim audit:** the new copy makes no Shopify-native / SOC2 / 100%-accurate / guaranteed claims, no references to `/api/collect`, and does not introduce cookies.
SESSION_HANDOFF.md:1782:2. **Agency Copy Softening** — Updated `SolutionAgency.jsx` to remove references to per-client CAPI credentials, multi-platform ad sync (ad-platform sync), and the unverified "40% more conversions" claim. Replaced them with client data isolation details, structured client switcher, and client-scoped webhook pipeline info.
SESSION_HANDOFF.md:1805:5. **Soften Compliance Claims** — Softened over-reaching compliance assertions (e.g., "fully compliant", "GDPR-safe") in favor of privacy-friendly, low-risk descriptors ("privacy-conscious", "privacy-friendly", "no cookies, no fingerprinting").
```

---

## 9. UX / Product Findings
*   The pages load in a range of 72ms to 372ms in the local development environment (route-by-route timing captured in the table).
*   Typography (Inter) and dark-theme aesthetics scale smoothly without broken layouts.

---

## 10. Blocked Areas
*   **User Registration:** `BLOCKED — not verified`. Database writes and record persistence cannot be E2E verified because database keys are placeholders. Form UI transitions and validation rules were tested instead.
*   **User Login:** `BLOCKED — not verified`. Authentication endpoints cannot authenticate logins against Supabase database.
