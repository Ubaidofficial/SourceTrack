// Phase-1 read-cutover Wave-2 — hygiene.js (/utms) dispatch/fallback tests.
// Same contract as live-read-cutover.test.js: fallback (flag off = HogQL,
// unchanged), dispatch (flag on = Tinybird, HogQL not called), fail-closed
// (TINYBIRD_FORCE_READ + null = 500), and the missing-site guard. Also asserts
// the money-rail read (hygiene_missing_conv) is NOT wired to Tinybird.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/hygiene.js')
const { hygieneRouter, __setHygieneReadDeps, __resetHygieneReadDeps } = mod
const layer = hygieneRouter.stack.find(l => l.route && l.route.path === '/utms')
const handler = layer.route.stack[layer.route.stack.length - 1].handle // last = the async handler

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const reqWithSite = (id = 'site-00') => ({ site: { id } })

// HogQL stub: returns positional rows per queryName; records the names called.
function hogStub (calls, { missingSource = 7 } = {}) {
  return async (_sql, name) => {
    calls.push(name)
    switch (name) {
      case 'hygiene_missing_source': return [[missingSource]]
      case 'hygiene_missing_conv': return [[3]]
      case 'hygiene_campaigns': return [['spring', 12]]
      case 'hygiene_referrers': return [['ref.example', 9]]
      case 'hygiene_low_activity': return [['2026-07-01', 2]]
      default: return [[0]]
    }
  }
}
// Tinybird stub: named-object rows per pipe, or null for every pipe.
function tbStub (calls, rowsByPipe /* object or null */) {
  return async (pipe, params) => {
    calls.push({ pipe, params })
    if (rowsByPipe === null) return null
    return rowsByPipe[pipe] ?? null
  }
}

test('hygiene /utms — FALLBACK: flag off (pipe null) -> HogQL for all reads, unchanged', async () => {
  const tb = []; const hog = []
  __setHygieneReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog, { missingSource: 25 }) })
  try {
    const res = mockRes()
    await handler(reqWithSite(), res)
    assert.strictEqual(res.body.success, true)
    assert.strictEqual(res.body.data.summary.missing_utm_source, 25, 'HogQL value surfaces')
    // All 5 reads fell back to HogQL (4 wired + the money-rail one).
    assert.deepStrictEqual(hog.sort(), [
      'hygiene_campaigns', 'hygiene_low_activity', 'hygiene_missing_conv',
      'hygiene_missing_source', 'hygiene_referrers'
    ])
    assert.strictEqual(tb.length, 4, 'the 4 wired reads attempted Tinybird first')
  } finally { __resetHygieneReadDeps() }
})

test('hygiene /utms — DISPATCH: flag on -> Tinybird for wired reads, HogQL only for money-rail read', async () => {
  const tb = []; const hog = []
  __setHygieneReadDeps({
    queryTinybird: tbStub(tb, {
      integ_missing_source: [{ cnt: 42 }],
      integ_campaigns: [{ campaign: 'x', cnt: 5 }],
      integ_referrers: [{ referrer: 'r', cnt: 6 }],
      integ_low_activity: [{ day: '2026-07-02', cnt: 1 }]
    }),
    queryHog: hogStub(hog, { missingSource: 7 })
  })
  try {
    const res = mockRes()
    await handler(reqWithSite('site-00'), res)
    assert.strictEqual(res.body.data.summary.missing_utm_source, 42, 'Tinybird value (42), not HogQL (7)')
    // The 4 wired reads bypassed HogQL; ONLY the money-rail read used HogQL.
    assert.deepStrictEqual(hog, ['hygiene_missing_conv'])
    // Tenant isolation: each pipe called with the authenticated site id.
    assert.deepStrictEqual(tb.map(c => c.pipe).sort(), ['integ_campaigns', 'integ_low_activity', 'integ_missing_source', 'integ_referrers'])
    assert.ok(tb.every(c => c.params.site_id === 'site-00'), 'all pipes scoped to authenticated site_id')
  } finally { __resetHygieneReadDeps() }
})

test('hygiene /utms — FAIL-CLOSED: TINYBIRD_FORCE_READ + pipe null -> 500, no silent HogQL bypass', async () => {
  const tb = []; const hog = []
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setHygieneReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog) })
  try {
    const res = mockRes()
    await handler(reqWithSite(), res)
    assert.strictEqual(res.statusCode, 500, 'fails loudly under force-read')
    assert.strictEqual(res.body.success, false)
    assert.strictEqual(hog.length, 0, 'no silent HogQL fallback for the wired reads (threw first)')
  } finally {
    delete process.env.TINYBIRD_FORCE_READ
    __resetHygieneReadDeps()
  }
})

test('hygiene /utms — missing site context -> 500 (graceful, relies on validateSiteKey upstream)', async () => {
  const res = mockRes()
  await handler({}, res)
  assert.strictEqual(res.statusCode, 500)
  assert.strictEqual(res.body.success, false)
})
