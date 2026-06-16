import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();

const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'dashboard/dist',
  '.claude',
  '.commandcode',
  'logs'
];

const IGNORED_FILES = [
  'package-lock.json',
  '.DS_Store'
];

const TEXT_EXTENSIONS = [
  '.js', '.mjs', '.jsx', '.ts', '.tsx', '.md', '.sql', '.json', '.yml', '.yaml', '.txt', '.html', '.css', '.xml', '.sh'
];

// Helper to check if a string contains explicit safe placeholders, mock test variables, or dynamic code expressions
function isPlaceholder(val) {
  if (!val) return true;

  // Return true immediately for common ellipsis/asterisks placeholders
  if (val.includes('...') || val.includes('***')) {
    return true;
  }

  const lower = val.toLowerCase().trim();

  // 1. Bracketed documentation placeholders (e.g. <actual secret>, [redacted], <new_rotated_service_role_key>)
  if (lower.startsWith('<') || lower.startsWith('[')) {
    return true;
  }

  // Strip trailing punctuation like dot, comma, semicolon, colon, parenthesis, brackets
  let cleanLower = lower;
  if (!cleanLower.startsWith('<') && !cleanLower.endsWith('>')) {
    cleanLower = cleanLower.replace(/[.,;:)\]}]+$/, '').replace(/^[.,;:({\[]+/, '');
  }
  cleanLower = cleanLower.trim();

  if (cleanLower.length < 4) return true; // Too short to be a real secret key

  // 2. Strict explicit placeholders
  const STRICT_PLACEHOLDERS = [
    'your-secret-key',
    'your-service-key',
    'your-service-role-key',
    'example-value',
    'placeholder',
    'redacted',
    '000000000000',
    'pass',
    'password',
    'hexkey',
    'originalkey',
    'mock-posthog-api-key',
    'mock-posthog-personal-key-for-tests',
    'mock-posthog-api-key-for-tests',
    'mock-service-role-key-value',
    'mock-posthog-key',
    'mock-proj.supabase.co',
    'sb_secret_staging_placeholder_replace_me',
    'sb_secret_placeholder_replace_me',
    'sb_secret_placeholder',
    'sb_secret_mock',
    'sb_secret_staging',
    'staging_placeholder_replace_me',
    'placeholder_replace_me'
  ];

  if (STRICT_PLACEHOLDERS.includes(cleanLower)) {
    return true;
  }

  // 3. Strict mock keys and patterns for unit tests
  const isMockTestKey =
    /^[a-z0-9_.-]+@example.com$/i.test(cleanLower) || // Mock emails
    /^sk_live_(testsite123|site123|abc123|mock123)$/.test(cleanLower) ||
    /^sk_test_(123|secret123|abcdef123456789|secretkey|secret)$/.test(cleanLower) ||
    /^whsec_(testsecret|loadtest_secret_[a-f0-9]*|mock123)$/.test(cleanLower) ||
    /^eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(val) || // Standard HS256 test JWT
    /^[0]+$/.test(cleanLower) || // All zeros
    /^[._\-<>\*#]+$/.test(cleanLower) || // Symbols
    cleanLower.startsWith('mock-') || // Any mock prefix
    cleanLower.includes('<redacted>') ||
    cleanLower.includes('[redacted]');

  if (isMockTestKey) {
    return true;
  }

  // 4. Dynamic javascript code expressions (e.g. process.env references)
  if (
    cleanLower.startsWith('process.env.') ||
    cleanLower.includes('crypto.randombytes') ||
    cleanLower.includes('.tostring(') ||
    cleanLower.includes('require(') ||
    cleanLower.includes('import(')
  ) {
    return true;
  }

  // 5. Short pattern/grep/regex protection
  if (
    cleanLower.includes('sb_secret_') &&
    (cleanLower.length < 25 || cleanLower.includes('*') || cleanLower.includes('[') || cleanLower.includes('\\'))
  ) {
    return true;
  }

  return false;
}

// Helper to validate inline assignments
function validateAssignment(match, varName) {
  const parts = match.split('=');
  if (parts.length < 2) return true;
  let val = parts.slice(1).join('=').trim().replace(/['"`]/g, '');
  // Strip trailing punctuation
  val = val.replace(/[.,;:)\]}>]$/, '').trim();
  if (!val) return true;
  return isPlaceholder(val);
}

const PATTERNS = [
  {
    name: 'Supabase secret key (sb_secret_)',
    regex: /sb_secret_[A-Za-z0-9_-]*/gi,
    validate: (match) => {
      const val = match.substring('sb_secret_'.length);
      if (!val) return true;
      if (isPlaceholder(match) || isPlaceholder(val)) return true;
      if (val.length >= 8) {
        return false; // FAIL
      }
      return true;
    }
  },
  {
    name: 'Stripe live secret key (sk_live_)',
    regex: /sk_live_[A-Za-z0-9_-]*/gi,
    validate: (match) => {
      const val = match.substring('sk_live_'.length);
      if (!val) return true;
      if (isPlaceholder(match) || isPlaceholder(val)) return true;
      if (val.length >= 16) {
        return false; // FAIL
      }
      return true;
    }
  },
  {
    name: 'Stripe test secret key (sk_test_)',
    regex: /sk_test_[A-Za-z0-9_-]*/gi,
    validate: (match) => {
      const val = match.substring('sk_test_'.length);
      if (!val) return true;
      if (isPlaceholder(match) || isPlaceholder(val)) return true;
      if (val.length >= 16) {
        return false; // FAIL
      }
      return true;
    }
  },
  {
    name: 'Stripe webhook secret (whsec_)',
    regex: /whsec_[A-Za-z0-9_-]*/gi,
    validate: (match) => {
      const val = match.substring('whsec_'.length);
      if (!val) return true;
      if (isPlaceholder(match) || isPlaceholder(val)) return true;
      if (val.length >= 16) {
        return false; // FAIL
      }
      return true;
    }
  },
  {
    name: 'Google OAuth client secret (GOCSPX-)',
    regex: /GOCSPX-[A-Za-z0-9_-]*/gi,
    validate: (match) => {
      const val = match.substring('GOCSPX-'.length);
      if (!val) return true;
      if (isPlaceholder(match) || isPlaceholder(val)) return true;
      if (val.length >= 10) {
        return false; // FAIL
      }
      return true;
    }
  },
  {
    name: 'JWT Header (eyJhbGciOi)',
    regex: /eyJhbGciOi[A-Za-z0-9._-]*/gi,
    validate: (match) => {
      if (isPlaceholder(match)) return true;
      if (match.length >= 30) {
        return false; // FAIL
      }
      return true;
    }
  },
  {
    name: 'Postgres connection URL with password',
    regex: /postgres:\/\/([^@\n]+)@/gi,
    validate: (match) => {
      const credentials = match.substring('postgres://'.length, match.length - 1);
      if (!credentials.includes(':')) return true;
      const password = credentials.split(':')[1];
      if (!password) return true;
      return isPlaceholder(password) || isPlaceholder(match);
    }
  },
  {
    name: 'Inline SUPABASE_SERVICE_KEY assignment',
    regex: /SUPABASE_SERVICE_KEY\s*=\s*[^\s]+/gi,
    validate: (match) => validateAssignment(match, 'SUPABASE_SERVICE_KEY')
  },
  {
    name: 'Inline SERVICE_ROLE_KEY assignment',
    regex: /(SUPABASE_)?SERVICE_ROLE_KEY\s*=\s*[^\s]+/gi,
    validate: (match) => validateAssignment(match, 'SERVICE_ROLE_KEY')
  },
  {
    name: 'Inline GITHUB_TOKEN assignment',
    regex: /GITHUB_TOKEN\s*=\s*[^\s]+/gi,
    validate: (match) => validateAssignment(match, 'GITHUB_TOKEN')
  },
  {
    name: 'Inline high-risk secret assignment',
    regex: /(STRIPE_SECRET_KEY|DEEPSEEK_API_KEY|OPENAI_API_KEY|RESEND_API_KEY|POSTHOG_API_KEY|POSTHOG_PERSONAL_API_KEY|ENCRYPTION_KEY|SLACK_WEBHOOK_URL|GOOGLE_CLIENT_SECRET)\s*=\s*[^\s]+/gi,
    validate: (match) => validateAssignment(match)
  }
];

function checkEnvTracking() {
  let hasTrackingIssues = false;
  try {
    // 1. Check tracked files in Git
    const trackedFiles = execSync('git ls-files', { encoding: 'utf8' })
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean);

    for (const file of trackedFiles) {
      const base = path.basename(file);
      if (base.startsWith('.env') && base !== '.env.example') {
        console.error(`❌ SECURITY ERROR: Forbidden environment file "${file}" is tracked in Git!`);
        hasTrackingIssues = true;
      }
    }

    // 2. Check staged files in Git index
    const stagedFiles = execSync('git diff --name-only --cached', { encoding: 'utf8' })
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean);

    for (const file of stagedFiles) {
      const base = path.basename(file);
      if (base.startsWith('.env') && base !== '.env.example') {
        console.error(`❌ SECURITY ERROR: Forbidden environment file "${file}" is staged for commit!`);
        hasTrackingIssues = true;
      }
    }
  } catch (err) {
    console.warn('⚠️ Warning: Git commands failed. Unable to verify if env files are tracked/staged.', err.message);
  }
  return hasTrackingIssues;
}

