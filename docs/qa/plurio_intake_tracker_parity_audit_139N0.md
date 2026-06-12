# Plurio Intake Tracker Parity Audit — Session 139N-0

This document benchmarks SourceTrack’s tracker, attribution capture, source taxonomy, and privacy mechanisms against **Plurio Intake** (an open-source client-side attribution library).

---

## 1. Parity Matrix

| Capability                  | Intake Support | SourceTrack Support | Evidence / Files | Gap Severity | Recommendation |
| --------------------------- | -------------- | ------------------- | ---------------- | ------------ | -------------- |
| **UTM parsing**             | Yes            | Yes                 | `tracker/tracker.js` / `getUtmParams` | None | None |
| **Organic search detection** | Yes            | Yes                 | `api/lib/channel-classifier.js` / `isOrganicSearch` | None | None |
| **Referral detection**      | Yes            | Yes                 | `api/lib/channel-classifier.js` / `classifyReferrer` | None | None |
| **Direct handling**         | Yes            | Yes                 | `tracker/tracker.js` / Ingestion & `api/lib/channel-classifier.js` | None | None |
| **Source override rules**   | Yes            | Yes                 | `api/lib/sessionization.js` / `sessionizeEvents` | None | None |
| **Click ID capture**        | Yes            | Partial             | `tracker/tracker.js` / Ingestion parameters | **P2** | Add `dclid`, `snapclid`, `pclid` and support LinkedIn spelling variations (`li_fatid` vs `li_fat_id`). |
| **First-touch**             | Yes            | Yes                 | `tracker/tracker.js` (`st_ft_src`) & `api/lib/attribution-engine.js` | None | None |
| **Last-touch**              | Yes            | Yes                 | `api/lib/attribution-engine.js` / `calculateLastTouch` | None | None |
| **Linear attribution**      | Yes            | Yes                 | `api/lib/attribution-engine.js` / `calculateLinearAttribution` | None | None |
| **U-shaped attribution**    | Yes            | Yes                 | `api/lib/attribution-engine.js` / `calculateUShapedAttribution` | None | None |
| **W-shaped attribution**    | No             | Yes                 | `api/lib/attribution-engine.js` / `calculateWShapedAttribution` | None (Strength) | SourceTrack natively supports this model; Intake does not. |
| **Time-decay attribution**  | Yes            | Yes                 | `api/lib/attribution-engine.js` / `calculateTimeDecayAttribution` | None | None |
| **Revenue attribution handoff**| No          | Yes                 | `api/routes/conversion.js` / Ingestion & `api/lib/attribution-engine.js` | None (Strength) | SourceTrack has a server-side ingestion and pipeline; Intake is client-only. |
| **Touchpoint chain**        | Yes            | Yes                 | `api/lib/attribution-engine.js` / `getTouchpointJourney` | None | None |
| **Consent mode**            | Yes            | Partial             | `tracker/tracker.js` / CMP listeners | **P2** | Integrate with Google Consent Mode v2 and major CMPs (Cookiebot, OneTrust). |
| **Cookieless fallback**     | Yes            | Yes                 | `tracker/tracker.cookieless.js` & `api/routes/tracker-id.js` | None (Strength) | SourceTrack uses server-driven rotating salt hashes designed to reduce persistent storage. |
| **URL passthrough**         | Yes            | Yes                 | `tracker/tracker.js` / `decorateInternalLinks` | None | None |
| **dataLayer / GTM**         | Yes            | No                  | N/A | **P3** | Optionally push ready/identity events to GTM `window.dataLayer`. |
| **SPA support**             | Yes            | Yes                 | `tracker/tracker.js` / `setupSpaTracking` | None | None |
| **Link decoration**         | Yes            | Yes                 | `tracker/tracker.js` / `decorateOutboundLink` | None | None |
| **Analytics IDs**           | Yes            | No                  | N/A | **P2** | Scraping standard cookies (`_ga`, `distinct_id`, `amp_`) enables cross-system data stitching. |
| **CRM identity stitching**  | Yes            | Yes                 | `tracker/tracker.js` / `sourcetrack.identify` & identity links | None | None |
| **Browser PII hashing**     | Yes            | No                  | N/A | **P2 (Deferred)** | Defer browser-side scraping and hashing of PII due to legal and privacy risks. |
| **Public live demo**        | Yes            | No                  | N/A | **P3** | Create an interactive client-side simulator showing multi-touch journey attribution. |
| **Install simplicity**      | Yes            | Yes                 | `dashboard/src/pages/Snippet.jsx` & `SetupDoctorCard` | None (Strength) | Setup Doctor is a SourceTrack strength because it provides guided install diagnostics beyond a static snippet page. |

