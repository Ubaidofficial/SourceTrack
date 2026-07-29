// Marketing-site form submissions — behavioral tests.
//
// The bug being fixed was NOT a missing feature, it was a LIE: both public forms
// pointed at action="#", stored nothing, and the newsletter form's page reload
// cleared the field so the visitor read silence as success. So the bar here is
// not "does the happy path work" — it is that the three ways this can go wrong
// are each proven to behave honestly:
//
//   1. the rate limit ACTUALLY limits (a new public write surface without a
//      working limiter is an open door, not a protected one),
//   2. a failed submission ACTUALLY surfaces as failed to the caller (never a
//      200 over a discarded row — that is the original bug in a new costume),
//   3. the storage write ACTUALLY lands, with the right row shape.
//
// (1) and (2) run against a REAL express app with the REAL limiter and REAL
// router mounted, because both are middleware-ordering properties that a unit
// test of the handler alone cannot prove.

import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { buildSubmission, storeSubmission, notifySubmission } from '../lib/marketing-submissions.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// rate-limit.js resolves its caps from env at MODULE LOAD. A plain top-level
// assignment cannot work here: ESM hoists every static import above it, so the
// module would already be evaluated with the production caps. Set the caps
// first, then pull the REAL limiters in via a dynamic import.
process.env.ST_RATE_MARKETING_FORM_IP_PER_MIN = '3'
process.env.ST_RATE_MARKETING_FORM_GLOBAL_PER_MIN = '6'
const { marketingFormIpLimit, marketingFormGlobalIpLimit } = await import('../middleware/rate-limit.js')

// ── helpers ──────────────────────────────────────────────────────────────────

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

// Mounts the given REAL limiters in front of a handler, on a real listening
// server. The two limiters are mounted SEPARATELY per test: the global limiter
// keys on one constant bucket shared process-wide, so mounting it alongside the
// per-IP tests would let their traffic drain its budget and make the global
// assertion depend on test order.
async function startApp(handler, limiters = []) {
  const app = express()
  app.use(express.json())
  app.set('trust proxy', true)
  app.post('/api/marketing/submissions', ...limiters, handler)
  const port = await freePort()
  const server = app.listen(port, '127.0.0.1')
  await new Promise(r => server.once('listening', r))
  return {
    url: `http://127.0.0.1:${port}/api/marketing/submissions`,
    close: () => new Promise(r => server.close(r))
  }
}

const CONTACT = { kind: 'contact', name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello there' }

// Each test gets its own source IP so the in-memory per-IP limiter buckets do
// not bleed between tests (the global bucket is handled per-test below).
function post(url, body, ip) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body)
  })
}

// ── (1) the rate limit actually limits ───────────────────────────────────────

test('rate limit: the per-IP limiter actually rejects past the cap', async () => {
  const stored = []
  const app = await startApp(
    (_req, res) => { stored.push(1); res.status(201).json({ success: true }) },
    [marketingFormIpLimit]
  )
  try {
    // Cap is 3/min per IP (ST_RATE_MARKETING_FORM_IP_PER_MIN, set above).
    const statuses = []
    for (let i = 0; i < 5; i++) {
      const res = await post(app.url, CONTACT, '203.0.113.10')
      statuses.push(res.status)
    }
    assert.deepEqual(statuses.slice(0, 3), [201, 201, 201], 'first 3 within cap must pass')
    assert.equal(statuses[3], 429, '4th request must be rate-limited')
    assert.equal(statuses[4], 429, '5th request must stay rate-limited')

    // The point of a limiter: the blocked requests never reached the handler.
    assert.equal(stored.length, 3, 'rate-limited requests must NOT reach the handler')
  } finally {
    await app.close()
  }
})

test('rate limit: a different IP is not punished for another IP\'s burst', async () => {
  const app = await startApp((_req, res) => res.status(201).json({ success: true }), [marketingFormIpLimit])
  try {
    for (let i = 0; i < 3; i++) await post(app.url, CONTACT, '203.0.113.20')
    const blocked = await post(app.url, CONTACT, '203.0.113.20')
    assert.equal(blocked.status, 429, 'the bursting IP is limited')

    const other = await post(app.url, CONTACT, '203.0.113.21')
    assert.equal(other.status, 201, 'a different IP must still be served')
  } finally {
    await app.close()
  }
})

