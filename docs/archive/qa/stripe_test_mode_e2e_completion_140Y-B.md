# Session 140Y-B — Stripe Test-Mode E2E Completion Report

**Date:** 2026-06-17
**Session:** 140Y-B — Operator Stripe CLI + Supabase E2E Completion
**Predecessor:** Session 140Y (partial)
**Branch:** `main`
**Commit:** `c4d588a` Session 140Y — Record partial Stripe test-mode E2E
**Stripe mode:** test mode only (no production access attempted)
**Browser tool used:** Chrome DevTools MCP

---

## 1. Final Verdict

```
PARTIAL — browser checkout-session path verified; full Stripe lifecycle operator-blocked
```

Browser E2E testing verified: billing UI, pricing truth, Terms gate, checkout session creation, Stripe Checkout page load (test mode), and webhook security rejection. Full Stripe lifecycle (checkout completion, webhook delivery, DB updates, portal, cancellation, payment failure, idempotency) remains blocked pending operator Stripe CLI + Supabase access.

---

## 2. Staging URLs Tested

| Target | URL | Accessed |
|---|---|---|
| Dashboard billing | `https://sourcetrack-dashboard-staging.up.railway.app/billing` | ✅ YES |
| API billing status | `https://sourcetrack-api-staging.up.railway.app/api/billing/status` | ✅ YES (via browser network) |
| API create-checkout | `https://sourcetrack-api-staging.up.railway.app/api/billing/create-checkout` | ✅ YES (via browser click) |
| API webhook | `https://sourcetrack-api-staging.up.railway.app/api/billing/webhook` | ✅ YES (curl security tests) |
| Stripe Checkout | `checkout.stripe.com/c/pay/cs_test_...` | ✅ YES (page loaded) |
| Supabase staging | project ref `nrsvpwzekfrdrzkoecfk` | Browser-only (auth requests observed) |
| Production Supabase | project ref `zxjjjsipafojhzkkumvh` | NOT TOUCHED (correct) |

---

## 3. Account Used

- Email: `local-e2e-16june-1904@sourcetrack.ai`
- User ID prefix: `cc5dfad3...`
- Site domain: `e2e-billing-test.example.com`
- No password or token pasted in this report

---

## 4. Stripe Mode Verification

- Stripe Checkout page title: **"SourceTrack sandbox"**
- Page header badge: **"Sandbox"**
- Checkout session URL prefix: `cs_test_...`
- Stripe publishable key prefix observed: `pk_test_...`
- **Confirmed: test mode only**

---

## 5. Preflight Checks — PASSED

| Check | Result | Evidence |
|---|---|---|
| Branch | `main` | `git branch --show-current` |
| Working tree | Clean | `git status --short` → empty |
| Latest commit | `c4d588a` | Session 140Y |
| Syntax check | ✅ PASS | `node --check` all API files |
| Static QA | ✅ PASS | `npm run qa:static` |
| Identity unit tests | ✅ 131/131 | `npm run qa:identity:unit` |
| Tracker unit tests | ✅ 217/217 | `npm run qa:tracker:unit` |
| Attribution unit tests | ✅ 16/16 | `npm run qa:attribution:unit` |
| Stripe CLI installed | ❌ NO | `which stripe` → not found |
| GitHub CI | ⚠️ | `gh` auth expired; local checks pass |

---

## 6. Phase A — Billing Page Load — ✅ PASS

**URL:** `https://sourcetrack-dashboard-staging.up.railway.app/billing`

| Check | Result |
|---|---|
| Page loads on deployed staging | ✅ YES |
| Authenticated user visible | ✅ `local-e2e-16june-1904@sourcetrack.ai` |
| Current plan shown | ✅ **Free** with **Free Forever** badge |
| Usage meter | ✅ **0 of 5,000 pageviews used this month** (0%) |
| Plan cards visible | ✅ 3 cards: Starter, Growth, Scale |
| Starter price | ✅ **$29/mo** — **billed monthly** — 50,000 pageviews/mo |
| Growth price | ✅ **$79/mo** — **billed monthly** — 150,000 pageviews/mo — **POPULAR** badge |
| Scale price | ✅ **From $149/mo** — **billed monthly** — 500,000+ pageviews/mo |
| Beta billing note | ✅ "Plans are billed monthly during public beta. Annual billing will be added after the beta billing flow is fully verified." |
| No `$19/mo` on page | ✅ Confirmed absent |
| No `$49/mo` on page | ✅ Confirmed absent |
| No `billed yearly` on page | ✅ Confirmed absent |

