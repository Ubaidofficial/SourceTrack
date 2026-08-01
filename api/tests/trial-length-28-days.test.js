// Trial length = 28 days, in every place that states or computes it.
//
// WHY THIS TEST EXISTS AND NOT JUST A DIFF: the trial length is FOUR independent sources of
// truth — the DB column default, api/middleware/auth.js's TRIAL_DAYS fallback,
// dashboard/src/lib/billing.js's fallback (the number the customer reads on Settings), and
// the marketing copy. #500 proved they can disagree silently: copy said one thing while the
// system granted another, and nothing failed. Two of the four (billing.js, and the
// qa-billing-helper fixtures) were NOT in this task's stated scope and were found by
// grepping rather than by being told, which is precisely the argument for pinning all of
// them mechanically.
//
// The negative half is the load-bearing half: a NEW 14-day claim added anywhere later must
// fail here, not ship.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..')
const read = (p) => readFileSync(join(REPO, p), 'utf8')

// ── 1. The eight positive locations, each asserted by its own exact string ────────────
// Counted, not just "contains": sections/pricing.md carries TWO CTA labels (Starter and
// Growth). A single-occurrence check there would pass with one card left at 14.
const EXPECTED = [
  ['api/middleware/auth.js', 'const TRIAL_DAYS = 28', 1],
  ['api/middleware/tier-check.js', 'Your 28-day trial has ended.', 1],
  ['api/routes/analytics.js', 'Your 28-day trial has ended.', 1],
  ['api/tests/billing-middleware.test.js', 'Your 28-day trial has ended.', 1],
  ['dashboard/src/lib/billing.js', '28 * 24 * 60 * 60 * 1000', 1],
  ['marketing/src/content/homepage/-index.md', 'Start 28-day free trial', 1],
  ['marketing/src/content/sections/call-to-action.md', 'Start 28-day free trial', 1],
  ['marketing/src/content/sections/pricing.md', 'Start 28-day free trial', 2],
  // Moved out of solutions/saas.astro when that page's CTA became content-backed — the string
  // itself is unchanged, only its home.
  ['marketing/src/content/standalone/solutions/saas.md', 'Start 28-day free trial', 1],
  ['marketing/src/content/sections/faq.md', 'starts on a 28-day trial', 1]
]

for (const [file, needle, count] of EXPECTED) {
  test(`🟢 ${file} states the 28-day trial (${count}×)`, () => {
    const actual = read(file).split(needle).length - 1
    assert.strictEqual(actual, count, `expected ${count} occurrence(s) of "${needle}" in ${file}, found ${actual}`)
  })
}

test('🟢 the migration sets the DB default to 28 days', () => {
  const sql = read('supabase/migrations/20260730000000_trial_length_28_days.sql')
  assert.match(sql, /set default \(now\(\) \+ '28 days'::interval\)/)
  // Going-forward only: a back-fill would be an UPDATE against existing rows.
  assert.ok(!/^\s*update\s+public\.sites/im.test(sql), 'the migration must not back-fill existing trials')
})

// ── 2. The negative scan — no live 14-day trial claim survives anywhere ───────────────
// Walks real source trees. Every exclusion below is a NON-claim, justified inline; the
// point is that none of them is a statement about how long a trial lasts.
const SCAN_DIRS = ['api', 'dashboard/src', 'marketing/src', 'scripts', 'tracker']
const SCAN_EXT = /\.(js|jsx|ts|tsx|astro|md|mjs)$/
const SKIP_DIR = /node_modules|dist|\.astro|coverage/

// A "14-day trial claim" is 14 adjacent to day/days adjacent to trial-ish wording. Kept
// narrow on purpose: a broad /14/ would match hundreds of unrelated numbers and the test
// would rot into an ignore-list.
const CLAIM = /(?:14[-\s]day|14\s+days?)[^.\n]{0,40}?(?:trial|free)|(?:trial|free)[^.\n]{0,40}?(?:14[-\s]day|14\s+days?)/i

// Files where a bare "14 days" is a DATE-RANGE or SQL WINDOW, not a trial length.
const NOT_A_TRIAL_CLAIM = new Set([
  'dashboard/src/pages/ReportBuilder.jsx', // report date-range option: { value: '14', label: '14 days' }
  'dashboard/src/pages/Settings.jsx',      // attribution-window <option value={14}>14 days</option>
  'api/routes/alerts.js',                  // ClickHouse INTERVAL 14 DAY (week-over-week window)
  'api/routes/dashboard.js',               // same
  'api/routes/integrations.js'             // same
])

function walk (dir, out = []) {
  let entries
  try { entries = readdirSync(join(REPO, dir)) } catch { return out }
  for (const name of entries) {
    const rel = `${dir}/${name}`
    if (SKIP_DIR.test(rel)) continue
    const abs = join(REPO, rel)
    let st
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) walk(rel, out)
    else if (SCAN_EXT.test(name)) out.push(rel)
  }
  return out
}

const scanned = SCAN_DIRS.flatMap(d => walk(d))

test('🔴 the scan is not vacuous — it visited a real number of files', () => {
  // Guards the whole negative half: a broken walk() would make the next test pass by
  // examining nothing, which is exactly the silent-success class this repo keeps hitting.
  assert.ok(scanned.length > 300, `expected the scan to visit >300 files, it visited ${scanned.length}`)
  assert.ok(scanned.includes('marketing/src/content/sections/pricing.md'), 'the scan missed a file it must cover')
  assert.ok(scanned.includes('api/middleware/auth.js'), 'the scan missed a file it must cover')
})

test('🔴 NO live 14-day trial claim survives anywhere in the scanned tree', () => {
  const offenders = []
  for (const rel of scanned) {
    if (NOT_A_TRIAL_CLAIM.has(rel)) continue
    // This test file necessarily contains the pattern it hunts for.
    if (rel === 'api/tests/trial-length-28-days.test.js') continue
    const src = read(rel)
    for (const [i, line] of src.split('\n').entries()) {
      if (CLAIM.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`)
    }
  }
  assert.deepStrictEqual(offenders, [], `live 14-day trial claim(s) still present:\n  ${offenders.join('\n  ')}`)
})

test('🔴 every NOT_A_TRIAL_CLAIM exclusion still exists and still matches (no stale ignores)', () => {
  // Same discipline as test-registration-guard.test.js: an exclusion that no longer applies
  // is an ignore-list entry quietly widening over time.
  for (const rel of NOT_A_TRIAL_CLAIM) {
    let src
    assert.doesNotThrow(() => { src = read(rel) }, `excluded file ${rel} no longer exists`)
    assert.ok(/14/.test(src), `${rel} no longer contains "14" — drop it from the exclusion list`)
  }
})

// The migration is history, not a live claim — it is allowed to say 14, and does.
test('🟢 the migration may still reference 14 as history', () => {
  const sql = read('supabase/migrations/20260730000000_trial_length_28_days.sql')
  assert.match(sql, /14/, 'the migration should record what the default was')
})
