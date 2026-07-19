# QA Report — Session 140K: Confirmed Booking Detection (Calendly + Cal.com)

**Date:** 2026-06-17
**Branch:** `main`
**Baseline commit:** `db9218a Fix 140J QA report whitespace`

---

## 1. Baseline Status

| Check | Result |
|---|---|
| Working tree before session | Clean |
| Latest CI on `main` | ✅ green (`db9218a`) |
| Recent commits verified | `140J UTM passthrough`, `140I-B form capture`, `140I-A identify PII` |

---

## 2. Files Audited / Changed

| File | Action | Reason |
|---|---|---|
| `tracker/tracker.js` | Modified | Add Calendly + Cal.com confirmed booking detection |
| `tracker/tracker.cookieless.js` | Modified | Mirror implementation for cookieless tracker |
| `tracker/tracker.min.js` | Rebuilt | `npm run build:tracker` |
| `tracker/tracker.cookieless.min.js` | Rebuilt | `npm run build:tracker` |
| `api/routes/track.js` | Modified | Hoist validators; add `booking_scheduled` ingestion guard |
| `api/tests/tracker-booking-detection.test.js` | New | 28 unit tests |
| `package.json` | Modified | Add new test to `qa:tracker:unit` |
| `docs/qa/confirmed_booking_detection_140K.md` | New | This report |

**Not modified:**
- `api/routes/conversion.js` — untouched (verified by test 23)
- No UI changes
- No Stripe/CRM/calendar API changes

---

## 3. Provider Event Evidence

### Calendly

**Source:** Calendly official embed documentation and widely-documented `window.postMessage` pattern.

The Calendly embed widget fires raw `window.postMessage` messages from the embedded iframe. The message `event.data.event` is the event name string.

| Field | Value |
|---|---|
| Transport | `window.postMessage` / `window.addEventListener('message', ...)` |
| Triggering event name | `calendly.event_scheduled` |
| Origin | `https://calendly.com` or `https://*.calendly.com` |
| Payload | `{ event: "calendly.event_scheduled", payload: { event: { uri: "..." }, invitee: { uri: "..." } } }` |

**Events that must NOT trigger a booking_scheduled:**
- `calendly.profile_page_viewed`
- `calendly.event_type_viewed`
- `calendly.date_and_time_selected`
- Any other non-scheduled Calendly event

**Raw payload not forwarded.** The event URI and invitee URI are **not** included in the emitted event. No invitee PII (email, name, phone, timezone, questions/answers) is forwarded.

### Cal.com

**Source:** Cal.com official embed documentation and web search evidence (June 2026).

Cal.com's public embed event API uses `Cal("on", { action, callback })`. This is **not** a raw `window.postMessage` interception. The internal postMessage format (`{ originator: "CAL", ... }`) is explicitly undocumented and subject to change without notice.

| Field | Value |
|---|---|
| Transport | `Cal("on", { action: "bookingSuccessfulV2", callback })` — Cal.com embed API |
| Triggering event name | `bookingSuccessfulV2` (replaces deprecated `bookingSuccessful`) |
| Requires | `window.Cal` function loaded on the page by the Cal.com embed snippet |
| Payload | `e.detail.data` contains `uid` — **not forwarded** |

**Internal Cal.com postMessage NOT intercepted.** Raw `{ originator: "CAL" }` messages are internal, undocumented, and deliberately avoided.

---

## 4. Implementation Summary

### Calendly (`tracker.js`, `tracker.cookieless.js`)

```
addEventListener('message', handler)
  → reject if _consentGiven === false (tracker.js) or isExcluded() (cookieless)
  → reject if origin not calendly.com or *.calendly.com
  → reject if e.data is not an object
  → reject if e.data.event !== 'calendly.event_scheduled'
  → reject if deduplication key fired within 5s
  → emit /api/track with booking_scheduled (no raw payload)
```

### Cal.com — Best-Effort Embed API Detection

```
_tryRegisterCalCom()
  → if window.Cal is a function: Cal('on', { action: 'bookingSuccessfulV2', callback })
  → else: increment retry counter, schedule another _tryRegisterCalCom() at 500ms
  → max 10 retries (5 seconds total), then give up silently
  → callback:
      → reject if _consentGiven === false or isExcluded()
      → reject if deduplication key fired within 5s
      → emit /api/track with booking_scheduled (callback argument ignored)
```

