// flexible_report DEPTH — the two attribution-depth reads, now Tinybird-SOLE (D1c-1):
//   days_to_convert -> flexible_report_days_to_convert_by_site
//   touchpoints_per_conversion -> flexible_report_touchpoints_per_conversion_by_site
// Each proves (1) the pipe named-row remap yields the expected AVERAGE metric and (2)
// dispatch/no-HogQL/tenant-scope. Post-D1c-1 the HogQL fallback is gone — a null pipe throws
// the loud tinybird-force-read invariant, never a dead-store read. The former third leg,
// flexible_sessions (the conversion_rate denominator, flexible_sessions_by_site), was DELETED
// in D1c-1: conversion_rate is gated → its main read throws [pr4/D1] before the denominator is
// ever reached, so the whole block was dead. The throwsD1 cases below pin that reality.
// Distinct sites per leg avoid the module NodeCache bleeding one leg into the next.

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

test('days_to_convert — REMAP: named pipe rows -> expected avg metric (byte-identical shape)', async () => {
  const pipeRes = await run({
    queryTinybird: async (p) => p === 'flexible_report_days_to_convert_by_site' ? DTC_PIPE : null,
    queryHog: async (_s, name) => { if (name === 'flexible_report_days_to_convert') throw new Error('must come from the pipe'); return [] }
  }, { site: nextSite(), metric: 'days_to_convert' })
  assert.strictEqual(arr(pipeRes).find(r => r.dim_value === 'google').days_to_convert, 3.5, 'average metric carried through the remap')
  assert.strictEqual(arr(pipeRes).find(r => r.dim_value === 'direct').days_to_convert, 1, 'second dim carried through')
})

test('days_to_convert — FORCE-READ: null pipe throws the tinybird-force-read invariant, HogQL NOT called', async () => {
  await assert.rejects(
    run({
      queryTinybird: async () => null,
      queryHog: async () => { throw new Error('HogQL must not be called after the pipe returns null') }
    }, { site: nextSite(), metric: 'days_to_convert' }),
    /tinybird-force-read.*flexible_report_days_to_convert_by_site returned null/,
    'a null depth pipe must throw the loud force-read invariant, not fall back'
  )
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

test('touchpoints_per_conversion — REMAP: named pipe rows -> expected avg metric (byte-identical shape)', async () => {
  const pipeRes = await run({
    queryTinybird: async (p) => p === 'flexible_report_touchpoints_per_conversion_by_site' ? TPC_PIPE : null,
    queryHog: async (_s, name) => { if (name === 'flexible_report_touchpoints_per_conversion') throw new Error('must come from the pipe'); return [] }
  }, { site: nextSite(), metric: 'touchpoints_per_conversion' })
  assert.strictEqual(arr(pipeRes).find(r => r.dim_value === 'google').touchpoints_per_conversion, 2.3, 'average metric carried through the remap')
})

test('touchpoints_per_conversion — FORCE-READ: null pipe throws the tinybird-force-read invariant, HogQL NOT called', async () => {
  await assert.rejects(
    run({
      queryTinybird: async () => null,
      queryHog: async () => { throw new Error('HogQL must not be called after the pipe returns null') }
    }, { site: nextSite(), metric: 'touchpoints_per_conversion' }),
    /tinybird-force-read.*flexible_report_touchpoints_per_conversion_by_site returned null/,
    'a null depth pipe must throw the loud force-read invariant, not fall back'
  )
})

// ── flexible_sessions (conversion_rate denominator) — the conversion_rate MAIN read is GONE ────
// conversion_rate is GATED ENTIRELY (dashboard/src/lib/gate-constants.js) → 422 at the route, so in
// prod it never reaches the engine. Driven DIRECTLY here, its main numerator read is not a pipe
// metric → pipe=NONE → the flexible_report read D1 DELETED → it now throws the [pr4/D1] "FIX THE
// ALLOWLIST" invariant. The sessions denominator (flexible_sessions_by_site) was the leg's ONLY
// trigger via `if (metric === 'conversion_rate')`, and the main read throws first — so that whole
// block was dead. D1c-1 DELETED it (flexible_sessions_by_site is no longer dispatched anywhere in
// the engine). These 6 tests pin that reality: every conversion_rate shape throws before any
// flexible_sessions dispatch (and there is no longer a flexible_sessions dispatch to reach).
async function throwsD1 (opts) {
  const pipes = []
  await assert.rejects(
    run({
      queryTinybird: async (p) => { pipes.push(p); return null },
      queryHog: async () => { throw new Error('D1: flexible_report HogQL leg is deleted — must not be called') }
    }, { site: nextSite(), metric: 'conversion_rate', ...opts }),
    /\[pr4\/D1\]/,
    `conversion_rate ${JSON.stringify(opts)} must throw the D1 pipe-only invariant`
  )
  assert.ok(!pipes.includes('flexible_sessions_by_site'),
    'flexible_sessions is unreachable — the conversion_rate main read throws before its denominator')
}

test('flexible_sessions — D1: conversion_rate base case throws [pr4/D1] (main read is the deleted pipe=NONE read)', () => throwsD1({}))
test('flexible_sessions — D1: conversion_rate + source/first_touch throws before any flexible_sessions read', () => throwsD1({ groupBy: 'source', model: 'first_touch' }))

// The former GATE shapes — all conversion_rate, all now throw [pr4/D1] at the main read (never the pipe).
for (const shape of [
  { name: 'model=last_touch (non first_touch)', opts: { model: 'last_touch' } },
  { name: 'group_by=provider (non-source dim)', opts: { groupBy: 'provider' } },
  { name: 'a filter present', opts: { filters: { source: 'google' } } },
  { name: 'group_by2 present', opts: { groupBy2: 'medium' } },
]) {
  test(`flexible_sessions — D1: conversion_rate + ${shape.name} throws [pr4/D1] (never reaches flexible_sessions)`, () => throwsD1(shape.opts))
}
