// Grade A2 — fail-closed dispatch proof for api/lib/attribution-engine.js.
// Mirrors api/tests/sessions-read-cutover.test.js. For EACH of the 15 pipes across the
// 11 dispatch sites, assert BOTH:
//   (a) pipe returns rows -> result served from the pipe, HogQL NOT called (load-bearing:
//       the HogQL stub THROWS, so the test fails if any wired read falls back to HogQL).
//   (b) TINYBIRD_FORCE_READ + null -> the read THROWS (dispatch path was actually
//       exercised — proven positively, never by absence of a fallback warning).
// TOKEN-FREE, NO network (reads are dependency-injected via __setAttributionReadDeps).

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'

const {
  __setAttributionReadDeps, __resetAttributionReadDeps,
  firstTouchAttribution, lastTouchAttribution, firstTouchNonDirectAttribution, lastTouchNonDirectAttribution,
  getAiPlatformAttributionLive, getSessionReport, getAttributionExplanation, getMultiTouchAttributionLive,
  getFlexibleReport
} = await import('../lib/attribution-engine.js')

const FROM = '2026-07-01'
const TO = '2026-07-02'

// Load-bearing: (a) FAILS if any wired read reaches HogQL.
const HOG_THROW = async (_sql, name) => { throw new Error(`HogQL called (${name}) — the wired pipe was NOT served`) }
// Records which pipes were attempted; serves rowsByPipe (null otherwise).
const tbServe = (calls, rowsByPipe) => async (pipe) => { calls.push(pipe); return (rowsByPipe && pipe in rowsByPipe) ? rowsByPipe[pipe] : null }
const forceReadCleanup = () => { delete process.env.TINYBIRD_FORCE_READ; __resetAttributionReadDeps() }

// ── 1. Four single-pipe touch reads (if-block dispatch) ──────────────────────
for (const [fn, pipe] of [
  [firstTouchAttribution, 'first_touch_by_site'],
  [lastTouchAttribution, 'last_touch_by_site_agg'],
  [firstTouchNonDirectAttribution, 'first_touch_non_direct_by_site'],
  [lastTouchNonDirectAttribution, 'last_touch_non_direct_by_site']
]) {
  test(`${pipe} (a) served from pipe, HogQL NOT called`, async (t) => {
    t.after(__resetAttributionReadDeps)
    const calls = []
    __setAttributionReadDeps({ queryTinybird: tbServe(calls, { [pipe]: [{ source: 'google', medium: 'cpc', campaign: 'c', conversions: 1, revenue: 10 }] }), queryHog: HOG_THROW })
    const out = await fn(`site-${pipe}`, FROM, TO)
    assert.ok(out, 'returned a result')
    assert.deepEqual(calls, [pipe], 'the pipe was queried (and HogQL never — HOG_THROW would have fired)')
  })
  test(`${pipe} (b) FORCE_READ + null -> throws`, async (t) => {
    t.after(forceReadCleanup)
    process.env.TINYBIRD_FORCE_READ = 'true'
    __setAttributionReadDeps({ queryTinybird: async () => null, queryHog: HOG_THROW })
    await assert.rejects(fn(`site-${pipe}-fc`, FROM, TO), new RegExp(`tinybird-force-read.*${pipe}`))
  })
}

// ── 2. getAiPlatformAttributionLive: aiplatform_conversions_by_site + pageviews_by_visitors
const AICONV = { uuid: 'u1', distinct_id: 'v1', timestamp: '2026-07-01T12:00:00Z', conversion_type: 'purchase', conversion_value: 10, utm_source: 'stripe', utm_medium: 'webhook', utm_campaign: null, referrer: null, ai_source: null, country: 'US', device_type: 'desktop', utm_term: null, provider: 'stripe', attribution_status: 'attributed', stitching_method: 'browser', ingestion_method: 'webhook_stripe', browser_name: 'Chrome', browser: 'Chrome', page_url: '/' }
const AIPV = { distinct_id: 'v1', timestamp: '2026-07-01T09:00:00Z', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'c', referrer: null, ai_source: 'ChatGPT', gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null, ttclid: null, li_fat_id: null, li_fatid: null, twclid: null, dclid: null, snapclid: null, pclid: null, sccid: null, ko_click_id: null, page_url: '/', utm_term: null }