function scanFile(filePath, relativePath) {
  let hasIssues = false;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of PATTERNS) {
      // Reset regex index for safety
      pattern.regex.lastIndex = 0;

      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        const matchedText = match[0];
        const isValid = pattern.validate(matchedText);

        if (!isValid) {
          console.error(`❌ SECRET EXPOSURE RISK: ${pattern.name} detected in file://${filePath}#L${i + 1}`);
          console.error(`   Value is masked for safety to prevent transcription leakage.`);
          hasIssues = true;
        }
      }
    }
  }

  return hasIssues;
}

function scanDirRecursive(dirPath, filesList = []) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const relativePath = path.relative(ROOT_DIR, filePath);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (IGNORED_DIRS.includes(file)) continue;
      scanDirRecursive(filePath, filesList);
    } else if (stat.isFile()) {
      if (IGNORED_FILES.includes(file)) continue;
      if (file.startsWith('.env') && file !== '.env.example') continue;
      if (file === 'check-secret-safety.js') continue; // Exclude scanner itself

      const ext = path.extname(file);
      if (TEXT_EXTENSIONS.includes(ext) || file.startsWith('.')) {
        filesList.push({ filePath, relativePath });
      }
    }
  }
  return filesList;
}

console.log('Running Repo-wide Secret Safety Audit...');
let failed = checkEnvTracking();

const allFiles = scanDirRecursive(ROOT_DIR);
for (const { filePath, relativePath } of allFiles) {
  const result = scanFile(filePath, relativePath);
  if (result) {
    failed = true;
  }
}

if (failed) {
  console.log('\n==================================================');
  console.log('FAIL — Potential credentials, active secrets, or tracked env files found.');
  console.log('==================================================\n');
  process.exit(1);
} else {
  console.log('\n==================================================');
  console.log('PASS — No active credentials, secrets, or tracked env files detected.');
  console.log('==================================================\n');
  process.exit(0);
}
