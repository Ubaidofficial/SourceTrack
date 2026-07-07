// Golden/invariant regression tests for the SHARED attribution model
// (api/lib/attribution-model.js) — the single source of truth imported by both the
// live read path and the nightly write path. Catches the drift class that caused the
// two-engine divergence (reconciliation, time_decay NaN-guard, field set).
//
// Conventions match api/tests/attribution.test.js (node:test, node:assert, dynamic
// import, assertClose/EPSILON). The module is pure, but we set mock env for parity
// with the sibling suite's setup.
process.env.POSTHOG_API_KEY = 'mock-posthog-api-key-for-tests';

import test from 'node:test';
import assert from 'node:assert';

const { calculateAttribution } = await import('../lib/attribution-model.js');

const EPSILON = 1e-9;
function assertClose(actual, expected, message) {
  if (Math.abs(actual - expected) > EPSILON) {
    assert.fail(message || `Expected ${actual} to be close to ${expected}`);
  }
}

const MODELS = ['linear', 'u_shaped', 'time_decay', 'w_shaped'];

test('Shared attribution model — invariants', async (t) => {

  await t.test('(1) Reconciliation: attributed_value sums to conversionValue, fraction sums to 1.0', () => {
    // Rounding-prone value (100.25 over 3 touches) — the last element must absorb the residual.
    const touchpoints = [
      { timestamp: '2026-06-01T10:00:00Z', utm_source: 'google', referrer: 'https://google.com' },
      { timestamp: '2026-06-02T10:00:00Z', utm_source: 'email' },
      { timestamp: '2026-06-03T10:00:00Z', utm_source: 'facebook', referrer: 'https://facebook.com' }
    ];
    const conversionValue = 100.25;
    const result = calculateAttribution(touchpoints, conversionValue);
    for (const model of MODELS) {
      const shares = result[model];
      let sumValue = 0, sumFrac = 0;
      for (const s of shares) {
        assert.ok(!Number.isNaN(s.attributed_value), `NaN attributed_value in ${model}`);
        assert.ok(!Number.isNaN(s.fraction), `NaN fraction in ${model}`);
        assert.ok(s.attributed_value >= 0, `negative attributed_value in ${model}`);
        sumValue += s.attributed_value;
        sumFrac += s.fraction;
      }
      assertClose(sumValue, conversionValue, `attributed_value must sum to conversionValue for ${model}`);
      assertClose(sumFrac, 1.0, `fraction must sum to 1.0 for ${model}`);
    }
  });

  await t.test('(2) NaN-guard: invalid timestamp yields no NaN in time_decay, equal weights', () => {
    // One touchpoint has an unparseable timestamp. PRE-FIX behavior (no hasInvalid guard)
    // produced NaN weights -> NaN fraction/attributed_value written to attributed_conversions.
    // The guard falls back to equal weights, so this test FAILS against the pre-fix engine.
    const touchpoints = [
      { timestamp: '2026-06-01T10:00:00Z', utm_source: 'google' },
      { timestamp: 'not-a-date',           utm_source: 'facebook' },
      { timestamp: '2026-06-09T10:00:00Z', utm_source: 'reddit' }
    ];
    const conversionValue = 100.00;
    const result = calculateAttribution(touchpoints, conversionValue);

    let sumValue = 0, sumFrac = 0;
    for (const s of result.time_decay) {
      assert.ok(!Number.isNaN(s.fraction), 'time_decay fraction must not be NaN under invalid timestamp');
      assert.ok(!Number.isNaN(s.attributed_value), 'time_decay attributed_value must not be NaN under invalid timestamp');
      sumValue += s.attributed_value;
      sumFrac += s.fraction;
    }
    assertClose(sumValue, conversionValue, 'time_decay credit conserved under invalid timestamp');
    assertClose(sumFrac, 1.0, 'time_decay fraction conserved under invalid timestamp');
    // Equal-weight fallback: the two non-last shares are equal (1/3 each pre-reconciliation).
    assertClose(result.time_decay[0].fraction, result.time_decay[1].fraction, 'invalid-ts fallback must be equal weights');
  });

  await t.test('(3) Single-touch: 100% credit, no NaN', () => {
    const touchpoints = [
      { timestamp: '2026-06-01T10:00:00Z', utm_source: 'tiktok', utm_medium: 'paid' }
    ];
    const conversionValue = 230.03;
    const result = calculateAttribution(touchpoints, conversionValue);
    assert.strictEqual(result.first_touch.source, 'tiktok');
    assert.strictEqual(result.last_touch.source, 'tiktok');
    for (const model of MODELS) {
      assert.strictEqual(result[model].length, 1, `${model} single-touch length`);
      assertClose(result[model][0].fraction, 1.0, `${model} single-touch fraction`);
      assertClose(result[model][0].attributed_value, conversionValue, `${model} single-touch value`);
      assert.ok(!Number.isNaN(result[model][0].attributed_value), `${model} single-touch not NaN`);
    }
  });

  await t.test('(4) Union field set present on tpBase output (all STEP-2 keys emitted)', () => {
    const touchpoints = [
      {
        timestamp: '2026-06-01T10:00:00Z',
        utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'search', utm_term: 'shoes',
        referrer: 'https://google.com/', derived_source: 'google', ai_source: null,
        country: 'US', device: 'desktop', browser: 'chrome', landing_page: '/pricing',
        custom_plan: 'pro'
      }
    ];
    const result = calculateAttribution(touchpoints, 50.00);
    const share = result.linear[0];
    const requiredKeys = [
      'source', 'medium', 'campaign', 'keyword', 'utm_term', 'referrer_domain',
      'derived_source', 'channel', 'timestamp', 'country', 'device', 'browser', 'landing_page'
    ];
    for (const k of requiredKeys) {
      assert.ok(Object.prototype.hasOwnProperty.call(share, k), `union key '${k}' must be present on tpBase output`);
    }
    // read-through values (not computed here)
    assert.strictEqual(share.keyword, 'shoes');
    assert.strictEqual(share.utm_term, 'shoes');
    assert.strictEqual(share.derived_source, 'google');
    assert.strictEqual(share.referrer_domain, 'google.com');
    // custom_* passthrough
    assert.strictEqual(share.custom_plan, 'pro');
  });

});
