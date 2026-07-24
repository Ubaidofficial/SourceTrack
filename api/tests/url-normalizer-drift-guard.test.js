// ANTI-DRIFT GUARD — path normalizers.
//
// The repo has TWO path-normalizers BY DESIGN, with different semantics, both load-bearing on
// PERSISTED output (an investigation proved unifying either changes money-rail or GSC output — do
// NOT unify):
//   parsePathname  (api/lib/url-normalize.js)      — money-rail, single-source, CASE-PRESERVED,
//                                                    keeps trailing slash, empty -> 'unknown'.
//                                                    Writes attributed_conversions.landing_page (a
//                                                    report/groupby dimension) — lowercasing it
//                                                    would re-bucket money-rail reports.
//   normalizePath  (api/lib/url-normalization.js)  — GSC/SEO cross-source join, LOWERCASED + strips
//                                                    trailing slash for match robustness (Google
//                                                    reporting vs tracker capture), empty -> '/'.
//
// The prior guard (url-normalize.test.js) only asserts parsePathname is defined ONCE — it cannot
// see a second, DIFFERENTLY-NAMED normalizer, and there is one. This guard fails if a THIRD
// path-normalizer function appears anywhere in source, so the next one must be justified against
// these two (add it to PATH_NORMALIZERS with a reason, or to NOT_PATH_NORMALIZERS if it isn't one).
//
// SYNTACTIC boundary (same class as pipe-refund-guard.test.js): detection is NAME-shaped — a
// normalize/parse/canonical/clean/strip/derive verb next to path/pathname/url. A normalizer named
// without any of those tokens would evade it. That is the honest limit of a syntactic guard; the
// point is to force a THIRD normalizer to be looked at, not to be a compiler.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')

// ── The two canonical path-normalizers. Each MUST stay justified. Do not add a third. ──────────
const PATH_NORMALIZERS = {
  parsePathname: { file: 'api/lib/url-normalize.js', why: 'money-rail, single-source, CASE-PRESERVED — writes attributed_conversions.landing_page (a report dim); lowercasing re-buckets money-rail output' },
  normalizePath: { file: 'api/lib/url-normalization.js', why: 'GSC cross-source join, LOWERCASED + slash-stripped for match robustness (Google reporting vs tracker capture)' }
}

// ── Name-pattern matches that are DELIBERATELY NOT path-normalizers. A new match must land here or
//    in PATH_NORMALIZERS — never silently. ───────────────────────────────────────────────────────
const NOT_PATH_NORMALIZERS = {
  normalizeUrl: 'dashboard display / PII-redaction (JourneyModal.jsx) — returns origin+pathname (KEEPS host) and redacts emails; not a bare-path producer for keying/joining',
  handleCopyStripeUrl: 'UI copy-to-clipboard handler (Integrations.jsx); the name only matches because "Stripe" contains "strip" — not a normalizer at all'
}

// A verb next to path/pathname/url, either order.
const NORMALIZER_NAME = /(?:normali[sz]e|parse|canonical|clean|strip|derive)[a-z0-9_]{0,3}(?:path|pathname|url)|(?:path|pathname|url)[a-z0-9_]{0,3}(?:normali[sz]e|parse|canonical)/i

// Top-level `function NAME` and `const NAME = (…) =>` definitions (not object methods / string mentions).
function definedFunctionNames (text) {
  const names = []
  for (const m of text.matchAll(/(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) names.push(m[1])
  for (const m of text.matchAll(/(?:^|\s)(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g)) names.push(m[1])
  return names
}

// PURE detector — takes [{path, text}], returns [{name, file}] for every normalizer-shaped definition.
export function scanForNormalizers (sources) {
  const found = []
  for (const { path, text } of sources) {
    for (const name of definedFunctionNames(text)) {
      if (NORMALIZER_NAME.test(name)) found.push({ name, file: path })
    }
  }
  return found
}
const unjustified = (found) => found.filter(f => !(f.name in PATH_NORMALIZERS) && !(f.name in NOT_PATH_NORMALIZERS))

// Collect real source files (api + dashboard/src), excluding tests and node_modules.
function sourceFiles () {
  const out = []
  for (const base of ['api', 'dashboard/src']) {
    const dir = join(ROOT, base)
    for (const rel of readdirSync(dir, { recursive: true })) {
      const p = String(rel)
      if (!/\.(js|jsx)$/.test(p)) continue
      if (/node_modules/.test(p) || /\.test\.(js|jsx)$/.test(p)) continue
      const abs = join(dir, p)
      out.push({ path: relative(ROOT, abs), text: readFileSync(abs, 'utf8') })
    }
  }
  return out
}

// ── GREEN: the real repo has exactly the two justified normalizers (+ the two excluded matches) ──
test('no UNJUSTIFIED path-normalizer exists in source (a third must be justified)', () => {
  const found = scanForNormalizers(sourceFiles())
  const bad = unjustified(found)
  assert.deepEqual(bad, [], `unjustified path-normalizer(s) found — add each to PATH_NORMALIZERS (with a reason) or NOT_PATH_NORMALIZERS: ${JSON.stringify(bad)}`)
})

test('the guard is not vacuous — it actually detects the two known normalizers', () => {
  const names = new Set(scanForNormalizers(sourceFiles()).map(f => f.name))
  assert.ok(names.has('parsePathname'), 'parsePathname must be detected (else the regex rotted)')
  assert.ok(names.has('normalizePath'), 'normalizePath must be detected (else the regex rotted)')
})

test('the two allowlisted normalizers are actually defined at their stated files (allowlist can\'t rot)', () => {
  for (const [name, { file }] of Object.entries(PATH_NORMALIZERS)) {
    const src = readFileSync(join(ROOT, file), 'utf8')
    assert.match(src, new RegExp(`function\\s+${name}\\b`), `${name} must be defined in ${file}`)
  }
})

// ── RED PROOF: a deliberately-added THIRD path-normalizer makes the guard fail ───────────────────
test('RED PROOF: a third path-normalizer is flagged (guard would fail)', () => {
  const real = sourceFiles()
  const withThird = [...real, { path: 'api/lib/__synthetic_third__.js', text: 'export function normalizeUrlPath (u) { return new URL(u).pathname.toLowerCase() }' }]
  const bad = unjustified(scanForNormalizers(withThird))
  assert.equal(bad.length, 1, 'exactly the synthetic third is unjustified')
  assert.equal(bad[0].name, 'normalizeUrlPath')
  // and the same input WITHOUT the third is clean — the green/red hinge is the third alone.
  assert.deepEqual(unjustified(scanForNormalizers(real)), [])
})
