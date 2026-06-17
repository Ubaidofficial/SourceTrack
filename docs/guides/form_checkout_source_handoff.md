# Form and Checkout Source Handoff Guide

> **Looking for which form and booking tools are auto-detected vs. need setup?** See the [Forms and Booking Support Matrix](forms-and-booking-support.md).

This guide explains how to pass SourceTrack visitor and campaign context (like anonymous IDs, session IDs, UTM parameters, and ad click IDs) into your signup forms, CRM hidden fields, Stripe checkouts, or custom webhook payloads.

---

## What This Is

SourceTrack's strength is server-side attribution through identity links, webhook stitching, and database logic. To tie website visitor sessions to downstream platforms, use the client-side helpers below.

Three helpers are available:

| Helper | Purpose |
|---|---|
| `window.sourcetrack.fillHiddenFields(opts)` | Fills `input[type=hidden]` fields in your form with attribution values |
| `window.sourcetrack.getHandoffParams(opts)` | Returns a flat `{ key: value }` object — use to build redirect URLs or fetch payloads |
| `window.sourcetrack.getContext()` | Returns the full attribution context object — use when you need fine-grained control |

---

## The Context Object Shape

When you call `window.sourcetrack.getContext()`, it returns a JSON object of the following format:

```json
{
  "anonymous_id": "8c2fb902-6014-4a47-a8a2-f04bf4a0a4c2",
  "session_id": "9d8a39b4-50a1-43bf-9a0d-d1ef3381a179",
  "first_touch_source": "google",
  "first_touch_medium": "cpc",
  "first_touch_campaign": "search_generic",
  "current_source": "google",
  "current_medium": "cpc",
  "current_campaign": "search_generic",
  "last_touch_source": "google",
  "last_touch_medium": "cpc",
  "last_touch_campaign": "search_generic",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "search_generic",
  "utm_term": "attribution software",
  "utm_content": "hero-banner",
  "referrer": "https://referrer.example.com/blog?q=123",
  "referrer_host": "referrer.example.com",
  "landing_page_path": "/pricing",
  "click_ids": {
    "gclid": "Cj0KCQjw...",
    "gbraid": null,
    "wbraid": null,
    "fbclid": null,
    "msclkid": null,
    "ttclid": null,
    "li_fat_id": null,
    "li_fatid": null,
    "twclid": null,
    "dclid": null,
    "snapclid": null,
    "pclid": null,
    "sccid": null,
    "ko_click_id": null
  }
}
```

*Note: All missing or empty values default to `null`. `landing_page_path` is the pathname only — no query string or hash. `referrer` is the full referrer URL including any query string; `referrer_host` is the hostname only.*

---

## 1. CRM & Lead Form Hidden Fields — `fillHiddenFields()`

The recommended approach for passing attribution into HTML forms you control.

### Step 1: Add hidden fields to your HTML form

```html
<form id="lead-form" action="/submit" method="POST">
  <!-- Standard visible fields -->
  <input type="text"  name="name"  required placeholder="Name" />
  <input type="email" name="email" required placeholder="Email" />

  <!-- SourceTrack hidden attribution fields -->
  <input type="hidden" name="st_anonymous_id" />
  <input type="hidden" name="st_session_id" />
  <input type="hidden" name="st_utm_source" />
  <input type="hidden" name="st_utm_medium" />
  <input type="hidden" name="st_utm_campaign" />
  <input type="hidden" name="st_utm_term" />
  <input type="hidden" name="st_utm_content" />
  <input type="hidden" name="st_gclid" />
  <input type="hidden" name="st_landing_page_path" />

  <button type="submit">Submit Lead</button>
</form>
```

### Step 2: Fill hidden fields on form submit

```javascript
document.getElementById('lead-form').addEventListener('submit', function () {
  if (window.sourcetrack && window.sourcetrack.fillHiddenFields) {
    window.sourcetrack.fillHiddenFields({
      selector: '#lead-form',
      fields: {
        st_anonymous_id:    'anonymous_id',
        st_session_id:      'session_id',
        st_utm_source:      'utm_source',
        st_utm_medium:      'utm_medium',
        st_utm_campaign:    'utm_campaign',
        st_utm_term:        'utm_term',
        st_utm_content:     'utm_content',
        st_gclid:           'gclid',
        st_landing_page_path: 'landing_page_path'
      }
    })
  }
})
```

`fillHiddenFields()` only writes to `input[type=hidden]` elements — it never touches visible inputs. Fields whose context value is `null` are silently skipped.

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `selector` | string | `'form'` | CSS selector for the form(s) to fill |
| `fields` | object | — | Map of `inputName → contextKey` |
| `createMissing` | boolean | `false` | If `true`, creates and appends missing hidden inputs |

---

## 2. Redirect URL Attribution — `getHandoffParams()`

For form tools that redirect on submit (e.g. Typeform, Tally, or custom redirect-based flows), append attribution as URL parameters. `getHandoffParams()` returns a flat `{ key: value }` object with only non-null values.

```javascript
// Example: decorate a Typeform redirect URL before navigation
var params = window.sourcetrack.getHandoffParams({ prefix: 'st_' })
var qs = new URLSearchParams(params).toString()
var destination = 'https://yourform.typeform.com/to/XXXX?' + qs
window.location.href = destination
```

