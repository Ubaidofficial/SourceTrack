// B3 step 3 — the touchpoints read (processConversion) FAILS CLOSED on a null pipe.
//
// HALF A: before this, a null touchpoints pipe fell through to queryPostHog; on a throw it set
// touchpointRows=[] and CONTINUED, writing the conversion with touchpoint_count:0 — afterwards
// INDISTINGUISHABLE from a genuine no-touchpoint conversion (no column records read provenance).
// That is silent MIS-attribution. Now a null pipe THROWS, and processSite's per-conversion catch
// SKIPS the conversion (failed++, nothing written). A served-empty [] is REAL data → still written.
//
// HALF B: fellBack (a site whose conversions pipe returned null) is now surfaced at the run level —
// computeRunErrorMessage embeds the count in job_runs.error_message, and the worker loop counts it.
// TOKEN-FREE, NO network.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-personal-key'

const { processSite, computeRunErrorMessage, computeTerminalStatus, __setNightlyReadDeps, __resetNightlyReadDeps } =
  await import('../jobs/nightly-attribution.js')
const { getSupabase } = await import('../lib/supabase.js')

const SITE = { id: 'site-eb7f68c3', site_key: 'sk_test', attribution_window_days: 30 }

// A served conversion row (named pipe shape) — a plain purchase, no subscription/webhook ids so
// processConversion takes the bare-record path (no subscription seed).
const convPipeRow = {
  uuid: 'conv_tp_1', distinct_id: 'anon-9', timestamp: '2026-07-15T12:00:00Z',
  conversion_type: 'purchase', conversion_value: 100, external_event_id: null,
  webhook_customer_id: null, stripe_subscription_id: null, stripe_invoice_id: null,
  currency: 'USD', provider_event_id: 'evt_1', occurred_at: '2026-07-15T12:00:00Z',
  stripe_event_type: 'checkout.session.completed', provider: 'stripe'
}

const realFetch = global.fetch
// queryPostHog is the ONLY thing reaching global.fetch here (the pipes are injected); a spy proves
// the reads-ENABLED fail-closed path never touches the dead store.
function spyFetch () {
  let calls = 0
  global.fetch = async () => { calls++; return { ok: false, status: 500, text: async () => '', json: async () => ({ results: [] }) } }
  return () => calls
}
function restoreFetch () { global.fetch = realFetch }

// Minimal Supabase stub: capture attributed_conversions upserts; satisfy the post-loop
// subscription_revenue sweep (select().eq().eq() → {data:[]}).
function stubSupabase (t) {
  const upserts = []
  const client = getSupabase()
  const origFrom = client.from
  client.from = (table) => ({
    upsert: async (rec) => { upserts.push({ table, rec }); return { error: null } },
    select: () => { const chain = { eq: () => chain, then: (res) => res({ data: [], error: null }) }; return chain },
    delete: () => ({ eq: () => ({ then: (res) => res({ error: null }) }) })
  })
  t.after(() => { client.from = origFrom })
  return upserts
}

// Conversions pipe serves one row; touchpoints pipe result is parameterized per test.
function readDeps (touchpointsResult) {
  return {
    tbReadEnabled: () => true,
    queryPipe: async (pipe) => {
      if (pipe === 'nightly_conversions_by_site') return [convPipeRow]
      if (pipe === 'pageviews_by_visitors') return touchpointsResult
      return null
    }
  }
}

test('touchpoints pipe null → conversion is SKIPPED (failed++), NOT written, and queryPostHog is never called', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(restoreFetch)
  const fetchCalls = spyFetch()
  const upserts = stubSupabase(t)
  __setNightlyReadDeps(readDeps(null)) // touchpoints read fails (null after retries)

  const r = await processSite(SITE)
  assert.equal(r.processed, 0, 'the mis-attributable conversion is NOT written')
  assert.ok(r.failed >= 1, 'a skipped conversion increments failed++ (reaches the run terminal status)')
  assert.equal(r.served, true, 'the conversions read itself served')
  const acWrites = upserts.filter(u => u.table === 'attributed_conversions')
  assert.equal(acWrites.length, 0, 'NOTHING is written for a conversion whose touchpoints read failed')
  assert.equal(fetchCalls(), 0, 'reads enabled → the touchpoints fail-closed path never calls queryPostHog')
})

test('🔴 REGRESSION GUARD: touchpoints pipe [] → conversion is WRITTEN with touchpoint_count 0 (served-empty is REAL data)', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(restoreFetch)
  const fetchCalls = spyFetch()
  const upserts = stubSupabase(t)
  __setNightlyReadDeps(readDeps([])) // touchpoints served-empty → genuine no-touchpoint conversion

  const r = await processSite(SITE)
  assert.equal(r.processed, 1, 'a genuine no-touchpoint conversion is still processed and written')
  assert.equal(r.failed, 0, 'served-empty is NOT a failure — do not collapse this distinction')
  const acWrites = upserts.filter(u => u.table === 'attributed_conversions')
  assert.equal(acWrites.length, 1, 'the conversion IS written')
  assert.equal(acWrites[0].rec.touchpoint_count, 0, 'written with touchpoint_count 0 (real no-journey conversion)')
  assert.equal(fetchCalls(), 0, 'served-empty touchpoints never falls to queryPostHog')
})

// ── HALF B — fellBack visibility ─────────────────────────────────────────────

test('computeRunErrorMessage: a non-zero fellBack is embedded in the failed-run error_message', () => {
  const msg = computeRunErrorMessage({ status: 'failed', hardFailures: 2, fellBack: 2, fetched: 0 })
  assert.match(msg, /2 site event-store query\(ies\) failed/, 'keeps the base hard-failure reason')
  assert.match(msg, /2 site\(s\) fell back: conversions pipe returned null/, 'appends the fellBack count')
})

test('computeRunErrorMessage: fellBack=0 adds nothing; a success status is null', () => {
  assert.equal(computeRunErrorMessage({ status: 'success', hardFailures: 0, fellBack: 0 }), null)
  const msg = computeRunErrorMessage({ status: 'failed', hardFailures: 1, fellBack: 0 })
  assert.doesNotMatch(msg, /fell back/, 'no fellBack clause when fellBack is 0')
})

test('fellBack is counted at the RUN level: a fell-back site increments the run fellBack total', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(restoreFetch)
  spyFetch()
  // s1 conversions read fails (null → fail-closed, fellBack:true); s2 serves-empty.
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe, params) => (pipe === 'nightly_conversions_by_site' && params.site_id === 's1' ? null : [])
  })
  const sites = [{ id: 's1', site_key: 'a' }, { id: 's2', site_key: 'b' }]
  let totalFellBack = 0, totalHardFailures = 0, totalProcessed = 0
  for (const site of sites) {
    const r = await processSite(site)
    if (r.fellBack) totalFellBack++       // mirrors main()'s worker aggregation (feeds the summary + _fellBack)
    if (r.queryFailed) totalHardFailures++
    totalProcessed += r.processed
  }
  assert.equal(totalFellBack, 1, 'the fell-back site is now visible at the run level (was invisible pre-B3-step-3)')
  // and it lands in the failed-run error_message:
  const status = computeTerminalStatus({ processed: totalProcessed, fetched: 0, hardFailures: totalHardFailures })
  const msg = computeRunErrorMessage({ status, hardFailures: totalHardFailures, fellBack: totalFellBack })
  assert.match(msg, /1 site\(s\) fell back/, 'job_runs.error_message records the fell-back site')
})
