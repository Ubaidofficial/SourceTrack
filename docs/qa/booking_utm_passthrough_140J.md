# Session 140J — Booking UTM Passthrough QA Report

**Session:** 140J
**Date:** 2026-06-17
**Status:** Implementation complete. Awaiting raw diff review and user commit approval.
**Paid-beta status:** NOT READY (unchanged)

---

## Baseline Status

| Item | Status |
|---|---|
| Latest `main` CI | ✅ green (`Fix 140I-B tracker form test whitespace`) |
| Working tree before session | Clean (zero modified/untracked files) |
| Expected commits present | ✅ `Fix 140I-B tracker form test whitespace`, `Session 140I-B`, `Session 140I-A` |
| `/api/routes/conversion.js` | Untouched (verified: `git diff` shows no changes to conversion route) |

---

## Files Audited

| File | Purpose |
|---|---|
| `tracker/tracker.js` | Standard tracker — outbound link tracking, cross-domain decoration hook |
| `tracker/tracker.cookieless.js` | Cookieless variant — same structure, no consent gate variable |
| `api/tests/tracker-click-ids.test.js` | Existing click ID test suite |
| `api/tests/tracker-form-capture.test.js` | Existing form capture test suite |
| `api/routes/track.js` | Backend track ingestion (no changes needed in this session) |

---

## Implementation Summary

### What was changed

**`tracker/tracker.js`** — Added after `handleCrossDomainClick` / auto-decoration section:
- `BOOKING_HOSTS` list (7 providers)
- `isBookingHost(hostname)` — exact or subdomain match
- `sanitizeBookingParam(val)` — lightweight sanitizer for `ref`/`source`/`via`
- `handleBookingPassthrough(e)` — mousedown/touchstart handler that appends missing safe attribution params to supported booking URLs; respects `_consentGiven === false` opt-out gate
- Registered on `mousedown` + `touchstart` (same timing as cross-domain decoration, fires before browser navigation)

**`tracker/tracker.cookieless.js`** — Same booking passthrough section added, with `isExcluded()` guard instead of the consent variable (the cookieless tracker has no consent gate).

**`tracker/tracker.min.js`** / **`tracker/tracker.cookieless.min.js`** — Rebuilt via `npm run build:tracker`.

**`api/tests/tracker-booking-passthrough.test.js`** — New test file with 27 tests (20 for `tracker.js`, 7 for `tracker.cookieless.js`).

**`package.json`** — Added `tracker-booking-passthrough.test.js` to `qa:tracker:unit`.

---

## Provider Support Matrix

> All providers below support UTM passthrough only. No confirmed booking detection is implemented in this session.

| Provider | Host | UTM Passthrough | Confirmed Booking Detection |
|---|---|---|---|
| Calendly | `calendly.com` | ✅ supported | ❌ not implemented |
| Cal.com | `cal.com` | ✅ supported | ❌ not implemented |
| TidyCal | `tidycal.com` | ✅ supported | ❌ not implemented |
| SavvyCal | `savvycal.com` | ✅ supported | ❌ not implemented |
| Zcal | `zcal.co` | ✅ supported | ❌ not implemented |
| OnceHub | `oncehub.com` | ✅ supported | ❌ not implemented |
| YouCanBook.me | `youcanbook.me` | ✅ supported | ❌ not implemented |
| Iframe embeds | — | ❌ not supported | ❌ not implemented |
| HubSpot Meetings | — | ❌ not in scope | ❌ not implemented |
| Typeform | — | ❌ not in scope | ❌ not implemented |
| Tally | — | ❌ not in scope | ❌ not implemented |
| Provider-complete events | — | — | ❌ not implemented |

---

## Allowed Passthrough Parameters

The following parameters are appended only when **not already present** in the booking URL:

| Category | Parameters |
|---|---|
| UTM | `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` |
| Google Ads | `gclid`, `gbraid`, `wbraid` |
| Meta / Facebook | `fbclid` |
| Microsoft Ads | `msclkid` |
| TikTok | `ttclid` |
| LinkedIn | `li_fat_id` |
| Twitter/X | `twclid` |
| Short attribution | `ref`, `source`, `via` (sanitized — see below) |
| SourceTrack attribution | `sourcetrack_source`, `sourcetrack_medium`, `sourcetrack_campaign` |

**Deferred (not appended in this session):**
- `sourcetrack_landing_page` — deferred because the tracker does not yet have a safe, deduplicated path sanitizer suitable for URL-valued passthrough; appending raw `location.href` or `location.pathname` risks forwarding query strings with PII into booking provider sessions.
- `sourcetrack_referrer` — same reason as above.

---

## Privacy Boundaries

### `ref` / `source` / `via` Sanitization (`sanitizeBookingParam`)

Values are rejected if they:
- Are not a `string`
- Are empty or longer than 80 characters
- Contain `@` (email indicator)
- Contain 6 or more digits (phone indicator)
- Begin with `http://`, `https://`, or `//` (URL-like)
- Begin with token/secret prefixes: `sk_`, `pk_`, `rk_`, `key_`, `api_`, `token`, `secret`
- Match a JWT-like pattern (two dots separating base64 segments)

### Never forwarded

- Raw email addresses
- Names, phone numbers, physical addresses
- Message/note content
- Passwords, tokens, API keys, secrets
- Any input field values
- Any value from form inputs
- `sourcetrack_landing_page` / `sourcetrack_referrer` (deferred)

