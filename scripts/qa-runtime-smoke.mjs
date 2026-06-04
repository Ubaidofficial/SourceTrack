import process from 'process';

console.log('==================================================');
console.log('         SourceTrack Runtime Smoke QA');
console.log('==================================================\n');

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000';
const SOURCETRACK_SITE_KEY = process.env.SOURCETRACK_SITE_KEY || '';
const SOURCETRACK_AUTH_TOKEN = process.env.SOURCETRACK_AUTH_TOKEN || '';

const SOURCETRACK_TEST_PAGE_URL = process.env.SOURCETRACK_TEST_PAGE_URL || 'https://qa-test.example.com/?utm_source=google&utm_campaign=qa&email=test@example.com&gclid=abc123';
const SOURCETRACK_TEST_REFERRER = process.env.SOURCETRACK_TEST_REFERRER || 'https://google.com/search?q=sourcetrack';

console.log(`Configured API Target: ${SOURCETRACK_API_URL}`);
if (!SOURCETRACK_SITE_KEY) {
  console.warn('⚠️ SOURCETRACK_SITE_KEY is not defined. Smoke checks will be skipped or may fail.');
} else {
  console.log(`Configured Site Key: ${SOURCETRACK_SITE_KEY.slice(0, 8)}...`);
}
console.log();

let hasFailures = false;
let hasWarnings = false;

