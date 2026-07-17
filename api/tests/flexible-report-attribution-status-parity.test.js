// flexible_report ATTRIBUTION_STATUS Class-A dim-swap (sibling #2) — getFlexibleReport dispatch + gate.
// attribution_status is a conversion-property group_by (ATTRIBUTION_STATUS_SQL, model-independent), so
// ONE pipe (flexible_report_attribution_status_by_site) serves it for all 4 touch models, window-tolerant.
// D1: the pipe is the SOLE read path; a non-dispatch shape (non-attribution_status dim, filters, dim2,
// non-UTC) throws the [pr4/D1] pipe-only invariant.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getFlexibleReport, __setAttributionReadDeps, __resetAttributionReadDeps, __evictFlexibleReportCache } =
  await import('../lib/attribution-engine.js')

const FROM = '2026-07-01'
const TO = '2026-07-06'
const PIPE = 'flexible_report_attribution_status_by_site'
const PIPE_ROWS = [{ dim_value: 'attributed', metric_value: 7 }, { dim_value: 'unattributed', metric_value: 2 }]

// Route injects a window ('30') + filters.timezone; pass them so we exercise the real arg shape.
async function run (deps, { model = 'last_touch_non_direct', groupBy = 'attribution_status', metric = 'conversions', filters = { timezone: 'UTC' }, groupBy2 = null, window = '30', site = 'site-as' } = {}) {
  __evictFlexibleReportCache(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date')
  __setAttributionReadDeps(deps)
  try { return await getFlexibleReport(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date') } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: last_touch_non_direct + attribution_status (windowed) — named pipe rows remap to the expected result shape', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === PIPE ? PIPE_ROWS : null,
    queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
  })
  assert.strictEqual(pipeRes.find((r) => r.dim_value === 'attributed').conversions, 7, 'metric carried through')
})

test('DISPATCH: serves ALL 4 touch models (model-independent) WITH the injected window', async () => {
  for (const model of ['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct']) {
    const pipes = []
    await run({ queryTinybird: async (p) => { pipes.push(p); return p === PIPE ? PIPE_ROWS : null }, queryHog: async () => [] }, { model })
    assert.ok(pipes.includes(PIPE), `attribution_status pipe dispatched for model=${model}`)
  }
})

test('DISPATCH: pipe-only ON leg (no HogQL flexible_report read)', async () => {
  const hogNames = []
  await run({ queryTinybird: async (p) => p === PIPE ? PIPE_ROWS : null, queryHog: async (_sql, name) => { hogNames.push(name); return [] } })
  assert.ok(!hogNames.includes('flexible_report'), 'no HogQL flexible_report read on the pipe-served case')
})

// ── THE GATE: every non-attribution_status shape MUST NOT dispatch this pipe. D1: the fall-through no
//    longer reads HogQL — it throws the [pr4/D1] pipe-only invariant (FIX THE ALLOWLIST for no-pipe
//    shapes; FIX THE PIPE for a shape that dispatches a DIFFERENT pipe the harness returns null for). ──
for (const shape of [
  { name: 'group_by=provider (the OTHER Class-A pipe)', opts: { groupBy: 'provider' } },
  { name: 'group_by=source (non conversion-property)', opts: { model: 'first_touch', groupBy: 'source' } },
  { name: 'a content filter present', opts: { filters: { timezone: 'UTC', source: 'google' } } },
  { name: 'group_by2 present (cross-tab)', opts: { groupBy2: 'medium' } },
  { name: 'non-UTC timezone', opts: { filters: { timezone: 'America/New_York' } } },
  { name: 'non base-case metric', opts: { metric: 'avg_conversion_value' } }
]) {
  test(`GATE: ${shape.name} does NOT dispatch the attribution_status pipe (D1: throws the pipe-only invariant)`, async () => {
    const pipes = []
    await assert.rejects(
      run({
        queryTinybird: async (p) => { pipes.push(p); return null },
        queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
      }, { site: `site-${shape.name.replace(/\W+/g, '-')}`, ...shape.opts }),
      /\[pr4\/D1\]/,
      `${shape.name}: non-base shape must throw the D1 pipe-only invariant`
    )
    assert.ok(!pipes.includes(PIPE), `attribution_status pipe MUST NOT be queried for: ${shape.name}`)
  })
}
