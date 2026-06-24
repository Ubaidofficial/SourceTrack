import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { getSupabase } from '../lib/supabase.js';

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'https://sourcetrack-api-staging.up.railway.app';
const DEMO_SITE_KEY = 'de500000-babe-41d4-a716-446655440000';
const DEMO_EMAIL = 'demo-diag-saas@sourcetrack.ai';
const DEMO_PASSWORD = 'DemoSaaSPassword2026!';

async function request(path, token) {
  const url = `${SOURCETRACK_API_URL.replace(/\/+$/, '')}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (_) {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

test('Source Normalization and Aggregation Verification', async (t) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log('SKIPPING tests - Supabase credentials not set.');
    return;
  }

  const supabase = getSupabase();

  // Log in
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD
  });
  if (loginErr || !loginData?.session) {
    throw new Error(`Failed to log in: ${loginErr?.message}`);
  }
  const token = loginData.session.access_token;

  await t.test('Dashboard Overview aggregates google and google.com into a single Google row', async () => {
    const res = await request(`/api/dashboard/overview?site_key=${DEMO_SITE_KEY}&days=30`, token);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body?.success);

    const sources = res.body.data?.sources || [];
    console.log('Sources returned in test:', JSON.stringify(sources, null, 2));

    // Verify no separate google.com or google rows exist
    const rawGoogle = sources.find(s => s.dim_value === 'google');
    const rawGoogleCom = sources.find(s => s.dim_value === 'google.com');
    assert.strictEqual(rawGoogle, undefined, 'Should not return raw un-normalized "google" source');
    assert.strictEqual(rawGoogleCom, undefined, 'Should not return raw un-normalized "google.com" source');

    // Verify single normalized "Google" row exists with summed metrics
    const normalizedGoogle = sources.find(s => s.dim_value === 'Google');
    assert.ok(normalizedGoogle, 'Must return normalized "Google" source');

    // Summed Conversions = 11 (google) + 3 (google.com) = 14
    // Summed Revenue = 417 (google) + 99 (google.com) = 516
    assert.strictEqual(normalizedGoogle.conversions, 14, 'Conversions must be summed to 14');
    assert.strictEqual(normalizedGoogle.revenue, 516, 'Revenue must be summed to 516');
  });
});
