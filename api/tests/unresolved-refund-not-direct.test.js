// dashboard.js /overview: an unresolved refund must debit the dedicated "Unattributed
// refunds" line, never 'Direct'. The real marker nightly-attribution.js writes is
// custom_properties.refund_attribution ('unresolved' | 'inherited') — see
// nightly-attribution.js:1025-1041. dashboard.js:207 was instead reading
// r.attribution_status, a column that does not exist on attributed_conversions (it lives
// only on subscription_identity / subscription_revenue) and was removed from the :91
// select by #424 (leaving this read behind, permanently undefined). Because the flag was
// therefore always false, the else branch ran: an unresolved refund's NULL
// first_touch_source falls back to 'Direct', and its NEGATIVE conversion_value debits it —
// the exact thing the :232-233 comment says never happens.
//
// Fixtures are real-shape: the unresolved row carries NO attribution_status field at all
// (it isn't a real column), so a mock that just returns fixture objects verbatim cannot
// paper over the bug the way it would if the fixture used the phantom field name.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const dash = await import('../routes/dashboard.js')
const { getSupabase } = await import('../lib/supabase.js')

const handlerFor = (router, path, method = 'get') => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.[method])
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const overviewHandler = handlerFor(dash.dashboardRouter, '/overview')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const NOW = new Date()
const iso = NOW.toISOString()
const day = iso.slice(0, 10)

// (a) normal purchase +100, real first_touch_source.
const PURCHASE = {
  distinct_id: 'v1', anonymous_id: 'v1', conversion_type: 'purchase', conversion_value: 100,
  first_touch_source: 'google', first_touch_channel: 'Paid Search', last_touch_channel: 'Paid Search',
  first_touch_campaign: null, status: null, conversion_date: day, conversion_timestamp: iso,
  custom_properties: null
}
// (b) RESOLVED refund — inherits the acquiring source, custom_properties.refund_attribution='inherited'.
const RESOLVED_REFUND = {
  distinct_id: 'v1', anonymous_id: 'v1', conversion_type: 'refund', conversion_value: -40,
  first_touch_source: 'google', first_touch_channel: 'Paid Search', last_touch_channel: 'Paid Search',
  first_touch_campaign: null, status: null, conversion_date: day, conversion_timestamp: iso,
  custom_properties: { refund_attribution: 'inherited', original_conversion_event_id: 'evt_1' }
}
// (c) UNRESOLVED refund — NULL first_touch_source, NEGATIVE value, no attribution_status field
// (it isn't a real column). This is the real production shape.
const UNRESOLVED_REFUND = {
  distinct_id: 'stripe_refund:pi_x', anonymous_id: null, conversion_type: 'refund', conversion_value: -30,
  first_touch_source: null, first_touch_channel: null, last_touch_channel: null,
  first_touch_campaign: null, status: null, conversion_date: day, conversion_timestamp: iso,
  custom_properties: { refund_attribution: 'unresolved' }
}
const CURRENT_ROWS = [PURCHASE, RESOLVED_REFUND, UNRESOLVED_REFUND]

