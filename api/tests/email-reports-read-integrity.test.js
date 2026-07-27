// The #278-class bug, recurring in api/jobs/email-reports.js: its attributed_conversions
// SELECT named `ai_source`, a column that only exists on `pageviews` — the real column here
// is `ai_influenced_source` (see analytics.js, journey.js, leads-server.js, nightly-attribution.js).
// The call had no error binding, so PostgREST's rejection of the whole select was invisible:
// `conversions` came back undefined, `rows = conversions || []` silently became [], and the
// weekly/monthly report rendered totalRevenue=$0, totalConversions=0, and (because the PRIOR
// period query was valid) "Rev: -100.0% / Conv: -100.0%" — a fabricated number, every site,
// every week (§6: no fake zeros).
//
// This is the same anti-drift shape as analytics-conversion-columns.test.js's static check,
// reused here for email-reports.js's own SELECT (that file's parser isn't exported, so this
// duplicates the same migration-parsing approach rather than importing across test files).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migDir = join(__dirname, '../../supabase/migrations')
const emailReportsSrc = readFileSync(join(__dirname, '../jobs/email-reports.js'), 'utf8')
// Comment-stripped view, for the static guards below. The fix's own comments quote the OLD
// buggy calls verbatim to explain them, so a raw-source regex matches the prose and reports a
// bug that is not in the code. Guards must assert on what RUNS, not on what is described.
const emailReportsCode = emailReportsSrc
  .split('\n')
  .filter(l => !l.trim().startsWith('//'))
  .join('\n')

// Build the REAL attributed_conversions column set from the migrations (CREATE TABLE + ADD COLUMNs).
// Same approach as analytics-conversion-columns.test.js's realAttributedConversionsColumns().
function realAttributedConversionsColumns () {
  const cols = new Set()
  for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migDir, f), 'utf8')
    const create = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"?\w+"?\.)?"?attributed_conversions"?\s*\(([\s\S]*?)\n\)\s*;/i)
    if (create) {
      for (const line of create[1].split('\n')) {
        const cm = line.match(/^\s*"([a-z_][a-z0-9_]*)"\s+\S/i)
        if (cm) cols.add(cm[1])
      }
    }
    for (const stmt of sql.match(/ALTER TABLE[^;]*?attributed_conversions[^;]*;/gis) || []) {
      for (const m of stmt.matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) cols.add(m[1])
    }
  }
  return cols
}

test('sanity: the migration parser found the attributed_conversions schema (and channel is real)', () => {
  const real = realAttributedConversionsColumns()
  for (const known of ['conversion_value', 'channel', 'first_touch_source', 'ai_influenced_source']) {
    assert.ok(real.has(known), `parser should have found "${known}"`)
  }
  assert.ok(!real.has('ai_source'), '"ai_source" is NOT a real attributed_conversions column (the phantom-column trap)')
})

test('🔴 every column in every attributed_conversions SELECT in email-reports.js is a real column', () => {
  const real = realAttributedConversionsColumns()
  const selects = [...emailReportsSrc.matchAll(/\.from\('attributed_conversions'\)\s*\.select\('([^']+)'\)/g)]
  assert.ok(selects.length > 0, 'located at least one attributed_conversions .select() in email-reports.js')
  for (const s of selects) {
    for (const raw of s[1].split(',')) {
      const col = raw.trim()
      if (!col || col === '*' || col.includes('(')) continue
      assert.ok(real.has(col), `email-reports.js SELECTs "${col}" from attributed_conversions, which is not a real column (query gets rejected by PostgREST -> swallowed -> renders as a fabricated -100%)`)
    }
  }
})

// ── Behavioural: a conversions-read error must skip the site, never send a fabricated report ──

function buildStub ({ sites, member, user, conversionsError, memberError, authError }) {
  const thenable = (result) => {
    const b = {}
    for (const m of ['select', 'eq', 'gte', 'lte']) b[m] = () => b
    b.then = (resolve) => resolve(result)
    return b
  }
  const maybeSingleChain = (result) => {
    const b = {}
    for (const m of ['select', 'eq']) b[m] = () => b
    b.maybeSingle = () => Promise.resolve(result)
    return b
  }
  return {
    // auth.users is reachable only through the admin API, never through .from().
    auth: { admin: { getUserById: async () => (authError ? { data: null, error: { message: 'mock auth failure' } } : { data: { user }, error: null }) } },
    from (table) {
      if (table === 'sites') return thenable({ data: sites, error: null })
      if (table === 'company_members') return maybeSingleChain(memberError ? { data: null, error: { message: 'mock member failure' } } : { data: member, error: null })
      // NO 'users' branch on purpose. Owner emails come from auth.users via the admin API
      // (auth.admin.getUserById below); public.users does not exist in this database. If the
      // job ever goes back to .from('users'), the `unexpected table` throw below fires.
      if (table === 'attributed_conversions') {
        return thenable(conversionsError ? { data: null, error: { message: 'mock read failure' } } : { data: [], error: null })
      }
      if (table === 'job_runs') return { insert: () => Promise.resolve({ error: null }) }
      throw new Error(`unexpected table in test stub: ${table}`)
    }
  }
}

test('🔴 behavioural: attributed_conversions read error must NOT send a report for that site', async () => {
  const { __setSupabaseClient, __resetSupabaseClient } = await import('../lib/supabase.js')
  const { run } = await import('../jobs/email-reports.js')

  __setSupabaseClient(buildStub({
    sites: [{ id: 'site-1', site_key: 'sk_test', domain: 'example.com', name: 'Test Site', owner_id: 'owner-1', company_id: 'co-1', plan: 'growth', trial_ends_at: null }],
    member: { user_id: 'owner-1' },
    user: { email: 'owner@example.com' },
    conversionsError: true
  }))

  const originalFetch = globalThis.fetch
  const originalExit = process.exit
  let sendAttempted = false
  globalThis.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('resend.com')) sendAttempted = true
    return { ok: true, text: async () => '', json: async () => ({}) }
  }
  process.exit = () => {}

  try {
    await run()
  } finally {
    globalThis.fetch = originalFetch
    process.exit = originalExit
    __resetSupabaseClient()
  }

  assert.equal(sendAttempted, false, 'a conversions read error must skip the site, not send a report built on a swallowed error')
})

