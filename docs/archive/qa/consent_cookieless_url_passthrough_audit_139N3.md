# Consent / Cookieless / URL Passthrough Audit — QA Report (Session 139N-3)

**Date:** 2026-06-12
**Branch:** `main`
**Status:** PENDING REVIEW — not committed

---

## Verdict

- **Standard tracker consent posture:** PARTIAL
- **Cookieless tracking:** SUPPORTED for no browser storage / PARTIAL for attribution continuity
- **URL passthrough:** PARTIAL
- **Cross-domain attribution:** PARTIAL (BLOCKED — not verified)
- **DataFast-parity readiness impact:** P1
- **Paid-beta impact:** NON-BLOCKER

---

## 1. Executive Summary

This session evaluates SourceTrack's privacy and compliance postures, standard tracker storage mechanisms, cookieless rotating visitor hashes, URL decoration, and cross-domain event stitching against the Plurio Intake parity gaps documented in the Plurio Intake audit (139N-0).

SourceTrack is built with privacy-conscious options, but **makes no regional compliance guarantees (GDPR, CCPA, etc.)**. Standard tracking relies on client-side storage, while Cookieless Mode uses a daily-rotating salted IP/UA hash. Basic URL decoration/cross-domain tracking exists in client-side code but remains undocumented and E2E unverified.

---

## 2. Files Inspected

- `tracker/tracker.js` — Standard storage-based tracker
- `tracker/tracker.cookieless.js` — Storage-free cookieless tracker
- `api/routes/tracker-id.js` — Server-side cookieless identity endpoint
- `api/routes/track.js` — Pageview and event ingestion endpoint
- `api/routes/conversion.js` — Conversion event ingestion endpoint
- `api/lib/utils.js` — Sanitization and parameter normalization helpers
- `dashboard/src/pages/Snippet.jsx` — Copy review and guided snippet code

---

## 3. Consent Findings

### 1. Does the standard tracker write cookies?
**PARTIAL.** The standard tracker (`tracker.js`) *only* writes a cookie named `st_aid` if the `data-cookie-domain` attribute is explicitly provided on the script tag. Without this attribute, it does not write any cookies.

### 2. Does it write localStorage?
**SUPPORTED.** Yes. Standard mode writes:
- `st_aid` (Anonymous visitor ID)
- `st_ft_src` (First touch source)
- `st_ft_med` (First touch medium)
- `st_ft_cmp` (First touch campaign)
- `st_ft_ts` (First touch timestamp)
- `st_consent` (Consent preference)

### 3. Does it write sessionStorage?
**SUPPORTED.** Yes. It writes `st_sid` (Session ID) to isolate visits per browser tab.

### 4. Does it provide a documented consent API?
**PARTIAL.** The JavaScript tracker implements the public functions:
- `window.sourcetrack.consent(bool)`
- `window.sourcetrack.optIn()`
- `window.sourcetrack.optOut()`
- `window.sourcetrack.hasConsent()`

However, these APIs are **not documented** in customer-facing guides or the dashboard snippet page.

### 5. Can a customer delay tracking until consent?
**SUPPORTED.** Yes. If the script is loaded with `data-consent-required="true"`, all pageviews, events, and conversions are held in an in-memory queue. They are only sent (flushed) once `sourcetrack.consent(true)` or `sourcetrack.optIn()` is called. If consent is explicitly denied, the queue is cleared without transmitting data.

### 6. Can a customer disable cookies but still send events?
**SUPPORTED.** Yes. Omit the `data-cookie-domain` script tag attribute to restrict standard tracking to `localStorage`/`sessionStorage`, or load the dedicated `tracker.cookieless.min.js` to avoid browser storage entirely.

### 7. Does the tracker integrate with Google Consent Mode v2?
**MISSING.** There is zero integration or listening logic for Google Consent Mode v2 commands.

### 8. Does it expose or listen to `ad_storage`, `analytics_storage`, `ad_user_data`, or `ad_personalization`?
**MISSING.** The codebase has no references to these parameters.

### 9. Does it integrate with CMPs such as Cookiebot, OneTrust, or custom banners?
**MISSING.** There are no listeners or automated integrations for third-party Consent Management Platforms. Customers must manually map CMP callback states to the `sourcetrack.consent()` API.

### 10. Are docs truthful about privacy/consent?
**PARTIAL.** Solution copy has been updated to remove compliance guarantees (such as "fully compliant" or "GDPR-safe") in favor of "privacy-conscious" descriptions. However, the documentation fails to detail the usage of the Consent API (`consent()`, `optIn()`, `optOut()`) or show script tag attribute overrides.

---

## 4. Cookieless Findings

### 11. What exactly does `tracker.cookieless.js` do?
**SUPPORTED.** It loads asynchronously, avoids all cookie/storage writes, and requests a rotating visitor identity from `/api/tracker/id`. It buffers events in-memory until the identity arrives, then flushes them to the server. First-touch parameters are derived in-memory and reset on every page load.

### 12. Does it avoid cookies?
**SUPPORTED.** Yes. It makes zero cookie-writing calls.

### 13. Does it avoid localStorage/sessionStorage?
**SUPPORTED.** Yes. It has zero storage calls.

