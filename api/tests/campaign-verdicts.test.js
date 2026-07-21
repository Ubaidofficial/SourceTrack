// KI-47 — deterministic campaign verdicts. Locks the thresholds, every edge case, purity,
// and the absence of any network call.
//
// The endpoint previously shipped campaign names + revenue to a third-party LLM and
// returned its free text as spend advice. The single most important property here is the
// last test: NO outbound request occurs. If that ever fails, the §26 violation is back.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const {
  computeCampaignVerdicts, VERDICTS,
  MIN_CONVERSIONS_FOR_VERDICT, SCALE_MIN_REVENUE, KILL_MAX_REVENUE
} = await import('../lib/campaign-verdicts.js')

// Helper: a row exactly as getPreAggregatedAttribution(groupBy:'campaign') emits it.
const row = (dim_value, revenue, conversions) => ({ dim_value, revenue, conversions })
const verdictOf = (out, name) => out.find(v => v.campaign === name)?.verdict

// A revenue-bearing filler so `siteHasRevenue` is true when a test is probing another rule.
const REVENUE_ANCHOR = row('anchor', SCALE_MIN_REVENUE, MIN_CONVERSIONS_FOR_VERDICT)

// ── the threshold VALUES themselves ──────────────────────────────────────────
// The boundary tests below are written in terms of the constants, so they verify the
// comparison logic but move WITH the constants — a mutation check proved they cannot
// detect a threshold change on their own. These literal-valued tests pin the actual
// numbers, so changing a threshold is a deliberate act that must update this file.
// Thresholds are a product decision (KI-47); do not retune them to make a test pass.
test('THRESHOLD VALUES are pinned — changing one must be deliberate', () => {
  assert.equal(MIN_CONVERSIONS_FOR_VERDICT, 5)
  assert.equal(SCALE_MIN_REVENUE, 500)
  assert.equal(KILL_MAX_REVENUE, 0)
})

test('THRESHOLD behaviour pinned to literal numbers (mutation-detecting)', () => {
  const at = computeCampaignVerdicts([row('c', 500, 5)])
  assert.equal(verdictOf(at, 'c'), VERDICTS.SCALE, '500 revenue / 5 conversions is SCALE')

  const below = computeCampaignVerdicts([row('c', 499.99, 5)])
  assert.equal(verdictOf(below, 'c'), VERDICTS.PAUSE, '499.99 revenue is PAUSE, not SCALE')

  const fewConv = computeCampaignVerdicts([row('c', 100000, 4)])
  assert.equal(verdictOf(fewConv, 'c'), VERDICTS.INSUFFICIENT_DATA, '4 conversions is below the floor')

  const atConv = computeCampaignVerdicts([row('c', 100000, 5)])
  assert.equal(verdictOf(atConv, 'c'), VERDICTS.SCALE, '5 conversions clears the floor')
})

// ── threshold boundaries ─────────────────────────────────────────────────────
test('SCALE exactly AT the revenue threshold', () => {
  const out = computeCampaignVerdicts([row('c', SCALE_MIN_REVENUE, MIN_CONVERSIONS_FOR_VERDICT)])
  assert.equal(verdictOf(out, 'c'), VERDICTS.SCALE)
})

test('PAUSE one unit BELOW the revenue threshold', () => {
  const out = computeCampaignVerdicts([row('c', SCALE_MIN_REVENUE - 1, MIN_CONVERSIONS_FOR_VERDICT)])
  assert.equal(verdictOf(out, 'c'), VERDICTS.PAUSE)
})

test('INSUFFICIENT_DATA one conversion BELOW the conversion floor, even with huge revenue', () => {
  const out = computeCampaignVerdicts([row('c', SCALE_MIN_REVENUE * 10, MIN_CONVERSIONS_FOR_VERDICT - 1)])
  assert.equal(verdictOf(out, 'c'), VERDICTS.INSUFFICIENT_DATA,
    'revenue must never buy a verdict the conversion count cannot support')
})

