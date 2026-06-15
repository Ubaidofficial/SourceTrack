# Stripe Staging Webhook Secret Rotation & Smoke Verification — Session 139J-R

> Date: 2026-06-16
> Session: 139J-R — Rotate Staging Stripe Webhook Secret + Smoke Verify
> Branch: main
> Latest Commit: `ec933b6` (Session 139J)
> Staging Supabase Ref: `nrsvpwzekfrdrzkoecfk`
> Production Supabase Ref: `zxjjjsipafojhzkkumvh` (Strictly Excluded)
> Paid Beta Status: 🔴 NOT READY

---

## 1. Verdict

🟢 **PASS**

The staging Stripe webhook secret (`STRIPE_WEBHOOK_SECRET`) has been successfully rotated and verified. An invalid/dummy signature is rejected with a `400 Bad Request` (Invalid webhook signature) and the new secret is accepted with a `200 OK` (received: true).

---

## 2. Rotation & Security Details

* **Secret Reference**:
  ```text
  STRIPE_WEBHOOK_SECRET = whsec_... [REDACTED, rotated again after accidental local/chat exposure]
  ```
* **Rotation History**:
  * first rotation was exposed in chat/local output
  * second attempted rotation was also invalidated because `.temp_secret/secret.txt` was viewed
  * final rotation was performed without writing or printing the secret
  * only the final rotated secret is active in Railway staging
  * production was untouched
  * paid beta remains NOT READY



---

## 3. Mutations & Operations Performed

* **Smoke Test Mutations**: None. The smoke test dispatched a non-mutating `ping` event type which falls through to the default handler, returning a `200` response without modifying database state.
* **Staging Mutations (from Session 139J)**:
  * `auth.users` `email_confirmed_at` updated for the staging test user (`stripe-e2e-139j@sourcetrack.ai`) to bypass GoTrue SMTP limitations.
  * Staging site (`ab48edea-80ba-417c-a603-739fb4301472`) upgraded from `free` to `starter`.
  * `stripe_customer_id` set to `cus_Ui9xTUQNUUEcaL` in the `sites` table.
  * `stripe_subscription_id` set to `sub_1TijdrLZY0IPZEmw8LQ34gl1` in the `sites` table.
  * `pv_limit` updated to `50000` (Starter plan pageview limit).
  * Existing staging test subscription (`sub_1TijdrLZY0IPZEmw8LQ34gl1`) cancellation scheduled at the period end (`July 11, 2026`) via the Customer Billing Portal.

---

## 4. Webhook Smoke Verification

The smoke test was performed using a local script that computed the HMAC-SHA256 signature for a test payload and sent POST requests to the staging API:

* **Endpoint tested**: `POST https://sourcetrack-api-staging.up.railway.app/api/billing/webhook`
* **Test Event Payload**:
  ```json
  {
    "id": "evt_smoke_test_xxxx",
    "object": "event",
    "type": "ping"
  }
  ```

### Test Cases & Responses:
1. **Valid Signature (New Secret)**:
   * **Result**: `200 OK`
   * **Body**: `{"received":true}`
2. **Invalid/Dummy Signature**:
   * **Result**: `400 Bad Request`
   * **Body**: `{"error":"Invalid webhook signature"}`

This confirms that the staging API accepts signatures generated with the final rotated secret and rejects invalid/dummy signatures.

---

## 5. Status & Launch Readiness

* Staging database schema parity: **Verified staging objects: webhook secret rotation and billing webhook signature path only. Broader staging schema parity remains covered by prior schema audits.**
* Paid beta status: 🔴 **NOT READY** (pending resolution of other launch blockers outlined in the release checklist).
