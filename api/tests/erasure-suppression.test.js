// Erasure suppression, PR 1 of 5 — the WRITE side. Nothing enforces suppression yet (PR 2
// ingest + cache, PR 3 batcher flush boundary); these guard the record being created correctly,
// because a wrong record silently protects nobody once enforcement does switch on.
//
// Three properties carry real weight here:
//
//  1. ORDERING. Erasure is keyed on anonymous_id/distinct_id and NEVER on email. The email lives
//     only in volunteered_identity, which the erasure DELETES. If the hash is captured after
//     that delete it is gone for good — and it is the ONLY key that catches an erased person
//     returning on a new device (new anonymous_id, same email). A refactor that moves the read
//     one block later would leave the mechanism silently half-blind, with every test still green
//     unless one asserts the order. That is the test below.
//
//  2. NO-MATCH MUST NOT SUPPRESS. This is the whole reason for a new table instead of reusing
//     erasure_log, which records dry-runs and failures too. If an erasure that deleted nothing
//     wrote a suppression record, we would suppress people who were never erased.
//
//  3. PARTIAL MUST SUPPRESS. When Supabase rows were deleted but Tinybird did not erase, the
//     volunteered_identity row IS gone — so the PII can be re-entered in the gap before the
//     retry. Skipping suppression there leaves exactly the hole this exists to close.

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'mock-service-role-key-value'

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  hashSuppressedEmail,
  collectSuppressionEmailHashes,
  recordErasureSuppression
} from '../lib/erasure-suppression.js'
import { normalizeVolunteeredEmail } from '../lib/volunteered-identity.js'

const { gdprRouter, __setGdprEraseDeps, __resetGdprEraseDeps } = await import('../routes/gdpr.js')
const { getSupabase } = await import('../lib/supabase.js')

// ── hashSuppressedEmail ──────────────────────────────────────────────────────

test('hashSuppressedEmail: hashes the SAME normalisation identify() writes', () => {
  // If these ever diverge the check silently never matches — a suppression record that
  // protects nobody, with no error anywhere. Pin them together.
  const raw = '  Ada.Lovelace@Example.COM '
  const viaIdentify = normalizeVolunteeredEmail(raw)
  assert.equal(viaIdentify, 'ada.lovelace@example.com')
  assert.equal(
    hashSuppressedEmail(raw),
    createHash('sha256').update(viaIdentify).digest('hex')
  )
  // Case/whitespace variants must collide, or a returning subject slips through.
  assert.equal(hashSuppressedEmail('ADA.LOVELACE@EXAMPLE.COM'), hashSuppressedEmail('ada.lovelace@example.com'))
})

