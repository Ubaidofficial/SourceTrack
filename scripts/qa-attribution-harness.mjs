import dotenv from 'dotenv';
dotenv.config();

const { calculateAttribution } = await import('../api/lib/attribution-engine.js');
import assert from 'assert';

console.log('==================================================');
console.log('       Deterministic Attribution Test Harness');
console.log('==================================================\n');

// Mock User Journey: 3 touchpoints leading to a $120 conversion
const mockTouchpoints = [
  {
    timestamp: '2026-06-01T10:00:00Z',
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'search',
    derived_source: 'google'
  },
  {
    timestamp: '2026-06-02T12:00:00Z',
    utm_source: 'email',
    utm_medium: 'newsletter',
    utm_campaign: 'june',
    derived_source: 'email'
  },
  {
    timestamp: '2026-06-03T14:00:00Z',
    utm_source: 'facebook',
    utm_medium: 'paid_social',
    utm_campaign: 'promo',
    derived_source: 'facebook'
  }
];

const conversionValue = 120.00;

function runTests() {
  const result = calculateAttribution(mockTouchpoints, conversionValue);

  // 1. First Touch
  console.log('--- 1. First Touch ---');
  console.log('Source:', result.first_touch.source);
  assert.strictEqual(result.first_touch.source, 'google');
  console.log('✅ Passed First Touch\n');

  // 2. Last Touch
  console.log('--- 2. Last Touch ---');
  console.log('Source:', result.last_touch.source);
  assert.strictEqual(result.last_touch.source, 'facebook');
  console.log('✅ Passed Last Touch\n');

  // 3. Linear
  console.log('--- 3. Linear ---');
  console.log('Fractions:', result.linear.map(t => `${t.source}: ${t.fraction}`));
  assert.strictEqual(result.linear.length, 3);
  const totalLinearValue = result.linear.reduce((sum, t) => sum + t.attributed_value, 0);
  assert.strictEqual(totalLinearValue, conversionValue); // Assert exact reconciliation
  const totalLinearFrac = result.linear.reduce((sum, t) => sum + t.fraction, 0);
  assert.strictEqual(parseFloat(totalLinearFrac.toFixed(4)), 1.0); // Fractions must sum to 1.0
  console.log('✅ Passed Linear\n');

  // 4. U-Shaped (40/20/40)
  console.log('--- 4. U-Shaped ---');
  console.log('Fractions:', result.u_shaped.map(t => `${t.source}: ${t.fraction}`));
  assert.strictEqual(result.u_shaped.length, 3);
  assert.strictEqual(result.u_shaped[0].fraction, 0.4);
  assert.strictEqual(result.u_shaped[0].attributed_value, 48.00); // 120 * 0.4
  assert.strictEqual(result.u_shaped[1].fraction, 0.2);
  assert.strictEqual(result.u_shaped[1].attributed_value, 24.00); // 120 * 0.2
  assert.strictEqual(result.u_shaped[2].fraction, 0.4);
  assert.strictEqual(result.u_shaped[2].attributed_value, 48.00); // 120 * 0.4
  console.log('✅ Passed U-Shaped\n');

  // 5. Time Decay (7-day half-life)
  console.log('--- 5. Time Decay ---');
  console.log('Fractions:', result.time_decay.map(t => `${t.source}: ${t.fraction}`));
  assert.strictEqual(result.time_decay.length, 3);
  const totalDecayValue = result.time_decay.reduce((sum, t) => sum + t.attributed_value, 0);
  console.log('Total Attributed Value:', totalDecayValue);
  assert.strictEqual(totalDecayValue, conversionValue); // Assert exact reconciliation
  assert.ok(result.time_decay[2].fraction > result.time_decay[0].fraction); // Closer touchpoint gets more credit
  console.log('✅ Passed Time Decay\n');

  // 6. W-Shaped (3-touch special case: 33.3% each)
  console.log('--- 6. W-Shaped ---');
  console.log('Fractions:', result.w_shaped.map(t => `${t.source}: ${t.fraction}`));
  assert.strictEqual(result.w_shaped.length, 3);
  const totalWValue = result.w_shaped.reduce((sum, t) => sum + t.attributed_value, 0);
  assert.strictEqual(totalWValue, conversionValue); // Assert exact reconciliation
  const totalWFrac = result.w_shaped.reduce((sum, t) => sum + t.fraction, 0);
  assert.strictEqual(parseFloat(totalWFrac.toFixed(4)), 1.0); // Fractions must sum to 1.0
  console.log('✅ Passed W-Shaped\n');

  console.log('==================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================');
}

try {
  runTests();
  process.exit(0);
} catch (err) {
  console.error('❌ Test failed with assertion error:', err.message);
  process.exit(1);
}
