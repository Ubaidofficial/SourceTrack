// ROUTE-ARGS MATRIX — the enforced CI gate for the "harness target omits a route-injected arg" bug
// class. THREE prod strikes came from a callFn target testing ONE point of the route's arg space
// while the route varies it: (1) the console.debug channel, (2) the ALWAYS-injected attribution_window
// (→ pipe=NONE → the live 504), (3) session-report ignoring filter_* (→ wrong numbers). Each was
// invisible until instrumented at runtime.
//
// This test enumerates the route's real arg space for the flexible pipe-dispatch —
//   {unfiltered | filtered} × {no-window | windowed} × {UTC | non-UTC} —
// building args the way the ROUTE does (buildRouteArgs), and asserts EXACTLY which pipe dispatches
// (or NONE). A pipe whose gate mis-handles an arg dimension FAILS here, in CI, not in prod.
// When a new conversion-property pipe is wired, add its rows — the matrix is the contract.
// D1: the HogQL fallback is gone — a no-pipe shape THROWS the [pr4/D1] pipe-only invariant instead of
// reading HogQL. dispatchedPipe() catches that invariant and reports it as the NONE (no-dispatch) outcome.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getFlexibleReport, __setAttributionReadDeps, __resetAttributionReadDeps, __evictFlexibleReportCache } =
  await import('../lib/attribution-engine.js')
const { buildRouteArgs } = await import('../../tinybird/tools/route-args.mjs')

const SITE = 'site-matrix'
const FROM = '2026-07-01'
const TO = '2026-07-06'

// Drive getFlexibleReport with route-faithful args and report which flexible pipe (if any) it queried.
// queryTinybird returns [] (non-null = "served") so a real fallback can't mask the dispatch decision.
async function dispatchedPipe ({ model, groupBy, metric = 'conversions', over = {} }) {
  const A = buildRouteArgs(over)
  const args = [groupBy, metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy]
  __evictFlexibleReportCache(SITE, model, FROM, TO, ...args)
  const pipes = []
  __setAttributionReadDeps({
    queryTinybird: async (p) => { pipes.push(p); return [] },
    queryHog: async () => []
  })
  try {
    await getFlexibleReport(SITE, model, FROM, TO, ...args)
  } catch (e) {
    // D1: a no-pipe shape throws the [pr4/D1] pipe-only invariant instead of reading HogQL — that IS
    // the "no flex pipe dispatched" outcome the matrix asserts as NONE. Re-throw anything unexpected.
    if (!/\[pr4\/D1\]/.test(e.message)) throw e
  } finally { __resetAttributionReadDeps() }
  return pipes.find((p) => p.startsWith('flexible_report')) || 'NONE'
}

