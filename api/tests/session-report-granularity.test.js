// getSessionReport granularity — Tier 2 of the date-bucket fix (Tier 1 = #406, the two live
// conversion readers). TOKEN-FREE, NO network, no DB (pipe reads via __setAttributionReadDeps).
//
// THE BUG: getSessionReport had NO granularity parameter at all and bucketed with
// `sess.started_at.split('T')[0]` — always DAILY. So a week/month/quarter/year session report was
// accepted and answered with daily buckets labelled as the requested granularity (§6
// confident-wrong-bucket). Worse reach than Tier 1: granularity is not an axis in
// servedReportShape/gatedReportReason, so `session_count × date` is SERVED on ALL NINE models, and
// ReportBuilder offers all five granularity buttons whenever the dim is `date`.
//
// THE TRAP THIS FILE EXISTS FOR: the cache key omitted granularity, and it was built as TWO
// hand-written string templates (read path + __evictSessionReportCache) that had to stay
// byte-identical. Adding the parameter WITHOUT fixing the key would let a daily and a monthly
// report share one slot for the 60s TTL — the fix would introduce a new silent-wrong-answer while
// removing one. `sessionCacheKey()` is now the single builder; these tests prove it discriminates
// AND that both consumers agree on it.
//
// Asserted here:
//   PART 1  day and month return DISTINCT results with NO eviction between them (no collision)
//   PART 2  all five granularities are distinct cache entries
//   PART 3  the evict seam and the read path share the key — evict(month) drops the month entry
//           and leaves the day entry intact (a drifted seam would silently no-op)
//   PART 4  day output is UNCHANGED vs the pre-fix .split('T')[0] bucket
//   PART 5  granularity reaches getSessionReport from getFlexibleReport (the threading)

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  getSessionReport, getFlexibleReport, __dateBucket,
  __setAttributionReadDeps, __resetAttributionReadDeps,
  __evictSessionReportCache, __evictFlexibleReportCache
} = await import('../lib/attribution-engine.js')

const SITE = 'site-sess-gran'
const FROM = '2026-07-01'
const TO = '2026-08-31'

// Two visitors in DIFFERENT months, so day/week/month buckets are all distinguishable while
// quarter/year fold both into one bucket. Timestamps are ISO-UTC with an explicit Z — the exact
// shape #155's normalizePipeTimestamp guarantees at the pipe boundary, which is what makes
// `new Date(started_at)` safe in the dim mapper.
const PV = [
  { distinct_id: 'v1', timestamp: '2026-07-05T10:00:00.000Z', page_url: '/a', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'c', country: 'US', device_type: 'desktop' },
  { distinct_id: 'v2', timestamp: '2026-08-12T10:00:00.000Z', page_url: '/b', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'c', country: 'US', device_type: 'desktop' }
]
const CONV = []

const DEPS = {
  queryTinybird: async (pipe) =>
    pipe === 'session_report_pageviews' ? PV : pipe === 'session_report_conversions' ? CONV : null,
  queryHog: async () => { throw new Error('HogQL must not be called — the pipe path serves this') }
}

const ARGS = ['date', 'session_count', {}, null]   // groupBy, metric, filters, groupBy2
const GRANS = ['day', 'week', 'month', 'quarter', 'year']

const labelsOf = (res) => (Array.isArray(res) ? res : res.results).map(r => r.dim_value).sort()

// Evict EVERY granularity so a previous test in this file cannot leak a cache hit into the next.
function evictAll () {
  for (const g of GRANS) __evictSessionReportCache(SITE, FROM, TO, ...ARGS, g)
}

async function report (granularity) {
  return getSessionReport(SITE, FROM, TO, ...ARGS, granularity)
}

// ── PART 1 — THE NON-NEGOTIABLE ONE ─────────────────────────────────────────────────────
// Deliberately NO eviction between the two calls. That is the whole point: if granularity were
// absent from the cache key, the monthly call would hit the daily entry inside the 60s TTL and
// return daily buckets. This test fails LOUDLY on that regression.
test('🔴 PART 1: day then month, NO eviction between — distinct results (no cache collision)', async () => {
  evictAll()
  __setAttributionReadDeps(DEPS)
  try {
    const day = labelsOf(await report('day'))
    const month = labelsOf(await report('month'))   // <-- must NOT come from the daily cache entry

    assert.deepEqual(day, ['2026-07-05', '2026-08-12'], 'daily buckets')
    assert.deepEqual(month, ['2026-07', '2026-08'], 'monthly buckets — NOT the cached daily result')
    assert.notDeepEqual(day, month, 'a shared cache slot would have returned the daily labels twice')
  } finally { __resetAttributionReadDeps() }
})

