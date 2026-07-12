// The nightly's Tinybird read DISPATCH contract (the route-args-matrix equivalent for
// a cron pipe: which store/pipe serves each arg case) + the health-agent reading the
// SAME store. TOKEN-FREE, NO network on the served paths.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.invalid.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const { processSite, __setNightlyReadDeps, __resetNightlyReadDeps } = await import('../jobs/nightly-attribution.js')
const { sumStoreConversions } = await import('../jobs/health-agent.js')

const SITE = { id: 'site-eb7f68c3', site_key: 'sk_test', attribution_window_days: 30 }

// ── DISPATCH: a normal site's conversion read serves from nightly_conversions_by_site

test('normal site → conversion read dispatches to nightly_conversions_by_site (served, not fallback)', async (t) => {
  t.after(__resetNightlyReadDeps)
  const calls = []
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe, params) => { calls.push({ pipe, params }); return [] } // served empty
  })
  const r = await processSite(SITE)
  assert.equal(r.served, true, 'pipe served (non-null)')
  assert.equal(r.fellBack, false)
  assert.equal(r.fetched, 0)
  const conv = calls.find(c => c.pipe === 'nightly_conversions_by_site')
  assert.ok(conv, 'the new conversions pipe was queried')
  assert.equal(conv.params.site_id, 'site-eb7f68c3', 'site-scoped (tenant isolation)')
  assert.ok(conv.params.date_from && conv.params.date_to, 'windowed with date_from/date_to')
})

// ── DISPATCH: a silent pipe failure (null) falls back to HogQL and is flagged fellBack

test('pipe 403/null → conversion read falls back to HogQL and flags fellBack (never a silent empty)', async (t) => {
  t.after(__resetNightlyReadDeps)
  __setNightlyReadDeps({ tbReadEnabled: () => true, queryPipe: async () => null }) // 403 → fallback
  const r = await processSite(SITE)
  assert.equal(r.served, false)
  assert.equal(r.fellBack, true, 'a null pipe result is a fallback, tracked for the dead-store guard')
  assert.equal(r.queryFailed, true, 'the HogQL fallback to a dead store then hard-fails, not a silent 0')
})

// ── health-agent reads the SAME store + pipe as the nightly ──────────────────

test('health-agent sumStoreConversions queries nightly_conversions_by_site (same store the nightly reads)', async () => {
  const pipes = []
  const queryPipe = async (pipe) => { pipes.push(pipe); return pipe === 'nightly_conversions_by_site' ? [{}, {}, {}] : null }
  const total = await sumStoreConversions({
    sites: [{ id: 's1' }, { id: 's2' }], queryPipe, date_from: '2026-07-10 00:00:00', date_to: '2026-07-12 00:00:00'
  })
  assert.ok(pipes.every(p => p === 'nightly_conversions_by_site'), 'ONLY the nightly conversions pipe is used')
  assert.equal(total, 6, 'sums rows across sites (3 + 3)')
})

test('health-agent sumStoreConversions returns null (unknown) when NO site was pipe-served', async () => {
  const total = await sumStoreConversions({
    sites: [{ id: 's1' }], queryPipe: async () => null, date_from: 'x', date_to: 'y'
  })
  assert.equal(total, null, 'store unreachable → unknown, so the evaluator does not false-fire the silent-zero rule')
})

test('health-agent sumStoreConversions returns 0 (genuine empty) when the pipe served empty', async () => {
  const total = await sumStoreConversions({
    sites: [{ id: 's1' }], queryPipe: async () => [], date_from: 'x', date_to: 'y'
  })
  assert.equal(total, 0)
})
