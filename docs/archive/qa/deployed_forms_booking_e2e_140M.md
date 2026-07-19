# QA Report — Session 140M: Deployed Browser E2E — Forms & Booking

**Date:** 2026-06-17
**Branch:** `main`
**Baseline commit:** `4260864 Session 140M-A — Add deployed browser E2E fixture`
**Fixture URL:** `https://sourcetrack-dashboard-staging.up.railway.app/qa-140M-e2e-fixture.html?utm_source=google&utm_medium=cpc&utm_campaign=qa_140M&utm_term=form_test&utm_content=e2e`

---

## 1. Goal

Run the deployed browser E2E against the live staging fixture to verify:
- Form submit capture (native / webflow / wordpress) — correct `form_provider`, no PII
- Booking UTM passthrough — correct link mutation for booking hosts, non-booking links untouched
- Confirmed booking detection — Calendly embed emits correctly; bad events / bad origins are silent; Cal.com (see §C4)
- Unsupported providers — never emit `booking_scheduled`
- API routing — all events go to `/api/track`, never `/api/conversion`
- Production smoke — all three production hosts respond

---

## 2. Baseline Status

| Check | Result |
|---|---|
| Git branch at session start | `main` @ `4260864` |
| Staging dashboard service | ✅ responding (fixture served from `sourcetrack-dashboard-staging.up.railway.app`) |
| Staging API service | ✅ 200 (503 cold-start resolved at session open) |
| Tracker minified build | ✅ served at `/tracker.min.js` (fixture loads it `async`) |

---

## 3. Test Methodology

- Browser: Chrome via MCP, tab `1625638185`
- Beacon interception: JS injection — `window.Blob` constructor patched to stash `._src`; `navigator.sendBeacon` wrapped to parse `._src` and persist to `localStorage['qa140M_beacons']`
- Form navigation prevention: `target="_blank"` set on all forms before any submit; new tabs open per submit, fixture tab survives
- All results read from `localStorage['qa140M_beacons']` via `JSON.parse`; properties from `body.properties`

> **Privacy note:** No form field values were entered. Fields submitted empty. No PII input. No real bookings, leads, or checkout flows created.

---

## 4. Flow A — Form Submit Capture

**Source of truth:** `localStorage['qa140M_beacons']` after clicking A1, A2, A3 submit buttons (physical click via MCP `computer left_click`).

| Test | Expected `form_provider` | Observed | `form_name` | PII in `properties` | Route |
|---|---|---|---|---|---|
| A1 Native form | `native` | `native` ✅ | `qa-native-form` | none ✅ | `/api/track` ✅ |
| A2 Webflow-style form | `webflow` | `webflow` ✅ | `wf-contact` | none ✅ | `/api/track` ✅ |
| A3 WordPress/CF7 form | `wordpress` | `wordpress` ✅ | `cf7-contact` | none ✅ | `/api/track` ✅ |

**PII check:** `properties` scanned for email regex (`/@[a-z0-9.-]+\.[a-z]{2,}/i`). All clear — no leak.

`booking_provider` for all form submits: not set ✅

---

## 5. Flow B — Booking UTM Passthrough

**Source of truth:** `element.getAttribute('href')` read directly from DOM after fixture auto-fires `mousedown` passthrough (2 s after load).

| Link | ID | `utm_source` appended | `sourcetrack_source` appended | Notes |
|---|---|---|---|---|
| Calendly (B1) | `link-calendly` | ✅ | ✅ | — |
| Cal.com (B2) | `link-calcom` | ✅ | ✅ | — |
| TidyCal (B3) | `link-tidycal` | ✅ | ✅ | — |
| SavvyCal (B4) | `link-savvycal` | ✅ | ✅ | — |
| Calendly — existing params (B5) | `link-existing-params` | `utm_source=existing` preserved ✅ | ✅ | NOT overwritten with `google` ✅; hash `#week=4` preserved ✅ |
| Non-booking external (B6) | `link-non-booking` | NOT mutated ✅ | NOT mutated ✅ | href stays `https://www.example.com/` |
| Typeform link (D6) | `link-typeform` | NOT mutated ✅ | NOT mutated ✅ | unsupported host — correct |
| Tally link (D7) | `link-tally` | NOT mutated ✅ | NOT mutated ✅ | unsupported host — correct |

---

## 6. Flow C — Confirmed Booking Mock Events

**Source of truth:** `localStorage['qa140M_beacons']` after clicking C1–C5 buttons.