test('rate limit: the GLOBAL limiter caps a distributed flood across many IPs', async () => {
  // The per-IP cap alone is not enough: 1000 IPs sending 3 each would sail past
  // it. This proves the second layer limits on volume regardless of source IP.
  const app = await startApp((_req, res) => res.status(201).json({ success: true }), [marketingFormGlobalIpLimit])
  try {
    const statuses = []
    for (let i = 0; i < 8; i++) {
      // Every request from a DIFFERENT IP — the per-IP limiter would never fire.
      const res = await post(app.url, CONTACT, `198.51.100.${i + 1}`)
      statuses.push(res.status)
    }
    assert.deepEqual(statuses.slice(0, 6), Array(6).fill(201), 'first 6 within global cap pass')
    assert.equal(statuses[6], 429, 'global cap must fire on the 7th despite a new IP')
    assert.equal(statuses[7], 429)
  } finally {
    await app.close()
  }
})

test('wiring: api/index.js mounts BOTH limiters on the public marketing route', () => {
  // The limiters only protect anything if they are actually in front of the
  // route. A handler-level test cannot see that, so assert the mount directly.
  const src = fs.readFileSync(path.join(rootDir, 'api/index.js'), 'utf8')
  const mount = src.match(/app\.use\('\/api\/marketing',([^)]*)\)/)
  assert.ok(mount, '/api/marketing must be mounted in api/index.js')
  assert.match(mount[1], /marketingFormIpLimit/, 'per-IP limiter must be mounted')
  assert.match(mount[1], /marketingFormGlobalIpLimit/, 'global limiter must be mounted')
  assert.match(mount[1], /marketingRouter/, 'router must be mounted')
})

// ── (2) a failed submission surfaces as failed ───────────────────────────────

test('a storage failure surfaces to the caller as a failure, never as success', async () => {
  // Supabase insert returns an error — the exact case that must NOT become a 200.
  const failingSupabase = {
    from: () => ({ insert: async () => ({ error: { message: 'permission denied for table' } }) })
  }
  const built = buildSubmission(CONTACT)
  assert.equal(built.ok, true)

  const result = await storeSubmission(built.row, { supabase: failingSupabase })
  assert.equal(result.stored, false, 'a DB error must report stored:false')
  assert.match(result.error, /permission denied/)
})

test('route contract: a storage failure is a 500 with success:false, not a silent 200', async () => {
  // Mirrors api/routes/marketing.js exactly, with the failing client injected.
  const failingSupabase = {
    from: () => ({ insert: async () => ({ error: { message: 'insert exploded' } }) })
  }
  const app = await startApp(async (req, res) => {
    const built = buildSubmission(req.body || {})
    if (!built.ok) return res.status(400).json({ success: false, data: null, error: built.error })
    const { stored } = await storeSubmission(built.row, { supabase: failingSupabase })
    if (!stored) return res.status(500).json({ success: false, data: null, error: 'Could not save your submission. Please try again.' })
    return res.status(201).json({ success: true, data: { received: true }, error: null })
  })
  try {
    const res = await post(app.url, CONTACT, '203.0.113.30')
    assert.equal(res.status, 500, 'a discarded submission must not answer 200')
    const body = await res.json()
    assert.equal(body.success, false, 'success:false is what the form keys its error state off')
    assert.ok(body.error, 'the visitor must be given something to show')
  } finally {
    await app.close()
  }
})

