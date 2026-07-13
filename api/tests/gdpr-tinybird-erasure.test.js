// GDPR Tinybird-erasure tests — TOKEN-FREE, NO NETWORK (fetch stubbed).
// Covers: delete_condition shape for BOTH datasources; admin-token-unset ->
// skip+audit (not crash); dry-run does NOT call the delete endpoint;
// injection-safe subject escaping.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDeleteCondition,
  buildSiteDeleteCondition,
  eraseSubjectFromTinybird,
  eraseSiteFromTinybird,
  TINYBIRD_ERASURE_DATASOURCES
} from '../../tinybird/adapter/erase.js'

const SITE = 'de200000-babe-41d4-a716-446655441111'
const SUBJECT = 'anon-visitor-123'

// A stub fetch that records every call and answers counts + deletes.
function makeFetch ({ count = 7 } = {}) {
  const calls = []
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url)
    calls.push({ url: u, method: opts.method || 'GET', auth: opts.headers?.Authorization, body: opts.body })
    if (u.includes('/v0/sql?q=')) {
      return { ok: true, json: async () => ({ data: [{ n: count }] }) }
    }
    if (u.includes('/delete')) {
      return { ok: true, json: async () => ({ job_id: 'job_abc' }) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  return { fetchImpl, calls }
}

// ── delete_condition shape ───────────────────────────────────────────────────

test('buildDeleteCondition: site-scoped, distinct_id OR visitor_id (no anonymous_id column)', () => {
  const c = buildDeleteCondition(SITE, SUBJECT)
  assert.equal(c, `site_id = '${SITE}' AND (distinct_id = '${SUBJECT}' OR visitor_id = '${SUBJECT}')`)
  assert.ok(!c.includes('anonymous_id'), 'must not reference a nonexistent anonymous_id column')
})

test('buildDeleteCondition: subject is escaped — injection cannot widen the delete', () => {
  const c = buildDeleteCondition(SITE, "x' OR '1'='1")
  // Doubled quotes -> the whole thing stays a string literal; no bare OR 1=1.
  assert.ok(c.includes("distinct_id = 'x'' OR ''1''=''1'"), c)
  assert.ok(!/OR '1'='1'\)/.test(c), 'unescaped injection must not survive')
})

test('buildDeleteCondition: throws on missing inputs', () => {
  assert.throws(() => buildDeleteCondition(SITE, ''))
  assert.throws(() => buildDeleteCondition('', SUBJECT))
})

// ── two-datasource coverage ──────────────────────────────────────────────────

test('the two erasure datasources are events + events_by_visitor', () => {
  assert.deepEqual(TINYBIRD_ERASURE_DATASOURCES, ['events', 'events_by_visitor'])
})

// ── dry-run (default) ────────────────────────────────────────────────────────

test('dry-run (confirm omitted): counts BOTH datasources, calls NO delete endpoint', async () => {
  const { fetchImpl, calls } = makeFetch({ count: 5 })
  const r = await eraseSubjectFromTinybird({
    host: 'https://api.tinybird.example', adminToken: 'admin-tok', siteId: SITE, subjectId: SUBJECT, fetchImpl
  })
  assert.equal(r.status, 'dry_run')
  assert.equal(r.perDatasource.length, 2)
  assert.deepEqual(r.perDatasource.map(d => d.datasource), ['events', 'events_by_visitor'])
  assert.ok(r.perDatasource.every(d => d.matched === 5 && d.executed === false))
  // Exactly two count queries, ZERO deletes.
  assert.equal(calls.filter(c => c.url.includes('/v0/sql?q=')).length, 2)
  assert.equal(calls.filter(c => c.url.includes('/delete')).length, 0)
})

// ── confirmed delete ─────────────────────────────────────────────────────────

test('confirm=true with admin token: deletes BOTH datasources with the admin Bearer + form body', async () => {
  const { fetchImpl, calls } = makeFetch({ count: 3 })
  const r = await eraseSubjectFromTinybird({
    host: 'https://api.tinybird.example', adminToken: 'admin-tok', siteId: SITE, subjectId: SUBJECT, confirm: true, fetchImpl
  })
  assert.equal(r.status, 'executed')
  assert.ok(r.perDatasource.every(d => d.executed === true && d.jobId === 'job_abc'))
  const deletes = calls.filter(c => c.url.includes('/delete'))
  assert.equal(deletes.length, 2)
  assert.ok(deletes.every(c => c.method === 'POST' && c.auth === 'Bearer admin-tok'))
  assert.ok(deletes.every(c => c.body.startsWith('delete_condition=')))
  assert.ok(deletes.some(c => c.url.includes('/v0/datasources/events/delete')))
  assert.ok(deletes.some(c => c.url.includes('/v0/datasources/events_by_visitor/delete')))
})

