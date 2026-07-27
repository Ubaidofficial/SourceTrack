// GDPR Art. 15 (GET /api/gdpr/subject) — the two phantom columns that 500'd the endpoint.
//
// DEFECT: gdpr.js selected `lead_qualifications.updated_at` and
// `subscription_identity.created_at`. NEITHER EXISTS. Verified read-only against live prod
// (zxjjjsipafojhzkkumvh) 2026-07-27 — the migration file is stale on this specific point,
// so the schema below is transcribed from information_schema, not from the repo:
//   lead_qualifications  : id, site_id, visitor_id, qualified, qualified_by, qualified_at,
//                          notes, status, created_at            (NO updated_at)
//   subscription_identity: id, site_id, stripe_customer_id, first_touch_source,
//                          first_touch_channel, first_touch_campaign, last_touch_source,
//                          last_touch_channel, attribution_status, anonymous_id,
//                          first_subscription_id, source_conversion_id, captured_at,
//                          source_locked_at                     (NO created_at)
// PostgREST rejects the WHOLE select for one unknown column, and both call sites
// `throw qualErr` / `throw subErr`, so the subject-access request 500s outright. A data
// subject exercising Art. 15 got an error instead of their data.
//
// WHY A SCHEMA-AWARE STUB. The existing installSupabase in gdpr-subject-export.test.js does
// `select: () => b` — it ignores the select string entirely, so it returns fixtures for a
// query PostgREST would reject. That is KNOWN_ISSUES #16 exactly, and it is why this class of
// bug keeps shipping. The stub below PARSES the select list and answers with a real
// PostgREST 42703 error for any column not in the verified schema, so the test can actually
// go RED. A fixture-returning stub would have passed against the broken code.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { getSupabase } = await import('../lib/supabase.js')
const { gdprRouter, __setGdprExportDeps, __resetGdprExportDeps } = await import('../routes/gdpr.js')

// Verified against live prod 2026-07-27. Only the two in-scope tables are enforced; every
// other table passes through unvalidated so this stays surgical.
const PROD_SCHEMA = {
  lead_qualifications: new Set([
    'id', 'site_id', 'visitor_id', 'qualified', 'qualified_by', 'qualified_at', 'notes',
    'status', 'created_at'
  ]),
  subscription_identity: new Set([
    'id', 'site_id', 'stripe_customer_id', 'first_touch_source', 'first_touch_channel',
    'first_touch_campaign', 'last_touch_source', 'last_touch_channel', 'attribution_status',
    'anonymous_id', 'first_subscription_id', 'source_conversion_id', 'captured_at',
    'source_locked_at'
  ])
}

const SITE = { id: 'de200000-babe-41d4-a716-446655441111', site_key: 'sk_test' }
const SUBJECT = 'anon-visitor-123'

// The seeded subject: one lead_qualifications row and one subscription_identity row.
const QUAL_ROW = { visitor_id: SUBJECT, status: 'sql', qualified: true, created_at: '2026-07-01T00:00:00Z' }
const SUB_ROW = {
  anonymous_id: SUBJECT, stripe_customer_id: 'cus_123', first_subscription_id: 'sub_123',
  first_touch_source: 'google', first_touch_channel: 'Organic Search', captured_at: '2026-07-02T00:00:00Z'
}

const _client = getSupabase()
const _realFrom = _client.from

// Mirrors PostgREST: one unknown column rejects the ENTIRE query with 42703.
function installSchemaAwareSupabase () {
  const rowsFor = (table) => {
    if (table === 'sites') return SITE
    if (table === 'lead_qualifications') return [QUAL_ROW]
    if (table === 'subscription_identity') return [SUB_ROW]
    if (table === 'company_members') return null
    return []
  }
  const resolve = (table, selectStr) => {
    const schema = PROD_SCHEMA[table]
    if (schema && selectStr) {
      const cols = selectStr.split(',').map(c => c.trim()).filter(Boolean)
      const bad = cols.find(c => !schema.has(c))
      if (bad) {
        return {
          data: null,
          error: { code: '42703', message: `column ${table}.${bad} does not exist`, details: null, hint: null }
        }
      }
    }
    return { data: rowsFor(table), error: null }
  }
  _client.from = (table) => {
    let selectStr = null
    const b = {
      select: (s) => { if (typeof s === 'string') selectStr = s; return b },
      eq: () => b, in: () => b, or: () => b, limit: () => b, order: () => b,
      maybeSingle: async () => {
        const r = resolve(table, selectStr)
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
      },
      single: async () => {
        const r = resolve(table, selectStr)
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
      },
      then: (res, rej) => Promise.resolve(resolve(table, selectStr)).then(res, rej)
    }
    return b
  }
}
function restoreSupabase () { _client.from = _realFrom; __resetGdprExportDeps() }

