#!/usr/bin/env node
// SourceTrack — Phase 9 offline replay verifier. READ-ONLY, ZERO CREDENTIALS.
//
// Replays the committed real-store snapshots (tinybird/qa/phase4_snapshots/ —
// captured 2026-07-03 from PostHog 469905 + deployed ST_Staging pipes) through
// the SAME pure comparators the live harness uses (exported from
// tinybird/tools/phase4_touchpoint_diff.js), and asserts the results against
// tinybird/qa/phase4_expected/expected_results.json.
//
// This is the "reproducible from a clean checkout" PASS artifact for 6/9
// attribution models: Pattern B (time_decay/linear/u_shaped/w_shaped, cc-4a),
// last_touch (cc-4c, picked-value per-field), ai_platforms (cc-4d, credited
// platform via the REAL selectAiTouchForConversion). It needs node_modules
// (npm ci) and nothing else — no PostHog key, no Tinybird token.
//
// What it does NOT prove: that the LIVE stores still match each other today.
// That's the live runner's job (tinybird/tools/run_phase4_diff.mjs, founder-run
// with real tokens). This file proves the comparator logic + the recorded
// store states — so a regression in either comparator or an accidental
// snapshot edit fails loudly in any environment, including CI.
//
// Run from repo root:  node tinybird/qa/phase4_replay_verify.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// selectAiTouchForConversion lives in attribution-engine.js, whose import graph
// loads posthog.js — which constructs its capture client AT MODULE LOAD and
// throws on a falsy POSTHOG_API_KEY (posthog.js:13). The capture client is
// never used here (pure JS selection only); stub it exactly like
// run_phase4_diff.mjs does, BEFORE the dynamic import (static imports hoist).
if (!process.env.POSTHOG_API_KEY) {
  process.env.POSTHOG_API_KEY = 'mock-unused-by-replay-verifier'
}

const { comparePatternBSets, compareLastTouchPicks, compareAiPlatformCredits } =
  await import('../tools/phase4_touchpoint_diff.js')
const { selectAiTouchForConversion } = await import('../../api/lib/attribution-engine.js')

const here = dirname(fileURLToPath(import.meta.url))
const load = (rel) => JSON.parse(readFileSync(join(here, rel), 'utf8'))

const cc4a = load('phase4_snapshots/cc4a_pattern_b.json')
const cc4c = load('phase4_snapshots/cc4c_last_touch.json')
const cc4d = load('phase4_snapshots/cc4d_ai_platforms.json')
const expected = load('phase4_expected/expected_results.json')

let failures = 0
const check = (label, actual, want) => {
  const ok = JSON.stringify(actual) === JSON.stringify(want)
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : `  (expected ${JSON.stringify(want)})`}`)
  if (!ok) failures++
  return ok
}

console.log('─'.repeat(72))
console.log('[phase4-replay] Pattern B (time_decay/linear/u_shaped/w_shaped) — cc-4a')
const b = comparePatternBSets({
  hogqlConversions: cc4a.posthog.conversions,
  hogqlPageviews: cc4a.posthog.pageviews,
  tbConversions: cc4a.tinybird.conversions,
  tbPageviews: cc4a.tinybird.pageviews,
  windowDays: cc4a._meta.window.windowDays,
  fixturePrefix: 'cc-4a-'
})
check('totalConversions', b.totalConversions, expected.pattern_b.totalConversions)
check('conversionsHogqlOnly', b.conversionsHogqlOnly.length, expected.pattern_b.conversionsHogqlOnly)
check('conversionsTinybirdOnly', b.conversionsTinybirdOnly.length, expected.pattern_b.conversionsTinybirdOnly)
check('touchpointMismatches', b.mismatches.length, expected.pattern_b.touchpointMismatches)
check('pass', b.pass, true)

console.log('─'.repeat(72))
console.log('[phase4-replay] last_touch (picked-value, per-field) — cc-4c')
const lt = compareLastTouchPicks(cc4c.posthog_picks, cc4c.tinybird_picks, {
  tieDistinctIds: cc4c._meta.tie_distinct_ids
})
check('totalConversions', lt.totalConversions, expected.last_touch.totalConversions)
check('non_tie_mismatches', lt.mismatches.length, expected.last_touch.non_tie_mismatches)
check('conversion set parity', lt.conversionsHogqlOnly.length + lt.conversionsTinybirdOnly.length, 0)
for (const row of lt.rows) {
  const want = expected.last_touch.picks[row.distinct_id]
  const got = Object.fromEntries(Object.entries(row.fields).map(([f, v]) => [f, v.hogql]))
  check(`picks[${row.distinct_id}] (hogql leg vs expected)`, got, want)
  const gotTb = Object.fromEntries(Object.entries(row.fields).map(([f, v]) => [f, v.tinybird]))
  check(`picks[${row.distinct_id}] (tinybird leg vs expected)`, gotTb, want)
}
for (const tie of lt.tieReport) {
  console.log(`ℹ️  tie row ${tie.distinct_id}: cross-store agreement=${tie.agreement} — ${tie.agreement ? 'bonus confirmation' : 'DOCUMENTED AMBIGUITY (4C §5), not a parity failure'}`)
}
check('pass', lt.pass, true)

console.log('─'.repeat(72))
console.log('[phase4-replay] ai_platforms (credited platform, real selector) — cc-4d')
const ai = compareAiPlatformCredits({
  hogqlConversions: cc4d.posthog.conversions,
  hogqlPageviews: cc4d.posthog.pageviews,
  tbConversions: cc4d.tinybird.conversions,
  tbPageviews: cc4d.tinybird.pageviews,
  windowDays: cc4d._meta.window.windowDays,
  selectAiTouch: selectAiTouchForConversion
})
check('totalConversions (presence guard incl. no-credit visitorS)', ai.totalConversions, expected.ai_platforms.totalConversions)
check('creditMismatches', ai.creditMismatches.length, expected.ai_platforms.creditMismatches)
check('rowSetMismatches', ai.rowSetMismatches.length, expected.ai_platforms.rowSetMismatches)
for (const c of ai.credits) {
  const want = expected.ai_platforms.credits[c.distinct_id]
  check(`credit[${c.distinct_id}]`, { hogql: c.hogql, tinybird: c.tinybird }, { hogql: want, tinybird: want })
}
check('pass', ai.pass, true)

console.log('─'.repeat(72))
if (failures === 0) {
  console.log('[phase4-replay] PASS 6/9 models: Pattern B conversionsHogqlOnly=0 conversionsTinybirdOnly=0 touchpointMismatches=0; last_touch per-field picks parity (tie row agreed); ai_platforms credited-platform parity incl. negative case.')
  console.log('[phase4-replay] NOT covered: first_touch / first_touch_non_direct / last_touch_non_direct (fixtures recorded, not ingested — cutover gate), aggregate-layer diff, cross-store idempotency.')
  process.exit(0)
}
console.error(`[phase4-replay] FAIL — ${failures} assertion(s) failed. Do NOT loosen comparators or edit snapshots to force green; investigate which side drifted.`)
process.exit(1)
