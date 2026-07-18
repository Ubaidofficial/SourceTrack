// ai_platforms Tinybird read-cutover — TOKEN-FREE, NO network.
// Exercises the two legs of getAiPlatformAttributionLive via the
// __setAttributionReadDeps seam: (1) conversions named→positional remap yields
// the expected downstream objects; (2) LEG-2 OFFSET paging collects all rows
// across ≥2 pages and stops at a short page; (3) post-D1c-1, a null pipe on
// EITHER leg throws the loud tinybird-force-read invariant (the HogQL fallback
// is gone), never a silent dead-store read.
//
// NOTE: this is a wiring/shape unit test only — real cross-store parity is gated
// on the staging A/B (touch_ab_diff), NOT on this test.
//
// Mock env before the dynamic import so posthog.js's client init doesn't throw.
process.env.POSTHOG_API_KEY = 'mock-posthog-api-key-for-tests'
process.env.POSTHOG_HOST = 'https://mock.posthog.com'
process.env.POSTHOG_PROJECT_ID = '123456'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-posthog-personal-key-for-tests'

import test from 'node:test'
import assert from 'node:assert/strict'

const {
  getAiPlatformAttributionLive,
  __setAttributionReadDeps,
  __resetAttributionReadDeps
} = await import('../lib/attribution-engine.js')

const PAGE = 5000 // must match AI_ATTRIBUTION_PAGEVIEW_PAGE_SIZE

const convData = (over = {}) => ({
  uuid: 'c1', distinct_id: 'v1', timestamp: '2026-06-15T12:00:00Z',
  conversion_type: 'purchase', conversion_value: 100,
  utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'spring',
  referrer: null, ai_source: 'ChatGPT', country: 'US', device_type: 'desktop',
  utm_term: null, provider: 'browser', attribution_status: 'attributed',
  stitching_method: 'browser', ingestion_method: 'server_routed',
  browser_name: 'Chrome', browser: 'Chrome', page_url: '/checkout', ...over
})

const namedPv = (over = {}) => ({
  visitor_id: 'v1', distinct_id: 'v1', timestamp: '2026-06-10T00:00:00Z',
  utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'spring', referrer: null,
  ai_source: '', gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null,
  ttclid: null, li_fat_id: null, li_fatid: null, twclid: null, dclid: null, snapclid: null,
  pclid: null, sccid: null, ko_click_id: null, page_url: '/', utm_term: null, ...over
})

const ARGS = { siteId: 'site-1', dateFrom: '2026-06-01', dateTo: '2026-06-29', groupBy: 'source', metric: 'revenue', attributionWindow: '30' }

test('LEG 1 — conversions named→positional remap: pipe named rows → expected downstream output', async (t) => {
  t.after(__resetAttributionReadDeps)
  const d = convData() // conversion carries ai_source so credit works with zero pageviews

  // conversions via Tinybird (named rows); LEG-2 pageviews pipe serves an empty page
  // (short page → paging stops immediately, no throw). HogQL must never be touched.
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'aiplatform_conversions_by_site' ? [{ ...d }] : [],
    queryHog: async () => { throw new Error('HogQL must not be called when the pipes serve') }
  })
  const runA = await getAiPlatformAttributionLive({ ...ARGS })

  assert.deepEqual(runA, [{ dim_value: 'ChatGPT', revenue: 100, conversions: 1 }],
    'named→positional remap must produce the expected downstream output')
})

test('LEG 2 — OFFSET paging collects all rows across 2 pages and stops at the short page', async (t) => {
  t.after(__resetAttributionReadDeps)
  const d = convData({ ai_source: '' }) // NO conversion-level AI → credit must come from a pageview

  // page 0: PAGE filler non-AI pvs; page 1: one AI pv (most recent) → forces a 2nd page.
  const page0 = Array.from({ length: PAGE }, () => namedPv({ timestamp: '2026-06-10T00:00:00Z' }))
  const page1 = [namedPv({ ai_source: 'Perplexity', timestamp: '2026-06-14T00:00:00Z' })]
  const offsets = []
  __setAttributionReadDeps({
    queryTinybird: async (pipe, params) => {
      if (pipe === 'aiplatform_conversions_by_site') return [{ ...d }]
      if (pipe === 'pageviews_by_visitors') {
        offsets.push(params.page_offset)
        return params.page_offset === 0 ? page0 : params.page_offset === PAGE ? page1 : []
      }
      return null
    },
    queryHog: async () => { throw new Error('HogQL must not be called when both pipes serve') }
  })

  const res = await getAiPlatformAttributionLive({ ...ARGS })
  assert.deepEqual(offsets, [0, PAGE], 'must page offset 0 then 5000, then stop (short page)')
  assert.deepEqual(res, [{ dim_value: 'Perplexity', revenue: 100, conversions: 1 }],
    'credit from the page-2 AI pageview proves page-2 rows were collected (no drop)')
})

test('LEG 1 — conversions pipe null throws the tinybird-force-read invariant, HogQL NOT called', async (t) => {
  t.after(__resetAttributionReadDeps)
  __setAttributionReadDeps({
    queryTinybird: async () => null, // LEG1 conv pipe gated → throw before LEG2 runs
    queryHog: async () => { throw new Error('HogQL must not be called after the pipe returns null') }
  })
  await assert.rejects(
    getAiPlatformAttributionLive({ ...ARGS }),
    /tinybird-force-read.*aiplatform_conversions_by_site returned null/,
    'LEG1 null pipe must throw the loud force-read invariant, not fall back'
  )
})

test('LEG 2 — pageviews pipe null throws the tinybird-force-read invariant, HogQL NOT called', async (t) => {
  t.after(__resetAttributionReadDeps)
  const d = convData({ ai_source: '' }) // no conversion-level AI → LEG2 pageviews are required
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'aiplatform_conversions_by_site' ? [{ ...d }] : null, // LEG2 gated
    queryHog: async () => { throw new Error('HogQL must not be called after the pipe returns null') }
  })
  await assert.rejects(
    getAiPlatformAttributionLive({ ...ARGS }),
    /tinybird-force-read.*pageviews_by_visitors returned null/,
    'LEG2 null pipe must throw the loud force-read invariant, not fall back'
  )
})
