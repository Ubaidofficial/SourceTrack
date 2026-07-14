// flexible_report DEPTH parity — the three attribution-depth reads wired off dead PostHog:
//   days_to_convert -> flexible_report_days_to_convert_by_site
//   touchpoints_per_conversion -> flexible_report_touchpoints_per_conversion_by_site
//   flexible_sessions (conversion_rate denominator) -> flexible_sessions_by_site  [BASE-CASE gated]
// Each proves (1) the pipe named-row remap == the HogQL positional shape (byte-identical result,
// so the AVERAGE metrics are preserved) and (2) dispatch/no-HogQL/tenant-scope. flexible_sessions
// also proves the base-case gate: non-base shapes never touch the pipe. Distinct sites per leg
// avoid the module NodeCache (main key + the sessions sub-key) bleeding one leg into the next.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getFlexibleReport, __setAttributionReadDeps, __resetAttributionReadDeps } =
  await import('../lib/attribution-engine.js')

const FROM = '2026-07-01'
const TO = '2026-07-06'
let siteN = 0
const nextSite = () => `site-depth-${siteN++}` // fresh site per leg -> no cache reuse

async function run (deps, { site, model = 'first_touch', groupBy = 'source', metric, filters = {}, groupBy2 = null }) {
  __setAttributionReadDeps(deps)
  try { return await getFlexibleReport(site, model, FROM, TO, groupBy, metric, filters, groupBy2) }
  finally { __resetAttributionReadDeps() }
}
const arr = (r) => Array.isArray(r) ? r : r.results

// ── days_to_convert (AVERAGE metric) ────────────────────────────────────────
const DTC_PIPE = [{ dim_value: 'google', days_to_convert: 3.5, conversions: 4 }, { dim_value: 'direct', days_to_convert: 1, conversions: 2 }]
const DTC_HOG = [['google', 3.5, 4], ['direct', 1, 2]]

test('days_to_convert — PARITY: named pipe rows == HogQL positional -> identical (avg preserved)', async () => {
  const pipeRes = await run({
    queryTinybird: async (p) => p === 'flexible_report_days_to_convert_by_site' ? DTC_PIPE : null,
    queryHog: async (_s, name) => { if (name === 'flexible_report_days_to_convert') throw new Error('must come from the pipe'); return [] }
  }, { site: nextSite(), metric: 'days_to_convert' })
  const hogRes = await run({
    queryTinybird: async () => null,
    queryHog: async (_s, name) => name === 'flexible_report_days_to_convert' ? DTC_HOG : []
  }, { site: nextSite(), metric: 'days_to_convert' })
  assert.deepStrictEqual(arr(pipeRes), arr(hogRes), 'pipe remap == HogQL positional')
  assert.strictEqual(arr(pipeRes).find(r => r.dim_value === 'google').days_to_convert, 3.5, 'average metric carried through the remap')
})

test('days_to_convert — DISPATCH: served from pipe, HogQL NOT called, tenant-scoped', async () => {
  const seen = []; const hog = []
  await run({
    queryTinybird: async (p, params) => { seen.push({ p, params }); return p === 'flexible_report_days_to_convert_by_site' ? DTC_PIPE : null },
    queryHog: async (_s, name) => { hog.push(name); return [] }
  }, { site: 'site-dtc-disp', metric: 'days_to_convert' })
  assert.ok(!hog.includes('flexible_report_days_to_convert'), 'no HogQL read when the pipe serves')
  const call = seen.find(c => c.p === 'flexible_report_days_to_convert_by_site')
  assert.strictEqual(call.params.site_id, 'site-dtc-disp', 'tenant-scoped to the authenticated site_id')
  assert.ok(call.params.date_from && call.params.date_to, 'date bounds passed to the pipe')
})

// ── touchpoints_per_conversion (AVERAGE metric) ─────────────────────────────
const TPC_PIPE = [{ dim_value: 'google', touchpoints_per_conversion: 2.3, conversions: 4 }]
const TPC_HOG = [['google', 2.3, 4]]

