// KI-44 — zero-row detection on the four Stripe subscription-lifecycle handlers
// in api/routes/billing.js (SourceTrack's OWN billing webhook — NOT the separate
// buyers'-purchases webhook in stripe-webhook.js, §7).
//
// WHY THIS FILE EXISTS: the KI-44 staging reproduction passed only the HAPPY path.
// stripe_customer_id was already populated, so the zero-row branch — the entire
// defect — was NEVER exercised. Every test below drives that branch.
//
// A zero-row UPDATE is not a PostgREST error, so the mock deliberately returns
// { data: [], error: null } for a miss. If the production code stops calling
// .select(), `data` is undefined and the length check cannot distinguish a hit
// from a miss — which is exactly the bug, and what the mutation check proves.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'
// 'placeholder' / 'whsec_test' are the values scripts/check-secret-safety.js accepts
// (STRICT_PLACEHOLDERS, and the convention already used by billing-middleware.test.js).
// Signature verification is stubbed below, so neither value is ever used as a credential.
process.env.STRIPE_SECRET_KEY = 'placeholder'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

const { getSupabase } = await import('../lib/supabase.js')
const { billingWebhookHandler } = await import('../routes/billing.js')
const { BILLING_ZERO_ROW_JOB, STATUS_RECOVERED, STATUS_FAILED, subscriptionIdFrom } =
  await import('../lib/billing-subscription-update.js')

// ── harness ───────────────────────────────────────────────────────────────────
const _client = getSupabase()
const _realFrom = _client.from.bind(_client)

