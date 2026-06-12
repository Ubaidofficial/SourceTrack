# Identity Resolution & Analytics IDs Audit — QA Report (Session 139N-4)

**Date:** 2026-06-12
**Branch:** `main`
**Status:** PENDING REVIEW — not committed

---

## Verdict

- Anonymous visitor/session identity: SUPPORTED
- Known user/customer identity: PARTIAL
- Email/customer metadata stitching: MISSING
- Webhook/Stripe revenue stitching: PARTIAL
- Cookieless identity continuity: PARTIAL
- Attribution-engine identity stitching: PARTIAL
- DataFast-parity readiness impact: P0
- Paid-beta impact: BLOCKER

---

## 1. Executive Summary

This session evaluates SourceTrack's identity resolution and analytics ID stitching. It checks how standard visitor IDs, session IDs, user IDs, emails, Stripe customer metadata, webhook payloads, and conversion touchpoints stitch together across ingestion and query paths.

The audit reveals a critical gap (P0 blocker): **Stripe and incoming webhooks do not automatically stitch conversions using email or user ID links**. Furthermore, the **attribution engine queries raw distinct IDs directly in HogQL without resolving PostHog aliases or consulting database identity links**. This prevents Stripe/CRM revenue events from matching anonymous visitor journeys unless the browser's raw anonymous ID is manually passed in the webhook payload.

---

## 2. Files Inspected

- `tracker/tracker.js` — Client-side tracker and identify API
- `tracker/tracker.cookieless.js` — Storage-free cookieless tracker
- `api/routes/track.js` — Ingestion route for pageviews and custom events
- `api/routes/conversion.js` — Ingestion route for browser conversions
- `api/routes/conversion-offline.js` — Ingestion route for offline conversions
- `api/routes/webhook-incoming.js` — Ingestion route for generic incoming webhooks
- `api/routes/stripe-webhook.js` — Ingestion route for Stripe checkout webhooks
- `api/routes/journey.js` — Visitor journey timeline query route
- `api/lib/identity-links.js` — Database identity mapping and resolution helpers
- `api/lib/attribution-engine.js` — HogQL query builder for attribution reporting
- `api/jobs/nightly-attribution.js` — Nightly batch processing attribution job

---

## 3. Tracker Identity Findings

### 1. What ID does the standard tracker generate for a visitor?
**SUPPORTED.** The standard tracker (`tracker.js`) generates a random v4-style UUID using `Math.random()` in a local helper `uid()`.

### 2. Where is the anonymous visitor ID stored?
**SUPPORTED.** It is stored in browser `localStorage` under the key `st_aid`. If `data-cookie-domain` is configured on the script tag, it is also set as a 1-year cookie named `st_aid`.

### 3. What ID does the standard tracker generate for a session?
**SUPPORTED.** It generates a random v4-style UUID using the same `uid()` helper.

### 4. Where is session ID stored?
**SUPPORTED.** It is stored in `sessionStorage` under the key `st_sid`, isolating sessions per browser tab.

### 5. What happens when localStorage/sessionStorage is unavailable?
**PARTIAL.** The storage helpers catch errors and return `null` (e.g. in private browsing modes with strict storage blocks). In this case, a new visitor ID and session ID are generated on every page load, breaking multi-page session tracking and cross-session attribution.

### 6. Can customers pass a known `user_id` from their app?
**SUPPORTED.** Yes. Customers can call the JS API `window.sourcetrack.identify(userId, traits)` which forwards `user_id` to `/api/identify`.

### 7. Can customers pass a known `customer_id`?
**PARTIAL.** Customers can pass `customer_id` inside the `traits` parameter of `identify()`. However, the endpoint `/api/identify` does not map `customer_id` to a top-level field; it is stored inside the custom `traits` JSON column.

### 8. Can customers pass email or email hash?
**SUPPORTED.** Yes, by passing `email` in the `traits` parameter of `identify()`. Emails are received and stored in plaintext.

### 9. Does tracker code expose an identify API?
**SUPPORTED.** Yes, `window.sourcetrack.identify(userIdOrTraits, traits)`.