// ── admin-token-unset gate ───────────────────────────────────────────────────

test('confirm=true but NO admin token: skips the delete (skipped_no_admin_token), still counts, never crashes', async () => {
  const { fetchImpl, calls } = makeFetch({ count: 4 })
  const r = await eraseSubjectFromTinybird({
    host: 'https://api.tinybird.example', readToken: 'read-tok', adminToken: undefined,
    siteId: SITE, subjectId: SUBJECT, confirm: true, fetchImpl
  })
  assert.equal(r.status, 'skipped_no_admin_token')
  assert.match(r.reason, /TINYBIRD_ADMIN_TOKEN not configured/)
  assert.ok(r.perDatasource.every(d => d.executed === false && d.matched === 4))
  assert.equal(calls.filter(c => c.url.includes('/delete')).length, 0, 'no delete without admin token')
})

test('no host: skipped_not_configured, no network', async () => {
  const { fetchImpl, calls } = makeFetch()
  const r = await eraseSubjectFromTinybird({ host: '', adminToken: 'x', siteId: SITE, subjectId: SUBJECT, confirm: true, fetchImpl })
  assert.equal(r.status, 'skipped_not_configured')
  assert.equal(calls.length, 0)
})

// ── failure captured (not swallowed) ─────────────────────────────────────────

test('a delete failure yields status=failed (retryable), not a throw', async () => {
  const fetchImpl = async (url, opts = {}) => {
    if (String(url).includes('/v0/sql?q=')) return { ok: true, json: async () => ({ data: [{ n: 2 }] }) }
    return { ok: false, status: 500, json: async () => ({}) } // delete fails
  }
  const r = await eraseSubjectFromTinybird({
    host: 'https://h', adminToken: 'admin-tok', siteId: SITE, subjectId: SUBJECT, confirm: true, fetchImpl
  })
  assert.equal(r.status, 'failed')
  assert.ok(r.perDatasource.some(d => d.error && /500/.test(d.error)))
})

// ── SITE-WIDE erasure (GDPR /account) ────────────────────────────────────────

test('buildSiteDeleteCondition: whole-site, site-scoped only, no subject columns', () => {
  const c = buildSiteDeleteCondition(SITE)
  assert.equal(c, `site_id = '${SITE}'`)
  assert.ok(!c.includes('distinct_id') && !c.includes('visitor_id'), 'site erasure is not subject-scoped')
})

test('buildSiteDeleteCondition: siteId is escaped — cannot widen the delete', () => {
  const c = buildSiteDeleteCondition("x' OR '1'='1")
  assert.equal(c, `site_id = 'x'' OR ''1''=''1'`)
})

test('buildSiteDeleteCondition: throws on missing siteId', () => {
  assert.throws(() => buildSiteDeleteCondition(''))
})

test('site dry-run (confirm omitted): counts BOTH datasources, calls NO delete endpoint', async () => {
  const { fetchImpl, calls } = makeFetch({ count: 9 })
  const r = await eraseSiteFromTinybird({
    host: 'https://api.tinybird.example', adminToken: 'admin-tok', siteId: SITE, fetchImpl
  })
  assert.equal(r.status, 'dry_run')
  assert.equal(r.siteId, SITE)
  assert.equal(r.perDatasource.length, 2)
  assert.deepEqual(r.perDatasource.map(d => d.datasource), ['events', 'events_by_visitor'])
  assert.ok(r.perDatasource.every(d => d.matched === 9 && d.executed === false))
  assert.ok(r.perDatasource.every(d => d.condition === `site_id = '${SITE}'`))
  assert.equal(calls.filter(c => c.url.includes('/v0/sql?q=')).length, 2)
  assert.equal(calls.filter(c => c.url.includes('/delete')).length, 0)
})

test('site confirm=true with admin token: deletes BOTH datasources on the whole-site condition', async () => {
  const { fetchImpl, calls } = makeFetch({ count: 1000 })
  const r = await eraseSiteFromTinybird({
    host: 'https://api.tinybird.example', adminToken: 'admin-tok', siteId: SITE, confirm: true, fetchImpl
  })
  assert.equal(r.status, 'executed')
  assert.ok(r.perDatasource.every(d => d.executed === true && d.jobId === 'job_abc'))
  const deletes = calls.filter(c => c.url.includes('/delete'))
  assert.equal(deletes.length, 2)
  assert.ok(deletes.every(c => c.method === 'POST' && c.auth === 'Bearer admin-tok'))
  assert.ok(deletes.every(c => c.body === `delete_condition=${encodeURIComponent(`site_id = '${SITE}'`)}`))
})