---

## 2. Detailed Parity Capability Evidence & Limitations

### UTM parsing
* **File path**: [`tracker/tracker.js`](../../tracker/tracker.js)
* **Function/Component**: `getUtmParams` / `parseUrlParams`
* **What it actually proves**: Successfully parses standard UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`) as well as custom SourceTrack marketing overrides (`st_campaign_id`, `st_adgroup_id`, `st_ad_id`, `st_target_id`, `st_network`, `st_device`, `st_matchtype`).
* **Limitations**: Relies on reading `window.location.search`. If a browser-side redirect strips query parameters before the tracker executes, or if standard marketing UTMs are missing from the URL, parsing falls back to referrer analysis.

### Organic search detection
* **File path**: [`api/lib/channel-classifier.js`](../../api/lib/channel-classifier.js#L184-L189)
* **Function/Component**: `classifyReferrer` / `isOrganicSearch`
* **What it actually proves**: Matches incoming document referrer hostnames against a dictionary of organic search engines (e.g. google, bing, yahoo, duckduckgo, baidu, yandex) to classify the traffic channel as `Organic Search`.
* **Limitations**: Cannot determine the specific organic search keyword unless passed via search query parameter (which most search engines block/mask today).

### Referral detection
* **File path**: [`api/lib/channel-classifier.js`](../../api/lib/channel-classifier.js#L201)
* **Function/Component**: `classifyReferrer`
* **What it actually proves**: Classifies external non-search and non-social incoming domains as `Referral` based on the `document.referrer` string.
* **Limitations**: If the referrer header is hidden or stripped by browser security rules (e.g., `no-referrer` policies), the traffic will be misclassified as Direct.

### Direct handling
* **File path**: [`tracker/tracker.js`](../../tracker/tracker.js#L203) / [`api/lib/channel-classifier.js`](../../api/lib/channel-classifier.js#L204)
* **Function/Component**: Ingestion handler / `classifyReferrer`
* **What it actually proves**: Captures empty referral and empty query string events and labels the channel as `Direct`.
* **Limitations**: direct serves as a massive catch-all bucket that includes dark social links, copy-pasted URLs, browser bookmarks, and redirects that wipe UTMs/referrers.

### Source override rules
* **File path**: [`api/lib/sessionization.js`](../../api/lib/sessionization.js#L55-L63)
* **Function/Component**: `sessionizeEvents` / `shouldOverrideSource`
* **What it actually proves**: Prevents direct pageviews within an ongoing session from overwriting the session's active source. If a user lands via Google Ads and browses internal links, those internal pageviews maintain the Google Ads session attribution context instead of resetting to Direct.
* **Limitations**: Sessions are hard-bounded by 30 minutes of inactivity. Session splitting occurs immediately when a new click ID or marketing campaign is acquired (as hardened in Session 132B).

### First-touch attribution
* **File path**: [`tracker/tracker.js`](../../tracker/tracker.js#L197-L223) & [`api/lib/attribution-engine.js`](../../api/lib/attribution-engine.js#L644)
* **Function/Component**: Tracker cookies/localStorage init (`st_ft_src`) & server-side `calculateFirstTouch`
* **What it actually proves**: Preserves the visitor's initial landing touchpoint in a persistent client-side cookie/storage variable `st_ft_src`. During model queries, the server extracts the first chronological touchpoint within the lookback window.
* **Limitations**: Tends to heavily favor top-of-funnel content and organic search over conversion-closing channels. ITP limits on Safari can expire client-side cookies in 1–7 days.

### Last-touch attribution
* **File path**: [`api/lib/attribution-engine.js`](../../api/lib/attribution-engine.js#L647)
* **Function/Component**: `calculateLastTouch`
* **What it actually proves**: Dynamically calculates the last touchpoint prior to the conversion event timestamp.
* **Limitations**: Heavily favors bottom-of-funnel brand searches and retargeting ads, ignoring top-of-funnel discovery touchpoints.

### Linear attribution
* **File path**: [`api/lib/attribution-engine.js`](../../api/lib/attribution-engine.js#L2778-L2784)
* **Function/Component**: `calculateLinearAttribution`
* **What it actually proves**: Distributes revenue or conversion credit equally across all touchpoints in the conversion window.
* **Limitations**: Dilutes the significance of high-intent actions or initial discovery channels by over-attributing credit to intermediate visits.

### U-shaped attribution
* **File path**: [`api/lib/attribution-engine.js`](../../api/lib/attribution-engine.js#L2786-L2805)
* **Function/Component**: `calculateUShapedAttribution`
* **What it actually proves**: Assigns 40% of credit to the first touch, 40% to the last touch, and splits the remaining 20% across all middle touches.
* **Limitations**: Under-attributes credit to critical middle-funnel micro-conversions (e.g. interactive demo usage).

### Time-decay attribution
* **File path**: [`api/lib/attribution-engine.js`](../../api/lib/attribution-engine.js#L2807-L2826)
* **Function/Component**: `calculateTimeDecayAttribution`
* **What it actually proves**: Applies an exponential decay formula to credit touchpoints, giving more weight to events closest to the conversion.
* **Limitations**: Undervalues initial brand awareness and organic discovery campaigns for products with longer sales cycles.

### W-shaped attribution
* **File path**: [`api/lib/attribution-engine.js`](../../api/lib/attribution-engine.js#L2828-L2857)
* **Function/Component**: `calculateWShapedAttribution`
* **What it actually proves**: Attributes 30% of credit to first touch, 30% to lead creation touch, 30% to conversion-closing touch, and distributes 10% evenly among the rest.
* **Limitations**: Tends to require comprehensive journey logging with intermediate lead actions to display correct ratios.

### Revenue attribution handoff
* **File path**: [`api/routes/conversion.js`](../../api/routes/conversion.js#L179-L238) & [`api/lib/attribution-engine.js`](../../api/lib/attribution-engine.js)
* **Function/Component**: `POST /api/conversion` (ingestion) & `calculateRevenueAttribution` (engine)
* **What it actually proves**: Integrates conversion and revenue payloads from supported API/webhook paths when configured and resolves them to historical web session touchpoints using mapped `distinct_id` or linked `user_id`.
* **Limitations**: Real end-to-end revenue attribution remains dependent on staging schema, identity linkage, seeded journeys, and webhook/E2E verification. If no historical pageviews or identity linkages exist for the converting visitor, the conversion maps to Direct/Unattributed.

### Touchpoint chain
* **File path**: [`api/lib/attribution-engine.js`](../../api/lib/attribution-engine.js#L1488-L1499)
* **Function/Component**: `getTouchpointJourney`
* **What it actually proves**: Assembles and sorts the full sequential timeline of events (pageviews, session changes, and conversions) associated with a user profile.
* **Limitations**: Timelines are truncated by the configured lookback window (e.g. 30 days) or sessionization inactivity limits.

### Cookieless fallback
* **File path**: [`tracker/tracker.cookieless.js`](../../tracker/tracker.cookieless.js) & [`api/routes/tracker-id.js`](../../api/routes/tracker-id.js)
* **Function/Component**: Client-side parameterless calls & server-side rotating IP/UA salt hashing
* **What it actually proves**: Runs without cookies or localStorage. Generates a daily rotating salt hash of the visitor's IP and User-Agent on the server to assign a transient session identity.
* **Limitations**: Designed to reduce persistent storage, and requires legal/privacy review before making compliance claims. IDs reset at midnight UTC, which prevents multi-day cohort tracing and retrospective attribution joins.

### URL passthrough
* **File path**: [`tracker/tracker.js`](../../tracker/tracker.js#L330-L356)
* **Function/Component**: `decorateInternalLinks`
* **What it actually proves**: Traverses the DOM for anchors matching configured cross-domain sites and appends tracking context (`_st_sid`, `_st_aid`) to prevent losing visitor identities when navigating across domains.
* **Limitations**: Can be blocked or stripped by advanced privacy protection packages, and does not decorate links generated dynamically by framework routing after page load unless manually re-triggered.

### SPA support
* **File path**: [`tracker/tracker.js`](../../tracker/tracker.js#L264-L282)
* **Function/Component**: `setupSpaTracking` (wrapping history methods)
* **What it actually proves**: Intercepts `window.history.pushState` and `window.history.replaceState` to track virtual pageviews.
* **Limitations**: Requires debouncing (set to 100ms) to prevent tracking multiple duplicate events during rapid internal framework redirects.

### Link decoration
* **File path**: [`tracker/tracker.js`](../../tracker/tracker.js#L450-L492)
* **Function/Component**: `decorateOutboundLink` / `linkDecorator`
* **What it actually proves**: Listens for outbound link clicks on specified partner sites and decorates the URLs with parameters to transfer attribution data.
* **Limitations**: Vulnerable to link tracking protection features in modern browsers (e.g., Safari and Brave) which strip unrecognized query parameters.

### CRM identity stitching
* **File path**: [`tracker/tracker.js`](../../tracker/tracker.js#L377-L392) & [`api/lib/identity-links.js`](../../api/lib/identity-links.js)
* **Function/Component**: `sourcetrack.identify` and `linkIdentities`
* **What it actually proves**: Unifies anonymous visitor profiles with known client IDs or hashed emails submitted from signup/login pages.
* **Limitations**: Cannot merge retroactively before the initial visitor cookie was placed.

---

## 3. Storage, Report, and Diagnostics Mapping

### Click ID Storage Location
* **Storage Target**: Click IDs are parsed by the tracker, sent via `/api/track` or `/api/conversion`, and stored as properties (`fbclid`, `gclid`, `msclkid`, etc.) inside the `events` table (or PostHog equivalent).
* **Code Proof**: Inside `api/routes/track.js` and `api/routes/conversion.js`, incoming body parameters are mapped directly into PostHog event properties. They are not stored in dedicated relational columns.

### Report Builder Visibility
* **Location**: [`dashboard/src/pages/Reports.jsx`](../../dashboard/src/pages/Reports.jsx)
* **Wording & Controls**: Filter selections allow filtering campaigns by source, medium, or campaign. Click ID classifications (e.g. Paid Search or Paid Social) map to channels. The raw click ID strings themselves are visible inside the Event Debugger's event details sidebar, but cannot be grouped as primary dimensions in the simple dashboard views.

### Setup Doctor Visibility
* **Location**: [`dashboard/src/pages/SetupDoctor.jsx`](../../dashboard/src/pages/SetupDoctor.jsx)
* **Wording & Controls**: Setup Doctor appears to verify ad parameter capture at a high level, but raw click ID values are not exposed as first-class dimensions or detailed diagnostics unless visible through Event Debugger/raw properties.

---

## 4. SourceTrack-Specific Hard Questions

### Click ID coverage
* **Which click IDs does SourceTrack currently capture?**
  SourceTrack currently captures 8 click IDs: `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `twclid`.
