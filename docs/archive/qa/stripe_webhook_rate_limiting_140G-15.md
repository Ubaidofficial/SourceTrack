# QA Report — Session 140G-15 — Stripe Webhook Rate Limiting

## 1. Task Overview
- **Core Goal**: Hardening Stripe webhook endpoints against signature-validation floods by implementing IP-based rate limiting before cryptographic signature verification.
- **Wording Gate**: Stripe webhook rate limiting is implemented and locally unit-verified; local Stripe E2E script is blocked pending seeded test site data; post-deploy verification remains pending.
- **Constraints**:
  - Do not weaken Stripe signature verification.
  - Do not rate-limit by authenticated user (Stripe webhooks are unauthenticated).
  - Do not consume or parse the request body before signature verification for rate limiter.
  - Use the project's central IP resolver (`resolveClientIp(req)`) which respects trust-proxy and Edge-sanitized `X-Forwarded-For` chain rules (Railway-ready).
  - Support configuring via environment variables with safe defaults:
    - `STRIPE_WEBHOOK_RATE_LIMIT_WINDOW_MS`: default 1 minute (`60000`)
    - `STRIPE_WEBHOOK_RATE_LIMIT_MAX`: default 60 requests per IP per minute

## 2. Implemented & Modified Files

### Central Rate Limit Middleware
- [api/middleware/rate-limit.js](../../api/middleware/rate-limit.js) `[MODIFY]`
  - Added and exported `stripeWebhookLimit` middleware and a factory `createStripeWebhookLimit({ windowMs, max })` for test-friendly isolation.
  - Reads `STRIPE_WEBHOOK_RATE_LIMIT_WINDOW_MS` and `STRIPE_WEBHOOK_RATE_LIMIT_MAX` with safe fallbacks (`60000` / `60`).
  - Utilizes central client IP resolver `resolveClientIp(req)` to resolve the client IP.
  - Hashes the IP using `hashKeyPart(ip)` to build the unique key: `stripe-webhook:ip:<hashed_ip>`.
  - Reuses the existing `makeRateLimitHandler` builder to log warnings safely (no raw IPs or secrets) and return a clean `429` status code with a safe JSON body.

### Route Mounting
- [api/index.js](../../api/index.js) `[MODIFY]`
  - Imported `stripeWebhookLimit` from `./middleware/rate-limit.js`.
  - Mounted `stripeWebhookLimit` before `express.raw({ type: 'application/json' })` on both Stripe webhook endpoints:
    - `/api/billing/webhook` (internal billing handler)
    - `/api/webhooks/stripe` (customer webhook router)
  - This ensures that excessive requests fail fast at the IP level without allocating request buffers or doing CPU-expensive signature verification.

### Test Coverage
- [api/tests/billing-middleware.test.js](../../api/tests/billing-middleware.test.js) `[MODIFY]`
  - Added three unit tests under the suite `Stripe Webhook Rate Limiter Tests (Session 140G-15)`:
    1. **Normal webhook path passes through when under limit**: Verifies that standard requests successfully pass to `next()`.
    2. **Excess requests return 429 and small safe JSON response**: Verifies that requests exceeding the limit (configured to a small limit of `2` for fast test execution) are blocked with `429` status and return the exact safe JSON payload.
    3. **Limiter does not require auth or mutate req.body**: Verifies that the rate-limiter runs successfully without requiring `Authorization` headers and without mutating or reading `req.body`.

## 3. Test Execution Results
All test suites passed cleanly:
- `npm run qa:identity:unit` -> PASS (102 tests, including rate limit tests)
- `npm run qa:tracker:unit` -> PASS (69 tests)
- `npm run qa:attribution:unit` -> PASS (16 tests)
- `npm run qa:static` -> PASS

## 4. Safety Summary
Stripe webhook endpoints are protected against floods by an IP-based rate limiter running prior to raw body buffer parsing and signature validation. The limiter honors proxy-aware and Railway-aware headers for IP resolution, uses Hmac hashing to mask IPs in logs, and has been fully validated with unit tests.
