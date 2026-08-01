// processSite's two-phase restructure: Phase 1 (read+compute) runs with bounded concurrency,
// Phase 2 (writes) stays STRICTLY SEQUENTIAL and in ORIGINAL ROW ORDER.
//
// THE INVARIANT THAT MATTERS. writeConversionSideEffects' subscription_identity upsert is
// `ignoreDuplicates: true` on (site_id, stripe_customer_id) — the FIRST write for a customer wins
// and every later one is silently discarded. nightly_conversions_by_site returns rows ORDER BY
// timestamp ASC, and the intended semantics (stated in the code) are "the chronologically-first
// stitched event wins". NOTHING enforces that except call order. So the moment the per-conversion
// compute is parallelized, a naive implementation that writes in compute-COMPLETION order would let
// network jitter hand the acquisition lock to a LATER conversion — silently mis-attributing the
// subscription's source, with no error and no way to notice afterwards.
//
// The ordering test below does not hope for that race, it FORCES it: the later-timestamped
// conversion's touchpoint fetch resolves immediately while the earlier one is held, so Phase 1
// finishes them in the WRONG order on purpose. The write order must still be row order.
//
// TOKEN-FREE, NO network.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-personal-key'

const { processSite, __setNightlyReadDeps, __resetNightlyReadDeps } =
  await import('../jobs/nightly-attribution.js')
const { getSupabase } = await import('../lib/supabase.js')

const SITE = { id: 'site-conc', site_key: 'sk_conc', attribution_window_days: 30 }

// One touchpoint, inside every conversion's window. A NON-empty touchpoint list is required for
// buildSubscriptionIdentitySeed to return a row at all (it returns null when touchpoints are empty).
const tp = (ts) => ({
  timestamp: ts, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'c1', referrer: null,
  ai_source: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null,
  ttclid: null, li_fat_id: null, li_fatid: null, twclid: null, dclid: null, snapclid: null,
  pclid: null, sccid: null, ko_click_id: null, page_url: 'https://x.test/a',
  country: 'US', device_type: 'desktop', browser_name: 'Chrome'
})

// A stitched subscription conversion: webhook_customer_id present, distinct_id NOT 'stripe_'-
// prefixed, and (with a touchpoint) it produces a subscription_identity seed row.
const conv = ({ uuid, distinct_id, timestamp, customer }) => ({
  uuid, distinct_id, timestamp,
  conversion_type: 'purchase', conversion_value: 100, external_event_id: null,
  webhook_customer_id: customer, stripe_subscription_id: null, stripe_invoice_id: null,
  currency: 'USD', provider_event_id: `evt_${uuid}`, occurred_at: timestamp,
  stripe_event_type: 'invoice.paid', provider: 'stripe'
})

// Captures every write, in the order it was issued.
function stubSupabase (t) {
  const writes = []
  const client = getSupabase()
  const origFrom = client.from
  client.from = (table) => ({
    upsert: async (rec) => { writes.push({ table, rec }); return { error: null } },
    insert: async (rec) => { writes.push({ table, rec }); return { error: null } },
    select: () => { const chain = { eq: () => chain, then: (res) => res({ data: [], error: null }) }; return chain },
    delete: () => ({ eq: () => ({ then: (res) => res({ error: null }) }) })
  })
  t.after(() => { client.from = origFrom })
  return writes
}

const delay = (ms) => new Promise(r => setTimeout(r, ms))

