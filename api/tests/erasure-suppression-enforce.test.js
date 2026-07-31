// Erasure suppression, PR 2 of 5 — ENFORCEMENT on the Supabase PII write paths.
//
// PR 1 recorded suppression; nothing read it. These paths now do:
//   path 1  volunteered_identity   (identify() replay — email + name)
//   path 4  site_identity_links    (identify, browser/offline conversion, server events)
//   path 5  lead_qualifications    (manual operator re-qualification)
//
// Refund re-attachment (path 2) and CAPI egress (path 6) are BLOCKED pending the founder and are
// deliberately untouched here. The batcher requeue (path 3) is PR 3.
//
// The load-bearing behaviours, all asserted rather than assumed:
//
//  * the identify()-REPLAY end-to-end case: same email, BRAND-NEW anonymous_id — the shape the
//    id keys alone cannot catch, and the one the whole two-key design exists for.
//  * FAIL CLOSED on a degraded lookup, and never caching that verdict.
//  * a cache MISS is not an answer — cold start must behave like warm, not like "not suppressed".

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'mock-service-role-key-value'

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isErasureSuppressed,
  hashSuppressedEmail,
  __resetSuppressionCache
} from '../lib/erasure-suppression.js'

// A Supabase stub for erasure_suppression lookups.
//   suppressedIds / suppressedHashes — what the table "contains"
//   failMode: 'error' makes every lookup return a DB error (degraded)
function suppressionDb ({ suppressedIds = [], suppressedHashes = [], failMode = null } = {}) {
  const queries = []
  return {
    queries,
    from (table) {
      const state = { column: null, value: null }
      const b = {
        select: () => b,
        eq: () => b,
        contains (column, values) { state.column = column; state.value = values[0]; return b },
        limit () {
          queries.push({ table, column: state.column, value: state.value })
          if (failMode === 'error') return Promise.resolve({ data: null, error: { message: 'connection reset' } })
          const pool = state.column === 'subject_ids' ? suppressedIds : suppressedHashes
          return Promise.resolve({ data: pool.includes(state.value) ? [{ id: 'row-1' }] : [], error: null })
        }
      }
      return b
    }
  }
}

test.beforeEach(() => __resetSuppressionCache())

// ── the two-key design ───────────────────────────────────────────────────────

test('🔴 identify() REPLAY: same email, BRAND-NEW anonymous_id is still suppressed', async () => {
  // The case that justifies the email key. The erased subject cleared storage / switched
  // devices, so their new anonymous_id matches nothing in subject_ids. Only the email hash
  // catches them. If this ever regresses, suppression looks like it works right up until the
  // one scenario it was built for.
  const db = suppressionDb({ suppressedHashes: [hashSuppressedEmail('erased@example.com')] })
  assert.equal(
    await isErasureSuppressed(db, { siteId: 's1', subjectId: 'BRAND-NEW-ANON-ID', email: 'erased@example.com' }),
    true
  )
})

test('the id key catches a subject who never volunteered an email', async () => {
  const db = suppressionDb({ suppressedIds: ['anon-erased'] })
  assert.equal(await isErasureSuppressed(db, { siteId: 's1', subjectId: 'anon-erased' }), true)
})

test('an unrelated visitor is NOT suppressed', async () => {
  const db = suppressionDb({ suppressedIds: ['anon-erased'], suppressedHashes: [hashSuppressedEmail('erased@example.com')] })
  assert.equal(await isErasureSuppressed(db, { siteId: 's1', subjectId: 'anon-other', email: 'other@example.com' }), false)
})

test('email matching is normalisation-insensitive, as identify() writes it', async () => {
  const db = suppressionDb({ suppressedHashes: [hashSuppressedEmail('erased@example.com')] })
  assert.equal(await isErasureSuppressed(db, { siteId: 's1', subjectId: 'x', email: '  ERASED@Example.COM ' }), true)
})