* **Which Intake click IDs are missing?**
  Missing: `dclid` (Google Display/DV360), `snapclid` (Snapchat), `pclid` (Pinterest), and the spelling variant `li_fatid` (LinkedIn).
* **Are click IDs stored?**
  Click IDs are extracted from the page URL query parameters by the tracker and sent in the `/api/track` (pageview) or `/api/conversion` payloads. They are stored as event properties in PostHog. They are not preserved in separate dedicated relational database columns.
* **Are click IDs visible in Event Debugger / Report Builder / Setup Doctor?**
  Yes, in the Event Debugger (`EventDebugger.jsx`) they are visible under the raw event properties if present. They are not directly highlighted in Setup Doctor or Report Builder other than being groupable by source/medium/campaign.
* **Are click IDs preserved into server-side conversion payloads where appropriate?**
  Yes, `api/routes/conversion.js:197-204` extracts them and forwards them to PostHog and to ad platform Conversion APIs (Meta CAPI, Google, Microsoft, LinkedIn, TikTok) if the plan supports it.
* **Are click IDs included in revenue attribution views?**
  Yes, they are linked during multi-touch and single-touch joins in `api/lib/attribution-engine.js` (joins events on distinct_id and links campaign/medium/click parameters).

### Source taxonomy
* **Does SourceTrack classify Direct, Unknown, Referral, Organic, Paid, Email, Affiliate, Partner, and AI clearly?**
  Yes, `api/lib/channel-classifier.js:141-207` separates traffic into:
  - `AI Search` (AI referrer or source match)
  - `Paid Search` (click IDs or paid mediums)
  - `Paid Social` (social click IDs or paid social mediums)
  - `Display` (display mediums)
  - `Affiliate` (affiliate/partner mediums)
  - `Email` (ESP sources or email mediums)
  - `SMS` (sms mediums)
  - `Organic Search` (search engines)
  - `Organic Social` (social referrers)
  - `Referral` (any other external referrers)
  - `Direct` (direct/none)
  - `Other Campaign` (any other campaign source)
