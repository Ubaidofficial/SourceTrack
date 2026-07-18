// Phase-1 read-cutover Wave-2 — hygiene.js (/utms) dispatch/fallback tests.
// Same contract as live-read-cutover.test.js: fallback (flag off = HogQL,
// unchanged), dispatch (flag on = Tinybird, HogQL not called), fail-closed
// (TINYBIRD_FORCE_READ + null = 500), and the missing-site guard. All 5 reads
// are now wired Tinybird-primary + HogQL fallback, including the money-rail read
// (hygiene_missing_conv -> integ_missing_conv pipe). The wiring is INERT until
// the pipe is allowlisted; money-rail, so it also needs staging parity first.

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

test('hygiene /utms — D1b: pipe null -> 500 (HogQL fallback DELETED)', async () => {
  const tb = []
  __setHygieneReadDeps({ queryTinybird: tbStub(tb, null), queryHog: async () => { throw new Error('HogQL called — D1b deleted the fallback') } })
  try {
    const res = mockRes()
    await handler(reqWithSite(), res)
    assert.strictEqual(res.statusCode, 500, 'a null pipe 500s loud instead of serving HogQL dead-store zeros')
    assert.ok(tb.length >= 1, 'a read attempted Tinybird first')
  } finally { __resetHygieneReadDeps() }
})

test('hygiene /utms — DISPATCH: flag on -> Tinybird for all 5 reads (incl. money-rail), HogQL bypassed', async () => {
  const tb = []; const hog = []
  __setHygieneReadDeps({
    queryTinybird: tbStub(tb, {
      integ_missing_source: [{ cnt: 42 }],
      integ_campaigns: [{ campaign: 'x', cnt: 5 }],
      integ_referrers: [{ referrer: 'r', cnt: 6 }],
      integ_low_activity: [{ day: '2026-07-02', cnt: 1 }],
      integ_missing_conv: [{ cnt: 8 }] // money-rail pipe served from Tinybird
    }),
    queryHog: hogStub(hog, { missingSource: 7 })
  })
  try {
    const res = mockRes()
    await handler(reqWithSite('site-00'), res)
    assert.strictEqual(res.body.data.summary.missing_utm_source, 42, 'Tinybird value (42), not HogQL (7)')
    assert.strictEqual(res.body.data.summary.missing_conversion_value, 8, 'money-rail Tinybird value (8), not HogQL (3)')
    // All 5 reads bypassed HogQL — none used the fallback.
    assert.strictEqual(hog.length, 0, 'HogQL fully bypassed when all pipes serve')
    // Tenant isolation: each pipe called with the authenticated site id.
    assert.deepStrictEqual(tb.map(c => c.pipe).sort(), ['integ_campaigns', 'integ_low_activity', 'integ_missing_conv', 'integ_missing_source', 'integ_referrers'])
    assert.ok(tb.every(c => c.params.site_id === 'site-00'), 'all pipes scoped to authenticated site_id')
  } finally { __resetHygieneReadDeps() }
})

test('hygiene /utms — D1b MONEY-RAIL: integ_missing_conv null -> 500 (no silent HogQL fallback for the money-rail read)', async () => {
  const tb = []
  __setHygieneReadDeps({
    queryTinybird: tbStub(tb, {
      integ_missing_source: [{ cnt: 42 }],
      integ_campaigns: [{ campaign: 'x', cnt: 5 }],
      integ_referrers: [{ referrer: 'r', cnt: 6 }],
      integ_low_activity: [{ day: '2026-07-02', cnt: 1 }]
      // integ_missing_conv omitted -> null -> throws (HogQL fallback DELETED)
    }),
    queryHog: async () => { throw new Error('HogQL called — D1b deleted the fallback') }
  })
  try {
    const res = mockRes()
    await handler(reqWithSite('site-00'), res)
    assert.strictEqual(res.statusCode, 500, 'the money-rail read null 500s loud instead of a silent HogQL dead-store fallback')
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
