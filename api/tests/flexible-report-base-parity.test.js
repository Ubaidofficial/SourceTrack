// flexible_report BASE-CASE dispatch + the STRICT gate — D1 (pipe-only).
// The base case (source × first_touch × {revenue|conversions}, single dim, no joins/filters/window/
// custom, conversion_date, UTC) reads flexible_report_main_by_site — now the SOLE read path. D1
// deleted the HogQL fallback: a non-dispatch shape no longer "falls through to HogQL", it throws the
// [pr4/D1] pipe-only invariant. Proves (1) the pipe named-row remap yields the expected result shape,
// and (2) the gate — non-base shapes never dispatch the main pipe and hit the D1 throw.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getFlexibleReport, __setAttributionReadDeps, __resetAttributionReadDeps, __evictFlexibleReportCache } =
  await import('../lib/attribution-engine.js')

const SITE = 'site-flex'
const FROM = '2026-07-01'
const TO = '2026-07-06'
const PIPE = 'flexible_report_main_by_site'

// Named pipe rows (flexible_report_main_by_site SELECT aliases).
const PIPE_ROWS = [{ dim_value: 'google', metric_value: 5 }, { dim_value: 'direct', metric_value: 3 }]

// Run getFlexibleReport once with injected deps; evict the cache first so each leg recomputes.
async function run (deps, { model = 'first_touch', groupBy = 'source', metric = 'conversions', filters = {}, groupBy2 = null, site = SITE } = {}) {
  __evictFlexibleReportCache(site, model, FROM, TO, groupBy, metric, filters, groupBy2)
  __setAttributionReadDeps(deps)
  try { return await getFlexibleReport(site, model, FROM, TO, groupBy, metric, filters, groupBy2) } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: base case — named pipe rows remap to the expected result shape', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === PIPE ? PIPE_ROWS : null,
    queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
  })
  assert.ok(Array.isArray(pipeRes) && pipeRes.length === 2, 'two source rows returned')
  const google = pipeRes.find((r) => r.dim_value === 'google')
  assert.strictEqual(google.conversions, 5, 'metric_value carried through the pipe remap')
  const direct = pipeRes.find((r) => r.dim_value === 'direct')
  assert.strictEqual(direct.conversions, 3, 'second row remapped correctly')
})

test('DISPATCH: base case serves from the pipe WITHOUT any HogQL flexible_report read', async () => {
  const hogNames = []
  await run({
    queryTinybird: async (pipe) => pipe === PIPE ? PIPE_ROWS : null,
    queryHog: async (_sql, name) => { hogNames.push(name); return [] }
  })
  assert.ok(!hogNames.includes('flexible_report'), 'no HogQL flexible_report read on the pipe-served base case')
})

test('DISPATCH: metric=revenue is also a base case -> dispatches the pipe', async () => {
  const pipes = []
  await run({
    queryTinybird: async (pipe) => { pipes.push(pipe); return pipe === PIPE ? [{ dim_value: 'google', metric_value: 12.5 }] : null },
    queryHog: async () => []
  }, { metric: 'revenue' })
  assert.ok(pipes.includes(PIPE), 'revenue base case dispatched the pipe')
})

// ── THE GATE: every non-base shape MUST NOT dispatch the main pipe. D1: the fall-through no longer
//    reads HogQL — it throws the [pr4/D1] pipe-only invariant (FIX THE ALLOWLIST for no-pipe shapes;
//    FIX THE PIPE for a shape that dispatches a DIFFERENT pipe which the harness returns null for). ──
for (const shape of [
  { name: 'group_by=provider (non-source dim)', opts: { groupBy: 'provider' } },
  { name: 'model=last_touch_non_direct (non first_touch)', opts: { model: 'last_touch_non_direct' } },
  { name: 'a filter present (filters.source)', opts: { filters: { source: 'google' } } },
  { name: 'group_by2 present (cross-tab)', opts: { groupBy2: 'medium' } },
  { name: 'non-UTC timezone', opts: { filters: { timezone: 'America/New_York' } } }
]) {
  test(`GATE: ${shape.name} does NOT dispatch the main pipe (D1: throws the pipe-only invariant)`, async () => {
    const pipes = []
    await assert.rejects(
      run({
        queryTinybird: async (pipe) => { pipes.push(pipe); return null },
        queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
      }, { site: `site-${shape.name.replace(/\W+/g, '-')}`, ...shape.opts }),
      /\[pr4\/D1\]/,
      `${shape.name}: non-base shape must throw the D1 pipe-only invariant`
    )
    assert.ok(!pipes.includes(PIPE), `main pipe MUST NOT be queried for: ${shape.name}`)
  })
}