// ── INVARIANT 1: completion order must not affect computed content ────────────────────────────
test('Phase 1 at concurrency 1 and concurrency 8 produce byte-identical records', async (t) => {
  t.after(__resetNightlyReadDeps)
  const rows = [
    conv({ uuid: 'c1', distinct_id: 'anon-1', timestamp: '2026-07-15T10:00:00Z', customer: 'cus_A' }),
    conv({ uuid: 'c2', distinct_id: 'anon-2', timestamp: '2026-07-15T11:00:00Z', customer: 'cus_B' }),
    conv({ uuid: 'c3', distinct_id: 'anon-3', timestamp: '2026-07-15T12:00:00Z', customer: 'cus_C' })
  ]
  // Jitter that INVERTS completion order relative to row order at any concurrency > 1.
  const deps = {
    tbReadEnabled: () => true,
    queryPipe: async (pipe, params) => {
      if (pipe === 'nightly_conversions_by_site') return rows
      if (pipe === 'pageviews_by_visitors') {
        const id = String(params.visitor_ids?.[0] || '')
        await delay(id === 'anon-1' ? 40 : id === 'anon-2' ? 20 : 0)
        return [tp('2026-07-15T09:00:00Z')]
      }
      return null
    }
  }

  async function runAt (concurrency) {
    process.env.NIGHTLY_CONVERSION_CONCURRENCY = String(concurrency)
    __setNightlyReadDeps(deps)
    const writes = []
    const client = getSupabase()
    const origFrom = client.from
    client.from = (table) => ({
      upsert: async (rec) => { writes.push({ table, rec }); return { error: null } },
      insert: async (rec) => { writes.push({ table, rec }); return { error: null } },
      select: () => { const chain = { eq: () => chain, then: (res) => res({ data: [], error: null }) }; return chain },
      delete: () => ({ eq: () => ({ then: (res) => res({ error: null }) }) })
    })
    const r = await processSite(SITE)
    client.from = origFrom
    return { r, ac: writes.filter(w => w.table === 'attributed_conversions').map(w => w.rec) }
  }

  const serial = await runAt(1)
  const parallel = await runAt(8)
  delete process.env.NIGHTLY_CONVERSION_CONCURRENCY

  assert.equal(serial.r.processed, 3)
  assert.equal(parallel.r.processed, 3, 'same processed total at both concurrencies')
  assert.equal(serial.r.failed, 0)
  assert.equal(parallel.r.failed, 0, 'same failed total at both concurrencies')

  // Records are compared BY conversion id, then byte-compared — completion order must not change
  // any computed field, and must not change which record belongs to which conversion.
  assert.deepStrictEqual(
    parallel.ac.map(r => r.conversion_event_id),
    serial.ac.map(r => r.conversion_event_id),
    'attributed_conversions are written in the SAME (original row) order at both concurrencies'
  )
  for (let i = 0; i < serial.ac.length; i++) {
    assert.strictEqual(
      JSON.stringify(parallel.ac[i]), JSON.stringify(serial.ac[i]),
      `record ${serial.ac[i].conversion_event_id} is byte-identical at concurrency 1 vs 8`
    )
  }
})

// ── INVARIANT 2: the one that would silently mis-attribute revenue ────────────────────────────
test('🔴 same stripe_customer_id: the EARLIER row wins the identity write even when the LATER row computes FIRST', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(() => { delete process.env.NIGHTLY_CONVERSION_CONCURRENCY })
  process.env.NIGHTLY_CONVERSION_CONCURRENCY = '8'

  // Same customer. Row order is timestamp ASC, exactly as the pipe returns it.
  const rows = [
    conv({ uuid: 'early', distinct_id: 'anon-early', timestamp: '2026-07-15T10:00:00Z', customer: 'cus_SHARED' }),
    conv({ uuid: 'late',  distinct_id: 'anon-late',  timestamp: '2026-07-15T18:00:00Z', customer: 'cus_SHARED' })
  ]

  const completionOrder = []
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe, params) => {
      if (pipe === 'nightly_conversions_by_site') return rows
      if (pipe === 'pageviews_by_visitors') {
        const id = String(params.visitor_ids?.[0] || '')
        // FORCE the dangerous interleaving: the LATER conversion's compute finishes FIRST.
        if (id === 'anon-early') await delay(60)
        completionOrder.push(id)
        return [tp('2026-07-15T09:00:00Z')]
      }
      return null
    }
  })

  const writes = stubSupabase(t)
  const r = await processSite(SITE)

  assert.equal(r.processed, 2, 'both conversions processed')
  assert.deepStrictEqual(completionOrder, ['anon-late', 'anon-early'],
    'precondition: Phase 1 really did finish the LATER conversion first (else this test proves nothing)')

  const identity = writes.filter(w => w.table === 'subscription_identity')
  assert.equal(identity.length, 2, 'both conversions attempt the ignoreDuplicates upsert')
  assert.equal(identity[0].rec.source_conversion_id, 'early',
    'the CHRONOLOGICALLY-FIRST conversion must issue its subscription_identity upsert FIRST — ' +
    'ignoreDuplicates means whoever writes first wins the acquisition lock, so compute-completion ' +
    'order must never drive this write')
  assert.equal(identity[1].rec.source_conversion_id, 'late', 'the later conversion writes second (and is ignored by the DB)')

  // And the attributed_conversions writes are in row order too.
  const ac = writes.filter(w => w.table === 'attributed_conversions')
  assert.deepStrictEqual(ac.map(w => w.rec.conversion_event_id), ['early', 'late'],
    'Phase 2 writes attributed_conversions in original row order')
})

