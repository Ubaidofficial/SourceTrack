// KI-51 ANTI-DRIFT — binds the flex pipes' date-boundary SQL to the authoritative
// definition in getDateFilterExpr (attribution-engine.js:53). TOKEN-FREE, NO network,
// NO data — pure source parity. Same spirit as explain-journey-pipe-parity.test.js.
//
// WHY THIS EXISTS: the flex pipes are not yet timezone-capable, which is why Campaigns and
// Export 422 for non-UTC sites (KI-51). When someone makes them tz-capable, the obvious move
// is to copy the already-shipped tz pattern from dash_stages.pipe / dash_top_pages.pipe /
// dashboard_bounce_rate.pipe. **Those pipes use `<=` on their local upper bound.**
// getDateFilterExpr uses half-open `<`. Copying the reference pattern verbatim would ship a
// ONE-DAY OFF-BY-ONE on a revenue metric — silent, and invisible to any aggregate-level check.
// This test makes that specific mistake fail loudly, in the pipe file, with no credentials.
//
// The two contracts are genuinely different and BOTH are correct — do not "harmonise" them:
//   · dash_* pipes    — the CALLER builds inclusive local_from_ts/local_to_ts bounds, so the
//                       pipe compares `>= local_from_ts AND <= local_to_ts`.
//   · flex pipes      — must implement getDateFilterExpr's contract, whose upper bound is the
//                       EXCLUSIVE next-day midnight, hence `<` and never `<=`.
// So this file asserts the tz PARAM convention on both, and the OPERATOR contract only on the
// pipes that implement getDateFilterExpr.
//
// SCOPE: this test asserts source text. It does NOT open the KI-51 gate and does NOT prove the
// pipes execute correctly — see the PR body for the full residual list.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const __dirname = dirname(fileURLToPath(import.meta.url))
const readPipe = (name) => readFileSync(join(__dirname, '../../tinybird/pipes/', name), 'utf8')

const { getDateFilterExpr } = await import('../lib/attribution-engine.js')

// ── the authoritative spec, EXECUTED (not regex-scraped, so it cannot drift) ──
const SPEC_TZ = getDateFilterExpr('timestamp', 'Europe/Paris', '2026-07-20', '2026-07-21')
const SPEC_UTC = getDateFilterExpr('timestamp', 'UTC', '2026-07-20', '2026-07-21')

// The 8 flex pipes a non-UTC Campaigns or Export request can reach (KI-51 enumeration).
// 6 of them carry the `revenue` metric — an operator error here is a money-rail error.
const FLEX_PIPES = [
  'flexible_report_campaign_by_site.pipe',            // revenue 💰 + conversions — Campaigns
  'flexible_report_campaign_sessions_by_site.pipe',   // sessions              — Campaigns
  'flexible_report_campaign_leads_by_site.pipe',      // leads                 — Campaigns
  'flexible_report_main_by_site.pipe',                // revenue 💰            — Export
  'flexible_report_provider_by_site.pipe',            // revenue 💰            — Export
  'flexible_report_attribution_status_by_site.pipe',  // revenue 💰            — Export
  'flexible_report_stitching_method_by_site.pipe',    // revenue 💰            — Export
  'flexible_report_conversion_type_by_site.pipe'      // revenue 💰            — Export
]

// Already tz-capable, shipped, and the tempting thing to copy from.
const REFERENCE_TZ_PIPES = ['dash_stages.pipe', 'dash_top_pages.pipe', 'dashboard_bounce_rate.pipe']

// Extract ONLY the executable SQL: everything from the first `SQL >` to `TYPE`, minus `--`
// comments. Both exclusions are load-bearing — a naive whole-file scan matches prose:
// flexible_report_main_by_site.pipe's DESCRIPTION discusses "toTimeZone padding" without
// implementing it, which would make this file report that pipe as tz-capable. Verified: with a
// whole-file scan that pipe false-positives; with this extractor it correctly reads as tz-less.
function sqlOnly (src) {
  const start = src.search(/^\s*SQL\s*>/m)
  const body = start === -1 ? src : src.slice(start)
  const end = body.search(/^\s*TYPE\s+\w+/m)
  return (end === -1 ? body : body.slice(0, end))
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
}

/**
 * Find the comparison operator that follows each `toTimeZone(timestamp, …)` expression.
 *
 * A regex cannot do this reliably: the tz argument is a Tinybird template containing its own
 * parentheses — `toTimeZone(timestamp, {{ String(tz, 'UTC') }}) < …` — so a `[^)]*` class stops
 * at the wrong `)` and reads the operator as absent. (That is not hypothetical: the first
 * version of this file did exactly that, and the self-test below is what caught it.)
 * So: balance parentheses to find the true end of the call, then read the operator that follows.
 *
 * @returns array of the literal operators found, e.g. ['>=', '<']
 */
