import test from 'node:test'
import assert from 'node:assert'
import {
  runGscDailySync,
  withRetry,
  isTransientGscError,
  isAuthGscError
} from '../lib/gsc-daily-sync.js'

// Minimal in-memory Supabase double covering exactly the calls the daily sync
// makes: gsc_connections select (with eq/not filters), gsc_sync_runs insert/update,
// gsc_performance_daily upsert (idempotent on the conflict key), gsc_connections update.
function makeSupabase(connections) {
  const perfStore = new Map() // conflict-key -> row (models the unique index)
  const syncRuns = []
  const connUpdates = []
  let runSeq = 0

  function connSelect() {
    const eqs = []
    const notNull = []
    const b = {
      select() { return b },
      eq(col, val) { eqs.push([col, val]); return b },
      not(col, op, val) { if (op === 'is' && val === null) notNull.push(col); return b },
      then(resolve) {
        let rows = connections.slice()
        for (const [c, v] of eqs) rows = rows.filter(r => r[c] === v)
        for (const c of notNull) rows = rows.filter(r => r[c] !== null && r[c] !== undefined)
        resolve({
          data: rows.map(r => ({
            site_key: r.site_key,
            property_url: r.property_url,
            encrypted_refresh_token: r.encrypted_refresh_token
          })),
          error: null
        })
      }
    }
    return b
  }

  return {
    _state: { perfStore, syncRuns, connUpdates },
    from(table) {
      if (table === 'gsc_connections') {
        return {
          select: () => connSelect(),
          update(patch) {
            return { eq(_c, val) { connUpdates.push({ site_key: val, patch }); return Promise.resolve({ error: null }) } }
          }
        }
      }
      if (table === 'gsc_sync_runs') {
        return {
          insert(row) {
            const id = `run-${++runSeq}`
            syncRuns.push({ id, ...row })
            return { select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }) }
          },
          update(patch) {
            return { eq(_c, id) { const r = syncRuns.find(x => x.id === id); if (r) Object.assign(r, patch); return Promise.resolve({ error: null }) } }
          }
        }
      }
      if (table === 'gsc_performance_daily') {
        return {
          upsert(batch, { onConflict }) {
            const keys = onConflict.split(',')
            for (const row of batch) perfStore.set(keys.map(k => row[k]).join('|'), row)
            return Promise.resolve({ error: null })
          }
        }
      }
      throw new Error(`unexpected table ${table}`)
    }
  }
}

const PAGE = [
  { keys: ['2026-06-20', 'shoes', 'https://x.com/p'], clicks: 5, impressions: 50, ctr: 0.1, position: 2 },
  { keys: ['2026-06-20', 'boots', 'https://x.com/p'], clicks: 3, impressions: 30, ctr: 0.1, position: 3 }
]

function baseDeps(supabase, over = {}) {
  return {
    supabase,
    refreshAccessToken: async () => ({ access_token: 'tok' }),
    // returns one page on startRow 0, then empty (ends pagination)
    fetchGscPerformance: async (_url, _f, _t, _tok, startRow) => (startRow === 0 ? PAGE : []),
    normalizePath: (u) => { try { return new URL(u).pathname } catch { return '/' } },
    sleep: async () => {},
    now: () => new Date('2026-06-28T00:00:00Z'),
    log: () => {},
    ...over
  }
}

test('runGscDailySync — only syncs connected connections with property + token', async () => {
  const supabase = makeSupabase([
    { site_key: 'A', status: 'connected', property_url: 'https://a', encrypted_refresh_token: 'tA' }, // eligible
    { site_key: 'B', status: 'needs_reconnect', property_url: 'https://b', encrypted_refresh_token: 'tB' }, // wrong status
    { site_key: 'C', status: 'connected', property_url: null, encrypted_refresh_token: 'tC' }, // no property
    { site_key: 'D', status: 'connected', property_url: 'https://d', encrypted_refresh_token: null } // no token
  ])
  const summary = await runGscDailySync(baseDeps(supabase))
  assert.strictEqual(summary.eligible, 1)
  assert.strictEqual(summary.succeeded, 1)
  assert.strictEqual(summary.failed, 0)
  // exactly one run row, and it is sync_type 'daily'
  assert.strictEqual(supabase._state.syncRuns.length, 1)
  assert.strictEqual(supabase._state.syncRuns[0].sync_type, 'daily')
  assert.strictEqual(supabase._state.syncRuns[0].status, 'success')
})

