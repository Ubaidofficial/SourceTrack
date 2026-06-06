import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../api/lib/supabase.js';
import assert from 'assert';

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000';
const siteKey = '1';

console.log('==================================================');
console.log('     Campaigns Drilldown Integration Test');
console.log('==================================================\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

async function run() {
  const supabase = getSupabase();
  const uniqueId = Date.now().toString().slice(-6);

  const testEmail = `qa_campaigns_${uniqueId}@example.com`;
  const testPassword = `TempPassword123!_${uniqueId}`;

  let tempUserId = null;
  let tempMemberCreated = false;
  let originalTrialEndsAt = null;
  let originalPlan = null;
  let siteFetched = false;

  try {
    // 1. Get site & company details
    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('id, company_id, trial_ends_at, plan')
      .eq('site_key', siteKey)
      .single();

    if (siteErr || !site) {
      throw new Error(`Failed to find site for site_key=${siteKey}: ${siteErr?.message}`);
    }

    originalTrialEndsAt = site.trial_ends_at;
    originalPlan = site.plan;
    siteFetched = true;

    const companyId = site.company_id;
    if (!companyId) {
      throw new Error(`Site for site_key=${siteKey} is not linked to a company/workspace`);
    }

    // Temporarily extend trial so the API does not reject requests with 402 "Trial expired"
    console.log(`Temporarily extending trial ends date for site_key=${siteKey}...`);
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateErr } = await supabase
      .from('sites')
      .update({ trial_ends_at: futureDate, plan: 'trial' })
      .eq('site_key', siteKey);
    if (updateErr) {
      throw new Error(`Failed to temporarily update site trial ends date: ${updateErr.message}`);
    }

    // 2. Create temporary auth user
    console.log(`Creating temp auth user ${testEmail}...`);
    const { data: authData, error: authCreateErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    });

    if (authCreateErr || !authData?.user) {
      throw new Error(`Failed to create temp user: ${authCreateErr?.message}`);
    }
    tempUserId = authData.user.id;

    // 3. Link user to company_members
    console.log('Adding user to company_members...');
    const { error: memberErr } = await supabase
      .from('company_members')
      .insert({
        company_id: companyId,
        user_id: tempUserId,
        role: 'admin'
      });

    if (memberErr) {
      throw new Error(`Failed to link user to company: ${memberErr.message}`);
    }
    tempMemberCreated = true;

    // 4. Log in programmatically to get JWT token
    console.log('Logging in user to obtain JWT...');
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (loginErr || !loginData?.session) {
      throw new Error(`Failed to log in: ${loginErr?.message}`);
    }
    const token = loginData.session.access_token;
    console.log('JWT obtained successfully.\n');

    // 5. Query Campaigns Overview Endpoint
    console.log('Testing Campaigns Overview endpoint (/api/campaigns/overview)...');
    const overviewRes = await request(`/api/campaigns/overview?site_key=${siteKey}&dimension=source&days=30`, token);
    
    if (overviewRes.status !== 200) {
      console.error('Overview query failed. Response:', overviewRes);
    }
    assert.strictEqual(overviewRes.status, 200, 'Campaigns overview response status should be 200');
    assert.ok(overviewRes.body?.success, 'Campaigns overview response success should be true');
    assert.ok(overviewRes.body?.data, 'Campaigns overview response should contain data object');
    
    const data = overviewRes.body.data;
    console.log('  Keys returned in KPIs:', Object.keys(data.kpis));
    assert.ok('total_visits' in data.kpis, 'KPIs should include total_visits');
    assert.ok('total_leads' in data.kpis, 'KPIs should include total_leads');
    assert.ok('total_conversions' in data.kpis, 'KPIs should include total_conversions');
    assert.ok('total_revenue' in data.kpis, 'KPIs should include total_revenue');
    assert.ok('total_spend' in data.kpis, 'KPIs should include total_spend');
    assert.ok('avg_roas' in data.kpis, 'KPIs should include avg_roas');
    
    console.log(`  KPI values:
    - total_visits: ${data.kpis.total_visits}
    - total_leads: ${data.kpis.total_leads}
    - total_conversions: ${data.kpis.total_conversions}
    - total_revenue: ${data.kpis.total_revenue}
    - total_spend: ${data.kpis.total_spend}
    - avg_roas: ${data.kpis.avg_roas}`);
    
    if (data.rows.length > 0) {
      const firstRow = data.rows[0];
      console.log('  First row keys:', Object.keys(firstRow));
      assert.ok('visits' in firstRow, 'Row should include visits');
      assert.ok('leads' in firstRow, 'Row should include leads');
      assert.ok('conversions' in firstRow, 'Row should include conversions');
      assert.ok('revenue' in firstRow, 'Row should include revenue');
      assert.ok('spend' in firstRow, 'Row should include spend');
      assert.ok('roas' in firstRow, 'Row should include roas');
      assert.ok('cpl' in firstRow, 'Row should include cpl');
      console.log('  Row structure verified.');
    } else {
      console.log('  No rows returned (empty site data is acceptable).');
    }
    console.log('✅ Campaigns Overview verified successfully.\n');

    // 6. Query Campaigns Export Endpoint
    console.log('Testing Campaigns Export endpoint (/api/campaigns/export)...');
    const exportRes = await request(`/api/campaigns/export?site_key=${siteKey}&dimension=source&days=30`, token);
    
    // Print debug details for review evidence as requested by the user
    console.log('Export Response Status:', exportRes.status);
    const headersObj = {};
    if (exportRes.headers && typeof exportRes.headers.forEach === 'function') {
      exportRes.headers.forEach((v, k) => { headersObj[k] = v; });
    }
    console.log('Export Response Headers:', headersObj);
    const bodyStr = typeof exportRes.body === 'string' ? exportRes.body : JSON.stringify(exportRes.body);
    console.log('Export Response Body (first 500 chars):\n', bodyStr.slice(0, 500));
    
    // If export returns JSON error, print that JSON error
    const contentType = exportRes.headers && typeof exportRes.headers.get === 'function'
      ? exportRes.headers.get('content-type')
      : '';
    const isJson = contentType && contentType.includes('json');
    if (isJson || exportRes.status !== 200) {
      console.error('Export returned JSON/error payload:', exportRes.body);
    }
    
    assert.strictEqual(exportRes.status, 200, 'Campaigns export response status should be 200');
    assert.ok(
      contentType && (contentType.includes('text/csv') || contentType.includes('csv')), 
      `Content-Type should be CSV, got: ${contentType}`
    );
    assert.ok(typeof exportRes.body === 'string', 'Export response should be CSV text');
    
    assert.ok(
      exportRes.body.trim().startsWith('Name,Status,Visits,Leads,Conversions,Revenue,Avg Value,Spend,CPL,Manual ROAS,Trend (%)'),
      'CSV Header columns should match the aligned UI table structure'
    );
    console.log('✅ Campaigns Export CSV verified successfully.\n');

    console.log('==================================================');
    console.log('ALL CAMPAIGNS DRILLDOWN INTEGRATION TESTS PASSED!');
    console.log('==================================================');

  } finally {
    // Cleanup database records
    if (tempMemberCreated && tempUserId) {
      console.log('Cleaning up company_members record...');
      await supabase
        .from('company_members')
        .delete()
        .eq('user_id', tempUserId);
    }
    if (tempUserId) {
      console.log('Cleaning up temp auth user...');
      await supabase.auth.admin.deleteUser(tempUserId);
    }
    if (siteFetched) {
      console.log('Restoring site original plan and trial_ends_at...');
      await supabase
        .from('sites')
        .update({ trial_ends_at: originalTrialEndsAt, plan: originalPlan })
        .eq('site_key', siteKey);
    }
    console.log('Cleanup finished.');
  }
}

run().catch(err => {
  console.error('❌ Integration test failed:', err.message);
  process.exit(1);
});