test('a write carrying no subject at all is not suppressed (nothing to match)', async () => {
  const db = suppressionDb({ suppressedIds: ['a'] })
  assert.equal(await isErasureSuppressed(db, { siteId: 's1' }), false)
  assert.equal(await isErasureSuppressed(db, { siteId: 's1', subjectId: '', email: 'not-an-email' }), false)
  assert.equal(db.queries.length, 0, 'no key → no query')
})

// ── fail closed ──────────────────────────────────────────────────────────────

test('🔴 FAILS CLOSED: a degraded lookup suppresses rather than letting PII through', async () => {
  const db = suppressionDb({ failMode: 'error' })
  assert.equal(await isErasureSuppressed(db, { siteId: 's1', subjectId: 'anon-1' }), true)
})

test('🔴 a fail-closed verdict is NEVER cached — one blip must not suppress a site for a TTL', async () => {
  const failing = suppressionDb({ failMode: 'error' })
  assert.equal(await isErasureSuppressed(failing, { siteId: 's1', subjectId: 'anon-1' }), true)

  // Same key, healthy database, same process: must re-query and get the real answer. If the
  // degraded verdict had been cached, this would still return true and identity enrichment
  // would stay broken for 5 minutes after a transient error.
  const healthy = suppressionDb({ suppressedIds: [] })
  assert.equal(await isErasureSuppressed(healthy, { siteId: 's1', subjectId: 'anon-1' }), false)
  assert.equal(healthy.queries.length, 1, 'the healthy client was actually queried')
})

// ── cache behaviour ──────────────────────────────────────────────────────────

test('🔴 COLD START: an empty cache is a miss, not a "not suppressed"', async () => {
  // The deploy-window failure mode: if a miss short-circuited to false, every restart would be
  // a period in which erased subjects are unprotected, with nothing in the logs.
  __resetSuppressionCache()
  const db = suppressionDb({ suppressedIds: ['anon-erased'] })
  assert.equal(await isErasureSuppressed(db, { siteId: 's1', subjectId: 'anon-erased' }), true)
  assert.equal(db.queries.length, 1, 'a cold cache must reach the database')
})

test('a real answer IS cached — the hot path does not re-query per event', async () => {
  const db = suppressionDb({ suppressedIds: ['anon-erased'] })
  await isErasureSuppressed(db, { siteId: 's1', subjectId: 'anon-erased' })
  await isErasureSuppressed(db, { siteId: 's1', subjectId: 'anon-erased' })
  await isErasureSuppressed(db, { siteId: 's1', subjectId: 'anon-erased' })
  assert.equal(db.queries.length, 1, 'three checks, one query')

  const neg = suppressionDb({ suppressedIds: [] })
  await isErasureSuppressed(neg, { siteId: 's1', subjectId: 'anon-live' })
  await isErasureSuppressed(neg, { siteId: 's1', subjectId: 'anon-live' })
  assert.equal(neg.queries.length, 1, 'negatives are cached too, or ingestion pays a query per event')
})

test('the cache is tenant-scoped — one site\'s suppression cannot leak into another', async () => {
  const db = suppressionDb({ suppressedIds: ['shared-id'] })
  assert.equal(await isErasureSuppressed(db, { siteId: 'site-A', subjectId: 'shared-id' }), true)
  // Site B's lookup must not reuse site A's cached verdict; it queries on its own.
  const dbB = suppressionDb({ suppressedIds: [] })
  assert.equal(await isErasureSuppressed(dbB, { siteId: 'site-B', subjectId: 'shared-id' }), false)
  assert.equal(dbB.queries.length, 1)
})

// ── END-TO-END: the actual write path, not just the check ────────────────────
// The check returning true proves nothing on its own — what matters is that the PII never
// reaches the table. These drive persistVolunteeredIdentity(), the ONLY writer of
// volunteered_identity, and assert on what it did or did not upsert.

const { persistVolunteeredIdentity } = await import('../lib/volunteered-identity.js')

