// 🔴 STATIC ANTI-DRIFT — the compensating control for the #278 regression.
//
// The #278 bug: /summary's attributed_conversions SELECT referenced columns that DON'T EXIST
// (country/device/browser/landing_page — the table has only first_touch_*/last_touch_* variants).
// PostgREST rejected the query; the error was swallowed and rendered as "no conversions" ($0).
//
// WHY UNIT TESTS COULDN'T CATCH IT: analytics-summary-filter-scope.test.js mocks Supabase and returns
// fixtures REGARDLESS of the .select() string — a mock can never validate columns against the real
// schema. THIS test is the compensating control: it parses the REAL attributed_conversions column set
// from the baseline migration (+ ADD COLUMNs) and asserts that BOTH every CONVERSION_FILTER_COLUMN
// value AND every column in every attributed_conversions SELECT in analytics.js is a real column.
// A non-existent column fails CI here, not prod.

import test from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migDir = join(__dirname, '../../supabase/migrations')
const analyticsSrc = readFileSync(join(__dirname, '../routes/analytics.js'), 'utf8')

// Build the REAL attributed_conversions column set from the migrations (CREATE TABLE + ADD COLUMNs).
function realAttributedConversionsColumns () {
  const cols = new Set()
  for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migDir, f), 'utf8')
    // 1. CREATE TABLE [public.]attributed_conversions ( <col defs> );
    const create = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"?\w+"?\.)?"?attributed_conversions"?\s*\(([\s\S]*?)\n\)\s*;/i)
    if (create) {
      for (const line of create[1].split('\n')) {
        const cm = line.match(/^\s*"([a-z_][a-z0-9_]*)"\s+\S/i) // a column-def line: "name" type…
        if (cm) cols.add(cm[1])
      }
    }
    // 2. ALTER TABLE …attributed_conversions… ADD COLUMN [IF NOT EXISTS] <col>
    for (const stmt of sql.match(/ALTER TABLE[^;]*?attributed_conversions[^;]*;/gis) || []) {
      for (const m of stmt.matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) cols.add(m[1])
    }
  }
  return cols
}

test('sanity: the migration parser found the attributed_conversions schema', () => {
  const real = realAttributedConversionsColumns()
  for (const known of ['conversion_value', 'first_touch_channel', 'first_touch_source', 'first_touch_country', 'first_touch_device', 'first_touch_browser', 'first_touch_landing_page', 'ai_influenced_source']) {
    assert.ok(real.has(known), `parser should have found "${known}"`)
  }
  // and it must NOT invent the non-existent columns that caused #278
  for (const bad of ['country', 'device', 'browser', 'landing_page']) {
    assert.ok(!real.has(bad), `"${bad}" is NOT a real attributed_conversions column (this is the #278 trap)`)
  }
})

test('🔴 every CONVERSION_FILTER_COLUMN value is a real attributed_conversions column', async () => {
  const real = realAttributedConversionsColumns()
  const { CONVERSION_FILTER_COLUMN } = await import('../routes/analytics.js')
  for (const [type, col] of Object.entries(CONVERSION_FILTER_COLUMN)) {
    assert.ok(real.has(col), `CONVERSION_FILTER_COLUMN[${JSON.stringify(type)}] = "${col}" does not exist on attributed_conversions — filtering by it would silently match nothing`)
  }
})

test('🔴 every column in every attributed_conversions SELECT in analytics.js is a real column', () => {
  const real = realAttributedConversionsColumns()
  const selects = [...analyticsSrc.matchAll(/\.from\('attributed_conversions'\)\s*\.select\('([^']+)'\)/g)]
  assert.ok(selects.length > 0, 'located at least one attributed_conversions .select() in analytics.js')
  for (const s of selects) {
    for (const raw of s[1].split(',')) {
      const col = raw.trim()
      if (!col || col === '*' || col.includes('(')) continue // skip splats / embedded relations
      assert.ok(real.has(col), `analytics.js SELECTs "${col}" from attributed_conversions, which is not a real column (the #278 class: query errors -> swallowed -> renders as "no conversions")`)
    }
  }
})