test('hashSuppressedEmail: never hashes an unusable value into an unmatchable key', () => {
  for (const bad of [null, undefined, '', '   ', 'not-an-email', 'a@b', 42, {}, 'x'.repeat(255) + '@e.com']) {
    assert.equal(hashSuppressedEmail(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
})

test('hashSuppressedEmail: the record never carries the plaintext address', () => {
  const h = hashSuppressedEmail('ada@example.com')
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.ok(!h.includes('ada'), 'hash must not embed the local part')
  assert.ok(!h.includes('example'), 'hash must not embed the domain')
})

// ── collectSuppressionEmailHashes ────────────────────────────────────────────

function selectStub (result) {
  const b = { eq: () => b, in: () => Promise.resolve(result), select: () => b }
  return { from: () => b }
}

test('collectSuppressionEmailHashes: dedupes, and drops rows with no usable email', async () => {
  const sb = selectStub({ data: [{ email: 'a@x.com' }, { email: 'A@X.COM' }, { email: null }, { email: 'bad' }], error: null })
  const hashes = await collectSuppressionEmailHashes(sb, 'site-1', ['d1'])
  assert.deepEqual(hashes, [hashSuppressedEmail('a@x.com')])
})

test('collectSuppressionEmailHashes: a failed read degrades to id-only, never blocks the erasure', async () => {
  // The subject's Art. 17 request outranks our ability to record a suppression key.
  const sb = selectStub({ data: null, error: { message: 'boom' } })
  assert.deepEqual(await collectSuppressionEmailHashes(sb, 'site-1', ['d1']), [])
})

test('collectSuppressionEmailHashes: no subject ids → no query, no keys', async () => {
  let called = false
  const sb = { from: () => { called = true; return {} } }
  assert.deepEqual(await collectSuppressionEmailHashes(sb, 'site-1', []), [])
  assert.equal(called, false)
})

// ── recordErasureSuppression ─────────────────────────────────────────────────

function insertStub (error = null) {
  const inserts = []
  return {
    inserts,
    sb: { from: (t) => ({ insert: (row) => { inserts.push({ table: t, row }); return Promise.resolve({ error }) } }) }
  }
}

test('recordErasureSuppression: writes ONE row carrying both key sets', async () => {
  const { inserts, sb } = insertStub()
  const r = await recordErasureSuppression(sb, {
    siteId: 'site-1', subjectIds: ['anon-1', 'user-1', 'anon-1'], emailHashes: ['h1', 'h1', 'h2'], source: 'visitor'
  })
  assert.equal(r.written, true)
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].table, 'erasure_suppression')
  assert.deepEqual(inserts[0].row.subject_ids, ['anon-1', 'user-1'], 'ids deduped')
  assert.deepEqual(inserts[0].row.email_hashes, ['h1', 'h2'], 'hashes deduped')
  assert.equal(inserts[0].row.site_id, 'site-1')
})

test('recordErasureSuppression: a subject with no volunteered email still gets id keys', async () => {
  const { inserts, sb } = insertStub()
  await recordErasureSuppression(sb, { siteId: 'site-1', subjectIds: ['anon-1'], emailHashes: [] })
  assert.deepEqual(inserts[0].row.email_hashes, [])
  assert.deepEqual(inserts[0].row.subject_ids, ['anon-1'])
})

test('recordErasureSuppression: no ids → no row (a keyless record protects nobody)', async () => {
  const { inserts, sb } = insertStub()
  assert.equal((await recordErasureSuppression(sb, { siteId: 'site-1', subjectIds: [] })).written, false)
  assert.equal((await recordErasureSuppression(sb, { siteId: null, subjectIds: ['a'] })).written, false)
  assert.equal(inserts.length, 0)
})

test('recordErasureSuppression: a write failure is reported, never thrown into the response', async () => {
  // A completed erasure must not become a 500 for the operator — but it must be loud.
  const { sb } = insertStub({ message: 'relation "erasure_suppression" does not exist' })
  assert.equal((await recordErasureSuppression(sb, { siteId: 's', subjectIds: ['a'] })).written, false)
})

// ── ROUTE WIRING: ordering + which outcomes suppress ─────────────────────────
// A chainable Supabase stub that records the ORDER of operations, so the ordering guarantee
// is asserted rather than assumed.

const visitorHandler = (() => {
  const layer = gdprRouter.stack.find(l => l.route?.path === '/visitor' && l.route?.methods?.delete)
  return layer.route.stack[layer.route.stack.length - 1].handle
})()

const _client = getSupabase()
const _realFrom = _client.from

function installSupabase ({ deleteCount = 1, volunteeredEmails = [{ email: 'ada@example.com' }] } = {}) {
  const seq = []
  const inserts = []
  _client.from = (table) => {
    const b = {
      select (cols) {
        // The suppression pre-read is the only volunteered_identity SELECT in this route.
        if (table === 'volunteered_identity' && cols === 'email') seq.push('read:volunteered_identity.email')
        return b
      },
      insert (row) { inserts.push({ table, row }); return Promise.resolve({ error: null }) },
      delete () { seq.push(`delete:${table}`); return b },
      eq: () => b, or: () => b, limit: () => b, neq: () => b, order: () => b,
      maybeSingle: () => Promise.resolve(
        table === 'company_members' ? { data: null } : { data: { id: 'site-1', site_key: 'sk', owner_id: 'u1' }, error: null }
      ),
      in: () => Promise.resolve(
        table === 'volunteered_identity' ? { data: volunteeredEmails, error: null } : { data: [], error: null, count: deleteCount }
      ),
      then (resolve) { return Promise.resolve({ data: table === 'sites' ? [{ id: 'site-1', site_key: 'sk', owner_id: 'u1' }] : [], error: null, count: deleteCount }).then(resolve) }
    }
    return b
  }
  return { seq, inserts, restore: () => { _client.from = _realFrom } }
}

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const mockReq = () => ({ user: { id: 'u1' }, body: { site_key: 'sk', anonymous_id: 'anon-1' } })

test('🔴 ORDERING: the email hash is captured BEFORE volunteered_identity is deleted', async (t) => {
  // The one that matters. Move the pre-read after the delete and this fails; without it, that
  // refactor ships green and the identify()-replay key is silently lost forever.
  const sb = installSupabase({ deleteCount: 1 })
  __setGdprEraseDeps({ eraseSubject: async () => ({ status: 'executed', perDatasource: [{ datasource: 'events', matched: 3 }] }) })
  t.after(() => { sb.restore(); __resetGdprEraseDeps() })

  await visitorHandler(mockReq(), mockRes())

  const readIdx = sb.seq.indexOf('read:volunteered_identity.email')
  const delIdx = sb.seq.indexOf('delete:volunteered_identity')
  assert.ok(readIdx !== -1, 'the suppression email pre-read must happen')
  assert.ok(delIdx !== -1, 'volunteered_identity must still be deleted')
  assert.ok(readIdx < delIdx, `pre-read must precede the delete (read@${readIdx}, delete@${delIdx})`)
})

test('a successful erasure writes a suppression record', async (t) => {
  const sb = installSupabase({ deleteCount: 1 })
  __setGdprEraseDeps({ eraseSubject: async () => ({ status: 'executed', perDatasource: [{ datasource: 'events', matched: 3 }] }) })
  t.after(() => { sb.restore(); __resetGdprEraseDeps() })

  await visitorHandler(mockReq(), mockRes())
  const sup = sb.inserts.filter(i => i.table === 'erasure_suppression')
  assert.equal(sup.length, 1, 'exactly one suppression row')
  assert.ok(sup[0].row.subject_ids.includes('anon-1'))
  assert.deepEqual(sup[0].row.email_hashes, [hashSuppressedEmail('ada@example.com')])
})

test('🔴 a NO-MATCH erasure writes NO suppression record', async (t) => {
  // erasure_log would record this attempt; suppression must not. Suppressing someone who was
  // never erased is the exact defect that made a dedicated table necessary.
  const sb = installSupabase({ deleteCount: 0 })
  __setGdprEraseDeps({ eraseSubject: async () => ({ status: 'executed', perDatasource: [{ datasource: 'events', matched: 0 }] }) })
  t.after(() => { sb.restore(); __resetGdprEraseDeps() })

  const res = mockRes()
  await visitorHandler(mockReq(), res)
  assert.equal(res.statusCode, 404, 'nothing was erased')
  assert.equal(sb.inserts.filter(i => i.table === 'erasure_suppression').length, 0)
})

test('🔴 a PARTIAL erasure (Supabase deleted, Tinybird did not) DOES suppress', async (t) => {
  // The volunteered_identity row is gone, so the PII can be re-entered before the retry.
  const sb = installSupabase({ deleteCount: 2 })
  __setGdprEraseDeps({ eraseSubject: async () => ({ status: 'failed', perDatasource: [{ datasource: 'events', matched: null, error: 'boom' }] }) })
  t.after(() => { sb.restore(); __resetGdprEraseDeps() })

  const res = mockRes()
  await visitorHandler(mockReq(), res)
  assert.equal(res.body?.partial, true, 'route still reports the honest partial')
  assert.equal(sb.inserts.filter(i => i.table === 'erasure_suppression').length, 1,
    'PII was deleted, so suppression must still be recorded')
})
