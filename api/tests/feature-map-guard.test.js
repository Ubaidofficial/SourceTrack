// Tests for scripts/feature-map-guard.mjs.
//
// THE POINT OF THIS FILE: the guard exists because FEATURE_MAP.md drifted 92 PRs
// (#466 → #664) against one update, and the doc's own header names the cause — freshness
// rule (2) "CC must update this file in the SAME PR" is FORBIDDEN by CLAUDE.md §9 rule 3,
// which requires the session-doc (*.md) diff to be empty. A guard shipped to fix that must
// itself be proven able to fail, or it becomes the seventh instance of this session's
// recurring defect: a check that reports cleanly because nothing can make it red.

import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, TRIGGER_PATHS, MAP } from '../../scripts/feature-map-guard.mjs'

test('🔴 CONTROL: a route-only change with no map update is a violation', () => {
  const r = evaluate(['api/routes/track.js', 'api/lib/bot-filter.js'])
  assert.equal(r.violation, true, 'the guard MUST flag a trigger-path change with no map update')
  assert.deepEqual(r.triggered, ['api/routes/track.js'])
})

test('🔴 CONTROL: the same change WITH the map is clean', () => {
  const r = evaluate(['api/routes/track.js', 'api/lib/bot-filter.js', MAP])
  assert.equal(r.violation, false, 'including the map must clear the guard')
  assert.equal(r.mapUpdated, true)
})

test('a dashboard page counts as a trigger path, same as a route', () => {
  assert.equal(evaluate(['dashboard/src/pages/Billing.jsx']).violation, true)
})

test('NEGATIVE CONTROL: a change touching neither trigger path is not flagged', () => {
  // Without this the guard could be flagging everything and the first two tests would
  // still pass. Most PRs in the measured window are exactly this shape.
  const r = evaluate(['api/lib/plan-features.js', 'marketing/src/pages/index.astro', 'KNOWN_ISSUES.md'])
  assert.equal(r.violation, false)
  assert.deepEqual(r.triggered, [], 'no trigger path touched, so nothing to demand')
})

test('a recorded opt-out clears the guard — and only in the documented form', () => {
  const files = ['api/routes/track.js']
  assert.equal(evaluate(files, 'feature-map: n/a — log-only instrumentation, no capability change').violation, false)
  // A bare mention must NOT clear it, or the escape hatch becomes accidental.
  assert.equal(evaluate(files, 'this PR does not really change the feature map').violation, true)
  assert.equal(evaluate(files, 'feature-map: n/a').violation, true, 'an opt-out with no reason must not count')
})

test('the trigger list is exactly the two paths the doc recommends', () => {
  // Pins the SCOPE. Widening it is a deliberate decision with a measured false-positive
  // cost (see the PR body), not something that should drift in unnoticed.
  assert.equal(TRIGGER_PATHS.length, 2)
  assert.ok(TRIGGER_PATHS.some(re => re.test('api/routes/x.js')))
  assert.ok(TRIGGER_PATHS.some(re => re.test('dashboard/src/pages/X.jsx')))
  assert.ok(!TRIGGER_PATHS.some(re => re.test('api/lib/x.js')), 'api/lib is deliberately NOT a trigger')
})