const client = getSupabase()
const realFrom = client.from
function installSupabase (currentRows) {
  let acCalls = 0
  const thenable = (data) => {
    const b = {
      select: () => b, eq: () => b, gte: () => b, lte: () => b, order: () => b, limit: () => b,
      maybeSingle: async () => ({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
      single: async () => ({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
      then: (res) => res({ data, error: null })
    }
    return b
  }
  client.from = (table) => {
    // /overview Promise.all order: call 1 = acRows (current), call 2 = acRowsPrior.
    if (table === 'attributed_conversions') { acCalls++; return thenable(acCalls === 1 ? currentRows : []) }
    if (table === 'sites') return thenable([{ id: 'site-00', site_key: 'sk', timezone: 'UTC' }])
    return thenable([])
  }
  return () => { client.from = realFrom }
}

const req = () => ({ site: { id: 'site-00', business_type: 'saas', timezone: 'UTC' }, query: { days: 30 }, user: { id: 'u1' } })

function installTb () {
  dash.__setDashboardReadDeps({
    queryTinybird: async (pipe) => (pipe === 'dashboard_bounce_rate' ? [{ bounce_rate_pct: 20, total_sessions: 10 }] : []),
    queryHog: async () => { throw new Error('HogQL must not be called') }
  })
  return () => dash.__resetDashboardReadDeps()
}

test('🔴 dashboard/overview: an unresolved refund does not net against an unrelated acquiring source, and the resolved refund still nets against its real source', async (t) => {
  const restoreDb = installSupabase(CURRENT_ROWS)
  const restoreTb = installTb()
  t.after(() => { restoreDb(); restoreTb() })

  const res = mockRes()
  await overviewHandler(req(), res)
  assert.equal(res.statusCode, 200, `body: ${JSON.stringify(res.body).slice(0, 300)}`)
  const { sources } = res.body.data

  const direct = sources.find(s => /direct/i.test(s.dim_value))
  const unattr = sources.find(s => s.dim_value === 'Unattributed refunds')
  const google = sources.find(s => s.dim_value === 'Google')

  console.log('[diagnostic] sources:', JSON.stringify(sources))
  console.log('[diagnostic] kpis.revenue:', res.body.data.kpis.revenue, 'kpis.conversions:', res.body.data.kpis.conversions)
  console.log('[diagnostic] direct:', JSON.stringify(direct), 'unattr:', JSON.stringify(unattr), 'google:', JSON.stringify(google))

  // this fixture's purchase+resolved-refund are BOTH on 'google' (100 - 40 = 60), so a
  // 'Direct' bucket should not exist at all — its presence (with a negative value) is the
  // #278-class symptom: the unresolved refund's NULL first_touch_source falling back to
  // 'Direct' and debiting a source it never earned.
  assert.equal(direct, undefined, 'no source ever attributed to Direct in this fixture — a "Direct" bucket must not exist')
  assert.ok(unattr, 'an "Unattributed refunds" line should exist')
  assert.equal(unattr?.revenue, -30, 'the unresolved refund should sit in "Unattributed refunds"')
  assert.equal(google?.revenue, 60, 'the resolved refund still nets against its real acquiring source (100 - 40)')
})

// ARITHMETIC PROOF (item 5) — the task's literal numbers: a Direct purchase (+100) and an
// unresolved refund (-30), no resolved refund in the mix, so Direct.revenue must stay the
// purchase's untouched 100 while the refund's -30 sits in its own line.
const DIRECT_PURCHASE = {
  distinct_id: 'v9', anonymous_id: 'v9', conversion_type: 'purchase', conversion_value: 100,
  first_touch_source: null, first_touch_channel: null, last_touch_channel: null,
  first_touch_campaign: null, status: null, conversion_date: day, conversion_timestamp: iso,
  custom_properties: null
}
const ARITHMETIC_ROWS = [DIRECT_PURCHASE, UNRESOLVED_REFUND]

test('🔴 arithmetic proof: Direct purchase +100, unresolved refund -30 -> Direct=100, Unattributed=-30, totalRevenue=70, totalConversions=1', async (t) => {
  const restoreDb = installSupabase(ARITHMETIC_ROWS)
  const restoreTb = installTb()
  t.after(() => { restoreDb(); restoreTb() })

  const res = mockRes()
  await overviewHandler(req(), res)
  assert.equal(res.statusCode, 200, `body: ${JSON.stringify(res.body).slice(0, 300)}`)
  const { sources, kpis } = res.body.data
  const direct = sources.find(s => /direct/i.test(s.dim_value))
  const unattr = sources.find(s => s.dim_value === 'Unattributed refunds')

  console.log('[arithmetic] direct.revenue:', direct?.revenue, 'unattr.revenue:', unattr?.revenue, 'kpis.revenue:', kpis.revenue, 'kpis.conversions:', kpis.conversions)

  assert.equal(direct?.revenue, 100, 'Direct.revenue should be the untouched purchase value, 100')
  assert.equal(unattr?.revenue, -30, `'Unattributed refunds' should be -30`)
  assert.equal(kpis.revenue, 70, 'totalRevenue should be 100 + (-30) = 70')
  assert.equal(kpis.conversions, 1, 'totalConversions should be 1 (the refund never adds to the count)')
})
