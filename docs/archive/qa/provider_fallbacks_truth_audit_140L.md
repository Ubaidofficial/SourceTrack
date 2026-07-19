# QA Report — Session 140L: Booking/Form Provider Fallbacks + Support Matrix Truth Audit

**Date:** 2026-06-17
**Branch:** `main`
**Baseline commit:** `393d236 Session 140K — Add confirmed booking detection`

---

## 1. Baseline Status

| Check | Result |
|---|---|
| Latest CI on `main` | ✅ green (`393d236` Session 140K, 1m21s) |
| Working tree before session | One untracked file present: `api/tests/provider-truth-audit.test.js` (pre-seeded draft for this session) |
| Recent commits verified | `140K confirmed booking`, `140J UTM passthrough (+whitespace fix)`, `140I-B form capture (+whitespace fix)` |

> Note: the two `failure` rows in `gh run list` (`140J`, `140I-B`) were superseded by their immediate whitespace-fix commits, both green. Head of `main` is green.

---

## 2. Goal

Audit and tighten provider fallback **truthfulness** for forms + booking providers. Cleanly separate:

- **Confirmed capture** — a real browser event is observed.
- **Best-effort capture** — observable browser submit event, markup-dependent.
- **UTM passthrough only** — link is rewritten with attribution params; no booking confirmation.
- **Unsupported / not observable** — no detection; must never be falsely marked confirmed.

This was expected to be **mostly a truth audit + tests session, not a heavy implementation session.** That expectation held: **no tracker or backend behavior was changed.**

---

## 3. Files Audited

| File | Finding |
|---|---|
| `tracker/tracker.js` | ✅ Truthful. Form classification only assigns `native` / `webflow` / `wordpress`. Booking confirmation only for origin-validated `calendly.event_scheduled` and Cal.com `bookingSuccessfulV2`. UTM passthrough for 7 booking hosts. No PII forwarded. |
| `tracker/tracker.cookieless.js` | ✅ Parity confirmed — same classification surface, same confirmed-booking surface, `booking_scheduled` routed via `/api/track`. |
| `api/routes/track.js` | ✅ Backend allowlists enforced: `form_provider` ∈ {native, webflow, wordpress, unknown} (else coerced to `unknown`); `booking_provider` ∈ {calendly, calcom} (else coerced to `null`). |
| `api/routes/conversion.js` | ✅ Untouched. No booking/form references. |
| `api/tests/tracker-form-capture.test.js` | ✅ Passing (existing). |
| `api/tests/tracker-booking-passthrough.test.js` | ✅ Passing (existing). |
| `api/tests/tracker-booking-detection.test.js` | ✅ Passing (existing). |
| `docs/guides/form_checkout_source_handoff.md` | ✅ Truthful — manual hidden-input pattern; explicit "no automatic scraping" statement. |
| Marketing / user-facing copy | ✅ No "works with every form" / "tracks all bookings" overclaims found. |

---

## 4. Provider Support Matrix (source of truth)

| Provider | Current support | Detection type | Limitations |
|---|---|---|---|
| Native forms | automatic safe `form_submit` | browser submit event | no field values captured |
| Webflow | best-effort safe `form_submit` | browser submit event | requires observable form submit |
| WordPress forms | best-effort safe `form_submit` | browser submit event (CF7 / WPForms / Gravity / Elementor markup) | plugin behavior may vary |
| Calendly link | UTM passthrough | link rewrite | no confirmed booking |
| Calendly embed | **confirmed booking** | browser `postMessage` (`calendly.event_scheduled`, origin-validated) | requires embed event |
| Cal.com link | UTM passthrough | link rewrite | no confirmed booking |
| Cal.com embed | best-effort confirmed booking | Cal.com embed API (`bookingSuccessfulV2`) | requires `Cal()` present + event fires |
| TidyCal | UTM passthrough only | link rewrite | no confirmed booking |
| SavvyCal | UTM passthrough only | link rewrite | no confirmed booking |
| Typeform | manual / redirect / passthrough only unless submit observable | not confirmed | iframe limits |
| Tally | manual / redirect / passthrough only unless submit observable | not confirmed | iframe limits |
| HubSpot forms | best-effort only if browser submit is observable | not guaranteed | embed behavior varies |
| Jotform | manual / redirect / passthrough only | not confirmed | iframe limits |
| Google Forms | manual / redirect / passthrough only | not confirmed | iframe limits |

### Confirmed capture vs passthrough-only

- **Confirmed capture (emits `booking_scheduled`):** Calendly embed, Cal.com embed — and *only* these.
- **Automatic/best-effort form_submit:** Native, Webflow, WordPress — when the browser `submit` event is observable. No field values.
- **UTM passthrough only (link rewrite, no confirmation):** Calendly link, Cal.com link, TidyCal, SavvyCal, plus `zcal.co`, `oncehub.com`, `youcanbook.me` (in `BOOKING_HOSTS`).
- **Unsupported / not observable (no event, no link rewrite):** Typeform, Tally, HubSpot forms, Jotform, Google Forms — these are not in `BOOKING_HOSTS`, are not classified as form providers, and emit nothing automatically.

### Unsupported / blocked cases (out of scope, by design)

- No iframe scraping, no provider API calls, no provider webhooks, no CRM/calendar sync.
- TidyCal / SavvyCal confirmed booking — **not implemented** (no verified public browser event).
- Typeform / Tally / HubSpot / Jotform / Google Forms confirmed submit — **not implemented** (iframe/embed; no verified observable event in this build).

---

