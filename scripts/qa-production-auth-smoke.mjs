import process from 'process';

console.log('==================================================');
console.log('      SourceTrack Production Auth Smoke QA');
console.log('==================================================\n');

const BASE_URL = process.env.AUTH_SMOKE_BASE_URL || 'https://app.sourcetrack.ai';
const API_URL = process.env.SOURCETRACK_API_URL || 'https://api.srctk.com';

console.log(`Target Frontend URL: ${BASE_URL}`);
console.log(`Target API URL:      ${API_URL}\n`);

let hasFailures = false;

// Helper to make fetch calls easily
async function checkRoute(route) {
  const url = `${BASE_URL.replace(/\/+$/, '')}${route}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.status !== 200 && res.status !== 304) {
      console.error(`❌ GET ${route} failed with status: ${res.status}`);
      hasFailures = true;
      return;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      console.error(`❌ GET ${route} did not return HTML. Content-Type: ${contentType}`);
      hasFailures = true;
      return;
    }

    const html = await res.text();
    const hasRoot = html.includes('id="root"') || html.includes("id='root'") || html.includes('id=root');
    const hasAssets = html.includes('/assets/index-') || html.includes('assets/index-');

    if (!hasRoot) {
      console.error(`❌ GET ${route} missing React mounting container (#root)`);
      hasFailures = true;
    } else if (!hasAssets) {
      console.error(`❌ GET ${route} missing compiled asset references (/assets/index-*)`);
      hasFailures = true;
    } else {
      console.log(`✅ GET ${route} is reachable and SPA is loaded (Status: ${res.status})`);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`❌ GET ${route} failed with error: ${err.message}`);
    hasFailures = true;
  }
}

async function checkApiHealth() {
  const url = `${API_URL.replace(/\/+$/, '')}/api/health`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error(`❌ GET /api/health failed with status: ${res.status}`);
      hasFailures = true;
      return;
    }

    const json = await res.json();
    if (json && json.success === true && json.data && json.data.status === 'ok') {
      console.log(`✅ GET /api/health is online: status=${json.data.status}, request_id=${json.data.request_id || 'none'}`);
    } else {
      console.error('❌ GET /api/health returned unexpected payload:', json);
      hasFailures = true;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`❌ GET /api/health failed with error: ${err.message}`);
    hasFailures = true;
  }
}

async function run() {
  const routes = ['/login', '/signup', '/reset-password', '/dashboard'];

  console.log('--- Checking Frontend Routes ---');
  for (const route of routes) {
    await checkRoute(route);
  }
  console.log();

  console.log('--- Checking Backend API Health ---');
  await checkApiHealth();
  console.log();

  console.log('==================================================');
  if (hasFailures) {
    console.error('❌ FAIL — Auth route smoke test encountered errors.');
    process.exit(1);
  } else {
    console.log('✅ PASS — All frontend routes and API health check passed.');
    process.exit(0);
  }
}

run();
