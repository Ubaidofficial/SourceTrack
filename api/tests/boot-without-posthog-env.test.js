// D2/D5 BOOT GUARD — the API must boot with POSTHOG_HOST and POSTHOG_API_KEY UNSET.
//
// D3 deleted api/lib/posthog.js (the `ph` client), so no request path reads these two vars.
// They were removed from REQUIRED_ENV (api/index.js) so that D5 — stripping POSTHOG_* from
// Railway — cannot hard-exit the six services on startup. This test spawns the REAL entrypoint
// with both vars scrubbed from the child env and asserts it reaches the "listening" line instead
// of the "Missing required env vars" exit. Behavioral, not a source grep: if either var creeps
// back into REQUIRED_ENV, the child exits 1 here, in CI, loudly.
//
// Hermetic: NODE_ENV=test skips the production-only guards (ST_MANAGED_PROXY_TARGET / ENCRYPTION_KEY),
// PORT=0 binds an ephemeral port (no collision), Supabase creds are mock values (no network at boot).

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENTRYPOINT = join(__dirname, '..', 'index.js')

test('🔴 API boots with POSTHOG_HOST and POSTHOG_API_KEY unset (D5 decommission-safe)', async () => {
  // Start from a clean env, set only what is genuinely required, and DELETE the two PostHog vars.
  const childEnv = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: '0',
    SUPABASE_URL: 'https://mock-proj.supabase.co',
    SUPABASE_SERVICE_KEY: 'mock-service-role-key-value'
  }
  delete childEnv.POSTHOG_HOST
  delete childEnv.POSTHOG_API_KEY

  const child = spawn(process.execPath, [ENTRYPOINT], { env: childEnv })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => { stdout += d.toString() })
  child.stderr.on('data', (d) => { stderr += d.toString() })

  try {
    const outcome = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ kind: 'timeout' }), 8000)
      // Booted: the listen callback writes "TrackIQ running on port N".
      child.stdout.on('data', () => {
        if (/TrackIQ running on port/.test(stdout)) { clearTimeout(timer); resolve({ kind: 'listening' }) }
      })
      // Early exit before listening = the REQUIRED_ENV guard (or another boot exit) fired.
      child.on('exit', (code) => { clearTimeout(timer); resolve({ kind: 'exit', code }) })
    })

    assert.notEqual(outcome.kind, 'exit',
      `entrypoint exited before listening (code ${outcome?.code}). stderr:\n${stderr}`)
    assert.equal(outcome.kind, 'listening',
      `entrypoint did not reach the listening line within the timeout. stdout:\n${stdout}\nstderr:\n${stderr}`)
    assert.doesNotMatch(stderr, /Missing required env vars/,
      `boot must not report missing env when only POSTHOG_* are absent. stderr:\n${stderr}`)
  } finally {
    child.kill('SIGKILL')
  }
})
