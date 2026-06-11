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
  'Transactional Email Opt-Out'
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

console.log('\n==================================================');
if (!hasFailed) {
  console.log('PASS — Release readiness checklist verified (all blockers open).');
  process.exit(0);
} else {
  console.log('FAIL — Issues or incorrect checklist completions found.');
  process.exit(1);
}
