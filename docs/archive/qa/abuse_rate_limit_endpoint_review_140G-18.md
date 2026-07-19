# QA Report — Session 140G-18 — Abuse / Rate-Limit Endpoint Review

## 1. Route Abuse & Rate Limit Inventory

| Endpoint / Route | Auth Required? | Current Limiter? | Abuse Risk | Action Taken / Status | Action Type |
|---|---|---|---|---|---|
| `POST /api/track` | No (Site Key) | Yes (Layered) | High volume flood of telemetry events | Layered trackers active: Visitor (120/min), IP (3k/min), Site (10k/min), Global IP (10k/min) | Code (Existing) |
| `POST /api/collect` | No (Site Key) | Yes (Layered) | High volume flood of telemetry events (Legacy alias) | Layered trackers active: Visitor (120/min), IP (3k/min), Site (10k/min), Global IP (10k/min) | Code (Existing) |
| `POST /track` | No (Site Key) | Yes (Layered) | High volume flood of telemetry events (Root alias) | Layered trackers active: Visitor (120/min), IP (3k/min), Site (10k/min), Global IP (10k/min) | Code (Existing) |
| `POST /api/identify` | No (Site Key) | Yes (Layered) | Flood of identity resolution links | Layered identify limiters active: Visitor (120/min), IP (1.2k/min), Site (5k/min), Global IP (5k/min) | Code (Existing) |
| `POST /api/conversion` | No (Site Key) | Yes (Layered) | Flood of conversion/revenue events | Layered conversion limiters active: Visitor (30/min), IP (600/min), Site (3k/min), Global IP (2k/min) | Code (Existing) |
| `POST /api/conversion/offline` | No (Site Key) | Yes (Layered) | Flood of batch offline conversion events from CRMs | **Hardened**: Replaced the global `defaultLimit` (100 req/min) with the site/IP-aware conversion limiters (`conversionIpLimit`, `conversionSiteLimit`, `conversionGlobalIpLimit`) to support high-volume webhook pools safely without dropping legitimate client requests. Excluded `conversionVisitorLimit` to prevent key collision when visitor IDs are omitted from batch loads. Added to `INGESTION_PATHS`. | Code Change |
| `GET /api/tracker/id` | No | Yes (Layered) | Flood of daily/hourly session/visitor ID generations | Layered tracker ID limiters active: Visitor (120/min), IP (1.2k/min), Site (5k/min), Global IP (5k/min) | Code (Existing) |
| `GET /api/install/status` | Yes | Yes (Default) | Ingestion status query (authenticated) | Protected by `requireUserAuth` and the global `defaultLimit` (100 req/min). | Code (Existing) |
| `POST /sp/e` | No (Site Key) | Yes (Layered) | High volume flood of proxy telemetry events | **Hardened**: Added to `INGESTION_PATHS` to skip global `defaultLimit` (100 req/min), and protected with the layered track limiters: Visitor (120/min), IP (3k/min), Site (10k/min), Global IP (10k/min). Prevents drops from shared NAT IPs. | Code Change |
| `POST /sp/c` | No (Site Key) | Yes (Layered) | High volume flood of proxy conversion events | **Hardened**: Added to `INGESTION_PATHS` to skip global `defaultLimit` (100 req/min), and protected with the layered conversion limiters: Visitor (30/min), IP (600/min), Site (3k/min), Global IP (2k/min). | Code Change |
| `GET /sp/pixel.gif` | No (Site Key) | Yes (Layered) | Flood of non-JS tracking pageviews | **Hardened**: Added to `INGESTION_PATHS` to skip global `defaultLimit` (100 req/min), and protected with the layered track limiters: Visitor (120/min), IP (3k/min), Site (10k/min), Global IP (10k/min) to align with standard pageview tracking limits and avoid double-limiting. | Code Change |
| `GET /api/pixel` | No (Site Key) | Yes (Layered) | Flood of email open/no-JS tracking | **Hardened**: Added to `INGESTION_PATHS` to skip global `defaultLimit` (100 req/min), and protected with the layered track limiters: Visitor (120/min), IP (3k/min), Site (10k/min), Global IP (10k/min) to align with standard pageview tracking limits and avoid double-limiting. | Code Change |
| `POST /api/webhooks/stripe` | No (HMAC Signature) | Yes (Stripe IP) | Flood of fake webhook updates consuming database/CPU | Protected by `stripeWebhookLimit` (60 req/min) and cryptographic signature validation. | Code (Existing) |
| `POST /api/billing/webhook` | No (HMAC Signature) | Yes (Stripe IP) | Flood of fake webhook updates | Protected by `stripeWebhookLimit` (60 req/min) and cryptographic signature validation. | Code (Existing) |
| `POST /api/webhooks/shopify/:site_key` | No (HMAC Signature) | No (None) | Webhook traffic spoofing | IP rate-limiting is omitted to avoid blocking Shopify's distributed webhook delivery engines. Security is enforced via timing-safe HMAC signature verification. | Deferred |
| `GET /api/public/:token` | No | Yes (Dashboard) | Database exhaustion via heavy attribution queries | **Hardened**: Created a dedicated `publicDashboardLimit` (30 req/min per IP) to prevent unauthenticated database hammering. | Code Change |