test('site confirm=true but NO admin token: skips (skipped_no_admin_token), still counts, never crashes', async () => {
  const { fetchImpl, calls } = makeFetch({ count: 4 })
  const r = await eraseSiteFromTinybird({
    host: 'https://api.tinybird.example', readToken: 'read-tok', adminToken: undefined,
    siteId: SITE, confirm: true, fetchImpl
  })
  assert.equal(r.status, 'skipped_no_admin_token')
  assert.match(r.reason, /TINYBIRD_ADMIN_TOKEN not configured/)
  assert.ok(r.perDatasource.every(d => d.executed === false && d.matched === 4))
  assert.equal(calls.filter(c => c.url.includes('/delete')).length, 0)
})

test('site: no host -> skipped_not_configured, no network', async () => {
  const { fetchImpl, calls } = makeFetch()
  const r = await eraseSiteFromTinybird({ host: '', adminToken: 'x', siteId: SITE, confirm: true, fetchImpl })
  assert.equal(r.status, 'skipped_not_configured')
  assert.equal(calls.length, 0)
})

test('site: a delete failure yields status=failed (retryable), not a throw', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/v0/sql?q=')) return { ok: true, json: async () => ({ data: [{ n: 2 }] }) }
    return { ok: false, status: 500, json: async () => ({}) }
  }
  const r = await eraseSiteFromTinybird({
    host: 'https://h', adminToken: 'admin-tok', siteId: SITE, confirm: true, fetchImpl
  })
  assert.equal(r.status, 'failed')
  assert.ok(r.perDatasource.some(d => d.error && /500/.test(d.error)))
})

// ══════════════════════════════════════════════════════════════════════════════
// GDPR ROUTE WIRING (a–g) — /visitor + /account actually call the eraser, audit every
// attempt to erasure_log, and NEVER lie. The eraser is mocked via the route seam;
// Supabase is a chainable stub. (d)/(e)/(f2) are load-bearing: they fail if a blanket
// success:true is reinstated.
// ══════════════════════════════════════════════════════════════════════════════
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'mock-service-role-key-value'
const { readFileSync } = await import('node:fs')
const { gdprRouter, __setGdprEraseDeps, __resetGdprEraseDeps } = await import('../routes/gdpr.js')
const { getSupabase } = await import('../lib/supabase.js')

const handlerFor = (path) => {
  const layer = gdprRouter.stack.find(l => l.route?.path === path && l.route?.methods?.delete)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const visitorHandler = handlerFor('/visitor')
const accountHandler = handlerFor('/account')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const _client = getSupabase()
const _realFrom = _client.from
const _realAuth = _client.auth

// Chainable Supabase stub. `seq` records deletes in order (to prove the site erase runs
// BEFORE the sites delete); erasureInserts captures every erasure_log row.
function installSupabase (cfg) {
  const seq = []
  const erasureInserts = []
  const result = (table, mode) => {
    if (table === 'company_members') return mode === 'maybeSingle' ? { data: cfg.memberRow ?? null } : { data: cfg.members ?? [], count: cfg.count ?? 0 }
    if (table === 'sites') return mode === 'maybeSingle' ? { data: cfg.site ?? null, error: cfg.siteError ?? null } : { data: cfg.sites ?? [] }
    if (table === 'site_identity_links') return { data: cfg.links ?? [] }
    return { data: [], error: null, count: cfg.count ?? 0 }
  }
  const selChain = (table) => {
    const b = {
      eq: () => b, in: () => b, limit: () => b, order: () => b, neq: () => b, gte: () => b, select: () => b,
      maybeSingle: async () => result(table, 'maybeSingle'),
      single: async () => result(table, 'single'),
      then: (res, rej) => Promise.resolve(result(table, 'await')).then(res, rej)
    }
    return b
  }
  const delChain = (table) => {
    const b = { eq: () => b, in: () => b, then: (res) => { seq.push(`delete:${table}`); return Promise.resolve({ error: null }).then(res) } }
    return b
  }
  _client.from = (table) => ({
    select: () => selChain(table),
    delete: () => delChain(table),
    insert: (row) => { if (table === 'erasure_log') erasureInserts.push(row); return Promise.resolve({ error: null }) }
  })
  _client.auth = { admin: { deleteUser: async () => ({ error: null }) } }
  return { seq, erasureInserts }
}
function restoreSupabase () { _client.from = _realFrom; _client.auth = _realAuth }

// Eraser mock: captures call args + an ordering marker; returns the configured status.
function installEraser (seq, statusByCall) {
  const calls = []
  let i = 0
  const mk = (kind) => async (args) => {
    calls.push({ kind, ...args })
    if (seq) seq.push(`erase:${args.siteId}`)
    const status = Array.isArray(statusByCall) ? (statusByCall[i++] ?? 'executed') : statusByCall
    return { status, subjectId: args.subjectId, siteId: args.siteId, datasources: ['events', 'events_by_visitor'], perDatasource: [{ datasource: 'events', matched: 3 }, { datasource: 'events_by_visitor', matched: 3 }], reason: status === 'skipped_no_admin_token' ? 'TINYBIRD_ADMIN_TOKEN not configured' : null }
  }
  __setGdprEraseDeps({ eraseSubject: mk('subject'), eraseSite: mk('site') })
  return calls
}

const visitorReq = () => ({ user: { id: 'u1' }, body: { site_key: 'sk_x', anonymous_id: 'anon-9' } })
const ROUTE_SITE = { id: 'site-1', site_key: 'sk_x', owner_id: 'u1', company_id: null, plan: 'growth' }

test('(a) /visitor erases via Tinybird with the exact site.id + anonymous_id (confirm:true)', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprEraseDeps() })
  installSupabase({ site: ROUTE_SITE, links: [] })
  const calls = installEraser(null, 'executed')
  await visitorHandler(visitorReq(), mockRes())
  assert.equal(calls.length, 1)
  assert.equal(calls[0].kind, 'subject')
  assert.equal(calls[0].siteId, 'site-1', 'exact site.id')
  assert.equal(calls[0].subjectId, 'anon-9', 'exact anonymous_id')
  assert.equal(calls[0].confirm, true, 'confirm:true — a real delete, not a dry run')
})

