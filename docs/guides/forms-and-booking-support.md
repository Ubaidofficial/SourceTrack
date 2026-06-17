# Forms and Booking — Support Matrix

**Last verified:** 2026-06-17 (Sessions 140H–140M)

This document describes what SourceTrack detects automatically in the browser, what requires additional setup, and what is not supported. Read this before building integrations or writing copy about forms or booking attribution.

---

## Browser Form Submit Detection

The tracker listens for native browser `submit` events. It classifies the form provider from class names and attributes on the `<form>` element. No field values are captured — only the provider type and a sanitized form identifier when available.

| Form tool | Auto-detected? | Provider label | Recommended setup |
|---|---|---|---|
| Plain HTML forms | ✅ Yes | `native` | Install tracker — detected automatically |
| Webflow forms | ✅ Yes | `webflow` | Install tracker — detected via `data-wf-form` or `w-form` class |
| WordPress / CF7 | ✅ Yes | `wordpress` | Install tracker — detected via `wpcf7`, `wpforms`, `gform`, or `elementor-form` class |
| Typeform | ❌ No | — | `decorateUrl()` or `getHandoffParams()` on the redirect URL; or webhook → `/api/conversion/offline` |
| Tally | ❌ No | — | `decorateUrl()` or `getHandoffParams()` on the redirect URL; or webhook → `/api/conversion/offline` |
| HubSpot Forms | ❌ No | — | `fillHiddenFields()` in the form JS embed; or backend webhook |
| Jotform | ❌ No | — | `decorateUrl()` or `getHandoffParams()` on submit redirect; or Jotform webhook |
| Google Forms | ❌ No | — | `decorateUrl()` or `getHandoffParams()` on redirect URL; or manual `/api/conversion/offline` |

**What "auto-detected" means:** When a visitor submits a detected form, the tracker fires a `form_submit` event to `/api/track` containing the form provider, an anonymised form name, and attribution context. No entered field values (email, name, phone, message) are captured or forwarded.

**Tools in the ❌ column** use iframe or proprietary event systems that the browser `submit` listener cannot reach. Attribution for these tools requires passing `getContext()` output as hidden fields or URL parameters at submission time, then forwarding it to SourceTrack via your backend or a webhook handler. See [Form and Checkout Source Handoff Guide](form_checkout_source_handoff.md).

---

## Booking Link UTM Passthrough

When a visitor clicks a link to a supported booking host, the tracker rewrites the URL on `mousedown` to append active UTM parameters and a `sourcetrack_source` identifier. This happens automatically for links on any page where the tracker is installed — no additional configuration needed.

**Supported booking hosts (UTM passthrough):**

| Host | Passthrough verified |
|---|---|
| calendly.com | ✅ Browser E2E verified (140M) |
| cal.com | ✅ Browser E2E verified (140M) |
| tidycal.com | ✅ Browser E2E verified (140M) |
| savvycal.com | ✅ Browser E2E verified (140M) |
| zcal.co | In BOOKING_HOSTS — not individually browser-verified |
| oncehub.com | In BOOKING_HOSTS — not individually browser-verified |
| youcanbook.me | In BOOKING_HOSTS — not individually browser-verified |

Existing UTM parameters on the destination URL are preserved and not overwritten. Hash fragments are preserved.

**Non-booking links are never mutated** — the rewrite only applies to the seven hosts above.

---

## Confirmed Booking Detection

Confirmed booking detection fires a `booking_scheduled` event when an embed widget signals a completed booking. This is distinct from UTM passthrough: UTM passthrough happens on link click; confirmed booking detection fires only after the visitor completes the booking inside the embed.

| Tool | Confirmed booking detection | Detection method | Notes |
|---|---|---|---|
| Calendly (embed) | ✅ Yes | `calendly.event_scheduled` postMessage from `calendly.com` origin | Origin-validated; non-qualifying events and wrong origins are silent |
| Cal.com (embed) | ✅ Yes | `bookingSuccessfulV2` via `window.Cal('on', ...)` | Requires the Cal.com embed snippet to expose `window.Cal`; SourceTrack registers a best-effort `bookingSuccessfulV2` callback when the embed API is available. |
| TidyCal | ❌ No | Passthrough-only | UTM passthrough works; booking completion not detectable from browser |
| SavvyCal | ❌ No | Passthrough-only | UTM passthrough works; booking completion not detectable from browser |
| All others | ❌ No | — | Use the booking provider's webhook + `/api/conversion/offline` |

**For TidyCal, SavvyCal, and others:** use the provider's webhook or notification system to POST a server-side conversion event to `/api/conversion/offline` when a booking is confirmed. See the [offline conversions API docs](/developers/offline-conversions).

---

## Privacy

- **Browser form submit detection does not capture form field values.** No email, name, phone, address, or message field contents are read or transmitted.
- **Browser booking detection does not forward provider payload PII.** The `booking_scheduled` event includes provider name and detection method — not the booker's email or contact details.
- **All browser-detected events route to `/api/track`.** The `/api/conversion` endpoint is for explicit, server-side offline conversions only — it is never called by the browser tracker.
- SourceTrack is cookieless and does not fingerprint visitors. DNT signals are respected.

---

## Related Docs

- [Form and Checkout Source Handoff Guide](form_checkout_source_handoff.md) — how to pass `getContext()` context into unsupported forms, CRM hidden fields, and checkout flows
- [Offline Conversions API](/developers/offline-conversions) — server-side event ingestion for booking webhooks and CRM stage updates
- [QA: Deployed Browser E2E — Forms & Booking](../qa/deployed_forms_booking_e2e_140M.md) — evidence base for the verified claims above