test('🔴 PART 2: all five granularities are distinct cache entries, in any order', async () => {
  evictAll()
  __setAttributionReadDeps(DEPS)
  try {
    // Reverse order on purpose: whichever runs first must not poison the rest.
    const got = {}
    for (const g of [...GRANS].reverse()) got[g] = labelsOf(await report(g))

    assert.deepEqual(got.day, ['2026-07-05', '2026-08-12'])
    assert.deepEqual(got.month, ['2026-07', '2026-08'])
    assert.deepEqual(got.quarter, ['2026-Q3'], 'both sessions fold into one quarter')
    assert.deepEqual(got.year, ['2026'], 'both sessions fold into one year')
    // Week labels derived from the REAL helper, not re-typed weekday arithmetic.
    assert.deepEqual(got.week, [
      __dateBucket(new Date(PV[0].timestamp), 'week'),
      __dateBucket(new Date(PV[1].timestamp), 'week')
    ].sort(), 'weekly buckets are Monday-anchored (dateBucket)')

    // Distinctness across the five, judged on the label sets themselves.
    const serialized = GRANS.map(g => JSON.stringify(got[g]))
    assert.equal(new Set(serialized).size, 5, `all five must differ — got ${serialized.join(' | ')}`)
  } finally { __resetAttributionReadDeps() }
})

// ── PART 3 — the two-hand-synced-strings risk this PR removes ────────────────────────────
test('🔴 PART 3: evict seam and read path share the key (evict(month) spares the day entry)', async () => {
  evictAll()
  __setAttributionReadDeps(DEPS)
  try {
    const day1 = labelsOf(await report('day'))
    const month1 = labelsOf(await report('month'))
    assert.deepEqual(day1, ['2026-07-05', '2026-08-12'])
    assert.deepEqual(month1, ['2026-07', '2026-08'])

    // Now change the underlying data. Both granularities are cached, so neither should move yet.
    const PV2 = [{ ...PV[0], distinct_id: 'v9', timestamp: '2026-07-06T10:00:00.000Z' }]
    __setAttributionReadDeps({
      queryTinybird: async (pipe) =>
        pipe === 'session_report_pageviews' ? PV2 : pipe === 'session_report_conversions' ? CONV : null,
      queryHog: async () => { throw new Error('HogQL must not be called') }
    })
    assert.deepEqual(labelsOf(await report('day')), day1, 'still cached')
    assert.deepEqual(labelsOf(await report('month')), month1, 'still cached')

    // Evict ONLY the month entry. If the seam built a different key shape than the read path, this
    // would silently no-op and the month result below would stay stale — the drift this catches.
    __evictSessionReportCache(SITE, FROM, TO, ...ARGS, 'month')

    assert.deepEqual(labelsOf(await report('month')), ['2026-07'],
      'month RECOMPUTED from the new data — the seam hit the same key the read path wrote')
    assert.deepEqual(labelsOf(await report('day')), day1,
      'day entry untouched — evicting one granularity must not clear another')
  } finally { __resetAttributionReadDeps() }
})

// ── PART 4 — no silent re-bucketing of the granularity that already worked ───────────────
test('🔴 PART 4: day output is unchanged vs the pre-fix started_at.split("T")[0]', async () => {
  evictAll()
  __setAttributionReadDeps(DEPS)
  try {
    const day = labelsOf(await report('day'))
    // The exact expression the fix replaced, re-typed HERE on purpose as the pin.
    const preFix = PV.map(p => p.timestamp.split('T')[0]).sort()
    assert.deepEqual(day, preFix, 'daily buckets must be byte-identical to the old expression')
  } finally { __resetAttributionReadDeps() }
})

// Default must stay 'day' so the ~6 existing positional callers that pass no granularity
// (attribution-engine-read-cutover, session-report-dims, session-report-read-cutover) are unaffected.
test('🔴 PART 4b: omitting granularity still yields daily buckets (back-compatible default)', async () => {
  evictAll()
  __setAttributionReadDeps(DEPS)
  try {
    const omitted = labelsOf(await getSessionReport(SITE, FROM, TO, ...ARGS))
    assert.deepEqual(omitted, ['2026-07-05', '2026-08-12'])
  } finally { __resetAttributionReadDeps() }
})

// ── PART 5 — the threading. granularity must survive the getFlexibleReport hop ───────────
// A session metric enters through getFlexibleReport (its metric switch delegates), which is where
// the argument was previously dropped on the floor.
test('🔴 PART 5: granularity threads through getFlexibleReport -> getSessionReport', async () => {
  evictAll()
  const flexArgs = (g) => ['date', 'session_count', {}, null, g, null, 'conversion_date']
  for (const g of ['month', 'day']) __evictFlexibleReportCache(SITE, 'last_touch', FROM, TO, ...flexArgs(g))
  __setAttributionReadDeps(DEPS)
  try {
    const viaFlexMonth = labelsOf(await getFlexibleReport(SITE, 'last_touch', FROM, TO, ...flexArgs('month')))
    assert.deepEqual(viaFlexMonth, ['2026-07', '2026-08'],
      'getFlexibleReport must forward granularity — it previously called getSessionReport without it')
  } finally { __resetAttributionReadDeps() }
})
