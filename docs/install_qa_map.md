# SourceTrack / TrackIQ Installation & Verification Reality Map

This document maps all publicly served tracker files, canonical snippets, backwards-compatible paths, endpoints, and the boundaries of the installation verification check.

## 1. Tracker Scripts & Served Paths

### Served Scripts
The Express server is configured to serve the following tracking files:

- **Canonical Public Root Paths:**
  - `/tracker.min.js` (serves standard tracker)
  - `/tracker.cookieless.min.js` (serves cookieless tracker)
- **Backwards-Compatible Served Paths:**
  - `/tracker/tracker.min.js`
  - `/tracker/tracker.cookieless.min.js`
- **Development/Debugging Paths (uncached):**
  - `/tracker/tracker.js` (unminified source)
  - `/tracker/tracker.cookieless.js` (unminified cookieless source)
  - `/tracker/analytics.js` (legacy telemetry loader)

### Canonical Install Snippets
- **Standard Snippet:**
  ```html
  <script async src="https://api.srctk.com/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>
  ```
- **Cookieless Snippet:**
  ```html
  <script async src="https://api.srctk.com/tracker.cookieless.min.js" data-site-key="YOUR_SITE_KEY"></script>
  ```

---

## 2. Ingestion Endpoints Map

Standard and cookieless trackers invoke the following API endpoints on the backend:

- `GET /api/tracker/id?site_key=xxx` — **Cookieless ID Generation.** Generates a salted SHA-256 hash representing a rotating daily visitor ID and hourly session ID. Returns no-store headers.
- `POST /api/track` (or `/track`) — **Pageview Ingestion.** Records pageviews and custom tracked events, passing user agents, referrer info, click IDs, and UTM parameters to PostHog.
- `POST /api/conversion` — **Web Conversions.** Ingests conversions triggered in-browser via `sourcetrack.conversion()`.
- `POST /api/identify` — **Identity Stitching.** Maps a client-side anonymous ID to a known database `user_id` or email when a login/signup occurs.
- `GET /api/pixel` — **GIF Tracking.** Fallback 1x1 tracking pixel for email campaigns or no-JS environments.
- `POST /api/conversion/offline` — **Offline/Server API.** Receives backend conversions and CRM status changes from server code.

---

## 3. Installation Verification Boundaries

When a user clicks "Verify installation" in onboarding (Step 6) or on the Settings/Snippet pages, SourceTrack checks the `/api/install/status?site_key=xxx` endpoint.

### What Verification Checks:
1. **Event Ingestion:** It queries the Supabase database to verify if `sites.last_seen_at` is populated. This proves that **at least one event** was successfully received and stored for the site key.
2. **Domain Matching:** It reads `onboarding_state.last_event_domain` from the latest event. If it is set, verification checks if it matches the registered site `domain` (case-insensitive, stripping any leading `www.`).
   - If they do not match, the check returns status `wrong_domain` with a warning message specifying where the event arrived from.

### What Verification Does NOT Check:
- **Full Coverage:** It does NOT check if the script is active on every single page of the website.
- **Conversion Tracking:** It does NOT check if conversion triggers (e.g., checkout success, button clicks) are correctly configured.
- **Integration Health:** It does NOT check if server-side Stripe or Shopify webhook integrations are receiving events.
- **Attribution Accuracy:** It does NOT check if visitor journeys are correctly joined or stitched to conversions.

---

## 4. Platform Integration Guidelines

- **Manual/HTML:** Standard copy-paste placement inside the `<head>` of the index/layout template file.
- **Google Tag Manager (GTM):** Custom HTML tag type, triggered on "All Pages". Tag must contain the canonical standard script tag.
- **Webflow:** Added inside the Webflow settings dashboard under Custom Code -> Head Code box.
- **WordPress:** Installed using a header injector plugin or added directly to the theme's `header.php` template.
- **Framer:** Configured inside Framer Settings -> Custom Code -> Head section.
- **Shopify:** Webhook recipe configured manually inside the Shopify Admin notification settings. Identity stitching accomplished via cart attributes (`st_aid`).

---

## 5. Common Failure States & Diagnosis

| Symptom | Common Cause | Where to Look & Diagnose |
| :--- | :--- | :--- |
| **Verification status stays "Pending"** | Ad-blockers or privacy shields blocking requests during testing. | Open browser DevTools, inspect the **Network** tab, search for `track` or `/api/tracker/id`, and check if the request is blocked. |
| **Verification returns "wrong_domain"** | The script was pasted onto a staging/test environment instead of the production domain. | Check the live domain registered in Settings vs. the domain from which you are testing. |
| **Site key validation errors** | Mismatched or copy-pasted placeholder values (e.g., `YOUR_SITE_KEY` still present in script). | Check the source code of your website to confirm that the `data-site-key` value matches your actual key in the settings panel. |
| **Rate limits block verification** | The user has hit the rate limit threshold. | Rate limits do not block verification. The status route uses a generous `defaultLimit` (100 req/min) that will not be triggered by normal manual testing or onboarding checks. |

---

## Remaining Risks

### P1
- Verification confirms at least one recent event reached SourceTrack for the site key, but it does not prove every page is installed or that conversion tracking is configured.
- Backwards-compatible `/tracker/tracker.min.js` paths remain served, so old snippets still work, but docs should continue using root canonical `/tracker.min.js`.

### P2
- Platform-specific install guides still depend on users following third-party UI steps correctly.