| Test | Action | Expected | Observed |
|---|---|---|---|
| C1 | `calendly.event_scheduled` from `calendly.com` | emit `booking_scheduled` | ✅ `booking_provider: "calendly"`, `booking_detection_method: "browser_embed_event"`, `booking_event_type: "event_scheduled"` → `/api/track` |
| C2 | `calendly.date_and_time_selected` from `calendly.com` | NO emit | ✅ 0 beacons |
| C3 | `calendly.event_scheduled` from `https://evil.com` | NO emit | ✅ 0 beacons |
| C4 | Cal.com `bookingSuccessfulV2` via embed API | emit `booking_scheduled` | BLOCKED — fixture timing bug found; fixture updated but not yet deployed/retested |
| C5 | `window.Cal` absent — no throw | NO emit, no exception | ✅ 0 beacons, no JS errors |

### 6a — C4: Cal.com Embed Booking (Fixture Timing Limitation)

The tracker's `_tryRegisterCalCom()` polls for `window.Cal` at 500ms intervals up to 10 times (5 s) from tracker init. Because the staging tracker is cached, it executes within ~100–200ms of page load. The MCP JS injection occurs at +1 s or later — after several retries have already run. Once the retry budget is exhausted, any subsequently injected `window.Cal` is never found.

**Impact:** C4 browser E2E verification was not possible in this session with the original fixture.

**Mitigations:**
1. **Unit test coverage:** `api/tests/provider-truth-audit.test.js` §E (E1–E2) proves Cal.com `bookingSuccessfulV2` emits `booking_scheduled` with `booking_provider: "calcom"` in the Node VM harness. This is the authoritative correctness proof.
2. **Fixture fix included in this session diff:** `dashboard/public/qa-140M-e2e-fixture.html` now pre-installs `window._calCallbacks` and a `window.Cal` stub in the synchronous inline `<script>` block (runs before the async tracker script). `mockCalcomEmbedBoot()` is updated to fire the callbacks the tracker registered at init time. A redeploy is needed before this can be browser-verified.

---

## 7. Flow D — Unsupported Provider Silence

**Source of truth:** `localStorage['qa140M_beacons']` after clicking D1–D5 (all 5 unsupported postMessage dispatches; 2 s settle time).

| Test | Origin | Event name | `booking_scheduled` emitted? |
|---|---|---|---|
| D1 | `typeform.com` | `form_response` | NO ✅ |
| D2 | `tally.so` | `Tally.FormSubmitted` | NO ✅ |
| D3 | `app.hubspot.com` | `hsFormCallback` | NO ✅ |
| D4 | `jotform.com` | `JotFormEvent` | NO ✅ |
| D5 | `docs.google.com` | `formSubmit` | NO ✅ |

Total beacons from D1–D5: **0**. Total `booking_scheduled` events: **0** ✅

---

## 8. Flow E — Network Payload Privacy + /api/track Verification

| Test | Event name | Route | `/api/conversion` called? |
|---|---|---|---|
| E1 Baseline (`fireBaselineTrackEvent`) | `qa_140M_e2e_baseline` | `/api/track` ✅ | NO ✅ |

`/api/conversion` call count across all flows: **0** ✅

---

## 9. Production Smoke Check

| Host | Result |
|---|---|
| `https://sourcetrack.ai` | ✅ loads — "SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies" |
| `https://www.sourcetrack.ai` | ✅ loads — same title |
| `https://app.sourcetrack.ai` | ✅ loads |

No form submissions, no account creation, no booking, no checkout performed.

---

## 10. Files Changed This Session

| File | Change |
|---|---|
| `dashboard/public/qa-140M-e2e-fixture.html` | Pre-install `window.Cal` stub + fix `mockCalcomEmbedBoot()` for C4 (see §6a) |
| `docs/qa/deployed_forms_booking_e2e_140M.md` | This report |

No tracker (`tracker/`) or backend (`api/`) files changed.

---

## 11. Known Limitations

| Limitation | Status |
|---|---|
| **Server-accepted event capture BLOCKED** — site_key `qa-140m-fixture-key-staging-only` is intentionally invalid; staging API rejects events with invalid keys | By design — browser-side dispatch and payload privacy only |
| **C4 Cal.com browser E2E pending redeploy** — tracker retry window exhausted before JS injection; unit test proves correctness; fixture fix in this diff | Pending redeploy |

> **Server-accepted event capture with a valid staging site_key remains BLOCKED — not verified.**

---

## 12. Overall Result (140M-B)

**PARTIAL PASS** — C4 Cal.com blocked; fixture fix committed but not yet deployed/retested.

