// flexible_report CAMPAIGN + metric=sessions dim-swap — D1 (pipe-only) dispatch + STRICT gate.
// The main flexible_report read (name==='flexible_report') is now pipe-ONLY: D1 DELETED its HogQL
// fallback. ONE pipe (flexible_report_campaign_sessions_by_site) serves group_by=campaign +
// metric=sessions via a `model` param, first_touch + last_touch ONLY.
//   - pipe served (rows) -> remap; empty [] is a valid served result (no throw).
//   - pipe returns null   -> throws [pr4/D1] '...returned null ... FIX THE PIPE'.
//   - no pipe (pipe=NONE) -> throws [pr4/D1] 'unreachable pipe=NONE ... FIX THE ALLOWLIST'.
// So every non-base shape that used to "fall through to HogQL" now THROWS the pipe-only invariant.
// The main read's HogQL leg is deleted -> queryHog is NEVER called with name==='flexible_report';
// the harness asserts this by throwing if it is (other names, e.g. flexible_sessions, may return []).
// Per-bucket + total conservation is asserted here on the mapping layer; true cross-store VALUE parity
// on the staging fixture de200000-babe-41d4-a716-446655441111 is FOUNDER-GATED post-deploy (needs live
// creds; this harness must not deploy). The stub rows below ARE the intended result for that fixture.

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

// Intended per-bucket result for the fixture: count(DISTINCT distinct_id) over $pageview by campaign.
const PIPE_ROWS = [{ dim_value: 'summer_sale', metric_value: 9 }, { dim_value: 'brand', metric_value: 4 }]
const TOTAL = 13 // 9 + 4 — total visitor buckets must conserve through the remap

async function run (deps, { model = 'last_touch', groupBy = 'campaign', metric = 'sessions', filters = {}, groupBy2 = null, window = null, site = FIXTURE_SITE } = {}) {
  __evictFlexibleReportCache(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date')
  __setAttributionReadDeps(deps)
  try { return await getFlexibleReport(site, model, FROM, TO, groupBy, metric, filters, groupBy2, 'day', window, 'conversion_date') } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: last_touch + campaign + sessions — pipe named rows remap to the expected result shape', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === PIPE ? PIPE_ROWS : null,
    queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('D1: flexible_report HogQL leg is deleted — must not be called'); return [] }
  })
  assert.strictEqual(pipeRes.find((r) => r.dim_value === 'summer_sale').sessions, 9, 'per-bucket visitor count carried through')
  // total-conservation: sum of per-bucket sessions equals the intended total
  assert.strictEqual(pipeRes.reduce((s, r) => s + r.sessions, 0), TOTAL, 'sum of buckets conserved')
})

test('DISPATCH: first_touch + campaign + sessions — pipe serves it too (model param switches the column)', async () => {
  const seen = []
  const res = await run({
    queryTinybird: async (pipe, params) => { seen.push({ pipe, model: params.model, metric: params.metric }); return pipe === PIPE ? PIPE_ROWS : null },
    queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('D1: flexible_report HogQL leg is deleted — must not be called'); return [] }
  }, { model: 'first_touch' })
  const hit = seen.find((s) => s.pipe === PIPE)
  assert.ok(hit, 'sessions pipe dispatched for model=first_touch')
  assert.strictEqual(hit.model, 'first_touch', 'model threaded so the pipe switches to first_touch_campaign')
  assert.strictEqual(res.reduce((s, r) => s + r.sessions, 0), TOTAL, 'sum conserved for first_touch too')
})

test('D1: pipe null throws the pipe-only invariant (FIX THE PIPE) — no HogQL flexible_report read', async () => {
  await assert.rejects(
    run({
      queryTinybird: async () => null,
      queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('D1: flexible_report HogQL leg is deleted — must not be called'); return [] }
    }),
    /\[pr4\/D1\]/,
    'D1: pipe null throws FIX THE PIPE'
  )
})

