import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classifyConversionType, LEAD_TYPES, CUSTOMER_TYPES } from '../lib/conversion-classifier.js'
import * as classifier from '../lib/conversion-classifier.js'
import { mapSubscriptionEvent } from '../lib/stripe-subscription.js'

// Namespace-read with a fallback so a MISSING export fails the add_to_cart assertion on its merits
// rather than throwing a module-level SyntaxError that takes the whole file down (which would hide
// the classification failures this file exists to demonstrate).
const ECOMMERCE_INTENT_TYPES = classifier.ECOMMERCE_INTENT_TYPES ?? []

const __dirname = dirname(fileURLToPath(import.meta.url))
const pipeSrc = (p) => readFileSync(join(__dirname, `../../tinybird/pipes/${p}.pipe`), 'utf8')

test('Conversion Classifier Unit Tests', async (t) => {

  await t.test('All canonical lead types map to lead', () => {
    for (const type of LEAD_TYPES) {
      assert.strictEqual(classifyConversionType(type), 'lead', `Expected '${type}' to map to 'lead'`)
      assert.strictEqual(classifyConversionType(type.toUpperCase()), 'lead', `Expected uppercase '${type}' to map to 'lead'`)
      assert.strictEqual(classifyConversionType(`  ${type}  `), 'lead', `Expected padded '${type}' to map to 'lead'`)
    }
  })

  await t.test('All canonical customer types map to customer', () => {
    for (const type of CUSTOMER_TYPES) {
      assert.strictEqual(classifyConversionType(type), 'customer', `Expected '${type}' to map to 'customer'`)
      assert.strictEqual(classifyConversionType(type.toUpperCase()), 'customer', `Expected uppercase '${type}' to map to 'customer'`)
      assert.strictEqual(classifyConversionType(`  ${type}  `), 'customer', `Expected padded '${type}' to map to 'customer'`)
    }
  })

  await t.test('Untyped, generic, null, undefined, empty, and arbitrary strings map to other', () => {
    const others = [
      'conversion',
      'CONVERSION',
      'other',
      'random_event',
      '',
      '   ',
      null,
      undefined
    ]
    for (const input of others) {
      assert.strictEqual(classifyConversionType(input), 'other', `Expected '${input}' to map to 'other'`)
    }
  })
})

// ── STRIPE SUBSCRIPTION LIFECYCLE ────────────────────────────────────────────────────────
// stripe-subscription.js's mapSubscriptionEvent emits FIVE conversionType values from real
// webhooks. None were in LEAD_TYPES/CUSTOMER_TYPES, so all five classified as 'other' — a trial
// converting to paid was invisible to lead/customer reporting.
//
// The bucket for each is NOT a free choice: `customers` is a per-ROW count
// (dashboard.js `totalCustomers++`, attribution-engine `customers += 1`), NOT a distinct-identity
// count the way leads are. So any type that recurs would inflate the metric, and any type whose
// real-world event ALSO produces a second customer-type row would double-count it.
const STRIPE_EXPECTED = {
  // subscription.created while trialing — explicitly "no immediate revenue". Top-of-funnel
  // commitment, no payment => LEAD. This is also the spelling the PUBLIC docs tell customers to
  // send (dashboard/src/pages/SolutionSaaS.jsx), while LEAD_TYPES only had 'trial'/'free_trial'.
  trial_start: 'lead',
  // subscription.updated trialing->active — fires ONCE per subscription (idempotency key is
  // subscription_id + conversionType) and carries $0. It is the only unambiguous marker of
  // "became a paying customer" => CUSTOMER. Safe because the money for that same event arrives
  // separately as an invoice.paid row, which is NOT a customer type (see renewal below).
  trial_converted: 'customer',
  // invoice.paid, billing_reason != subscription_cycle — the first paid invoice of a
  // subscription, i.e. a direct-to-paid acquisition => CUSTOMER.
  subscription: 'customer',
  // invoice.paid, billing_reason == subscription_cycle — RECURRING. Deliberately NOT a customer:
  // one monthly subscriber would otherwise count as 12 "customers" a year (per-row count). Its
  // revenue is still counted; only the customer COUNT excludes it.
  renewal: 'other',
  // subscription.deleted — a CANCELLATION. Deliberately NOT a customer: counting churn as a
  // customer acquisition is a §6 fabrication. Not a lead either.
  churn: 'other'
}

const stripeEvent = (type, obj) => mapSubscriptionEvent({ type, data: { object: obj } })

test('🔴 STRIPE: the 5 lifecycle conversion types classify correctly (was: all five -> other)', () => {
  for (const [type, expected] of Object.entries(STRIPE_EXPECTED)) {
    assert.strictEqual(classifyConversionType(type), expected,
      `'${type}' must classify as '${expected}'`)
  }
})

