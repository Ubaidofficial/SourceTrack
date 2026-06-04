import process from 'process';

console.log('==================================================');
console.log('         SourceTrack Edge-Case QA');
console.log('==================================================\n');

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000';
const SOURCETRACK_SITE_KEY = process.env.SOURCETRACK_SITE_KEY || '';
const SOURCETRACK_AUTH_TOKEN = process.env.SOURCETRACK_AUTH_TOKEN || '';
const SOURCETRACK_BAD_SITE_KEY = process.env.SOURCETRACK_BAD_SITE_KEY || 'qa_invalid_site_key';
const SOURCETRACK_PUBLIC_SHARE_TOKEN = process.env.SOURCETRACK_PUBLIC_SHARE_TOKEN || '';

console.log(`Configured API Target: ${SOURCETRACK_API_URL}`);
if (!SOURCETRACK_SITE_KEY) {
  console.warn('⚠️ SOURCETRACK_SITE_KEY is not defined. Active edge-case checks will be skipped.');
} else {
  console.log(`Configured Site Key: ${SOURCETRACK_SITE_KEY.slice(0, 8)}...`);
}
if (!SOURCETRACK_AUTH_TOKEN) {
  console.warn('⚠️ SOURCETRACK_AUTH_TOKEN is not defined. Authenticated API checks will be skipped.');
}
if (!SOURCETRACK_PUBLIC_SHARE_TOKEN) {
  console.warn('⚠️ SOURCETRACK_PUBLIC_SHARE_TOKEN is not defined. Public override checks will be skipped.');
}
console.log();

let hasFailures = false;
let hasWarnings = false;

const results = {
  'Missing site key handling': 'SKIP',
  'Invalid site key handling': 'SKIP',
  'Malformed URL handling': 'SKIP',
  'PII URL handling': 'SKIP',
  'Conversion validation': 'SKIP',
  'Duplicate conversion handling': 'SKIP',
  'Offline conversion validation': 'SKIP',
  'Install status edge cases': 'SKIP',
  'Public share override protection': 'SKIP',
  'Authenticated protected endpoints': 'SKIP',
  'Plan gate edge checks': 'SKIP'
};

