import assert from 'assert'
import { enforceEnvironmentSafety } from '../api/lib/environment-safety.js'

console.log('Running offline environment safety guard tests...')

// Save original environment
const originalEnv = { ...process.env }
const originalExit = process.exit
const originalError = console.error
const originalWarn = console.warn

let exitCalled = false
let exitCode = null
let errorLogged = []
let warnLogged = []

// Set up mocks
process.exit = (code) => {
  exitCalled = true
  exitCode = code
}
console.error = (...args) => {
  errorLogged.push(args.join(' '))
}
console.warn = (...args) => {
  warnLogged.push(args.join(' '))
}

function resetMocks() {
  exitCalled = false
  exitCode = null
  errorLogged = []
  warnLogged = []
  process.env = { ...originalEnv }
}

try {
  // Test Case 1: NODE_ENV=development + production Supabase ref → fail/refuse.
  resetMocks()
  process.env.NODE_ENV = 'development'
  process.env.SUPABASE_URL = 'https://zxjjjsipafojhzkkumvh.supabase.co'
  enforceEnvironmentSafety()
  assert.strictEqual(exitCalled, true, 'Case 1: Should call process.exit')
  assert.strictEqual(exitCode, 1, 'Case 1: Exit code should be 1')
  assert.ok(errorLogged.some(msg => msg.includes('Refusing to start non-production API')), 'Case 1: Should print error message')

  // Test Case 2: NODE_ENV=test + production Supabase ref → fail/refuse.
  resetMocks()
  process.env.NODE_ENV = 'test'
  process.env.SUPABASE_URL = 'https://zxjjjsipafojhzkkumvh.supabase.co'
  enforceEnvironmentSafety()
  assert.strictEqual(exitCalled, true, 'Case 2: Should call process.exit')
  assert.strictEqual(exitCode, 1, 'Case 2: Exit code should be 1')
  assert.ok(errorLogged.some(msg => msg.includes('Refusing to start non-production API')), 'Case 2: Should print error message')

  // Test Case 3: NODE_ENV=production + production Supabase ref → allow.
  resetMocks()
  process.env.NODE_ENV = 'production'
  process.env.SUPABASE_URL = 'https://zxjjjsipafojhzkkumvh.supabase.co'
  enforceEnvironmentSafety()
  assert.strictEqual(exitCalled, false, 'Case 3: Should NOT call process.exit')
  assert.strictEqual(errorLogged.length, 0, 'Case 3: Should NOT log errors')

  // Test Case 4: NODE_ENV=development + staging Supabase ref → allow.
  resetMocks()
  process.env.NODE_ENV = 'development'
  process.env.SUPABASE_URL = 'https://nrsvpwzekfrdrzkoecfk.supabase.co'
  enforceEnvironmentSafety()
  assert.strictEqual(exitCalled, false, 'Case 4: Should NOT call process.exit')
  assert.strictEqual(errorLogged.length, 0, 'Case 4: Should NOT log errors')

  // Test Case 5: NODE_ENV=development + missing SUPABASE_URL behavior remains clear (guard should not trigger)
  resetMocks()
  process.env.NODE_ENV = 'development'
  delete process.env.SUPABASE_URL
  enforceEnvironmentSafety()
  assert.strictEqual(exitCalled, false, 'Case 5: Missing URL should not trigger guard exit')
  assert.strictEqual(errorLogged.length, 0, 'Case 5: Missing URL should not log guard errors')

  // Test Case 6: NODE_ENV=development + missing SUPABASE_SERVICE_KEY (guard should not trigger, handled by client/startup check)
  resetMocks()
  process.env.NODE_ENV = 'development'
  process.env.SUPABASE_URL = 'https://nrsvpwzekfrdrzkoecfk.supabase.co'
  delete process.env.SUPABASE_SERVICE_KEY
  enforceEnvironmentSafety()
  assert.strictEqual(exitCalled, false, 'Case 6: Missing key should not trigger guard exit')
  assert.strictEqual(errorLogged.length, 0, 'Case 6: Missing key should not log guard errors')

  // Test Case 7: Emergency override in non-production mode with prod DB -> allow with warning
  resetMocks()
  process.env.NODE_ENV = 'development'
  process.env.SUPABASE_URL = 'https://zxjjjsipafojhzkkumvh.supabase.co'
  process.env.ALLOW_PRODUCTION_SUPABASE_IN_NON_PROD = 'true'
  enforceEnvironmentSafety()
  assert.strictEqual(exitCalled, false, 'Case 7: Should NOT call process.exit with override')
  assert.ok(warnLogged.some(msg => msg.includes('ALLOW_PRODUCTION_SUPABASE_IN_NON_PROD is enabled')), 'Case 7: Should warn user')

  console.log('✅ All offline environment safety tests passed successfully.')
} finally {
  // Restore original environment and functions
  process.exit = originalExit
  console.error = originalError
  console.warn = originalWarn
  process.env = originalEnv
}
