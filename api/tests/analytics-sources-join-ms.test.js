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

test('Analytics Sources strict ms-join and clock skew regression test', async (t) => {
  // Live integration, not a unit test (see test-registration-guard.test.js's
  // DELIBERATELY_UNREGISTERED note). t.skip, not a bare `return`: returning made the runner
  // score this as PASSED while it asserted nothing. SOURCETRACK_API_URL must be set EXPLICITLY —
  // its default is http://localhost:3000, so a machine with a .env would otherwise run this
  // against a local port (§10: real-env only, never localhost).
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.SOURCETRACK_API_URL) {
    t.skip('live integration: needs SUPABASE_URL + SUPABASE_SERVICE_KEY + an explicit SOURCETRACK_API_URL pointing at a real environment');
    return;
  }

  const supabase = getSupabase();

  // Get demo site id (using service role, RLS bypassed)
  const { data: site } = await supabase
    .from('sites')
    .select('id')
    .eq('site_key', DEMO_SITE_KEY)
    .single();
  assert.ok(site?.id, 'Demo site should exist');

  // We choose a date 10 days ago to avoid colliding with other seed data
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 10);
  const dateStr = targetDate.toISOString().slice(0, 10);

  const testIdSuffix = 'test_ms_join_' + Date.now();
  const pvTimestamp = `${dateStr}T10:00:00.000Z`;
  const convTimestamp = `${dateStr}T10:05:00.000Z`;
  const ftTimestamp = `${dateStr}T10:00:00.123Z`; // 123ms offset

  // Test case 2: two pageviews within 5s, different sources (AI search vs Direct)
  const testIdSuffix2 = testIdSuffix + '_two_pvs';
  const pv1Timestamp = `${dateStr}T11:00:01.000Z`; // ChatGPT (matching, 1.1s diff)
  const pv2Timestamp = `${dateStr}T11:00:02.000Z`; // Direct/Internal (non-matching, 100ms diff)
  const ftTimestamp2 = `${dateStr}T11:00:02.100Z`; // conversion touchpoint
  const convTimestamp2 = `${dateStr}T11:05:00.000Z`;

  // Pre-test clean up for idempotency (service role)
  await supabase.from('pageviews').delete().eq('site_id', site.id).eq('session_id', testIdSuffix);
  await supabase.from('pageviews').delete().eq('site_id', site.id).eq('session_id', testIdSuffix2);
  await supabase.from('attributed_conversions').delete().eq('site_id', site.id).eq('distinct_id', testIdSuffix);
  await supabase.from('attributed_conversions').delete().eq('site_id', site.id).eq('distinct_id', testIdSuffix2);

  // Insert mock pageview for test case 1
  const { error: pvInsertErr } = await supabase.from('pageviews').insert({
    site_id: site.id,
    url: 'https://demo-saas.sourcetrack.ai/',
    referrer: 'https://chatgpt.com/',
    ai_source: 'ChatGPT',
    session_id: testIdSuffix,
    duration_seconds: 0,
    timestamp: pvTimestamp
  });
  assert.ifError(pvInsertErr);

  // Insert mock conversion for test case 1
  const { error: convInsertErr } = await supabase.from('attributed_conversions').insert({
    site_id: site.id,
    conversion_event_id: 'conv_' + testIdSuffix,
    distinct_id: testIdSuffix,
    conversion_date: dateStr,
    conversion_timestamp: convTimestamp,
    conversion_value: 12345,
    first_touch_source: 'chatgpt.com',
    first_touch_channel: 'AI Search',
    first_touch_timestamp: ftTimestamp,
    channel: 'AI Search'
  });
  assert.ifError(convInsertErr);

  // Insert pageview 1 for test case 2 (ChatGPT, matching source but further away)
  const { error: pv2aInsertErr } = await supabase.from('pageviews').insert({
    site_id: site.id,
    url: 'https://demo-saas.sourcetrack.ai/',
    referrer: 'https://chatgpt.com/',
    ai_source: 'ChatGPT',
    session_id: testIdSuffix2,
    duration_seconds: 0,
    timestamp: pv1Timestamp
  });
  assert.ifError(pv2aInsertErr);

  // Insert pageview 2 for test case 2 (Direct, closer in time but not matching)
  const { error: pv2bInsertErr } = await supabase.from('pageviews').insert({
    site_id: site.id,
    url: 'https://demo-saas.sourcetrack.ai/dashboard',
    referrer: 'https://demo-saas.sourcetrack.ai/', // internal referrer -> Direct
    ai_source: null,
    session_id: testIdSuffix2,
    duration_seconds: 0,
    timestamp: pv2Timestamp
  });
  assert.ifError(pv2bInsertErr);

  // Insert mock conversion for test case 2
  const { error: conv2InsertErr } = await supabase.from('attributed_conversions').insert({
    site_id: site.id,
    conversion_event_id: 'conv_' + testIdSuffix2,
    distinct_id: testIdSuffix2,
    conversion_date: dateStr,
    conversion_timestamp: convTimestamp2,
    conversion_value: 99999, // Unique value to identify
    first_touch_source: 'chatgpt.com',
    first_touch_channel: 'AI Search',
    first_touch_timestamp: ftTimestamp2,
    channel: 'AI Search'
  });
  assert.ifError(conv2InsertErr);

  // Log in to get token (only after service-role writes are complete)
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD
  });
  if (loginErr || !loginData?.session) {
    throw new Error(`Failed to log in: ${loginErr?.message}`);
  }
  const token = loginData.session.access_token;

  try {
    // Run integration test assertion
    await t.test('Verify that ChatGPT revenue is correctly associated with AI: ChatGPT despite 123ms clock skew', async () => {
      const res = await request(`/api/analytics/sources?site_key=${DEMO_SITE_KEY}&days=30&tab=referrer`, token);
      assert.strictEqual(res.status, 200);
      const rows = res.body.data?.rows || [];

      const chatgptRow = rows.find(r => r.name === 'AI: ChatGPT');
      const rawGptRow = rows.find(r => r.name === 'AI: chatgpt.com');

      console.log('Returned rows matching AI:', rows.filter(r => r.name.startsWith('AI:')));

      assert.ok(!rawGptRow, 'Should NOT fall back to raw "AI: chatgpt.com"');
      assert.ok(chatgptRow, 'Should successfully map to "AI: ChatGPT"');
      assert.ok(chatgptRow.revenue >= 12345, 'AI: ChatGPT row should contain the test conversion value');
    });

    await t.test('Verify source prioritization: conversion is associated with AI: ChatGPT even though a Direct pageview is closer in time', async () => {
      const res = await request(`/api/analytics/sources?site_key=${DEMO_SITE_KEY}&days=30&tab=referrer`, token);
      assert.strictEqual(res.status, 200);
      const rows = res.body.data?.rows || [];

      const chatgptRow = rows.find(r => r.name === 'AI: ChatGPT');
      const directRow = rows.find(r => r.name === 'Direct');

      // ChatGPT should receive the $99,999 revenue, Direct should NOT receive it.
      assert.ok(chatgptRow, 'Should have AI: ChatGPT row');
      assert.ok(chatgptRow.revenue >= 99999, 'ChatGPT row should contain the $99,999 conversion value');

      if (directRow) {
        // Assert that the direct row's revenue is not inflated by the test conversion value (99999)
        assert.ok(directRow.revenue < 99999, 'Direct row should NOT contain the $99,999 conversion value');
      }
    });
  } finally {
    // Clean up using service role
    await supabase.auth.signOut();
    await supabase.from('pageviews').delete().eq('site_id', site.id).eq('session_id', testIdSuffix);
    await supabase.from('pageviews').delete().eq('site_id', site.id).eq('session_id', testIdSuffix2);
    await supabase.from('attributed_conversions').delete().eq('site_id', site.id).eq('distinct_id', testIdSuffix);
    await supabase.from('attributed_conversions').delete().eq('site_id', site.id).eq('distinct_id', testIdSuffix2);
  }
});
