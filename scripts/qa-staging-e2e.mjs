import { spawnSync } from 'child_process';
import process from 'process';

console.log('==================================================');
console.log('    SourceTrack Deployed Staging E2E Runner');
console.log('==================================================\n');

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'https://sourcetrack-dashboard-staging.up.railway.app';
const API_URL = process.env.SOURCETRACK_API_URL || 'https://sourcetrack-api-staging.up.railway.app';

console.log(`Staging Frontend Target: ${FRONTEND_URL}`);
console.log(`Staging API Target:      ${API_URL}`);

// Preflight checks
async function runPreflight() {
  console.log('\n--- Running Preflight DNS & Network Connectivity Checks ---');

  const frontendLoginUrl = `${FRONTEND_URL.replace(/\/+$/, '')}/login`;
  const apiHealthUrl = `${API_URL.replace(/\/+$/, '')}/api/health`;

  console.log(`Checking Frontend: ${frontendLoginUrl}`);
  try {
    const res = await fetch(frontendLoginUrl);
    if (!res.ok && res.status !== 304) {
      console.error(`❌ BLOCKED — staging frontend unreachable (HTTP Status: ${res.status})`);
      process.exit(1);
    }
    console.log('✅ Frontend is reachable.');
  } catch (err) {
    console.error(`❌ BLOCKED — staging frontend unreachable: ${err.message}`);
    process.exit(1);
  }

  console.log(`Checking API health: ${apiHealthUrl}`);
  try {
    const res = await fetch(apiHealthUrl);
    if (!res.ok) {
      console.error(`❌ BLOCKED — staging API health failed (HTTP Status: ${res.status})`);
      process.exit(1);
    }
    const json = await res.json();
    if (!json || json.success !== true || !json.data || json.data.status !== 'ok') {
      console.error('❌ BLOCKED — staging API health failed: Invalid payload response');
      process.exit(1);
    }
    console.log('✅ API health checks passed.');
  } catch (err) {
    console.error(`❌ BLOCKED — staging API health failed: ${err.message}`);
    process.exit(1);
  }

  console.log('--- Preflight checks succeeded! Launching Playwright tests ---\n');
}

await runPreflight();

// Prepare environment variables for Playwright
const env = {
  ...process.env,
  PLAYWRIGHT_BASE_URL: FRONTEND_URL,
  SOURCETRACK_API_URL: API_URL,
};

// Passthrough any additional CLI arguments (e.g. --ui, --headed, etc.)
const extraArgs = process.argv.slice(2);
const args = ['playwright', 'test', ...extraArgs];

console.log(`Running: npx ${args.join(' ')}\n`);

const result = spawnSync('npx', args, {
  env,
  stdio: 'inherit',
  shell: true,
});

if (result.status === 0) {
  console.log('\n✅ PASS — Deployed staging E2E checks passed successfully.');
  process.exit(0);
} else {
  console.error('\n❌ FAIL — Deployed staging E2E checks failed.');
  console.error('\nIf Playwright failed due to missing browser binaries, install them manually by running:');
  console.error('  npx playwright install chromium');
  process.exit(result.status ?? 1);
}