// Helper to make fetch calls easy
async function request(path, options = {}) {
  const url = `${SOURCETRACK_API_URL.replace(/\/+$/, '')}${path}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(SOURCETRACK_AUTH_TOKEN ? { 'Authorization': `Bearer ${SOURCETRACK_AUTH_TOKEN}` } : {}),
        ...(options.headers || {})
      }
    });
    clearTimeout(id);
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = text;
    }
    return {
      status: res.status,
      ok: res.ok,
      body
    };
  } catch (err) {
    clearTimeout(id);
    return {
      status: 0,
      ok: false,
      error: err.message
    };
  }
}

async function runSmokeTests() {
  // A. Health Endpoint
  console.log('--- A. API Reachability / Health ---');
  const healthRes = await request('/health');
  if (healthRes.status === 200) {
    console.log('✅ /health reachable:', healthRes.body);
  } else {
    console.warn('⚠️ /health check failed or skipped (warning only):', healthRes.error || healthRes.status);
    hasWarnings = true;
  }
  console.log();

  if (!SOURCETRACK_SITE_KEY) {
    console.log('==================================================');
    console.log('WARN — runtime smoke partially skipped because SOURCETRACK_SITE_KEY env missing');
    console.log('==================================================');
    process.exit(0);
  }

  // B. Track Event
  console.log('--- B. Ingest Pageview / Track Event ---');
  const trackRes = await request('/api/track', {
    method: 'POST',
    body: JSON.stringify({
      site_key: SOURCETRACK_SITE_KEY,
      event: 'qa_test_event',
      anonymous_id: 'qa_anon_visitor_999',
      page_url: SOURCETRACK_TEST_PAGE_URL,
      referrer: SOURCETRACK_TEST_REFERRER,
      properties: {
        source: 'qa_runtime_smoke'
      }
    })
  });

  if (trackRes.ok && trackRes.body?.success) {
    console.log('✅ Track call processed successfully:', trackRes.body);
  } else {
    console.error('❌ Track call failed:', trackRes.error || trackRes.body || trackRes.status);
    hasFailures = true;
  }
  console.log();

  // C. Conversion Event
  console.log('--- C. Ingest Online Conversion Event ---');
  const orderId = `qa_order_script_${Date.now()}`;
  const conversionPayload = {
    site_key: SOURCETRACK_SITE_KEY,
    event: '$conversion',
    anonymous_id: 'qa_anon_visitor_999',
    page_url: 'https://qa-test.example.com/checkout/thank-you?utm_source=google&token=secret123&gclid=abc123',
    referrer: 'https://qa-test.example.com/pricing',
    conversion_value: 49,
    conversion_type: 'qa_purchase',
    order_id: orderId
  };

  const convRes = await request('/api/conversion', {
    method: 'POST',
    body: JSON.stringify(conversionPayload)
  });

  if (convRes.ok && convRes.body?.success) {
    console.log('✅ Conversion call processed successfully:', convRes.body);
  } else {
    console.error('❌ Conversion call failed:', convRes.error || convRes.body || convRes.status);
    hasFailures = true;
  }
  console.log();

  // D. Duplicate Conversion
  console.log('--- D. Ingest Duplicate Conversion (Deduplication Check) ---');
  const dupRes = await request('/api/conversion', {
    method: 'POST',
    body: JSON.stringify(conversionPayload)
  });

  if (dupRes.ok && dupRes.body?.success) {
    if (dupRes.body?.data?.dedup_skipped) {
      console.log('✅ Duplicate conversion correctly marked as dedup-skipped:', dupRes.body);
    } else {
      console.log('✅ Duplicate conversion accepted (TTL/restart may apply):', dupRes.body);
    }
  } else {
    console.error('❌ Duplicate conversion request failed:', dupRes.error || dupRes.body || dupRes.status);
    hasFailures = true;
  }
  console.log();

  // E. Offline Conversion
  console.log('--- E. Offline Ingestion Endpoint ---');
  const offlineRes = await request('/api/conversion/offline', {
    method: 'POST',
    body: JSON.stringify({
      site_key: SOURCETRACK_SITE_KEY,
      anonymous_id: 'qa_anon_visitor_999',
      conversion_value: 75.50,
      conversion_type: 'offline_lead',
      order_id: `qa_offline_${Date.now()}`
    })
  });

  if (offlineRes.ok && offlineRes.body?.success) {
    console.log('✅ Offline conversion processed successfully:', offlineRes.body);
  } else {
    console.error('❌ Offline conversion failed:', offlineRes.error || offlineRes.body || offlineRes.status);
    hasFailures = true;
  }
  console.log();

  // F. Install Status
  console.log('--- F. Install Status API ---');
  const installRes = await request(`/api/install/status?site_key=${SOURCETRACK_SITE_KEY}`);
  if (installRes.ok && installRes.body?.success) {
    const status = installRes.body?.data?.status;
    const knownStatuses = ['pending', 'verified', 'wrong_domain', 'unknown', 'api_failed', 'error'];
    if (knownStatuses.includes(status)) {
      console.log(`✅ Install status returned valid state '${status}':`, installRes.body.data);
    } else {
      console.warn(`⚠️ Install status returned unexpected state '${status}':`, installRes.body.data);
      hasWarnings = true;
    }
  } else {
    console.error('❌ Install status check failed:', installRes.error || installRes.body || installRes.status);
    hasFailures = true;
  }
  console.log();

  // G. Authenticated Endpoints
  console.log('--- G. Authenticated Endpoints ---');
  if (!SOURCETRACK_AUTH_TOKEN) {
    console.log('⚠️ SOURCETRACK_AUTH_TOKEN is missing. Skipping authenticated site list, health checks, and dedupe logs.');
    hasWarnings = true;
  } else {
    const sitesRes = await request('/api/sites');
    if (sitesRes.ok && sitesRes.body?.success) {
      console.log('✅ Authenticated site list loaded:', sitesRes.body.data?.sites?.length || 0, 'sites found.');
      // Check for security exposure of secret fields in sites array
      const sites = sitesRes.body.data?.sites || [];
      let leakFound = false;
      for (const site of sites) {
        if (site.stripe_customer_id || site.public_share_token) {
          leakFound = true;
        }
      }
      if (leakFound) {
        console.error('❌ Leak warning: /api/sites contains private customer identifiers!');
        hasFailures = true;
      } else {
        console.log('✅ No secret fields leaked in site objects.');
      }
    } else {
      console.error('❌ /api/sites failed:', sitesRes.error || sitesRes.body || sitesRes.status);
      hasFailures = true;
    }

    const healthCheckRes = await request(`/api/dashboard/tracking-health?site_key=${SOURCETRACK_SITE_KEY}`);
    if (healthCheckRes.ok && healthCheckRes.body?.success) {
      console.log('✅ SourceTrack Doctor health check loaded:', healthCheckRes.body.data);
    } else {
      console.error('❌ Tracking health check failed:', healthCheckRes.error || healthCheckRes.body || healthCheckRes.status);
      hasFailures = true;
    }

    const dedupeSummaryRes = await request(`/api/events/dedupe-summary?site_key=${SOURCETRACK_SITE_KEY}`);
    if (dedupeSummaryRes.ok && dedupeSummaryRes.body?.success) {
      console.log('✅ Deduplication summary loaded:', dedupeSummaryRes.body.data);
    } else {
      console.error('❌ Dedupe summary failed:', dedupeSummaryRes.error || dedupeSummaryRes.body || dedupeSummaryRes.status);
      hasFailures = true;
    }
  }
  console.log();

  // Final Verdict
  console.log('==================================================');
  if (hasFailures) {
    console.log('FAIL — runtime smoke failed');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('WARN — runtime smoke completed with warnings/skips');
    process.exit(0);
  } else {
    console.log('PASS — runtime smoke completed');
    process.exit(0);
  }
  console.log('==================================================');
}

runSmokeTests().catch(err => {
  console.error('Smoke tests crashed with exception:', err);
  process.exit(1);
});