### Existing booking URL params

Never overwritten — `url.searchParams.has(key)` check before every `set()`.

### Consent and privacy opt-outs respected

- **`tracker.js`**: `if (_consentGiven === false) return` — consistent with all other tracker behaviors
- **`tracker.cookieless.js`**: `if (isExcluded()) return` — consistent with cookieless excluded-path behavior
- **DNT/GPC**: The main tracker IIFE exits early on `doNotTrack === '1'` or `globalPrivacyControl === true`, so the booking handler never registers

---

## Tests Added

**File:** `api/tests/tracker-booking-passthrough.test.js`
**Test count:** 27 total (20 tracker.js + 7 cookieless)

| # | Test | Result |
|---|---|---|
| 1 | Calendly link gets safe UTM params appended | ✅ |
| 2 | Cal.com link gets safe UTM params appended | ✅ |
| 3 | TidyCal link gets safe UTM params appended | ✅ |
| 4 | SavvyCal link gets safe UTM params appended | ✅ |
| 5 | Existing booking-link params are not overwritten | ✅ |
| 6 | Hash fragments are preserved | ✅ |
| 7 | Non-booking external links are not mutated | ✅ |
| 8a | Unsafe ref with email is not appended | ✅ |
| 8b | Unsafe ref with phone digits is not appended | ✅ |
| 8c | Unsafe ref with URL is not appended | ✅ |
| 8d | Unsafe ref with token prefix is not appended | ✅ |
| 8e | Unsafe ref that is too long is not appended | ✅ |
| 9 | Raw PII params (email, name, phone, address) are not forwarded | ✅ |
| 10 | Opt-out prevents booking URL mutation | ✅ |
| 11 | DNT=1 prevents booking URL mutation (tracker skipped) | ✅ |
| 12 | Link without href does not throw | ✅ |
| 13 | Relative internal link is not mutated | ✅ |
| 14 | Existing outbound click tracking still fires for booking links | ✅ |
| 15 | /api/conversion is not called by booking passthrough | ✅ |
| 16 | Safe short ref value IS appended | ✅ |
| CL-1 | Cookieless: Calendly link gets UTM params appended | ✅ |
| CL-2 | Cookieless: non-booking link not mutated | ✅ |
| CL-3 | Cookieless: excluded path prevents booking URL mutation | ✅ |
| CL-4 | Cookieless: Cal.com gets UTM params appended | ✅ |
| CL-5 | Cookieless: email not forwarded to booking URL | ✅ |

---

## Validation Output

```
> npm run build:tracker
tracker/tracker.min.js       14.4kb
tracker/tracker.cookieless.min.js 11.2kb
✅ build succeeded

> npm run qa:secrets
PASS — No active credentials, secrets, or tracked env files detected.

> npm run qa:env-safety
✅ All offline environment safety tests passed successfully.

> npm run qa:static
PASS — static launch QA passed

> npm run qa:tracker:unit
ℹ tests 121
ℹ pass 121
ℹ fail 0

> npm run qa:identity:unit
ℹ tests 131
ℹ pass 131
ℹ fail 0
```

---

## Files Changed

| File | Change |
|---|---|
| `tracker/tracker.js` | +110 lines — booking passthrough section |
| `tracker/tracker.cookieless.js` | +103 lines — booking passthrough section |
| `tracker/tracker.min.js` | rebuilt |
| `tracker/tracker.cookieless.min.js` | rebuilt |
| `package.json` | qa:tracker:unit updated to include new test |
| `api/tests/tracker-booking-passthrough.test.js` | new file, 27 tests |

**`api/routes/conversion.js` — UNCHANGED.** Confirmed by `git diff`.

---

## Remaining Risks

1. **Iframe embeds**: If a Calendly/Cal.com widget is embedded as an iframe, the `<a>` element may not be observable in the parent document. UTM passthrough does not work for iframe embeds in this session.
2. **JavaScript-injected booking links**: Links added to the DOM after tracker initialization are covered (the listener uses event delegation on `document` via `mousedown`), but links rendered inside shadow DOM are not.
3. **Subdomain booking pages**: Passthrough covers `*.calendly.com`, `*.cal.com`, etc. (subdomain matching implemented). Verified in code but not browser-QA'd yet.
4. **`sourcetrack_landing_page` / `sourcetrack_referrer`**: Intentionally deferred. See deferred section above.

---

## Paid-Beta Status

**NOT READY** — unchanged from prior sessions. No production-blocking changes were introduced in this session.

---

## Commit Recommendation

```
Session 140J — Booking UTM Passthrough

Implement privacy-safe UTM passthrough for outbound booking provider links.

Add booking host detection and safe attribution param appending to tracker.js
and tracker.cookieless.js for Calendly, Cal.com, TidyCal, SavvyCal, Zcal,
OnceHub, and YouCanBook.me. Append only missing params (never overwrite).
Never forward raw email, name, phone, password, token, or form field values.
Sanitize ref/source/via with a lightweight validator. Respect consent opt-out,
DNT/GPC, and excluded paths. Defer sourcetrack_landing_page and
sourcetrack_referrer pending a safe URL-valued passthrough sanitizer.

Add 27 VM-based tests covering all required test cases. Register test file in
qa:tracker:unit. Confirm api/routes/conversion.js is unchanged.

Paid beta remains NOT READY.

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
```
