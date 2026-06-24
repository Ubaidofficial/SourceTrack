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

test('Report Builder pre-aggregated leads and customers metrics reconciliation', async (t) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log('SKIPPING Report Builder metrics integration tests - Supabase credentials not set in environment.');
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

  await t.test('leads and customers metric returns correct counts per channel', async () => {
    const res = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-05-24&date_to=2026-06-23&group_by=channel&metric=leads`,
      token
    );
    assert.strictEqual(res.status, 200);
    assert.ok(res.body?.success);

    const results = res.body.data?.results || [];
    const getLeads = (ch) => results.find(r => r.dim_value === ch)?.leads;
    const getCustomers = (ch) => results.find(r => r.dim_value === ch)?.customers;

    // Verify channel splits against locked leads ground truth (sum = 20)
    assert.strictEqual(getLeads('Paid Search'), 7, 'Paid Search must have 7 leads');
    assert.strictEqual(getLeads('AI Search'), 5, 'AI Search must have 5 leads');
    assert.strictEqual(getLeads('Organic Search'), 2, 'Organic Search must have 2 leads');
    assert.strictEqual(getLeads('Direct'), 6, 'Direct must have 6 leads');

    const totalLeads = results.reduce((sum, r) => sum + (r.leads || 0), 0);
    assert.strictEqual(totalLeads, 20, 'Total leads sum must be 20');

    // Verify channel splits against locked customers ground truth (sum = 11)
    assert.strictEqual(getCustomers('Paid Search'), 4, 'Paid Search must have 4 customers');
    assert.strictEqual(getCustomers('AI Search'), 3, 'AI Search must have 3 customers');
    assert.strictEqual(getCustomers('Organic Search'), 1, 'Organic Search must have 1 customer');
    assert.strictEqual(getCustomers('Direct'), 3, 'Direct must have 3 customers');

    const totalCustomers = results.reduce((sum, r) => sum + (r.customers || 0), 0);
    assert.strictEqual(totalCustomers, 11, 'Total customers sum must be 11');
  });

  await t.test('conversions metric returns correct counts per channel (no-regression)', async () => {
    const res = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-05-24&date_to=2026-06-23&group_by=channel&metric=conversions`,
      token
    );
    assert.strictEqual(res.status, 200);
    assert.ok(res.body?.success);

    const results = res.body.data?.results || [];
    const getVal = (ch) => results.find(r => r.dim_value === ch)?.conversions;

    // Verify channel splits against locked conversions ground truth (sum = 31)
    assert.strictEqual(getVal('Paid Search'), 11, 'Paid Search must have 11 conversions');
    assert.strictEqual(getVal('Direct'), 9, 'Direct must have 9 conversions');
    assert.strictEqual(getVal('AI Search'), 8, 'AI Search must have 8 conversions');
    assert.strictEqual(getVal('Organic Search'), 3, 'Organic Search must have 3 conversions');

    const totalConversions = results.reduce((sum, r) => sum + (r.conversions || 0), 0);
    assert.strictEqual(totalConversions, 31, 'Total conversions sum must be 31');
  });

  await t.test('revenue metric returns correct counts per channel (no-regression)', async () => {
    const res = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-05-24&date_to=2026-06-23&group_by=channel&metric=revenue`,
      token
    );
    assert.strictEqual(res.status, 200);
    assert.ok(res.body?.success);

    const results = res.body.data?.results || [];
    const getVal = (ch) => results.find(r => r.dim_value === ch)?.revenue;

    // Verify channel splits against locked revenue ground truth (sum = 1110)
    assert.strictEqual(getVal('Paid Search'), 417, 'Paid Search must have $417 revenue');
    assert.strictEqual(getVal('AI Search'), 297, 'AI Search must have $297 revenue');
    assert.strictEqual(getVal('Organic Search'), 99, 'Organic Search must have $99 revenue');
    assert.strictEqual(getVal('Direct'), 297, 'Direct must have $297 revenue');

    const totalRevenue = results.reduce((sum, r) => sum + (r.revenue || 0), 0);
    assert.strictEqual(totalRevenue, 1110, 'Total revenue sum must be $1,110');
  });

  await t.test('avg_conversion_value metric returns correct values per channel', async () => {
    const res = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-05-24&date_to=2026-06-23&group_by=channel&metric=avg_conversion_value`,
      token
    );
    assert.strictEqual(res.status, 200);
    assert.ok(res.body?.success);

    const results = res.body.data?.results || [];
    const getVal = (ch) => results.find(r => r.dim_value === ch)?.avg_conversion_value;

    // Verify channel splits against locked avg_conversion_value ground truth
    assert.strictEqual(getVal('Paid Search'), 104.25, 'Paid Search must have $104.25 avg conversion value');
    assert.strictEqual(getVal('AI Search'), 99, 'AI Search must have $99 avg conversion value');
    assert.strictEqual(getVal('Organic Search'), 99, 'Organic Search must have $99 avg conversion value');
    assert.strictEqual(getVal('Direct'), 99, 'Direct must have $99 avg conversion value');
  });

  await t.test('timezone boundaries for June 21 Paris-local returns correct revenue and conversions', async () => {
    const res = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-06-21&date_to=2026-06-21&group_by=channel&metric=conversions`,
      token
    );
    assert.strictEqual(res.status, 200);
    assert.ok(res.body?.success);

    const results = res.body.data?.results || [];
    const totalConversions = results.reduce((sum, r) => sum + (r.conversions || 0), 0);
    const totalRevenue = results.reduce((sum, r) => sum + (r.revenue || 0), 0);

    assert.strictEqual(totalConversions, 4, 'June 21 must have 4 conversions in Paris timezone');
    assert.strictEqual(totalRevenue, 198, 'June 21 must have $198 revenue in Paris timezone');
  });

  await t.test('cross-screen equality for timezone boundaries between Report Builder, Dashboard, and Campaigns', async () => {
    // 1. Report Builder (queries local June 21 to June 23, i.e., 3 calendar days)
    const repRes = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-06-21&date_to=2026-06-23&group_by=channel&metric=conversions`,
      token
    );
    assert.strictEqual(repRes.status, 200);
    const repResults = repRes.body.data?.results || [];
    const repConversions = repResults.reduce((sum, r) => sum + (r.conversions || 0), 0);
    const repRevenue = repResults.reduce((sum, r) => sum + (r.revenue || 0), 0);

    // 2. Dashboard (days=2 counts back 2 days from today June 23, querying local June 21 to June 23)
    const dashRes = await request(
      `/api/dashboard/overview?site_key=${DEMO_SITE_KEY}&days=2`,
      token
    );
    assert.strictEqual(dashRes.status, 200);
    const dashKpis = dashRes.body.data?.kpis || {};
    const dashConversions = dashKpis.conversions;
    const dashRevenue = dashKpis.revenue;

    // 3. Campaigns (days=2 counts back 2 days from today June 23, querying local June 21 to June 23)
    const campRes = await request(
      `/api/campaigns/overview?site_key=${DEMO_SITE_KEY}&days=2`,
      token
    );
    assert.strictEqual(campRes.status, 200);
    const campKpis = campRes.body.data?.kpis || {};
    const campConversions = campKpis.total_conversions;
    const campRevenue = campKpis.total_revenue;

    // Assert that the date windows are mathematically identical across all screens
    assert.strictEqual(dashRes.body.data?.date_from, '2026-06-21', 'Dashboard date_from must be Jun 21');
    assert.strictEqual(dashRes.body.data?.date_to, '2026-06-23', 'Dashboard date_to must be Jun 23');
    assert.strictEqual(campRes.body.data?.dateFrom, '2026-06-21', 'Campaigns dateFrom must be Jun 21');
    assert.strictEqual(campRes.body.data?.dateTo, '2026-06-23', 'Campaigns dateTo must be Jun 23');

    // Assert values for the 3-day active range
    assert.strictEqual(repConversions, 4, 'Report Builder conversions must be 4');
    assert.strictEqual(repRevenue, 198, 'Report Builder revenue must be $198');

    assert.strictEqual(dashConversions, repConversions, 'Dashboard conversions must match Report Builder');
    assert.strictEqual(dashRevenue, repRevenue, 'Dashboard revenue must match Report Builder');

    assert.strictEqual(campConversions, repConversions, 'Campaigns conversions must match Report Builder');
    assert.strictEqual(campRevenue, repRevenue, 'Campaigns revenue must match Report Builder');

    // 4. Verify that shifting range to days=1 (June 22 to June 23) excludes the June 21 conversions (proves exact boundary alignment)
    const repEmptyRes = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-06-22&date_to=2026-06-23&group_by=channel&metric=conversions`,
      token
    );
    assert.strictEqual(repEmptyRes.status, 200);
    const repEmptyResults = repEmptyRes.body.data?.results || [];
    const repEmptyConversions = repEmptyResults.reduce((sum, r) => sum + (r.conversions || 0), 0);
    const repEmptyRevenue = repEmptyResults.reduce((sum, r) => sum + (r.revenue || 0), 0);

    const dashEmptyRes = await request(
      `/api/dashboard/overview?site_key=${DEMO_SITE_KEY}&days=1`,
      token
    );
    assert.strictEqual(dashEmptyRes.status, 200);
    const dashEmptyKpis = dashEmptyRes.body.data?.kpis || {};
    const dashEmptyConversions = dashEmptyKpis.conversions;
    const dashEmptyRevenue = dashEmptyKpis.revenue;

    const campEmptyRes = await request(
      `/api/campaigns/overview?site_key=${DEMO_SITE_KEY}&days=1`,
      token
    );
    assert.strictEqual(campEmptyRes.status, 200);
    const campEmptyKpis = campEmptyRes.body.data?.kpis || {};
    const campEmptyConversions = campEmptyKpis.total_conversions;
    const campEmptyRevenue = campEmptyKpis.total_revenue;

    // Assert that the date windows are mathematically identical for days=1
    assert.strictEqual(dashEmptyRes.body.data?.date_from, '2026-06-22', 'Dashboard date_from must be Jun 22');
    assert.strictEqual(dashEmptyRes.body.data?.date_to, '2026-06-23', 'Dashboard date_to must be Jun 23');
    assert.strictEqual(campEmptyRes.body.data?.dateFrom, '2026-06-22', 'Campaigns dateFrom must be Jun 22');
    assert.strictEqual(campEmptyRes.body.data?.dateTo, '2026-06-23', 'Campaigns dateTo must be Jun 23');

    assert.strictEqual(repEmptyConversions, 0, 'Report Builder June 22-23 conversions must be 0');
    assert.strictEqual(repEmptyRevenue, 0, 'Report Builder June 22-23 revenue must be $0');
    assert.strictEqual(dashEmptyConversions, 0, 'Dashboard June 22-23 conversions must be 0');
    assert.strictEqual(dashEmptyRevenue, 0, 'Dashboard June 22-23 revenue must be $0');
    assert.strictEqual(campEmptyConversions, 0, 'Campaigns June 22-23 conversions must be 0');
    assert.strictEqual(campEmptyRevenue, 0, 'Campaigns June 22-23 revenue must be $0');
  });

  await t.test('cross-screen equality for 30-day window between Report Builder, Dashboard, and Campaigns', async () => {
    // 1. Report Builder
    const repRes = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-05-24&date_to=2026-06-23&group_by=channel&metric=conversions`,
      token
    );
    assert.strictEqual(repRes.status, 200);
    const repResults = repRes.body.data?.results || [];
    const repConversions = repResults.reduce((sum, r) => sum + (r.conversions || 0), 0);
    const repRevenue = repResults.reduce((sum, r) => sum + (r.revenue || 0), 0);

    // 2. Dashboard
    const dashRes = await request(
      `/api/dashboard/overview?site_key=${DEMO_SITE_KEY}&days=30`,
      token
    );
    assert.strictEqual(dashRes.status, 200);
    const dashKpis = dashRes.body.data?.kpis || {};
    const dashConversions = dashKpis.conversions;
    const dashRevenue = dashKpis.revenue;

    // 3. Campaigns
    const campRes = await request(
      `/api/campaigns/overview?site_key=${DEMO_SITE_KEY}&days=30`,
      token
    );
    assert.strictEqual(campRes.status, 200);
    const campKpis = campRes.body.data?.kpis || {};
    const campConversions = campKpis.total_conversions;
    const campRevenue = campKpis.total_revenue;

    // Assert equality across all screens
    assert.strictEqual(repConversions, 31, 'Report Builder 30-day conversions must be 31');
    assert.strictEqual(repRevenue, 1110, 'Report Builder 30-day revenue must be $1,110');

    assert.strictEqual(dashConversions, repConversions, 'Dashboard 30-day conversions must match Report Builder');
    assert.strictEqual(dashRevenue, repRevenue, 'Dashboard 30-day revenue must match Report Builder');

    assert.strictEqual(campConversions, repConversions, 'Campaigns 30-day conversions must match Report Builder');
    assert.strictEqual(campRevenue, repRevenue, 'Campaigns 30-day revenue must match Report Builder');
  });

  await t.test('new dimensions (country, device, browser, landing_page) return correct splits and match ground truth', async () => {
    // 1. Group by country
    const countryRes = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-05-24&date_to=2026-06-23&group_by=country&metric=conversions`,
      token
    );
    assert.strictEqual(countryRes.status, 200);
    const countryResults = countryRes.body.data?.results || [];
    const getCountryVal = (c, metricKey) => countryResults.find(r => r.dim_value === c)?.[metricKey] || 0;
    assert.strictEqual(getCountryVal('GB', 'conversions'), 8);
    assert.strictEqual(getCountryVal('GB', 'revenue'), 198);
    assert.strictEqual(getCountryVal('FR', 'conversions'), 11);
    assert.strictEqual(getCountryVal('FR', 'revenue'), 396);
    assert.strictEqual(getCountryVal('US', 'conversions'), 12);
    assert.strictEqual(getCountryVal('US', 'revenue'), 516);

    // 2. Group by device
    const deviceRes = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-05-24&date_to=2026-06-23&group_by=device&metric=conversions`,
      token
    );
    assert.strictEqual(deviceRes.status, 200);
    const deviceResults = deviceRes.body.data?.results || [];
    const getDeviceVal = (d, metricKey) => deviceResults.find(r => r.dim_value === d)?.[metricKey] || 0;
    assert.strictEqual(getDeviceVal('desktop', 'conversions'), 8);
    assert.strictEqual(getDeviceVal('desktop', 'revenue'), 198);
    assert.strictEqual(getDeviceVal('tablet', 'conversions'), 11);
    assert.strictEqual(getDeviceVal('tablet', 'revenue'), 396);
    assert.strictEqual(getDeviceVal('mobile', 'conversions'), 12);
    assert.strictEqual(getDeviceVal('mobile', 'revenue'), 516);

    // 3. Group by browser
    const browserRes = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-05-24&date_to=2026-06-23&group_by=browser&metric=conversions`,
      token
    );
    assert.strictEqual(browserRes.status, 200);
    const browserResults = browserRes.body.data?.results || [];
    const getBrowserVal = (b, metricKey) => browserResults.find(r => r.dim_value === b)?.[metricKey] || 0;
    assert.strictEqual(getBrowserVal('safari', 'conversions'), 8);
    assert.strictEqual(getBrowserVal('safari', 'revenue'), 198);
    assert.strictEqual(getBrowserVal('chrome', 'conversions'), 11);
    assert.strictEqual(getBrowserVal('chrome', 'revenue'), 396);
    assert.strictEqual(getBrowserVal('firefox', 'conversions'), 12);
    assert.strictEqual(getBrowserVal('firefox', 'revenue'), 516);

    // 4. Group by landing_page
    const lpRes = await request(
      `/api/attribution?site_key=${DEMO_SITE_KEY}&model=first_touch&date_from=2026-05-24&date_to=2026-06-23&group_by=landing_page&metric=conversions`,
      token
    );
    assert.strictEqual(lpRes.status, 200);
    const lpResults = lpRes.body.data?.results || [];
    const getLpVal = (l, metricKey) => lpResults.find(r => r.dim_value === l)?.[metricKey] || 0;
    assert.strictEqual(getLpVal('/blog/post-1', 'conversions'), 5);
    assert.strictEqual(getLpVal('/blog/post-1', 'revenue'), 198);
    assert.strictEqual(getLpVal('/features', 'conversions'), 8);
    assert.strictEqual(getLpVal('/features', 'revenue'), 198);
    assert.strictEqual(getLpVal('/', 'conversions'), 8);
    assert.strictEqual(getLpVal('/', 'revenue'), 318);
    assert.strictEqual(getLpVal('/pricing', 'conversions'), 10);
    assert.strictEqual(getLpVal('/pricing', 'revenue'), 396);
  });
});
