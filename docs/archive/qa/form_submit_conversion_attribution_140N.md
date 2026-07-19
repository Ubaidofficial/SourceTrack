# Form Submit Conversion Attribution — QA Report (Session 140N)

**Date:** 2026-06-21
**Session:** 140N
**Branch:** `main`
**Status:** PASS
**Environment:** Local / Test runner
**Paid-Beta Verdict:** 🟢 **PASS for this specific form-submit conversion blocker only. Overall SourceTrack paid-beta release remains NOT READY.**

---

## 1. Summary of Changes

We resolved the form submission attribution gap by automatically promoting eligible captured lead forms into the conversion pipeline (`conversion_type = 'form'`), with process-local deduplication and escape hatch controls.

### Files Changed

1. **[shared-dedupe-cache.js](file:///Users/ubaid/Desktop/trackiq/api/lib/shared-dedupe-cache.js) (NEW)**:
   - Houses the process-local short-window (5s) deduplication cache.
   - Provides standardized key generation (`siteId:anonymousId:pageUrl` with query params and hashes stripped).
   - Manages cross-deduplication logic between explicit and auto-promoted conversions.
2. **[track.js](file:///Users/ubaid/Desktop/trackiq/api/routes/track.js) (MODIFY)**:
   - Added the `isLeadForm({ form_id, form_name, form_action_path, page_path })` helper function.
   - Integrated check/registration with `shared-dedupe-cache.js`.
   - Checks the escape hatch property `ignore_conversion`.
   - Triggers `$conversion` capturing in PostHog for eligible forms if plan limits permit.
3. **[conversion.js](file:///Users/ubaid/Desktop/trackiq/api/routes/conversion.js) (MODIFY)**:
   - Integrated short-window duplicate check and registration at the start of `/api/conversion` to cross-dedupe generic explicit conversions and auto-promoted form submissions.
4. **[tracker.js](file:///Users/ubaid/Desktop/trackiq/tracker/tracker.js) & [tracker.cookieless.js](file:///Users/ubaid/Desktop/trackiq/tracker/tracker.cookieless.js) (MODIFY)**:
   - Reads `data-sourcetrack-ignore-conversion` attribute from forms and sends `ignore_conversion` to `/api/track` properties.
5. **[tracker.min.js](file:///Users/ubaid/Desktop/trackiq/tracker/tracker.min.js) & [tracker.cookieless.min.js](file:///Users/ubaid/Desktop/trackiq/tracker/tracker.cookieless.min.js) (MODIFY)**:
   - Re-compiled/minified tracker bundles.
6. **[form-conversion-promotion.test.js](file:///Users/ubaid/Desktop/trackiq/api/tests/form-conversion-promotion.test.js) (NEW)**:
   - Added focused unit tests for `isLeadForm`, key normalization, and cross-deduplication logic.
7. **[tracker-form-capture.test.js](file:///Users/ubaid/Desktop/trackiq/api/tests/tracker-form-capture.test.js) (MODIFY)**:
   - Added `ignore_conversion: true` to PII and path validation tests to isolate standard analytics event tests from auto-promotion.
8. **[forms-and-booking-support.md](file:///Users/ubaid/Desktop/trackiq/docs/guides/forms-and-booking-support.md) (MODIFY)**:
   - Updated developer guides to explain automatic lead form promotion, eligibility rules, deduplication, and the escape hatch.

---

## 2. Before / After Behavior

### Before
- Auto-captured forms only emitted `form_submit` events to `/api/track`.
- No conversion events were registered.
- Forms did not participate in nightly single-touch or multi-touch attribution (which query `event = '$conversion'`).
- Manual form conversion setup required writing custom client scripts or tracking webhooks manually.

### After
- Auto-captured forms emit `form_submit` for analytics, and eligible lead forms are promoted to `$conversion` events with `conversion_type = 'form'`.
- Forms participate in single-touch, multi-touch, and AI platform attribution models.
- Cross-deduplication blocks duplicate conversions if an SDK explicit conversion and auto-promoted form submit occur within 5 seconds.
- No-code escape hatch attribute `data-sourcetrack-ignore-conversion="true"` blocks auto-promotion while keeping standard event analytics intact.

---

## 3. Lead Conversion Rules

### Included (Real Lead Forms)
- Forms containing positive signals in form ID, name, action, or page path: `contact`, `demo`, `quote`, `sales`, `pricing`, `trial`, `signup`, `sign-up`, `waitlist`, `lead`, `consultation`, `book`, `register`.
- Public signup/waitlist/register forms.
- Any ambiguous form on a public page that is not excluded.

### Excluded (Non-Lead Forms)
- Forms containing negative keywords: `search`, `login`, `signin`, `log-in`, `sign-in`, `password`, `forgot`, `reset`, `filter`, `logout`, `signout`, `log-out`, `sign-out`, `subscribe`, `newsletter`.
- Forms submitted on internal app domains/subpaths: `/app`, `/dashboard`, `/admin`, `/console`, `/portal`, `/internal`, `/auth`, `/oauth`.

---

## 4. Deduplication Behavior

- **Short-Window Process-Local Cache:** Uses `node-cache` with a 5-second TTL. Keys are constructed as `siteId:anonymousId:normalizedPageUrl`.
- **Auto-Promotion Rule:** Suppressed if *any* conversion was recently registered for the visitor on that page.
- **Explicit Conversion Rule:** Suppressed only if the incoming conversion is generic/form-level and a recent form-conversion exists. Rich conversions (value > 0, non-form conversion types, or presence of `order_id`) are *never* suppressed by nearby form submits.
- **Honest Disclosure:** This in-memory deduplication cache is process-local and is not persistent or distributed. Durable transaction-level idempotency remains governed by database constraints (via `revenue_idempotency_keys` table) when a stable `order_id` is supplied.

---

## 5. PII and Privacy

- No raw field values (emails, names, phone numbers, text messages, tokens) are read or stored.
- Sanitization rules (`validateFormMetadata`, `redactPiiFromObject`) remain intact and are executed before checking classification.
- The escape hatch supports local privacy constraints.

---

## 6. Verification Results

All automated tests passed successfully:
- `node --test api/tests/form-conversion-promotion.test.js` (14/14 pass)
- `npm run qa:tracker:unit` (217/217 pass)
- `npm run qa:static` (PASS)

---

## 7. Remaining Risks

- **Process-Local Limitation:** Rapid submits targeting different load-balanced container instances might bypass the 5-second in-memory cache, though this is rare for standard lead form submissions.
- **Form Interception:** Highly customized Ajax/SPA forms that prevent submit bubbling or rewrite form context might prevent auto-detection. Standard JavaScript SDK integration remains the recommended fallback for these forms.
