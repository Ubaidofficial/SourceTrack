// multitouch_pageviews_live cutover — the #1 fix. The HogQL pageviews leg is dead (PostHog
// frozen), so pageviewsByVisitor became {} and every conversion fell to the ":no pageviews ->
// 100% Direct" branch: linear/time_decay/u_shaped/w_shaped silently credited 100% Direct in prod.
// Wiring the pipe restores real touchpoints. groupBy='channel' is the founder's acceptance
// dimension — share.channel = channelFromEvent(...), so an AI touchpoint surfaces as 'AI Search'
// (share.source is utm_source-only and would collapse a no-UTM AI touch to 'direct').
//
// ORDER MATTERS: reproduce TODAY'S BUG first (empty pageviews -> 100% Direct). A test that can't
// make it fail is worthless. Then prove the fix (3-touchpoint path -> linear 1/3 each).

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getMultiTouchAttributionLive, __setAttributionReadDeps, __resetAttributionReadDeps } = await import('../lib/attribution-engine.js')

const CALL = { siteId: 'site-mt', model: 'linear', groupBy: 'channel', metric: 'conversions', dateFrom: '2026-07-01', dateTo: '2026-07-06' }

// One normal $90 purchase for visitor v1 (NAMED conversion row = multitouch_conversions_by_site aliases).
const conv = {
  uuid: 'c1', distinct_id: 'v1', timestamp: '2026-07-03T11:00:00Z',
  conversion_type: 'purchase', conversion_value: 90, utm_source: null, utm_medium: null, utm_campaign: null,
  referrer: null, ai_source: null, country: 'US', device_type: 'desktop', utm_term: null,
  provider: 'browser', attribution_status: 'attributed', stitching_method: 'browser', ingestion_method: 'server_routed',
  stripe_subscription_id: null, stripe_event_type: null
}

// NAMED pageview rows exactly as multitouch_pageviews_live.pipe returns them (the seam maps these
// to positional). A known 3-touchpoint path for v1: google (organic) -> chatgpt (AI) -> direct.
const pvNamed = (over) => ({
  distinct_id: 'v1', timestamp: null, utm_source: null, utm_medium: null, utm_campaign: null,
  referrer: null, ai_source: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null,
  ttclid: null, li_fat_id: null, li_fatid: null, twclid: null, dclid: null, snapclid: null, pclid: null,
  sccid: null, ko_click_id: null, page_url: null, utm_term: null, ...over
})
const THREE_TOUCH = [
  pvNamed({ timestamp: '2026-07-03T08:00:00Z', utm_source: 'google', utm_medium: 'organic', page_url: 'https://x/a' }), // Organic Search
  pvNamed({ timestamp: '2026-07-03T09:00:00Z', ai_source: 'chatgpt', page_url: 'https://x/b' }),                        // AI Search
  pvNamed({ timestamp: '2026-07-03T10:00:00Z', page_url: 'https://x/c' }),                                              // Direct
]

const arr = (r) => Array.isArray(r) ? r : r.results
const byDim = (res) => Object.fromEntries(arr(res).map(r => [r.dim_value, Number(r.conversions)]))
const THIRD = 1 / 3

// ── 1. REPRODUCE TODAY'S BUG FIRST — if the harness can't make it fail, it can't certify a fix ──
test('(bug-repro) empty pageviews -> conversion collapses to 100% Direct (the dead-HogQL prod bug)', async () => {
  const served = []
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => { served.push(pipe); return pipe === 'multitouch_conversions_by_site' ? [conv] : (pipe === 'multitouch_pageviews_live' ? [] : null) },
    queryHog: async () => [],  // HogQL dead -> pageviews empty on both legs
  })
  let res
  try { res = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }
  assert.ok(served.includes('multitouch_pageviews_live'), 'pageviews pipe WAS read (input path exercised)')
  const dims = byDim(res)
  assert.deepStrictEqual(Object.keys(dims), ['Direct'], 'only Direct — the fabricated single-source breakdown')
  assert.ok(Math.abs(dims.Direct - 1) < 0.001, `Direct = 100% (got ${dims.Direct}) — TODAY'S BUG reproduced`)
})

