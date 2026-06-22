import 'dotenv/config';
import { isGoogleSource } from '../api/lib/utils.js';
import { mergeGoogleResults } from '../api/lib/attribution-engine.js';
import assert from 'assert';

async function runTests() {
  console.log('==================================================');
  console.log('   Google Normalization & Merging (Fix 2a) Test   ');
  console.log('==================================================\n');

  // ----------------------------------------------------
  // TEST 1: isGoogleSource pattern matching
  // ----------------------------------------------------
  console.log('--- TEST 1: isGoogleSource ---');
  
  const positiveCases = [
    'google',
    'google.com',
    'google.co.uk',
    'google.com.mx',
    'google.de',
    'google.ca',
    'www.google.com',
    'www.google.co.uk',
    'WWW.GOOGLE.COM.BR',
    ' google '
  ];

  const negativeCases = [
    'google-extended',
    'mygoogle.com',
    'notgoogle.com',
    'google.other.com',
    'gemini.google.com',
    'googleads',
    'google ads',
    'gclid',
    'direct',
    null,
    undefined,
    123
  ];

  for (const tc of positiveCases) {
    assert.strictEqual(isGoogleSource(tc), true, `Expected true for "${tc}"`);
  }
  console.log('✅ All positive isGoogleSource cases passed.');

  for (const tc of negativeCases) {
    assert.strictEqual(isGoogleSource(tc), false, `Expected false for "${tc}"`);
  }
  console.log('✅ All negative isGoogleSource cases passed.');
  console.log();

  // ----------------------------------------------------
  // TEST 2: mergeGoogleResults numeric merge and weights
  // ----------------------------------------------------
  console.log('--- TEST 2: mergeGoogleResults Numeric correctness ---');

  const mockResults = [
    {
      dim_value: 'google.com',
      revenue: 1000,
      conversions: 10,
      avg_conversion_value: 100,
      conversion_rate: 1.0,
      sessions: 1000
    },
    {
      dim_value: 'google',
      revenue: 500,
      conversions: 5,
      avg_conversion_value: 200,
      conversion_rate: 2.0,
      sessions: 500
    },
    {
      dim_value: 'google.co.uk',
      revenue: 300,
      conversions: 2,
      avg_conversion_value: 150,
      conversion_rate: 1.5,
      sessions: 200
    },
    {
      dim_value: 'facebook.com',
      revenue: 800,
      conversions: 8,
      avg_conversion_value: 100,
      conversion_rate: 4.0,
      sessions: 200
    }
  ];

  const merged = mergeGoogleResults(mockResults, 'source', null, 'revenue');

  // Verify that there are only two rows: 'google' and 'facebook.com'
  assert.strictEqual(merged.length, 2, `Expected 2 merged rows, got ${merged.length}`);

  const googleRow = merged.find(r => r.dim_value === 'google');
  const fbRow = merged.find(r => r.dim_value === 'facebook.com');

  assert.ok(googleRow, 'Google row missing in merged results');
  assert.ok(fbRow, 'Facebook row missing in merged results');

  // Assert basic sums
  // revenue: 1000 + 500 + 300 = 1800
  // conversions: 10 + 5 + 2 = 17
  // sessions: 1000 + 500 + 200 = 1700
  assert.strictEqual(googleRow.revenue, 1800, `Expected revenue 1800, got ${googleRow.revenue}`);
  assert.strictEqual(googleRow.conversions, 17, `Expected conversions 17, got ${googleRow.conversions}`);
  assert.strictEqual(googleRow.sessions, 1700, `Expected sessions 1700, got ${googleRow.sessions}`);

  // Assert weighted fields
  // avg_conversion_value weighted: (100 * 10 + 200 * 5 + 150 * 2) / (10 + 5 + 2)
  // = (1000 + 1000 + 300) / 17 = 2300 / 17 = 135.2941176470588
  const expectedAvgVal = 2300 / 17;
  assert.ok(Math.abs(googleRow.avg_conversion_value - expectedAvgVal) < 0.0001, `Expected avg_conversion_value close to ${expectedAvgVal}, got ${googleRow.avg_conversion_value}`);

  // conversion_rate weighted by sessions (since conversions/sessions is used for conv rate)
  // conversion_rate = (1.0 * 1000 + 2.0 * 500 + 1.5 * 200) / (1000 + 500 + 200)
  // = (1000 + 1000 + 300) / 1700 = 2300 / 1700 = 1.3529411764705882
  const expectedConvRate = 2300 / 1700;
  assert.ok(Math.abs(googleRow.conversion_rate - expectedConvRate) < 0.0001, `Expected conversion_rate close to ${expectedConvRate}, got ${googleRow.conversion_rate}`);

  console.log('✅ mergeGoogleResults numeric sums and weighted averages verified.');
  console.log();

  // ----------------------------------------------------
  // TEST 3: Mock /sources endpoint grouping logic
  // ----------------------------------------------------
  console.log('--- TEST 3: Mock /sources grouping collapse ---');

  const mockPageviews = [
    { utm_source: 'google', session_id: 's1' },
    { utm_source: 'google.com', session_id: 's2' },
    { referrer: 'https://www.google.co.uk/', session_id: 's3' },
    { referrer: 'https://mygoogle.com/', session_id: 's4' },
    { utm_source: 'facebook', session_id: 's5' }
  ];

  const groups = {};
  mockPageviews.forEach(r => {
    let key;
    if (r.utm_source && isGoogleSource(r.utm_source)) {
      key = 'google';
    } else if (r.utm_source) {
      key = r.utm_source.toLowerCase();
    } else if (r.referrer) {
      try {
        const host = new URL(r.referrer).hostname.replace('www.', '');
        if (isGoogleSource(host)) {
          key = 'google';
        } else {
          key = host;
        }
      } catch {
        key = 'Direct';
      }
    } else {
      key = 'Direct';
    }
    
    groups[key] = groups[key] || { name: key, visitors_set: new Set() };
    if (r.session_id) groups[key].visitors_set.add(r.session_id);
  });

  // Expected groups: 'google' (s1, s2, s3), 'mygoogle.com' (s4), 'facebook' (s5)
  assert.ok(groups['google'], 'Google key missing in groups');
  assert.strictEqual(groups['google'].visitors_set.size, 3, 'Google should have 3 visitors');
  assert.ok(groups['google'].visitors_set.has('s1'));
  assert.ok(groups['google'].visitors_set.has('s2'));
  assert.ok(groups['google'].visitors_set.has('s3'));

  assert.ok(groups['mygoogle.com'], 'mygoogle.com key missing in groups');
  assert.strictEqual(groups['mygoogle.com'].visitors_set.size, 1, 'mygoogle.com should have 1 visitor');

  assert.ok(groups['facebook'], 'facebook key missing in groups');

  console.log('✅ Mock /sources grouping collapse verified.');
  console.log();

  console.log('🎉 ALL TESTS PASSED!');
}

runTests().catch(err => {
  console.error('❌ TEST FAILURE:', err);
  process.exit(1);
});
