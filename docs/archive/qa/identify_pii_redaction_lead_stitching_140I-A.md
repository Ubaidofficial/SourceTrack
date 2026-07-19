# QA Report — Fix Identify PII Redaction / Lead Stitching Bug (Session 140I-A)

## Baseline Status
* Latest commit on `main` is `94c0fac Fix 140H audit whitespace violation`.
* The latest GitHub Action CI regression pipeline run ID `27652041956` completed with `success`.
* Working tree was verified clean before changes.

## Files Audited
* [api/routes/identify.js](file:///Users/ubaid/Desktop/trackiq/api/routes/identify.js)
* [api/lib/utils.js](file:///Users/ubaid/Desktop/trackiq/api/lib/utils.js)
* [api/lib/identity-links.js](file:///Users/ubaid/Desktop/trackiq/api/lib/identity-links.js)
* [api/tests/pii-sanitization.test.js](file:///Users/ubaid/Desktop/trackiq/api/tests/pii-sanitization.test.js)

## Bug Reproduction Evidence & Root Cause
The endpoint `/api/identify` was invoking `redactPiiFromObject` on the entire request body before extracting properties. Because fields like `contact_email` or any `email` traits are identified as PII, they were immediately replaced with the string `"[REDACTED]"`. This prevented the handler from extracting the actual lead email, breaking downstream property synchronization to PostHog.

## Fix Summary
We redesigned `/api/identify` using a strict security-first pattern:
1. **Validator Helpers:**
   * `validateAndSanitizeTrackingId()`: Checks `anonymous_id` and `visitor_id` for length limits, and rejects emails (`@`), phone numbers, JWTs, or sensitive token/secret prefixes (`sk_`, `pk_`, `rk_`, `key_`, `api_`, etc.).
   * `validateAndSanitizeUserId()`: Extends the tracking ID check for `user_id` and `external_id`, also rejecting unsafe PII keywords like `password`.
2. **Allowed Field Extraction:** We extract `user_id`, `anonymous_id`, `visitor_id`, `contact_email`, `email_hash`, and `external_id` from the raw body or traits and pass them through their respective safe validators.
3. **Traits Redaction:** We delete all allowed identity keys from a copy of `traits` and run `redactPiiFromObject` on the remaining traits. This ensures all other arbitrary fields (phone numbers, passwords, card details, addresses, message bodies) are fully redacted.
4. **Properties Construction (No Raw Email Leak):** We inject the allowed and sanitized fields into `$set` properties. However, raw `contact_email` is **not** included in the `$set` properties sent to PostHog. Instead, if a raw `contact_email` was provided, we derive `email_hash` via SHA-256 and forward that to PostHog.
5. **No DB Storage of Raw Email:** We do not save raw emails in the database. The `site_identity_links` table continues to record only `user_id ↔ anonymous_id` mappings, maintaining tenant isolation via the site ID.

## Tests Added/Updated
We added integration tests to [api/tests/pii-sanitization.test.js](file:///Users/ubaid/Desktop/trackiq/api/tests/pii-sanitization.test.js):
1. **Allowed Identity Extraction & Redaction Check:** Asserts that `/api/identify` preserves allowed fields, derives/forwards `email_hash`, prevents raw `contact_email` leakage to PostHog properties, and redacts unsafe traits.
2. **Safety Gate Check:** Asserts that unsafe `user_id` and `external_id` values (emails, phone numbers, API keys, tokens, session IDs) are rejected/sanitized.
3. **Tracking ID Validator Check:** Asserts that unsafe `anonymous_id` and `visitor_id` inputs are rejected.
4. **Link Storage & Parameter Assertions:** Verifies that a valid identity link maps with tenant scoping (`site_id`, `user_id`, `anonymous_id`, `source: 'identify'`), and that missing/unsafe values do not trigger database upsert calls.
5. **No Email Fallback Check:** Asserts that passing `contact_email` alone does not write database links or populate `user_id`.

All unit tests run and pass successfully.

## Privacy/PII Behavior
* Raw `contact_email` is never sent to PostHog by default, nor is it stored in the database.
* `contact_email` is only used to derive `email_hash` after conservative email-format validation.
* `email_hash` is treated as a pseudonymous identifier, and can be derived from `contact_email` or accepted directly.
* All other traits containing phone numbers, passwords, card/payment fields, addresses, session tokens, or message bodies are redacted to `[REDACTED]`.
* No raw emails are printed or logged during handler execution or tests.

## Tenant Isolation Notes
Identity links are mapped using `req.site.id` during the `storeIdentityLink` call, preventing cross-tenant leakage.

## Validation Output
All verification commands were run and passed.

## Remaining Risks
email_hash is pseudonymous and may still be linkable. Future form-capture sessions must continue to avoid raw form-field forwarding and must validate all pseudonymous identifiers before ingestion.

## Paid-Beta Status
* Paid-beta status remains **NOT READY** (pending further sessions/QA).
