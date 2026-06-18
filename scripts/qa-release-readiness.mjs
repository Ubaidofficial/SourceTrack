import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const CHECKLIST_PATH = path.join(ROOT_DIR, 'docs/release_checklist_gate.md');

console.log('==================================================');
console.log('      SourceTrack Release Readiness Audit');
console.log('==================================================\n');

let hasFailed = false;

// 1. Verify file exists
if (!fs.existsSync(CHECKLIST_PATH)) {
  console.error('❌ ERROR: docs/release_checklist_gate.md does not exist.');
  process.exit(1);
}

const content = fs.readFileSync(CHECKLIST_PATH, 'utf8');

// 2. Verify status says NOT READY
if (!content.includes('Readiness Status:** 🚨 **NOT READY FOR PAID-BETA RELEASE**')) {
  console.error('❌ ERROR: Canonical release checklist gate does not declare NOT READY status.');
  hasFailed = true;
} else {
  console.log('✅ Declared status: NOT READY (correctly blocked).');
}

// 3. Define open P0/P1 items that MUST NOT be marked complete ([x])
const expectedOpenBlockers = [
  'Staging Schema Bootstrap',
  'Staging Service-Role Access',
  'Stripe Test Catalog Alignment',
  'Stripe Test-Mode E2E Verification',
  'Supabase Backups & PITR Verification',
  'Production Env/Secrets Verification',
  'Billing/Limits Enforcement Audit',
  'Production Observability',
  'Data Deletion & Privacy Basics',
  'Backup/Recovery Drill',
  'End-to-End Install QA',
  'Full Docs Truth Audit',
  'Support Readiness',
  'Legal/Policy Readiness',
  'Admin/Operator Access',
  'Abuse/Rate-Limit Review',
  'Customer-Facing Status/Incident Plan',
  'Exception Monitoring',
  'Mandatory CI/Pre-Deploy Test Gate',
  'Branch Protection & PR Review',
  'HogQL Date Param Sanitization',
  'Tenant Isolation Scoping Audit',
  'Stripe Webhook Rate Limiting',
  'Billing Redirect Hardening',
  'Account Deletion PostHog Erase',
  'Onboarding Validation Hardening',
  'Transactional Email Opt-Out',
  'Attribution Accuracy + Signal Reliability Hardening'
];

const lines = content.split('\n');

for (const blocker of expectedOpenBlockers) {
  let foundLine = null;
  for (const line of lines) {
    if (line.includes(`**${blocker}**`) && line.trim().startsWith('- [')) {
      foundLine = line;
      break;
    }
  }

  if (!foundLine) {
    console.error(`❌ ERROR: Could not find checklist item for "${blocker}" in docs/release_checklist_gate.md.`);
    hasFailed = true;
    continue;
  }

  const isUnchecked = /^\s*-\s*\[\s*\]/.test(foundLine);
  const isChecked = /^\s*-\s*\[\s*x\s*\]/i.test(foundLine);

  if (isChecked) {
    console.error(`❌ ERROR: Blocker "${blocker}" is marked complete ([x]). This blocker must remain open.`);
    hasFailed = true;
  } else if (!isUnchecked) {
    console.error(`❌ ERROR: Checklist item for "${blocker}" is not formatted as an unchecked box (- [ ]).`);
    hasFailed = true;
  } else {
    // Assert it includes BLOCKED or PENDING wording
    const hasStatus = /blocked|pending/i.test(foundLine);
    if (!hasStatus) {
      console.error(`❌ ERROR: Blocker "${blocker}" must explicitly include 'BLOCKED' or 'PENDING' status wording.`);
      hasFailed = true;
    } else {
      console.log(`✅ Blocker "${blocker}" is correctly flagged as OPEN and contains BLOCKED/PENDING wording.`);
    }
  }
}


// 4. Verify Supabase backup & restore runbook exists and is clean of premature claims
const RUNBOOK_PATH = path.join(ROOT_DIR, 'docs/operations/supabase_backup_restore_runbook.md');
if (!fs.existsSync(RUNBOOK_PATH)) {
  console.error('❌ ERROR: docs/operations/supabase_backup_restore_runbook.md does not exist.');
  hasFailed = true;
} else {
  const runbookContent = fs.readFileSync(RUNBOOK_PATH, 'utf8');
  console.log('✅ Runbook docs/operations/supabase_backup_restore_runbook.md exists.');

  // Check for forbidden claims
  const forbiddenPatterns = [
    { pattern: /(?<!not\s+)(?<!not\s+\*\*)\bpitr\s+enabled\b/i, message: 'Claims that PITR is enabled' },
    { pattern: /(?<!not\s+)(?<!not\s+\*\*)\brestore\s+proven\b/i, message: 'Claims that restore is proven' },
    { pattern: /\bbackup(s)?\s+guarantee(s)?\b/i, message: 'Claims backups guarantee recovery/safety' },
    { pattern: /\bready\s+for\s+paid[-\s]+beta\b/i, message: 'Claims ready for paid beta' }
  ];

  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(runbookContent)) {
      console.error(`❌ ERROR in Runbook: ${message} (pattern matched: ${pattern}).`);
      hasFailed = true;
    }
  }
}