function mockRes() {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

/**
 * Install a `sites` + `job_runs` mock.
 * @param matchCustomer rows the stripe_customer_id filter matches (default: none)
 * @param matchSubscription rows the stripe_subscription_id filter matches (default: none)
 * @param siteRow what getSiteByCustomerId's .maybeSingle() resolves to
 * @param jobRuns  out-param array collecting every job_runs insert
 * @param updates  out-param array collecting every update {patch, column, value}
 */
function installSupabase({ matchCustomer = [], matchSubscription = [], siteRow = null, jobRuns, updates }) {
  _client.from = (table) => {
    if (table === 'job_runs') {
      return { insert: async (row) => { jobRuns.push(row); return { error: null } } }
    }
    if (table !== 'sites') return _realFrom(table)

    // Chainable stand-in for the PostgREST builder. Awaitable at any stage, since
    // production code awaits both `.eq(...)` (reads) and `.eq(...).select(...)` (updates).
    const state = { patch: null, column: null, value: null, isUpdate: false }
    const rowsForFilter = () => {
      if (state.column === 'stripe_customer_id') return matchCustomer
      if (state.column === 'stripe_subscription_id') return matchSubscription
      return []
    }
    const builder = {
      update(patch) { state.patch = patch; state.isUpdate = true; return builder },
      select() { return builder },
      eq(column, value) {
        state.column = column
        state.value = value
        if (state.isUpdate) updates.push({ patch: state.patch, column, value })
        return builder
      },
      maybeSingle: async () => ({ data: siteRow, error: null }),
      then(resolve, reject) {
        // Zero-row is NOT an error — the whole point of KI-44.
        return Promise.resolve({ data: rowsForFilter(), error: null }).then(resolve, reject)
      }
    }
    return builder
  }
}
function restoreSupabase() { _client.from = _realFrom }

// Stripe signature verification is bypassed: constructEvent is stubbed so tests can
// post a raw event object. Auth is not what these tests exercise.
const { stripe } = await import('../routes/billing.js')
const _realConstruct = stripe.webhooks.constructEvent.bind(stripe.webhooks)
stripe.webhooks.constructEvent = (body) => JSON.parse(body)
// The reactivation path calls stripe.subscriptions.list — stub it so no network occurs.
stripe.subscriptions.list = async () => ({ data: [{ items: { data: [{ price: { id: 'price_mock' } }] } }] })

let _evt = 0
const req = (event) => ({
  headers: { 'stripe-signature': 'sig_mock' },
  // event.id must be unique per test: billing.js caches processed ids for 24h and
  // would short-circuit a repeated id as a duplicate.
  body: Buffer.from(JSON.stringify({ ...event, id: `evt_test_${++_evt}` }))
})

const SUB_UPDATED = (customer, subId) => ({
  type: 'customer.subscription.updated',
  data: { object: { customer, id: subId, status: 'active', items: { data: [{ price: { id: 'price_mock' } }] } } }
})
const SUB_DELETED = (customer, subId) => ({
  type: 'customer.subscription.deleted',
  data: { object: { customer, id: subId } }
})
const PAY_SUCCEEDED = (customer, subId) => ({
  type: 'invoice.payment_succeeded',
  data: { object: { customer, subscription: subId, billing_reason: 'subscription_cycle' } }
})
const PAY_FAILED = (customer, subId, attempt = 3) => ({
  type: 'invoice.payment_failed',
  data: { object: { customer, subscription: subId, attempt_count: attempt } }
})

const HANDLERS = [
  { name: 'customer.subscription.updated', event: () => SUB_UPDATED('cus_zero', 'sub_zero') },
  { name: 'customer.subscription.deleted', event: () => SUB_DELETED('cus_zero', 'sub_zero') },
  { name: 'invoice.payment_failed',        event: () => PAY_FAILED('cus_zero', 'sub_zero') },
]

// ── 1. zero-row on each handler → detected, recorded, not silent ──────────────
for (const h of HANDLERS) {
  test(`1. ${h.name}: zero-row is DETECTED and RECORDED, not a silent 200`, async (t) => {
    const jobRuns = [], updates = []
    // siteRow null is irrelevant for these three; they never call getSiteByCustomerId.
    installSupabase({ matchCustomer: [], matchSubscription: [], jobRuns, updates })
    t.after(restoreSupabase)

    const res = mockRes()
    await billingWebhookHandler(req(h.event()), res)

    assert.strictEqual(res.statusCode, 500, `${h.name} must NOT return a success status on a zero-row match`)
    assert.strictEqual(jobRuns.length, 1, 'exactly one durable record must be written')
    assert.strictEqual(jobRuns[0].job_name, BILLING_ZERO_ROW_JOB)
    assert.strictEqual(jobRuns[0].status, STATUS_FAILED)
    // Enough context to act on without opening Stripe.
    assert.match(jobRuns[0].error_message, /ZERO-ROW/)
    assert.match(jobRuns[0].error_message, /cus_zero/, 'customer id must be recorded')
    assert.match(jobRuns[0].error_message, /sub_zero/, 'subscription id must be recorded')
    assert.match(jobRuns[0].error_message, new RegExp(h.name.replace(/\./g, '\\.')), 'event type must be recorded')
    assert.match(jobRuns[0].error_message, /evt_test_/, 'event id must be recorded')
  })
}

// ── 2. customer_id misses, subscription_id matches → RECOVERY ─────────────────
for (const h of HANDLERS) {
  test(`2. ${h.name}: customer_id misses but subscription_id matches → RECOVERY`, async (t) => {
    const jobRuns = [], updates = []
    installSupabase({ matchCustomer: [], matchSubscription: [{ id: 'site-rec' }], jobRuns, updates })
    t.after(restoreSupabase)

    const res = mockRes()
    await billingWebhookHandler(req(h.event()), res)

    assert.strictEqual(res.statusCode, 200, 'a recovered write is a success — the row DID mutate')
    assert.strictEqual(jobRuns.length, 1, 'recovery must still be recorded — the linkage is broken')
    assert.strictEqual(jobRuns[0].status, STATUS_RECOVERED,
      'recovery must be distinguishable from a hard failure by status')
    assert.notStrictEqual(jobRuns[0].status, STATUS_FAILED)
    assert.match(jobRuns[0].error_message, /RECOVERED/, 'and distinguishable by message')
    assert.match(jobRuns[0].error_message, /site-rec/, 'the recovered site id must be recorded')
    // The fallback UPDATE must have been issued against the subscription key.
    assert.ok(updates.some(u => u.column === 'stripe_subscription_id' && u.value === 'sub_zero'),
      'the fallback update must filter on stripe_subscription_id')
  })
}

// ── 3. both keys miss → hard failure, recorded ────────────────────────────────
test('3. both keys miss → hard failure, recorded, nothing written', async (t) => {
  const jobRuns = [], updates = []
  installSupabase({ matchCustomer: [], matchSubscription: [], jobRuns, updates })
  t.after(restoreSupabase)

  const res = mockRes()
  await billingWebhookHandler(req(SUB_UPDATED('cus_ghost', 'sub_ghost')), res)

  assert.strictEqual(res.statusCode, 500)
  assert.strictEqual(jobRuns[0].status, STATUS_FAILED)
  assert.strictEqual(jobRuns[0].conversions_processed, 0, 'zero rows affected must be recorded as 0')
  // Both keys must actually have been attempted before giving up.
  assert.ok(updates.some(u => u.column === 'stripe_customer_id'), 'primary key attempted')
  assert.ok(updates.some(u => u.column === 'stripe_subscription_id'), 'fallback key attempted')
})

test('3b. no subscription id available → no fallback attempted, still recorded', async (t) => {
  const jobRuns = [], updates = []
  installSupabase({ matchCustomer: [], matchSubscription: [{ id: 'site-x' }], jobRuns, updates })
  t.after(restoreSupabase)

  const res = mockRes()
  // subscription: null — an invoice with no subscription carries no fallback key.
  await billingWebhookHandler(req(PAY_FAILED('cus_nosub', null)), res)

  assert.strictEqual(res.statusCode, 500, 'no fallback key available → hard failure')
  assert.strictEqual(jobRuns[0].status, STATUS_FAILED)
  assert.ok(!updates.some(u => u.column === 'stripe_subscription_id'),
    'must not attempt a fallback with a null key (it would match rows with a NULL column)')
})

// ── 4. happy path unchanged ───────────────────────────────────────────────────
for (const h of HANDLERS) {
  test(`4. ${h.name}: happy path still 200 and still mutates the row`, async (t) => {
    const jobRuns = [], updates = []
    installSupabase({ matchCustomer: [{ id: 'site-ok' }], matchSubscription: [], jobRuns, updates })
    t.after(restoreSupabase)

    const res = mockRes()
    await billingWebhookHandler(req(h.event()), res)

    assert.strictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.body, { received: true })
    assert.strictEqual(jobRuns.length, 0, 'a clean match must write NO zero-row record')
    const primary = updates.find(u => u.column === 'stripe_customer_id')
    assert.ok(primary, 'the update must still be issued on the customer key')
    assert.ok(!updates.some(u => u.column === 'stripe_subscription_id'),
      'no fallback should run when the primary matched')
  })
}

