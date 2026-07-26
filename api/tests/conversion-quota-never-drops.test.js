// CONVERSIONS ARE NEVER DROPPED — and we never acknowledge a webhook we did not persist.
//
// THE P0 (reproduced by the load-bearing test below): at the conversion cap,
// stripe-webhook.js:88 rolled the idempotency key back and returned HTTP **200**. Stripe
// reads 200 as delivered and never retries. The claim was released, so no durable record
// survived either. A customer's purchase was destroyed while we reported success — §6.5
// inverted on the money path, the same principle as "an erasure that deletes nothing must
// never report success".
//
// Not free-tier-only: free 30 / starter 150 / growth 750 / scale 2500. Every tier reaches
// its cap; a growth customer's 751st sale vanished identically.
//
// THE DECISION (founder, 2026-07-26): the conversion quota is METERING ONLY. We count it,
// we may message about it, we NEVER refuse the write. A quota exists for cost control and
// 2500 conversions/month is not a cost; a dropped conversion is a permanently wrong revenue
// number. So `allowed` is invariantly true for every real tier — that invariant is the
// contract this file pins.
//
// MECHANISM (same shape as #429's pageview fix, no RPC change, no migration):
// claim_site_conversion_usage freezes at p_limit without incrementing, exactly like the
// pageview RPC. So we pass a very high p_limit (soft x ANOMALY_MULTIPLIER) to keep the
// counter truthful, and we never treat `allowed:false` from the RPC as a drop signal — it
// becomes an ANOMALY ALARM (a loop or a bug, not usage), logged at ERROR, still persisted.
//
// THE ONE EXCEPTION, deliberate and pinned below: limit === 0 (inactive/archived) is a
// SITE-STATUS block, not a quota. /api/conversion and /api/conversion/offline mount WITHOUT
// checkTierLimit (api/index.js:450, :460) and neither route file carries its own status
// guard, so this path is currently the only thing stopping an archived (churned) site from
// ingesting. Turning it into allowed:true would newly permit that — outside the decision,
// which is about tier quotas.

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Stripe from 'stripe'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  claimConversionUsage, anomalyThresholdFor, ANOMALY_MULTIPLIER
} = await import('../lib/conversion-limits.js')
const { getSupabase } = await import('../lib/supabase.js')
const { encryptSecret } = await import('../lib/utils.js')
const { stripeWebhookRouter } = await import('../routes/stripe-webhook.js')
const {
  __setConversionWriteTransportFactory, __resetConversionWriteTransportFactory
} = await import('../../tinybird/adapter/conversion-write.js')

const CONV_RPC = 'claim_site_conversion_usage'
const client = getSupabase()
const originalFrom = client.from
const originalRpc = client.rpc

// ── A. THE LIB CONTRACT: never refuse ────────────────────────────────────────────────────

// Faithful stand-in for claim_site_conversion_usage: freeze at p_limit (no increment),
// otherwise increment and return the NEW count — baseline_schema.sql, same shape as the
// pageview RPC. Faithful rather than hand-fed, because the p_limit/freeze interplay IS the
// mechanism: a mock ignoring p_limit would pass whatever we passed.
function installRpc (startCount = 0) {
  let count = startCount
  const calls = []
  client.rpc = async (fn, params) => {
    calls.push({ fn, params })
    if (fn !== CONV_RPC) return { data: null, error: null }
    if (count >= params.p_limit) return { data: [{ allowed: false, current_count: count }], error: null }
    count += 1
    return { data: [{ allowed: true, current_count: count }], error: null }
  }
  return { calls }
}
function restoreClient () { client.from = originalFrom; client.rpc = originalRpc }

test('🔴 THE INVARIANT: claimConversionUsage NEVER refuses on a real tier — at, past, and far past the cap', async (t) => {
  t.after(restoreClient)
  // growth: soft 750. Walk ok -> over_soft -> far past, on every real tier.
  for (const [plan, soft] of [['free', 30], ['trial', 99], ['starter', 150], ['growth', 750], ['scale', 2500]]) {
    for (const startCount of [0, soft - 1, soft, soft * 5, soft * 99]) {
      installRpc(startCount)
      const r = await claimConversionUsage({ id: 'site-1', plan })
      assert.strictEqual(r.allowed, true,
        `${plan} at count=${startCount} (soft=${soft}) must still be allowed — a dropped conversion is a permanently wrong revenue number`)
    }
  }
})

test("🔴 state 'ok': below the soft limit", async (t) => {
  t.after(restoreClient)
  installRpc(41)
  const r = await claimConversionUsage({ id: 'site-1', plan: 'growth' })   // soft 750
  assert.strictEqual(r.state, 'ok')
  assert.strictEqual(r.allowed, true)
  assert.strictEqual(r.overQuota, false)
  assert.strictEqual(r.count, 42)
  assert.strictEqual(r.limit, 750, 'limit stays the SOFT plan limit')
  assert.strictEqual(r.softLimit, 750)
})