Or use with `decorateUrl()` directly:

```javascript
var url = window.sourcetrack.decorateUrl('https://yourform.typeform.com/to/XXXX')
window.location.href = url
```

**Options for `getHandoffParams()`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `prefix` | string | `'st_'` | Prefix applied to all output keys |
| `includeReferrer` | boolean | `false` | If `true`, includes the raw full referrer URL as `{prefix}referrer` — privacy-sensitive, see note below |

Fields included by default (when non-null): `anonymous_id`, `session_id`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `referrer_host`, `landing_page_path`, `first_touch_source`, `first_touch_medium`, `first_touch_campaign`, `last_touch_source`, `last_touch_medium`, `last_touch_campaign`, plus any non-null `click_ids` (e.g. `gclid`, `fbclid`).

**Raw referrer:** `getContext().referrer` exposes the full referrer URL including any query string. `getHandoffParams()` defaults to `referrer_host` (hostname only) for safe forwarding to third-party tools. Raw referrer can contain query parameters from the previous page — only use `includeReferrer: true` if you intentionally want to forward the full referrer URL.

---

## 3. Manual Pattern — `getContext()` (Fallback)

Use this when you need fine-grained control over which fields are written, or when your form library manages DOM state (e.g. React-controlled inputs).

Pass attribution context into forms you control, or into hosted tools that support hidden fields or redirect URL parameters.

```javascript
document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('lead-form')
  if (!form) return

  form.addEventListener('submit', function () {
    if (window.sourcetrack && typeof window.sourcetrack.getContext === 'function') {
      var ctx = window.sourcetrack.getContext()

      form.querySelector('[name=st_anonymous_id]').value = ctx.anonymous_id || ''
      form.querySelector('[name=st_session_id]').value   = ctx.session_id || ''
      form.querySelector('[name=st_utm_source]').value   = ctx.utm_source || ''
      form.querySelector('[name=st_utm_medium]').value   = ctx.utm_medium || ''
      form.querySelector('[name=st_utm_campaign]').value = ctx.utm_campaign || ''
      form.querySelector('[name=st_gclid]').value        = (ctx.click_ids && ctx.click_ids.gclid) || ''
    }
  })
})
```

---

## 4. Stripe Checkout Integration

For Stripe Checkout integration, pass the SourceTrack `anonymous_id` into Stripe's Checkout Session creation endpoint via `client_reference_id` or `metadata`.

When the user completes payment, Stripe fires a webhook (`checkout.session.completed`) back to SourceTrack. SourceTrack reads `client_reference_id` and metadata to stitch the conversion to the original visitor journey.

### Step 1: Pass the Anonymous ID from the client to your server

When the user clicks "Checkout", retrieve the context and send it to your billing API route:

```javascript
function redirectToStripe() {
  var anonymousId = ''
  if (window.sourcetrack && typeof window.sourcetrack.getContext === 'function') {
    var ctx = window.sourcetrack.getContext()
    anonymousId = ctx.anonymous_id
  }

  fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anonymous_id: anonymousId })
  })
  .then(res => res.json())
  .then(session => window.location.href = session.url)
}
```

### Step 2: Use client_reference_id on the backend

```javascript
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{ price: 'price_123', quantity: 1 }],
  mode: 'subscription',
  success_url: 'https://example.com/success',
  cancel_url: 'https://example.com/cancel',
  client_reference_id: req.body.anonymous_id
})
```

---

## 5. Cookieless Mode Behavior & Async Timing

If your website uses SourceTrack's **Cookieless Mode** script (`tracker.cookieless.min.js`), keep the following in mind:

1. **Async ID Resolution:** The cookieless tracker does not store visitor cookies in the browser. Instead, it queries `GET /api/tracker/id` on page load to generate a secure visitor hash.
2. **Nullable ID States:** If you call any helper immediately on page load before this API request resolves, `anonymous_id` and `session_id` will be `null`. Call helpers on form submit (not on `DOMContentLoaded`) to avoid missing these values.
3. **Session-Scoped Context:** Because cookieless tracking does not persist historical first-touch data, the `first_touch_source/medium/campaign` fields are session-scoped, reflecting only the current page load origin.
4. **UTM fields are available synchronously:** `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `referrer`, and `landing_page_path` are derived from the current URL and document state — they are available immediately without waiting for the server ID call.

If you must capture `anonymous_id` in cookieless mode, call the helpers on form submit rather than on page load.

---

## 6. Privacy & Consent Safeguards

- **No Automatic Scraping:** SourceTrack does not automatically scrape form input fields (like email or phone number) or inject tracking scripts into standard forms.
- **Hidden fields only:** `fillHiddenFields()` only writes to `input[type=hidden]` elements. It never reads or writes visible inputs.
- **Consent Gates:** If you load the tracker with `data-consent-required="true"`, check consent status before forwarding or storing context returned by any helper.
- **PII Boundaries:** Do not pass Personally Identifiable Information (such as plaintext email addresses, passwords, or telephone numbers) inside custom properties.
- **Server-Side Truth:** The browser context is a client-side helper. Server-side processing, secure conversion webhooks, and identity links remain the ultimate source of truth for your multi-touch reports.
