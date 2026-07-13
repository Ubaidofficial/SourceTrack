// GDPR SUBJECT ACCESS (Art. 15) tests — TOKEN-FREE, NO NETWORK (fetch stubbed).
// Two layers:
//   MODULE  — fetchSubjectEventsFromTinybird: READ-token-only, cap+report,
//             failure-not-swallowed, predicate reuse (buildDeleteCondition identity).
//   ROUTE   — GET /api/gdpr/subject (a–e): has events / empty / store-failure /
//             authz-vs-DB-error / same predicate as the eraser.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fetchSubjectEventsFromTinybird,
  SUBJECT_EVENT_CAP,
  SUBJECT_EVENT_COLUMNS,
  buildDeleteCondition as buildDeleteConditionFromExport
} from '../../tinybird/adapter/export.js'
import { buildDeleteCondition as buildDeleteConditionFromErase } from '../../tinybird/adapter/erase.js'

const SITE = 'de200000-babe-41d4-a716-446655441111'
const SUBJECT = 'anon-visitor-123'

// A stub fetch that answers /v0/sql count() + rows queries and records every call.
// Rows honor the LIMIT in the query so the cap path is exercised for real.
function makeReadFetch ({ count = 3, failOn = null } = {}) {
  const calls = []
  const allRows = Array.from({ length: count }, (_, i) => ({ event_id: `e${i}`, timestamp: i }))
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url)
    calls.push({ url: u, method: opts.method || 'GET', auth: opts.headers?.Authorization })
    const q = decodeURIComponent((u.split('q=')[1] || ''))
    const isCount = /count\(\)/.test(q)
    if (failOn === 'count' && isCount) return { ok: false, status: 500, json: async () => ({}) }
    if (failOn === 'rows' && !isCount) return { ok: false, status: 500, json: async () => ({}) }
    if (isCount) return { ok: true, json: async () => ({ data: [{ n: count }] }) }
    const m = q.match(/LIMIT (\d+)/)
    const limit = m ? Number(m[1]) : count
    return { ok: true, json: async () => ({ data: allRows.slice(0, limit) }) }
  }
  return { fetchImpl, calls }
}

// ── MODULE: predicate reuse (assert on the FUNCTION, not a copy) ───────────────

test('🔴 (e-module) the export predicate IS the eraser buildDeleteCondition (same function, no copy)', () => {
  assert.equal(buildDeleteConditionFromExport, buildDeleteConditionFromErase,
    'export must re-export the eraser predicate — a divergent copy could drift from what the eraser deletes')
})

test('module: the WHERE sent to Tinybird equals buildDeleteCondition(site, subject)', async () => {
  const { fetchImpl, calls } = makeReadFetch({ count: 2 })
  await fetchSubjectEventsFromTinybird({ host: 'https://h', readToken: 'read-tok', siteId: SITE, subjectId: SUBJECT, fetchImpl })
  const expected = buildDeleteConditionFromErase(SITE, SUBJECT)
  assert.ok(calls.length > 0)
  assert.ok(calls.every(c => decodeURIComponent(c.url).includes(expected)), 'every query uses the eraser predicate verbatim')
})

// ── MODULE: READ token only, never a delete ───────────────────────────────────