// ── Owner resolution: auth.users via the admin API, and company_id keyed off the COMPANY ──
//
// The job read `.from('users')` — public.users, which DOES NOT EXIST in this database (only
// auth.users does). No error binding, so every site of every run resolved to "no owner email"
// and skipped: that is why job_runs recorded Sent 0 forever. It never crashed.

async function runJob (stubOpts) {
  const { __setSupabaseClient, __resetSupabaseClient } = await import('../lib/supabase.js')
  const { run } = await import('../jobs/email-reports.js')
  __setSupabaseClient(buildStub(stubOpts))
  const originalFetch = globalThis.fetch
  const originalExit = process.exit
  let sendAttempted = false
  globalThis.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('resend.com')) sendAttempted = true
    return { ok: true, text: async () => '', json: async () => ({}) }
  }
  process.exit = () => {}
  try { await run() } finally {
    globalThis.fetch = originalFetch
    process.exit = originalExit
    __resetSupabaseClient()
  }
  return sendAttempted
}

const HEALTHY = {
  sites: [{ id: 'site-1', site_key: 'sk_test', domain: 'example.com', name: 'Test Site', owner_id: 'owner-1', company_id: 'co-1', plan: 'growth', trial_ends_at: null }],
  member: { user_id: 'owner-1' },
  user: { email: 'owner@example.com' }
}

test('🔴 the fix: a resolvable owner now actually reaches the send (was Sent 0 forever)', async () => {
  const sendAttempted = await runJob({ ...HEALTHY })
  assert.equal(sendAttempted, true,
    'owner email must resolve via auth.admin.getUserById — with .from(\'users\') this never got past "no owner email"')
})

test('🔴 an auth lookup FAILURE is surfaced, not reported as "no owner email"', async () => {
  const sendAttempted = await runJob({ ...HEALTHY, authError: true })
  assert.equal(sendAttempted, false, 'a failed auth read must never send')
})

test('🔴 a company_members lookup FAILURE is surfaced, not treated as "no team"', async () => {
  const sendAttempted = await runJob({ ...HEALTHY, memberError: true })
  assert.equal(sendAttempted, false, 'a failed members read must never send')
})

test('🔴 ANTI-REGRESSION: email-reports.js must never query public.users again', () => {
  assert.ok(!/\.from\(['"]users['"]\)/.test(emailReportsCode),
    "email-reports.js queries .from('users') — public.users does not exist; owner emails come from auth.admin.getUserById")
  assert.ok(/auth\.admin\.getUserById/.test(emailReportsCode),
    'email-reports.js must resolve the owner email through the auth admin API')
})

test('🔴 ANTI-REGRESSION: company_members is keyed on site.company_id, never site.id', () => {
  assert.ok(!/\.eq\('company_id',\s*site\.id\)/.test(emailReportsCode),
    "company_members.company_id was compared against a SITE id — it must be site.company_id")
  assert.ok(/\.eq\('company_id',\s*site\.company_id\)/.test(emailReportsCode),
    'the members lookup must filter on site.company_id')
  assert.ok(/\.select\('id, site_key, domain, name, owner_id, company_id/.test(emailReportsCode),
    'company_id must be SELECTed on sites, or site.company_id is undefined and the filter matches nothing')
})
