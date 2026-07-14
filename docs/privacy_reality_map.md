# SourceTrack / TrackIQ Privacy & Data Deletion Map

This document maps the exact boundaries of data storage, deletion capabilities, retention, and third-party data processing within SourceTrack.

## 1. Storage & Deletion Map

| Data Store / Scope | Retention Policy | Deletion Trigger | Mechanism & Limitations |
| :--- | :--- | :--- | :--- |
| **Supabase DB: Attribution Records** (`attributed_conversions`) | Nightly purge older than `data_retention_days` (default 30d for free tier, custom up to 365d/forever for paid). | Account Deletion OR Visitor Erasure. | **Hard Delete:** Permanently deleted from the database via SQL `DELETE` queries. |
| **Supabase DB: Stitching Links** (`site_identity_links`) | Indefinite unless deleted. | Account Deletion OR Visitor Erasure. | **Hard Delete:** Identity mappings linking `user_id` to `anonymous_id` are permanently deleted from database. |
| **Supabase DB: Integration Secrets** (`sites` fields: Stripe/Shopify, `gsc_connections`, `ad_platform_connections`) | Indefinite unless disconnected or deleted. | Account Deletion OR Integration Disconnect. | **Hard Delete:** Connection rows are deleted or secret columns are set to `NULL` (erasing encrypted OAuth/webhook secrets from the database). |
| **Supabase DB: Configurations** (`saved_reports`, `api_keys`, `webhook_destinations`) | Indefinite. | Account Deletion OR Manual UI Revocation/Delete. | **Hard Delete:** Cascade-deleted in the database using SQL `ON DELETE CASCADE` constraints linked to the site. |
| **PostHog: Raw Telemetry** (Events, Pageviews, Person Properties) | Defined by PostHog Project Settings. | Visitor Erasure (best-effort). | **Best-Effort Deletion:** Visitor erasure calls the PostHog Person REST API with `delete_events=true`. **PostHog events are NOT deleted on site or account deletion.** |
| **Stripe: Billing & Customer Logs** | Indefinite (Tax/Legal/Accounting reasons). | None. | **Retained:** Customer, payment, invoice, and subscription records are maintained within Stripe and are not mutated or deleted. |

---

## 2. Workspace & Site Protection

- **Shared Workspace Protection:** To prevent accidental data loss for other members, deleting a user account will NOT delete the company's sites or data if other members still belong to the company workspace. Only the deleting user's membership and auth account will be removed.
- **Sole Workspace Owner:** If a user is the only member of a company workspace, deleting their account triggers a full purge of the company, sites, and associated attribution database records.
- **Sole Admin Block:** If a workspace has multiple members and the deleting user is the only administrator, account deletion is blocked (`409 Conflict`) until ownership is transferred or remaining members are removed.

---

## 3. Best-Effort Deletion & Retained Data

- **PostHog Deletion Limits:** Because PostHog is an external service, person and event erasure requests depend on API round-trips and PostHog's backend availability. These deletions are processed on a best-effort basis and are non-blocking for user requests.
- **No Cascade on Account Deletion to PostHog:** Deleting a site or account in SourceTrack does NOT issue bulk event deletion commands to PostHog. Raw events remain inside the PostHog project unless manually purged.
- **Stripe Audit Logs:** Stripe billing logs are legally required to be retained and are completely decoupled from GDPR/CCPA visitor or account erasure requests.

---

## 4. Compliance Disclaimer

SourceTrack / TrackIQ is a practical analytical tool designed with cookieless telemetry features to minimize data footprint. **SourceTrack does not claim or guarantee full legal GDPR, CCPA, or other regional compliance.** Customers are solely responsible for ensuring their tracking configurations, cookie notices, and customer data handling comply with all regional regulations.

---

## 5. Global Privacy Control (GPC) & Do Not Track (DNT) Handling

SourceTrack respects browser-level privacy signals client-side and server-side:
1. **Client-Side Early Abort**: If a visitor's browser broadcasts `navigator.globalPrivacyControl === true`, `navigator.doNotTrack === "1"`, or `window.doNotTrack === "1"`, the client-side tracker (`tracker.min.js` and `tracker.cookieless.min.js`) immediately aborts execution. It stores zero cookies/localStorage values and fires zero network beacons (zero POST requests to `/api/track` or `/api/conversion`).
2. **Server-Side Counting & Full Isolation**: To provide site owners with visibility on GPC/DNT traffic, the server inspects the `Sec-GPC: 1` and `DNT: 1` request headers when serving the tracker script files. If a privacy signal is detected and the request can be attributed to a site via the `Referer` origin:
   - The server logs a suppression entry in a dedicated, isolated Tinybird datasource (`privacy_signals`).
   - The entry contains only the `site_id`, the `reason` (`gpc` or `dnt`), and a coarse hourly `timestamp` (zeroed minutes, seconds, and milliseconds).
   - Absolutely no IP addresses, user agents, cookies, or unique visitor identifiers (such as `distinct_id` or UUIDs) are logged.
   - This datasource is completely isolated from the main `events` datasource, guaranteeing that GPC/DNT suppressed visits never pollute unique visitor/session counts or multi-touch attribution math.
3. **Caching and Counter Resolution**: Since the tracker script is served with cache headers (`public, max-age=86400, stale-while-revalidate=604800, immutable`), browsers load the script from their local cache on subsequent pageviews. As a result, the server only receives a script fetch request at most once per browser per 24 hours. The suppression counter is therefore presented in Setup & Health as an **honest floor of unique browser-days (daily unique visitors)** rather than a raw pageview count.