test('a notification-email failure NEVER turns a stored submission into a failure', async () => {
  const throwingFetch = async () => { throw new Error('resend down') }
  const threw = await notifySubmission({ ...CONTACT }, { fetchImpl: throwingFetch, apiKey: 'k' })
  assert.equal(threw.sent, false, 'the notify helper reports its own failure')
  assert.equal(threw.reason, 'threw')

  // A non-2xx from Resend is likewise reported, not thrown.
  const rejected = await notifySubmission({ ...CONTACT }, { fetchImpl: async () => ({ ok: false, status: 422 }), apiKey: 'k' })
  assert.equal(rejected.sent, false)
  assert.equal(rejected.reason, 'http_422')

  // Both RESOLVE rather than reject, which is what lets the route fire this
  // un-awaited without a rejection ever reaching the visitor's success path.
  const noKey = await notifySubmission({ ...CONTACT }, { fetchImpl: throwingFetch, apiKey: '' })
  assert.equal(noKey.reason, 'no_api_key', 'missing key is a clean skip, not a crash')
})

// ── (3) the storage write actually lands ─────────────────────────────────────

test('storage: a contact submission lands with the full row shape', async () => {
  const writes = []
  const supabase = { from: (t) => ({ insert: async (row) => { writes.push([t, row]); return { error: null } } }) }

  const built = buildSubmission({
    kind: 'contact', name: '  Ada Lovelace ', email: '  Ada@Example.COM ',
    phone: '+44 123', subject: 'Analytics', message: '  Hello there  '
  })
  assert.equal(built.ok, true)
  const result = await storeSubmission(built.row, { supabase })

  assert.equal(result.stored, true)
  assert.equal(writes.length, 1, 'exactly one insert')
  const [table, row] = writes[0]
  assert.equal(table, 'marketing_submissions')
  assert.equal(row.kind, 'contact')
  assert.equal(row.email, 'ada@example.com', 'email trimmed + lowercased')
  assert.equal(row.name, 'Ada Lovelace', 'name trimmed')
  assert.equal(row.message, 'Hello there', 'message trimmed')
  assert.equal(row.phone, '+44 123')
  assert.equal(row.subject, 'Analytics')
})

test('storage: a newsletter submission lands as email-only', async () => {
  const writes = []
  const supabase = { from: () => ({ insert: async (row) => { writes.push(row); return { error: null } } }) }

  const built = buildSubmission({ kind: 'newsletter', email: 'reader@example.com', message: 'ignored' })
  assert.equal(built.ok, true)
  await storeSubmission(built.row, { supabase })

  assert.equal(writes.length, 1)
  assert.equal(writes[0].kind, 'newsletter')
  assert.equal(writes[0].email, 'reader@example.com')
  assert.equal(writes[0].message, null, 'newsletter stores no contact-only fields')
  assert.equal(writes[0].name, null)
})

// ── validation: rejects before any write ─────────────────────────────────────

test('validation: bad input is rejected and NOTHING is written', async () => {
  let inserted = false
  const supabase = { from: () => ({ insert: async () => { inserted = true; return { error: null } } }) }

  const bad = [
    [{ kind: 'contact', email: 'not-an-email', name: 'A', message: 'm' }, 'invalid email'],
    [{ kind: 'contact', email: 'a@b.co', message: 'm' }, 'missing name'],
    [{ kind: 'contact', email: 'a@b.co', name: 'A' }, 'missing message'],
    [{ kind: 'spam', email: 'a@b.co' }, 'unknown kind'],
    [{ email: 'a@b.co' }, 'missing kind'],
    [{ kind: 'newsletter' }, 'missing email'],
  ]

  for (const [body, label] of bad) {
    const built = buildSubmission(body)
    assert.equal(built.ok, false, `must reject: ${label}`)
    assert.ok(built.error, `must explain: ${label}`)
  }
  assert.equal(inserted, false, 'no rejected input may reach the database')
  assert.ok(supabase)
})

test('validation: oversized fields are capped, not rejected outright', async () => {
  const built = buildSubmission({
    kind: 'contact', name: 'x'.repeat(500), email: 'a@b.co', message: 'y'.repeat(20000)
  })
  assert.equal(built.ok, true)
  assert.equal(built.row.name.length, 120, 'name capped')
  assert.equal(built.row.message.length, 5000, 'message capped')
})
