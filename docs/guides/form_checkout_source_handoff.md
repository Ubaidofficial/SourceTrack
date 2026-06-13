# Form and Checkout Source Handoff Guide

This guide explains how to pass SourceTrack visitor and campaign context (like anonymous IDs, session IDs, UTM parameters, and ad click IDs) into your signup forms, CRM hidden fields, Stripe checkouts, or custom webhook payloads.

---

## What This Is

SourceTrack's strength is server-side attribution through identity links, webhook stitching, and database logic. To tie website visitor sessions to downstream platforms, you can use the non-PII client-side helper:

```js
window.sourcetrack.getContext()
```

This helper exposes the current visitor's identity and campaign details. By capturing this data at the moment of a form submission or checkout creation, you can safely pass it to downstream services.

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

*Note: All missing or empty values will default to `null`.*

---

## 1. CRM & Lead Form Hidden Fields

If you want to attach SourceTrack context to hidden inputs in your contact/signup forms (e.g. HubSpot, Marketo, Webflow, Custom HTML), follow this pattern.

### Step 1: Add hidden fields to your HTML form

```html
<form id="lead-form" action="/submit" method="POST">
  <!-- Standard visible fields -->
  <input type="text" name="name" required placeholder="Name" />
  <input type="email" name="email" required placeholder="Email" />

  <!-- SourceTrack hidden fields -->
  <input type="hidden" id="st_anonymous_id" name="st_anonymous_id" />
  <input type="hidden" id="st_session_id" name="st_session_id" />
  <input type="hidden" id="st_utm_source" name="st_utm_source" />
  <input type="hidden" id="st_utm_medium" name="st_utm_medium" />
  <input type="hidden" id="st_utm_campaign" name="st_utm_campaign" />
  <input type="hidden" id="st_gclid" name="st_gclid" />

  <button type="submit">Submit Lead</button>
</form>
```

### Step 2: Populate fields using JavaScript

Execute the following script prior to or during form submission:

```javascript
document.addEventListener("DOMContentLoaded", function () {
  // Wait brief moment or hook into form submission to ensure tracker is loaded
  var form = document.getElementById("lead-form");
  if (!form) return;

  form.addEventListener("submit", function () {
    if (window.sourcetrack && typeof window.sourcetrack.getContext === "function") {
      var ctx = window.sourcetrack.getContext();

      document.getElementById("st_anonymous_id").value = ctx.anonymous_id || "";
      document.getElementById("st_session_id").value = ctx.session_id || "";
      document.getElementById("st_utm_source").value = ctx.current_source || "";
      document.getElementById("st_utm_medium").value = ctx.current_medium || "";
      document.getElementById("st_utm_campaign").value = ctx.current_campaign || "";
      document.getElementById("st_gclid").value = ctx.click_ids.gclid || "";
    }
  });
});
```

---

## 2. Stripe Checkout Integration

For Stripe Checkout integration, you can pass the SourceTrack `anonymous_id` into Stripe's Checkout Session creation endpoint via `client_reference_id` or `metadata`.

When the user completes payment, Stripe fires a webhook (`checkout.session.completed`) back to SourceTrack. SourceTrack reads `client_reference_id` and metadata to stitch the conversion to the original visitor journey.

### Step 1: Pass the Anonymous ID from the client to your server

When the user clicks "Checkout", retrieve the context and send it to your billing API route:

```javascript
function redirectToStripe() {
  var anonymousId = "";
  if (window.sourcetrack && typeof window.sourcetrack.getContext === "function") {
    var ctx = window.sourcetrack.getContext();
    anonymousId = ctx.anonymous_id;
  }

  // Send anonymousId to your backend endpoint that creates the Stripe Checkout Session
  fetch("/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      anonymous_id: anonymousId
    })
  })
  .then(res => res.json())
  .then(session => window.location.href = session.url);
}
```

### Step 2: Use client_reference_id on the backend

When creating the session in your backend code (e.g. Node.js), assign `anonymous_id` to the session:

```javascript
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{ price: 'price_123', quantity: 1 }],
  mode: 'subscription',
  success_url: 'https://example.com/success',
  cancel_url: 'https://example.com/cancel',

  // CRITICAL: Attach anonymous_id to client_reference_id
  client_reference_id: req.body.anonymous_id
});
```

---

## 3. Cookieless Mode Behavior & Async Timing

If your website uses SourceTrack's **Cookieless Mode** script (`tracker.cookieless.min.js`), keep the following in mind:

1. **Async ID Resolution:** The cookieless tracker does not store visitor cookies in the browser. Instead, it queries `GET /api/tracker/id` on page load to generate a secure visitor hash.
2. **Nullable ID States:** If you call `window.sourcetrack.getContext()` immediately on page load before this API request resolves, `anonymous_id` and `session_id` will return `null`.
3. **Session-Scoped Context:** Because cookieless tracking does not persist historical first-touch data, the `first_touch_source/medium/campaign` fields returned by `getContext()` are page/session scoped, reflecting only the current page load origin.

If you must capture the IDs in cookieless mode, either defer form population to form submission or wrap it in a brief timeout.

---

## 4. Privacy & Consent Safeguards

* **No Automatic Scraping:** SourceTrack does not automatically scrape form input fields (like email or phone number) or inject tracking scripts into standard forms.
* **Consent Gates:** If you load the tracker with `data-consent-required="true"`, you should check consent status before forwarding or storing the context returned by `getContext()`.
* **PII Boundaries:** Do not pass Personally Identifiable Information (such as plaintext email addresses, passwords, or telephone numbers) inside custom properties.
* **Server-Side Truth:** The browser context is a client-side helper. Server-side processing, secure conversion webhooks, and identity links remain the ultimate source of truth for your multi-touch reports.