test('module: uses the READ token and NEVER hits a delete/datasources endpoint', async () => {
  const { fetchImpl, calls } = makeReadFetch({ count: 3 })
  await fetchSubjectEventsFromTinybird({ host: 'https://h', readToken: 'read-tok', siteId: SITE, subjectId: SUBJECT, fetchImpl })
  assert.ok(calls.length === 4, 'count + rows for each of the two datasources')
  assert.ok(calls.every(c => c.auth === 'Bearer read-tok'), 'READ token on every call — no admin token')
  assert.ok(calls.every(c => c.method === 'GET'), 'reads only')
  assert.ok(calls.every(c => !/\/delete|\/v0\/datasources\//.test(c.url)), 'never touches the delete API')
})

// ── MODULE: has events → counts match, not capped ──────────────────────────────

test('module: subject WITH events → matched === returned, capped=false, status ok', async () => {
  const { fetchImpl } = makeReadFetch({ count: 3 })
  const r = await fetchSubjectEventsFromTinybird({ host: 'https://h', readToken: 'read-tok', siteId: SITE, subjectId: SUBJECT, fetchImpl })
  assert.equal(r.status, 'ok')
  assert.equal(r.perDatasource.length, 2)
  assert.deepEqual(r.perDatasource.map(d => d.datasource), ['events', 'events_by_visitor'])
  assert.ok(r.perDatasource.every(d => d.matched === 3 && d.returned === 3 && d.capped === false))
})

// ── MODULE: cap is enforced AND reported ───────────────────────────────────────

test('module: matched > cap → returned === cap and capped=true (truncation is explicit)', async () => {
  const { fetchImpl } = makeReadFetch({ count: 5 })
  const r = await fetchSubjectEventsFromTinybird({ host: 'https://h', readToken: 'read-tok', siteId: SITE, subjectId: SUBJECT, cap: 2, fetchImpl })
  assert.equal(r.status, 'ok')
  assert.equal(r.cap, 2)
  assert.ok(r.perDatasource.every(d => d.matched === 5 && d.returned === 2 && d.capped === true))
})

// ── MODULE: empty subject is distinct from a failure ───────────────────────────

test('module: subject with NO events → status ok, matched 0 (NOT a failure)', async () => {
  const { fetchImpl } = makeReadFetch({ count: 0 })
  const r = await fetchSubjectEventsFromTinybird({ host: 'https://h', readToken: 'read-tok', siteId: SITE, subjectId: SUBJECT, fetchImpl })
  assert.equal(r.status, 'ok')
  assert.ok(r.perDatasource.every(d => d.matched === 0 && d.returned === 0 && d.rows.length === 0 && d.error === null))
})

// ── MODULE: a failed read is captured, never swallowed, never thrown ───────────

test('🔴 module: a failed read → status "failed" with error captured (not thrown, not empty-ok)', async () => {
  const { fetchImpl } = makeReadFetch({ count: 3, failOn: 'rows' })
  const r = await fetchSubjectEventsFromTinybird({ host: 'https://h', readToken: 'read-tok', siteId: SITE, subjectId: SUBJECT, fetchImpl })
  assert.equal(r.status, 'failed', 'a read error must surface as failed, never a silent empty result')
  assert.ok(r.perDatasource.some(d => d.error && /500/.test(d.error)))
  assert.ok(r.perDatasource.some(d => d.rows === null), 'no fabricated rows on a failed read')
})

// ── MODULE: not configured is explicit, not empty ──────────────────────────────

test('module: no read token → skipped_not_configured (store unavailable, not "0 events")', async () => {
  const r = await fetchSubjectEventsFromTinybird({ host: 'https://h', readToken: undefined, siteId: SITE, subjectId: SUBJECT })
  assert.equal(r.status, 'skipped_not_configured')
  assert.match(r.reason, /TINYBIRD_READ_TOKEN/)
  assert.deepEqual(r.perDatasource, [])
})

test('module: SUBJECT_EVENT_COLUMNS never selects the raw properties bag', () => {
  assert.ok(!SUBJECT_EVENT_COLUMNS.includes('properties'), 'raw properties bag is excluded from the allowlist')
  assert.ok(SUBJECT_EVENT_CAP > 0)
})

// ══════════════════════════════════════════════════════════════════════════════
// ROUTE: GET /api/gdpr/subject (a–e)
// ══════════════════════════════════════════════════════════════════════════════
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'mock-service-role-key-value'
const { gdprRouter, __setGdprExportDeps, __resetGdprExportDeps } = await import('../routes/gdpr.js')
const { getSupabase } = await import('../lib/supabase.js')

const subjectHandler = (() => {
  const layer = gdprRouter.stack.find(l => l.route?.path === '/subject' && l.route?.methods?.get)
  return layer.route.stack[layer.route.stack.length - 1].handle
})()

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const _client = getSupabase()
const _realFrom = _client.from

// Chainable Supabase stub honoring select/eq/limit + maybeSingle (getSiteForUser)
// and await (the two subject-scoped selects).
function installSupabase (cfg) {
  const result = (table) => {
    if (table === 'company_members') return { data: cfg.memberRow ?? null, error: null }
    if (table === 'sites') return { data: cfg.site ?? null, error: cfg.siteError ?? null }
    if (table === 'attributed_conversions') return { data: cfg.conversions ?? [], error: cfg.convError ?? null }
    if (table === 'site_identity_links') return { data: cfg.links ?? [], error: cfg.linkError ?? null }
    return { data: [], error: null }
  }
  const chain = (table) => {
    const b = {
      select: () => b, eq: () => b, limit: () => b, order: () => b, in: () => b,
      maybeSingle: async () => result(table),
      then: (res, rej) => Promise.resolve(result(table)).then(res, rej)
    }
    return b
  }
  _client.from = (table) => ({ select: () => chain(table) })
}
function restoreSupabase () { _client.from = _realFrom }

// Reader stub: records the args it was called with (to prove no admin token flows in).
function installReader (tbResult) {
  const calls = []
  __setGdprExportDeps({ fetchSubjectEvents: async (args) => { calls.push(args); return tbResult } })
  return calls
}

const ROUTE_SITE = { id: 'site-1', site_key: 'sk_x', owner_id: 'u1', company_id: null, plan: 'growth' }
const req = () => ({ user: { id: 'u1' }, query: { site_key: 'sk_x', anonymous_id: 'anon-9' } })
const okEvents = (n) => ({
  status: 'ok', store: 'tinybird', cap: SUBJECT_EVENT_CAP,
  perDatasource: [
    { datasource: 'events', matched: n, returned: n, capped: false, rows: Array.from({ length: n }, (_, i) => ({ event_id: `e${i}` })), error: null },
    { datasource: 'events_by_visitor', matched: n, returned: n, capped: false, rows: Array.from({ length: n }, (_, i) => ({ event_id: `e${i}` })), error: null }
  ]
})

test('(a) /subject WITH events → success bundle contains them; conversion count matches', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprExportDeps() })
  installSupabase({ site: ROUTE_SITE, conversions: [{ conversion_event_id: 'c1' }, { conversion_event_id: 'c2' }], links: [{ anonymous_id: 'anon-9' }] })
  const calls = installReader(okEvents(3))
  const res = mockRes()
  await subjectHandler(req(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.sources.tinybird_events.perDatasource[0].matched, 3)
  assert.equal(res.body.sources.attributed_conversions.count, 2)
  assert.equal(res.body.sources.attributed_conversions.rows.length, 2)
  assert.equal(res.body.sources.site_identity_links.count, 1)
  // READ path only — the reader was never handed an admin token.
  assert.equal(calls.length, 1)
  assert.ok(!('adminToken' in calls[0]), 'the subject reader must never receive an admin token')
  // lead_qualifications is explicitly excluded, not silently dropped.
  assert.equal(res.body.sources.lead_qualifications.included, false)
})