* **Does SourceTrack avoid overwriting meaningful source data with Direct?**
  Yes, first-touch cookie `st_ft_src` is set on first visit and never overwritten. In-memory sessionization logic in `sessionization.js:60-63` ensures internal links/direct traffic within a session do not overwrite the session's initial campaign context.
* **Does SourceTrack preserve first-touch and last-touch source correctly?**
  Yes. First-touch is preserved in localStorage (`st_ft_src`), and last-touch is dynamically resolved at query time or session-split boundaries.
* **Does SourceTrack explain Unknown/Direct honestly in UI/docs?**
  Mostly. The UI shows "direct" or "none" in tables, but could benefit from explicit tooltips explaining that "Direct" includes untagged campaigns, dark social, and security-hardened referrers.
* **Does SourceTrack distinguish paid search from organic search if only click ID exists but UTM is absent?**
  Yes. If `gclid` or `msclkid` is present, it classifies the event as `Paid Search`, and if `fbclid`, `ttclid`, or `li_fat_id` is present, it classifies it as `Paid Social`, even if `utm_medium` is missing.

### Attribution models
* **Does SourceTrack have deterministic tests for its attribution models?**
  **NO.** There are zero automated test files in the codebase (`test.js`, `.test.js`, or `.spec.js`) outside of `node_modules`. All models (First-touch, Last-touch, Linear, U-shaped, W-shaped, Time-decay) are untested automatically.