test('aiplatform_conversions_by_site + pageviews_by_visitors (a) BOTH served, HogQL NOT called', async (t) => {
  t.after(__resetAttributionReadDeps)
  const calls = []
  __setAttributionReadDeps({ queryTinybird: tbServe(calls, { aiplatform_conversions_by_site: [AICONV], pageviews_by_visitors: [AIPV] }), queryHog: HOG_THROW })
  const out = await getAiPlatformAttributionLive({ siteId: 'site-ai', dateFrom: FROM, dateTo: TO })
  assert.ok(out, 'returned a result — HogQL (HOG_THROW) never called')
  assert.ok(calls.includes('aiplatform_conversions_by_site'), '(a) aiplatform_conversions_by_site served')
  assert.ok(calls.includes('pageviews_by_visitors'), '(a) pageviews_by_visitors served')
})
test('aiplatform_conversions_by_site (b) FORCE_READ + null -> throws', async (t) => {
  t.after(forceReadCleanup)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setAttributionReadDeps({ queryTinybird: async () => null, queryHog: HOG_THROW })
  await assert.rejects(getAiPlatformAttributionLive({ siteId: 'site-ai-fc', dateFrom: FROM, dateTo: TO }), /tinybird-force-read.*aiplatform_conversions_by_site/)
})
test('pageviews_by_visitors (b) FORCE_READ + null (conversions served) -> throws', async (t) => {
  t.after(forceReadCleanup)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setAttributionReadDeps({ queryTinybird: async (pipe) => pipe === 'aiplatform_conversions_by_site' ? [AICONV] : null, queryHog: HOG_THROW })
  await assert.rejects(getAiPlatformAttributionLive({ siteId: 'site-pv-fc', dateFrom: FROM, dateTo: TO }), /tinybird-force-read.*pageviews_by_visitors/)
})

// ── 3. getSessionReport: session_report_pageviews + session_report_conversions ──
const SPV = { distinct_id: 'v1', timestamp: '2026-07-01T10:00:00Z', page_url: '/x', utm_source: 'g', utm_medium: 'cpc', utm_campaign: 'c', country: 'US', device_type: 'desktop' }
const SCONV = { distinct_id: 'v1', timestamp: '2026-07-01T11:00:00Z' }

test('session_report_pageviews + session_report_conversions (a) BOTH served, HogQL NOT called', async (t) => {
  t.after(__resetAttributionReadDeps)
  const calls = []
  __setAttributionReadDeps({ queryTinybird: tbServe(calls, { session_report_pageviews: [SPV], session_report_conversions: [SCONV] }), queryHog: HOG_THROW })
  const out = await getSessionReport('site-sess', FROM, TO, 'source', 'conversions')
  assert.ok(out, 'returned a result — HogQL never called')
  assert.ok(calls.includes('session_report_pageviews'), '(a) session_report_pageviews served')
  assert.ok(calls.includes('session_report_conversions'), '(a) session_report_conversions served')
})
test('session_report_pageviews (b) FORCE_READ + null -> throws', async (t) => {
  t.after(forceReadCleanup)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setAttributionReadDeps({ queryTinybird: async () => null, queryHog: HOG_THROW })
  await assert.rejects(getSessionReport('site-sess-pv-fc', FROM, TO, 'source', 'conversions'), /tinybird-force-read.*session_report_pageviews/)
})
test('session_report_conversions (b) FORCE_READ + null (pageviews served) -> throws', async (t) => {
  t.after(forceReadCleanup)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setAttributionReadDeps({ queryTinybird: async (pipe) => pipe === 'session_report_pageviews' ? [SPV] : null, queryHog: HOG_THROW })
  await assert.rejects(getSessionReport('site-sess-cv-fc', FROM, TO, 'source', 'conversions'), /tinybird-force-read.*session_report_conversions/)
})

// ── 4. getAttributionExplanation: attribution_explain_conversion (journey stays HogQL) ─
const XCONV = { timestamp: '2026-07-01T10:00:00Z', conversion_value: 10, utm_source: 'g', utm_medium: 'cpc', utm_campaign: 'c', first_touch_source: 'g', first_touch_medium: 'cpc', first_touch_campaign: 'c', ai_source: null, page_url: '/', user_id: null, anonymous_id: 'v1', ingestion_method: 'server_routed' }

test('attribution_explain_conversion (a) served from pipe (journey stays HogQL), NOT from HogQL', async (t) => {
  t.after(__resetAttributionReadDeps)
  const calls = []; const hog = []
  __setAttributionReadDeps({
    queryTinybird: tbServe(calls, { attribution_explain_conversion: [XCONV] }),
    queryHog: async (_sql, name) => { hog.push(name); return [] } // journey (attribution_explain_journey) is legitimately HogQL
  })
  await getAttributionExplanation('site-x', 'first_touch', 'v1')
  assert.ok(calls.includes('attribution_explain_conversion'), 'the pipe was queried')
  assert.ok(!hog.includes('attribution_explain_conversion'), '(a) conversion NOT served from HogQL — the pipe served it')
})
test('attribution_explain_conversion (b) FORCE_READ + null -> throws', async (t) => {
  t.after(forceReadCleanup)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setAttributionReadDeps({ queryTinybird: async () => null, queryHog: async () => [] })
  await assert.rejects(getAttributionExplanation('site-x-fc', 'first_touch', 'v1'), /tinybird-force-read.*attribution_explain_conversion/)
})

