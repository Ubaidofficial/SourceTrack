// flexible_report PROVIDER Class-A dim-swap — getFlexibleReport dispatch + the STRICT gate.
// provider is a conversion-property group_by (PROVIDER_SQL, model-independent), so ONE pipe
// (flexible_report_provider_by_site) serves group_by=provider for all 4 touch models — including
// last_touch_non_direct+provider, the live prod 504. Everything else (non-provider dim, filters,
// dim2, non-UTC) must fall through to HogQL and MUST NOT hit the provider pipe.

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
const PIPE = 'flexible_report_provider_by_site'

const PIPE_ROWS = [{ dim_value: 'stripe', metric_value: 5 }, { dim_value: 'browser', metric_value: 3 }]
const HOG_ROWS = [['stripe', 5], ['browser', 3]]

async function run (deps, { model = 'last_touch_non_direct', groupBy = 'provider', metric = 'conversions', filters = {}, groupBy2 = null, window = null, site = 'site-prov' } = {}) {
  __evictFlexibleReportCache(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date')
  __setAttributionReadDeps(deps)
  try { return await getFlexibleReport(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date') } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: last_touch_non_direct + provider — pipe named rows == HogQL positional (byte-identical)', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === PIPE ? PIPE_ROWS : null,
    queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('provider base case must come from the pipe, not HogQL'); return [] }
  })
  const hogRes = await run({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
  })
  assert.deepStrictEqual(pipeRes, hogRes, 'pipe remap == HogQL positional -> identical')
  assert.strictEqual(pipeRes.find((r) => r.dim_value === 'stripe').conversions, 5, 'metric carried through')
})

test('DISPATCH: provider pipe serves ALL 4 touch models (model-independent)', async () => {
  for (const model of ['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct']) {
    const pipes = []
    await run({ queryTinybird: async (p) => { pipes.push(p); return p === PIPE ? PIPE_ROWS : null }, queryHog: async () => [] }, { model })
    assert.ok(pipes.includes(PIPE), `provider pipe dispatched for model=${model}`)
  }
})

test('DISPATCH: provider serves WITHOUT any HogQL flexible_report read (ON leg is pipe-only)', async () => {
  const hogNames = []
  await run({ queryTinybird: async (p) => p === PIPE ? PIPE_ROWS : null, queryHog: async (_sql, name) => { hogNames.push(name); return [] } })
  assert.ok(!hogNames.includes('flexible_report'), 'no HogQL flexible_report read on the pipe-served provider case')
})

// ── WINDOW TOLERANCE: provider dispatches WITH a window (route always injects one); source does NOT ──
test('WINDOW: provider + attribution window (the route ALWAYS injects >=30d) STILL dispatches the pipe', async () => {
  const pipes = []
  await run({ queryTinybird: async (p) => { pipes.push(p); return p === PIPE ? PIPE_ROWS : null }, queryHog: async () => [] }, { window: '30' })
  assert.ok(pipes.includes(PIPE), 'provider pipe dispatches WITH a window — the window is a no-op for a conversion-property dim')
})

test('WINDOW: source + first_touch + window does NOT dispatch (window re-attributes source; pipe would diverge)', async () => {
  const pipes = []
  await run({
    queryTinybird: async (p) => { pipes.push(p); return null },
    queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
  }, { model: 'first_touch', groupBy: 'source', window: '30', site: 'site-src-window' })
  assert.ok(!pipes.includes('flexible_report_main_by_site'), 'main/source pipe MUST NOT dispatch with a window (windowedDimExpr re-attributes source)')
  assert.ok(!pipes.includes(PIPE), 'provider pipe not involved for a source group_by')
})

// ── THE GATE: non-provider / non-base shapes MUST fall through and NEVER hit the provider pipe ──
for (const shape of [
  { name: 'group_by=source (the OTHER pipe, not provider)', opts: { groupBy: 'source', model: 'first_touch' } },
  { name: 'group_by=attribution_status (conversion-property, NOT yet wired)', opts: { groupBy: 'attribution_status' } },
  { name: 'provider + a filter present', opts: { filters: { source: 'x' } } },
  { name: 'provider + group_by2 (cross-tab)', opts: { groupBy2: 'medium' } },
  { name: 'provider + non-UTC timezone', opts: { filters: { timezone: 'America/New_York' } } },
  { name: 'provider + metric=avg_conversion_value (non base-case metric)', opts: { metric: 'avg_conversion_value' } }
]) {
  test(`GATE: ${shape.name} does NOT dispatch the provider pipe`, async () => {
    const pipes = []
    await run({
      queryTinybird: async (p) => { pipes.push(p); return null },
      queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
    }, { site: `site-${shape.name.replace(/\W+/g, '-')}`, ...shape.opts })
    assert.ok(!pipes.includes(PIPE), `provider pipe MUST NOT be queried for: ${shape.name}`)
  })
}