// ── 2. THE FIX — 3 real touchpoints -> linear gives 1/3 to EACH channel ──
test('(fix) 3-touchpoint path -> linear = 1/3 each; Direct is NOT 100%, AI Search is NOT 0', async () => {
  const served = []
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => { served.push(pipe); return pipe === 'multitouch_conversions_by_site' ? [conv] : (pipe === 'multitouch_pageviews_live' ? THREE_TOUCH : null) },
    queryHog: async (_s, name) => { throw new Error(`HogQL called (${name}) — the pipe must serve; a fallback here would be the dead-store bug`) },
  })
  // INPUT ASSERTION (never verify by absence): prove the pageviews are actually fed, non-empty.
  assert.strictEqual(THREE_TOUCH.length, 3, 'seeded exactly 3 touchpoints')
  assert.ok(THREE_TOUCH.every(p => p.distinct_id === conv.distinct_id), 'touchpoints belong to the converting visitor')
  let res
  try { res = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }
  assert.ok(served.includes('multitouch_pageviews_live'), 'pageviews came from the pipe, not dead HogQL')
  const dims = byDim(res)
  // Founder's acceptance: a plausible multi-source split; Direct NOT 100%; AI Search NOT 0.
  assert.strictEqual(Object.keys(dims).length, 3, `3-way split across the 3 touchpoints (got ${JSON.stringify(dims)})`)
  for (const [ch, v] of Object.entries(dims)) assert.ok(Math.abs(v - THIRD) < 0.01, `${ch} = 1/3 (got ${v})`)
  assert.ok(Math.max(...Object.values(dims)) < 0.9, 'no channel is 100% — the fabricated single-source breakdown is gone')
  assert.ok(dims['AI Search'] > 0, 'AI Search is NOT 0 (the AI touchpoint got real credit)')
  assert.ok(dims['Direct'] > 0 && dims['Direct'] < 0.9, 'Direct is present but NOT 100%')
})

// ── 3. DISPATCH: named pipe rows == positional HogQL rows -> byte-identical (the field-name trap) ──
test('(parity) named pipe pageviews == positional HogQL pageviews -> identical result', async () => {
  const COLS = ['distinct_id', 'timestamp', 'utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'ai_source', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id', 'li_fatid', 'twclid', 'dclid', 'snapclid', 'pclid', 'sccid', 'ko_click_id', 'page_url', 'utm_term']
  const toPos = (named) => COLS.map(k => named[k])
  // pipe leg
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'multitouch_conversions_by_site' ? [conv] : (pipe === 'multitouch_pageviews_live' ? THREE_TOUCH : null),
    queryHog: async () => { throw new Error('no hog on the pipe leg') },
  })
  let pipeRes; try { pipeRes = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }
  // HogQL leg (pipe null -> positional pageviews via HogQL)
  __setAttributionReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_s, name) => name === 'multitouch_conversions_live' ? [] : name === 'multitouch_pageviews_live' ? THREE_TOUCH.map(toPos) : [],
  })
  // conversions must come from somewhere on the HogQL leg — serve them positionally too
  __resetAttributionReadDeps()
  const CONV_COLS = ['uuid', 'distinct_id', 'timestamp', 'conversion_type', 'conversion_value', 'utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'ai_source', 'country', 'device_type', 'utm_term', 'provider', 'attribution_status', 'stitching_method', 'ingestion_method', 'stripe_subscription_id', 'stripe_event_type']
  __setAttributionReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_s, name) => name === 'multitouch_conversions_live' ? [CONV_COLS.map(k => conv[k])] : name === 'multitouch_pageviews_live' ? THREE_TOUCH.map(toPos) : [],
  })
  let hogRes; try { hogRes = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }
  assert.deepStrictEqual(arr(pipeRes), arr(hogRes), 'pipe named-row remap == HogQL positional -> identical')
})

// ── 4. FAIL-CLOSED: FORCE_READ + pipe null -> throws (no silent dead-HogQL bypass) ──
test('(fail-closed) TINYBIRD_FORCE_READ + pageviews pipe null -> throws', async (t) => {
  process.env.TINYBIRD_FORCE_READ = 'true'
  t.after(() => { delete process.env.TINYBIRD_FORCE_READ; __resetAttributionReadDeps() })
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'multitouch_conversions_by_site' ? [conv] : null, // pageviews pipe -> null
    queryHog: async () => { throw new Error('should not reach HogQL under force-read') },
  })
  await assert.rejects(getMultiTouchAttributionLive(CALL), /tinybird-force-read.*multitouch_pageviews_live/)
})