// ── 5. getMultiTouchAttributionLive: multitouch_conversions_by_site (pageviews stay HogQL) ─
const MTCONV = { uuid: 'u1', distinct_id: 'v1', timestamp: '2026-07-01T12:00:00Z', conversion_type: 'purchase', conversion_value: 10, utm_source: 'g', utm_medium: 'cpc', utm_campaign: 'c', referrer: null, ai_source: null, country: 'US', device_type: 'desktop', utm_term: null, provider: 'stripe', attribution_status: 'attributed', stitching_method: 'browser', ingestion_method: 'webhook_stripe', stripe_subscription_id: null, stripe_event_type: 'checkout.session.completed' }

test('multitouch_conversions_by_site (a) served from pipe (pageviews stay HogQL), NOT from HogQL', async (t) => {
  t.after(__resetAttributionReadDeps)
  const calls = []; const hog = []
  __setAttributionReadDeps({
    queryTinybird: tbServe(calls, { multitouch_conversions_by_site: [MTCONV] }),
    queryHog: async (_sql, name) => { hog.push(name); return [] } // multitouch_pageviews_live is legitimately HogQL
  })
  await getMultiTouchAttributionLive({ siteId: 'site-mt', model: 'linear', groupBy: 'source', dateFrom: FROM, dateTo: TO })
  assert.ok(calls.includes('multitouch_conversions_by_site'), 'the pipe was queried')
  assert.ok(!hog.includes('multitouch_conversions_live'), '(a) conversions NOT served from HogQL — the pipe served them')
})
test('multitouch_conversions_by_site (b) FORCE_READ + null -> throws', async (t) => {
  t.after(forceReadCleanup)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setAttributionReadDeps({ queryTinybird: async () => null, queryHog: async () => [] })
  await assert.rejects(getMultiTouchAttributionLive({ siteId: 'site-mt-fc', model: 'linear', groupBy: 'source', dateFrom: FROM, dateTo: TO }), /tinybird-force-read.*multitouch_conversions_by_site/)
})

// ── 6. getFlexibleReport: the 5 flexible_report_* pipes (L2852 _flexPipe dispatch) ──
// Each (model, groupBy) resolves _flexPipe to exactly one pipe; distinct siteId per case
// sidesteps the report cache. attributionWindow=null so _flexPipeCommon holds.
const FLEX = [
  ['flexible_report_main_by_site', 'first_touch', 'source'],
  ['flexible_report_provider_by_site', 'last_touch', 'provider'],
  ['flexible_report_attribution_status_by_site', 'last_touch', 'attribution_status'],
  ['flexible_report_stitching_method_by_site', 'last_touch', 'stitching_method'],
  ['flexible_report_conversion_type_by_site', 'last_touch', 'conversion_type']
]
const flexArgs = (site, model, groupBy) => [site, model, FROM, TO, groupBy, 'conversions', {}, null, 'day', null, 'conversion_date']
for (const [pipe, model, groupBy] of FLEX) {
  test(`${pipe} (a) served from pipe, HogQL NOT called`, async (t) => {
    t.after(__resetAttributionReadDeps)
    const calls = []
    __setAttributionReadDeps({ queryTinybird: tbServe(calls, { [pipe]: [{ dim_value: 'x', metric_value: 5 }] }), queryHog: HOG_THROW })
    const out = await getFlexibleReport(...flexArgs(`site-${pipe}`, model, groupBy))
    assert.ok(out, 'returned a result — HogQL never called')
    assert.deepEqual(calls, [pipe], `_flexPipe resolved to ${pipe} and it served (no HogQL)`)
  })
  test(`${pipe} (b) FORCE_READ + null -> throws`, async (t) => {
    t.after(forceReadCleanup)
    process.env.TINYBIRD_FORCE_READ = 'true'
    __setAttributionReadDeps({ queryTinybird: async () => null, queryHog: HOG_THROW })
    await assert.rejects(getFlexibleReport(...flexArgs(`site-${pipe}-fc`, model, groupBy)), new RegExp(`tinybird-force-read.*${pipe}`))
  })
}