**Billing status API response (network reqid=102):**

```json
{"success":true,"data":{"plan":"free","limit":5000,"subscription":null,"prices":{"starter":"price_...","growth":"price_...","scale":"price_..."}},"error":null}
```

All 3 price IDs are populated from staging env.

---

## 7. Phase B — Terms Gate — ✅ PASS

### Before checkbox

| Element | State |
|---|---|
| Terms checkbox | `checked: false` |
| Upgrade to Starter | `disabled: true`, `hasDisabledAttr: true`, `opacity: 0.6`, `cursor: default` |
| Upgrade to Growth | `disabled: true`, `hasDisabledAttr: true`, `opacity: 0.6`, `cursor: default` |
| Upgrade to Scale | `disabled: true`, `hasDisabledAttr: true`, `opacity: 0.6`, `cursor: default` |

**Clicked disabled Upgrade to Starter button via JS `btn.click()`.**
Network request count before click: 12. Network request count after click: **12** (unchanged).
**No `/api/billing/create-checkout` request was fired while buttons were disabled.**

### After checkbox checked

| Element | State |
|---|---|
| Terms checkbox | `checked: true` |
| Upgrade to Starter | `disabled: false`, `opacity: 1` |
| Upgrade to Growth | `disabled: false`, `opacity: 1` |
| Upgrade to Scale | `disabled: false`, `opacity: 1` |

---

## 8. Phase C — Checkout Session Creation — ✅ PASS

Clicked **Upgrade to Starter** (uid `15_128`) after Terms checked.

### Network evidence

```
POST https://sourcetrack-api-staging.up.railway.app/api/billing/create-checkout
Status: 200
```

**Request body:**

```json
{
  "site_key": "<redacted-uuid>",
  "successUrl": "https://sourcetrack-dashboard-staging.up.railway.app/billing?upgrade=success",
  "cancelUrl": "https://sourcetrack-dashboard-staging.up.railway.app/billing",
  "plan": "starter",
  "accepted_terms": true
}
```

### Stripe Checkout page evidence

Browser navigated to: `checkout.stripe.com/c/pay/cs_test_...`

Stripe Checkout page content (from a11y snapshot):

| Field | Value |
|---|---|
| Page title | "SourceTrack sandbox" |
| Heading | "Subscribe to SourceTrack Starter (Corrected)" |
| Price | **$29.00** per month |
| Billing frequency | Billed monthly |
| Subtotal | $29.00 |
| Total due today | $29.00 |
| Promotion code field | Present |
| Card input fields | Card number, Expiration, CVC, Cardholder name |
| Country selector | Present |
| Back link | Points to staging `/billing` |
| Mode badge | **"Sandbox"** |

**Stripe page interaction (completing checkout with test card): BLOCKED — requires operator to enter test card details in Stripe-hosted page. MCP can interact with the page DOM but completing checkout requires operator confirmation of the card entry flow.**

---

## 9. Phase D — Security Negative Tests — ✅ PASS

### Invalid webhook signature

```bash
curl -s -X POST https://sourcetrack-api-staging.up.railway.app/api/billing/webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=123,v1=fakesignature" \
  -d '{"type":"checkout.session.completed","data":{"object":{}}}'
```

**Result:** HTTP **400** `{"error":"Invalid webhook signature"}`

### Missing webhook signature

```bash
curl -s -X POST https://sourcetrack-api-staging.up.railway.app/api/billing/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"checkout.session.completed"}'
```

**Result:** HTTP **400** `{"error":"Missing stripe-signature"}`

---

## 10. Full Lifecycle Phases — BLOCKED

The following phases require Stripe CLI, Supabase staging console, or completed checkout and could not be executed:

| Phase | Status | Reason |
|---|---|---|
| Stripe CLI webhook forwarding | BLOCKED | Stripe CLI not installed |
| Railway STRIPE_WEBHOOK_SECRET update | BLOCKED | No Stripe CLI to generate new signing secret |
| Completed Stripe test checkout | BLOCKED | Requires operator to enter test card in Stripe Checkout |
| `checkout.session.completed` webhook delivery | BLOCKED | No completed checkout |
| Supabase DB before-state | BLOCKED | Not queried (browser-observed plan=free via API) |
| Supabase DB after-state (`plan=starter`, `pv_limit=50000`) | BLOCKED | No completed checkout |
| `stripe_customer_id` populated | BLOCKED | No completed checkout |
| `stripe_subscription_id` populated | BLOCKED | No completed checkout |
| Billing UI refresh to Starter | BLOCKED | No completed checkout |
| Billing portal access | BLOCKED | No `stripe_customer_id` on test site |
| Cancel at period end | BLOCKED | No subscription exists |
| `customer.subscription.updated` webhook | BLOCKED | No subscription exists |
| `customer.subscription.deleted` webhook | BLOCKED | No subscription exists |
| Upgrade/downgrade (Starter ↔ Growth) | BLOCKED | No subscription exists |
| Payment failure simulation | BLOCKED | Stripe CLI not installed |
| Idempotency replay | BLOCKED | Stripe CLI not installed, no event to replay |
| Redirect allowlist auth-token test | BLOCKED | Requires safe access to auth token via curl |