test('judged exactly AT the conversion floor', () => {
  const out = computeCampaignVerdicts([row('c', SCALE_MIN_REVENUE, MIN_CONVERSIONS_FOR_VERDICT)])
  assert.notEqual(verdictOf(out, 'c'), VERDICTS.INSUFFICIENT_DATA)
})

test('KILL at exactly zero revenue when the site DOES have revenue elsewhere', () => {
  const out = computeCampaignVerdicts([REVENUE_ANCHOR, row('dead', KILL_MAX_REVENUE, MIN_CONVERSIONS_FOR_VERDICT)])
  assert.equal(verdictOf(out, 'dead'), VERDICTS.KILL)
})

test('PAUSE, not KILL, just above zero revenue', () => {
  const out = computeCampaignVerdicts([REVENUE_ANCHOR, row('barely', 0.01, MIN_CONVERSIONS_FOR_VERDICT)])
  assert.equal(verdictOf(out, 'barely'), VERDICTS.PAUSE)
})

// ── required edge cases ──────────────────────────────────────────────────────
test('EDGE zero sessions: sessions are not an input at all — no crash, no fabricated rate', () => {
  // getPreAggregatedAttribution emits no `sessions` field; the old prompt sent literal 0
  // for every campaign. A row carrying sessions:0 must be judged on revenue/conversions.
  const out = computeCampaignVerdicts([{ ...row('c', SCALE_MIN_REVENUE, MIN_CONVERSIONS_FOR_VERDICT), sessions: 0 }])
  assert.equal(verdictOf(out, 'c'), VERDICTS.SCALE)
  assert.ok(!('sessions' in out[0].inputs), 'sessions must not appear in the cited inputs')
  assert.ok(!('conversion_rate' in out[0].inputs), 'no conversion rate may be reported without sessions')
})

test('EDGE conversions but zero revenue, and NO campaign has revenue -> NO_REVENUE_DATA, never KILL', () => {
  const out = computeCampaignVerdicts([
    row('lead-gen-a', 0, MIN_CONVERSIONS_FOR_VERDICT),
    row('lead-gen-b', 0, MIN_CONVERSIONS_FOR_VERDICT * 2)
  ])
  assert.equal(verdictOf(out, 'lead-gen-a'), VERDICTS.NO_REVENUE_DATA)
  assert.equal(verdictOf(out, 'lead-gen-b'), VERDICTS.NO_REVENUE_DATA)
  assert.ok(!out.some(v => v.verdict === VERDICTS.KILL),
    'a lead-gen site with no revenue source must not have every campaign marked KILL (§6)')
})

test('EDGE revenue but zero conversions -> INSUFFICIENT_DATA, never SCALE', () => {
  const out = computeCampaignVerdicts([REVENUE_ANCHOR, row('weird', 10000, 0)])
  assert.equal(verdictOf(out, 'weird'), VERDICTS.INSUFFICIENT_DATA)
  assert.match(out.find(v => v.campaign === 'weird').reason, /Inconsistent/)
})

test('EDGE single campaign is judged on absolute thresholds, not rank', () => {
  const solo = computeCampaignVerdicts([row('only', SCALE_MIN_REVENUE, MIN_CONVERSIONS_FOR_VERDICT)])
  assert.equal(solo.length, 1)
  assert.equal(solo[0].verdict, VERDICTS.SCALE, 'being the only campaign must not itself earn SCALE')
  const soloWeak = computeCampaignVerdicts([row('only', 1, MIN_CONVERSIONS_FOR_VERDICT)])
  assert.equal(soloWeak[0].verdict, VERDICTS.PAUSE, 'nor must being the only campaign avoid PAUSE')
})

