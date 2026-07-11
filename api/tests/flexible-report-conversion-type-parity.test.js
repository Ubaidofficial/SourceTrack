// flexible_report CONVERSION_TYPE Class-A dim-swap (sibling #4, FINAL) — getFlexibleReport dispatch + gate.
// conversion_type is a conversion-property group_by (plain COALESCE(...,'untyped'), model-independent), so
// ONE pipe (flexible_report_conversion_type_by_site) serves it for all 4 touch models, window-tolerant.
// Everything else (non-conversion_type dim, filters, dim2, non-UTC) -> HogQL.

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
const PIPE = 'flexible_report_conversion_type_by_site'
const PIPE_ROWS = [{ dim_value: 'purchase', metric_value: 8 }, { dim_value: 'untyped', metric_value: 2 }]
const HOG_ROWS = [['purchase', 8], ['untyped', 2]]

// Route injects a window ('30') + filters.timezone; pass them so we exercise the real arg shape.
async function run (deps, { model = 'last_touch_non_direct', groupBy = 'conversion_type', metric = 'conversions', filters = { timezone: 'UTC' }, groupBy2 = null, window = '30', site = 'site-ct' } = {}) {
  __evictFlexibleReportCache(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date')
  __setAttributionReadDeps(deps)
  try { return await getFlexibleReport(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date') } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: last_touch_non_direct + conversion_type (windowed) — pipe rows == HogQL positional', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === PIPE ? PIPE_ROWS : null,
    queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('base case must come from the pipe, not HogQL'); return [] }
  })
  const hogRes = await run({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
  })
  assert.deepStrictEqual(pipeRes, hogRes, 'pipe remap == HogQL positional -> identical')
  assert.strictEqual(pipeRes.find((r) => r.dim_value === 'purchase').conversions, 8, 'metric carried through')
  assert.ok(pipeRes.find((r) => r.dim_value === 'untyped'), "the 'untyped' fallback bucket carries through")
})

test('DISPATCH: serves ALL 4 touch models (model-independent) WITH the injected window', async () => {
  for (const model of ['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct']) {
    const pipes = []
    await run({ queryTinybird: async (p) => { pipes.push(p); return p === PIPE ? PIPE_ROWS : null }, queryHog: async () => [] }, { model })
    assert.ok(pipes.includes(PIPE), `conversion_type pipe dispatched for model=${model}`)
  }
})

test('DISPATCH: pipe-only ON leg (no HogQL flexible_report read)', async () => {
  const hogNames = []
  await run({ queryTinybird: async (p) => p === PIPE ? PIPE_ROWS : null, queryHog: async (_sql, name) => { hogNames.push(name); return [] } })
  assert.ok(!hogNames.includes('flexible_report'), 'no HogQL flexible_report read on the pipe-served case')
})

// ── THE GATE ──
for (const shape of [
  { name: 'group_by=stitching_method (the OTHER Class-A pipe)', opts: { groupBy: 'stitching_method' } },
  { name: 'group_by=source (non conversion-property)', opts: { model: 'first_touch', groupBy: 'source' } },
  { name: 'a content filter present (filter_conversion_type != group_by)', opts: { filters: { timezone: 'UTC', conversion_type: 'purchase' } } },
  { name: 'group_by2 present (cross-tab)', opts: { groupBy2: 'medium' } },
  { name: 'non-UTC timezone', opts: { filters: { timezone: 'America/New_York' } } },
  { name: 'non base-case metric', opts: { metric: 'avg_conversion_value' } }
]) {
  test(`GATE: ${shape.name} does NOT dispatch the conversion_type pipe`, async () => {
    const pipes = []
    await run({
      queryTinybird: async (p) => { pipes.push(p); return null },
      queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
    }, { site: `site-${shape.name.replace(/\W+/g, '-')}`, ...shape.opts })
    assert.ok(!pipes.includes(PIPE), `conversion_type pipe MUST NOT be queried for: ${shape.name}`)
  })
}
