# Abuse, Rate-Limit, and Anti-Spam Audit

Audit and verification of SourceTrack's defenses against denial-of-service, crawler abuse, endpoint flooding, rate limits, and spam signups before public beta.

---

## 1. Executive Summary & Core Risks

### The Biggest Risk: Single-Instance In-Memory Limits
> [!CRITICAL]
> **Rate limits are in-memory and single-instance.** If SourceTrack scales horizontally without Redis/Upstash or another shared store, limits become inconsistent across instances. This is acceptable only for the current single-instance paid beta and **must be fixed before horizontal scaling or larger public launch.**
>
> If multiple containers run behind Railway's load balancer, visitor/IP tracking states are not synchronized. An attacker can distribute traffic across instances, effectively multiplying their allowed request volume by the number of active container replicas.

### Onboarding Abuse Guard UX Gap
> [!WARNING]
> Onboarding/free-tier abuse protection appears to rely partly on database trigger enforcement (`sites_free_tier_abuse_guards`), but frontend/API behavior may still return poor or generic errors unless Express-level validation is added.
>
> Because the Express route `/api/onboarding/site` lacks explicit subdomain validation, any database-level trigger rejection results in a caught Postgres exception, which Express returns as a generic `500 Internal Server Error` with the message `"Failed to register domain. Please try again."` instead of a clean `400 Bad Request` explaining the block. This is logged as a **P1 follow-up item**.

---

## 2. Endpoint Protection Mapping

The following matrix documents the abuse, rate-limit, and spam coverage for all public, authenticated, and incoming service endpoints.

| Endpoint / Flow | Limiter Configured | Limiter Type | In-Memory Only | Signature / Auth / Idempotency | Remaining Abuse Gap |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`/api/track`** | Layered: visitor, IP, site, global IP | Mixed | Yes | Verified `site_key` binding | Rate limits bypass OPTIONS; in-memory store fails under horizontal scaling. |
| **`/api/collect`** | Layered: visitor, IP, site, global IP | Mixed | Yes | Verified `site_key` binding | Same as `/api/track`. |
| **`/track`** | Layered: visitor, IP, site, global IP | Mixed | Yes | Verified `site_key` binding | Same as `/api/track` (CORS headers allowed for all origins). |
| **`/api/conversion`** | Layered: visitor, IP, site, global IP | Mixed | Yes | Verified `site_key` binding. Two-layer deduplication (in-memory + database). | Anonymous conversions (no `order_id` provided) bypass idempotency checks, allowing conversion action spam. |
| **`/api/tracker/id`** | Layered: visitor, IP, site, global IP | Mixed | Yes | Verified `site_key` binding | Visitor key generation relies on IP + UA hash which is spoofable. In-memory limits fail under horizontal scaling. |
| **`/api/identify`** | Layered: visitor, IP, site, global IP | Mixed | Yes | Verified `site_key` binding | User mapping spam can inflate the `site_identity_links` table. In-memory limits fail under horizontal scaling. |
| **Server-Side Event APIs** | Global IP limits only (10,000/min for `/api/server/event`; 100/min for `/api/conversion/offline`) | Global IP | Yes | `/api/server/event`: Bearer token (SHA-256 API key hash). <br> `/api/conversion/offline`: `site_key` + DB-backed idempotency. | Lack of custom layered site-specific or token-specific limiters. Attacker with a valid API key can flood the server up to global IP capacity. |
| **Stripe Webhooks** | None | N/A | N/A | Timing-safe signature construction (`constructEvent`). Plan check gate. DB-backed idempotency. | Attacker can flood endpoint with invalid signatures, causing CPU-heavy decryption and Supabase site key lookups. |
| **Shopify / Manual Webhooks** | Shopify: None <br> Manual: Global IP (`trackLimit`: 120/min) | Global IP (Manual only) | Yes | Shopify: HMAC timing-safe check, plan check gate, DB idempotency. <br> Manual: Binds `site_key`. | Shopify webhooks bypass rate limits entirely, vulnerable to signature-checking CPU exhaust attacks. |
| **Onboarding / Site Creation** | Global IP (`defaultLimit`: 100/min) | Global IP | Yes | Requires user auth (`requireUserAuth`) | Missing Express-level validation for disposable emails and PaaS subdomains (relying on DB trigger), causing generic 500 responses. |
| **Signup / Auth Flow** | Managed by provider | Managed by provider | N/A | Client-side disposable email check in React | Direct API requests to Supabase Auth bypass React form checks entirely. |

---