### Backend (`api/routes/track.js`)

For `event === 'booking_scheduled'`:

- `booking_provider`: allowlist `['calendly', 'calcom']` — rejected otherwise
- `booking_detection_method`: allowlist `['browser_embed_event']` — rejected otherwise
- `booking_event_type`: allowlist `['event_scheduled', 'bookingSuccessfulV2']` — rejected otherwise
- `page_path`: sanitized via `validatePathname()` (strips query/hash, rejects `@`, rejects `javascript:`)
- `custom_properties` passthrough: **excluded** (same guard as `form_submit`)
- Validators (`validatePathname`, `validateFormMetadata`, `validateFormActionHost`) hoisted to shared scope — both `form_submit` and `booking_scheduled` use them without duplication

---

## 5. Privacy Boundaries

| Category | Disposition |
|---|---|
| Invitee email | Never forwarded |
| Invitee name | Never forwarded |
| Invitee phone | Never forwarded |
| Invitee timezone | Never forwarded |
| Questions/answers | Never forwarded |
| Calendly event URI | Never forwarded |
| Calendly invitee URI | Never forwarded |
| Cal.com booking UID | Never forwarded |
| Cal.com attendee data | Callback argument ignored entirely |
| Raw `custom_properties` | Excluded for `booking_scheduled` (backend guard) |
| `/api/conversion` | Not modified; never called by booking detection |

**Event payload sent to `/api/track`:**

```json
{
  "event": "booking_scheduled",
  "anonymous_id": "<tracker AID>",
  "session_id": "<tracker SID>",
  "page_url": "<current page URL>",
  "properties": {
    "event_type": "booking_scheduled",
    "booking_provider": "calendly" | "calcom",
    "booking_detection_method": "browser_embed_event",
    "booking_event_type": "event_scheduled" | "bookingSuccessfulV2",
    "page_url": "<current page URL>",
    "page_path": "<location.pathname>"
  }
}
```

---

## 6. Deduplicate Behavior

- In-memory map keyed: `provider:eventType:pathname`
- Window: 5 seconds
- No persistent storage (no localStorage, no cookies)
- Resets on page reload/navigation

---

## 7. Provider Support Matrix

```
Calendly embed:
  ✅ confirmed booking detection via calendly.event_scheduled browser message (window.postMessage)
  ✅ origin guard: calendly.com or *.calendly.com only

Calendly link-only flow:
  → UTM passthrough only (Session 140J)

Cal.com embed:
  ⚠️  best-effort confirmed detection only when:
      (a) Cal.com embed snippet is present on the page (window.Cal is defined), AND
      (b) bookingSuccessfulV2 fires before retry window exhausts (within 5s of tracker boot)
  → Cal.com link-only flow or absent embed: UTM passthrough only

Cal.com link-only flow:
  → UTM passthrough only (Session 140J)

TidyCal:
  → UTM passthrough only; no confirmed booking detection in this session

SavvyCal:
  → UTM passthrough only; no confirmed booking detection in this session

Iframe embeds without observable browser event / API:
  → Unsupported for confirmed detection

Provider webhooks/APIs (Calendly API, Cal.com API):
  → Not implemented; not in scope for this session
```

---

## 8. Cookieless Tracker Behavior

- Confirmed booking detection implemented in `tracker.cookieless.js` (mirrors `tracker.js`)
- Uses `isExcluded()` guard instead of `_consentGiven` (cookieless tracker has no consent mode)
- Booking events queued via `AID ? send() : _q.push()` — consistent with cookieless form_submit pattern
- Calendly origin validation: same `_isCalendlyOrigin()` function
- Cal.com: same best-effort `window.Cal('on', ...)` hook with retry
- **Tested:** tests 24–27 cover cookieless Calendly event, origin rejection, excluded path, and Cal.com boot-time hook

---

## 9. Tests Added

**New file:** `api/tests/tracker-booking-detection.test.js` — **28 tests**

