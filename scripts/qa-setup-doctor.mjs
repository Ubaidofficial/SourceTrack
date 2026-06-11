import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

console.log('=== Running Setup Doctor Safety QA Audit ===')

let failures = 0

// Helper to assert condition
function assertRule(condition, message) {
  if (!condition) {
    console.error(`\x1b[31m[FAIL]\x1b[0m ${message}`)
    failures++
  } else {
    console.log(`\x1b[32m[PASS]\x1b[0m ${message}`)
  }
}

// 1. Verify no database migration files are introduced or modified in git status
try {
  const gitStatus = execSync('git status --short', { encoding: 'utf8', cwd: rootDir })
  const hasMigrationsAddedOrModified = /^\?\?\s+supabase\/migrations\/|^A\s+supabase\/migrations\/|^M\s+supabase\/migrations\//m.test(gitStatus)
  assertRule(!hasMigrationsAddedOrModified, 'No Supabase migration files added or modified')
} catch (err) {
  assertRule(false, 'Failed to query git status for migrations: ' + err.message)
}

// Ensure no unstaged/staged new migration files are in the git status
// (This will be verified during git status/diff validation)

// 2. Check setup-doctor.js and install.js for illegal PostHog writes (no ph.capture)
const doctorLibFile = path.join(rootDir, 'api/lib/setup-doctor.js')
if (fs.existsSync(doctorLibFile)) {
  const content = fs.readFileSync(doctorLibFile, 'utf8')
  assertRule(!content.includes('ph.capture'), 'api/lib/setup-doctor.js does not contain ph.capture (no fake events)')
}

const installRouteFile = path.join(rootDir, 'api/routes/install.js')
if (fs.existsSync(installRouteFile)) {
  const content = fs.readFileSync(installRouteFile, 'utf8')
  assertRule(!content.includes('ph.capture'), 'api/routes/install.js does not contain ph.capture (no fake events)')
  assertRule(!content.includes('/api/track'), 'api/routes/install.js does not query or mock /api/track')
}

// 3. Scan dashboard directory for invalid api/track/ping queries or mock event pushes
const dashboardSrcDir = path.join(rootDir, 'dashboard/src')
if (fs.existsSync(dashboardSrcDir)) {
  const filesToScan = []
  function recurse(dir) {
    const list = fs.readdirSync(dir)
    list.forEach(file => {
      const fullPath = path.join(dir, file)
      if (fs.statSync(fullPath).isDirectory()) {
        recurse(fullPath)
      } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
        filesToScan.push(fullPath)
      }
    })
  }
  recurse(dashboardSrcDir)

  let containsApiTrack = false
  filesToScan.forEach(f => {
    const content = fs.readFileSync(f, 'utf8')
    // Look for actual fetch or fetchApi calls to /api/track or api/track, not documentation text
    if (
      content.includes("fetch('/api/track") ||
      content.includes("fetch(\"/api/track") ||
      content.includes("fetchApi('/api/track") ||
      content.includes("fetchApi(\"/api/track") ||
      content.includes("axios.post('/api/track") ||
      content.includes("axios.post(\"/api/track")
    ) {
      if (!f.includes('tracker.js') && !f.includes('tracker.cookieless.js')) {
        containsApiTrack = true
      }
    }
  })
  assertRule(!containsApiTrack, 'No dashboard UI code performs direct HTTP requests to /api/track')
}

// 4. Verify /api/install/ping has no Supabase or PostHog references
if (fs.existsSync(installRouteFile)) {
  const content = fs.readFileSync(installRouteFile, 'utf8')
  const pingBlockMatch = content.match(/router\.get\('\/ping'[\s\S]+?\}\)/)
  if (pingBlockMatch) {
    const pingBlock = pingBlockMatch[0]
    const hasSupabase = pingBlock.includes('supabase') || pingBlock.includes('getSupabase')
    const hasPostHog = pingBlock.includes('ph.') || pingBlock.includes('posthog')
    const hasFetch = pingBlock.includes('fetch')
    assertRule(!hasSupabase && !hasPostHog && !hasFetch, '/api/install/ping contains no Supabase, PostHog, or external network requests')
  } else {
    assertRule(false, '/api/install/ping route definition not found')
  }
}

// 5. Verify SetupDoctorCard existence and usage across key files
const setupDoctorCardFile = path.join(rootDir, 'dashboard/src/components/SetupDoctorCard.jsx')
assertRule(fs.existsSync(setupDoctorCardFile), 'SetupDoctorCard.jsx exists')

const dashboardFile = path.join(rootDir, 'dashboard/src/pages/Dashboard.jsx')
if (fs.existsSync(dashboardFile)) {
  const content = fs.readFileSync(dashboardFile, 'utf8')
  assertRule(content.includes('SetupDoctorCard'), 'Dashboard.jsx imports/uses SetupDoctorCard')
}

const onboardingFile = path.join(rootDir, 'dashboard/src/pages/Onboarding.jsx')
if (fs.existsSync(onboardingFile)) {
  const content = fs.readFileSync(onboardingFile, 'utf8')
  assertRule(content.includes('SetupDoctorCard'), 'Onboarding.jsx imports/uses SetupDoctorCard')
}

const snippetFile = path.join(rootDir, 'dashboard/src/pages/Snippet.jsx')
if (fs.existsSync(snippetFile)) {
  const content = fs.readFileSync(snippetFile, 'utf8')
  assertRule(content.includes('SetupDoctorCard'), 'Snippet.jsx imports/uses SetupDoctorCard')
  assertRule(!content.includes('onClick={handleTest}'), 'Snippet.jsx does not have a competing Verify installation button')
}

if (fs.existsSync(setupDoctorCardFile)) {
  const content = fs.readFileSync(setupDoctorCardFile, 'utf8')
  const hasRawProperties = content.includes('raw_properties') || content.includes('rawProperties')
  const hasJsonStringifyEvent = /JSON\.stringify\(\s*selectedEvent|JSON\.stringify\(\s*.*properties/i.test(content)
  assertRule(!hasRawProperties && !hasJsonStringifyEvent, 'SetupDoctorCard does not render raw event properties JSON')

  // Additional QA assertions for Session 139E
  assertRule(!content.includes("fetch('/api/track") && !content.includes("fetchApi('/api/track"), 'SetupDoctorCard.jsx does not call /api/track')
  assertRule(content.includes("fetchApi('/install/ping')"), 'SetupDoctorCard.jsx uses /install/ping only for browser reachability')
  assertRule(content.includes("params.set('verification_token', verificationToken)"), 'SetupDoctorCard.jsx uses verification_token only with /install/doctor')
  assertRule(!content.includes('tokenInput'), 'no manual raw st_verify Token input returns')
  assertRule(!content.includes("status === 'healthy' || diagnostics.status === 'test_env'"), 'no test_env triggers onVerificationSuccess')
}

if (failures > 0) {
  console.error(`\x1b[31mQA FAILED with ${failures} error(s)\x1b[0m`)
  process.exit(1)
} else {
  console.log('\x1b[32m=== QA Audit Passed Successfully ===\x1b[0m')
  process.exit(0)
}
