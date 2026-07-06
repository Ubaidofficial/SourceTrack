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