test('DISPATCH: sessions serves WITHOUT any HogQL flexible_report read (ON leg is pipe-only)', async () => {
  const hogNames = []
  await run({ queryTinybird: async (p) => p === PIPE ? PIPE_ROWS : null, queryHog: async (_sql, name) => { hogNames.push(name); return [] } })
  assert.ok(!hogNames.includes('flexible_report'), 'no HogQL flexible_report read on the pipe-served sessions case')
})

// ── HELD: non-direct models must NOT dispatch the sessions pipe. D1: the main read throws instead of
//    falling through to HogQL (pipe=NONE -> FIX THE ALLOWLIST). ──
for (const model of ['first_touch_non_direct', 'last_touch_non_direct']) {
  test(`GATE: ${model} + campaign + sessions does NOT dispatch (non-direct is HELD; D1: throws)`, async () => {
    const pipes = []
    await assert.rejects(
      run({
        queryTinybird: async (p) => { pipes.push(p); return null },
        queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('D1: flexible_report HogQL leg is deleted — must not be called'); return [] }
      }, { model, site: `site-sess-${model}` }),
      /\[pr4\/D1\]/,
      `${model}: held non-direct shape must throw the D1 pipe-only invariant`
    )
    assert.ok(!pipes.includes(PIPE), `sessions pipe MUST NOT be queried for held model=${model}`)
  })
}

// ── WINDOW: campaign is window-SENSITIVE (windowedDimExpr = _win._w_campaign) ──
test('WINDOW: campaign + sessions + window does NOT dispatch (window re-attributes campaign; D1: throws)', async () => {
  const pipes = []
  await assert.rejects(
    run({
      queryTinybird: async (p) => { pipes.push(p); return null },
      queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('D1: flexible_report HogQL leg is deleted — must not be called'); return [] }
    }, { window: '30', site: 'site-sess-window' }),
    /\[pr4\/D1\]/,
    'windowed campaign sessions must throw the D1 pipe-only invariant'
  )
  assert.ok(!pipes.includes(PIPE), 'sessions pipe MUST NOT dispatch with a window')
})

// ── THE GATE: non-base shapes MUST NOT hit the sessions pipe. D1: they throw the pipe-only invariant
//    (a shape that dispatches a DIFFERENT pipe -> FIX THE PIPE on the null; a no-pipe shape -> FIX THE
//    ALLOWLIST). Both match /\[pr4\/D1\]/, so the rejection assertion is uniform. ──
for (const shape of [
  { name: 'group_by=source (a DIFFERENT pipe)', opts: { groupBy: 'source', model: 'first_touch' } },
  { name: 'campaign + conversions (the revenue/conversions pipe, not sessions)', opts: { metric: 'conversions' } },
  { name: 'campaign + leads (the leads pipe, not sessions)', opts: { metric: 'leads' } },
  { name: 'campaign + a filter present', opts: { filters: { source: 'x' } } },
  { name: 'campaign + group_by2 (cross-tab)', opts: { groupBy2: 'medium' } },
  { name: 'campaign + non-UTC timezone', opts: { filters: { timezone: 'America/New_York' } } }
]) {
  test(`GATE: ${shape.name} does NOT dispatch the sessions pipe (D1: throws the pipe-only invariant)`, async () => {
    const pipes = []
    await assert.rejects(
      run({
        queryTinybird: async (p) => { pipes.push(p); return null },
        queryHog: async (_sql, name) => { if (name === 'flexible_report') throw new Error('D1: flexible_report HogQL leg is deleted — must not be called'); return [] }
      }, { site: `site-${shape.name.replace(/\W+/g, '-')}`, ...shape.opts }),
      /\[pr4\/D1\]/,
      `${shape.name}: non-base shape must throw the D1 pipe-only invariant`
    )
    assert.ok(!pipes.includes(PIPE), `sessions pipe MUST NOT be queried for: ${shape.name}`)
  })
}
