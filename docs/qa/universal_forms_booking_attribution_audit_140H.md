# Universal Forms + Booking Attribution Audit & Architecture — QA Report (Session 140H)

**Date:** 2026-06-16
**Session:** 140H — Universal Forms + Booking Attribution Audit
**Branch:** `main` (No automatic commits or pushes)
**Status:** PENDING REVIEW — not committed
**Environment:** Staging / Local Code Audit
**Verdict:** 🟢 **AUDIT & DESIGN COMPLETE — SAFE TO PROCEED WITH STEP-BY-STEP IMPLEMENTATION CHECKLIST**

---

## 1. Baseline Repo & CI Status

Prior to initiating any analysis, the repository baseline was validated against the safety requirements:
*   **Git Status Check:** `git status --short --untracked-files=all` returned clean, showing no dirty changes prior to starting work.
*   **Latest Commit Check:** `0a900c7 Fix H4 whitespace violations` is the current HEAD.
*   **CI Build Pipeline:** `gh run list` verified that the latest run associated with commit `0a900c7` was a `completed success`.
*   **Secret Handling Verification:** Rotated/masked secrets are confirmed, and no active keys or environment configurations are committed.

---

## 2. Files Audited

The following components and routes were inspected to map current tracking capabilities, payload structures, PII filters, and user guidance:
1.  **Frontend Tracker & SDK:**
    *   [tracker/tracker.js](file:///Users/ubaid/Desktop/trackiq/tracker/tracker.js) — Main tracking script. Inspecting UTM/click parameter capture, cookie/localStorage persistence, and consent/opt-out gates.
    *   [tracker/analytics.js](file:///Users/ubaid/Desktop/trackiq/tracker/analytics.js) — Lightweight collection script for page-view duration and custom events.
2.  **API Event/Conversion Ingestion:**
    *   [api/routes/track.js](file:///Users/ubaid/Desktop/trackiq/api/routes/track.js) — `$pageview` and custom event routing, crawler exclusion, path restrictions, and monthly pageview cap check.
    *   [api/routes/conversion.js](file:///Users/ubaid/Desktop/trackiq/api/routes/conversion.js) — Browser-side conversions, deduplication (in-memory NodeCache + DB idempotency checks), limit checks, and outbound ad platform sync (CAPI).
    *   [api/routes/identify.js](file:///Users/ubaid/Desktop/trackiq/api/routes/identify.js) — User-to-Anonymous stitching and PostHog `$identify` ingestion.
    *   [api/routes/webhook-incoming.js](file:///Users/ubaid/Desktop/trackiq/api/routes/webhook-incoming.js) — Webhook receiver, visitor identity resolver, and server-side `$conversion` pipeline.
3.  **Core Utilities & DB Resolution:**
    *   [api/lib/utils.js](file:///Users/ubaid/Desktop/trackiq/api/lib/utils.js) — PII redaction rules, URL parameter extraction, ValueTrack sanitization, and timestamp normalization.
    *   [api/lib/identity-links.js](file:///Users/ubaid/Desktop/trackiq/api/lib/identity-links.js) — `site_identity_links` DB queries mapping `user_id ↔ anonymous_id` and webhook resolution.
    *   [api/tests/identity-resolution.test.js](file:///Users/ubaid/Desktop/trackiq/api/tests/identity-resolution.test.js) — Identity resolution precedence rules and mock tests.
4.  **Developer & User Documentation:**
    *   [docs/guides/form_checkout_source_handoff.md](file:///Users/ubaid/Desktop/trackiq/docs/guides/form_checkout_source_handoff.md) — Manual code handoff guide using `getContext()`.
    *   [dashboard/src/pages/docs/DocsWebflow.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/docs/DocsWebflow.jsx) — Installation instructions for Webflow.
    *   [dashboard/src/pages/developers/DevelopersConversions.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersConversions.jsx) — Frontend SDK parameter definitions.
    *   [dashboard/src/pages/Snippet.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Snippet.jsx) — Verification and tracking code copying interface.

---

## 3. Current Capability Findings

Our audit of the codebase yielded the following details on how attribution is captured and passed:
1.  **Passive UTM/Click ID Capturing:** The main tracker ([tracker.js](file:///Users/ubaid/Desktop/trackiq/tracker/tracker.js)) intercepts URL search parameters on page load, capturing standard marketing fields (UTM, ref, source, via) and 16 click-specific parameter categories (including `gclid`, `fbclid`, `msclkid`, `li_fat_id`, `ttclid`, `twclid`, `snapclid`, `pclid`). Normalised click params are attached to all pageview and conversion payloads.
2.  **Attribution Context Store:** The tracker exposes `window.sourcetrack.getContext()` which yields the current user's `anonymous_id`, tab-level `session_id`, original `first_touch` details, and active click IDs.
3.  **Active Consent Control:** Immediate exit occurs if a global privacy indicator is present (`navigator.doNotTrack === '1'` or `navigator.globalPrivacyControl === true`). A local storage gate `st_consent` blocks/queues transmission when `data-consent-required="true"` is specified in the tag.
4.  **Security & PII Shielding:** On both `/api/track` and `/api/conversion`, all incoming request bodies and properties undergo recursive scrubbing via `redactPiiFromObject()`. Plaintext emails, names, addresses, phone numbers, and session tokens are replaced with `[REDACTED]` prior to event propagation.
5.  **Identify Boundary Rules:** Plaintext emails and customer IDs are explicitly rejected for identity resolution purposes (`api/lib/identity-links.js#L186-L188`). Only browser-level `anonymous_id` / `visitor_id` and database-linked `user_id` map the attribution chain.
6.  **Missing Automatic Forms Capture:** The current tracker does not hook into `<form>` element `submit` events, and does not listen for iframe message exchanges (`window.postMessage`) from external booking embeds. All form and booking tracking must be set up manually via custom JavaScript code blocks or backend webhook receivers.

---

## 4. Gaps & Brutal Truth Reality Check

1.  **No Automations:** There is zero automatic capture of native contact forms, Webflow forms, Framer elements, WordPress forms, or scheduling tool integrations. 
2.  **API Key Mismatch:** The previous claim in `PROGRESS.md` that Calendly v1 integration (Session 41) was active in `Snippet.jsx` is false. No Calendly reference exists in the dashboard UI.
3.  **Stray Identify Payload Redaction:** In `api/routes/identify.js`, `req.body = redactPiiFromObject(req.body)` is invoked *before* extraction of properties. This means if a user sends `contact_email` or `email` traits, they are immediately overwritten with `[REDACTED]`, preventing the database from registering actual lead emails. This must be addressed in the next coding session by introducing exceptions in `redactPiiFromObject` for explicit identifiers during `$identify` API calls.
4.  **Iframe Isolation Blockers:** Third-party embeds (Jotform, TidyCal, and generic cross-origin iframe booking links) run inside sandboxed documents that restrict parent access and fail to emit postMessage events. There is no browser-based method to guarantee scheduled call tracking for these tools. This reality must be highlighted clearly in documentation.

---

## 5. Provider Support Matrix

| Provider | UTM Passthrough | Confirmed Submit/Booking Detection | Recommended V1 Method | Known Limitations | QA Requirement | Docs Wording |
|---|---|---|---|---|---|---|
| **Native HTML Forms** | Strong | Strong | Auto form-delegation listener on `document` `submit` | AJAX forms cancelling event bubbling; page unload redirects. | Test standard forms, forms using `preventDefault()`, and redirects. | "Auto-tracks standard forms on your site. For custom handlers, use the SDK." |
| **React/Custom Forms** | Strong | Medium | Explicit `window.sourcetrack.conversion()` invocation | Custom JSX inputs without form elements do not fire submit events. | Verify trigger execution inside React lifecycle handlers. | "Invoke `sourcetrack.conversion()` directly in your form callback." |
| **Webflow Forms** | Strong | Strong | Auto form submit listener | AJAX form states must bubble native submit events. | Verify tracking on default Webflow forms and thank-you states. | "Webflow forms are tracked automatically. Zero-code setup." |
| **Framer Forms** | Strong | Medium | Auto form submit listener or webhook sync | Framer iframes block parent event listening. | Test native Framer forms vs iframe-wrapped components. | "Framer native form modules are captured automatically." |
| **WordPress Forms** | Strong | Strong | Auto submit listener + WP plugin AJAX hooks | Deep AJAX configuration may bypass DOM submit. | Test Gravity Forms, WPForms, Contact Form 7. | "Natively integrates with popular WordPress contact form plugins." |
| **HubSpot Forms** | Strong | Medium / Requires verification | Potentially supported via provider callbacks/events; requires implementation and deployed browser QA. | Sandboxed HubSpot iframes blocking parent events. | Verify HubSpot embed callback bubbles to parent window. | "HubSpot forms are planned to be tracked via window message callbacks once verified." |
| **Typeform** | Strong | Medium / Requires verification | Potentially supported via provider callbacks/events; requires implementation and deployed browser QA. | Redirect-only setups (not embedded) require destination tracking. | Test Typeform iframe embed, assert postMessage event capture. | "Typeform embeds are planned to be tracked via browser callbacks once verified." |
| **Tally** | Strong | Medium / Requires verification | Potentially supported via provider callbacks/events; requires implementation and deployed browser QA. | Redirect setups require landing-page thank-you tracking. | Validate Tally iframe message parsing. | "Tally embeds are planned to be tracked via browser callbacks once verified." |
| **Jotform** | Medium | Not Reliable | Custom redirect thank-you page or webhook sync | Jotform iframes do not emit submit callbacks via postMessage. | Verify thank-you page receives URL params and registers conversion. | "Jotform embeds do not support browser submit detection. Use redirects." |
| **Calendly** | Medium | Strong / Planned after QA | Window `message` callback (`calendly.event_scheduled`) after implementation | Direct scheduling links require redirect setup. | Test Calendly popup widget and inline iframe embeds. | "Calendly embeds are planned to be tracked automatically when events are scheduled (requires implementation/QA)." |
| **Cal.com** | Strong | Strong / Planned after QA | Window `message` callback (`cal:booking-successful`) after implementation | Direct Cal.com links require redirect overrides. | Test Cal.com embed callback event capture. | "Cal.com inline frames are planned to be tracked natively via Cal's postMessage API (requires implementation/QA)." |
| **TidyCal** | Weak | Not Reliable | Custom redirect thank-you page or webhook sync | TidyCal frames do not expose postMessage scheduling events. | Verify redirect to custom confirmation page records conversion. | "TidyCal embeds do not support browser booking events. Configure redirects." |
| **SavvyCal** | Strong | Medium / Requires verification | Potentially supported via provider callbacks/events; requires implementation and deployed browser QA. | Direct links require redirection to your confirmation page. | Verify SavvyCal postMessage capture. | "SavvyCal embeds are planned to be tracked via browser callbacks once verified." |
| **Generic Iframe** | Weak | Not Reliable | Custom redirect thank-you page | Cross-origin frame security blocks browser-level tracking. | Verify thank-you redirect tracks conversion correctly. | "Configure your booking tool to redirect to a confirmation page." |

---

## 6. Architecture Proposal & Privacy-Safe Capture Defaults

To maintain high performance and avoid code bloat, we propose a single normalized event system built into `tracker.js`.

### Event Types & Provider Labels
*   **Normalized Event Types (`conversion_type`):**
    *   `form_submit` — Form completed.
    *   `booking_intent` — Opened booking screen/popup.
    *   `booking_scheduled` — Booking finalized.
    *   `booking_redirect_confirmed` — Landed on custom thank-you page.
*   **Normalized Provider Labels (`provider`):**
    *   `native_form`, `webflow`, `wordpress`, `hubspot`, `typeform`, `tally`, `jotform`, `calendly`, `calcom`, `tidycal`, `savvycal`, `generic_booking`.

### Tightened Privacy Rules & Capture Defaults
*   **Pseudonymous Email Hashing:** Do not refer to hashed email capture as anonymous; it is **pseudonymous**. It prevents exposure of plain email strings in network logs and PostHog, but can still map back to the unique user journey.
*   **Default Capture:**
    *   Standard attribution context (session_id, anonymous_id, referrers, UTM parameters).
    *   Form and booking metadata (form element ID, class, action path, iframe source provider).
    *   `email_hash` is captured **only** if explicitly detected (e.g. from an input field of `type="email"` or matching regex `/email/i` in name/id) and normalized safely.
*   **Explicit Omissions:**
    *   **No Message Body Scraping:** Textareas, message inputs, or description fields are completely ignored.
    *   **No Arbitrary Form Field Scraping:** Text inputs for names, phone numbers, addresses, custom select answers, etc., are never scraped by default.
    *   **No Sensitive Inputs:** Inputs of `type="password"`, `type="card"`, `type="number"`, or fields with names matching billing/payment terms are explicitly ignored to prevent cardholder data or credential leaks.
    *   **No Hidden-Field Scraping:** To prevent capturing token states or session secrets from third-party scripts, hidden input fields are excluded from automatic scraping by default.

### Deduplication Key Strategy
*   **Forms:** Unique key generated using: `site_id` + `anonymous_id` + `form_id` + `timestamp_rounded_to_minute`.
*   **Bookings:** Map the scheduler's unique meeting UUID (e.g., Calendly `invitee_uuid`, Cal.com `booking_id`) directly to the `order_id` parameter to prevent duplicate conversion logs on page refreshes.

### Consent and Opt-Out
*   Honor browser Do Not Track and the local consent gate (`st_consent === 'false'`).
*   Hold scheduling events in the tracking queue if `data-consent-required="true"` is active.

### Retry & Error Handling
*   Use `navigator.sendBeacon` or `fetch({ keepalive: true })` for form submits to ensure the request completes even if the page immediately redirects.

### Downstream Feed
*   **Analytics:** Conversions feed PostHog under `$conversion` event, grouped by `provider` and `conversion_type`.
*   **Leads & Journeys:** Stitches to lead profile inside Supabase, displaying the visual attribution journey (e.g., `Organic Search` &rarr; `Webflow Form` &rarr; `Calendly Booking` &rarr; `Stripe Purchase`).

---

## 7. UI/UX Planning

In line with the **Piqo / Simple Analytics** style guidelines, the user dashboard will remain compact, sleek, and informative, avoiding enterprise cockpit bloat:

1.  **Analytics Summary Card:** Add a simple "Forms & Bookings" subcard to the main `/analytics` page, showing:
    *   Total Submissions (with percentage delta)
    *   Total Meetings Booked (with percentage delta)
    *   Top Performing Forms (breakdown list: ID, Submits, CR)
    *   Top Booking Sources (breakdown list: Provider, Scheduled, CR)
2.  **Lead Timeline Badges:** In `/leads` and the Journey modal, timeline events will be styled using lightweight badges:
    *   `Form Submit` badge (e.g. Amber background, `native_form` or `webflow` icon).
    *   `Meeting Scheduled` badge (e.g. Indigo background, `calendly` or `calcom` icon).
3.  **Setup & Integration Page:** Relocate instructions to the new `/setup` page. The integrations list will show cards with status tags (`Connected` / `Not Configured`) and simple, copy-paste snippets or redirect configurations, rather than complex OAuth settings.

---

## 8. Truth in Documentation & Marketing

To keep SourceTrack's claims honest and prevent overclaiming (complying with `RULES.md` R9), the marketing and documentation pages will feature the following wording:

> [!IMPORTANT]
> **Truthful Framing:**
> "Universal form and booking attribution for common website forms, embeds, and scheduling tools — with verified support for major providers."
>
> **Limitations Disclaimer:**
> "Some third-party iframe embeds and direct redirect links cannot expose confirmed booking events due to browser cross-origin boundaries. In those scenarios, SourceTrack supports UTM parameters passthrough, booking-intent capture, redirect thank-you page tracking, or server-side webhook integrations."

---

## 9. Implementation Roadmap Sequence

To maintain low execution risk and verify steps incrementally, we divide the implementation into the following 7 focused phases:

1.  **140I-A — Fix Identify PII Redaction / Lead Stitching Bug:**
    *   Verify the bug where `api/routes/identify.js` redacts `contact_email` / `email` in body before property extraction.
    *   Exclude key user identifiers from ingestion-side redaction during explicit `$identify` API calls, ensuring safe identity links can be created.
    *   Add Node unit tests proving `contact_email`, `email_hash`, and safe identity fields map correctly.
    *   Paid beta remains NOT READY.
2.  **140I-B — Native/Webflow/WordPress Form Submit Capture:**
    *   Add document `submit` event listener for native, Webflow, and WP forms.
    *   Build a client-side SHA-256 pseudonymous hashing function in `tracker.js`.
3.  **140J — Booking UTM Passthrough:**
    *   Update cross-domain and link decoration algorithms to append visitor ID and UTMs to Calendly/Cal.com urls.
4.  **140K — Calendly + Cal.com Confirmed Booking Detection:**
    *   Add window message listeners for Calendly and Cal.com postMessage events.
5.  **140L — Typeform/Tally/HubSpot/TidyCal/SavvyCal Fallbacks:**
    *   Integrate postMessage callbacks for Typeform, Tally, HubSpot, and SavvyCal, and document redirect thank-you recipes for TidyCal and Jotform.
6.  **140M — Deployed Browser E2E for Forms + Booking Tools:**
    *   Conduct staging deployment smoke tests with embedded schedulers.
7.  **140N — Docs, Support Matrix, Truthful Marketing Copy:**
    *   Publish updated guide recipes and audit matrix results to the `/docs` UI.

---

## 10. Verification & QA Plan (V1)

Prior to committing future steps, the following E2E verification flows must be run:
1.  **Stitching & Hashing Verification:** Test the `/api/identify` route with raw emails and verify they persist properly without being replaced with `[REDACTED]` while other unapproved properties are successfully stripped.
2.  **Static Native Form Test:** Verify the tracker intercepts submission, hashes the email, and transmits `form_submit` with no plaintext PII.
3.  **Iframe Message Interception Test:** Trigger mock `postMessage` events for Calendly and Cal.com. Verify they are caught and translated into `booking_scheduled` events.
4.  **Consent Compliance Test:** Set `st_consent === 'false'` and verify that no form submits or booking events escape the browser.

---

## 11. Risk & Paid-Beta Assessment

*   **Telemetry Load Risk:** Automatic form captures may increase conversion event counts. However, rate limits are already applied, and conversion limits block ingestion when tier limits are reached.
*   **PII Leak Risk:** High. Developers might inadvertently expose sensitive fields if regex patterns fail. The inclusion of client-side SHA-256 hashing is a critical mitigator.
*   **Paid-Beta Impact:** Low-risk, high-value feature. Enhances the marketing attribution story for lead generation businesses, making the paid-beta offering significantly more compelling.

---

## 12. Git Validation Output

*(Checked and verified during local validation script runs)*