// Bound to the REAL mapper, not a re-typed list: a newly-emitted conversionType cannot be added to
// stripe-subscription.js without a deliberate classification decision recorded above.
test('🔴 ANTI-DRIFT: every conversionType mapSubscriptionEvent can emit is classified on purpose', () => {
  const emitted = new Set([
    stripeEvent('invoice.paid', { billing_reason: 'subscription_create', amount_paid: 4900 }).conversionType,
    stripeEvent('invoice.paid', { billing_reason: 'subscription_cycle', amount_paid: 4900 }).conversionType,
    stripeEvent('customer.subscription.created', { id: 'sub_1', status: 'trialing' }).conversionType,
    stripeEvent('customer.subscription.updated', { id: 'sub_1', status: 'active' }).conversionType,
    stripeEvent('customer.subscription.deleted', { id: 'sub_1' }).conversionType
  ].filter(Boolean))
  // The updated-event above needs previous_attributes to emit trial_converted; add it explicitly.
  emitted.add(mapSubscriptionEvent({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', status: 'active' }, previous_attributes: { status: 'trialing' } }
  }).conversionType)

  assert.deepStrictEqual([...emitted].sort(), Object.keys(STRIPE_EXPECTED).sort(),
    'mapSubscriptionEvent emits a conversionType this test does not classify — decide its bucket ' +
    '(and mind that `customers` is a per-row count, so a recurring type must NOT be a customer type)')
})

// ── add_to_cart — a THIRD category, not forced into lead or customer ─────────────────────
// It exists in conversion-sync.js's Meta CAPI map but had no home in the canonical taxonomy.
// An eCommerce cart-add is mid-funnel intent: no contact details (not a lead) and no payment
// (not a customer). Forcing it into either bucket would corrupt that metric, so it is RECOGNIZED
// but deliberately still classifies as 'other' — classifyConversionType's 3-value return contract
// is unchanged, so no consumer's branching changes.
test('🔴 add_to_cart is recognized in the taxonomy but deliberately NOT lead or customer', () => {
  assert.ok(ECOMMERCE_INTENT_TYPES.includes('add_to_cart'), 'add_to_cart must be in the taxonomy')
  for (const t of ECOMMERCE_INTENT_TYPES) {
    assert.strictEqual(classifyConversionType(t), 'other',
      `'${t}' is mid-funnel intent — it must not inflate leads or customers`)
    assert.ok(!LEAD_TYPES.includes(t) && !CUSTOMER_TYPES.includes(t), `${t} must be in exactly one list`)
  }
})

// ── PIPE SYNC (the KI #13-shaped part) ───────────────────────────────────────────────────
// flexible_report_campaign_leads_by_site.pipe inlines a literal copy of LEAD_TYPES to serve the
// `leads` metric, mirroring attribution-engine.js's leadTypeList. It is meant to be IDENTICAL to
// the canonical list (confirmed: flexible-report-campaign-leads-parity.test.js documents it as
// "IN (14 LEAD_TYPES)"), so it goes stale by construction whenever LEAD_TYPES changes.
test('🔴 PIPE SYNC: flexible_report_campaign_leads_by_site IN-list == LEAD_TYPES exactly', () => {
  const sql = pipeSrc('flexible_report_campaign_leads_by_site')
  const m = sql.match(/lower\(coalesce\(conversion_type, ''\)\) IN \(([\s\S]*?)\)/)
  assert.ok(m, 'lead-type IN-list not found in the pipe')
  const inPipe = [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1])
  assert.deepStrictEqual(inPipe.slice().sort(), LEAD_TYPES.slice().sort(),
    'the pipe\'s inlined lead-type list drifted from LEAD_TYPES — §11 forbids forking this taxonomy')
})

// dash_stages.pipe carries a DIFFERENT, 4-value list. Investigated: it is DELIBERATE, not drift —
// dashboard.js:130 hardcodes the identical list and the pipe is a documented "faithful 1:1 port" of
// it, gated on `ingestion_method = 'offline'`. It is the ordered B2B CRM pipeline
// (lead_created -> qualified -> opportunity -> closed_won), which is why it mixes a customer-stage
// value in: those are funnel STAGES, not lead types. Syncing it to LEAD_TYPES would pollute a sales
// pipeline with web conversions (form/signup/trial) and break the stage ordering the dashboard
// renders. This test PINS that decision so a future "helpful" sync fails loudly instead.
test('🔴 dash_stages keeps its deliberate 4-stage CRM list — NOT synced to LEAD_TYPES', () => {
  const CRM_STAGES = ['lead_created', 'qualified', 'opportunity', 'closed_won']
  const sql = pipeSrc('dash_stages')
  const m = sql.match(/conversion_type IN \(([^)]*)\)/)
  assert.ok(m, 'stage list not found in dash_stages.pipe')
  assert.deepStrictEqual([...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]), CRM_STAGES,
    'dash_stages is an ordered offline CRM funnel, deliberately narrower than LEAD_TYPES — ' +
    'if you are "fixing drift" here, re-read dashboard.js:130 first; it hardcodes the same 4')
  assert.match(sql, /ingestion_method = 'offline'/,
    'the offline gate is what makes the narrow CRM list correct — losing it would change the meaning')
})
