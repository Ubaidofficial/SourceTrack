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
const DELIBERATELY_UNREGISTERED = [
  'api/tests/analytics-sources-join-ms.test.js',
  'api/tests/leads-journey-attribution.test.js',
  'api/tests/report-builder-leads.test.js',
  'api/tests/source-normalization.test.js'
]

const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))

// Every api/tests/*.test.js path named by ANY script (not just the qa:*:unit four — a file
// referenced by any runnable script is executed somewhere).
const registered = new Set()
for (const body of Object.values(pkg.scripts || {})) {
  for (const m of body.match(/api\/tests\/[A-Za-z0-9._-]+\.test\.js/g) || []) registered.add(m)
}

const onDisk = readdirSync(join(REPO, 'api', 'tests'))
  .filter(f => f.endsWith('.test.js'))
  .map(f => `api/tests/${f}`)
  .sort()

test('every api/tests/*.test.js is registered in package.json or explicitly excluded', () => {
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

test('no stale exclusion — every DELIBERATELY_UNREGISTERED file still exists', () => {
  const gone = DELIBERATELY_UNREGISTERED.filter(f => !onDisk.includes(f))
  assert.deepEqual(gone, [], `Exclusion list names files that no longer exist: ${gone.join(', ')}. Remove them.`)
})

test('no exclusion is ALSO registered — the two lists must not overlap', () => {
  const both = DELIBERATELY_UNREGISTERED.filter(f => registered.has(f))
  assert.deepEqual(both, [], `Excluded AND registered — contradictory: ${both.join(', ')}`)
})

test('every registered api/tests path exists on disk (a typo runs nothing, silently)', () => {
  const missing = [...registered].filter(f => !onDisk.includes(f)).sort()
  assert.deepEqual(missing, [], `package.json names test files that do not exist: ${missing.join(', ')}`)
})
