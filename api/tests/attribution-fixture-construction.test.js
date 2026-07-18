// Construction-truth proof for the Step-2 adversarial fixture (D2 B3 gate item 1). Asserts the engine
// (calculateAttribution) reproduces the HAND-COMPUTED expected splits in scripts/lib/attribution-fixture.mjs
// for the designed journey, and that the same-timestamp TIE is load-bearing (swapping the tied pair moves
// first_touch and the u/w-shaped first-position credit). This validates that the literals the staging
// verifier checks against are correct — the verifier itself compares the STORED row to those literals,
// never to a fresh recompute. TOKEN-FREE, no network.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const { calculateAttribution } = await import('../jobs/nightly-attribution.js')
const { V1, V1_EXPECTED, v1TouchpointsForEngine, projectSplit } = await import('../../scripts/lib/attribution-fixture.mjs')

test('engine reproduces the HAND-COMPUTED splits for all 4 models (pipe order)', () => {
  const r = calculateAttribution(v1TouchpointsForEngine(), V1.conversionValue)
  for (const model of ['linear', 'u_shaped', 'time_decay', 'w_shaped']) {
    assert.deepEqual(
      projectSplit(r[model]),
      V1_EXPECTED[`${model}_attribution`],
      `${model}: engine output must equal the hand-computed literal (source/channel/fraction/attributed_value)`
    )
  }
})

test('each model’s attributed_value sums to the conversion value (reconciled, exact)', () => {
  const r = calculateAttribution(v1TouchpointsForEngine(), V1.conversionValue)
  for (const model of ['linear', 'u_shaped', 'time_decay', 'w_shaped']) {
    const sum = r[model].reduce((s, e) => s + e.attributed_value, 0)
    assert.equal(parseFloat(sum.toFixed(2)), 100, `${model} must sum to 100`)
  }
})

test('first_touch = google, last_touch = direct(null) under the pipe tie order', () => {
  const r = calculateAttribution(v1TouchpointsForEngine(), V1.conversionValue)
  assert.equal(r.first_touch.source, 'google', 'pipe order (event_id) puts google first')
  assert.equal(r.last_touch.source ?? null, null, 'the converting touch is Direct (null source)')
})

test('🔴 the same-timestamp TIE is load-bearing: swapping the tied pair moves first_touch + u-shaped credit', () => {
  const pipeOrder = v1TouchpointsForEngine()                       // [google, ai, fb, direct]
  const hogqlOrder = [pipeOrder[1], pipeOrder[0], pipeOrder[2], pipeOrder[3]] // [ai, google, fb, direct]

  const pipe = calculateAttribution(pipeOrder, V1.conversionValue)
  const hogql = calculateAttribution(hogqlOrder, V1.conversionValue)

  // first_touch flips google ↔ ai
  assert.equal(pipe.first_touch.source, 'google')
  assert.equal(hogql.first_touch.source ?? null, null) // the AI touch has null utm_source
  assert.notEqual(pipe.first_touch.channel ?? pipe.u_shaped[0].channel, hogql.u_shaped[0].channel)

  // google's u-shaped credit collapses 0.4 → 0.1 depending purely on the tiebreak — a real money-rail
  // divergence an aggregate SUM can never see.
  const googleUShaped = (res) => res.u_shaped.find((e) => e.source === 'google').fraction
  assert.equal(googleUShaped(pipe), 0.4, 'pipe order: google is first-position (0.4)')
  assert.equal(googleUShaped(hogql), 0.1, 'hogql order: google demoted to middle (0.1)')
})
