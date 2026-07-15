// Regression for the non-deterministic domain->site lookup (prod, 2026-07-14): two `sites` rows
// existed for one domain (www.techrupt.pk + techrupt.pk). handlePrivacySuppression did
// `.or(domain=…).then(data => data[0])` with NO ORDER BY and NO exact-match preference, so Postgres'
// arbitrary row order made `data[0]` pick the WRONG site — the GPC/DNT signal was attributed to the
// duplicate. A single-match fixture can't catch this; the fixture here returns TWO rows with the
// DUPLICATE at index [0], exactly the shape that misfired in prod.

import test from 'node:test'
import assert from 'node:assert'
import { getSupabase } from '../lib/supabase.js'
import { handlePrivacySuppression, trackerSiteCache } from '../lib/privacy-suppression.js'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-privsupp.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'
process.env.TINYBIRD_HOST = 'https://api.europe-west3.gcp.tinybird.co'
process.env.TINYBIRD_APPEND_TOKEN = 'mock-append-token'

// Capture the Tinybird append so we can assert WHICH site_id was written.
const originalFetch = globalThis.fetch
const tinybirdCalls = []
globalThis.fetch = async (url, options) => {
  if (String(url).includes('/v0/events?name=privacy_signals')) {
    tinybirdCalls.push(JSON.parse(String(options.body).trim()))
    return { ok: true, text: async () => 'ok' }
  }
  return originalFetch(url, options)
}

// Mock the sites .or() query. `rows` is what the DB "returns" — in ARBITRARY order (duplicate first),
// filtered by the two-form .or() clause exactly like the real query.
let rows = []
const client = getSupabase()
client.from = (table) => {
  if (table !== 'sites') return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }
  return {
    select: () => ({
      or: async (clause) => {
        const wanted = clause.split(',').map((p) => p.split('.eq.')[1])
        return { data: rows.filter((r) => wanted.includes(r.domain)), error: null }
      }
    })
  }
}

function capWarn () {
  const orig = console.warn
  const lines = []
  console.warn = (...a) => lines.push(a.join(' '))
  return { lines, restore: () => { console.warn = orig } }
}

test('deterministic domain lookup with duplicate rows', async (t) => {
  t.afterEach(() => { tinybirdCalls.length = 0; trackerSiteCache.flushAll() })

  await t.test('EXACT hostname wins even when the duplicate is data[0] (the prod bug)', async () => {
    // DB returns the DUPLICATE (bare, newer) FIRST — the row the old `data[0]` wrongly picked.
    rows = [
      { id: 'site-bare-dup', domain: 'techrupt.pk', created_at: '2026-07-11T00:00:00Z' },
      { id: 'site-www-real', domain: 'www.techrupt.pk', created_at: '2026-06-24T00:00:00Z' }
    ]
    const cap = capWarn()
    await handlePrivacySuppression({ headers: { 'sec-gpc': '1', referer: 'https://www.techrupt.pk/blog' } })
    cap.restore()
    assert.strictEqual(tinybirdCalls.length, 1)
    assert.strictEqual(tinybirdCalls[0].site_id, 'site-www-real', 'exact www hostname match wins — NOT the data[0] duplicate')
    assert.ok(cap.lines.some((l) => l.includes('AMBIGUOUS') && l.includes('site-www-real')), 'the ambiguity is logged, not resolved silently')
  })

  await t.test('EXACT bare hostname resolves to the bare row', async () => {
    rows = [
      { id: 'site-www-real', domain: 'www.techrupt.pk', created_at: '2026-06-24T00:00:00Z' },
      { id: 'site-bare-dup', domain: 'techrupt.pk', created_at: '2026-07-11T00:00:00Z' }
    ]
    await handlePrivacySuppression({ headers: { 'dnt': '1', referer: 'https://techrupt.pk/x' } })
    assert.strictEqual(tinybirdCalls[0].site_id, 'site-bare-dup', 'exact bare hostname match wins')
  })

  await t.test('no exact match → OLDEST row wins (stable tie-break), never arbitrary', async () => {
    // Two bare rows (neither equals the incoming www.foo.com hostname), newer returned first.
    rows = [
      { id: 'newer', domain: 'foo.com', created_at: '2026-02-01T00:00:00Z' },
      { id: 'older', domain: 'foo.com', created_at: '2026-01-01T00:00:00Z' }
    ]
    const cap = capWarn()
    await handlePrivacySuppression({ headers: { 'sec-gpc': '1', referer: 'https://www.foo.com/p' } })
    cap.restore()
    assert.strictEqual(tinybirdCalls[0].site_id, 'older', 'tie-break picks the oldest, deterministically')
    assert.ok(cap.lines.some((l) => l.includes('AMBIGUOUS')), 'still logs the ambiguity')
  })

  await t.test('single match still works (no ambiguity log)', async () => {
    rows = [{ id: 'solo', domain: 'www.solo.com', created_at: '2026-03-01T00:00:00Z' }]
    const cap = capWarn()
    await handlePrivacySuppression({ headers: { 'sec-gpc': '1', referer: 'https://www.solo.com/x' } })
    cap.restore()
    assert.strictEqual(tinybirdCalls[0].site_id, 'solo')
    assert.ok(!cap.lines.some((l) => l.includes('AMBIGUOUS')), 'no ambiguity warning on a single match')
  })
})
