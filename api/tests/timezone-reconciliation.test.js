import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { getSupabase } from '../lib/supabase.js';

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
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (_) {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

test('Timezone boundary reconciliation across Dashboard, Analytics, and Campaigns', async (t) => {
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

  await t.test('Dashboard and Analytics Summary agree on June 21, 2026 local revenue ($198)', async () => {
    // 1. Dashboard Trend June 21
    const dashRes = await request(`/api/dashboard/overview?site_key=${DEMO_SITE_KEY}&days=30`, token);
    assert.strictEqual(dashRes.status, 200);
    const revenueTrend = dashRes.body.data?.revenue_trend || [];
    const june21Dash = revenueTrend.find(t => t.dim_value === '2026-06-21');
    assert.ok(june21Dash, 'Dashboard should have a June 21 entry in revenue_trend');
    assert.strictEqual(june21Dash.revenue, 198, 'Dashboard June 21 revenue must be $198');

    // 2. Analytics Summary June 21
    const summaryRes = await request(`/api/analytics/summary?site_key=${DEMO_SITE_KEY}&from=2026-06-21&to=2026-06-21`, token);
    assert.strictEqual(summaryRes.status, 200);
    assert.strictEqual(summaryRes.body.data?.kpis?.total_revenue, 198, 'Analytics Summary June 21 revenue must be $198');
    assert.strictEqual(summaryRes.body.data?.kpis?.conversion_count, 4, 'Analytics Summary June 21 conversions must be 4');
  });

  await t.test('Analytics Sources contains the timezone-reconciled ChatGPT conversion ($198)', async () => {
    const sourcesRes = await request(`/api/analytics/sources?site_key=${DEMO_SITE_KEY}&days=30&tab=referrer`, token);
    assert.strictEqual(sourcesRes.status, 200);
    const rows = sourcesRes.body.data?.rows || [];
    const chatGptRow = rows.find(r => r.name === 'AI: ChatGPT');
    assert.ok(chatGptRow, 'Analytics Sources should have an AI: ChatGPT row');
    assert.strictEqual(chatGptRow.revenue, 198, 'AI: ChatGPT revenue must be $198');
  });

  await t.test('Campaigns Overview agrees on the 30-day KPIs ($1,110 and 31 conversions) and correct local dateTo', async () => {
    const campaignsRes = await request(`/api/campaigns/overview?site_key=${DEMO_SITE_KEY}&days=30&model=last_touch&dimension=campaign`, token);
    assert.strictEqual(campaignsRes.status, 200);

    // Check that dateTo returned in response matches June 23 (local Paris time)
    assert.strictEqual(campaignsRes.body.data?.dateTo, '2026-06-23', 'Campaigns dateTo must be June 23, 2026 (local Paris date)');

    // Check KPIs match the dashboard's 30-day counts
    const kpis = campaignsRes.body.data?.kpis;
    assert.strictEqual(kpis?.total_revenue, 1110, 'Campaigns 30-day revenue must be $1,110');
    assert.strictEqual(kpis?.total_conversions, 31, 'Campaigns 30-day conversions must be 31');
  });
});
