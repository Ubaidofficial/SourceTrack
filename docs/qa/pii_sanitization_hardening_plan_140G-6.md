# QA Plan: PII Sanitization Hardening for Proxy + Object Properties (Session 140G-6)

- **Date:** 2026-06-13
- **Branch:** `main`
- **Session:** 140G-6
- **Status:** **COMPLETE**

This document details the audit findings, scope, and technical design for hardening the PII sanitization capabilities across all data ingestion routes in SourceTrack. This reduces accidental PII capture but does not guarantee compliance or complete prevention of sensitive data ingestion.

---

## 1. Audited Files

The following files were audited for PII sanitization coverage:
* `api/lib/utils.js` (redaction utility functions)
* `api/routes/track.js` (standard ingestion route)
* `api/routes/proxy.js` (first-party custom subdomain proxy route)
* `api/routes/conversion.js` (browser conversions)
* `api/routes/conversion-offline.js` (offline/offline integrations)
* `api/routes/webhook-incoming.js` (custom inbound webhook integrations)
* `api/routes/analytics.js` (legacy collection route)

---

## 2. Current Sanitizer Behavior

* **`redactPiiFromUrl(url)`:** Correctly parses search params and replaces values of sensitive keys with `'REDACTED'`. Falls back to a regex replacer if parsing fails.
* **`redactPiiFromObject(obj)`:** Shallowly scans the top-level keys of an object. If a key matches a predefined, hardcoded set of URL field names (e.g. `page_url`, `referrer`), it calls `redactPiiFromUrl`. It does **not** check direct keys for PII, nor does it recursively scan nested objects or arrays.

---

## 3. Current Ingestion Route Behavior

* **`/api/track` (standard):** Calls `redactPiiFromObject` on `req.body` and `req.body.properties`. Since `redactPiiFromObject` is shallow, it only redacts URL fields and misses direct object-level PII keys (like `properties.email` or `properties.phone`).
* **`/sp/e` & `/sp/c` (proxy):** Do **not** call `redactPiiFromObject` or perform any sanitization. Telemetry properties are forwarded to PostHog completely unredacted.
* **`/sp/e` Debug Logging:** Ingest route `/sp/e` currently prints `console.log('[DEBUG proxy/e] Route called with body:', req.body)` containing unredacted client payloads, which presents a data leakage risk.
* **`/api/integrations/incoming` (custom webhook):** Maps custom fields directly to PostHog (`properties.email`, `properties.name`) and stores `raw_payload: JSON.stringify(body)` completely unredacted.
* **`/api/analytics/collect` (legacy):** Inserts parameters (`url`, `referrer`, and custom `properties`) directly into the Supabase database without applying PII redaction.

---

## 4. Exact Implementation Scope

We will implement the following changes in this session:

1. **Remove Ingestion Debug Logging:**
   - Remove committed `[DEBUG proxy/e]` request-body logging from `api/routes/proxy.js` to ensure production log hygiene.

2. **Harden `api/lib/utils.js`:**
   - Update `redactPiiFromUrl` to use `'[REDACTED]'` as the consistent placeholder.
   - Update `redactPiiFromObject` to recursively scan nested objects and arrays up to a maximum depth of 5.
   - Ensure the new recursive sanitizer clones objects rather than mutating parameters in place.

3. **Harden Ingestion Routes:**
   - Sanitize incoming proxy payloads in `api/routes/proxy.js` (`/sp/e` and `/sp/c`) before forwarding them to `ph.capture`.
   - Sanitize custom webhook properties and raw payloads in `api/routes/webhook-incoming.js` before `ph.capture`. For `raw_payload`, sanitize the object before `JSON.stringify` and preserve the existing `raw_payload` size behavior exactly (slice to 500 characters). Do not expand payload size or add new raw payload fields. If the current code already slices/truncates `raw_payload`, keep the same limit and add a test for it. If no size limit exists, document that as a follow-up rather than introducing a new truncation policy in this session.
   - Sanitize the incoming `url`, `referrer`, and `properties` in `api/routes/analytics.js` (legacy collect route) before Supabase insertion.

4. **Verify and Test:**
   - Add unit and route integration tests to a new test file `api/tests/pii-sanitization.test.js`.
   - Mount this test file inside the existing `qa:tracker:unit` script in `package.json`.

---

## 5. Out-of-Scope

The following items are explicitly **out of scope** for this session:
* Building automated PostHog site/project purge tooling.
* Modifying user/account deletion flows or Cascading delete schemas in Supabase.
* Modifying active-site limits, conversion limiters, or billing middleware.
* Introducing database schema migrations.
* Modifying client-side tracker payload contracts.

---

## 6. Redaction Key List (Case-Insensitive Exact Check)

Direct keys (and query parameters in URLs) that match any of the following values will have their values replaced with `[REDACTED]`:

* **Identity/Contact:** `email`, `e-mail`, `user_email`, `customer_email`, `contact_email`, `billing_email`, `shipping_email`, `phone`, `tel`, `mobile`, `billing_phone`, `shipping_phone`, `name`, `first_name`, `last_name`, `full_name`, `customer_name`, `billing_name`, `shipping_name`
* **Credentials/Secrets:** `password`, `pass`, `token`, `access_token`, `refresh_token`, `auth`, `authorization`, `secret`, `api_key`, `apikey`, `secret_key`, `private_key`
* **PII/Demographics:** `ssn`, `dob`, `date_of_birth`, `address`, `street`, `zip`, `postal_code`, `postcode`
* **Codes/Tokens:** `invite`, `invite_code`, `auth_code`, `reset_code`, `verification_code`, `code_verifier`
* **Sensitive External Session IDs:** `checkout_id`, `checkout_session_id`, `stripe_session_id`, `payment_session_id`

Additionally, custom keys ending with `email` or `phone` (such as `billing_email`, `shipping_phone`) will be matched.

`session_id` and generic `key` are redacted in URL query parameters, but direct object-level `session_id` and generic `key` are preserved by default to avoid breaking SourceTrack analytics/sessionization and legitimate event metadata. More specific credential-like fields such as `api_key`, `secret_key`, and `private_key` are redacted.

---

## 7. Preserve/Allowlist Fields

The following keys will be explicitly bypassed by object-level key redaction to prevent breaking analytics, tracking, or attribution:

* **Attribution/UTM:** `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`
* **Click IDs:** `gclid`, `gbraid`, `wbraid`, `fbclid`, `ttclid`, `msclkid`, `li_fat_id`, `twclid`, `rdt_cid`, `epik`, `sccid`
* **System IDs:** `anonymous_id`, `distinct_id`, `site_id`, `site_key`, `event`, `session_id`
* **Referrals/Sources:** `source`, `referrer` (the URL string itself is allowed, but query parameters inside the URL matching the PII key list are redacted)
* **Page URLs:** `page_url`, `current_url`, `url` (the URL string itself is allowed, but query parameters inside the URL matching the PII key list are redacted)
* **Metadata/E-commerce:** `conversion_type`, `value`, `currency`, `order_id`, `product_id`, `product_name`, `category`

Allowlist precedence: known analytics/attribution fields are preserved as direct object keys. However, URL-like values inside allowlisted URL fields still pass through query-parameter redaction.

---

## 8. Test Plan

We will create `api/tests/pii-sanitization.test.js` to assert the following:

* `redactPiiFromUrl` redacts email query param
* `redactPiiFromUrl` redacts phone/token/password query params
* `redactPiiFromUrl` redacts session_id query param
* `redactPiiFromUrl` redacts key query param
* `redactPiiFromUrl` preserves UTM and click ID query params
* `redactPiiFromObject` redacts direct email field
* `redactPiiFromObject` redacts nested properties.email field
* `redactPiiFromObject` redacts phone/password/token/secret/api_key fields
* `redactPiiFromObject` redacts checkout_session_id / stripe_session_id
* `redactPiiFromObject` redacts direct name / first_name / last_name / full_name fields
* `redactPiiFromObject` preserves direct session_id
* `redactPiiFromObject` preserves direct generic key
* `redactPiiFromObject` preserves UTM fields
* `redactPiiFromObject` preserves click IDs
* `redactPiiFromObject` preserves order_id/value/currency/product metadata
* `redactPiiFromObject` preserves product_name
* `redactPiiFromObject` redacts URL query PII inside page_url/referrer/current_url
* `/sp/e` sends sanitized payload to `ph.capture`
* `/sp/e` preserves non-PII attribution fields
* `/sp/c` sends sanitized conversion payload to `ph.capture`
* `/sp/c` preserves conversion value/currency/order_id
* standard `/api/track` still sanitizes URL query PII
* standard `/api/track` now sanitizes direct object-level PII
* `webhook-incoming` sanitizes raw_payload before `ph.capture`
* `webhook-incoming` redacts mapped customer name before `ph.capture`
* `webhook-incoming` preserves conversion value/currency/order_id
* `webhook-incoming` raw_payload is correctly sliced/truncated to 500 characters
* legacy `/api/analytics/collect` redacts URL/referrer query PII before Supabase insert
* No committed `[DEBUG proxy/e]` request-body logging remains.

---

## 9. Validation Commands

We will run:
```bash
npm run qa:identity:unit
npm run qa:tracker:unit
npm run qa:attribution:unit
npm run qa:env-safety
npm run qa:static
git diff --check
grep -RIn "\[DEBUG proxy/e\]\|Route called with body" api dashboard/src docs --exclude-dir=node_modules || true
grep -E -RIn "file:///Users/ubaid|/Users/ubaid/.gemini|sk_live|rk_live|whsec_|eyJ[a-zA-Z0-9_-]*" api dashboard/src docs SESSION_STATE.md SESSION_LOG.md SESSION_HANDOFF.md docs/release_checklist_gate.md || true
```

---

## 10. Paid Beta Blocker Status

* **Status:** **BLOCKED**. Ingestion-side PII sanitization and proxy route leak prevention must be resolved before launching paid beta.
