import 'dotenv/config';
import { getSupabase } from '../api/lib/supabase.js';
import assert from 'assert';

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000';
const DEMO_SITE_KEY = 'de400000-babe-41d4-a716-446655440000';
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
  console.log('       A2 Sources Referrer Revenue Test           ');
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

  console.log(`Hitting sources endpoint: GET /api/analytics/sources?site_key=${DEMO_SITE_KEY}&days=30&tab=referrer`);
  const response = await request(`/api/analytics/sources?site_key=${DEMO_SITE_KEY}&days=30&tab=referrer`, token);

  assert.strictEqual(response.status, 200, 'Expected status 200');
  assert.strictEqual(response.body?.success, true, 'Expected success to be true');
  assert.ok(response.body?.data?.rows, 'Expected data.rows to exist');

  const rows = response.body.data.rows;
  console.log('\nReturned Rows:');
  console.table(rows.map(r => ({ name: r.name, visitors: r.visitors, revenue: r.revenue })));

  const googleRow = rows.find(r => r.name === 'google');
  const chatgptRow = rows.find(r => r.name === 'AI: ChatGPT');
  const claudeRow = rows.find(r => r.name === 'AI: Claude');
  const directRow = rows.find(r => r.name === 'Direct');

  console.log('\nVerifying row revenues against DB Ground Truth:');

  // Ground Truth:
  // - google (Paid Search + Organic Google) = $417 (Paid) + $99 (Organic) = $516
  // - AI: ChatGPT = $198
  // - AI: Claude = $99
  // - Direct = $396

  assert.ok(googleRow, 'Expected "google" row to exist');
  assert.ok(chatgptRow, 'Expected "AI: ChatGPT" row to exist');
  assert.ok(claudeRow, 'Expected "AI: Claude" row to exist');
  assert.ok(directRow, 'Expected "Direct" row to exist');

  console.log(`  "google" row revenue: expected $516.00, got $${googleRow.revenue}`);
  assert.strictEqual(googleRow.revenue, 516, 'google row revenue should be exactly 516');

  console.log(`  "AI: ChatGPT" row revenue: expected $198.00, got $${chatgptRow.revenue}`);
  assert.strictEqual(chatgptRow.revenue, 198, 'AI: ChatGPT row revenue should be exactly 198');

  console.log(`  "AI: Claude" row revenue: expected $99.00, got $${claudeRow.revenue}`);
  assert.strictEqual(claudeRow.revenue, 99, 'AI: Claude row revenue should be exactly 99');

  console.log(`  "Direct" row revenue: expected $396.00, got $${directRow.revenue}`);
  assert.strictEqual(directRow.revenue, 396, 'Direct row revenue should be exactly 396');

  console.log('\n🎉 ALL SOURCES REVENUE VERIFICATIONS PASSED!');
}

run().catch(err => {
  console.error('\n❌ TEST FAILURE:', err.message);
  process.exit(1);
});