## 5. Privacy Boundaries (verified)

- No raw form field values are read (only `id` / `name` / `action` host+path, each sanitized).
- No invitee/attendee email, name, phone, address, or URIs are forwarded from any booking event.
- Tracker-side `sanitizeFormMetadata` + backend `validateFormMetadata` reject `@`, 6+ digit strings, token/secret/key/pass/card markers, and URLs.
- `booking_scheduled` carries only: `booking_provider`, `booking_detection_method`, `booking_event_type`, `page_path`. No PII.
- All events route through `/api/track`. **`/api/conversion` is untouched. No revenue semantics added.**

---

## 6. Changes Made

This session made **no behavior changes** to the tracker or backend. Changes are limited to the new test file (truth-boundary lock-in), its wiring, and this report.

| File | Action | Reason |
|---|---|---|
| `api/tests/provider-truth-audit.test.js` | New | Lock in provider truth boundaries (64 assertions across sections A–L). |
| `package.json` | Modified | Add new test to `qa:tracker:unit` so it runs in validation + CI. |
| `docs/qa/provider_fallbacks_truth_audit_140L.md` | New | This report. |

### Corrections applied to the pre-seeded test draft

The pre-seeded draft (`provider-truth-audit.test.js`) had two issues found during this audit:

1. **F1 harness bug** — its self-contained VM harness used `navigator.sendBeacon: () => true`, which silently discarded the payload, so the native `form_submit` was never recorded and the test failed against correct tracker code. Fixed to record `blob.parts` like the proven `runTrackerInVm` harness.
2. **J5 false comment** — claimed the backend does "no allowlist enforcement" and that a spoofed `form_provider='typeform'` "passes through as-is." This is **false**: `track.js` coerces any non-allowlisted `form_provider` to `'unknown'`. Comment corrected; assertion strengthened to **observe** the coerced value via a `ph.capture` spy (proves coercion, not just acceptance). Added `J6` proving allowlisted values persist verbatim.
3. **K3–K7 strengthened** — previously asserted only HTTP 200; now observe `booking_provider === null` for unsupported providers and `=== 'calendly'/'calcom'` for supported ones, proving the allowlist actually strips unsupported labels.

---

## 7. Tests Added / Updated

New file `api/tests/provider-truth-audit.test.js` — **64 passing assertions**:

| Section | Proves |
|---|---|
| A (A1–A8) | No unsupported provider postMessage (TidyCal, SavvyCal, Typeform, Tally, HubSpot, Jotform, Google Forms, arbitrary origins) emits `booking_scheduled`. |
| B (B1–B2) | Tracker source classifies only `webflow`/`wordpress` as named form providers; no `typeform`/`tally`/`hubspot`/`jotform`/`google_forms` labels. |
| C (C1–C5) | TidyCal + SavvyCal remain UTM passthrough only; no confirmed booking; no provider-specific `Cal()` action registered. |
| D (D1–D3) | **Regression:** Calendly `event_scheduled` still emits `booking_scheduled`; subdomains accepted; spoofed origins rejected. |
| E (E1–E2) | **Regression:** Cal.com `bookingSuccessfulV2` still emits; absent Cal.com → no event, no throw. |
| F (F1–F3) | **Regression:** Native form submit emits `form_provider=native`; Webflow/WordPress classification present. |
| G (G1–G10) | **Regression:** UTM passthrough works for Calendly/Cal.com/TidyCal/SavvyCal; non-booking + unsupported links (Typeform/Tally/HubSpot/Jotform/Google Forms) are NOT mutated. |
| H | `/api/conversion` references none of `booking_scheduled`/`booking_provider`/`form_submit`/provider names. |
| I (I1–I3) | No PII (email/name/phone/URIs) forwarded by Calendly or Cal.com paths; `_sendBookingScheduled` source carries no PII fields. |
| J (J1–J6) | Backend `form_provider` allowlist: native/webflow/wordpress/unknown accepted; spoofed `typeform` coerced to `unknown` (observed); allowlisted value persists verbatim. |
| K (K1–K7) | Backend `booking_provider` allowlist: calendly/calcom persist verbatim; tidycal/savvycal/typeform/tally/hubspot coerced to `null` (observed). |
| L (L1–L3) | Cookieless tracker has identical truth boundaries: only webflow/wordpress classification; only Calendly + Cal.com confirmed; `booking_scheduled` via `/api/track`, never `/api/conversion`. |

Existing suites (`tracker-form-capture`, `tracker-booking-passthrough`, `tracker-booking-detection`) — **79/79 still passing**.

---

## 8. Validation Output

See session response for the full pasted command output. Summary:

| Command | Result |
|---|---|
| `git diff --check` | clean |
| `npm run build:tracker` | success (minified builds regenerated) |
| `npm run qa:secrets` | pass |
| `npm run qa:env-safety` | pass |
| `npm run qa:static` | pass |
| `npm run qa:tracker:unit` | pass (now includes provider-truth-audit) |
| `npm run qa:identity:unit` | pass |

---

## 9. `/api/conversion` Unchanged Confirmation

`api/routes/conversion.js` was **not modified** in this session and contains no references to `booking_scheduled`, `booking_provider`, `form_submit`, or any provider name (asserted by test section H). No revenue semantics were added or changed.

---

## 10. Paid-Beta Readiness

**NOT READY.** This session is a truth/audit + test lock-in only. Confirmed booking detection remains limited to Calendly + Cal.com embeds; the broader booking/form provider landscape is intentionally passthrough/manual-only. No change to overall paid-beta posture.
