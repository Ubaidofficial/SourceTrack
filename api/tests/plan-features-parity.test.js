// Frontend/backend entitlement PARITY.
//
// dashboard/src/lib/reportGating.js:8 has always documented the rule — "api/lib/
// plan-features.js and dashboard/src/lib/planFeatures.js must be edited in lockstep" —
// and nothing enforced it. The two tables drifted on 17 (key, tier) pairs before anyone
// noticed, and the drift was invisible in review because each file reads as internally
// consistent. This test is what the comment always needed behind it.
//
// WHY IT COMPARES hasFeature() AND NOT THE TWO OBJECTS DIRECTLY
// The frontend's FEATURE_MATRIX is a module-private const. Exporting it purely so a test
// could read it would widen the production API for the test's convenience, and it would
// pin the literal rather than the behaviour. Every consumer reaches the table through
// hasFeature(), so that is the surface worth pinning: it also covers normalizePlan()'s
// alias handling (pro->growth, agency/business->scale), which a raw object diff misses
// entirely. If the two modules ever answer the same question differently, this fails —
// regardless of how the tables are shaped internally.
//
// WHAT DRIFT LOOKED LIKE, so the failure message is recognisable:
//   · UI OVER-LOCKS  — backend grants it, UI hides it. A paying customer is told to
//     upgrade for something they already own. This was 13 of the 17.
//   · UI UNDER-LOCKS — UI offers it, backend refuses. The user hits a wall after being
//     invited through the door. multi_user was true on trial/starter/growth/scale here
//     while the backend granted it on no tier at any price.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'

const backend = await import('../lib/plan-features.js')
const frontend = await import('../../dashboard/src/lib/planFeatures.js')

const TIERS = ['free', 'trial', 'starter', 'growth', 'scale']

test('every backend feature key resolves identically on the frontend, for every tier', () => {
  const keys = Object.keys(backend.FEATURE_MATRIX)
  assert.ok(keys.length > 0, 'backend FEATURE_MATRIX is empty — did the export shape change?')

  const drift = []
  for (const key of keys) {
    for (const tier of TIERS) {
      const b = backend.hasFeature(tier, key)
      const f = frontend.hasFeature(tier, key)
      if (b !== f) {
        drift.push(`  ${key} @ ${tier}: backend=${b} frontend=${f} — UI ${b ? 'OVER' : 'UNDER'}-LOCKS`)
      }
    }
  }

  assert.deepEqual(
    drift, [],
    'dashboard/src/lib/planFeatures.js has drifted from api/lib/plan-features.js.\n' +
    drift.join('\n') +
    '\n\nThe BACKEND is the source of truth — it carries the design rationale and it is what\n' +
    'enforces access. Sync the dashboard table TO it, never the reverse.'
  )
})

test('plan aliases resolve identically on both sides', () => {
  // pro/agency/business are legacy plan names still present on real rows. If the two
  // modules disagree on what those normalise to, every feature answer for those customers
  // diverges at once — a whole-tier failure that a key-by-key diff on canonical names
  // would not surface.
  for (const alias of Object.keys(backend.PLAN_ALIASES)) {
    assert.equal(
      frontend.normalizePlan(alias), backend.normalizePlan(alias),
      `plan alias '${alias}' normalises differently: backend=${backend.normalizePlan(alias)} frontend=${frontend.normalizePlan(alias)}`
    )
  }
})

test('multi_user is false on every tier, both sides', () => {
  // Pinned on its own because it was wrong in the rarer and more damaging direction: the
  // UI advertised it on trial/starter/growth/scale while the backend granted it nowhere.
  // A bulk parity pass would keep this honest, but only as long as both sides move
  // together — this asserts the ACTUAL value, so re-enabling it in the UI alone fails here
  // even if someone "fixed" parity by flipping the backend to match.
  for (const tier of TIERS) {
    assert.equal(backend.hasFeature(tier, 'multi_user'), false, `backend grants multi_user on ${tier}`)
    assert.equal(frontend.hasFeature(tier, 'multi_user'), false, `frontend offers multi_user on ${tier}`)
  }
})

test('every feature key that can raise an upgrade prompt has a label', () => {
  // FEATURE_LABELS supplies the friendly name in upgrade-prompt UI. A key in the matrix
  // with no label renders a prompt with nothing to call the feature. webhook_outbound,
  // live_analytics and last_touch_attribution were all missing.
  for (const key of Object.keys(backend.FEATURE_MATRIX)) {
    assert.ok(
      typeof frontend.FEATURE_LABELS[key] === 'string' && frontend.FEATURE_LABELS[key].length > 0,
      `FEATURE_LABELS is missing a label for '${key}' — an upgrade prompt for it would render unnamed`
    )
  }
})