// Event store served fine — this test is about the Supabase selects, not Tinybird.
function installTinybird () {
  __setGdprExportDeps({ fetchSubjectEvents: async () => ({ status: 'ok', rows: [], count: 0, capped: false }) })
}

const subjectHandler = (() => {
  const layer = gdprRouter.stack.find(l => l.route?.path === '/subject' && l.route?.methods?.get)
  assert.ok(layer, 'GET /gdpr/subject must exist')
  return layer.route.stack[layer.route.stack.length - 1].handle
})()

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const req = () => ({
  query: { site_key: SITE.site_key, anonymous_id: SUBJECT },
  user: { id: 'user-1', role: 'super_admin' }
})

// ── the defect ────────────────────────────────────────────────────────────────

test('GET /gdpr/subject returns 200, not 500, for a subject with qualification + subscription rows', async (t) => {
  t.after(restoreSupabase)
  installSchemaAwareSupabase()
  installTinybird()

  const res = mockRes()
  await subjectHandler(req(), res)

  assert.notStrictEqual(res.statusCode, 500,
    'a phantom column rejects the whole select and 500s the Art. 15 endpoint — the subject gets an ' +
    'error instead of their data')
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.success, true)
})

test('both seeded rows actually APPEAR in the Art. 15 response', async (t) => {
  t.after(restoreSupabase)
  installSchemaAwareSupabase()
  installTinybird()

  const res = mockRes()
  await subjectHandler(req(), res)
  assert.strictEqual(res.statusCode, 200, 'must not 500 before we can assert disclosure')

  const sources = res.body?.sources || {}
  const quals = sources.lead_qualifications?.rows || []
  const subs = sources.subscription_identity?.rows || []

  assert.strictEqual(quals.length, 1, 'the lead_qualifications row must be disclosed (Art. 15 must match what /visitor erases)')
  assert.strictEqual(quals[0].visitor_id, SUBJECT)
  assert.strictEqual(quals[0].status, 'sql')

  assert.strictEqual(subs.length, 1, 'the subscription_identity row must be disclosed')
  assert.strictEqual(subs[0].anonymous_id, SUBJECT)
  assert.strictEqual(subs[0].stripe_customer_id, 'cus_123')
  // Rows pass through raw (no field mapping), so the real column name is what surfaces.
  assert.strictEqual(subs[0].captured_at, '2026-07-02T00:00:00Z',
    'subscription_identity timestamps surface as captured_at — there is no created_at on this table')
})

// ── static guard: neither phantom column may come back ────────────────────────

test('gdpr.js selects no column that does not exist on prod', () => {
  // Strip comments first: an assertion a comment can satisfy proves nothing (#422).
  const src = readFileSync(join(ROOT, 'api/routes/gdpr.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  for (const [table, schema] of Object.entries(PROD_SCHEMA)) {
    const re = new RegExp(`\\.from\\('${table}'\\)([\\s\\S]{0,300}?)\\.select\\('([^']+)'\\)`, 'g')
    let m, found = 0
    while ((m = re.exec(src)) !== null) {
      found++
      for (const c of m[2].split(',').map(s => s.trim()).filter(Boolean)) {
        assert.ok(schema.has(c),
          `gdpr.js selects phantom column "${c}" from ${table} — PostgREST rejects the entire query, ` +
          'which 500s the Art. 15 endpoint')
      }
    }
    assert.ok(found > 0, `expected a ${table} select in gdpr.js`)
  }
})