// ── INVARIANT 3: one bad conversion must not take the batch down ──────────────────────────────
test('a Phase-1 failure is isolated: only that conversion fails, every other one still processes', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(() => { delete process.env.NIGHTLY_CONVERSION_CONCURRENCY })
  process.env.NIGHTLY_CONVERSION_CONCURRENCY = '4'

  const rows = [
    conv({ uuid: 'ok1',  distinct_id: 'anon-ok1',  timestamp: '2026-07-15T10:00:00Z', customer: 'cus_1' }),
    conv({ uuid: 'bad',  distinct_id: 'anon-bad',  timestamp: '2026-07-15T11:00:00Z', customer: 'cus_2' }),
    conv({ uuid: 'ok2',  distinct_id: 'anon-ok2',  timestamp: '2026-07-15T12:00:00Z', customer: 'cus_3' })
  ]
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe, params) => {
      if (pipe === 'nightly_conversions_by_site') return rows
      if (pipe === 'pageviews_by_visitors') {
        // null → the fail-closed throw inside computeConversionRecord, for this ONE conversion.
        if (String(params.visitor_ids?.[0]) === 'anon-bad') return null
        return [tp('2026-07-15T09:00:00Z')]
      }
      return null
    }
  })

  const writes = stubSupabase(t)
  const r = await processSite(SITE)

  assert.equal(r.failed, 1, 'exactly ONE conversion failed')
  assert.equal(r.processed, 2, 'the other two still processed — a Phase-1 failure must not abort or skip the batch')
  const ac = writes.filter(w => w.table === 'attributed_conversions')
  assert.deepStrictEqual(ac.map(w => w.rec.conversion_event_id), ['ok1', 'ok2'],
    'the failed conversion is not written, the survivors are, and still in original row order')
})

// ── the concurrency knob is real (a guard against the pool silently degrading to serial) ──────
test('Phase 1 actually runs concurrently — overlapping computes are observed at concurrency 4', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(() => { delete process.env.NIGHTLY_CONVERSION_CONCURRENCY })
  process.env.NIGHTLY_CONVERSION_CONCURRENCY = '4'

  const rows = Array.from({ length: 4 }, (_, i) =>
    conv({ uuid: `c${i}`, distinct_id: `anon-${i}`, timestamp: `2026-07-15T1${i}:00:00Z`, customer: `cus_${i}` }))

  let inFlight = 0
  let maxInFlight = 0
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe) => {
      if (pipe === 'nightly_conversions_by_site') return rows
      if (pipe === 'pageviews_by_visitors') {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await delay(30)
        inFlight--
        return [tp('2026-07-15T09:00:00Z')]
      }
      return null
    }
  })

  stubSupabase(t)
  await processSite(SITE)
  assert.ok(maxInFlight > 1,
    `Phase 1 must overlap touchpoint fetches (saw max ${maxInFlight} in flight) — if this is 1 the ` +
    'worker pool has silently degraded to serial and the whole change is a no-op')
  assert.ok(maxInFlight <= 4, `concurrency must stay BOUNDED at the configured 4 (saw ${maxInFlight})`)
})
