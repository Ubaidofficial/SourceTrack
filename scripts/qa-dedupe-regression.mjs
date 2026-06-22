// MANUAL TEST ONLY: Run against a warm staging environment.
// Do NOT wire this as a blocking CI gate yet. It relies on a fixed 30s sleep
// and requires the staging proxy to be warm, which will false-fail in cold CI.
// If integrated into CI in the future, it must be updated with a polling/retry mechanism.

import 'dotenv/config';
import { getSupabase } from '../api/lib/supabase.js';
import { ph } from '../api/lib/posthog.js';
import { getFlexibleReport } from '../api/lib/attribution-engine.js';
import { execSync } from 'child_process';

const dbUrl = process.env.SUPABASE_URL || '';
const phProjectId = process.env.POSTHOG_PROJECT_ID || '';

// Hard staging checks
const EXPECTED_STAGING_DB = 'https://nrsvpwzekfrdrzkoecfk.supabase.co';
const EXPECTED_STAGING_PH_PROJECT = '469905';

if (dbUrl !== EXPECTED_STAGING_DB || phProjectId !== EXPECTED_STAGING_PH_PROJECT) {
  console.error(`❌ ERROR: This test must only run on staging. Current DB: ${dbUrl}, PostHog: ${phProjectId}`);
  process.exit(1);
}

const supabase = getSupabase();
const siteKey = 'de200000-babe-41d4-a716-446655440000';
const siteId = 'de200000-babe-41d4-a716-446655441111';