test("🔴 state 'over_soft': at and past the cap — counted, flagged, still written", async (t) => {
  t.after(restoreClient)
  installRpc(749)
  const atCap = await claimConversionUsage({ id: 'site-1', plan: 'growth' })
  assert.strictEqual(atCap.count, 750, 'the 750th conversion consumes 100% of the allowance')
  assert.strictEqual(atCap.state, 'over_soft')
  assert.strictEqual(atCap.allowed, true)
  assert.strictEqual(atCap.overQuota, true)

  const past = await claimConversionUsage({ id: 'site-1', plan: 'growth' })
  assert.strictEqual(past.count, 751, 'the 751st — the sale that used to vanish — is counted and kept')
  assert.strictEqual(past.state, 'over_soft')
  assert.strictEqual(past.allowed, true)
})

test('🔴 the ANOMALY THRESHOLD is what reaches the RPC as p_limit — the counter stays truthful far past the cap', async (t) => {
  t.after(restoreClient)
  const { calls } = installRpc(0)
  await claimConversionUsage({ id: 'site-1', plan: 'growth' })
  const conv = calls.filter(c => c.fn === CONV_RPC)
  assert.strictEqual(conv.length, 1)
  assert.strictEqual(conv[0].params.p_limit, 75_000,
    'growth soft 750 x 100 — passing the soft limit is what froze the counter and made the drop look necessary')
  assert.strictEqual(ANOMALY_MULTIPLIER, 100)
  assert.strictEqual(anomalyThresholdFor(750), 75_000)
  assert.strictEqual(anomalyThresholdFor(Infinity), Infinity)
})

test("🔴 state 'anomaly': past soft x 100 it logs at ERROR and STILL PERSISTS — we do not discard revenue to hide our own bug", async (t) => {
  t.after(restoreClient)
  installRpc(75_000) // exactly the frozen anomaly threshold for growth
  const errors = []
  const origError = console.error
  console.error = (...a) => errors.push(a.join(' '))
  let r
  try {
    r = await claimConversionUsage({ id: 'site-anomaly', plan: 'growth' })
  } finally {
    console.error = origError
  }
  assert.strictEqual(r.state, 'anomaly')
  assert.strictEqual(r.allowed, true, 'THE POINT: an anomaly alarm is not a drop point')
  assert.strictEqual(r.overQuota, true)
  assert.strictEqual(r.count, 75_000, 'the RPC froze the count at the threshold')
  const alarms = errors.filter(e => e.includes('ANOMALY'))
  assert.strictEqual(alarms.length, 1, 'exactly one ERROR alarm')
  assert.match(alarms[0], /site-anomaly/, 'the alarm must name the site')
  assert.match(alarms[0], /75000/, 'and the count')
})

test('🔴 crossing an integer multiple of the soft limit WARNs (same runaway visibility as the pageview path)', async (t) => {
  t.after(restoreClient)
  installRpc(1_499) // next lands on 2x of growth's 750
  const warns = []
  const origWarn = console.warn
  console.warn = (...a) => warns.push(a.join(' '))
  try {
    await claimConversionUsage({ id: 'site-1', plan: 'growth' })  // 1500 = 2x
    await claimConversionUsage({ id: 'site-1', plan: 'growth' })  // 1501 — no warn
  } finally {
    console.warn = origWarn
  }
  const crossings = warns.filter(w => w.includes('over-quota'))
  assert.strictEqual(crossings.length, 1, 'one WARN per crossing, not one per event past quota')
  assert.match(crossings[0], /2x/)
})

test('an unknown plan falls back to the free row and is still metered, never refused', async (t) => {
  t.after(restoreClient)
  // Honest note: the `limit === Infinity` branch is unreachable via real plans —
  // every PLAN_STRUCTURAL_LIMITS row defines conversion_events, so `?? Infinity` never
  // fires. What IS reachable is getStructuralLimits' fallback to the free row for an
  // unrecognised plan, so that is what this asserts rather than a dead branch.
  const { calls } = installRpc(29)
  const r = await claimConversionUsage({ id: 'site-1', plan: 'not-a-real-plan' })
  assert.strictEqual(r.limit, 30, 'falls back to free\'s conversion_events')
  assert.strictEqual(r.count, 30)
  assert.strictEqual(r.state, 'over_soft')
  assert.strictEqual(r.allowed, true)
  assert.strictEqual(calls.filter(c => c.fn === CONV_RPC)[0].params.p_limit, 3_000, 'free 30 x 100')
})