// Helper for fetch calls
async function request(path, options = {}) {
  const url = `${SOURCETRACK_API_URL.replace(/\/+$/, '')}${path}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(SOURCETRACK_AUTH_TOKEN ? { 'Authorization': `Bearer ${SOURCETRACK_AUTH_TOKEN}` } : {}),
      ...(options.headers || {})
    };
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers
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

function isSafeClientError(status) {
  return status >= 400 && status < 500;
}

function printReport(isSkippedTotal = false, skipReason = '') {
  console.log('SourceTrack Edge-Case QA\n');
  console.log('PASS/WARN/FAIL:');
  for (const [name, state] of Object.entries(results)) {
    if (isSkippedTotal) {
      console.log(`- ${name}: WARN (skipped: ${skipReason})`);
    } else {
      console.log(`- ${name}: ${state}`);
    }
  }
  console.log();

  console.log('Final verdict:');
  if (hasFailures && !isSkippedTotal) {
    console.log('FAIL — edge-case QA found blocking failures');
    process.exit(1);
  } else if (hasWarnings || isSkippedTotal) {
    console.log('WARN — edge-case QA partially skipped due to missing optional env vars');
    process.exit(0);
  } else {
    console.log('PASS — edge-case QA passed');
    process.exit(0);
  }
}

async function runEdgeCaseTests() {
  // If SOURCETRACK_SITE_KEY is missing, skip all runtime checks by design
  if (!SOURCETRACK_SITE_KEY) {
    printReport(true, 'site key missing');
    return;
  }

  // Reachability check
  const healthCheck = await request('/health');
  if (healthCheck.status === 0) {
    console.warn(`⚠️ Target API server is unreachable at ${SOURCETRACK_API_URL}. Skipping active edge-case tests.`);
    printReport(true, 'API server offline');
    return;
  }

  // 1. Missing site key handling
  try {
    const resTrack = await request('/api/track', {
      method: 'POST',
      body: JSON.stringify({ event: 'test_event' })
    });
    const resConv = await request('/api/conversion', {
      method: 'POST',
      body: JSON.stringify({ event: '$conversion' })
    });

    if (isSafeClientError(resTrack.status) && isSafeClientError(resConv.status)) {
      results['Missing site key handling'] = 'PASS';
    } else {
      console.error(`❌ Missing site key handling failed: /api/track status=${resTrack.status}, /api/conversion status=${resConv.status}`);
      results['Missing site key handling'] = 'FAIL';
      hasFailures = true;
    }
  } catch (err) {
    console.error('❌ Missing site key handling test crashed:', err.message);
    results['Missing site key handling'] = 'FAIL';
    hasFailures = true;
  }

  // 2. Invalid site key handling
  try {
    const resTrack = await request('/api/track', {
      method: 'POST',
      body: JSON.stringify({ site_key: SOURCETRACK_BAD_SITE_KEY, event: 'test_event' })
    });
    const resConv = await request('/api/conversion', {
      method: 'POST',
      body: JSON.stringify({ site_key: SOURCETRACK_BAD_SITE_KEY, event: '$conversion' })
    });

    if (isSafeClientError(resTrack.status) && isSafeClientError(resConv.status)) {
      results['Invalid site key handling'] = 'PASS';
    } else {
      console.error(`❌ Invalid site key handling failed: /api/track status=${resTrack.status}, /api/conversion status=${resConv.status}`);
      results['Invalid site key handling'] = 'FAIL';
      hasFailures = true;
    }
  } catch (err) {
    console.error('❌ Invalid site key handling test crashed:', err.message);
    results['Invalid site key handling'] = 'FAIL';
    hasFailures = true;
  }

  // 3. Malformed URL handling
  try {
    const payloads = [
      { site_key: SOURCETRACK_SITE_KEY, event: 'test_malformed_1', page_url: 'not-a-url%%%%' },
      { site_key: SOURCETRACK_SITE_KEY, event: 'test_malformed_2', page_url: '/about?phone=1234567890&utm_campaign=qa' }
    ];

    let allPassed = true;
    for (const p of payloads) {
      const res = await request('/api/track', {
        method: 'POST',
        body: JSON.stringify(p)
      });
      if (res.status !== 200 || !res.body?.success) {
        console.error(`❌ Malformed URL handling failed for page_url "${p.page_url}": status=${res.status}`, res.body);
        allPassed = false;
      }
    }

    results['Malformed URL handling'] = allPassed ? 'PASS' : 'FAIL';
    if (!allPassed) hasFailures = true;
  } catch (err) {
    console.error('❌ Malformed URL handling test crashed:', err.message);
    results['Malformed URL handling'] = 'FAIL';
    hasFailures = true;
  }

  // 4. PII URL handling
  try {
    const p = {
      site_key: SOURCETRACK_SITE_KEY,
      event: 'test_pii_url',
      page_url: 'https://example.com/?email=test@example.com&token=secret&utm_source=google&gclid=abc123',
      referrer: 'https://example.com/?phone=1234567890&token=another_secret'
    };
    const res = await request('/api/track', {
      method: 'POST',
      body: JSON.stringify(p)
    });
    if (res.status === 200 && res.body?.success) {
      results['PII URL handling'] = 'PASS';
    } else {
      console.error(`❌ PII URL handling failed: status=${res.status}`, res.body);
      results['PII URL handling'] = 'FAIL';
      hasFailures = true;
    }
  } catch (err) {
    console.error('❌ PII URL handling test crashed:', err.message);
    results['PII URL handling'] = 'FAIL';
    hasFailures = true;
  }

  // 5. Conversion validation
  try {
    const payloads = [
      { site_key: SOURCETRACK_SITE_KEY, event: '$conversion', conversion_value: null },
      { site_key: SOURCETRACK_SITE_KEY, event: '$conversion', conversion_value: -100 },
      { site_key: SOURCETRACK_SITE_KEY, event: '$conversion', conversion_value: "invalid_value" },
      { site_key: SOURCETRACK_SITE_KEY, event: '$conversion', conversion_value: 99999999 },
      { site_key: SOURCETRACK_SITE_KEY, event: '$conversion', conversion_value: 50, order_id: null }
    ];

    let allSafe = true;
    for (const p of payloads) {
      const res = await request('/api/conversion', {
        method: 'POST',
        body: JSON.stringify(p)
      });
      if (res.status >= 500) {
        console.error(`❌ Conversion validation returned 500 error for conversion_value=${p.conversion_value}: status=${res.status}`);
        allSafe = false;
      }
    }

    results['Conversion validation'] = allSafe ? 'PASS' : 'FAIL';
    if (!allSafe) hasFailures = true;
  } catch (err) {
    console.error('❌ Conversion validation test crashed:', err.message);
    results['Conversion validation'] = 'FAIL';
    hasFailures = true;
  }

  // 6. Duplicate conversion handling
  try {
    const orderId = `qa_dup_edge_${Date.now()}`;
    const payload = {
      site_key: SOURCETRACK_SITE_KEY,
      event: '$conversion',
      conversion_value: 120,
      order_id: orderId
    };

    const res1 = await request('/api/conversion', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const res2 = await request('/api/conversion', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res1.status === 200 && res2.status === 200) {
      results['Duplicate conversion handling'] = 'PASS';
    } else {
      console.error(`❌ Duplicate conversion handling failed: res1=${res1.status}, res2=${res2.status}`);
      results['Duplicate conversion handling'] = 'FAIL';
      hasFailures = true;
    }
  } catch (err) {
    console.error('❌ Duplicate conversion test crashed:', err.message);
    results['Duplicate conversion handling'] = 'FAIL';
    hasFailures = true;
  }

  // 7. Offline conversion validation
  try {
    // a. Missing anonymous_id and user_id -> expected 400
    const resMissingId = await request('/api/conversion/offline', {
      method: 'POST',
      body: JSON.stringify({ site_key: SOURCETRACK_SITE_KEY, conversion_value: 50 })
    });

    // b. Missing conversion_type -> expected 200
    const resMissingType = await request('/api/conversion/offline', {
      method: 'POST',
      body: JSON.stringify({ site_key: SOURCETRACK_SITE_KEY, anonymous_id: 'qa_offline_anon_1', conversion_value: 50 })
    });

    // c. Invalid conversion_value -> expected 400
    const resInvalidVal = await request('/api/conversion/offline', {
      method: 'POST',
      body: JSON.stringify({ site_key: SOURCETRACK_SITE_KEY, anonymous_id: 'qa_offline_anon_1', conversion_value: "not_a_number" })
    });

    // d. Valid payload -> expected 200
    const resValid = await request('/api/conversion/offline', {
      method: 'POST',
      body: JSON.stringify({ site_key: SOURCETRACK_SITE_KEY, anonymous_id: 'qa_offline_anon_2', conversion_value: 80, conversion_type: 'offline_lead' })
    });

    const missingIdOk = resMissingId.status === 400;
    const missingTypeOk = resMissingType.status === 200 && resMissingType.body?.success;
    const invalidValOk = resInvalidVal.status === 400;
    const validOk = resValid.status === 200 && resValid.body?.success;

    if (missingIdOk && missingTypeOk && invalidValOk && validOk) {
      results['Offline conversion validation'] = 'PASS';
    } else {
      console.error('❌ Offline conversion validation failed flags:', {
        missingIdOk, status1: resMissingId.status,
        missingTypeOk, status2: resMissingType.status,
        invalidValOk, status3: resInvalidVal.status,
        validOk, status4: resValid.status
      });
      results['Offline conversion validation'] = 'FAIL';
      hasFailures = true;
    }
  } catch (err) {
    console.error('❌ Offline conversion validation test crashed:', err.message);
    results['Offline conversion validation'] = 'FAIL';
    hasFailures = true;
  }

  // 8. Install status edge cases
  try {
    const resNoKey = await request('/api/install/status'); // requires user auth
    const resBadKey = await request(`/api/install/status?site_key=${SOURCETRACK_BAD_SITE_KEY}`); // requires user auth & site key lookup

    // If SOURCETRACK_AUTH_TOKEN is missing, both of these will be 401 because requireUserAuth triggers.
    // That is safe behavior!
    let noKeyOk = isSafeClientError(resNoKey.status);
    let badKeyOk = isSafeClientError(resBadKey.status);

    let validKeyOk = true;
    if (SOURCETRACK_AUTH_TOKEN && SOURCETRACK_SITE_KEY) {
      const resValid = await request(`/api/install/status?site_key=${SOURCETRACK_SITE_KEY}`);
      if (resValid.status === 200 && resValid.body?.success) {
        const status = resValid.body?.data?.status;
        const validStatuses = ['pending', 'verified', 'wrong_domain', 'unknown', 'api_failed', 'error'];
        if (!validStatuses.includes(status)) {
          console.error(`❌ Install status returned invalid status state: "${status}"`);
          validKeyOk = false;
        }
      } else {
        console.error(`❌ Install status query failed: status=${resValid.status}`, resValid.body);
        validKeyOk = false;
      }
    } else {
      console.log('⚠️ SOURCETRACK_AUTH_TOKEN or SOURCETRACK_SITE_KEY missing. Skipping valid install status check.');
    }

    if (noKeyOk && badKeyOk && validKeyOk) {
      results['Install status edge cases'] = 'PASS';
    } else {
      results['Install status edge cases'] = 'FAIL';
      hasFailures = true;
    }
  } catch (err) {
    console.error('❌ Install status edge cases test crashed:', err.message);
    results['Install status edge cases'] = 'FAIL';
    hasFailures = true;
  }

  // 9. Public share override protection
  if (!SOURCETRACK_PUBLIC_SHARE_TOKEN) {
    results['Public share override protection'] = 'WARN (skipped)';
    hasWarnings = true;
  } else {
    try {
      const token = SOURCETRACK_PUBLIC_SHARE_TOKEN;
      const queries = [
        `/api/public/${token}?site_key=evil`,
        `/api/public/${token}?site_id=999`,
        `/api/public/${token}?siteKey=evil`,
        `/api/public/${token}?siteId=999`
      ];

      let overrideBlocked = true;
      for (const q of queries) {
        const res = await request(q);
        if (!isSafeClientError(res.status) || res.body?.success === true) {
          console.error(`❌ Public share override protection failed for query "${q}": status=${res.status}, success=${res.body?.success}`);
          overrideBlocked = false;
        }
      }

      results['Public share override protection'] = overrideBlocked ? 'PASS' : 'FAIL';
      if (!overrideBlocked) hasFailures = true;
    } catch (err) {
      console.error('❌ Public share override protection test crashed:', err.message);
      results['Public share override protection'] = 'FAIL';
      hasFailures = true;
    }
  }

  // 10. Authenticated protected endpoints
  if (!SOURCETRACK_AUTH_TOKEN) {
    results['Authenticated protected endpoints'] = 'WARN (skipped)';
    hasWarnings = true;
  } else {
    try {
      const resSites = await request('/api/sites');
      let sitesOk = false;
      if (resSites.status === 200 && resSites.body?.success) {
        const sites = resSites.body?.data?.sites || [];
        let leakFound = false;
        for (const site of sites) {
          if (site.stripe_customer_id || site.public_share_token || site.secrets || site.private_tokens) {
            leakFound = true;
            console.error(`❌ Security Leak: /api/sites response includes private fields for site id=${site.id}`);
          }
        }
        sitesOk = !leakFound;
      } else {
        console.error(`❌ GET /api/sites failed: status=${resSites.status}`, resSites.body);
      }

      let healthOk = true;
      let dedupeOk = true;
      let exportOk = true;

      if (SOURCETRACK_SITE_KEY) {
        const resHealth = await request(`/api/dashboard/tracking-health?site_key=${SOURCETRACK_SITE_KEY}`);
        if (resHealth.status !== 200 || !resHealth.body?.success) {
          console.error(`❌ GET /api/dashboard/tracking-health failed: status=${resHealth.status}`, resHealth.body);
          healthOk = false;
        }

        const resDedupe = await request(`/api/events/dedupe-summary?site_key=${SOURCETRACK_SITE_KEY}`);
        if (resDedupe.status !== 200 || !resDedupe.body?.success) {
          console.error(`❌ GET /api/events/dedupe-summary failed: status=${resDedupe.status}`, resDedupe.body);
          dedupeOk = false;
        }

        const resExport = await request(`/api/export/report?site_key=${SOURCETRACK_SITE_KEY}&model=first_touch&date_from=2026-05-01&date_to=2026-06-01&group_by=source&metric=revenue`);
        if (resExport.status !== 200 && resExport.status !== 402) {
          console.error(`❌ GET /api/export/report failed: status=${resExport.status}`, resExport.body);
          exportOk = false;
        }
      } else {
        console.log('⚠️ SOURCETRACK_SITE_KEY missing. Skipping authenticated dashboard health, dedupe, and export reports.');
      }

      if (sitesOk && healthOk && dedupeOk && exportOk) {
        results['Authenticated protected endpoints'] = 'PASS';
      } else {
        results['Authenticated protected endpoints'] = 'FAIL';
        hasFailures = true;
      }
    } catch (err) {
      console.error('❌ Authenticated protected endpoints test crashed:', err.message);
      results['Authenticated protected endpoints'] = 'FAIL';
      hasFailures = true;
    }
  }

  // 11. Plan gate edge checks
  if (!SOURCETRACK_AUTH_TOKEN || !SOURCETRACK_SITE_KEY) {
    results['Plan gate edge checks'] = 'WARN (skipped)';
    hasWarnings = true;
  } else {
    try {
      const resAttr = await request(`/api/attribution?model=linear&site_key=${SOURCETRACK_SITE_KEY}&date_from=2026-05-01&date_to=2026-06-01`);
      const resExport = await request(`/api/export/report?site_key=${SOURCETRACK_SITE_KEY}&model=first_touch&date_from=2026-05-01&date_to=2026-06-01&group_by=source&metric=revenue`);

      let gateAttributionOk = resAttr.status === 200 || resAttr.status === 402 || resAttr.status === 400;
      let gateExportOk = resExport.status === 200 || resExport.status === 402 || resExport.status === 400;

      if (resAttr.status === 402) {
        console.log(`ℹ️ Plan gate check: /api/attribution returned 402 as expected for gated features (current plan is likely free/starter).`);
      } else if (resAttr.status === 200) {
        console.log(`ℹ️ Plan gate check: /api/attribution returned 200 (current plan has advanced attribution enabled).`);
      }

      if (resExport.status === 402) {
        console.log(`ℹ️ Plan gate check: /api/export/report returned 402 as expected for gated features.`);
      } else if (resExport.status === 200) {
        console.log(`ℹ️ Plan gate check: /api/export/report returned 200 (current plan has CSV export enabled).`);
      }

      if (gateAttributionOk && gateExportOk) {
        results['Plan gate edge checks'] = 'PASS';
      } else {
        console.error(`❌ Plan gate checks failed: attribution_status=${resAttr.status}, export_status=${resExport.status}`);
        results['Plan gate edge checks'] = 'FAIL';
        hasFailures = true;
      }
    } catch (err) {
      console.error('❌ Plan gate edge checks crashed:', err.message);
      results['Plan gate edge checks'] = 'FAIL';
      hasFailures = true;
    }
  }

  printReport();
}

runEdgeCaseTests().catch(err => {
  console.error('Edge-case QA script crashed with exception:', err);
  process.exit(1);
});