test('(b) /visitor writes an erasure_log audit row with the returned status', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprEraseDeps() })
  const { erasureInserts } = installSupabase({ site: ROUTE_SITE, links: [] })
  installEraser(null, 'executed')
  await visitorHandler(visitorReq(), mockRes())
  assert.equal(erasureInserts.length, 1, 'exactly one audit row')
  const row = erasureInserts[0]
  assert.equal(row.subject_id, 'anon-9')
  assert.equal(row.site_id, 'site-1')
  assert.equal(row.status, 'executed')
  assert.deepEqual(row.datasources, ['events', 'events_by_visitor'])
  assert.deepEqual(row.row_counts, { events: 3, events_by_visitor: 3 })
  assert.ok(row.executed_at, 'executed_at set on an executed erase')
})

test('(c) /visitor status=executed -> response claims erasure', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprEraseDeps() })
  installSupabase({ site: ROUTE_SITE, links: [] })
  installEraser(null, 'executed')
  const res = mockRes()
  await visitorHandler(visitorReq(), res)
  assert.equal(res.body.success, true)
  assert.match(res.body.message, /has been erased/i)
})

test('🔴 (d) /visitor status=failed -> response does NOT claim erasure (load-bearing)', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprEraseDeps() })
  const { erasureInserts } = installSupabase({ site: ROUTE_SITE, links: [] })
  installEraser(null, 'failed')
  const res = mockRes()
  await visitorHandler(visitorReq(), res)
  assert.equal(res.body.success, false, 'a blanket success:true here would be the LIE — must be false')
  assert.doesNotMatch(res.body.message, /has been erased|permanently deleted/i, 'must not claim erasure')
  assert.equal(erasureInserts[0].status, 'failed', 'the failure is audited for retry')
  assert.equal(erasureInserts[0].executed_at, null, 'no executed_at on a failed erase')
})

test('🔴 (e) /visitor status=skipped_no_admin_token -> response does NOT claim erasure (load-bearing)', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprEraseDeps() })
  const { erasureInserts } = installSupabase({ site: ROUTE_SITE, links: [] })
  installEraser(null, 'skipped_no_admin_token')
  const res = mockRes()
  await visitorHandler(visitorReq(), res)
  assert.equal(res.body.success, false)
  assert.doesNotMatch(res.body.message, /has been erased|permanently deleted/i)
  assert.equal(res.body.tinybird_status, 'skipped_no_admin_token')
  assert.equal(erasureInserts[0].status, 'skipped_no_admin_token')
})

