import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { getSupabase } from '../lib/supabase.js';

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000';
const DEMO_SITE_KEY = 'de500000-babe-41d4-a716-446655440000';
const DEMO_EMAIL = 'demo-diag-saas@sourcetrack.ai';
const DEMO_PASSWORD = 'DemoSaaSPassword2026!';

async function request(path, token, options = {}) {
  const url = `${SOURCETRACK_API_URL.replace(/\/+$/, '')}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-sourcetrack-now': '2026-06-23T12:00:00.000Z',
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

// THIS IS NOT A UNIT TEST. It signs in to a real Supabase project with a hardcoded demo account
// and asserts against seeded demo data over HTTP. It is the same class as the four files listed
// in test-registration-guard.test.js's DELIBERATELY_UNREGISTERED — the difference is that this
// one is registered (qa:attribution:unit).
//
// WHY IT NEEDS ALL THREE VARS, not just the two:
// The old guard checked only SUPABASE_URL + SUPABASE_SERVICE_KEY, so on any machine with a .env
// (loaded by `import 'dotenv/config'` above) it stopped skipping and ran against
// SOURCETRACK_API_URL, whose default is http://localhost:3000. With no local API up, all of this
// suite fails; that is the failure people hit when running the whole tests directory in one
// invocation, and it is environment-dependent, NOT cross-suite contamination — `node --test`
// gives every file its own child process, so env cannot bleed between files.
// Requiring SOURCETRACK_API_URL to be set EXPLICITLY means this only runs when someone has
// deliberately pointed it at a real environment, which is also what §10 asks for
// ("real-env only, never localhost").
//
// AND WHY t.skip, NOT `return`:
// The old guard printed a message and returned, so the runner scored it as PASSED while it
// asserted nothing — the false-confidence problem test-registration-guard.test.js:35 already
// records against this exact file. t.skip reports it as SKIPPED, so an unrun suite can never be
// mistaken for a green one.
const LIVE_ENV_READY = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY && process.env.SOURCETRACK_API_URL
);

test('Timezone boundary reconciliation across Dashboard, Analytics, and Campaigns', async (t) => {
  if (!LIVE_ENV_READY) {
    t.skip('live integration: needs SUPABASE_URL + SUPABASE_SERVICE_KEY + an explicit SOURCETRACK_API_URL pointing at a real environment');
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

  await t.test('Dashboard and Analytics Summary agree on June 21, 2026 local revenue ($198)', async () => {
    // 1. Dashboard Trend June 21
    const dashRes = await request(`/api/dashboard/overview?site_key=${DEMO_SITE_KEY}&days=30`, token);
    assert.strictEqual(dashRes.status, 200);
    const revenueTrend = dashRes.body.data?.revenue_trend || [];
    const june21Dash = revenueTrend.find(t => t.dim_value === '2026-06-21');
    assert.ok(june21Dash, 'Dashboard should have a June 21 entry in revenue_trend');
    assert.strictEqual(june21Dash.revenue, 198, 'Dashboard June 21 revenue must be $198');

    // Assert split KPIs for the 30-day window
    assert.strictEqual(dashRes.body.data?.kpis?.leads, 20, 'Dashboard 30-day leads must be 20');
    assert.strictEqual(dashRes.body.data?.kpis?.customers, 11, 'Dashboard 30-day customers must be 11');
    assert.strictEqual(dashRes.body.data?.kpis?.conversions, 31, 'Dashboard 30-day conversions must be 31');

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
    assert.strictEqual(kpis?.total_leads, 20, 'Campaigns 30-day leads must be 20');
    assert.strictEqual(kpis?.total_conversions, 31, 'Campaigns 30-day conversions must be 31');
  });
});