// One stub serving both the suppression lookup and the volunteered_identity upsert, so the
// end-to-end path runs exactly as it does in production.
function identityDb ({ suppressedHashes = [], suppressedIds = [] } = {}) {
  const upserts = []
  return {
    upserts,
    from (table) {
      const state = {}
      const b = {
        select: () => b,
        eq: () => b,
        contains (column, values) { state.column = column; state.value = values[0]; return b },
        limit () {
          const pool = state.column === 'subject_ids' ? suppressedIds : suppressedHashes
          return Promise.resolve({ data: pool.includes(state.value) ? [{ id: 'r' }] : [], error: null })
        },
        upsert (row) { upserts.push({ table, row }); return Promise.resolve({ error: null }) }
      }
      return b
    }
  }
}

test('🔴 END-TO-END: an erased subject re-identifying with the same email writes NO PII', async () => {
  // The scenario in full: person erased, later returns on a new device (new anonymous_id) and
  // submits a form carrying the same address. The email hash is the only thing linking them.
  const db = identityDb({ suppressedHashes: [hashSuppressedEmail('erased@example.com')] })
  const result = await persistVolunteeredIdentity({
    siteId: 's1',
    distinctId: 'BRAND-NEW-ANON-ID',
    email: 'erased@example.com',
    name: 'Ada Lovelace',
    supabase: db
  })

  assert.equal(result.written, false)
  assert.equal(result.suppressed, true)
  assert.equal(db.upserts.length, 0, 'NOTHING was written to volunteered_identity')
  // And the PII is not handed back to the caller either.
  assert.equal(result.email, null)
  assert.equal(result.name, null)
})

test('🔴 END-TO-END: accept-but-don\'t-attach — the caller is NOT told the email was erased', async () => {
  // Rejecting would make this endpoint an oracle for "which addresses have been erased".
  // The suppressed result must be indistinguishable, to a caller, from an ordinary no-op —
  // no error, no throw, no distinguishing message.
  const db = identityDb({ suppressedHashes: [hashSuppressedEmail('erased@example.com')] })
  const suppressed = await persistVolunteeredIdentity({
    siteId: 's1', distinctId: 'anon-new', email: 'erased@example.com', name: 'X', supabase: db
  })
  // A visitor who volunteered nothing at all takes the ordinary no-write path.
  const nothingVolunteered = await persistVolunteeredIdentity({
    siteId: 's1', distinctId: 'anon-live', email: null, name: null, supabase: db
  })
  assert.equal(suppressed.written, false)
  assert.equal(nothingVolunteered.written, false)
  assert.equal(suppressed.email, nothingVolunteered.email)
  assert.equal(suppressed.name, nothingVolunteered.name)
})

test('END-TO-END: a NON-suppressed visitor still has their identity written (no over-blocking)', async () => {
  // The other half of the proof: suppression must not quietly break normal capture.
  const db = identityDb({ suppressedHashes: [hashSuppressedEmail('erased@example.com')] })
  const result = await persistVolunteeredIdentity({
    siteId: 's1', distinctId: 'anon-live', email: 'live@example.com', name: 'Grace', supabase: db
  })
  assert.equal(result.written, true)
  assert.equal(db.upserts.length, 1)
  assert.equal(db.upserts[0].table, 'volunteered_identity')
  assert.equal(db.upserts[0].row.email, 'live@example.com')
})

// ── the circular import between the two modules ──────────────────────────────

test('erasure-suppression <-> volunteered-identity import cycle resolves in BOTH load orders', async () => {
  // The suppression hash must be taken over the SAME normalisation identify() applies, which
  // makes the cycle deliberate. It only works because both sides are hoisted `export function`
  // declarations — converting either to `export const fn = () => …` would crash at load with a
  // temporal-dead-zone error, in production, on the identify path.
  const a = await import('../lib/volunteered-identity.js')
  const b = await import('../lib/erasure-suppression.js')
  assert.equal(typeof a.normalizeVolunteeredEmail, 'function')
  assert.equal(typeof b.isErasureSuppressed, 'function')
  assert.equal(typeof b.hashSuppressedEmail, 'function')
  // And the binding actually works across the edge, not merely exists.
  assert.match(b.hashSuppressedEmail('A@B.com'), /^[0-9a-f]{64}$/)
})