| # | Description | Result |
|---|---|---|
| 1 | `calendly.event_scheduled` emits one `/api/track` `booking_scheduled` | ✅ |
| 2 | Calendly non-scheduled messages do not emit | ✅ |
| 3 | Unsafe (non-Calendly) origin is rejected | ✅ |
| 4 | Calendly subdomain origin is accepted | ✅ |
| 5 | Raw Calendly payload PII not forwarded (email, name, phone, URIs) | ✅ |
| 6 | Duplicate Calendly scheduled messages deduped within 5s | ✅ |
| 7 | Opt-out prevents Calendly booking event emission | ✅ |
| 8 | DNT=1 prevents all booking events (tracker skipped at boot) | ✅ |
| 9 | `/api/conversion` not called by Calendly booking detection | ✅ |
| 10 | Malformed message data does not throw | ✅ |
| 11 | Cal.com `bookingSuccessfulV2` emits when `window.Cal` present at boot | ✅ |
| 12 | Cal.com late-load registration succeeds within retry window (500ms×10) | ✅ |
| 13 | Cal.com absent: no events, no errors (UTM passthrough only) | ✅ |
| 14 | Cal.com non-confirmation events not registered (`linkReady`, `eventTypeSelected`, `bookingCancelled`) | ✅ |
| 15 | Cal.com raw payload PII not forwarded (`uid`, `attendeeEmail`, `attendeeName`) | ✅ |
| 16 | Cal.com duplicate `bookingSuccessfulV2` callbacks deduped within 5s | ✅ |
| 17 | Opt-out prevents Cal.com booking event emission | ✅ |
| 18 | Valid `booking_scheduled` accepted by backend | ✅ |
| 19 | Invalid `booking_provider` stripped to null | ✅ |
| 20 | Invalid `booking_detection_method` stripped to null | ✅ |
| 21 | Invalid `booking_event_type` stripped to null | ✅ |
| 22 | `booking_scheduled` does not forward `custom_properties` | ✅ |
| 23 | `api/routes/conversion.js` unchanged | ✅ |
| 24 | Cookieless: Calendly `event_scheduled` emits `booking_scheduled` | ✅ |
| 25 | Cookieless: unsafe origin rejected | ✅ |
| 26 | Cookieless: excluded path suppresses booking event | ✅ |
| 27 | Cookieless: Cal.com `bookingSuccessfulV2` works at boot | ✅ |
| R1 | Regression: 140J UTM passthrough not broken | ✅ |

---

## 10. Validation Output

```
npm run build:tracker:
  tracker/tracker.min.js      15.5kb  ✅
  tracker/tracker.cookieless.min.js  12.2kb  ✅

node --check api/routes/track.js → SYNTAX OK ✅

npm run qa:tracker:unit:
  tests 153 | pass 153 | fail 0 ✅

npm run qa:identity:unit:
  tests 131 | pass 131 | fail 0 ✅

npm run qa:secrets:      PASS ✅
npm run qa:env-safety:   PASS ✅
npm run qa:static:       PASS ✅
git diff --check:        exit 0, no whitespace violations ✅
```

---

## 11. /api/conversion Unchanged

- `api/routes/conversion.js` not modified in this session
- Test 23 reads the file source and asserts no `booking_scheduled`, `booking_provider`, or `booking_detection_method` references
- Result: ✅ confirmed

---

## 12. Limitations and Remaining Risks

| Item | Status |
|---|---|
| Cal.com embed must be loaded before or within 5s of tracker | **Known limitation** — documented in code comments and here |
| Cal.com link-only (no embed): UTM passthrough only | Confirmed, by design |
| TidyCal, SavvyCal: no confirmed detection | Deferred, not in scope for 140K |
| Calendly API (full invitee data): not implemented | By design — no server-to-server integration |
| Cal.com API (full booking data): not implemented | By design — no server-to-server integration |
| Provider webhooks: not implemented | By design — not in scope |
| Iframe embeds (no observable event): unsupported | Documented limitation |
| Cal.com internal postMessage (`originator: "CAL"`): NOT intercepted | Deliberately avoided (undocumented format) |

---

## 13. Paid Beta Status

> **NOT READY.**
> Confirmed booking detection requires browser QA with real Calendly and Cal.com embeds before any paid/beta feature enablement. This session provides the tracker implementation and test coverage only.

---

## 14. Product Truth

> Confirmed booking detection is supported for Calendly and Cal.com embeds when their browser embed event is available. Booking links and unsupported embeds still use UTM passthrough only.

Do NOT claim: "Works with every scheduler", "Tracks all bookings", "Full booking attribution for all tools", "Calendar sync", "CRM sync", "Revenue attribution."