### 10. Does tracker code support aliasing anonymous ID to known user ID?
**SUPPORTED.** Yes. In `/api/identify`, if both `user_id` and `anonymous_id` are provided, it calls `ph.alias({ distinctId: user_id, alias: anonymous_id })` and saves the mapping to the `site_identity_links` table in Supabase.

---

## 4. Cookieless Identity Findings

### 11. What ID does cookieless mode use?
**SUPPORTED.** Cookieless mode does not write to browser storage. It fetches a server-derived `visitor_id` and `session_id` from `/api/tracker/id`.

### 12. Is the cookieless visitor ID stable across page loads?
**SUPPORTED.** Yes, as long as the visitor's IP address, User-Agent, and `site_key` remain unchanged on the same UTC calendar day.

### 13. Is it stable across days?
**PARTIAL / MISSING.** No. The server hashes the components using a daily salt HMAC that rotates on the UTC date boundary. Returning visitors receive a new ID at midnight UTC, breaking cross-day attribution.

### 14. Can cookieless conversions stitch to pageviews?
**SUPPORTED.** Yes, provided both occur on the same UTC day and the visitor's IP and User-Agent are identical.

### 15. What breaks when IP/UA changes?
**PARTIAL / MISSING.** If the visitor switches networks (e.g., cell to Wi-Fi, VPN toggle) or changes browser UA, the hash resolves to a new visitor ID, breaking session continuity.

### 16. Does cookieless identity create privacy/fingerprinting risk?
**UNSAFE CLAIM.** Yes. Generative IP/UA hashing constitutes device fingerprinting. Regional regulations (such as EU ePrivacy Directive) treat reading connection headers for ID generation as "accessing terminal equipment information," requiring user consent. It must not be marketed as GDPR-exempt.

### 17. Are docs honest about cookieless stitching limits?
**PARTIAL.** Marketing and guided snippet copies disclose basic limits, but developer docs do not explain the direct loss of cross-day and multi-session attribution accuracy.

---

## 5. API Stitching Findings

### 18. What identifiers does `/api/track` accept?
**SUPPORTED.** It accepts `anonymous_id` and `session_id`. It does not accept or map `user_id` or `email` at the root.

### 19. What identifiers does `/api/conversion` accept?
**SUPPORTED.** It accepts `anonymous_id`, `session_id`, and `user_id`.

### 20. What identifiers does `/api/conversion-offline` accept?
**SUPPORTED.** It accepts `anonymous_id`, `user_id`, and deduplication keys (`order_id`, `payment_id`, etc.).

### 21. What identifiers do webhook conversion flows accept?
**PARTIAL.**
- Generic incoming webhooks parse `anonymous_id`, `visitor_id`, `user_id`, or `email`.
- Stripe webhooks parse `client_reference_id` or metadata keys like `anonymous_id`/`visitor_id`/`sourcetrack_user_id`/`site_user_id`.

### 22. Is `anonymous_id` consistently used as PostHog `distinctId`?
**PARTIAL.** No.
- `/api/track` and `/api/conversion` use `anonymous_id`.
- `/api/conversion/offline` uses `anonymous_id` if present, falls back to `resolveAnonymousId(user_id)`, and falls back to `user_id` or an unattributed placeholder if neither is resolved.
- Webhook endpoints use parsed identifiers directly without calling `resolveAnonymousId`.

### 23. Are `session_id`, `user_id`, `customer_id`, and `email` consistently attached as event properties?
**PARTIAL.** No.
- `session_id` is only attached for browser events.
- `user_id` is only attached if sent on conversions or identifies.
- `email` is only attached on identifies and webhooks.
- `customer_id` is only stored inside raw traits.

### 24. Does the attribution engine stitch by `distinct_id`, `anonymous_id`, `user_id`, or other fields?
**PARTIAL / MISSING.** It stitches strictly by the literal PostHog `distinct_id` field.
HogQL queries in `attribution-engine.js` (and the nightly job) perform direct joins on `pv.distinct_id = e_inner.distinct_id`. They do not resolve aliases or consult `site_identity_links` to stitch conversions under `user_id` to pageviews under `anonymous_id`.