### 14. How is visitor identity generated in cookieless mode?
**SUPPORTED.** The server endpoint `/api/tracker/id` generates `visitor_id` and `session_id` using a SHA-256 hash of:
`daily_salt + site_key + hashed_ip + hashed_ua`
where `daily_salt` is generated hourly/daily via an HMAC-SHA256 of the UTC date scoped by the `TRACKER_SALT` env secret.

### 15. Does cookieless mode rely on IP/user-agent fingerprinting?
**PARTIAL / UNSAFE CLAIM.** Yes. Mathematically, deriving a unique hash from browser headers (IP & UA) is a form of fingerprinting. Although the salt rotates daily, strict regional regulations (like the EU ePrivacy Directive) treat reading client headers for tracking purposes as "accessing terminal equipment information" which requires disclosure and consent. Marketing claims must never describe cookieless mode as "compliance exempt" or "fully compliant".

### 16. Does cookieless mode preserve UTMs and click IDs?
**SUPPORTED.** Yes. URL query parameters are parsed client-side and sent directly with pageview/conversion payloads.

### 17. Does cookieless mode preserve first-touch attribution?
**PARTIAL / MISSING.** First-touch properties are derived in-memory for the current page load but cannot persist across page reloads or subsequent sessions since there is no local browser storage.

### 18. What attribution accuracy is lost in cookieless mode?
**PARTIAL / MISSING.** Multi-session and cross-day tracking are entirely lost. If a visitor clicks a Google Ad on Monday and makes a direct purchase on Tuesday, they appear as a new "direct" visitor on Tuesday, breaking the attribution history.

### 19. Are docs clear that cookieless is lower-confidence than standard tracking?
**PARTIAL.** The docs state that cookieless visitor hashes reset daily, but do not clearly explain the resulting attribution accuracy loss.

---

## 5. URL Passthrough / Cross-Domain Findings

### 20. Does SourceTrack support URL passthrough/link decoration?
**PARTIAL.** The tracker includes a helper function `window.sourcetrack.decorateUrl(url)` that appends `__st_id` (Anonymous Visitor ID) and `__st_ft` (base64url-encoded first-touch values) as query parameters.

### 21. Can visitor ID, anonymous ID, click IDs, or UTMs be passed across domains?
**PARTIAL.** Only `__st_id` and first-touch UTMs (`__st_ft`) are passed. Raw click IDs (`gclid` etc.) from the active URL are not forwarded automatically unless already stored in first-touch memory.

### 22. Is cross-domain tracking currently supported?
**PARTIAL (BLOCKED — not verified).** If loaded with `data-cross-domains="domain1.com,domain2.com"`, the standard tracker listens to `mousedown` and `touchstart` on links. If the link points to a matched domain, it decorates the URL. The destination site parses and restores `st_aid` and first-touch variables, then strips parameters from the address bar. However, this flow is undocumented, lacks integration tests, and is unverified on live staging environments.

### 23. Are there docs explaining cross-domain attribution limitations?
**MISSING.** No documentation exists.

### 24. Are there security/privacy risks if IDs are passed in URLs?
**SUPPORTED.** Yes. User IDs in URLs can leak to server logs, referrer headers, and browser history. SourceTrack mitigates this by quickly stripping them using `history.replaceState`, but the risk remains during the initial request.

### 25. Should URL passthrough be implemented before DataFast-parity readiness?
**NON-BLOCKER.** Basic client-side decoration is present, but E2E verification is not required for paid-beta launch.

---

## 6. Tracker / API Behavior Findings

### 26. Does `/api/track` accept explicit visitor/session identifiers?
**SUPPORTED.** Yes. It receives `anonymous_id` and `session_id` from the payload.

### 27. Does `/api/conversion` accept explicit visitor/session identifiers?
**SUPPORTED.** Yes. It accepts them and writes them to the event database.

### 28. Can conversions be stitched to pageviews without cookies?
**PARTIAL.** Yes, as long as both events occur on the same UTC day, since they will compute the identical salted IP/UA hash from `/api/tracker/id`.

### 29. Are first-touch fields trusted too much from the client?
**SUPPORTED.** Yes. The ingestion server trusts the client-provided `first_touch_source`, `first_touch_medium`, and `first_touch_campaign` values blindly. A malicious actor could spoof first-touch data.

### 30. Are referrer, UTM, click ID, and first-touch properties sanitized consistently?
**SUPPORTED.** Yes, standard sanitizers (`normalizeUtm`, `normalizeClickIds`) are imported and applied in ingestion endpoints.

---

## 7. Recommended Next Steps (Prioritized)

1. **Document the Consent API (P1)**: Add developer documentation for `data-consent-required`, `sourcetrack.consent(bool)`, `optIn()`, `optOut()`, and `hasConsent()` so customers can integrate with custom consent banners.
2. **Verify Cross-Domain Tracking on Staging (P2)**: Run a staging verification test to check cross-domain link decoration and session restoration.
3. **Google Consent Mode v2 Integration (P3)**: Consider a future lightweight listener to synchronize with GCM v2 signals for advanced setups.
