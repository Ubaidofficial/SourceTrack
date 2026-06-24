import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { getSupabase } from '../lib/supabase.js';
import { normalizeSource } from '../lib/source-normalizer.js';

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000';
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

test('Leads and Journey Supabase Stitching and Fallback Normalization', async (t) => {
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

  await t.test('1. Normalizer Substring-Order Precedence Tests', () => {
    // "google ai" or "google-ai" should resolve to Gemini
    assert.strictEqual(normalizeSource('google ai').name, 'Gemini');
    assert.strictEqual(normalizeSource('google-ai').name, 'Gemini');
    assert.strictEqual(normalizeSource('gemini.google.com').name, 'Gemini');

    // Plain google domains should resolve to Google
    assert.strictEqual(normalizeSource('google.com').name, 'Google');
    assert.strictEqual(normalizeSource('google organic').name, 'Google');

    // Ads and paid checks should resolve to Google Ads or Meta Ads
    assert.strictEqual(normalizeSource('google ads').name, 'Google Ads');
    assert.strictEqual(normalizeSource('facebook ads').name, 'Meta Ads');
  });

  await t.test('2. Fallback Normalization for Unattributed Leads (RED->GREEN)', async () => {
    const res = await request(`/api/leads?site_key=${DEMO_SITE_KEY}&limit=100`, token);
    assert.strictEqual(res.status, 200);
    const leads = res.body.data?.leads || [];

    // Find the unattributed organic Google lead (demo_diag_user_3_org_g_mv_v6, converts: false)
    const organicLead = leads.find(l => l.id === 'demo_diag_user_3_org_g_mv_v6');
    assert.ok(organicLead, 'Should find demo_diag_user_3_org_g_mv_v6');
    // Let's assert that its source is 'Google', normalized from the raw referrer 'https://www.google.com'
    assert.strictEqual(organicLead.source, 'Google', 'Fallback source must be normalized from raw domain to Google');
  });

  await t.test('3. Model-Toggle Support (First-Touch vs Last-Touch)', async () => {
    // Query with first_touch
    const resFT = await request(`/api/leads?site_key=${DEMO_SITE_KEY}&attribution_model=first_touch&limit=100`, token);
    assert.strictEqual(resFT.status, 200);
    const leadsFT = resFT.body.data?.leads || [];
    const multiLeadFT = leadsFT.find(l => l.id === 'demo_diag_user_1_multi_mv_v6');
    assert.ok(multiLeadFT, 'Should find multi-touch lead');
    assert.strictEqual(multiLeadFT.source, 'Google', 'First touch source should be Google');

    // Query with last_touch
    const resLT = await request(`/api/leads?site_key=${DEMO_SITE_KEY}&attribution_model=last_touch&limit=100`, token);
    assert.strictEqual(resLT.status, 200);
    const leadsLT = resLT.body.data?.leads || [];
    const multiLeadLT = leadsLT.find(l => l.id === 'demo_diag_user_1_multi_mv_v6');
    assert.ok(multiLeadLT, 'Should find multi-touch lead');
    assert.strictEqual(multiLeadLT.source, 'Direct / None', 'Last touch source should be Direct / None');
  });

  await t.test('4. GET /api/journey/:visitorId returns correct Supabase attribution and normalizes fallback', async () => {
    const visitorId = 'demo_diag_user_13_ai_mv_v6';
    const res = await request(`/api/journey/${visitorId}?site_key=${DEMO_SITE_KEY}`, token);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body?.success);

    const data = res.body.data;
    assert.strictEqual(data?.visitor_id, visitorId);

    const sessions = data.sessions || [];
    assert.ok(sessions.length > 0, 'Visitor should have sessions');

    const firstSession = sessions[0];
    assert.ok(firstSession.source_label.includes('ChatGPT'),
      `First session source label should match ChatGPT, got: ${firstSession.source_label}`);
  });

  await t.test('5. GET /api/leads/:leadId returns lead details and active_days (Path 2a crash fix)', async () => {
    const leadId = 'demo_diag_user_13_ai_mv_v6';
    const res = await request(`/api/leads/${leadId}?site_key=${DEMO_SITE_KEY}`, token);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body?.success);
    const data = res.body.data;
    assert.strictEqual(typeof data.active_days, 'number', 'active_days should be a number');
    assert.ok(data.active_days >= 1, 'active_days should be at least 1');
  });
});
