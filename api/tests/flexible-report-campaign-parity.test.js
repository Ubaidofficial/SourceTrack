// flexible_report CAMPAIGN dim-swap — getFlexibleReport dispatch + the STRICT gate — D1 (pipe-only).
// campaign is a MODEL-DEPENDENT group_by (GROUP_COLUMNS.campaign: utm_campaign for last_touch,
// first_touch_campaign for first_touch), so ONE pipe (flexible_report_campaign_by_site) serves
// group_by=campaign via a `model` param — for first_touch + last_touch ONLY. Fixes the Campaigns
// page (campaigns.js: model=last_touch, no window -> was dead HogQL -> zeros). D1 deleted the HogQL
// fallback: everything else (non-direct models, a window, non-campaign dim, filters, dim2, non-UTC,
// non-base metric) no longer "falls through to HogQL" — it throws the [pr4/D1] pipe-only invariant.

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
const PIPE = 'flexible_report_campaign_by_site'

const PIPE_ROWS = [{ dim_value: 'summer_sale', metric_value: 5 }, { dim_value: 'brand', metric_value: 3 }]

async function run (deps, { model = 'last_touch', groupBy = 'campaign', metric = 'conversions', filters = {}, groupBy2 = null, window = null, site = 'site-camp' } = {}) {
  __evictFlexibleReportCache(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date')
  __setAttributionReadDeps(deps)
  try { return await getFlexibleReport(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date') } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: last_touch + campaign — named pipe rows remap to the expected result shape', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === PIPE ? PIPE_ROWS : null,
    queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
  })
  assert.ok(Array.isArray(pipeRes) && pipeRes.length === 2, 'two campaign rows returned')
  assert.strictEqual(pipeRes.find((r) => r.dim_value === 'summer_sale').conversions, 5, 'metric_value carried through the pipe remap')
})

test('DISPATCH: first_touch + campaign — pipe serves it too (model param switches the column)', async () => {
  const seen = []
  const res = await run({
    queryTinybird: async (pipe, params) => { seen.push({ pipe, model: params.model, metric: params.metric }); return pipe === PIPE ? PIPE_ROWS : null },
    queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
  }, { model: 'first_touch' })
  const hit = seen.find((s) => s.pipe === PIPE)
  assert.ok(hit, 'campaign pipe dispatched for model=first_touch')
  assert.strictEqual(hit.model, 'first_touch', 'model threaded to the pipe params so it switches to first_touch_campaign')
  assert.strictEqual(res.find((r) => r.dim_value === 'brand').conversions, 3, 'metric carried through')
})

test('DISPATCH: revenue metric threaded (MONEY-RAIL) — pipe served, no HogQL', async () => {
  const seen = []
  const res = await run({
    queryTinybird: async (pipe, params) => { seen.push({ pipe, metric: params.metric, model: params.model }); return pipe === PIPE ? [{ dim_value: 'brand', metric_value: 42.5 }] : null },
    queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
  }, { metric: 'revenue' })
  const hit = seen.find((s) => s.pipe === PIPE)
  assert.strictEqual(hit.metric, 'revenue', 'metric=revenue threaded to the pipe')
  assert.strictEqual(hit.model, 'last_touch', 'model=last_touch threaded')
  assert.strictEqual(res.find((r) => r.dim_value === 'brand').revenue, 42.5, 'revenue value carried through')
})

test('D1: pipe null throws the FIX-THE-PIPE invariant (no HogQL fallback)', async () => {
  await assert.rejects(
    run({
      queryTinybird: async () => null,
      queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
    }),
    /\[pr4\/D1\]/,
    'D1: pipe null now throws FIX THE PIPE, no HogQL fallback'
  )
})

test('DISPATCH: campaign serves WITHOUT any HogQL flexible_report read (ON leg is pipe-only)', async () => {
  const hogNames = []
  await run({ queryTinybird: async (p) => p === PIPE ? PIPE_ROWS : null, queryHog: async (_sql, name) => { hogNames.push(name); return [] } })
  assert.ok(!hogNames.includes('flexible_report'), 'no HogQL flexible_report read on the pipe-served campaign case')
})

// ── HELD: non-direct models must NOT dispatch (parity held; utm_campaign _nd COALESCE differs). D1:
//    a non-dispatch shape no longer reads HogQL — it throws the [pr4/D1] pipe-only invariant. ──
for (const model of ['first_touch_non_direct', 'last_touch_non_direct']) {
  test(`GATE: ${model} + campaign does NOT dispatch (non-direct is HELD; D1: throws the pipe-only invariant)`, async () => {
    const pipes = []
    await assert.rejects(
      run({
        queryTinybird: async (p) => { pipes.push(p); return null },
        queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
      }, { model, site: `site-camp-${model}` }),
      /\[pr4\/D1\]/,
      `held model=${model} must throw the D1 pipe-only invariant`
    )
    assert.ok(!pipes.includes(PIPE), `campaign pipe MUST NOT be queried for held model=${model}`)
  })
}

// ── WINDOW: campaign is window-SENSITIVE (windowedDimExpr = _win._w_campaign), like source ──
test('WINDOW: campaign + attribution window does NOT dispatch (window re-attributes campaign; D1: throws)', async () => {
  const pipes = []
  await assert.rejects(
    run({
      queryTinybird: async (p) => { pipes.push(p); return null },
      queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
    }, { window: '30', site: 'site-camp-window' }),
    /\[pr4\/D1\]/,
    'windowed campaign must throw the D1 pipe-only invariant'
  )
  assert.ok(!pipes.includes(PIPE), 'campaign pipe MUST NOT dispatch with a window (windowedDimExpr re-attributes campaign)')
})

// ── THE GATE: non-base shapes MUST NOT hit the campaign pipe. D1: they throw the pipe-only invariant. ──
for (const shape of [
  { name: 'group_by=source (a DIFFERENT pipe)', opts: { groupBy: 'source', model: 'first_touch' } },
  { name: 'campaign + a filter present', opts: { filters: { source: 'x' } } },
  { name: 'campaign + group_by2 (cross-tab)', opts: { groupBy2: 'medium' } },
  { name: 'campaign + non-UTC timezone', opts: { filters: { timezone: 'America/New_York' } } },
  { name: 'campaign + metric=avg_conversion_value (non base-case metric)', opts: { metric: 'avg_conversion_value' } }
]) {
  test(`GATE: ${shape.name} does NOT dispatch the campaign pipe (D1: throws the pipe-only invariant)`, async () => {
    const pipes = []
    await assert.rejects(
      run({
        queryTinybird: async (p) => { pipes.push(p); return null },
        queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
      }, { site: `site-${shape.name.replace(/\W+/g, '-')}`, ...shape.opts }),
      /\[pr4\/D1\]/,
      `${shape.name}: non-base shape must throw the D1 pipe-only invariant`
    )
    assert.ok(!pipes.includes(PIPE), `campaign pipe MUST NOT be queried for: ${shape.name}`)
  })
}