| Flow | 140M-B Status |
|---|---|
| A — Form submit capture (native / webflow / wordpress) | ✅ PASS |
| B — Booking UTM passthrough | ✅ PASS |
| C1–C3, C5 — Calendly confirmed booking / silence | ✅ PASS |
| C4 — Cal.com `bookingSuccessfulV2` | BLOCKED — fixture timing bug found; fixture updated but not yet deployed/retested |
| D — Unsupported provider silence | ✅ PASS |
| E — API routing / no PII / no `/api/conversion` | ✅ PASS |
| Production smoke (3 hosts) | ✅ PASS |
| Server-accepted event persistence (valid site_key) | BLOCKED — by design (invalid key fixture) |
| Paid beta readiness | NOT READY |

---

## 13. Session 140M-C — Cal.com Deployed Browser E2E Closeout

**Date:** 2026-06-17
**Baseline commit:** `5ed9c2a Session 140M-B — Record deployed browser E2E partial and fix Cal.com fixture`
**CI:** green (1m25s)
**Working tree at session start:** clean

### Fixture verification

| Check | Result |
|---|---|
| Page title | `SourceTrack 140M E2E Fixture — Staging QA Only` ✅ |
| QA banner visible | ✅ (staging-only warning present) |
| Tracker origin | `https://sourcetrack-api-staging.up.railway.app` ✅ |
| `window.Cal` is function | `true` ✅ — pre-installed by updated inline stub |
| `window._calCallbacks` exists | `true` ✅ — 140M-B fix deployed |
| `window._calCallbacks.length` | `1` ✅ — tracker registered its `bookingSuccessfulV2` callback at init |
| `window.sourcetrack` loaded | `true` ✅ |

The updated fixture (140M-B) is confirmed deployed. The tracker's `_tryRegisterCalCom()` found `window.Cal` at init and registered its callback before the retry window started.

### C4 — Cal.com `bookingSuccessfulV2` Browser Evidence

```
Exact URL:     https://sourcetrack-dashboard-staging.up.railway.app/qa-140M-e2e-fixture.html
               ?utm_source=google&utm_medium=cpc&utm_campaign=qa_140M&utm_term=form_test&utm_content=e2e
Browser:       Chrome (MCP tab 1625638185)
Action:        Clicked "Stub Cal() + fire bookingSuccessfulV2 (C4)" button via JS .click()
               mockCalcomEmbedBoot() fired — 1 registered bookingSuccessfulV2 callback invoked

Network request observed:
  Request URL:    https://sourcetrack-api-staging.up.railway.app/api/track
  Request method: POST (sendBeacon)
  Event payload (PII-free):
    event:                        "booking_scheduled"
    properties.booking_provider:  "calcom"
    properties.booking_detection_method: "browser_embed_event"
    properties.booking_event_type: "bookingSuccessfulV2"
    properties.pii_check (email): [] — no email addresses in properties
    to_conversion:                false

Expected result: booking_scheduled → /api/track, booking_provider=calcom
Actual result:   booking_scheduled → /api/track, booking_provider=calcom ✅
PASS/BLOCKED:    PASS
```

`/api/conversion` called: NO ✅

### Regression Spot-Check (on updated fixture)

| Test | Expected | Result |
|---|---|---|
| C1 Calendly `event_scheduled` | emit `booking_scheduled`, `booking_provider: "calendly"` | ✅ PASS |
| C2 `date_and_time_selected` | silent | ✅ PASS (0 beacons) |
| C3 bad origin | silent | ✅ PASS (0 beacons) |
| D1–D5 unsupported providers | all silent | ✅ PASS (0 beacons) |
| `/api/conversion` across all regression flows | 0 calls | ✅ PASS |

Total beacons from C1 + C2 + C3 + D1–D5: **1** (C1 only) ✅

---

## 14. Overall Result (140M-C final)

**BROWSER E2E PASS WITH LIMITATION — deployed browser dispatch/privacy behavior verified for forms, booking UTM passthrough, Calendly, Cal.com, unsupported-provider safety, and no /api/conversion. Server-accepted event persistence with a valid staging site_key remains BLOCKED.**

| Flow | Final Status |
|---|---|
| A — Form submit capture (native / webflow / wordpress) | ✅ PASS |
| B — Booking UTM passthrough | ✅ PASS |
| C1–C3, C5 — Calendly confirmed booking / silence | ✅ PASS |
| C4 — Cal.com `bookingSuccessfulV2` | ✅ PASS (verified on deployed 140M-B fixture) |
| D — Unsupported provider silence | ✅ PASS |
| E — API routing / no PII / no `/api/conversion` | ✅ PASS |
| Production smoke (3 hosts) | ✅ PASS |
| Server-accepted event persistence (valid site_key) | BLOCKED — not tested (invalid key fixture by design) |
| Paid beta readiness | NOT READY |