test('(b) /subject with NO data → success:true, explicitly empty (NOT a failure shape)', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprExportDeps() })
  installSupabase({ site: ROUTE_SITE, conversions: [], links: [] })
  installReader(okEvents(0))
  const res = mockRes()
  await subjectHandler(req(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.sources.tinybird_events.status, 'ok')
  assert.equal(res.body.sources.attributed_conversions.count, 0)
  assert.equal(res.body.sources.site_identity_links.count, 0)
  assert.equal(res.body.error, undefined, 'empty is not an error')
})

test('🔴 (c) /subject Tinybird FAILS → does NOT return a complete-looking bundle; fails loudly (load-bearing)', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprExportDeps() })
  installSupabase({ site: ROUTE_SITE, conversions: [{ conversion_event_id: 'c1' }], links: [] })
  installReader({ status: 'failed', store: 'tinybird', cap: SUBJECT_EVENT_CAP, perDatasource: [{ datasource: 'events', matched: null, returned: null, capped: null, rows: null, error: 'read query responded 500' }] })
  const res = mockRes()
  await subjectHandler(req(), res)
  assert.equal(res.body.success, false, 'a store failure must not be reported as success')
  assert.notEqual(res.statusCode, 200, 'must not 200 on an incomplete bundle')
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.tinybird_status, 'failed')
  assert.equal(res.body.sources, undefined, 'no complete-looking sources bundle on failure')
})

test('(d) /subject authz vs DB error — no-access → REAL 403; DB error → 500 (distinguishable)', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprExportDeps() })
  // no-access: getSiteForUser returns null → a real authorization 403
  installSupabase({ site: null })
  const calls = installReader(okEvents(1))
  const res1 = mockRes()
  await subjectHandler(req(), res1)
  assert.equal(res1.statusCode, 403)
  assert.equal(calls.length, 0, 'no event read attempted when access is denied')

  // DB error in the site lookup → surfaced as 500, NOT swallowed into a 403
  installSupabase({ site: null, siteError: { message: 'column sites.x does not exist' } })
  const res2 = mockRes()
  await subjectHandler(req(), res2)
  assert.equal(res2.statusCode, 500, 'a DB failure must be distinguishable from an authz 403')
  assert.notEqual(res2.statusCode, 403)
})

test('(d2) /subject a Supabase subject-query error is NOT swallowed → 500', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprExportDeps() })
  installSupabase({ site: ROUTE_SITE, convError: { message: 'attributed_conversions read failed' } })
  installReader(okEvents(2))
  const res = mockRes()
  await subjectHandler(req(), res)
  assert.equal(res.statusCode, 500, 'a failed subject query must not yield a partial success bundle')
  assert.equal(res.body.success, false)
})

test('(400) /subject missing anonymous_id → 400', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprExportDeps() })
  installSupabase({ site: ROUTE_SITE })
  installReader(okEvents(0))
  const res = mockRes()
  await subjectHandler({ user: { id: 'u1' }, query: { site_key: 'sk_x' } }, res)
  assert.equal(res.statusCode, 400)
})
