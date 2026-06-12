// Set mock environment variables before importing modules to prevent PostHog client initialization from throwing.
process.env.POSTHOG_API_KEY = 'mock-posthog-api-key-for-tests';
process.env.POSTHOG_HOST = 'https://mock.posthog.com';
process.env.POSTHOG_PROJECT_ID = '123456';
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-posthog-personal-key-for-tests';

import test from 'node:test';
import assert from 'node:assert';

const { calculateAttribution } = await import('../lib/attribution-engine.js');

// Tolerance for floating point comparisons
const EPSILON = 1e-9;

function assertClose(actual, expected, message) {
  if (Math.abs(actual - expected) > EPSILON) {
    assert.fail(message || `Expected ${actual} to be close to ${expected}`);
  }
}

test('Deterministic Attribution Models Unit Tests', async (t) => {

  await t.test('Scenario 1: Single-touch conversion', () => {
    const touchpoints = [
      {
        timestamp: '2026-06-01T10:00:00Z',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'search',
        referrer: 'https://google.com',
        page_url: 'https://example.com/'
      }
    ];
    const conversionValue = 100.00;
    const result = calculateAttribution(touchpoints, conversionValue);

    // All models must assign 100% credit to the only touchpoint
    assert.strictEqual(result.first_touch.source, 'google');
    assert.strictEqual(result.last_touch.source, 'google');

    // Linear
    assert.strictEqual(result.linear.length, 1);
    assert.strictEqual(result.linear[0].source, 'google');
    assertClose(result.linear[0].fraction, 1.0);
    assertClose(result.linear[0].attributed_value, 100.00);

    // U-Shaped
    assert.strictEqual(result.u_shaped.length, 1);
    assert.strictEqual(result.u_shaped[0].source, 'google');
    assertClose(result.u_shaped[0].fraction, 1.0);
    assertClose(result.u_shaped[0].attributed_value, 100.00);

    // W-Shaped
    assert.strictEqual(result.w_shaped.length, 1);
    assert.strictEqual(result.w_shaped[0].source, 'google');
    assertClose(result.w_shaped[0].fraction, 1.0);
    assertClose(result.w_shaped[0].attributed_value, 100.00);

    // Time Decay
    assert.strictEqual(result.time_decay.length, 1);
    assert.strictEqual(result.time_decay[0].source, 'google');
    assertClose(result.time_decay[0].fraction, 1.0);
    assertClose(result.time_decay[0].attributed_value, 100.00);
  });

  await t.test('Scenario 2: Two-touch conversion', () => {
    const touchpoints = [
      {
        timestamp: '2026-06-01T10:00:00Z',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'search',
        referrer: 'https://google.com',
        page_url: 'https://example.com/'
      },
      {
        timestamp: '2026-06-02T10:00:00Z',
        utm_source: 'facebook',
        utm_medium: 'paid_social',
        utm_campaign: 'retargeting',
        referrer: 'https://facebook.com',
        page_url: 'https://example.com/'
      }
    ];
    const conversionValue = 100.00;
    const result = calculateAttribution(touchpoints, conversionValue);

    // First and last touch
    assert.strictEqual(result.first_touch.source, 'google');
    assert.strictEqual(result.last_touch.source, 'facebook');

    // Linear (50/50)
    assert.strictEqual(result.linear.length, 2);
    assertClose(result.linear[0].fraction, 0.5);
    assertClose(result.linear[0].attributed_value, 50.00);
    assertClose(result.linear[1].fraction, 0.5);
    assertClose(result.linear[1].attributed_value, 50.00);

    // U-Shaped (50/50 for two touches)
    assert.strictEqual(result.u_shaped.length, 2);
    assertClose(result.u_shaped[0].fraction, 0.5);
    assertClose(result.u_shaped[0].attributed_value, 50.00);
    assertClose(result.u_shaped[1].fraction, 0.5);
    assertClose(result.u_shaped[1].attributed_value, 50.00);

    // W-Shaped (50/50 for two touches)
    assert.strictEqual(result.w_shaped.length, 2);
    assertClose(result.w_shaped[0].fraction, 0.5);
    assertClose(result.w_shaped[0].attributed_value, 50.00);
    assertClose(result.w_shaped[1].fraction, 0.5);
    assertClose(result.w_shaped[1].attributed_value, 50.00);

    // Time-decay (favors last touchpoint)
    assert.strictEqual(result.time_decay.length, 2);
    assert.ok(result.time_decay[1].fraction > result.time_decay[0].fraction);
    assert.ok(result.time_decay[1].attributed_value > result.time_decay[0].attributed_value);
  });

  await t.test('Scenario 3: Three-touch conversion', () => {
    const touchpoints = [
      {
        timestamp: '2026-06-01T10:00:00Z',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'search',
        referrer: 'https://google.com',
        page_url: 'https://example.com/'
      },
      {
        timestamp: '2026-06-02T10:00:00Z',
        utm_source: 'email',
        utm_medium: 'newsletter',
        utm_campaign: 'june',
        referrer: '',
        page_url: 'https://example.com/'
      },
      {
        timestamp: '2026-06-03T10:00:00Z',
        utm_source: 'facebook',
        utm_medium: 'paid_social',
        utm_campaign: 'retargeting',
        referrer: 'https://facebook.com',
        page_url: 'https://example.com/'
      }
    ];
    const conversionValue = 100.00;
    const result = calculateAttribution(touchpoints, conversionValue);

    // First and last touch
    assert.strictEqual(result.first_touch.source, 'google');
    assert.strictEqual(result.last_touch.source, 'facebook');

    // Linear (1/3 each, adjusted by adjustReconciliation)
    assert.strictEqual(result.linear.length, 3);
    assertClose(result.linear[0].fraction, 0.3333);
    assertClose(result.linear[0].attributed_value, 33.33);
    assertClose(result.linear[1].fraction, 0.3333);
    assertClose(result.linear[1].attributed_value, 33.33);
    // Last element absorbs the rounding differences
    assertClose(result.linear[2].fraction, 1.0 - 0.3333 - 0.3333); // 0.3334
    assertClose(result.linear[2].attributed_value, 100.00 - 33.33 - 33.33); // 33.34

    // U-Shaped (40/20/40)
    assert.strictEqual(result.u_shaped.length, 3);
    assertClose(result.u_shaped[0].fraction, 0.4);
    assertClose(result.u_shaped[0].attributed_value, 40.00);
    assertClose(result.u_shaped[1].fraction, 0.2);
    assertClose(result.u_shaped[1].attributed_value, 20.00);
    // Last element adjusted (though math works out to 0.4 exactly here)
    assertClose(result.u_shaped[2].fraction, 0.4);
    assertClose(result.u_shaped[2].attributed_value, 40.00);

    // W-Shaped (3-touch case splits equally in engine: 0.333 fraction and conversionValue/3)
    assert.strictEqual(result.w_shaped.length, 3);
    assertClose(result.w_shaped[0].fraction, 0.3330);
    assertClose(result.w_shaped[0].attributed_value, 33.33);
    assertClose(result.w_shaped[1].fraction, 0.3330);
    assertClose(result.w_shaped[1].attributed_value, 33.33);
    // Last element absorbs rounding
    assertClose(result.w_shaped[2].fraction, 1.0 - 0.333 - 0.333); // 0.334
    assertClose(result.w_shaped[2].attributed_value, 100.00 - 33.33 - 33.33); // 33.34

    // Time-decay (favors later touchpoints monotonically)
    assert.strictEqual(result.time_decay.length, 3);
    assert.ok(result.time_decay[2].fraction > result.time_decay[1].fraction);
    assert.ok(result.time_decay[1].fraction > result.time_decay[0].fraction);
  });

  await t.test('Scenario 4: Four-plus-touch conversion (5 touches)', () => {
    const touchpoints = [
      { timestamp: '2026-06-01T10:00:00Z', utm_source: 'google' },
      { timestamp: '2026-06-02T10:00:00Z', utm_source: 'email' },
      { timestamp: '2026-06-03T10:00:00Z', utm_source: 'twitter' },
      { timestamp: '2026-06-04T10:00:00Z', utm_source: 'linkedin' },
      { timestamp: '2026-06-05T10:00:00Z', utm_source: 'facebook' }
    ];
    const conversionValue = 100.00;
    const result = calculateAttribution(touchpoints, conversionValue);

    // Linear (1/5 each = 0.2 fraction, 20.00 value)
    assert.strictEqual(result.linear.length, 5);
    for (let i = 0; i < 5; i++) {
      assertClose(result.linear[i].fraction, 0.2);
      assertClose(result.linear[i].attributed_value, 20.00);
    }

    // U-shaped (40% first, 40% last initially, middle split remaining 20% = 0.0667 each)
    // Last element (index 4) absorbs the rounding of middle elements.
    // 0.4 (index 0) + 3 * 0.0667 = 0.6001
    // Index 4 becomes 1.0 - 0.6001 = 0.3999
    assert.strictEqual(result.u_shaped.length, 5);
    assertClose(result.u_shaped[0].fraction, 0.4);
    assertClose(result.u_shaped[0].attributed_value, 40.00);

    assertClose(result.u_shaped[1].fraction, 0.0667);
    assertClose(result.u_shaped[1].attributed_value, 6.67);
    assertClose(result.u_shaped[2].fraction, 0.0667);
    assertClose(result.u_shaped[2].attributed_value, 6.67);
    assertClose(result.u_shaped[3].fraction, 0.0667);
    assertClose(result.u_shaped[3].attributed_value, 6.67);

    // Adjusted last element
    assertClose(result.u_shaped[4].fraction, 0.3999);
    assertClose(result.u_shaped[4].attributed_value, 39.99);

    // W-shaped (Anchors at index 0, middleIdx (4/2 = 2), and 4 get 30% each. Remaining 10% split between 1 and 3 = 5% each)
    assert.strictEqual(result.w_shaped.length, 5);
    assertClose(result.w_shaped[0].fraction, 0.3);
    assertClose(result.w_shaped[0].attributed_value, 30.00);
    assertClose(result.w_shaped[2].fraction, 0.3);
    assertClose(result.w_shaped[2].attributed_value, 30.00);
    assertClose(result.w_shaped[4].fraction, 0.3);
    assertClose(result.w_shaped[4].attributed_value, 30.00);
    // Others
    assertClose(result.w_shaped[1].fraction, 0.05);
    assertClose(result.w_shaped[1].attributed_value, 5.00);
    assertClose(result.w_shaped[3].fraction, 0.05);
    assertClose(result.w_shaped[3].attributed_value, 5.00);

    // Time-decay increases credit monotonically closer to the conversion
    assert.strictEqual(result.time_decay.length, 5);
    for (let i = 1; i < 5; i++) {
      assert.ok(result.time_decay[i].fraction > result.time_decay[i - 1].fraction);
    }
  });

  await t.test('Scenario 5: Direct-source edge case', () => {
    const touchpoints = [
      {
        timestamp: '2026-06-01T10:00:00Z',
        utm_source: 'google',
        utm_medium: 'cpc'
      },
      {
        timestamp: '2026-06-02T10:00:00Z',
        utm_source: null,
        utm_medium: null,
        referrer: null
      }
    ];
    const conversionValue = 100.00;
    const result = calculateAttribution(touchpoints, conversionValue);

    // Verify models map direct touchpoint safely
    assert.strictEqual(result.first_touch.source, 'google');
    assert.strictEqual(result.last_touch.source, null); // Last touch is direct (null source)

    // Linear splits credit
    assert.strictEqual(result.linear[0].source, 'google');
    assert.strictEqual(result.linear[1].source, null); // Direct
    assertClose(result.linear[0].fraction, 0.5);
    assertClose(result.linear[1].fraction, 0.5);
  });

  await t.test('Scenario 6: Revenue allocation', () => {
    const touchpoints = [
      { timestamp: '2026-06-01T10:00:00Z', utm_source: 'google' },
      { timestamp: '2026-06-02T10:00:00Z', utm_source: 'email' },
      { timestamp: '2026-06-03T10:00:00Z', utm_source: 'facebook' }
    ];
    const conversionValue = 100.25;
    const result = calculateAttribution(touchpoints, conversionValue);

    // Assert credit conservation for all models
    const models = ['linear', 'u_shaped', 'w_shaped', 'time_decay'];
    for (const model of models) {
      const shares = result[model];
      let sumValue = 0;
      let sumFrac = 0;

      for (const share of shares) {
        assert.ok(!isNaN(share.attributed_value), `Attributed value is NaN for model ${model}`);
        assert.ok(!isNaN(share.fraction), `Fraction is NaN for model ${model}`);
        assert.ok(share.attributed_value >= 0, `Negative credit in model ${model}`);
        assert.ok(share.fraction >= 0, `Negative fraction in model ${model}`);

        sumValue += share.attributed_value;
        sumFrac += share.fraction;
      }

      assertClose(sumValue, conversionValue, `Total credit conservation failed for model ${model}`);
      assertClose(sumFrac, 1.0, `Total fraction sum failed for model ${model}`);
    }
  });

  await t.test('Scenario 7: Empty/no-touch case', () => {
    const touchpoints = [];
    const conversionValue = 100.00;
    const result = calculateAttribution(touchpoints, conversionValue);

    // Verify safe empty return value matching model design
    assert.strictEqual(result.first_touch, null);
    assert.strictEqual(result.last_touch, null);
    assert.deepStrictEqual(result.linear, []);
    assert.deepStrictEqual(result.u_shaped, []);
    assert.deepStrictEqual(result.w_shaped, []);
    assert.deepStrictEqual(result.time_decay, []);
  });

  await t.test('Scenario 8: Same-timestamp or malformed input', () => {
    // 1. Same timestamps
    const sameTp = [
      { timestamp: '2026-06-01T10:00:00Z', utm_source: 'google' },
      { timestamp: '2026-06-01T10:00:00Z', utm_source: 'facebook' }
    ];
    const resSame = calculateAttribution(sameTp, 100.00);
    assert.strictEqual(resSame.first_touch.source, 'google');
    assert.strictEqual(resSame.last_touch.source, 'facebook');
    assertClose(resSame.linear.reduce((s, x) => s + x.attributed_value, 0), 100.00);

    // 2. Malformed timestamp (invalid date string)
    const malformedTp = [
      { timestamp: 'not-a-date', utm_source: 'google' },
      { timestamp: '2026-06-02T10:00:00Z', utm_source: 'facebook' }
    ];

    // The engine parses Dates internally. We must confirm it executes without throwing.
    // If a date is invalid, new Date().getTime() returns NaN.
    // Let's ensure it handles it and outputs something safe.
    const resMalformed = calculateAttribution(malformedTp, 100.00);
    assert.ok(resMalformed);

    // Check that total credit conservation holds
    const models = ['linear', 'u_shaped', 'w_shaped', 'time_decay'];
    for (const model of models) {
      const shares = resMalformed[model];
      let sumValue = 0;
      let sumFrac = 0;
      for (const share of shares) {
        sumValue += share.attributed_value;
        sumFrac += share.fraction;
      }
      assert.ok(!Number.isNaN(sumValue), `Malformed timestamp produced NaN attributed value total for ${model}`);
      assert.ok(!Number.isNaN(sumFrac), `Malformed timestamp produced NaN fraction total for ${model}`);
      assertClose(sumValue, 100.00, `Malformed timestamp credit conservation failed for ${model}`);
      assertClose(sumFrac, 1.0, `Malformed timestamp fraction conservation failed for ${model}`);
    }
  });

});