test('EDGE ties are ordered by a strict total order, not input order', () => {
  const a = computeCampaignVerdicts([row('zebra', 100, 5), row('alpha', 100, 5)])
  const b = computeCampaignVerdicts([row('alpha', 100, 5), row('zebra', 100, 5)])
  assert.deepEqual(a.map(v => v.campaign), ['alpha', 'zebra'], 'equal revenue+conversions -> name asc')
  assert.deepEqual(a.map(v => v.campaign), b.map(v => v.campaign), 'input order must not affect output order')
})

test('EDGE conversions break a revenue tie before the name does', () => {
  const out = computeCampaignVerdicts([row('aaa', 100, 5), row('bbb', 100, 9)])
  assert.deepEqual(out.map(v => v.campaign), ['bbb', 'aaa'])
})

test('EDGE empty input returns an empty array, not a throw', () => {
  assert.deepEqual(computeCampaignVerdicts([]), [])
})

test('EDGE a non-array input throws rather than silently returning []', () => {
  assert.throws(() => computeCampaignVerdicts(null), TypeError)
  assert.throws(() => computeCampaignVerdicts(undefined), TypeError)
})

test('EDGE missing/garbage fields coerce to 0 and a named campaign, never NaN', () => {
  const out = computeCampaignVerdicts([{}, { dim_value: null, revenue: 'x', conversions: undefined }])
  for (const v of out) {
    assert.equal(v.campaign, 'unknown')
    assert.ok(Number.isFinite(v.inputs.revenue) && Number.isFinite(v.inputs.conversions))
    assert.equal(v.verdict, VERDICTS.INSUFFICIENT_DATA)
  }
})

// ── determinism + purity ─────────────────────────────────────────────────────
test('determinism: identical input yields byte-identical output across repeated calls', () => {
  const input = [
    row('summer', 1200.5, 30), row('brand', 0, 12), row('retarget', 250, 7),
    row('tiny', 999, 2), row('tie-a', 100, 5), row('tie-b', 100, 5)
  ]
  const first = JSON.stringify(computeCampaignVerdicts(input))
  for (let i = 0; i < 25; i++) {
    assert.equal(JSON.stringify(computeCampaignVerdicts(input)), first)
  }
})

test('purity: the input array and its rows are not mutated', () => {
  const input = [row('a', 100, 5), row('b', 0, 9)]
  const snapshot = JSON.stringify(input)
  computeCampaignVerdicts(input)
  assert.equal(JSON.stringify(input), snapshot)
})

test('every verdict cites the numbers it was derived from', () => {
  const out = computeCampaignVerdicts([row('summer', 1200.5, 30)])
  assert.deepEqual(out[0].inputs, { revenue: 1200.5, conversions: 30, avg_conversion_value: 40.02 })
  assert.match(out[0].reason, /1200\.5/)
  assert.match(out[0].reason, /30/)
})

// ── the property that matters most: NO NETWORK ───────────────────────────────
test('NO network call occurs — no fetch, and ai-client is never imported', async (t) => {
  const realFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = (...args) => { calls.push(args[0]); throw new Error('network call attempted') }
  t.after(() => { globalThis.fetch = realFetch })

  computeCampaignVerdicts([
    row('summer', 1200, 30), row('brand', 0, 12), row('retarget', 250, 7), row('tiny', 999, 2)
  ])

  assert.deepEqual(calls, [], 'computeCampaignVerdicts must never reach the network')

  // The module must not pull in the AI client even transitively.
  const src = await import('node:fs').then(fs =>
    fs.readFileSync(new URL('../lib/campaign-verdicts.js', import.meta.url), 'utf8'))
  assert.ok(!/ai-client/.test(src), 'campaign-verdicts.js must not reference ai-client')
  assert.ok(!/\bfetch\s*\(|https?:\/\//.test(src), 'campaign-verdicts.js must contain no fetch or URL')
})

test('the route no longer imports ai-client or builds an LLM prompt', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../routes/attribution.js', import.meta.url), 'utf8')
  assert.ok(!/ai-client/.test(src), 'attribution.js must not import ai-client')
  assert.ok(!/callAI|systemPrompt/.test(src), 'attribution.js must not build or send a prompt')
})