test('THE ONE EXCEPTION: limit 0 (inactive/archived) is a SITE-STATUS block, not a quota — still refused, no DB call', async (t) => {
  t.after(restoreClient)
  const { calls } = installRpc(0)
  for (const plan of ['inactive', 'archived']) {
    const r = await claimConversionUsage({ id: 'site-1', plan })
    assert.strictEqual(r.allowed, false,
      `${plan} must stay refused: /api/conversion and /api/conversion/offline mount without ` +
      'checkTierLimit, so this is the only thing stopping a churned site from ingesting')
    assert.strictEqual(r.state, 'no_allowance', 'a distinct state — not a quota outcome')
    assert.strictEqual(r.limit, 0)
  }
  assert.strictEqual(calls.length, 0, 'no allowance to meter against — no DB round-trip')
})

test('a DB/RPC error still THROWS so every call site keeps failing open', async (t) => {
  t.after(restoreClient)
  client.rpc = async () => { throw new Error('simulated RPC outage') }
  await assert.rejects(
    () => claimConversionUsage({ id: 'site-1', plan: 'growth' }),
    /simulated RPC outage/
  )
})

// ── B. THE LOAD-BEARING TEST: never ack a webhook we did not persist ─────────────────────
// Drives the REAL stripe webhook route with a real test signature. Harness mirrors
// api/tests/stripe-conversion-durable-write.test.js.

const stripe = new Stripe('fake_key_for_test_signature_only', { apiVersion: '2024-06-20' })
const SITE_KEY = 'sk_live_convquota'
const WEBHOOK_SECRET = 'fake_webhook_secret_for_convquota_test'
const ANON_ID = '11111111-1111-4111-8111-111111111111'
// plan 'scale' -> conversion_events 2500 -> anomaly threshold 250_000
const SITE = { id: 'site-convquota-1', site_key: SITE_KEY, encrypted_stripe_webhook_secret: encryptSecret(WEBHOOK_SECRET), plan: 'scale' }

const layer = stripeWebhookRouter.stack.find(l => l.route?.path === '/:site_key' && l.route?.methods?.post)
const stripeHandler = layer.route.stack[layer.route.stack.length - 1].handle

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

let rollbackDeletes = []
// atCapCount: what claim_site_conversion_usage reports. `allowed:false` here is the
// AT-CAP signal the old code turned into a 200-with-no-write.
function mockSupabaseAtCap (atCapCount) {
  rollbackDeletes = []
  client.from = (table) => {
    if (table === 'sites') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: SITE, error: null }), single: async () => ({ data: SITE, error: null }) }) }) }
    }
    if (table === 'revenue_idempotency_keys') {
      const chain = { eq: () => chain, then: (resolve) => resolve({ error: null }) }
      return { delete: () => { rollbackDeletes.push(1); return chain }, insert: async () => ({ error: null }) }
    }
    return { insert: async () => ({ error: null }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  }
  client.rpc = async (fn) => {
    if (fn === 'claim_revenue_idempotency_keys') return { data: true, error: null }   // claimed, not a duplicate
    if (fn === CONV_RPC) return { data: [{ allowed: false, current_count: atCapCount }], error: null }
    return { data: null, error: null }
  }
}

function recorder () {
  const payloads = []
  return {
    transport: async (p) => { payloads.push(p) },
    lines: () => payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
  }
}

async function drive (eventObj) {
  const raw = Buffer.from(JSON.stringify(eventObj), 'utf8')
  const sig = stripe.webhooks.generateTestHeaderString({ payload: raw.toString('utf8'), secret: WEBHOOK_SECRET })
  const res = mockRes()
  await stripeHandler({ params: { site_key: SITE_KEY }, headers: { 'stripe-signature': sig }, body: raw }, res)
  return res
}

const checkoutEvent = () => ({
  id: 'evt_checkout_cq', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'cs_test_cq', amount_total: 5000, currency: 'usd', payment_intent: 'pi_test_cq', metadata: { anonymous_id: ANON_ID } } }
})
const subscriptionEvent = () => ({
  id: 'evt_invoice_cq', type: 'invoice.paid', created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'in_test_cq', customer: 'cus_cq', subscription: 'sub_cq', billing_reason: 'subscription_create', amount_paid: 4900, currency: 'usd', metadata: { anonymous_id: ANON_ID } } }
})

function resetStripe () { restoreClient(); __resetConversionWriteTransportFactory(); delete process.env.TINYBIRD_DUAL_WRITE }

