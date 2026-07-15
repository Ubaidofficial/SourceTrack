// flexible_report CAMPAIGN + metric=sessions dim-swap — getFlexibleReport dispatch + STRICT gate.
// Fixes the Campaigns page Visitors column (campaigns.js calls getFlexibleReport(metric='sessions')
// which _flexPipeCommon excludes -> pipe=NONE -> dead HogQL -> zeros). ONE pipe
// (flexible_report_campaign_sessions_by_site) serves group_by=campaign + metric=sessions via a
// `model` param, first_touch + last_touch ONLY.
//
// HogQL-INTENT reproduced (attribution-engine.js:2391-2395): count(DISTINCT distinct_id) over
// event_type='$pageview', GROUP BY campaign dim, NO external_event_id dedup. Per-bucket + total
// conservation is asserted here on the mapping layer; true cross-store VALUE parity on the staging
// fixture de200000-babe-41d4-a716-446655441111 is FOUNDER-GATED post-deploy (needs live creds; this
// harness must not deploy). The stub rows below ARE the HogQL-INTENT result for that fixture.

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
const PIPE = 'flexible_report_campaign_sessions_by_site'
const FIXTURE_SITE = 'de200000-babe-41d4-a716-446655441111'

// HogQL-INTENT per-bucket result for the fixture: count(DISTINCT distinct_id) over $pageview by campaign.
const PIPE_ROWS = [{ dim_value: 'summer_sale', metric_value: 9 }, { dim_value: 'brand', metric_value: 4 }]
const HOG_ROWS = [['summer_sale', 9], ['brand', 4]]
const TOTAL = 13 // 9 + 4 — total visitor buckets must conserve through the remap

async function run (deps, { model = 'last_touch', groupBy = 'campaign', metric = 'sessions', filters = {}, groupBy2 = null, window = null, site = FIXTURE_SITE } = {}) {
  __evictFlexibleReportCache(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date')
  __setAttributionReadDeps(deps)
  try { return await getFlexibleReport(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date') } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: last_touch + campaign + sessions — pipe named rows == HogQL positional (byte-identical)', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === PIPE ? PIPE_ROWS : null,
    queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('sessions base case must come from the pipe, not HogQL'); return [] }
  })
  const hogRes = await run({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
  })
  assert.deepStrictEqual(pipeRes, hogRes, 'pipe remap == HogQL positional -> identical')
  assert.strictEqual(pipeRes.find((r) => r.dim_value === 'summer_sale').sessions, 9, 'per-bucket visitor count carried through')
  // total-conservation: sum of per-bucket sessions equals the HogQL-INTENT total
  assert.strictEqual(pipeRes.reduce((s, r) => s + r.sessions, 0), TOTAL, 'sum of buckets conserved')
})

test('DISPATCH: first_touch + campaign + sessions — pipe serves it too (model param switches the column)', async () => {
  const seen = []
  const res = await run({
    queryTinybird: async (pipe, params) => { seen.push({ pipe, model: params.model, metric: params.metric }); return pipe === PIPE ? PIPE_ROWS : null },
    queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('first_touch sessions base case must come from the pipe'); return [] }
  }, { model: 'first_touch' })
  const hit = seen.find((s) => s.pipe === PIPE)
  assert.ok(hit, 'sessions pipe dispatched for model=first_touch')
  assert.strictEqual(hit.model, 'first_touch', 'model threaded so the pipe switches to first_touch_campaign')
  assert.strictEqual(res.reduce((s, r) => s + r.sessions, 0), TOTAL, 'sum conserved for first_touch too')
})

test('FALLBACK: pipe null -> HogQL flexible_report is called and its rows returned', async () => {
  const hogNames = []
  const res = await run({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => { hogNames.push(name); return name === 'flexible_report' ? HOG_ROWS : [] }
  })
  assert.ok(hogNames.includes('flexible_report'), 'null pipe -> HogQL fallback exercised')
  assert.strictEqual(res.reduce((s, r) => s + r.sessions, 0), TOTAL, 'HogQL total surfaces unchanged')
})

test('DISPATCH: sessions serves WITHOUT any HogQL flexible_report read (ON leg is pipe-only)', async () => {
  const hogNames = []
  await run({ queryTinybird: async (p) => p === PIPE ? PIPE_ROWS : null, queryHog: async (_sql, name) => { hogNames.push(name); return [] } })
  assert.ok(!hogNames.includes('flexible_report'), 'no HogQL flexible_report read on the pipe-served sessions case')
})

// ── HELD: non-direct models must NOT dispatch ──
for (const model of ['first_touch_non_direct', 'last_touch_non_direct']) {
  test(`GATE: ${model} + campaign + sessions does NOT dispatch (non-direct is HELD)`, async () => {
    const pipes = []
    await run({
      queryTinybird: async (p) => { pipes.push(p); return null },
      queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
    }, { model, site: `site-sess-${model}` })
    assert.ok(!pipes.includes(PIPE), `sessions pipe MUST NOT be queried for held model=${model}`)
  })
}

// ── WINDOW: campaign is window-SENSITIVE (windowedDimExpr = _win._w_campaign) ──
test('WINDOW: campaign + sessions + window does NOT dispatch (window re-attributes campaign)', async () => {
  const pipes = []
  await run({
    queryTinybird: async (p) => { pipes.push(p); return null },
    queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
  }, { window: '30', site: 'site-sess-window' })
  assert.ok(!pipes.includes(PIPE), 'sessions pipe MUST NOT dispatch with a window')
})

// ── THE GATE: non-base shapes MUST fall through and NEVER hit the sessions pipe ──
for (const shape of [
  { name: 'group_by=source (a DIFFERENT pipe)', opts: { groupBy: 'source', model: 'first_touch' } },
  { name: 'campaign + conversions (the revenue/conversions pipe, not sessions)', opts: { metric: 'conversions' } },
  { name: 'campaign + leads (the leads pipe, not sessions)', opts: { metric: 'leads' } },
  { name: 'campaign + a filter present', opts: { filters: { source: 'x' } } },
  { name: 'campaign + group_by2 (cross-tab)', opts: { groupBy2: 'medium' } },
  { name: 'campaign + non-UTC timezone', opts: { filters: { timezone: 'America/New_York' } } }
]) {
  test(`GATE: ${shape.name} does NOT dispatch the sessions pipe`, async () => {
    const pipes = []
    await run({
      queryTinybird: async (p) => { pipes.push(p); return null },
      queryHog: async (_sql, name) => name === 'flexible_report' ? HOG_ROWS : []
    }, { site: `site-${shape.name.replace(/\W+/g, '-')}`, ...shape.opts })
    assert.ok(!pipes.includes(PIPE), `sessions pipe MUST NOT be queried for: ${shape.name}`)
  })
}