function operatorsAfterToTimeZone (sql) {
  const ops = []
  const NEEDLE = 'toTimeZone('
  for (let i = sql.indexOf(NEEDLE); i !== -1; i = sql.indexOf(NEEDLE, i + 1)) {
    let depth = 0
    let j = i + NEEDLE.length - 1          // sits on the opening '('
    for (; j < sql.length; j++) {
      if (sql[j] === '(') depth++
      else if (sql[j] === ')') { depth--; if (depth === 0) break }
    }
    if (depth !== 0) continue              // unbalanced — malformed SQL, skip
    // Only consider calls on `timestamp` (not on some other column).
    if (!/^\(\s*timestamp\s*,/.test(sql.slice(i + NEEDLE.length - 1, j + 1))) continue
    const after = sql.slice(j + 1).replace(/^\s+/, '')
    const m = after.match(/^(>=|<=|<|>)/)
    if (m) ops.push(m[1])
  }
  return ops
}

/**
 * THE DETECTOR. Given pipe SQL that wraps timestamp in toTimeZone, return every violation of
 * getDateFilterExpr's local-bound contract. The self-test below proves it actually rejects the
 * `<=` trap rather than being vacuously true.
 */
function localBoundViolations (sql) {
  const problems = []
  const ops = operatorsAfterToTimeZone(sql)
  // Character-level: the local UPPER bound must be `<`, never `<=`.
  if (ops.includes('<=')) {
    problems.push('local upper bound uses `<=` — getDateFilterExpr is half-open `<` (one-day off-by-one)')
  }
  if (!ops.includes('<')) {
    problems.push('no `toTimeZone(timestamp, …) <` local upper bound found')
  }
  if (!ops.includes('>=')) {
    problems.push('no `toTimeZone(timestamp, …) >=` local lower bound found')
  }
  // The recorded __no_value__ lesson: required=True makes --check inject a placeholder that
  // toTimeZone cannot load ("Cannot load time zone '__no_value__'").
  if (/String\(\s*tz\s*,\s*required\s*=\s*True/.test(sql)) {
    problems.push("tz declared String(tz, required=True) — must be String(tz, 'UTC') or --check fails")
  }
  if (!/String\(\s*tz\s*,\s*'UTC'\s*\)/.test(sql)) {
    problems.push("tz param is not declared as String(tz, 'UTC')")
  }
  return problems
}

// ── 1. pin the SPEC itself, at character level ───────────────────────────────
test('SPEC: getDateFilterExpr local upper bound is half-open `<`, never `<=`', () => {
  assert.match(SPEC_TZ, /toTimeZone\(timestamp, 'Europe\/Paris'\) < toDateTime\('2026-07-22 00:00:00', 'Europe\/Paris'\)/,
    'the local upper bound must be `<` against next-day midnight')
  assert.ok(!/toTimeZone\([^)]*\) <=/.test(SPEC_TZ),
    'getDateFilterExpr must NOT use `<=` on a local bound — that is the dash_* convention, not this one')
})

test('SPEC: getDateFilterExpr local lower bound is inclusive `>=`', () => {
  assert.match(SPEC_TZ, /toTimeZone\(timestamp, 'Europe\/Paris'\) >= toDateTime\('2026-07-20 00:00:00', 'Europe\/Paris'\)/)
})

test('SPEC: UTC branch is half-open and carries NO toTimeZone', () => {
  assert.match(SPEC_UTC, /timestamp >= toDateTime\('2026-07-20T00:00:00\.000Z'\)/)
  assert.match(SPEC_UTC, /timestamp < toDateTime\('2026-07-22T00:00:00\.000Z'\)/)
  assert.ok(!SPEC_UTC.includes('<='), 'UTC branch must be half-open')
  assert.ok(!SPEC_UTC.includes('toTimeZone'), 'UTC branch must not emit toTimeZone')
})

// ── 2. THE DETECTOR SELF-TEST — proves these checks are not vacuously true ───
// Without this, every conditional assertion below could be silently dead (no flex pipe has tz
// today) and the file would pass while catching nothing. This is the point of the exercise.
test('🔴 DETECTOR SELF-TEST: the `<=` trap is actually rejected, the correct form accepted', () => {
  const CORRECT = `
    AND toTimeZone(timestamp, {{ String(tz, 'UTC') }}) >= {{ DateTime(local_from_ts, required=True) }}
    AND toTimeZone(timestamp, {{ String(tz, 'UTC') }}) < {{ DateTime(local_to_ts, required=True) }}`
  assert.deepEqual(localBoundViolations(CORRECT), [], 'the correct half-open form must pass cleanly')

  // Exactly what copying dash_stages.pipe verbatim would produce.
  const THE_TRAP = CORRECT.replace('}}) < {{', '}}) <= {{')
  const trapProblems = localBoundViolations(THE_TRAP)
  assert.ok(trapProblems.some(p => p.includes('`<=`')),
    'the detector FAILED to catch the `<=` off-by-one — this test would be worthless')

  // And the __no_value__ trap.
  const TZ_REQUIRED = CORRECT.replace(/String\(tz, 'UTC'\)/g, 'String(tz, required=True)')
  assert.ok(localBoundViolations(TZ_REQUIRED).some(p => p.includes('required=True')),
    'the detector FAILED to catch String(tz, required=True)')
})

// ── 3. the shipped reference pipes: tz PARAM convention (load-bearing today) ──
for (const name of REFERENCE_TZ_PIPES) {
  test(`reference ${name}: declares String(tz, 'UTC'), wraps timestamp, never required=True`, () => {
    assert.ok(existsSync(join(__dirname, '../../tinybird/pipes/', name)), `${name} not found`)
    const sql = sqlOnly(readPipe(name))
    assert.match(sql, /String\(\s*tz\s*,\s*'UTC'\s*\)/,
      `${name} must declare String(tz, 'UTC') — required=True breaks --check with __no_value__`)
    assert.ok(!/String\(\s*tz\s*,\s*required\s*=\s*True/.test(sql), `${name} must not use String(tz, required=True)`)
    assert.match(sql, /toTimeZone\(\s*timestamp\s*,/, `${name} must wrap timestamp in toTimeZone`)
  })
}

test('🔴 the detector flags the REAL dash_stages.pipe — proving it works on actual pipe syntax', () => {
  // The self-test above uses synthetic strings. This runs the same detector against a real,
  // shipped pipe that genuinely uses `<=`, which does two things at once:
  //  (1) proves the balanced-paren scanner parses real Tinybird template syntax, not just
  //      hand-written fixtures;
  //  (2) documents WHY the trap is tempting — the shipped pattern really does use `<=`, and it
  //      is CORRECT there, because its caller supplies an INCLUSIVE local_to_ts.
  const sql = sqlOnly(readPipe('dash_stages.pipe'))
  const ops = operatorsAfterToTimeZone(sql)
  assert.ok(ops.length > 0, 'detector found no toTimeZone operators in dash_stages.pipe — parser drift')
  assert.ok(ops.includes('<='),
    `dash_stages.pipe was expected to use \`<=\` (caller-built inclusive bound); found ${JSON.stringify(ops)}. ` +
    'If this changed, re-read the contract before touching the flex pipes.')
  // And the detector would reject that exact operator set under getDateFilterExpr's contract.
  assert.ok(localBoundViolations(sql).some(p => p.includes('`<=`')),
    'the detector must flag dash_stages-style `<=` as a violation of the flex-pipe contract')
})

// ── 4. flex pipes: the UTC half-open contract (load-bearing TODAY) ───────────
for (const name of FLEX_PIPES) {
  test(`${name}: UTC date bounds are half-open (>= date_from, < date_to) — never <=`, () => {
    assert.ok(existsSync(join(__dirname, '../../tinybird/pipes/', name)), `${name} not found`)
    const sql = sqlOnly(readPipe(name))
    assert.match(sql, /timestamp\s*>=\s*\{\{\s*DateTime\(\s*date_from/,
      `${name}: lower bound must be \`timestamp >= {{ DateTime(date_from …`)
    assert.match(sql, /timestamp\s*<\s*\{\{\s*DateTime\(\s*date_to/,
      `${name}: upper bound must be \`timestamp < {{ DateTime(date_to …\` (half-open)`)
    assert.ok(!/timestamp\s*<=\s*\{\{\s*DateTime\(\s*date_to/.test(sql),
      `${name}: upper bound uses \`<=\` — getDateFilterExpr's end is EXCLUSIVE next-day midnight. ` +
      'This is a one-day over-count, and 6 of these 8 pipes carry revenue.')
  })
}

// ── 5. flex pipes: the tz contract, ARMS the moment tz support lands ─────────
for (const name of FLEX_PIPES) {
  test(`${name}: IF tz-capable, local bounds must match getDateFilterExpr exactly`, () => {
    const sql = sqlOnly(readPipe(name))
    if (!/toTimeZone/.test(sql)) {
      // Expected today — this is precisely the KI-51 gap. Nothing to assert yet; the UTC
      // contract above still applies. The moment someone adds toTimeZone, this arms.
      return
    }
    const problems = localBoundViolations(sql)
    assert.deepEqual(problems, [],
      `${name} became tz-capable but does not match getDateFilterExpr's contract:\n` +
      problems.map(p => `  - ${p}`).join('\n') +
      '\n\nDo NOT copy dash_stages.pipe verbatim: it uses `<=` because its caller supplies an ' +
      'inclusive bound. getDateFilterExpr is half-open `<`. See KI-51.')
  })
}

// ── 6. state pin — makes the KI-51 gap visible rather than merely absent ─────
test('CONTRACT PIN: no flex pipe is tz-capable yet (KI-51 open) — update this when that changes', () => {
  const tzCapable = FLEX_PIPES.filter(n => /toTimeZone/.test(sqlOnly(readPipe(n))))
  assert.deepEqual(tzCapable, [],
    `These flex pipes gained toTimeZone: ${tzCapable.join(', ')}. That is KI-51 progress — good. ` +
    'Update this pin, and note the tz breaker in report-config-validation.js may now be removable ' +
    'ONLY once `tb --cloud deploy --check` and the non-UTC boundary fixture have both been run.')
})