## 3. Audit Answers (20 Key Questions)

### 1. Which Ingestion Endpoints are Rate-Limited?
The following public-facing ingestion endpoints have custom rate-limiting middleware applied:
- `/api/track` (layered)
- `/api/collect` (layered)
- `/track` (layered)
- `/api/conversion` (layered)
- `/api/tracker/id` (layered)
- `/api/identify` (layered)
- `/api/pixel` (single IP limit)
- `/api/webhooks/incoming` (single IP limit)
- `/api/conversion/offline` (global IP limit)
- `/api/server/event` (global IP limit)

### 2. Which Endpoints are Not Rate-Limited?
- **Stripe Webhooks:** `/api/billing/webhook` and `/api/webhooks/stripe/:site_key` have no rate limits applied.
- **Shopify Webhooks:** `/api/webhooks/shopify/:site_key` has no rate limits applied.
- **OPTIONS Preflight Requests:** Express rate limiters explicitly bypass `OPTIONS` requests to avoid breaking CORS.
- **Dashboard APIs:** Most internal authenticated endpoints (e.g., `/api/attribution`, `/api/journey`, `/api/dashboard`) rely only on the global `defaultLimit` (100 req/min per IP) and standard authentication middlewares.

### 3. Are Limits Per Visitor, Per IP, Per Site, or Global?
The main ingestion limiters use a four-tiered approach:
- **Visitor:** Scoped to `site_key` + hashed visitor identifier (`anonymous_id`/`visitor_id`/`user_id`/IP). Max: 120/min (track) or 30/min (conversion).
- **IP:** Scoped to `site_key` + client IP. Max: 3,000/min (track) or 600/min (conversion).
- **Site:** Scoped to `site_key` (cumulative across all visitors). Max: 10,000/min (track) or 3,000/min (conversion).
- **Global IP:** Scoped to client IP across all sites/events. Max: 10,000/min (track) or 2,000/min (conversion).
- Other routes like `/api/pixel` or `/api/conversion/offline` use global IP limits.

### 4. Are Rate Limits In-Memory or Shared Across Instances?
They are **in-memory only**. Express rate limiters use the default local `MemoryStore` on the Node process.

### 5. What Happens After Deploy/Restart?
Since limit states are stored in process memory, a Railway container redeployment or process restart immediately clears all counters, resetting all limits back to zero.

### 6. What Happens Under Horizontal Scaling?
If the app scales horizontally to multiple containers, rate limits become inconsistent. Because there is no shared cache (e.g., Redis), requests are load-balanced across replicas, allowing abusive clients to bypass limits by distributing requests across nodes.

### 7. Are Bot/Crawler Pageviews Filtered?
Yes. `/api/track` and `/api/collect` use `BOT_UA_PATTERN` to inspect the `User-Agent` header for common crawlers (Googlebot, Bingbot, Lighthouse, Axios, curl, Python requests, etc.). They return a silent 200 response with `{ filtered: 'bot' }` to prevent bot pageviews from inflating PostHog event volumes.

### 8. Are Conversion Endpoints Bot-Filtered or Only Rate-Limited?
They are **only rate-limited** and are **not bot-filtered** via `BOT_UA_PATTERN`. This is because conversion actions (like a purchase or lead sign-up) are initiated by forms or webhooks, making crawler traffic rare. The main defense is rate limiting, path exclusions, and payload structure validation.

### 9. Are Stripe/Shopify Webhooks Signature-Verified Before Expensive Work?
Yes.
- **Stripe:** timing-safely verified via `stripe.webhooks.constructEvent` using raw body Buffer and `stripe-signature` header before JSON parsing or DB calls.
- **Shopify:** timing-safely verified via computed HMAC-SHA256 comparison of the raw body vs `x-shopify-hmac-sha256` header before parsing.

### 10. Are Webhooks Idempotent/Deduped?
Yes.
- **Customer Webhooks (Stripe/Shopify):** Timing-safely claimed via `claimIdempotencyKeys` in the database table `revenue_idempotency_keys` based on `provider_event_id`, `order_id`, and `payment_id`. This survives restarts.
- **Platform Webhooks (Billing):** Deduplicated via `_seenStripeEvents` in-memory `NodeCache` (24-hour TTL) for the Stripe `event.id`. This resets on process restart, so duplicate billing webhook handling must still be verified in Stripe test mode and monitored through Stripe webhook delivery logs.