// 5. Verify staging schema bootstrap plan exists and is clean of premature claims / secrets
const PLAN_PATH = path.join(ROOT_DIR, 'docs/operations/staging_schema_bootstrap_plan.md');
if (!fs.existsSync(PLAN_PATH)) {
  console.error('❌ ERROR: docs/operations/staging_schema_bootstrap_plan.md does not exist.');
  hasFailed = true;
} else {
  const planContent = fs.readFileSync(PLAN_PATH, 'utf8');
  console.log('✅ Staging schema bootstrap plan docs/operations/staging_schema_bootstrap_plan.md exists.');

  // Check for forbidden claims
  const forbiddenPatterns = [
    { pattern: /(?<!not\s+)(?<!not\s+\*\*)\bbootstrap\s+executed\b/i, message: 'Claims bootstrap executed' },
    { pattern: /(?<!not\s+)(?<!not\s+\*\*)\bbootstrap\s+completed\b/i, message: 'Claims bootstrap completed' },
    { pattern: /(?<!not\s+)(?<!not\s+\*\*)\bschema\s+setup\s+completed\b/i, message: 'Claims schema setup completed' },
    { pattern: /zxjjjsipafojhzkkumvh.*(psql|-h|-U|postgres)/i, message: 'Targets production ref zxjjjsipafojhzkkumvh with db command' },
    { pattern: /anonkey|service_role|sbp_|eyJhbGciOi/i, message: 'Possible raw secret exposed' }
  ];

  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(planContent)) {
      console.error(`❌ ERROR in Bootstrap Plan: ${message} (pattern matched: ${pattern}).`);
      hasFailed = true;
    }
  }
}


// 6. Verify recovered base schema is clean of data-copy / secrets if it exists
const RECOVERED_SCHEMA_PATH = path.join(ROOT_DIR, 'supabase/schema_base_recovered.sql');
if (fs.existsSync(RECOVERED_SCHEMA_PATH)) {
  const schemaContent = fs.readFileSync(RECOVERED_SCHEMA_PATH, 'utf8');
  console.log('✅ Recovered base schema supabase/schema_base_recovered.sql exists.');

  const forbiddenSchemaPatterns = [
    { pattern: /\bCOPY \b/i, message: 'Contains COPY command (data payload)' },
    { pattern: /\bINSERT INTO\b/i, message: 'Contains INSERT INTO command (data payload)' },
    { pattern: /\bPASSWORD\b/i, message: 'Contains PASSWORD keyword' },
    { pattern: /\bSECRET\b/i, message: 'Contains SECRET keyword' },
    { pattern: /\bTOKEN\b/i, message: 'Contains TOKEN keyword' },
    { pattern: /\bSERVICE_ROLE\b/i, message: 'Contains SERVICE_ROLE keyword' },
    { pattern: /\banonkey\b/i, message: 'Contains anonkey keyword' },
    { pattern: /sbp_/i, message: 'Contains sbp_ keyword' },
    { pattern: /eyJhbGciOi/i, message: 'Contains JWT header' },
    { pattern: /postgres:\/\//i, message: 'Contains postgres connection URL' }
  ];

  for (const { pattern, message } of forbiddenSchemaPatterns) {
    if (pattern.test(schemaContent)) {
      console.error(`❌ ERROR in Recovered Base Schema: ${message} (pattern matched: ${pattern}).`);
      hasFailed = true;
    }
  }
}


// 7. Verify production env verification doc exists and is clean of obvious secret patterns
const PROD_ENV_PATH = path.join(ROOT_DIR, 'docs/operations/production_env_verification.md');
if (!fs.existsSync(PROD_ENV_PATH)) {
  console.error('❌ ERROR: docs/operations/production_env_verification.md does not exist.');
  hasFailed = true;
} else {
  const prodEnvContent = fs.readFileSync(PROD_ENV_PATH, 'utf8');
  console.log('✅ Production env verification plan docs/operations/production_env_verification.md exists.');

  const forbiddenPatterns = [
    { pattern: /sk_live_/i, message: 'Contains sk_live_ secret key pattern' },
    { pattern: /sk_test_/i, message: 'Contains sk_test_ secret key pattern' },
    { pattern: /whsec_/i, message: 'Contains whsec_ webhook secret pattern' },
    { pattern: /service_role/i, message: 'Contains service_role keyword (avoid printing service role key)' },
    { pattern: /sbp_/i, message: 'Contains sbp_ key pattern' },
    { pattern: /eyJhbGciOi/i, message: 'Contains JWT header pattern' },
    { pattern: /postgres:\/\//i, message: 'Contains postgres connection URL' },
    { pattern: /(?<!not\s+)(?<!not\s+\*\*)\bproduction\s+env\s+verified\b/i, message: 'Claims production env verified without operator action' }
  ];

  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(prodEnvContent)) {
      console.error(`❌ ERROR in Production Env Verification: ${message} (pattern matched: ${pattern}).`);
      hasFailed = true;
    }
  }
}




console.log('\n==================================================');
if (!hasFailed) {
  console.log('PASS — Release readiness checklist verified (all blockers open).');
  process.exit(0);
} else {
  console.log('FAIL — Issues or incorrect checklist completions found.');
  process.exit(1);
}
