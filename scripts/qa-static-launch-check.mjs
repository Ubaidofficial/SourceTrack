import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT_DIR = process.cwd();

console.log('==================================================');
console.log('         SourceTrack Static Launch QA');
console.log('==================================================\n');

let hasFailed = false;

// Helpers
function runCmd(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function checkFileExists(relPath) {
  return fs.existsSync(path.join(ROOT_DIR, relPath));
}

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

function scanDirRecursive(dirPath, fileList = []) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      scanDirRecursive(filePath, fileList);
    } else if (stat.isFile() && /\.(js|jsx|ts|tsx|md)$/.test(file)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// A. Git Cleanliness Overview
console.log('--- A. Git Cleanliness & Log ---');
const gitStatus = runCmd('git', ['status', '--short']);
console.log(gitStatus.stdout ? gitStatus.stdout : '(clean)\n');

const gitLog = runCmd('git', ['log', '--oneline', '-10']);
console.log(gitLog.stdout);

// B. Backend Syntax Checks
console.log('--- B. Backend Syntax Checks ---');
const backendFiles = [
  'api/bootstrap.js',
  'api/index.js',
  'api/lib/environment-safety.js',
  'api/middleware/auth.js',
  'api/middleware/user-auth.js',
  'api/lib/plan-features.js',
  'api/lib/utils.js',
  'api/routes/track.js',
  'api/routes/conversion.js',
  'api/routes/conversion-offline.js',
  'api/routes/install.js',
  'api/routes/dashboard.js',
  'api/routes/events.js',
  'api/routes/export.js',
  'api/routes/public-dashboard.js',
  'api/routes/sites.js',
  'api/routes/saved-reports.js',
  'api/routes/attribution.js',
  'api/routes/ai-analytics.js',
  'api/routes/ai-chat.js',
  'api/routes/campaign-costs.js'
];

let syntaxPass = true;
for (const file of backendFiles) {
  if (!checkFileExists(file)) {
    console.error(`❌ Missing file: ${file}`);
    syntaxPass = false;
    continue;
  }
  const check = runCmd('node', ['--check', file]);
  if (check.code !== 0) {
    console.error(`❌ Syntax error in ${file}:`, check.stderr);
    syntaxPass = false;
  }
}
if (syntaxPass) {
  console.log('✅ All backend files syntax passed.');
} else {
  console.error('❌ Backend syntax checks failed.');
  hasFailed = true;
}
console.log();

// C. Frontend Build
console.log('--- C. Frontend Build ---');
let buildPass = true;
if (checkFileExists('dashboard')) {
  console.log('Running frontend production build...');
  const build = runCmd('npm', ['run', 'build'], { cwd: path.join(ROOT_DIR, 'dashboard') });
  if (build.code !== 0) {
    console.error('❌ Frontend build failed:\n', build.stderr || build.stdout);
    buildPass = false;
    hasFailed = true;
  } else {
    console.log('✅ Frontend build succeeded.');
  }
} else {
  console.warn('⚠️ dashboard directory not found, skipping build.');
}
console.log();

// D. Whitespace Check
console.log('--- D. Whitespace Check ---');
const whitespace = runCmd('git', ['diff', '--check']);
if (whitespace.code !== 0) {
  console.error('❌ Whitespace issues / merge markers detected:\n', whitespace.stdout || whitespace.stderr);
  hasFailed = true;
} else {
  console.log('✅ No whitespace violations.');
}
console.log();

// E. Forbidden Copy/API Grep Checks
console.log('--- E. Forbidden Copy/API Grep Checks ---');
const forbiddenStrings = [
  'window.trackiq',
  'trackiq.conversion',
  '.event(',
  '.id(',
  'getCrossDomainUrl',
  'data-user-id-selector',
  'data-trackiq',
  '__tq_id',
  '__tq_ft',
  'PostHog verification',
  'queryHogQL',
  'GDPR compliant',
  'GDPR-safe',
  'fully compliant',
  'Fully compliant',
  'ePrivacy compliant',
  'PECR compliant',
  '90%',
  'Server-side CAPI sync',
  'Meta Conversions API',
  'Google Enhanced Conversions',
  'Google Ads Conversions API',
  'TikTok Events API',
  'LinkedIn CAPI',
  'Microsoft UET',
  'server-side CAPI',
  '40% more conversions',
  'Shopify app',
  'WooCommerce integration',
  'CRM integration'
];

const pathsToSearch = [
  'dashboard/src/pages',
  'dashboard/src/components',
  'tracker/tracker.js',
  'SESSION_STATE.md',
  'SESSION_LOG.md',
  'SESSION_HANDOFF.md'
];

let grepFailure = false;
const warningsList = [];

for (const p of pathsToSearch) {
  const fullPath = path.join(ROOT_DIR, p);
  if (!fs.existsSync(fullPath)) continue;

  const files = fs.statSync(fullPath).isDirectory() ? scanDirRecursive(fullPath) : [fullPath];

  for (const file of files) {
    const relativeFile = path.relative(ROOT_DIR, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const forbidden of forbiddenStrings) {
        if (line.includes(forbidden)) {
          // If the file is documentation/session logs, we treat it as a warning
          const isDocOrLog = relativeFile.endsWith('.md');
          const message = `Found "${forbidden}" in ${relativeFile}:${i + 1} -> ${line.trim()}`;

          if (isDocOrLog) {
            warningsList.push(message);
          } else {
            console.error(`❌ ERROR: ${message}`);
            grepFailure = true;
          }
        }
      }
    }
  }
}

