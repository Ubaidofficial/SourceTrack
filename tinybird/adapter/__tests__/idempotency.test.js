// Phase 2b - createRevenueIdempotency() claim/rollback. Mock Supabase; no real DB.

import test from 'node:test'
import assert from 'node:assert'
import { createRevenueIdempotency, TINYBIRD_IDEMPOTENCY_TABLE } from '../idempotency.js'

// Minimal Supabase mock: an in-memory unique index over (site_id, event_id) that
// reproduces a 23505 unique_violation on a duplicate insert, plus delete().eq().eq().
function mockSupabase ({ failWith } = {}) {
  const rows = new Set()
  const key = (r) => `${r.site_id}|${r.event_id}`
  const calls = { insert: 0, delete: 0 }
  return {
    rows,
    calls,
    from (table) {
      assert.strictEqual(table, TINYBIRD_IDEMPOTENCY_TABLE)
      return {
        async insert (row) {
          calls.insert++
          if (failWith) return { error: failWith }
          if (rows.has(key(row))) return { error: { code: '23505', message: 'duplicate key' } }
          rows.add(key(row))
          return { error: null }
        },
        delete () {
          const eqs = {}
          const builder = {
            eq (col, val) { eqs[col] = val; return builder },
            then (resolve) { // thenable so `await delete().eq().eq()` works
              calls.delete++
              rows.delete(`${eqs.site_id}|${eqs.event_id}`)
              resolve({ error: null })
            }
          }
          return builder
        }
      }
    }
  }
}

test('first claim succeeds; duplicate (site_id,event_id) is rejected', async () => {
  const sb = mockSupabase()
  const idem = createRevenueIdempotency(sb)
  assert.deepStrictEqual(await idem.claim('site-1', 'evt_1'), { claimed: true })
  assert.deepStrictEqual(await idem.claim('site-1', 'evt_1'), { claimed: false, duplicate: true })
})

test('no provider in the key: same event_id under same site dedups regardless of source', async () => {
  const sb = mockSupabase()
  const idem = createRevenueIdempotency(sb)
  // browser claims first, offline retries the SAME shared event_id -> deduped
  assert.deepStrictEqual(await idem.claim('site-1', 'site-1:ord_42:purchase'), { claimed: true })
  assert.deepStrictEqual(await idem.claim('site-1', 'site-1:ord_42:purchase'), { claimed: false, duplicate: true })
})

test('tenant isolation: same event_id under DIFFERENT site_id both claim', async () => {
  const sb = mockSupabase()
  const idem = createRevenueIdempotency(sb)
  assert.deepStrictEqual(await idem.claim('site-1', 'evt_x'), { claimed: true })
  assert.deepStrictEqual(await idem.claim('site-2', 'evt_x'), { claimed: true })
})

test('rollback releases the claim so a retry can re-claim', async () => {
  const sb = mockSupabase()
  const idem = createRevenueIdempotency(sb)
  await idem.claim('site-1', 'evt_r')
  assert.deepStrictEqual(await idem.claim('site-1', 'evt_r'), { claimed: false, duplicate: true })
  await idem.rollback('site-1', 'evt_r')
  assert.deepStrictEqual(await idem.claim('site-1', 'evt_r'), { claimed: true }, 're-claim after rollback')
  assert.strictEqual(sb.calls.delete, 1)
})

test('DB error is distinguished from duplicate (caller fails OPEN, not silent drop)', async () => {
  const sb = mockSupabase({ failWith: { code: '08006', message: 'connection lost' } })
  const idem = createRevenueIdempotency(sb)
  const r = await idem.claim('site-1', 'evt_e')
  assert.strictEqual(r.claimed, false)
  assert.strictEqual(r.duplicate, undefined, 'must NOT look like a duplicate')
  assert.strictEqual(r.error, 'connection lost', 'error surfaced so caller can emit anyway')
})

test('missing site_id or event_id -> error (never a silent claim)', async () => {
  const idem = createRevenueIdempotency(mockSupabase())
  assert.strictEqual((await idem.claim('', 'evt')).claimed, false)
  assert.strictEqual((await idem.claim('site', '')).claimed, false)
  assert.ok((await idem.claim('', 'evt')).error)
})

test('requires an injected Supabase client', () => {
  assert.throws(() => createRevenueIdempotency(null), /injected Supabase client/)
  assert.throws(() => createRevenueIdempotency({}), /injected Supabase client/)
})
