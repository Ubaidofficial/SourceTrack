// KI-44 — zero-row detection for the Stripe subscription-lifecycle updates in
// api/routes/billing.js (SourceTrack's OWN billing webhook — NOT the separate
// customers'-buyers' revenue webhook in api/routes/stripe-webhook.js, §7).
//
// THE DEFECT this closes: all four lifecycle handlers did
//   const { error } = await sb.from('sites').update({...}).eq('stripe_customer_id', customerId)
// In PostgREST a zero-row UPDATE is NOT an error, so `error` stayed null, the
// handler logged a success line and returned 200 — indistinguishable from having
// actually downgraded a site. The UPDATE LOGIC WAS CORRECT; only the detection
// was missing. This module adds detection, a fallback key, and a durable record.
// It does not change what any handler writes.
//
// Three outcomes, all distinguishable:
//   'matched'   — the customer_id update hit >= 1 row. Normal path, no record written.
//   'recovered' — customer_id hit 0 rows but stripe_subscription_id did. The write
//                 landed, but the customer_id linkage is broken and needs repair.
//   (throws)    — both keys missed. Nothing was written; the money rail is wrong.
//
// WHY IT THROWS on hard failure: billing.js already commits its idempotency claim
// only AFTER the switch completes (billing.js:305), and its catch returns 500. So
// throwing reuses the existing, already-correct contract — Stripe retries the same
// event.id and it is re-processed rather than being swallowed as a duplicate. A
// transient race (site row not yet carrying stripe_customer_id) self-heals on retry;
// a permanent absence escalates via Stripe's own retry/disable signal instead of
// depending on anyone reading a table. See the PR body for the 500-vs-200 argument.

import { writeJobRun } from './job-runs.js'

export const BILLING_ZERO_ROW_JOB = 'billing-webhook-zero-row'

// job_runs.status is constrained by job_runs_status_check to exactly
// ('success','failed','partial') — VERIFIED read-only against prod 2026-07-21.
// 'recovered' is NOT a legal value: it would be rejected by the CHECK, and
// writeJobRun only LOGS an insert error rather than throwing, so the record would
// vanish silently — the exact KI-44 failure this module exists to prevent.
// Recovery therefore maps to 'partial' (the write landed, but not cleanly) and is
// distinguished from a hard failure by status AND by the message prefix below.
export const STATUS_RECOVERED = 'partial'
export const STATUS_FAILED = 'failed'

// Stripe returns an id as either a bare string or an expanded object, depending on
// `expand`. Accept both; return null for anything else (never a partial/garbage id).
export function subscriptionIdFrom(value) {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && typeof value.id === 'string' && value.id) return value.id
  return null
}

// Enough context to act on the row without opening Stripe: which event, which
// delivery, which customer, which subscription. Stripe object ids (cus_… / sub_… /
// evt_…) are identifiers, not credentials — no key, token, or site_key is recorded.
function context({ eventType, eventId, customerId, subscriptionId }) {
  return [
    `event=${eventType || 'unknown'}`,
    `event_id=${eventId || 'unknown'}`,
    `customer=${customerId || 'none'}`,
    `subscription=${subscriptionId || 'none'}`
  ].join(' ')
}

/**
 * Apply a subscription-state patch to sites, detecting a zero-row match.
 *
 * @param sb           Supabase service-role client
 * @param patch        The column patch — passed through UNCHANGED (plan/pv_limit
 *                     logic is not this module's business)
 * @param customerId   Stripe customer id — the primary lookup key
 * @param subscriptionId Stripe subscription id — the fallback key, or null when the
 *                     event carries none (then there is no fallback to try)
 * @returns { outcome: 'matched' | 'recovered', siteIds: string[] }
 * @throws  on a real PostgREST error, or when BOTH keys match zero rows
 */
export async function updateSiteSubscription(sb, { patch, customerId, subscriptionId, eventType, eventId }) {
  const ctx = context({ eventType, eventId, customerId, subscriptionId })

  // ── Primary: match on stripe_customer_id ────────────────────────────────────
  // .select() is what makes the zero-row case observable — without it PostgREST
  // returns no rows to count and `error` is null either way.
  const { data: matched, error } = await sb
    .from('sites')
    .update(patch)
    .eq('stripe_customer_id', customerId)
    .select('id')

  if (error) throw error
  if (matched && matched.length > 0) {
    return { outcome: 'matched', siteIds: matched.map(r => r.id) }
  }

  // ── Fallback: match on stripe_subscription_id ───────────────────────────────
  if (subscriptionId) {
    const { data: recovered, error: recoverErr } = await sb
      .from('sites')
      .update(patch)
      .eq('stripe_subscription_id', subscriptionId)
      .select('id')

    if (recoverErr) throw recoverErr
    if (recovered && recovered.length > 0) {
      const siteIds = recovered.map(r => r.id)
      // Distinct from both success and hard failure: the money rail is correct, but
      // sites.stripe_customer_id no longer matches Stripe and will keep missing.
      console.error(
        `[billing] ZERO-ROW RECOVERED via stripe_subscription_id — ${ctx} sites=${siteIds.join(',')} — ` +
        'stripe_customer_id linkage is BROKEN on these sites and needs repair'
      )
      await writeJobRun(sb, {
        job_name: BILLING_ZERO_ROW_JOB,
        status: STATUS_RECOVERED,
        conversions_processed: siteIds.length,
        error_message: `RECOVERED via stripe_subscription_id — ${ctx} sites=${siteIds.join(',')}`
      })
      return { outcome: 'recovered', siteIds }
    }
  }

  // ── Both keys missed: nothing was written ───────────────────────────────────
  console.error(
    `[billing] ZERO-ROW FAILURE — no site matched. ${ctx} — subscription state NOT applied`
  )
  await writeJobRun(sb, {
    job_name: BILLING_ZERO_ROW_JOB,
    status: STATUS_FAILED,
    conversions_processed: 0,
    error_message: `ZERO-ROW: no site matched customer_id or subscription_id — ${ctx}`
  })

  const err = new Error(`[billing] zero-row match — no site for ${ctx}`)
  err.billingZeroRow = true
  throw err
}

/**
 * Record a lifecycle event that was skipped because no site could be resolved at all.
 * Used by invoice.payment_succeeded, whose getSiteByCustomerId() guard previously
 * skipped the entire block with NO log when it returned null.
 *
 * This does NOT throw: nothing was attempted, so there is no failed write for Stripe
 * to retry into. It is recorded so the silence is visible.
 */
export async function recordUnresolvedSite(sb, { eventType, eventId, customerId, subscriptionId, note }) {
  const ctx = context({ eventType, eventId, customerId, subscriptionId })
  console.error(`[billing] UNRESOLVED SITE — ${note || 'no site for customer'} — ${ctx}`)
  await writeJobRun(sb, {
    job_name: BILLING_ZERO_ROW_JOB,
    status: STATUS_FAILED,
    conversions_processed: 0,
    error_message: `UNRESOLVED: ${note || 'no site for customer'} — ${ctx}`
  })
}