if (warningsList.length > 0) {
  console.log('⚠️ WARNINGS (Historical/Documentation references allowed):');
  for (const warn of warningsList) {
    console.log(`  - ${warn}`);
  }
}

if (!grepFailure) {
  console.log('✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).');
} else {
  console.error('❌ Forbidden copy/API grep checks failed.');
  hasFailed = true;
}
console.log();

// F. Route Mount Checks
console.log('--- F. Route Mount Checks ---');
let mountPass = true;
if (checkFileExists('api/index.js')) {
  const indexContent = readFile('api/index.js');
  const requiredMounts = [
    '/api/conversion/offline',
    '/api/sites',
    '/api/export',
    '/api/reports',
    '/api/campaign-costs'
  ];
  const requiredRouters = [
    'conversionOffline',
    'sitesRouter',
    'exportRouter',
    'savedReportsRouter',
    'campaignCostsRouter'
  ];

  for (const m of requiredMounts) {
    if (!indexContent.includes(m)) {
      console.error(`❌ Route mount not found in api/index.js: ${m}`);
      mountPass = false;
    }
  }
  for (const r of requiredRouters) {
    if (!indexContent.includes(r)) {
      console.error(`❌ Router import/reference not found in api/index.js: ${r}`);
      mountPass = false;
    }
  }
} else {
  console.error('❌ api/index.js not found.');
  mountPass = false;
}

if (mountPass) {
  console.log('✅ Route mount checks passed.');
} else {
  console.error('❌ Route mount checks failed.');
  hasFailed = true;
}
console.log();

// G. Security & Plan Scoping Static Checks
console.log('--- G. Security & Plan Scoping Checks ---');
let securityPass = true;

// 1. sites.js check
if (checkFileExists('api/routes/sites.js')) {
  const content = readFile('api/routes/sites.js');
  const forbiddenSelects = ['public_share_token', 'stripe_customer_id', 'secret'];
  for (const f of forbiddenSelects) {
    if (content.includes(f)) {
      console.error(`❌ Security warning in api/routes/sites.js: contains forbidden field '${f}'`);
      securityPass = false;
    }
  }
}

// 2. public-dashboard.js scope rejection check
if (checkFileExists('api/routes/public-dashboard.js')) {
  const content = readFile('api/routes/public-dashboard.js');
  const checkFields = ['site_key', 'site_id', 'siteKey', 'siteId'];
  const hasRejection = checkFields.every(f => content.includes(f));
  if (!hasRejection) {
    console.error(`❌ Security warning in api/routes/public-dashboard.js: does not reject all scope override fields.`);
    securityPass = false;
  }
}

// 3. export.js scoping check
if (checkFileExists('api/routes/export.js')) {
  const content = readFile('api/routes/export.js');
  if (!content.includes('site_id') || !content.includes('req.site.id')) {
    console.error(`❌ Security warning in api/routes/export.js: saved reports are not verified with site scoping context.`);
    securityPass = false;
  }
}

// 4. saved-reports.js scoping check
if (checkFileExists('api/routes/saved-reports.js')) {
  const content = readFile('api/routes/saved-reports.js');
  if (!content.includes('req.site.id')) {
    console.error(`❌ Security warning in api/routes/saved-reports.js: req.site.id missing from query context.`);
    securityPass = false;
  }
}

// 5. plan gates requireFeature check
const gatedFiles = [
  'api/routes/attribution.js',
  'api/routes/saved-reports.js',
  'api/routes/ai-analytics.js',
  'api/routes/ai-chat.js',
  'api/routes/campaign-costs.js'
];
for (const file of gatedFiles) {
  if (checkFileExists(file)) {
    const content = readFile(file);
    if (!content.includes('requireFeature')) {
      console.error(`❌ Plan gate warning in ${file}: requireFeature usage not found.`);
      securityPass = false;
    }
  }
}

// 6. Ingestion URL redaction call
const ingestFiles = [
  'api/routes/track.js',
  'api/routes/conversion.js',
  'api/routes/identify.js'
];
for (const file of ingestFiles) {
  if (checkFileExists(file)) {
    const content = readFile(file);
    if (!content.includes('redactPiiFromObject') && !content.includes('redactPiiFromUrl')) {
      console.error(`❌ Ingestion privacy warning in ${file}: URL redaction call not found.`);
      securityPass = false;
    }
  }
}

// 7. Install check logic (no queryHogQL)
if (checkFileExists('api/routes/install.js')) {
  const content = readFile('api/routes/install.js');
  if (content.includes('queryHogQL')) {
    console.error('❌ Performance warning in api/routes/install.js: queryHogQL is still in use.');
    securityPass = false;
  }
}

if (securityPass) {
  console.log('✅ Security & plan scoping checks passed.');
} else {
  console.error('❌ Security & plan scoping checks failed.');
  hasFailed = true;
}
console.log();

// Final Verdict
console.log('==================================================');
if (!hasFailed) {
  console.log('PASS — static launch QA passed');
  process.exit(0);
} else {
  console.log('FAIL — issues found');
  process.exit(1);
}
console.log('==================================================');