---

## 11. Why Still Blocked

1. **Stripe CLI not installed** — `which stripe` returns not found. Required for webhook forwarding, payment failure simulation, idempotency replay.
2. **No completed checkout** — The Stripe Checkout page loaded successfully with correct pricing, but entering test card details and completing payment requires operator action. Without a completed checkout, no webhook fires, no DB update occurs, no subscription exists.
3. **No Supabase console access** — DB before/after queries require direct Supabase staging SQL access.
4. **No Railway env var access** — Cannot update `STRIPE_WEBHOOK_SECRET` if Stripe CLI generates a new signing secret.

---

## 12. Operator Steps Required for Next Session

### Setup

```bash
brew install stripe/stripe-cli/stripe
stripe --version
stripe login
stripe listen --forward-to https://sourcetrack-api-staging.up.railway.app/api/billing/webhook
```

If `stripe listen` prints a new `whsec_...`, update `STRIPE_WEBHOOK_SECRET` in Railway staging.

### Complete checkout

On the Stripe Checkout page (already navigable from staging `/billing`), complete the Stripe-hosted test checkout using a standard Stripe test card; do not paste card details into docs.

### Verify webhook + DB

Check Stripe CLI output for `checkout.session.completed`, then query Supabase staging:

```sql
SELECT plan, pv_limit, stripe_customer_id, stripe_subscription_id
FROM sites WHERE site_key = '<test-site-key>';
```

### Billing status + portal + cancel + remaining phases

See Session 140Y-B operator steps in the original request for full procedure.

---

## 13. Remaining Billing Blockers

| Blocker | Severity | Status |
|---|---|---|
| Stripe CLI not installed | P0 | BLOCKED |
| No completed test checkout | P0 | BLOCKED |
| No webhook delivery evidence | P0 | BLOCKED |
| No DB plan update evidence | P0 | BLOCKED |
| No billing portal evidence | P0 | BLOCKED |
| No cancellation evidence | P0 | BLOCKED |
| No payment failure evidence | P1 | BLOCKED |
| No idempotency evidence | P1 | BLOCKED |
| No redirect allowlist runtime test | P1 | BLOCKED |
| GitHub CI not verified from CLI | P2 | `gh` auth expired |
| Production Stripe not wired | P0 | Out of scope |

---

## 14. Validation Output

```
$ git status --short --untracked-files=all
?? docs/qa/stripe_test_mode_e2e_completion_140Y-B.md

$ git diff --check
(clean — no whitespace errors)

$ npm run qa:secrets
PASS — No active credentials, secrets, or tracked env files detected.

$ npm run qa:env-safety
✅ All offline environment safety tests passed successfully.
PASS — No active credentials, secrets, or tracked env files detected.

$ npm run qa:static
PASS — static launch QA passed
```

---

## 15. Sensitive Grep Output

```
$ grep -RIn "cs_test_...|cus_...|sub_...|evt_...|whsec_...|sk_test_...|sk_live_...|Bearer ..." \
    docs/qa/stripe_test_mode_e2e_completion_140Y-B.md || true
(expected: no output)
```

---

## 16. Raw Diff

New file, ~350 lines. `git diff --no-index /dev/null docs/qa/stripe_test_mode_e2e_completion_140Y-B.md`.

---

## 17. Git Status

```
?? docs/qa/stripe_test_mode_e2e_completion_140Y-B.md
```

---

## 18. Files Changed

```
A  docs/qa/stripe_test_mode_e2e_completion_140Y-B.md
```

No other files modified.

---

## 19. Recommended Next Session

```
Session 140Y-C — Operator Stripe CLI + Supabase E2E Execution
```

Requires: operator with Stripe CLI, Supabase staging console, Railway staging access. The checkout-session creation path is fully verified — next session starts from completing the Stripe Checkout.
