# Webhook Identity Resolution — QA Report (Session 139N-4A)

**Date:** 2026-06-12
**Branch:** `main`
**Status:** PENDING REVIEW — not committed

---

## 1. Before Behavior

Stripe and generic incoming webhook endpoints ingested conversion events using raw identifiers from the payload directly. If a conversion only contained `user_id` or an email:
- **Stripe Webhooks**: Ignored `user_id` unless `anonymous_id`/`visitor_id` was explicitly supplied in checkout metadata, falling back to a random/unattributed distinct ID (`stripe_unattributed:uuid`).
- **Generic Webhooks**: Used `user_id` or `email` as the PostHog `distinctId` directly without any lookup. Since pageviews are logged under the browser's `anonymous_id`, these conversion events failed to stitch in the attribution engine (which joins strictly on literal `distinct_id`).

---

## 2. After Behavior

Stripe and generic incoming webhook routes now call the shared identity resolver `resolveWebhookAnonymousId` from `api/lib/identity-links.js` before deciding the `distinctId` to send to PostHog:
- If a database mapping for the provided `user_id` exists in the `site_identity_links` table, the webhook conversion is ingested under the resolved browser `anonymous_id`.
- If no database link is found, it falls back to any explicit identifier present in the payload (`anonymous_id`, `visitor_id`, or `user_id`).
- If only an email or no identifiers are present in the payload, it falls back to a random unattributed ID (`webhook_unattributed:<uuid>`) as the `distinctId` to prevent leaking plaintext email PII.
- Resolution details (source, status, and original identifiers) are captured as properties on the ingested event for debugging.

---

## 3. Precedence Order

Precedence for webhook identity resolution is resolved deterministically as:
1. **Explicit `anonymous_id`**: If present in the metadata/payload, it is used immediately (no database query is made).
2. **Explicit `visitor_id`**: If present and `anonymous_id` is missing, it is used immediately (serves as the alias in cookieless/URL contexts).
3. **Linked `user_id`**: Checked against the database table `site_identity_links` to fetch the most recently seen browser `anonymous_id` for that site.
4. **Fallback / Unattributed**: If none of the above are matched or resolved:
   - If the payload contains an explicit `anonymous_id`, `visitor_id`, or `user_id`, that identifier is used as the fallback `distinctId`.
   - If the payload is email-only or empty, it falls back to `webhook_unattributed:<uuid>` as the `distinctId` to avoid PII exposure, while preserving `webhook_email_present: true` and the email property.

---

## 4. Route Changes

### Stripe Webhook Route (`api/routes/stripe-webhook.js`)
- Imports `resolveWebhookAnonymousId` helper.
- Extracts `anonymous_id` / `visitor_id` and `user_id` (from metadata/client_reference_id) and calls the resolver.
- Uses `resolved.anonymousId` as PostHog `distinctId` if found.
- Attaches debugging properties:
  - `webhook_user_id`
  - `webhook_customer_id`
  - `webhook_email_present`
  - `identity_resolution_source`
  - `identity_resolution_status`

### Generic Webhook Route (`api/routes/webhook-incoming.js`)
- Imports `resolveWebhookAnonymousId` helper.
- Passes parsed payload identifiers (`anonymous_id`, `visitor_id`, `user_id`, `email`, `customer_id`) to the resolver.
- Uses `resolved.anonymousId` as PostHog `distinctId` if resolved.
- Attaches consistent debugging properties to the PostHog payload.

### Offline Conversion Route (`api/routes/conversion-offline.js`)
- Updated to attach the same debugging metadata (`webhook_user_id`, `webhook_email_present`, `identity_resolution_source`, `identity_resolution_status`) for full telemetry alignment.

---

## 5. Tests Added

A new suite of tests was added in `api/tests/identity-resolution.test.js`:
- Intercepts and stubs the singleton client returned by `getSupabase()` (via mutating `client.from` query builder chain) to test behavior cleanly without live database connections.
- Verifies:
  - Scenario 1: explicit anonymous_id wins immediately.
  - Scenario 2: visitor_id aliases to anonymous_id.
  - Scenario 3: user_id query is executed and resolved.
  - Scenario 4: unresolved user_id query falls back cleanly.
  - Scenario 5: database query error falls back cleanly.
  - Scenario 6: plaintext email/customer_id are not resolved by default to prevent privacy leaks.

New script added to `package.json`:
`"qa:identity:unit": "node --test api/tests/identity-resolution.test.js"`

---

## 6. What Remains Unresolved (Privacy & Attribution Gaps)

- **Plaintext Emails**: Webhook payloads still accept and forward plaintext emails to PostHog (`properties.email`) when provided, but email-only payloads are prevented from using plaintext email as the primary `distinctId` (falling back instead to `webhook_unattributed:<uuid>` with `webhook_email_present: true`). Because email-to-anonymous ID links are not stored in `site_identity_links`, email-only stitching is not supported. This is an accepted design constraint for the paid beta.
- **Staging E2E Verification**: End-to-end webhook attribution is verified at the unit-test level, but full integration verification remains blocked until staging schema setup, Stripe E2E, and production env verification are completed.

---

## 7. Validation Output

```bash
$ npm run qa:identity:unit
▶ Webhook Identity Resolution Precedence Unit Tests
  ✔ Scenario 1: explicit anonymous_id wins immediately without database query (1.382ms)
  ...
✔ Webhook Identity Resolution Precedence Unit Tests (13.31375ms)
ℹ tests 7 | suites 0 | pass 7 | fail 0 | duration_ms 89.8765

$ npm run qa:tracker:unit
▶ Click ID Normalization Helper Unit Tests
  ...
ℹ tests 11 | suites 0 | pass 11 | fail 0 | duration_ms 68.599208

$ npm run qa:attribution:unit
▶ Deterministic Attribution Models Unit Tests
  ...
ℹ tests 9 | suites 0 | pass 9 | fail 0 | duration_ms 134.939042

$ npm run qa:env-safety
Running offline environment safety guard tests...
✅ All offline environment safety tests passed successfully.

$ npm run qa:static
✅ Blocker checks pass.
✅ Backend syntax check passed.
✅ Frontend production build succeeded.
✅ No trailing whitespace.
✅ Forbidden copy check passed.
PASS — static launch QA passed
```

---

## 8. Git Status

```bash
$ git status --short
 M SESSION_HANDOFF.md
 M SESSION_LOG.md
 M SESSION_STATE.md
 M api/lib/identity-links.js
 M api/routes/conversion-offline.js
 M api/routes/stripe-webhook.js
 M api/routes/webhook-incoming.js
 M dashboard/src/pages/Snippet.jsx
 M docs/release_checklist_gate.md
 M package.json
 A api/tests/identity-resolution.test.js
 A docs/qa/webhook_identity_resolution_139N4A.md
```