test('runGscDailySync — one failing connection does not abort the batch', async () => {
  const supabase = makeSupabase([
    { site_key: 'A', status: 'connected', property_url: 'https://a', encrypted_refresh_token: 'tA' },
    { site_key: 'B', status: 'connected', property_url: 'https://b', encrypted_refresh_token: 'tB' }
  ])
  const deps = baseDeps(supabase, {
    fetchGscPerformance: async (url, _f, _t, _tok, startRow) => {
      if (url === 'https://a') throw new Error('gsc_performance_query_failed') // permanent (no status) for A
      return startRow === 0 ? PAGE : []
    }
  })
  const summary = await runGscDailySync(deps)
  assert.strictEqual(summary.eligible, 2)
  assert.strictEqual(summary.succeeded, 1)
  assert.strictEqual(summary.failed, 1)
  // B's rows were still written despite A failing first
  assert.ok([...supabase._state.perfStore.keys()].some(k => k.startsWith('B|')))
})

test('runGscDailySync — idempotent: re-running does not duplicate rows', async () => {
  const conns = [{ site_key: 'A', status: 'connected', property_url: 'https://a', encrypted_refresh_token: 'tA' }]
  const supabase = makeSupabase(conns)
  await runGscDailySync(baseDeps(supabase))
  const afterFirst = supabase._state.perfStore.size
  await runGscDailySync(baseDeps(supabase))
  assert.strictEqual(supabase._state.perfStore.size, afterFirst) // onConflict dedupe
  assert.strictEqual(afterFirst, PAGE.length)
})

test('runGscDailySync — auth failure flips connection to needs_reconnect', async () => {
  const supabase = makeSupabase([
    { site_key: 'A', status: 'connected', property_url: 'https://a', encrypted_refresh_token: 'tA' }
  ])
  const authErr = Object.assign(new Error('google_access_token_refresh_failed'), { status: 401 })
  const deps = baseDeps(supabase, { refreshAccessToken: async () => { throw authErr } })
  const summary = await runGscDailySync(deps)
  assert.strictEqual(summary.failed, 1)
  const update = supabase._state.connUpdates.find(u => u.site_key === 'A')
  assert.strictEqual(update.patch.status, 'needs_reconnect')
})

test('withRetry — retries transient (5xx) then succeeds; passes auth through immediately', async () => {
  let calls = 0
  const sleeps = []
  const val = await withRetry(async () => {
    calls++
    if (calls < 3) throw Object.assign(new Error('x'), { status: 503 })
    return 'ok'
  }, { sleep: async (ms) => { sleeps.push(ms) }, baseMs: 1 })
  assert.strictEqual(val, 'ok')
  assert.strictEqual(calls, 3)
  assert.strictEqual(sleeps.length, 2)

  // auth error is not retryable → throws on first attempt
  let authCalls = 0
  await assert.rejects(() => withRetry(async () => {
    authCalls++
    throw Object.assign(new Error('google_access_token_refresh_failed'), { status: 401 })
  }, { sleep: async () => {}, isRetryable: isTransientGscError }))
  assert.strictEqual(authCalls, 1)
})

test('classifiers — transient vs auth', () => {
  assert.ok(isTransientGscError({ status: 429 }))
  assert.ok(isTransientGscError({ status: 503 }))
  assert.ok(!isTransientGscError({ status: 401 }))
  assert.ok(isAuthGscError({ status: 403 }))
  assert.ok(isAuthGscError({ message: 'google_access_token_refresh_failed' }))
  assert.ok(!isAuthGscError({ status: 500 }))
})