### 11. Are Onboarding/Site Creation Spam Checks Enforced in Express, DB, Frontend, or All Three?
- **Frontend:** Signup form (`Signup.jsx`) prevents registration using common disposable emails.
- **DB:** Trigger `sites_free_tier_abuse_guards` blocks inserts of free-tier sites with disposable emails or PaaS subdomains.
- **Express:** No. The Express router does not check blocklists, relying entirely on the DB trigger.
- **Enforcement:** Enforced in Frontend and DB. Express is a gap.

### 12. Does Supabase Auth Signup Have Anti-Spam Protection in this Repo?
No. Signups go directly to Supabase Auth (`supabase.auth.signUp`), bypassing the Express API backend entirely. Rate limiting, email verification intervals, and CAPTCHA settings must be configured inside the Supabase Console.

### 13. Are Disposable Email and PaaS Subdomain Guards User-Friendly, or Do They Return Generic Errors?
- **Frontend Signup:** User-friendly. Displays a clear message on the signup page.
- **Express Onboarding / Direct Site Insertion:** **Not user-friendly.** The backend router `/api/onboarding/site` catches the database trigger rejection and returns a generic `500 Internal Server Error` with the message `"Failed to register domain. Please try again."` instead of explaining that PaaS subdomains or disposable emails are blocked.

### 14. Are Abuse Events Observable in Logs?
- Rate limit trips log a warning: `[rate-limit] route=... layer=... status=429 site_key_hash=... ip_hash=...`. IP addresses and site keys are hashed using `ST_LOG_HASH_SECRET` to prevent raw PII from entering logs.
- Webhook signature or verification failures are logged to stderr (`console.error`).
- Database trigger failures are logged as database exceptions in standard Express error logs.

### 15. Are Rate-Limit Thresholds Configurable Through Env Vars?
Yes. Environment overrides (e.g. `ST_RATE_TRACK_VISITOR_PER_MIN`) are parsed on startup via `getEnvInt`. If an override is invalid, the server logs a warning and falls back to safe default settings.

### 16. What Provider-Level Protections are Required Outside the Repo?
- **Supabase Auth:** Configured signup rate limits and CAPTCHA constraints.
- **CDN / Cloudflare / Railway Edge:** DDoS mitigation, WAF rule checks, and bad IP reputation blocking at the network edge.
- **PostHog:** Ingestion billing caps to prevent cost spikes under volumetric traffic.

### 17. What Must Never be Tested Against Production?
- Webhook endpoint flood testing.
- Volumetric rate limit testing.
- Database trigger validation testing with real/fake customer inserts.
- Running mutations on production site records.

### 18. What Can be Tested Locally/Staging?
- Rate limit triggering (by lowering env thresholds like `ST_RATE_TRACK_VISITOR_PER_MIN=2` and scripting rapid requests).
- Webhook signature verification and idempotency handling (by sending mock signed webhooks).
- Onboarding site registration and domain validation logic.
- Disposable email / PaaS subdomain trigger rejections using test accounts.

### 19. What Are P0/P1/P2 Abuse Readiness Gaps?
- **P0 Gaps:** No immediate P0 blocker found for a small, controlled, single-instance paid beta. This does not mean the system is abuse-proof or ready for larger public traffic.
- **P1 Gaps:**
  - In-memory rate limits (must switch to Redis/Upstash before horizontal scaling).
  - Lack of Express-level onboarding validation (causes generic 500 error instead of a clean 400).
- **P2 Gaps:**
  - Discrepancy between hardcoded list in `abuse-guards.js` and `paas_subdomain_blocklist`/`disposable_email_domains` database tables.
  - Lack of local CAPTCHA integration.
  - No active alerting for rate limit trips.

### 20. Is This Enough for Paid Beta?
Partially. The present defenses are acceptable for a small, controlled, single-instance paid beta, provided operators monitor logs and keep traffic expectations modest. They are not sufficient for horizontal scaling, high-volume public launch, or aggressive abuse without moving rate limits to a shared store and improving onboarding/signup abuse handling.

---

## 4. Verification and Mitigation Guidelines

### P1 Follow-Up: Express Onboarding Validation
In a future session, Express onboarding `/api/onboarding/site` should call `validateFreeTierSite`:
```javascript
import { validateFreeTierSite } from '../lib/abuse-guards.js'

const check = validateFreeTierSite({ email: req.user.email, domain })
if (!check.ok) {
  return res.status(400).json({ success: false, data: null, error: check.message })
}
```
This will return a clean `400 Bad Request` with the specific reason (e.g. PaaS subdomain blocked) instead of a Postgres exception bubbling up as a generic 500 error.