// stripe-webhook.js:88 is the subscription path (the named P0); :582 is the checkout path.
for (const [label, makeEvent] of [['subscription (stripe-webhook.js:88 — the P0)', subscriptionEvent], ['checkout (stripe-webhook.js:582)', checkoutEvent]]) {
  test(`🔴 ${label}: AT THE CONVERSION CAP the purchase IS PERSISTED — never a 200 with no record`, async (t) => {
    t.after(resetStripe)
    mockSupabaseAtCap(2_500)   // scale's cap, exactly
    process.env.TINYBIRD_DUAL_WRITE = 'true'
    const rec = recorder()
    __setConversionWriteTransportFactory(() => rec.transport)

    const res = await drive(makeEvent())
    const lines = rec.lines()

    // THE LOAD-BEARING ASSERTION — both halves, per the brief.
    assert.strictEqual(lines.length, 1,
      'the conversion MUST be persisted at the cap — this is the revenue that used to be destroyed')
    assert.strictEqual(lines[0].event_type, '$conversion')
    assert.strictEqual(res.statusCode, 200, 'and 200 is now honest, because the write happened')

    // THE ACK RULE, stated as an implication so it survives any future refactor:
    const acked2xx = res.statusCode >= 200 && res.statusCode < 300
    assert.ok(!acked2xx || lines.length === 1,
      'NEVER 2xx without persistence — Stripe treats 2xx as delivered and never retries')
  })

  test(`🔴 ${label}: at the cap the idempotency claim is NOT rolled back (rollback + ack was the anti-pattern)`, async (t) => {
    t.after(resetStripe)
    mockSupabaseAtCap(2_500)
    process.env.TINYBIRD_DUAL_WRITE = 'true'
    const rec = recorder()
    __setConversionWriteTransportFactory(() => rec.transport)

    await drive(makeEvent())

    assert.strictEqual(rollbackDeletes.length, 0,
      'the old code released the claim AND acked 200, so nothing recorded the event anywhere; ' +
      'the claim must now be held by the successful write')
  })

  test(`🔴 ${label}: FAR past the cap (anomaly range) the purchase is STILL persisted`, async (t) => {
    t.after(resetStripe)
    mockSupabaseAtCap(250_000)  // at the frozen anomaly threshold for scale
    process.env.TINYBIRD_DUAL_WRITE = 'true'
    const rec = recorder()
    __setConversionWriteTransportFactory(() => rec.transport)

    const origError = console.error
    console.error = () => {}   // the ERROR alarm is asserted in the lib test above
    let res
    try { res = await drive(makeEvent()) } finally { console.error = origError }

    assert.strictEqual(rec.lines().length, 1, 'an anomaly alarm must not become a silent discard')
    assert.strictEqual(res.statusCode, 200)
  })
}

// A genuine persistence failure must STILL be a retryable 5xx — the ack rule's other half.
// (Guards against "never drop" being over-applied into "always ack".)
test('🔴 THE ACK RULE holds in reverse: a real Tinybird failure at the cap is a retryable 5xx, NOT a 200', async (t) => {
  t.after(resetStripe)
  mockSupabaseAtCap(2_500)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  __setConversionWriteTransportFactory(() => async () => { throw new Error('tinybird down (retries exhausted)') })

  const res = await drive(subscriptionEvent())

  assert.strictEqual(res.statusCode, 500, 'so Stripe redelivers — an unpersisted event is never acked')
  assert.ok(rollbackDeletes.length > 0, 'and the claim IS released here, so the redelivery re-attempts')
})

// ── C. STATIC GUARD: no enforcement site may refuse a conversion on quota ────────────────
// Nine call sites is too many for nine behavioural suites; this pins all of them against
// the exact string that constituted the refusal. Grounded, not vacuous: it appears in 7
// response bodies on the pre-fix tree.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENFORCEMENT_SITES = [
  'routes/conversion.js',
  'routes/conversion-offline.js',
  'routes/proxy.js',
  'routes/track.js',
  'routes/server-events.js',
  'routes/stripe-webhook.js',
  'routes/shopify-webhook.js',
  'routes/webhook-incoming.js'
]

test('🔴 no conversion enforcement site returns a "Conversion limit reached" refusal any more', () => {
  for (const rel of ENFORCEMENT_SITES) {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    // Strip comments so a comment explaining the history cannot fail the assertion.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(code, /Conversion limit reached/,
      `${rel} still refuses a conversion on quota — conversions are metering-only now`)
    assert.doesNotMatch(code, /conversion_limit_reached/,
      `${rel} still emits the conversion_limit_reached error code`)
  }
})

test('🔴 stripe-webhook.js no longer rolls back an idempotency key on the conversion-quota path', () => {
  const src = readFileSync(join(ROOT, 'routes/stripe-webhook.js'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  // The anti-pattern: a claimConversionUsage call followed closely by a rollback.
  // Rollback on a genuine WRITE failure is correct and must survive — so this asserts the
  // narrow window after the quota check only.
  for (const m of code.matchAll(/claimConversionUsage\([^)]*\)/g)) {
    const window = code.slice(m.index, m.index + 500)
    assert.doesNotMatch(window, /rollbackIdempotencyKeys/,
      'releasing the claim right after the quota check is what left no record anywhere')
  }
})
