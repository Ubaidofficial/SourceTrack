// Touch-model Tinybird read-cutover — TOKEN-FREE, NO network.
// Verifies the 4 touch-model functions try their Phase-9-green aggregate pipe
// first and fall back to HogQL on null, via the __setAttributionReadDeps seam.
// Pins the function→pipe mapping (esp. lastTouch → last_touch_by_site_agg, the
// aggregate pipe, NOT the row-level last_touch_by_site).
//
// Mock env before the (dynamic) import so posthog.js's client init doesn't throw
// — same convention as api/tests/attribution.test.js.
process.env.POSTHOG_API_KEY = 'mock-posthog-api-key-for-tests'
process.env.POSTHOG_HOST = 'https://mock.posthog.com'
process.env.POSTHOG_PROJECT_ID = '123456'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-posthog-personal-key-for-tests'

import test from 'node:test'
import assert from 'node:assert/strict'

const {
  firstTouchAttribution,
  lastTouchAttribution,
  firstTouchNonDirectAttribution,
  lastTouchNonDirectAttribution,
  __setAttributionReadDeps,
  __resetAttributionReadDeps
} = await import('../lib/attribution-engine.js')

const CASES = [
  { fn: firstTouchAttribution,          pipe: 'first_touch_by_site' },
  { fn: lastTouchAttribution,           pipe: 'last_touch_by_site_agg' },
  { fn: firstTouchNonDirectAttribution, pipe: 'first_touch_non_direct_by_site' },
  { fn: lastTouchNonDirectAttribution,  pipe: 'last_touch_non_direct_by_site' }
]

const DATE_FROM = '2026-06-01'
const DATE_TO = '2026-06-28'

// Named-object rows exactly as queryTinybirdPipe returns them.
const PIPE_ROWS = [
  { source: 'google', medium: 'cpc',  campaign: '',      conversions: '3', revenue: '150.5' },
  { source: 'direct', medium: 'none', campaign: 'brand', conversions: 2,   revenue: 0 }
]
const PIPE_EXPECTED = [
  { source: 'google', medium: 'cpc',  campaign: null,    conversions: 3, revenue: 150.5 },
  { source: 'direct', medium: 'none', campaign: 'brand', conversions: 2, revenue: 0 }
]

// Positional rows exactly as queryHogQL returns them.
const HOGQL_ROWS = [['bing', 'organic', 'q1', 4, 12.0]]
const HOGQL_EXPECTED = [{ source: 'bing', medium: 'organic', campaign: 'q1', conversions: 4, revenue: 12 }]

for (const { fn, pipe } of CASES) {
  test(`${fn.name} — PIPE HIT: serves ${pipe}, maps named rows, does NOT call HogQL`, async (t) => {
    t.after(__resetAttributionReadDeps)
    let hogCalled = false
    let requestedPipe = null
    __setAttributionReadDeps({
      queryTinybird: async (pipeName) => { requestedPipe = pipeName; return PIPE_ROWS },
      queryHog: async () => { hogCalled = true; return [] }
    })

    const result = await fn('site-123', DATE_FROM, DATE_TO)
    assert.equal(requestedPipe, pipe, `must request the '${pipe}' pipe`)
    assert.deepEqual(result, PIPE_EXPECTED)
    assert.equal(hogCalled, false, 'HogQL must NOT be called on a pipe hit')
  })

  test(`${fn.name} — FALLBACK: pipe null → HogQL is called and its rows are returned`, async (t) => {
    t.after(__resetAttributionReadDeps)
    let hogCalled = false
    __setAttributionReadDeps({
      queryTinybird: async () => null,
      queryHog: async () => { hogCalled = true; return HOGQL_ROWS }
    })

    const result = await fn('site-123', DATE_FROM, DATE_TO)
    assert.equal(hogCalled, true, 'HogQL MUST be called when the pipe returns null')
    assert.deepEqual(result, HOGQL_EXPECTED)
  })
}