---

## 2. Implemented Code Hardening

1. **Proxy Endpoint Protection**:
   - Added `/sp/e`, `/sp/c`, `/sp/pixel.gif`, and `/api/pixel` to the rate limit `INGESTION_PATHS` set, which bypasses the generic global `defaultLimit` (100 req/min per IP) to prevent false positives for legitimate clients behind corporate NATs or shared networks.
   - Wired the robust layered tracking limiters (`trackVisitorLimit`, `trackIpLimit`, `trackSiteLimit`, `trackGlobalIpLimit`) directly into `/sp/e` and `/sp/pixel.gif` in [api/routes/proxy.js](../../api/routes/proxy.js) as well as `/api/pixel` in [api/index.js](../../api/index.js).
   - Wired the conversion limiters (`conversionVisitorLimit`, `conversionIpLimit`, `conversionSiteLimit`, `conversionGlobalIpLimit`) directly into `/sp/c` in [api/routes/proxy.js](../../api/routes/proxy.js).

2. **Offline Conversion Hardening**:
   - Upgraded `/api/conversion/offline` in [api/index.js](../../api/index.js) from the default global limiter to the site/IP-aware conversion limiters (`conversionIpLimit`, `conversionSiteLimit`, `conversionGlobalIpLimit`), bypassing the global limiter by adding it to `INGESTION_PATHS` to avoid CRM sync bottlenecks while protecting the database, without visitor-level constraints.

3. **Public Sharing Hardening**:
   - Defined `publicDashboardLimit` in [api/middleware/rate-limit.js](../../api/middleware/rate-limit.js) allowing a moderate 30 requests per minute per IP.
   - Applied `publicDashboardLimit` to `GET /api/public/:token` in [api/routes/public-dashboard.js](../../api/routes/public-dashboard.js) to safeguard database aggregation queries.

---

## 3. Verification Details

- **Test Suite Pass**: Run `npm run qa:identity:unit`, `npm run qa:tracker:unit`, `npm run qa:attribution:unit` — all tests pass.
- **Dedicated Limiter Tests**:
  Added focused tests in `api/tests/billing-middleware.test.js` covering `publicDashboardLimit` behavior under-limit and asserting no authentication/mutations occur:
  - under-limit passes
  - over-limit returns 429 safe JSON
  - no auth required
  - request body is not mutated
  - Route stacks include correct rate limiters (verifying route middleware mounting for `/sp/e`, `/sp/c`, `/sp/pixel.gif`, and `GET /api/public/:token`).

---

## 4. Remaining Risk / Future Distributed Limiter

Since rate limits are currently held in-memory, they apply per Node process instance. While this is acceptable as a temporary single-instance control for early beta only, pending staging/load verification; multi-instance production requires a distributed limiter (like Redis or Upstash) to maintain consistency across cluster nodes. This is documented and deferred to post-release architecture tasks.