### 25. Can a conversion be attributed if only `user_id` is present but no anonymous ID exists?
**PARTIAL / MISSING.** No. If the conversion has only `user_id` and cannot be resolved to an anonymous ID, the attribution engine will look for pageviews matching the `user_id` distinct ID. Since pageviews are logged under `anonymous_id`, no touchpoints will be matched, resulting in "Direct" or "unattributed" attribution.

### 26. Can Stripe/webhook revenue be attributed if only Stripe customer metadata exists?
**PARTIAL / MISSING.** Only if the metadata contains one of the supported anonymous ID fields. If it only contains the Stripe Customer ID or customer email, it cannot be stitched because Stripe webhooks do not query database identity links or customer tables.

### 27. Is there a clear precedence order for identity matching?
**PARTIAL.** Precedence is defined ad-hoc inside `stripe-webhook.js` and `conversion-offline.js` but is not standardized.

---

## 6. Privacy and Spoofing Risks

### 28. Are user-provided IDs sanitized?
**SUPPORTED.** Yes, trimmed and validated against max length.

### 29. Are emails redacted or hashed before being sent to analytics providers?
**MISSING.** Plaintext emails are captured and sent to PostHog and databases. `redactPiiFromObject` only strips query strings in URLs, not object properties.

### 30. Are IDs trusted too much from the client?
**SUPPORTED.** Yes. The server accepts and trusts client-supplied identifiers and first-touch properties without cryptographic verification.

### 31. Can a malicious client spoof `anonymous_id`, `user_id`, or first-touch fields?
**SUPPORTED.** Yes, any client can send spoofed HTTP requests to ingestion endpoints using a valid `site_key`, polluting attribution datasets.

### 32. Is there server-side validation or membership/site-key protection where needed?
**SUPPORTED.** Yes, routes are protected by `validateSiteKey` and `requireSiteMembership` (for read endpoints).

### 33. Are webhook conversions idempotent and deduped?
**SUPPORTED.** Yes, offline and Stripe webhook conversions use the `claimIdempotencyKeys` table to prevent duplicate ingestion.

### 34. Are docs truthful about identity stitching accuracy?
**PARTIAL.** Developer documentation fails to warn users about webhook/Stripe attribution gaps when anonymous IDs are missing. Note that the Guided Snippet UI copy has been explicitly corrected to clarify that browser-generated `anonymous_id` must be passed for reliable Stripe/offline stitching and to warn against plaintext email-only or user_id-only fallback expectations.

---

## 7. Product Readiness Impact

### 35. Is identity stitching good enough for DataFast-parity attribution?
**MISSING.** It is not ready. Webhook revenue events (Stripe checkouts) will mostly fail to stitch to visitor touchpoints unless the developer manually maps the anonymous ID to the metadata.

### 36. What identity gaps affect SaaS attribution?
**P0 Blocker.** Subscriptions updated via Stripe or CRM webhooks containing only `user_id` or `email` will not resolve to the anonymous visitor session, breaking organic and paid channel attribution.

### 37. What identity gaps affect ecommerce/Shopify attribution?
**P1.** Hosted checkout flows lose visitor context unless the `anonymous_id` is successfully passed to checkout metadata and returned via webhook.

### 38. What identity gaps affect agency/client reporting?
**P2.** Unverified and undocumented cross-domain identification makes it impossible to guarantee multi-site attribution.

### 39. Which gaps are P0/P1/P2?
- **P0 Blocker**: Incoming webhooks (Stripe and generic) do not call `resolveAnonymousId` to stitch user IDs or emails to visitor profiles.
- **P1**: The attribution engine and nightly job queries join strictly on literal `distinct_id` without resolving aliases.
- **P2**: Lack of developer guides on implementing checkout identity forwarding.

### 40. What should be built next?
1. **Webhook Resolution (P0)**: Update `api/routes/stripe-webhook.js` and `api/routes/webhook-incoming.js` to attempt resolving `user_id` or `email` to `anonymous_id` using `site_identity_links`.
2. **Attribution Engine Alias Stitching (P1)**: Update HogQL queries to fetch linked anonymous IDs for conversion distinct IDs when performing attribution matching.