* **Recommendation:** Setting up a Vitest runner with deterministic fixture datasets (visitor pageview arrays and conversions) is a high-priority requirement before beta.

### Revenue attribution
* **Does revenue attribution receive enough source/click/touchpoint metadata?**
  Yes. The SQL and JS joins link conversions back to all historical pageviews within the lookback window.
* **Does Stripe/payment/manual conversion data connect cleanly to source journeys?**
  The database and attribution logic are designed to connect conversions matching on `distinct_id` or `user_id` mapped by the identity engine. However, real end-to-end revenue attribution remains dependent on staging schema, identity linkage, seeded journeys, and webhook/E2E verification, and is not fully verified from this audit alone.
* **Does SourceTrack show revenue by source/campaign/channel?**
  Yes, in the Dashboard table and Report Builder.
* **Are revenue attribution gaps hidden or honestly explained?**
  They are explained via Setup Doctor and disclaimers in the Snippet page regarding the limits of browser storage.

### AI attribution
* **Does SourceTrack detect AI referrers/sources?**
  Yes, it maps 22 known AI domains (ChatGPT, Claude, Gemini, DeepSeek, Grok, etc.) to the `AI Search` channel.
* **Does AI attribution blend into referral/direct incorrectly?**
  Only if the AI assistant doesn't send a referrer (e.g. in-app or copy-paste links) and no UTM tags are appended. In that case, it falls back to Direct.
* **Does UI explain uncertainty?**
  No. It treats AI Search as a deterministic bucket.
* **Are AI source dimensions available in Report Builder?**
  Yes.
* **Are AI sources included in revenue attribution?**
  Yes, in the `ai_platforms` attribution model.

### Consent/cookieless
* **Does SourceTrack clearly document consent behavior?**
  No. The docs are brief and the opt-in consent flow is basic.
* **Does cookieless mode preserve source data?**
  Yes, but it is restricted to session-scoped matching (daily visitor ID rotation and hourly session ID rotation).
* **Does it use cookies, localStorage, sessionStorage, or anonymous IDs?**
  In standard mode: it uses cookies (`st_aid`) and localStorage (`st_aid`, `st_ft_src`). In cookieless mode: it uses zero cookies or storage and relies on `/api/tracker/id` IP/UA hashes.
* **What happens when storage is unavailable?**
  In standard mode, it falls back to in-memory variables (which resets on page reload). In cookieless mode, it falls back to a temporary session-scoped ID.
* **Does this create privacy/legal claims risk?**
  Yes, privacy/legal review is still required. Cookieless mode is designed to reduce persistent storage, but no compliance claim should be made without legal review. Standard mode uses cookies/localStorage and needs clear disclosure, opt-out, and consent handling.

### GTM / install story
* **Is SourceTrack as easy to install as Intake?**
  Yes, both require a single script tag.
* **Is GTM install documented clearly?**
  No. GTM is not documented in detail, and there is no dedicated `dataLayer` integration.
