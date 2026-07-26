// Unit tests for the alerts backend plan gate (140Z-A).
// Directly exercises requireFeature / hasFeature from plan-features.js with the
// 'alerts' key.  No Express, PostHog, or Supabase required.

import test from 'node:test'
import assert from 'node:assert'

// plan-features.js has no side-effectful imports — safe to import directly.
const { requireFeature, hasFeature, normalizePlan } = await import('../lib/plan-features.js')

test('Alerts plan gate — feature matrix', async (t) => {
  await t.test('free plan is blocked', () => {
    assert.strictEqual(hasFeature('free', 'alerts'), false)
  })

  await t.test('trial plan is blocked', () => {
    assert.strictEqual(hasFeature('trial', 'alerts'), false)
  })

  // Repackage (plan-features.js): tiers now differentiate on volume, not
  // features — starter matches growth on every FEATURE_MATRIX row, including
  // alerts. Was blocked; now allowed.
  await t.test('starter plan is allowed', () => {
    assert.strictEqual(hasFeature('starter', 'alerts'), true)
  })

  await t.test('growth plan is allowed', () => {
    assert.strictEqual(hasFeature('growth', 'alerts'), true)
  })

  await t.test('scale plan is allowed', () => {
    assert.strictEqual(hasFeature('scale', 'alerts'), true)
  })

  await t.test('inactive plan is blocked', () => {
    assert.strictEqual(hasFeature('inactive', 'alerts'), false)
  })

  await t.test('archived plan is blocked', () => {
    assert.strictEqual(hasFeature('archived', 'alerts'), false)
  })

  await t.test('legacy alias "pro" maps to growth and is allowed', () => {
    assert.strictEqual(normalizePlan('pro'), 'growth')
    assert.strictEqual(hasFeature('pro', 'alerts'), true)
  })

  await t.test('legacy alias "agency" maps to scale and is allowed', () => {
    assert.strictEqual(normalizePlan('agency'), 'scale')
    assert.strictEqual(hasFeature('agency', 'alerts'), true)
  })
})

test('Alerts plan gate — requireFeature returns correct payload', async (t) => {
  await t.test('free plan returns 402 payload', () => {
    const block = requireFeature('free', 'alerts', 'Alerts')
    assert.ok(block, 'should return a block payload for free')
    assert.strictEqual(block.success, false)
    assert.strictEqual(block.upgrade.current_plan, 'free')
    assert.strictEqual(block.upgrade.required_feature, 'alerts')
    assert.ok(block.upgrade.message.includes('free'), 'message should name the plan')
  })

  await t.test('trial plan returns 402 payload', () => {
    const block = requireFeature('trial', 'alerts', 'Alerts')
    assert.ok(block, 'should return a block payload for trial')
    assert.strictEqual(block.upgrade.current_plan, 'trial')
  })

  // Repackage: starter now matches growth (allowed), so requireFeature returns null.
  await t.test('starter plan returns null (allowed)', () => {
    const block = requireFeature('starter', 'alerts', 'Alerts')
    assert.strictEqual(block, null)
  })

  await t.test('growth plan returns null (allowed)', () => {
    const block = requireFeature('growth', 'alerts', 'Alerts')
    assert.strictEqual(block, null)
  })

  await t.test('scale plan returns null (allowed)', () => {
    const block = requireFeature('scale', 'alerts', 'Alerts')
    assert.strictEqual(block, null)
  })

  await t.test('null/undefined plan defaults to free and is blocked', () => {
    const blockNull = requireFeature(null, 'alerts', 'Alerts')
    assert.ok(blockNull, 'null plan should be blocked')
    const blockUndef = requireFeature(undefined, 'alerts', 'Alerts')
    assert.ok(blockUndef, 'undefined plan should be blocked')
  })
})