test('4b. happy path preserves the exact patch (plan/pv_limit logic untouched)', async (t) => {
  const jobRuns = [], updates = []
  installSupabase({ matchCustomer: [{ id: 'site-ok' }], jobRuns, updates })
  t.after(restoreSupabase)

  await billingWebhookHandler(req(SUB_DELETED('cus_ok', 'sub_ok')), mockRes())

  const patch = updates.find(u => u.column === 'stripe_customer_id').patch
  assert.deepStrictEqual(patch, { plan: 'inactive', pv_limit: 0 },
    'cancellation must still write exactly plan=inactive, pv_limit=0')
})

// ── 5. invoice.payment_succeeded — getSiteByCustomerId returns null ───────────
test('5. payment_succeeded: unresolved site is RECORDED, not silently skipped', async (t) => {
  const jobRuns = [], updates = []
  // siteRow null => getSiteByCustomerId returns null => the old code skipped with NO log.
  installSupabase({ matchCustomer: [], matchSubscription: [], siteRow: null, jobRuns, updates })
  t.after(restoreSupabase)

  const res = mockRes()
  await billingWebhookHandler(req(PAY_SUCCEEDED('cus_unknown', 'sub_unknown')), res)

  assert.strictEqual(jobRuns.length, 1, 'the skipped renewal must leave a durable trace')
  assert.strictEqual(jobRuns[0].status, STATUS_FAILED)
  assert.match(jobRuns[0].error_message, /UNRESOLVED/)
  assert.match(jobRuns[0].error_message, /cus_unknown/)
  assert.match(jobRuns[0].error_message, /sub_unknown/, 'the invoice subscription id must be captured')
  // Nothing was attempted, so there is no failed write for Stripe to retry into.
  assert.strictEqual(res.statusCode, 200, 'an unresolved site is recorded, not retried')
  assert.strictEqual(updates.length, 0, 'no update should be issued when no site resolves')
})

test('5b. payment_succeeded: an ACTIVE site is left alone and writes no record', async (t) => {
  const jobRuns = [], updates = []
  installSupabase({ matchCustomer: [{ id: 'site-ok' }], siteRow: { id: 'site-ok', plan: 'growth' }, jobRuns, updates })
  t.after(restoreSupabase)

  const res = mockRes()
  await billingWebhookHandler(req(PAY_SUCCEEDED('cus_ok', 'sub_ok')), res)

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(jobRuns.length, 0, 'an already-active site is not an anomaly')
  assert.strictEqual(updates.length, 0, 'reactivation must not run for a non-inactive site')
})

// ── subscriptionIdFrom: accepts both Stripe id shapes, rejects everything else ─
test('subscriptionIdFrom handles bare string and expanded object, else null', () => {
  assert.strictEqual(subscriptionIdFrom('sub_123'), 'sub_123')
  assert.strictEqual(subscriptionIdFrom({ id: 'sub_456' }), 'sub_456')
  assert.strictEqual(subscriptionIdFrom(null), null)
  assert.strictEqual(subscriptionIdFrom(undefined), null)
  assert.strictEqual(subscriptionIdFrom(''), null)
  assert.strictEqual(subscriptionIdFrom({}), null, 'an object without an id is not a usable key')
})

test.after(() => { stripe.webhooks.constructEvent = _realConstruct })