* **Are copy buttons reliable?**
  Yes, using the modern navigator clipboard API in the Snippet page.
* **Are tracker snippets small/simple?**
  They appear lightweight, but exact bundle-size claims should be verified with file-size output before being stated.
* **Is Setup Doctor more useful than Intake’s install story?**
  Setup Doctor appears stronger for guided implementation because it provides domain, reachability, and verification-token checks; however, this should still be browser-tested with real user flows.
* **Is there a live demo comparable to Intake’s multi-touch simulator?**
  No. SourceTrack is missing an interactive user-facing touchpoint simulator.

---

## 5. Recommendations

### Must do before paid beta (P1)
1. **Deterministic Test Fixtures**: Build a unit testing suite (using Vitest) to verify all attribution models (First, Last, Linear, U-Shaped, W-Shaped, Time-Decay) against static pageview/conversion datasets.
2. **Normalize LinkedIn Click ID**: Parse both `li_fat_id` and `li_fatid` to capture all LinkedIn click parameters.

### Should do soon after paid beta (P2)
1. **Missing Click IDs**: Add support for capturing and storing `dclid`, `snapclid`, and `pclid`.
2. **Google Consent Mode v2 + CMP Integration**: Implement listener code in the tracker to automatically map consent states from major CMPs (Cookiebot, OneTrust) and synchronize with GCM v2 commands.
3. **Third-Party Analytics IDs**: Add cookie-scraping for GA4 client/session IDs, Mixpanel distinct ID, and Amplitude ID to allow cross-system data stitching.

### Defer deliberately (P3)
1. **Browser PII Hashing**: Do not implement browser-side scraping and hashing of email/phone numbers yet. This is highly privacy-sensitive and requires complex legal agreements (GDPR DPA / Meta Terms) before deployment.
2. **GTM dataLayer pushes**: Delay pushing events like `intk_ready` or user profiles to dataLayer until requested by enterprise agency users.

### Do not copy
1. **Client-side Attribution Calculations**: Intake calculates attribution models client-side and pushes them to GTM. SourceTrack should **never** copy this; server-side SQL/HogQL calculation is much safer, more performant, allows changing models retroactively, and prevents exposing calculation code.

---

## 6. Suggested Future Sessions

### Session 139N-1 — Click ID + Source Taxonomy Hardening
* **Goal**: Implement missing click IDs (`dclid`, `snapclid`, `pclid`, `li_fatid`) in both standard/cookieless trackers and route ingestion files.
* **Files touched**: [tracker.js](../../tracker/tracker.js), [tracker.cookieless.js](../../tracker/tracker.cookieless.js), [track.js](../../api/routes/track.js), [conversion.js](../../api/routes/conversion.js).
* **Risks**: Tiny increase in script size; potential regex overlap.
* **Acceptance Criteria**: Verify that mock requests carrying these parameters ingest them properly without errors.

### Session 139N-2 — Attribution Model Deterministic Test Fixtures
* **Goal**: Install Vitest and create a deterministic test suite containing at least 20 multi-touch visitor scenarios to assert perfect mathematical outputs across the core attribution models (first-touch, last-touch, linear, U-shaped, W-shaped, time-decay).
* **Files touched**: [package.json](../../package.json), new test files in `api/lib/` or `api/tests/`.
* **Risks**: None.
* **Acceptance Criteria**: Run `npm run test` and pass all assertions.

### Session 139N-3 — Consent / Cookieless / URL Passthrough Audit
* **Goal**: Document the consent storage mechanisms, outline the legal compliance boundaries, and verify that standard and cookieless modes handle denied storage scenarios gracefully.
* **Files touched**: [tracker.js](../../tracker/tracker.js), [tracker.cookieless.js](../../tracker/tracker.cookieless.js).
* **Risks**: None (audit-only).
* **Acceptance Criteria**: Produce a detailed privacy-map artifact.

### Session 139N-4 — Identity Resolution + Analytics IDs Audit
* **Goal**: Trace the customer identity link pipeline and design a secure, privacy-compliant cookie-scraping module for GA4/Mixpanel/Amplitude IDs.
* **Files touched**: [tracker.js](../../tracker/tracker.js), [identity-links.js](../../api/lib/identity-links.js).
* **Risks**: Legal/compliance risks regarding third-party cookie scraping.
* **Acceptance Criteria**: Design document detailing compliance boundaries.