test('touchpoints_per_conversion — PARITY: named pipe rows == HogQL positional -> identical (avg preserved)', async () => {
  const pipeRes = await run({
    queryTinybird: async (p) => p === 'flexible_report_touchpoints_per_conversion_by_site' ? TPC_PIPE : null,
    queryHog: async (_s, name) => { if (name === 'flexible_report_touchpoints_per_conversion') throw new Error('must come from the pipe'); return [] }
  }, { site: nextSite(), metric: 'touchpoints_per_conversion' })
  const hogRes = await run({
    queryTinybird: async () => null,
    queryHog: async (_s, name) => name === 'flexible_report_touchpoints_per_conversion' ? TPC_HOG : []
  }, { site: nextSite(), metric: 'touchpoints_per_conversion' })
  assert.deepStrictEqual(arr(pipeRes), arr(hogRes), 'pipe remap == HogQL positional')
  assert.strictEqual(arr(pipeRes).find(r => r.dim_value === 'google').touchpoints_per_conversion, 2.3, 'average metric carried through the remap')
})

// ── flexible_sessions (conversion_rate denominator, BASE-CASE gated) ─────────
// metric=conversion_rate: the main report comes from HogQL 'flexible_report' (not a base pipe);
// then the sessions denominator dispatches flexible_sessions_by_site for the base slice.
const MAIN_HOG = [['google', 5]] // google: 5 conversions (the conversion_rate numerator)

test('flexible_sessions — PARITY: pipe sessions == HogQL sessions -> identical conversion_rate', async () => {
  const pipeRes = await run({
    queryTinybird: async (p) => p === 'flexible_sessions_by_site' ? [{ dim_value: 'google', sessions: 100 }] : null,
    queryHog: async (_s, name) => name === 'flexible_report' ? MAIN_HOG : (name === 'flexible_sessions' ? (() => { throw new Error('sessions must come from the pipe') })() : [])
  }, { site: nextSite(), metric: 'conversion_rate' })
  const hogRes = await run({
    queryTinybird: async () => null,
    queryHog: async (_s, name) => name === 'flexible_report' ? MAIN_HOG : (name === 'flexible_sessions' ? [['google', 100]] : [])
  }, { site: nextSite(), metric: 'conversion_rate' })
  assert.deepStrictEqual(arr(pipeRes), arr(hogRes), 'pipe sessions remap == HogQL positional sessions')
  assert.strictEqual(arr(pipeRes).find(r => r.dim_value === 'google').conversion_rate, 5, '(5 conversions / 100 sessions) * 100 = 5%')
})

test('flexible_sessions — DISPATCH: base case serves sessions from the pipe, no HogQL flexible_sessions', async () => {
  const pipes = []; const hog = []
  await run({
    queryTinybird: async (p) => { pipes.push(p); return p === 'flexible_sessions_by_site' ? [{ dim_value: 'google', sessions: 100 }] : null },
    queryHog: async (_s, name) => { hog.push(name); return name === 'flexible_report' ? MAIN_HOG : [] }
  }, { site: 'site-sess-disp', metric: 'conversion_rate' })
  assert.ok(pipes.includes('flexible_sessions_by_site'), 'base sessions dispatched the pipe')
  assert.ok(!hog.includes('flexible_sessions'), 'no HogQL flexible_sessions read on the pipe-served base case')
})

// THE GATE: non-base sessions shapes MUST fall through to HogQL, never the pipe.
for (const shape of [
  { name: 'model=last_touch (non first_touch)', opts: { model: 'last_touch' } },
  { name: 'group_by=provider (non-source dim)', opts: { groupBy: 'provider' } },
  { name: 'a filter present', opts: { filters: { source: 'google' } } },
  { name: 'group_by2 present', opts: { groupBy2: 'medium' } },
]) {
  test(`flexible_sessions GATE: ${shape.name} does NOT dispatch flexible_sessions_by_site`, async () => {
    const pipes = []; const hog = []
    await run({
      queryTinybird: async (p) => { pipes.push(p); return null },
      queryHog: async (_s, name) => { hog.push(name); return name === 'flexible_report' ? MAIN_HOG : [] }
    }, { site: `site-sess-gate-${shape.name.replace(/\W+/g, '-')}`, metric: 'conversion_rate', ...shape.opts })
    assert.ok(!pipes.includes('flexible_sessions_by_site'), `pipe MUST NOT be queried for: ${shape.name}`)
    assert.ok(hog.includes('flexible_sessions'), `must fall through to HogQL flexible_sessions for: ${shape.name}`)
  })
}
