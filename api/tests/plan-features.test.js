import test from 'node:test'
import assert from 'node:assert'
import { hasFeature, getStructuralLimits } from '../lib/plan-features.js'

// Starter must be internally consistent: it is gated OUT of outbound webhooks,
// so its advertised webhook quota must be 0 (not 5). The flag is the gate; the
// quota must not advertise a feature the plan can't use.
test('starter — outbound webhooks denied AND quota is 0 (consistent)', () => {
  assert.strictEqual(hasFeature('starter', 'webhook_outbound'), false)
  assert.strictEqual(getStructuralLimits('starter').webhooks, 0)
})

// Guard the rest of the matrix so flag and quota stay aligned per plan:
// a non-zero webhook quota must imply the feature is enabled, and vice versa.
test('webhook flag and quota agree across all plans', () => {
  for (const plan of ['free', 'trial', 'starter', 'growth', 'scale']) {
    const enabled = hasFeature(plan, 'webhook_outbound')
    const quota = getStructuralLimits(plan).webhooks
    assert.strictEqual(
      enabled, quota > 0,
      `${plan}: webhook_outbound=${enabled} but webhooks quota=${quota} (must match)`
    )
  }
})