test('(f) /account erases each site via Tinybird BEFORE the sites delete, once per site', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprEraseDeps() })
  const { seq, erasureInserts } = installSupabase({ memberRow: null, sites: [{ id: 'site-a' }, { id: 'site-b' }] })
  const calls = installEraser(seq, 'executed')
  const res = mockRes()
  await accountHandler({ user: { id: 'u1' } }, res)

  const siteCalls = calls.filter(c => c.kind === 'site')
  assert.equal(siteCalls.length, 2, 'one erase per site')
  assert.deepEqual(siteCalls.map(c => c.siteId).sort(), ['site-a', 'site-b'])
  assert.ok(siteCalls.every(c => c.confirm === true), 'confirm:true')
  const sitesDeleteIdx = seq.indexOf('delete:sites')
  assert.ok(sitesDeleteIdx >= 0, 'sites were deleted')
  assert.ok(seq.filter(s => s.startsWith('erase:')).length === 2 && seq.lastIndexOf('erase:site-b') < sitesDeleteIdx && seq.lastIndexOf('erase:site-a') < sitesDeleteIdx, 'every erase precedes delete:sites')
  assert.equal(erasureInserts.length, 2, 'one erasure_log row per site')
  assert.deepEqual(erasureInserts.map(r => r.site_id).sort(), ['site-a', 'site-b'])
  assert.ok(erasureInserts.every(r => r.subject_id === 'account:u1'))
  assert.equal(res.body.success, true, 'all executed -> full-deletion claim is honest')
})

test('🔴 (f2) /account with a non-executed site -> response does NOT claim full erasure (load-bearing)', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprEraseDeps() })
  const { seq } = installSupabase({ memberRow: null, sites: [{ id: 'site-a' }, { id: 'site-b' }] })
  installEraser(seq, ['executed', 'failed'])
  const res = mockRes()
  await accountHandler({ user: { id: 'u1' } }, res)
  assert.equal(res.body.success, false, 'must not claim full deletion when a site event-erase failed')
  assert.doesNotMatch(res.body.message, /permanently deleted/i)
})

test('🔴 (i) getSiteForUser DB error -> route returns 500, NOT 403 (load-bearing: fails if the error is swallowed)', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprEraseDeps() })
  // The sites lookup fails at the DB (e.g. a dropped column). If getSiteForUser swallows
  // the error and returns null, the route answers 403 "access denied" — masking an outage
  // as a permissions bug. This test pins the fix: a DB failure surfaces as 500.
  installSupabase({ site: null, siteError: { message: 'column sites.posthog_site_id does not exist' } })
  const calls = installEraser(null, 'executed') // must never be reached
  const res = mockRes()
  await visitorHandler(visitorReq(), res)
  assert.equal(res.statusCode, 500, 'a DB error must surface as 500, not be swallowed')
  assert.notEqual(res.statusCode, 403, 'DB failure must be distinguishable from an authorization failure')
  assert.equal(calls.length, 0, 'no erase attempted when the site lookup errored')
})

test('(g) the dead-store PostHog-person delete is removed from gdpr.js', () => {
  const src = readFileSync(new URL('../routes/gdpr.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /deletePostHogPerson/, 'no reference to the removed PostHog-person delete')
  assert.doesNotMatch(src, /POSTHOG_PERSONAL_API_KEY/, 'no PostHog person REST call remains')
})

// ── (h) multi-member workspace: sites are NOT deleted -> event data is NOT erased ──
// The ONLY test that exercises shouldDeleteSites=false. _eraseSite is correctly nested
// inside that guard; this test FAILS if it is ever hoisted out — which would wipe the
// event data of a shared workspace whose OTHER members still use it.
test('🔴 (h) /account multi-member (not sole admin): NO site delete, ZERO eraseSite calls, no erasure_log, no event-erasure claim', async (t) => {
  t.after(() => { restoreSupabase(); __resetGdprEraseDeps() })
  const { seq, erasureInserts } = installSupabase({
    memberRow: { company_id: 'co1', role: 'member' },              // caller is a plain member…
    members: [{ user_id: 'u1', role: 'member' }, { user_id: 'u2', role: 'admin' }], // …workspace has others (len>1, an admin remains) -> no 409
    sites: [{ id: 'shared-site-1' }]                               // the shared workspace HAS a site — which a hoisted _eraseSite WOULD wrongly erase
  })
  const calls = installEraser(seq, 'executed') // status irrelevant: must never be called
  const res = mockRes()
  await accountHandler({ user: { id: 'u1' } }, res)

  assert.equal(calls.filter(c => c.kind === 'site').length, 0, 'eraseSite must NOT run when the shared sites are not deleted')
  assert.ok(!seq.includes('delete:sites'), 'the shared workspace sites are NOT deleted')
  assert.equal(erasureInserts.length, 0, 'no erasure_log row — nothing was erased')
  assert.deepEqual(res.body.tinybird ?? [], [], 'response claims NO Tinybird/event-data erasure')
})