async function main() {
  console.log('==================================================');
  console.log('       Conversion Deduplication Regression Test    ');
  console.log('==================================================\n');

  // Reset job locks to ensure nightly job runs smoothly
  await supabase
    .from('job_runs')
    .update({ status: 'success' })
    .eq('job_name', 'nightly-attribution')
    .eq('status', 'running');

  const now = Date.now();
  const distinctId = `demo_dedupe_reg_${now}`;

  // Scenarios setup
  const orderIdHappy = `reg_happy_${now}`;
  const orderIdDiff = `reg_diff_${now}`;

  console.log('1. Seeding pageview touchpoints (30s ago)...');
  ph.capture({
    distinctId,
    event: '$pageview',
    timestamp: new Date(now - 30000),
    properties: {
      site_id: siteId,
      site_key: siteKey,
      page_url: 'https://demo-saas-realistic.example.com/',
      referrer: 'https://www.google.com',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: orderIdHappy
    }
  });
  ph.capture({
    distinctId,
    event: '$pageview',
    timestamp: new Date(now - 30000),
    properties: {
      site_id: siteId,
      site_key: siteKey,
      page_url: 'https://demo-saas-realistic.example.com/',
      referrer: 'https://www.google.com',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: orderIdDiff
    }
  });
  await ph.flush();

  console.log('2. Seeding conversion events...');

  // Scenario A: Twin conversions (same external_event_id, same values: $150)
  console.log(`- Scenario A: Twin events for order_id: ${orderIdHappy} (both value = 150)`);
  for (let i = 0; i < 2; i++) {
    ph.capture({
      distinctId,
      event: '$conversion',
      timestamp: new Date(now - 10000 + i * 1000),
      properties: {
        site_id: siteId,
        site_key: siteKey,
        conversion_value: 150.00,
        conversion_type: 'closed_won',
        utm_campaign: orderIdHappy,
        utm_source: 'google',
        utm_medium: 'cpc',
        order_id: orderIdHappy,
        external_event_id: `${siteId}:${orderIdHappy}:closed_won`
      }
    });
  }

  // Scenario B: Twin conversions with DIFFERENT values ($100 first, $200 second)
  console.log(`- Scenario B: twin events for order_id: ${orderIdDiff} ($100 first, $200 second)`);
  ph.capture({
    distinctId,
    event: '$conversion',
    timestamp: new Date(now - 15000), // earliest
    properties: {
      site_id: siteId,
      site_key: siteKey,
      conversion_value: 100.00,
      conversion_type: 'closed_won',
      utm_campaign: orderIdDiff,
      utm_source: 'google',
      utm_medium: 'cpc',
      order_id: orderIdDiff,
      external_event_id: `${siteId}:${orderIdDiff}:closed_won`
    }
  });
  ph.capture({
    distinctId,
    event: '$conversion',
    timestamp: new Date(now - 5000), // latest
    properties: {
      site_id: siteId,
      site_key: siteKey,
      conversion_value: 200.00,
      conversion_type: 'closed_won',
      utm_campaign: orderIdDiff,
      utm_source: 'google',
      utm_medium: 'cpc',
      order_id: orderIdDiff,
      external_event_id: `${siteId}:${orderIdDiff}:closed_won`
    }
  });

  // Scenario C: Twin keyless conversions (no external_event_id, same values: $50)
  const orderIdNull = `reg_null_${now}`;
  console.log(`- Scenario C: Twin keyless events (no order_id, value = 50, campaign = ${orderIdNull})`);
  for (let i = 0; i < 2; i++) {
    ph.capture({
      distinctId,
      event: '$conversion',
      timestamp: new Date(now - 10000 + i * 1000),
      properties: {
        site_id: siteId,
        site_key: siteKey,
        conversion_value: 50.00,
        conversion_type: 'closed_won',
        utm_campaign: orderIdNull,
        utm_source: 'google',
        utm_medium: 'cpc',
        order_id: null,
        external_event_id: null
      }
    });
  }

  console.log('Flushing PostHog events...');
  await ph.flush();

  console.log('Waiting 30 seconds for PostHog to ingest...');
  await new Promise(r => setTimeout(r, 30000));

  console.log('\n3. VERIFYING CLICKHOUSE (getFlexibleReport)...');

  // Query Scenario A (using last_touch to query utm_campaign)
  const repA = await getFlexibleReport(siteId, 'last_touch', '2026-06-20', '2026-06-25', 'campaign', 'revenue', { campaign: orderIdHappy });
  const countRepA = await getFlexibleReport(siteId, 'last_touch', '2026-06-20', '2026-06-25', 'campaign', 'conversions', { campaign: orderIdHappy });
  console.log('Scenario A ClickHouse Revenue:', repA);
  console.log('Scenario A ClickHouse Conversions:', countRepA);
  if (repA[0]?.revenue !== 150 || countRepA[0]?.conversions !== 1) {
    throw new Error('❌ Scenario A failed in ClickHouse: expected $150.00 and 1 conversion');
  }
  console.log('✅ Scenario A ClickHouse Deduplication Verified.');

  // Query Scenario B (Earliest wins)
  const repB = await getFlexibleReport(siteId, 'last_touch', '2026-06-20', '2026-06-25', 'campaign', 'revenue', { campaign: orderIdDiff });
  const countRepB = await getFlexibleReport(siteId, 'last_touch', '2026-06-20', '2026-06-25', 'campaign', 'conversions', { campaign: orderIdDiff });
  console.log('Scenario B ClickHouse Revenue (Earliest wins):', repB);
  console.log('Scenario B ClickHouse Conversions:', countRepB);
  if (repB[0]?.revenue !== 100 || countRepB[0]?.conversions !== 1) {
    throw new Error('❌ Scenario B failed in ClickHouse: expected $100.00 (earliest value) and 1 conversion');
  }
  console.log('✅ Scenario B ClickHouse Deduplication Verified.');

  // Query Scenario C (Keyless - should double count: $100 total, 2 conversions)
  const repC = await getFlexibleReport(siteId, 'last_touch', '2026-06-20', '2026-06-25', 'campaign', 'revenue', { campaign: orderIdNull });
  const countRepC = await getFlexibleReport(siteId, 'last_touch', '2026-06-20', '2026-06-25', 'campaign', 'conversions', { campaign: orderIdNull });
  console.log('Scenario C ClickHouse Keyless (Should double count):', { revenue: repC, conversions: countRepC });
  if (repC[0]?.revenue !== 100 || countRepC[0]?.conversions !== 2) {
    throw new Error('❌ Scenario C failed in ClickHouse: expected $100.00 and 2 conversions (double-counted)');
  }
  console.log('✅ Scenario C ClickLess Double Counting Verified.');

  console.log('\n4. RUNNING NIGHTLY ATTRIBUTION JOB...');
  execSync('node api/jobs/nightly-attribution.js', { stdio: 'inherit' });

  console.log('\n5. VERIFYING SUPABASE (attributed_conversions)...');

  // Check Scenario A in DB
  const { data: dbRowsA } = await supabase
    .from('attributed_conversions')
    .select('conversion_value, external_event_id')
    .eq('site_id', siteId)
    .eq('external_event_id', `${siteId}:${orderIdHappy}:closed_won`);

  console.log('Scenario A Supabase rows:', dbRowsA);
  if (dbRowsA.length !== 1 || Number(dbRowsA[0].conversion_value) !== 150) {
    throw new Error('❌ Scenario A failed in Supabase: expected 1 row with value $150.00');
  }
  console.log('✅ Scenario A Supabase Deduplication Verified.');

  // Check Scenario B in DB (Earliest wins)
  const { data: dbRowsB } = await supabase
    .from('attributed_conversions')
    .select('conversion_value, external_event_id')
    .eq('site_id', siteId)
    .eq('external_event_id', `${siteId}:${orderIdDiff}:closed_won`);

  console.log('Scenario B Supabase rows:', dbRowsB);
  if (dbRowsB.length !== 1 || Number(dbRowsB[0].conversion_value) !== 100) {
    throw new Error('❌ Scenario B failed in Supabase: expected 1 row with earliest value $100.00');
  }
  console.log('✅ Scenario B Supabase Deduplication Verified.');

  // Check Scenario C in DB (should have 2 rows for the same user)
  const { data: dbRowsC } = await supabase
    .from('attributed_conversions')
    .select('conversion_value, external_event_id')
    .eq('site_id', siteId)
    .eq('distinct_id', distinctId)
    .is('external_event_id', null);

  console.log('Scenario C Supabase rows (Keyless - should double count):', dbRowsC);
  if (dbRowsC.length !== 2) {
    throw new Error('❌ Scenario C failed in Supabase: expected 2 keyless rows');
  }
  console.log('✅ Scenario C Supabase Keyless Double Counting Verified.');

  console.log('\n🎉 ALL REGRESSION TESTS PASSED!');
}

main().catch(err => {
  console.error('\n❌ REGRESSION TEST FAILED:', err.message);
  process.exit(1);
});
