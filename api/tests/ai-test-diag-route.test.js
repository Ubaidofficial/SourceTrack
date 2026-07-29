// /api/diag/ai-test/:label — gate + reflected-XSS guard.
//
// This route echoes the caller's own Referer and User-Agent back into an HTML page so a
// real click from an AI app (ChatGPT iOS, Perplexity, …) can be inspected. Both headers
// are fully attacker-controlled, so raw interpolation would be reflected XSS on
// api.srctk.com. It is also unauthenticated by design (a link clicked inside a third-party
// app cannot attach a header, and a secret in the query string would leak into access logs
// and the onward Referer) — which makes ST_AI_DIAGNOSTIC_ENABLED the ONLY thing standing
// between the internet and this handler.
//
// Both properties are therefore load-bearing and both are asserted behaviorally against the
// REAL entrypoint (spawned, not imported), the same way boot-without-posthog-env.test.js does:
//   1. flag unset  -> route is not registered at all (404)
//   2. flag 'true' -> route serves, and script payloads in the label, Referer and User-Agent
//                     come back HTML-escaped, never as live markup.

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENTRYPOINT = join(__dirname, '..', 'index.js')

// Bind :0, read the assigned port, release it. Avoids a hardcoded port colliding in CI.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

// Spawn the real API with a scrubbed env; resolve once it reports it is listening.
async function startApi(extraEnv) {
  const port = await freePort()
  const childEnv = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    SUPABASE_URL: 'https://mock-proj.supabase.co',
    SUPABASE_SERVICE_KEY: 'mock-service-role-key-value'
  }
  // Never inherit the flag from the developer's shell — each test states its own gate.
  delete childEnv.ST_AI_DIAGNOSTIC_ENABLED
  Object.assign(childEnv, extraEnv)

  const child = spawn(process.execPath, [ENTRYPOINT], { env: childEnv })
  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d.toString() })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`API did not start in 20s. stderr:\n${stderr}`)),
      20_000
    )
    child.stdout.on('data', (d) => {
      if (d.toString().includes(`running on port ${port}`)) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`API exited early with code ${code}. stderr:\n${stderr}`))
    })
  })

  return { child, base: `http://127.0.0.1:${port}` }
}

test('🔴 /api/diag/ai-test is NOT registered when ST_AI_DIAGNOSTIC_ENABLED is unset', async () => {
  const { child, base } = await startApi({})
  try {
    const res = await fetch(`${base}/api/diag/ai-test/chatgpt-ios`)
    assert.equal(res.status, 404, 'unflagged env must not expose the diagnostic route')
    const body = await res.text()
    assert.ok(
      !body.includes('AI Click Harness'),
      'the harness page must not render when the env gate is unset'
    )
  } finally {
    child.kill('SIGKILL')
  }
})

test('🔴 attacker-controlled label, Referer and User-Agent are HTML-escaped, not reflected', async () => {
  const { child, base } = await startApi({ ST_AI_DIAGNOSTIC_ENABLED: 'true' })
  try {
    const label = '<img src=x onerror=alert(1)>'
    const referrer = 'https://evil.test/"><script>alert("ref")</script>'
    const userAgent = 'Mozilla/5.0 <script>alert("ua")</script>'

    const res = await fetch(`${base}/api/diag/ai-test/${encodeURIComponent(label)}`, {
      headers: { referer: referrer, 'user-agent': userAgent }
    })
    assert.equal(res.status, 200)
    const body = await res.text()

    // Sanity: the flagged route really did serve the harness.
    assert.ok(body.includes('AI Click Harness'), 'flagged env should serve the harness page')

    // The harness template contains no <script> and no <img> of its own, so ANY occurrence
    // of either would have to have come from the three attacker-controlled inputs above.
    // Asserting on the tag opening (not on substrings like "onerror=alert", which are inert
    // once "<" is escaped) is what actually separates live markup from displayed text.
    assert.ok(!body.includes('<script'), 'a script tag reached the response — reflected XSS')
    assert.ok(!body.includes('<img'), 'an img tag reached the response — reflected XSS')

    // The values ARE still shown — escaped — so the diagnostic remains useful.
    assert.ok(body.includes('&lt;script&gt;alert'), 'escaped Referer/User-Agent should be visible')
    assert.ok(body.includes('&lt;img src=x'), 'escaped label should be visible')

    // The JSON view carries the raw values safely (Content-Type is not HTML).
    const jsonRes = await fetch(
      `${base}/api/diag/ai-test/${encodeURIComponent(label)}?format=json`,
      { headers: { referer: referrer, 'user-agent': userAgent } }
    )
    assert.equal(jsonRes.status, 200)
    assert.match(jsonRes.headers.get('content-type') || '', /application\/json/)
    const json = await jsonRes.json()
    assert.equal(json.data.label, label)
    assert.equal(json.data.referrer, referrer)
  } finally {
    child.kill('SIGKILL')
  }
})
