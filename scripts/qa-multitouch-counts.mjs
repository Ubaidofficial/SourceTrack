import 'dotenv/config';
import { getSupabase } from '../api/lib/supabase.js';
import assert from 'assert';

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000';
const DEMO_SITE_KEY = 'de500000-babe-41d4-a716-446655440000';
const DEMO_EMAIL = 'demo-diag-saas@sourcetrack.ai';
const DEMO_PASSWORD = 'DemoSaaSPassword2026!';

async function request(path, token, options = {}) {
  const url = `${SOURCETRACK_API_URL.replace(/\/+$/, '')}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  const res = await fetch(url, {
    ...options,
    headers
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (_) {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

async function run() {
  console.log('==================================================');
  console.log('       A1 Multi-Touch Counts Regression Test       ');
  console.log('==================================================\n');

  const supabase = getSupabase();

  console.log('Logging in user to obtain JWT...');
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD
  });

  if (loginErr || !loginData?.session) {
    throw new Error(`Failed to log in: ${loginErr?.message}`);
  }
  const token = loginData.session.access_token;
  console.log('JWT obtained successfully.\n');

  // Fix time-of-run dependency by using a fixed stable date range matching the seed window
  const date_to = '2026-06-23';
  const date_from = '2026-05-23';

  const models = ['linear', 'u_shaped', 'time_decay', 'w_shaped'];

  // Expected values derived mathematically from model formulas:
  // Total Conversions = 32 (single-touch conversions) + 2 (Visitor 1 multi-touch splits) = 34.00
  // Total Revenue = 11 * $99.00 (single-touch paid) + $120.00 (Visitor 1 multi-touch) = $1,209.00
  const expectedSpecs = {
    linear: {
      conversions: {
        'Paid Search': 9 + 2 * (1/3), // 9.6667
        'AI Search': 8 + 2 * (1/3),   // 8.6667
        'Direct': 12 + 2 * (1/3),     // 12.6667
        'Organic Search': 3.0000      // 3.0000
      }
    },
    u_shaped: {
      conversions: {
        'Paid Search': 9 + 2 * 0.4000, // 9.8000
        'AI Search': 8 + 2 * 0.2000,   // 8.4000
        'Direct': 12 + 2 * 0.4000,     // 12.8000
        'Organic Search': 3.0000       // 3.0000
      }
    },
    w_shaped: {
      conversions: {
        'Paid Search': 9 + 2 * 0.3330, // 9.6660
        'AI Search': 8 + 2 * 0.3330,   // 8.6660
        'Direct': 12 + 2 * 0.3340,     // 12.6680
        'Organic Search': 3.0000       // 3.0000
      }
    },
    time_decay: {
      conversions: {
        'Paid Search': 9 + 2 * 0.3320,  // 9.6640
        'AI Search': 8 + 2 * 0.3333,    // 8.6666
        'Direct': 12 + 2 * 0.3347,      // 12.6694
        'Organic Search': 3.0000        // 3.0000
      }
    }
  };

  for (const model of models) {
    console.log(`--- Testing Model: ${model.toUpperCase()} ---`);
    const path = `/api/attribution?site_key=${DEMO_SITE_KEY}&date_from=${date_from}&date_to=${date_to}&model=${model}&group_by=channel&metric=conversions`;
    const response = await request(path, token);

    assert.strictEqual(response.status, 200, `Expected 200 for model ${model}`);
    assert.ok(response.body?.success, `Expected success to be true for model ${model}`);

    const results = response.body.data.results || [];
    console.log('Results returned:');
    console.table(results.map(r => ({ channel: r.dim_value, conversions: r.conversions, revenue: r.revenue })));

    // Sum totals
    const totalConversions = results.reduce((sum, r) => sum + r.conversions, 0);
    const totalRevenue = results.reduce((sum, r) => sum + r.revenue, 0);

    console.log(`Total conversions: ${totalConversions}`);
    console.log(`Total revenue: $${totalRevenue}`);

    // Verify exact totals
    const deltaConvs = Math.abs(totalConversions - 34.00);
    assert.ok(deltaConvs < 0.01, `Expected total conversions for ${model} to be 34.00, got ${totalConversions}`);

    const deltaRev = Math.abs(totalRevenue - 1209.00);
    assert.ok(deltaRev < 0.01, `Expected total revenue for ${model} to be $1209.00, got $${totalRevenue}`);

    // Verify fractional splits for Visitor 1
    const spec = expectedSpecs[model].conversions;
    for (const [channel, expectedVal] of Object.entries(spec)) {
      const row = results.find(r => r.dim_value === channel);
      assert.ok(row, `Expected row for channel "${channel}" to exist`);
      const diff = Math.abs(row.conversions - expectedVal);
      console.log(`  Channel "${channel}": expected ${expectedVal.toFixed(4)}, got ${row.conversions.toFixed(4)} (diff: ${diff.toFixed(6)})`);
      assert.ok(diff < 0.005, `Channel "${channel}" conversion split incorrect. Expected: ${expectedVal}, Got: ${row.conversions}`);
    }

    console.log(`✅ Model ${model.toUpperCase()} passed all assertions!\n`);
  }

  console.log('🎉 ALL REGRESSION TESTS PASSED!');
}

run().catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
