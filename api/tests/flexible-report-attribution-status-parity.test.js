// flexible_report ATTRIBUTION_STATUS Class-A dim-swap (sibling #2) — getFlexibleReport dispatch + gate.
// attribution_status is a conversion-property group_by (ATTRIBUTION_STATUS_SQL, model-independent), so
// ONE pipe (flexible_report_attribution_status_by_site) serves it for all 4 touch models, window-tolerant.
// Everything else (non-attribution_status dim, filters, dim2, non-UTC) must fall through to HogQL.

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
const HOG_ROWS = [['attributed', 7], ['unattributed', 2]]

// Route injects a window ('30') + filters.timezone; pass them so we exercise the real arg shape.
async function run (deps, { model = 'last_touch_non_direct', groupBy = 'attribution_status', metric = 'conversions', filters = { timezone: 'UTC' }, groupBy2 = null, window = '30', site = 'site-as' } = {}) {
  __evictFlexibleReportCache(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date')
  __setAttributionReadDeps(deps)
  try { return await getFlexibleReport(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date') } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: last_touch_non_direct + attribution_status (windowed) — pipe rows == HogQL positional', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === PIPE ? PIPE_ROWS : null,
    queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('base case must come from the pipe, not HogQL'); return [] }
  })
  const hogRes = await run({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
  })
  assert.deepStrictEqual(pipeRes, hogRes, 'pipe remap == HogQL positional -> identical')
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

// ── THE GATE ──
for (const shape of [
  { name: 'group_by=provider (the OTHER Class-A pipe)', opts: { groupBy: 'provider' } },
  { name: 'group_by=source (non conversion-property)', opts: { model: 'first_touch', groupBy: 'source' } },
  { name: 'a content filter present', opts: { filters: { timezone: 'UTC', source: 'google' } } },
  { name: 'group_by2 present (cross-tab)', opts: { groupBy2: 'medium' } },
  { name: 'non-UTC timezone', opts: { filters: { timezone: 'America/New_York' } } },
  { name: 'non base-case metric', opts: { metric: 'avg_conversion_value' } }
]) {
  test(`GATE: ${shape.name} does NOT dispatch the attribution_status pipe`, async () => {
    const pipes = []
    await run({
      queryTinybird: async (p) => { pipes.push(p); return null },
      queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
    }, { site: `site-${shape.name.replace(/\W+/g, '-')}`, ...shape.opts })
    assert.ok(!pipes.includes(PIPE), `attribution_status pipe MUST NOT be queried for: ${shape.name}`)
  })
}