const MATRIX = [
  // provider = conversion-property dim: window is a NO-OP (dispatches windowed); filter + non-UTC gate out.
  { name: 'provider · unfiltered · windowed · UTC', in: { model: 'last_touch_non_direct', groupBy: 'provider' }, expect: 'flexible_report_provider_by_site' },
  { name: 'provider · unfiltered · no-window · UTC', in: { model: 'last_touch_non_direct', groupBy: 'provider', over: { attributionWindow: null } }, expect: 'flexible_report_provider_by_site' },
  { name: 'provider · FILTERED · windowed · UTC', in: { model: 'last_touch_non_direct', groupBy: 'provider', over: { filters: { source: 'google' } } }, expect: 'NONE' },
  { name: 'provider · unfiltered · windowed · NON-UTC', in: { model: 'last_touch_non_direct', groupBy: 'provider', over: { timezone: 'America/New_York' } }, expect: 'NONE' },
  { name: 'provider · serves all 4 touch models (windowed, UTC)', in: { model: 'first_touch', groupBy: 'provider' }, expect: 'flexible_report_provider_by_site' },
  // attribution_status = conversion-property dim (Class-A sibling #2): same window-tolerant gate as provider.
  { name: 'attribution_status · unfiltered · windowed · UTC', in: { model: 'last_touch_non_direct', groupBy: 'attribution_status' }, expect: 'flexible_report_attribution_status_by_site' },
  { name: 'attribution_status · FILTERED · windowed · UTC', in: { model: 'last_touch_non_direct', groupBy: 'attribution_status', over: { filters: { source: 'google' } } }, expect: 'NONE' },
  { name: 'attribution_status · unfiltered · windowed · NON-UTC', in: { model: 'last_touch_non_direct', groupBy: 'attribution_status', over: { timezone: 'America/New_York' } }, expect: 'NONE' },
  { name: 'attribution_status · serves all 4 touch models (windowed, UTC)', in: { model: 'first_touch', groupBy: 'attribution_status' }, expect: 'flexible_report_attribution_status_by_site' },
  // stitching_method = conversion-property dim (Class-A sibling #3): same window-tolerant gate.
  { name: 'stitching_method · unfiltered · windowed · UTC', in: { model: 'last_touch_non_direct', groupBy: 'stitching_method' }, expect: 'flexible_report_stitching_method_by_site' },
  { name: 'stitching_method · FILTERED · windowed · UTC', in: { model: 'last_touch_non_direct', groupBy: 'stitching_method', over: { filters: { source: 'google' } } }, expect: 'NONE' },
  { name: 'stitching_method · unfiltered · windowed · NON-UTC', in: { model: 'last_touch_non_direct', groupBy: 'stitching_method', over: { timezone: 'America/New_York' } }, expect: 'NONE' },
  { name: 'stitching_method · serves all 4 touch models (windowed, UTC)', in: { model: 'first_touch', groupBy: 'stitching_method' }, expect: 'flexible_report_stitching_method_by_site' },
  // conversion_type = conversion-property dim (Class-A sibling #4, plain coalesce): same window-tolerant gate.
  { name: 'conversion_type · unfiltered · windowed · UTC', in: { model: 'last_touch_non_direct', groupBy: 'conversion_type' }, expect: 'flexible_report_conversion_type_by_site' },
  { name: 'conversion_type · FILTERED · windowed · UTC', in: { model: 'last_touch_non_direct', groupBy: 'conversion_type', over: { filters: { source: 'google' } } }, expect: 'NONE' },
  { name: 'conversion_type · unfiltered · windowed · NON-UTC', in: { model: 'last_touch_non_direct', groupBy: 'conversion_type', over: { timezone: 'America/New_York' } }, expect: 'NONE' },
  { name: 'conversion_type · serves all 4 touch models (windowed, UTC)', in: { model: 'first_touch', groupBy: 'conversion_type' }, expect: 'flexible_report_conversion_type_by_site' },
  // source × first_touch = touchpoint dim: the window RE-ATTRIBUTES source, so ONLY no-window UTC unfiltered serves.
  { name: 'source · unfiltered · no-window · UTC', in: { model: 'first_touch', groupBy: 'source', over: { attributionWindow: null } }, expect: 'flexible_report_main_by_site' },
  { name: 'source · unfiltered · WINDOWED · UTC (route default!)', in: { model: 'first_touch', groupBy: 'source' }, expect: 'NONE' },
  { name: 'source · FILTERED · no-window · UTC', in: { model: 'first_touch', groupBy: 'source', over: { attributionWindow: null, filters: { source: 'google' } } }, expect: 'NONE' },
  { name: 'source · unfiltered · no-window · NON-UTC', in: { model: 'first_touch', groupBy: 'source', over: { attributionWindow: null, timezone: 'Asia/Tokyo' } }, expect: 'NONE' }
]

for (const cell of MATRIX) {
  test(`MATRIX: ${cell.name} -> ${cell.expect}`, async () => {
    assert.strictEqual(await dispatchedPipe(cell.in), cell.expect, cell.name)
  })
}

test('buildRouteArgs ALWAYS injects filters.timezone (the route does) + the >=30d window default', () => {
  const a = buildRouteArgs({})
  assert.strictEqual(a.filters.timezone, 'UTC', 'timezone injected even when unset')
  assert.strictEqual(a.attributionWindow, '30', 'route default window is present unless explicitly nulled')
  assert.strictEqual(buildRouteArgs({ attributionWindow: null }).attributionWindow, null, 'explicit no-window honored')
  assert.strictEqual(buildRouteArgs({ filters: { source: 'x' } }).filters.source, 'x', 'content filters merge with timezone')
})
