// KI-49 — the durable half. Every `qa:*:unit` script enumerates its test files BY NAME;
// there is no glob. A file that nobody remembers to add is silently never executed, and CI
// stays green while the coverage does not exist. That is the silent-success class applied
// to the very mechanism used to catch the silent-success class — and it was already real:
// 19 of 137 files had never run, two of them rotted unnoticed for months.
//
// This test makes the gap self-enforcing. It is deliberately self-registering: it lives in
// the list it checks, so if someone forgets to register IT, the omission is what it would
// have caught anyway (and the count assertions below drift).
//
// It fails on THREE conditions, not one:
//   1. a file on disk that is neither registered nor explicitly excluded  (the KI-49 gap)
//   2. an excluded file that no longer exists                            (stale exclusion)
//   3. a registered file that does not exist on disk                     (typo -> node --test
//      silently matches nothing for that path)

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..')

// ── DELIBERATE EXCLUSIONS ────────────────────────────────────────────────────
// These are NOT unit tests. Each is a live integration script that early-returns
// "SKIPPING …" unless SUPABASE_URL + SUPABASE_SERVICE_KEY are set, and then signs in to a
// real Supabase project with a hardcoded demo account and calls a running API over HTTP
// (SOURCETRACK_API_URL, default http://localhost:3000).
//
// Registering them would be WORSE than leaving them out: in CI those env vars are unset, so
// each would early-return and be counted as a PASS while asserting nothing — manufacturing
// exactly the false confidence KI-49 is about. (Verified in CI: the already-registered
// api/tests/timezone-reconciliation.test.js prints "SKIPPING …" on every run today and is
// scored as passing.) They also violate §10 "real-env only, never localhost".
//
// Excluding them is a decision, recorded here so it stays visible instead of silent.
// To un-exclude: give the file a real unit harness, or move it to an integration script
// outside api/tests/. Do NOT simply register it.
//
// This list covers EVERY scanned directory, not just api/tests/. There are currently no
// tinybird/adapter/__tests__ entries because all ten of those files are genuine unit tests
// (mocked transports, no network, no DB) and are registered in qa:tinybird:unit — which is the
// right answer for a real unit test. Exemption is for files that CANNOT be unit-run; it is not
// a way to quiet the guard.
const DELIBERATELY_UNREGISTERED = [
  'api/tests/analytics-sources-join-ms.test.js',
  'api/tests/leads-journey-attribution.test.js',
  'api/tests/report-builder-leads.test.js',
  'api/tests/source-normalization.test.js'
]

// ── SCANNED DIRECTORIES ──────────────────────────────────────────────────────
// This guard originally watched api/tests/ ONLY, and that blind spot produced exactly the bug
// the guard exists to prevent: tinybird/adapter/__tests__/idempotency.test.js sat on disk,
// named by no script, running nowhere — while qa:tinybird:unit enumerated its nine siblings
// individually, so nothing flagged the tenth. Seven real assertions, never executed in CI.
// A guard that watches one directory cannot catch the class of bug it was written for, so the
// scan is now a LIST. Adding a new test directory means adding it here, not rewriting the file.
const SCANNED = [
  { segments: ['api', 'tests'], prefix: 'api/tests/' },
  { segments: ['tinybird', 'adapter', '__tests__'], prefix: 'tinybird/adapter/__tests__/' }
]

const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))

// Derived from SCANNED so the matcher can never fall behind the scan — a hardcoded second
// pattern is how the api/tests-only blind spot survived. A glob such as `api/tests/*.test.js`
// (qa:all) deliberately does NOT match: `*` is outside the filename class, so a glob-runner
// script cannot be mistaken for explicit registration of every file it happens to sweep up.
const REGISTERED_PATH_RE = new RegExp(
  `(?:${SCANNED.map(s => s.prefix).join('|')})[A-Za-z0-9._-]+\\.test\\.js`,
  'g'
)

// Every scanned test path named by ANY script (not just the qa:*:unit four — a file referenced
// by any runnable script is executed somewhere).
const registered = new Set()
for (const body of Object.values(pkg.scripts || {})) {
  for (const m of body.match(REGISTERED_PATH_RE) || []) registered.add(m)
}

const onDisk = SCANNED.flatMap(({ segments, prefix }) =>
  readdirSync(join(REPO, ...segments))
    .filter(f => f.endsWith('.test.js'))
    .map(f => `${prefix}${f}`)
).sort()

test('every scanned *.test.js is registered in package.json or explicitly excluded', () => {
  const unaccounted = onDisk.filter(f => !registered.has(f) && !DELIBERATELY_UNREGISTERED.includes(f))
  assert.deepEqual(
    unaccounted, [],
    'These test files exist but NO npm script runs them, so CI never executes them:\n' +
    unaccounted.map(f => `  - ${f}`).join('\n') +
    '\n\nAdd each to the qa:*:unit script matching what it exercises. If a file is intentionally ' +
    'not a unit test, add it to DELIBERATELY_UNREGISTERED in this file WITH a reason — never ' +
    'leave it merely absent.'
  )
})

// Anti-vacuity: the checks above pass trivially if a directory silently stops being scanned
// (renamed, moved, or emptied). Asserting each scanned root actually yields files is what makes
// "0 unaccounted" mean "checked and clean" rather than "looked at nothing".
test('the scan is not vacuous — every scanned directory yields at least one test file', () => {
  const empty = SCANNED.filter(({ prefix }) => !onDisk.some(f => f.startsWith(prefix))).map(s => s.prefix)
  assert.deepEqual(
    empty, [],
    `Scanned directories that produced NO test files: ${empty.join(', ')}. ` +
    'Either the path moved (fix SCANNED) or the directory is gone (remove it) — a silently ' +
    'empty scan is how a whole directory drifts out of coverage unnoticed.'
  )
})

test('no stale exclusion — every DELIBERATELY_UNREGISTERED file still exists', () => {
  const gone = DELIBERATELY_UNREGISTERED.filter(f => !onDisk.includes(f))
  assert.deepEqual(gone, [], `Exclusion list names files that no longer exist: ${gone.join(', ')}. Remove them.`)
})

test('no exclusion is ALSO registered — the two lists must not overlap', () => {
  const both = DELIBERATELY_UNREGISTERED.filter(f => registered.has(f))
  assert.deepEqual(both, [], `Excluded AND registered — contradictory: ${both.join(', ')}`)
})

test('every registered test path exists on disk (a typo runs nothing, silently)', () => {
  const missing = [...registered].filter(f => !onDisk.includes(f)).sort()
  assert.deepEqual(missing, [], `package.json names test files that do not exist: ${missing.join(', ')}`)
})
