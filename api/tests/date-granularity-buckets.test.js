// Date-bucket granularity contract — the "silent daily collapse" fix.
// TOKEN-FREE, NO network, no DB.
//
// THE BUG: getAiPlatformAttributionLive (groupBy + groupBy2) and getMultiTouchAttributionLive each
// open-coded a `quarter -> month -> else day` ladder. ALLOWED_GRANULARITY has FIVE members, so
// `week` and `year` fell to the else and returned DAILY buckets labelled as if the requested
// granularity had been honored — a §6 confident-wrong-bucket, and user-reachable: ReportBuilder.jsx
// renders all five granularity buttons whenever groupBy/groupBy2 === 'date'.
//
// Support was lost in the Tinybird migration (the old HogQL path covered all five via
// GRANULARITY_MAP), not deliberately dropped. Fixed by ONE shared dateBucket() helper.
//
// Asserted here:
//   PART 1  all five granularities produce DISTINCT labels (the collapse cannot come back).
//   PART 2  day/month/quarter are BYTE-IDENTICAL to the pre-fix expressions (no silent re-bucketing
//           of reports that already work).
//   PART 3  week is Monday-anchored and agrees with getLocalWeekString (the /analytics/summary
//           convention) — the two pages must name the same week the same way.
//   PART 4  ANTI-DRIFT: all three reader call sites use the shared helper, so a future edit cannot
//           re-triplicate a ladder and quietly regress one site.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')

// attribution-engine resolves getSupabase() lazily, but importing it pulls the config module.
// MOCK values — no network, no real project. Same preamble as multitouch-preagg-dims.test.js.
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL ||= 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY ||= 'mock-service-role-key-value'

// Bound to the REAL helper via its `__` test seam — never a re-typed copy (which could drift and
// false-green, the #248 duplicate-allowlist failure mode).
const { __dateBucket: dateBucket } = await import('../lib/attribution-engine.js')
const { getLocalWeekString } = await import('../lib/utils.js')
const { ALLOWED_GRANULARITY } = await import('../lib/report-config-validation.js')

// Wed 2026-07-22 13:45 UTC. Mid-week, mid-month, mid-quarter — so every granularity's label is
// visibly different from the others and from the raw date.
const REF = new Date('2026-07-22T13:45:00.000Z')

test('🔴 PART 1: all five granularities produce DISTINCT bucket labels', () => {
  const labels = [...ALLOWED_GRANULARITY].map(g => dateBucket(REF, g))
  assert.equal(labels.length, 5, 'ALLOWED_GRANULARITY must still have five members')
  assert.equal(new Set(labels).size, 5,
    `week/year must not collapse onto day — got ${JSON.stringify(labels)}`)
})

test('🔴 PART 1b: the exact labels for a fixed reference date', () => {
  assert.equal(dateBucket(REF, 'day'), '2026-07-22')
  assert.equal(dateBucket(REF, 'week'), '2026-07-20')   // the Monday of that week
  assert.equal(dateBucket(REF, 'month'), '2026-07')
  assert.equal(dateBucket(REF, 'quarter'), '2026-Q3')
  assert.equal(dateBucket(REF, 'year'), '2026')
})

// PART 2 — the pre-fix expressions, re-typed HERE ON PURPOSE. This is the one place a copy is
// correct: it pins that the refactor did not move a bucket that already worked. If dateBucket's
// day/month/quarter output ever diverges from these, existing reports silently re-bucketed.
test('🔴 PART 2: day/month/quarter are byte-identical to the pre-fix ladder', () => {
  for (const d of [REF, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-12-31T23:59:59.000Z')]) {
    assert.equal(dateBucket(d, 'day'), d.toISOString().slice(0, 10))
    assert.equal(dateBucket(d, 'month'), d.toISOString().slice(0, 7))
    assert.equal(dateBucket(d, 'quarter'), `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`)
  }
})

test('🔴 PART 2b: an unknown/absent granularity still falls to day (the old `else`)', () => {
  for (const g of [undefined, null, '', 'decade', 'fortnight']) {
    assert.equal(dateBucket(REF, g), REF.toISOString().slice(0, 10), String(g))
  }
})

// PART 3 — week must match the /analytics/summary convention. getLocalWeekString('UTC') is the
// live implementation that route uses; agreeing with it is what keeps the two pages consistent.
test('🔴 PART 3: week is Monday-anchored and agrees with getLocalWeekString(UTC)', () => {
  // A full week, Monday 2026-07-20 through Sunday 2026-07-26 — every day must land on the Monday.
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(2026, 6, 20 + i, 12, 0, 0))
    assert.equal(dateBucket(d, 'week'), '2026-07-20', `day offset ${i} (${d.toISOString()})`)
    assert.equal(dateBucket(d, 'week'), getLocalWeekString(d, 'UTC'),
      'must agree with the /analytics/summary week convention')
  }
  // Sunday anchors BACKWARD to the preceding Monday, not forward — the case the
  // `dayIndex === 0 ? 6 : dayIndex - 1` branch exists for.
  assert.equal(dateBucket(new Date('2026-07-26T23:59:00.000Z'), 'week'), '2026-07-20')
  assert.equal(dateBucket(new Date('2026-07-27T00:00:00.000Z'), 'week'), '2026-07-27')
  // Month and year boundaries must not break the anchor.
  assert.equal(dateBucket(new Date('2026-01-01T00:00:00.000Z'), 'week'), '2025-12-29')
})

test('every label sorts lexicographically (mergeGoogleResults sorts date dims with localeCompare)', () => {
  for (const g of ALLOWED_GRANULARITY) {
    const early = dateBucket(new Date('2026-02-03T00:00:00.000Z'), g)
    const late = dateBucket(new Date('2026-11-17T00:00:00.000Z'), g)
    if (early === late) continue   // same bucket at year granularity — nothing to order
    assert.ok(early.localeCompare(late) < 0, `${g}: ${early} must sort before ${late}`)
  }
})

// PART 4 — ANTI-DRIFT. Three sites previously held byte-identical ladders; one shared helper
// replaced them. Bind that structurally so a future edit can't reintroduce a per-site ladder.
const ENGINE_SRC = readFileSync(join(ROOT, 'api/lib/attribution-engine.js'), 'utf8')

test('🔴 PART 4: every date-dim reader site calls the shared helper', () => {
  // Matches the ASSIGNMENT sites only (dimVal/dimVal2 = ...), not the __dateBucket test seam,
  // which also contains a `dateBucket(...)` call.
  const calls = [...ENGINE_SRC.matchAll(/dimVal2? = dateBucket\(refDate, granularity\)/g)].length
  assert.equal(calls, 3,
    'expected exactly 3 call sites (ai groupBy, ai groupBy2, multitouch groupBy) — ' +
    'a new date-dim reader must call dateBucket() too, not open-code a ladder')
})

test('🔴 PART 4b: no open-coded quarter/month ladder survives outside the helper', () => {
  // The replaced ladders each contained this exact quarter expression. It must now appear ONCE,
  // inside dateBucket. More than one means a site was re-triplicated.
  const quarterExprs = [...ENGINE_SRC.matchAll(/Math\.floor\(refDate\.getUTCMonth\(\) \/ 3\) \+ 1/g)].length
  assert.equal(quarterExprs, 1, 'the quarter expression must live only in dateBucket()')
})
