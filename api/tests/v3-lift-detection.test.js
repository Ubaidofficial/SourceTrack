// V3 LIFT DETECTION — proves v3 markup was RECREATED, not copied from the design handoff.
//
// WHY THIS EXISTS, and why it has to be automated. The standing instruction is "visual
// reference only, recreate in Astro, never lift markup." A reviewer CANNOT tell recreated
// markup from lifted markup by reading a diff — both look like new files. So the
// instruction is unenforceable by review, and an unenforceable rule is one that quietly
// stops being followed.
//
// It matters because lifting is how Phase 2a broke: markup was rebuilt without carrying the
// rule that styled it, `.hero-text > mark` stopped matching, and the headline highlight
// rendered in the browser's default yellow for three phases while every numeric check
// passed. Copying the other direction — bringing the handoff's scaffolding along — carries
// its class names, its token names, and its Babel CDN tag into our build.
//
// WHAT IT CANNOT DO. This detects handoff-SPECIFIC fingerprints. It cannot prove originality
// in general, and it does not claim to. Naming the limit is the point: a guard that
// overstates its coverage is the false-pass class this repo has hit four times.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ── FINGERPRINTS. Each is present in the handoff and must never reach our source. ──
export const LIFT_FINGERPRINTS = [
  // 1. The Babel-in-browser CDN tag. Verified on 3 handoff pages (compare-ga4,
  //    ai-referral-tracking, attribution). A third-party CDN request on a privacy-first
  //    marketing site is the contradiction §3.4's implementation note warns about, and in
  //    Astro it is pure dead weight — JSX compiles at build time.
  { pattern: /unpkg\.com\/@babel\/standalone/i, why: 'Babel-in-browser CDN tag from the handoff' },
  { pattern: /babel\.min\.js/i, why: 'Babel-in-browser build from the handoff' },
  { pattern: /type="text\/babel"/i, why: 'in-browser JSX transform from the handoff' },

  // 2. The tweaks panel — a 25.8KB design tool, not a product feature.
  { pattern: /tweaks-panel/i, why: 'tweaks-panel.jsx is a design tool, explicitly not for port' },

  // 3. REJECTED TOKEN NAMES. --violet-* resolves to ORANGE values in the handoff: legal
  //    today, wrong the moment someone "fixes" violet to be violet. §3.8 still bans the
  //    NAME, and v1.5 did not change that — see §0.4, "the --violet-* rejection stands".
  { pattern: /--violet(-\d+)?\b/, why: 'rejected token name (--violet-* holds ORANGE values — §3.8 bans the name)' },
  { pattern: /--shadow-violet\b/, why: 'rejected token name — v1.5 renames it --shadow-orange (§3.2)' },

  // ⚠️ `--green` WAS banned here through v1.4 ("§3.4: no separate success green").
  //    v1.5 REVERSED that ruling — §3.4 now admits green, bounded to positive deltas and
  //    healthy status. The fingerprint is DELETED rather than commented out: a disabled
  //    pattern reads as a temporary hold, and this one is not coming back. History is in
  //    design.md §0.4, which is where a reversal belongs.

  // 4. RETIRED HEXES. v1.5 replaced the palette wholesale (design.md §3.8), so this list
  //    inverted: the values banned here through v1.4 are now SHIPPED, and v1.4's own values
  //    are the stale ones. Getting the direction backwards is easy and silent, which is
  //    exactly why each entry names what it was and what replaced it.
  //
  //    ⚠️ NOTE #E54545 IS NO LONGER HERE. It was banned as "the handoff's --red" through
  //    v1.4; it is now our --red (§3.2). Do not re-add it.
  { pattern: /#D2EC2A/i, why: 'retired v1.4 accent — v1.5 lime is #CCF03F (§3.1)' },
  { pattern: /#F2A93B/i, why: 'retired gradient bridge — v1.5 has no amber (§3.5)' },
  { pattern: /#FF7A33/i, why: 'retired v1.4 counterweight — v1.5 orange is #F0602A (§3.1)' },
  { pattern: /#F7F4ED/i, why: 'retired v1.4 bone — v1.5 paper is #FAFAF7 (§3.2)' },
  { pattern: /#FFFDF8/i, why: 'retired v1.4 card — v1.5 card is #FFFFFF (§3.2)' },
  { pattern: /#12100C/i, why: 'retired v1.4 ink — v1.5 ink is #1F2323 (§3.2)' },
  { pattern: /#E7E0D2/i, why: 'retired v1.4 border — v1.5 border is #DDE4E4 (§3.2)' },
  { pattern: /#161310/i, why: 'retired v1.4 text — v1.5 text is #1F2323 (§3.2)' },

  //    The near-collision family. THREE values have meant "orange as text on light" across
  //    three versions, all within ~two characters of each other: #B3480E (the 2026-08-06
  //    handoff), #B4420E (v1.4), #B83D10 (v1.5, SHIPPED). The first two are stale and stay
  //    banned — picking the wrong one is invisible in review and silently changes a ratio
  //    that contrast-audit.mjs would then certify as passing.
  { pattern: /#B3480E/i, why: 'stale near-collision — v1.5 --orange-700 is #B83D10 (§3.2)' },
  { pattern: /#B4420E/i, why: "retired v1.4 --color-spend-text — v1.5 is #B83D10 (§3.2)" },
  { pattern: /#C4381C/i, why: 'retired v1.4 --color-danger — v1.5 --red is #E54545 (§3.2)' },

  // 5. Sample-data badges. §29.8 is ONE footer disclosure line, CI-enforced elsewhere.
  { pattern: /data-sample-badge/i, why: 'per-card sample-data badge — §29.8 allows one footer line' }
]

/**
 * Source files v3 owns. Legacy pages are out of scope and are not scanned.
 *
 * ⚠️ COVERAGE REGRESSION FIXED HERE, 2026-08-08. This list named
 * `marketing/src/pages/v3` — a directory that STOPPED EXISTING at the #690 cutover, when
 * the nine preview pages were promoted to live routes at `marketing/src/pages/*.astro`.
 * `walk()` returns silently on a missing path, so from #690 onward this guard scanned
 * the layouts and the token file and NOTHING ELSE, while still reporting green. The nine
 * pages carrying the actual page markup — the files most likely to be lifted — were
 * outside it for fourteen PRs.
 *
 * The `files.length > 0` assertion did not catch it because layouts/v3 alone satisfies it.
 * That is the lesson worth keeping: a non-empty file list is not evidence of coverage.
 * PROMOTED_PAGES is therefore an explicit list rather than a directory glob — pages/ also
 * holds legacy routes (blog, docs, developers, legal) that are deliberately out of scope,
 * so a glob would either over-scan or silently under-scan again.
 */
const PROMOTED_PAGES = [
  'index.astro',
  'pricing.astro',
  'product.astro',
  'attribution.astro',
  'report-builder.astro',
  'ai-referral-tracking.astro',
  'use-cases-saas.astro',
  'use-cases-ecommerce.astro',
  'compare/ga4.astro'
].map(p => `marketing/src/pages/${p}`)

function v3SourceFiles () {
  const roots = [
    'marketing/src/layouts/v3',
    'marketing/src/components/v3',
    'marketing/src/styles/v3-tokens.css',
    'marketing/src/styles/v3-home.css',
    'marketing/src/styles/v3-pages.css',
    'marketing/src/styles/v3-surfaces.css',
    ...PROMOTED_PAGES
  ]
  const out = []
  const walk = p => {
    if (!existsSync(p)) return
    if (statSync(p).isFile()) { out.push(p); return }
    for (const e of readdirSync(p)) walk(join(p, e))
  }
  for (const r of roots) walk(join(REPO, r))
  return out.filter(f => ['.astro', '.css', '.jsx', '.tsx', '.ts', '.js'].includes(extname(f)))
}

/**
 * Strip comments before scanning. A fingerprint matters in CODE, not in prose explaining
 * why it is barred — and v3-tokens.css deliberately NAMES every rejected token and hex so
 * the reasoning survives. Scanning raw text flagged that documentation as a lift, which
 * would have forced deleting the record to satisfy the guard. The comment is the lesson;
 * the guard has to read around it.
 */
export function stripComments (text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // CSS + JS block comments
    .replace(/^\s*\/\/.*$/gm, ' ')        // JS line comments
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ') // JSX comments
}

export function scan (text, { code = true } = {}) {
  const t = code ? stripComments(text) : text
  return LIFT_FINGERPRINTS.filter(f => f.pattern.test(t))
}

test('no handoff fingerprint reaches v3 source', () => {
  const files = v3SourceFiles()
  assert.ok(files.length > 0, 'found no v3 source files — the scanner is pointed at nothing')
  const hits = []
  for (const f of files) {
    for (const hit of scan(readFileSync(f, 'utf8'))) {
      hits.push(`  ${f.replace(REPO + '/', '')}: ${hit.why}`)
    }
  }
  assert.deepEqual(hits, [], 'handoff fingerprints found in v3 source — markup was lifted, not recreated:\n' + hits.join('\n'))
})

test('🔴 POSITIVE CONTROL — every fingerprint is detectable', () => {
  // Each pattern gets a sample that MUST trip it. A scanner that cannot demonstrate a catch
  // proves nothing, and this is the exact shape that let orphaned selectors survive three
  // phases of green output.
  const samples = [
    ['<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>', 2],
    ['<script type="text/babel">const x=1</script>', 1],
    ['import Tweaks from "./lib/tweaks-panel.jsx"', 1],
    ['--violet-400: #FF9459;', 1],
    ['--shadow-violet: 0 18px 52px;', 1],
    ['<span data-sample-badge>Sample</span>', 1],
    // Retired v1.5 palette. One sample per hex — the whole point of this family is that
    // the wrong value is invisible in review, so an untested pattern is an unguarded one.
    ['--color-primary: #D2EC2A;', 1],
    ['background: #F2A93B;', 1],
    ['--color-spend: #FF7A33;', 1],
    ['body { background: #F7F4ED; }', 1],
    ['--color-card: #FFFDF8;', 1],
    ['color: #12100C;', 1],
    ['border: 1px solid #E7E0D2;', 1],
    ['color: #161310;', 1],
    ['color: #B3480E;', 1],
    ['color: #B4420E;', 1],
    ['color: #C4381C;', 1]
  ]
  for (const [sample, atLeast] of samples) {
    const hits = scan(sample)
    assert.ok(hits.length >= atLeast,
      `scanner FAILED to flag a known lift fingerprint: ${JSON.stringify(sample)} — it is not guarding`)
  }
})

test('NEGATIVE CONTROL — the SHIPPED v1.5 palette is not flagged', () => {
  // Over-firing gets a guard muted, which is as bad as under-firing. Every value below is
  // live in design.md §3.2/§3.3 — if one trips, the guard is banning what we ship, which
  // is the exact direction error the fingerprint comments warn about.
  const clean = [
    '--lime: #CCF03F;',
    '--orange: #F0602A;',
    '--orange-700: #B83D10;',   // NOT #B3480E / #B4420E
    '--red: #E54545;',          // was banned through v1.4, shipped in v1.5
    '--green: #00AA57;',        // §3.4 reversal — the token name must not trip either
    '--green-100: #DDF6EA;',
    '--paper: #FAFAF7;',
    '--black: #1F2323;',
    '--gray-200: #DDE4E4;',
    '--shadow-orange: 0 18px 52px rgba(240,96,42,.35);',
    'font-family: "Schibsted Grotesk", system-ui, sans-serif;',
    'transition: transform 0.25s var(--v3-ease-out);',
    '<div class="v3-bento-cell">'
  ].join('\n')
  assert.deepEqual(scan(clean), [], 'the scanner flagged the SHIPPED palette — it over-fires')
})

test('🔴 CONTROL — every declared scan root resolves', () => {
  // The guard silently lost the nine promoted pages at #690 because walk() returns quietly
  // on a missing path and `files.length > 0` was satisfied by the layouts alone. A root that
  // stops existing must now FAIL rather than shrink the scan in silence.
  const roots = [
    'marketing/src/layouts/v3',
    'marketing/src/components/v3',
    'marketing/src/styles/v3-tokens.css',
    'marketing/src/styles/v3-home.css',
    'marketing/src/styles/v3-pages.css',
    'marketing/src/styles/v3-surfaces.css',
    ...PROMOTED_PAGES
  ]
  const missing = roots.filter(r => !existsSync(join(REPO, r)))
  assert.deepEqual(missing, [],
    'declared scan roots do not exist — the guard is scanning less than it claims:\n  ' +
    missing.join('\n  '))

  // And the file list must actually reach the pages, not just the layouts.
  const scanned = v3SourceFiles().map(f => f.replace(REPO + '/', ''))
  for (const page of PROMOTED_PAGES) {
    assert.ok(scanned.includes(page), `promoted page not scanned: ${page}`)
  }
})

test('the v3 token layer stays scoped to .v3', () => {
  // Un-scoping is the failure home-design.css carries its own warning about: it restyles
  // bare element selectors, and lifting the wrapper repaints all 36 pages. v3-tokens.css is
  // narrower, but a global :root block here would leak the v3 radii and shadows onto the 24
  // legacy pages, which is a visual decision the founder has explicitly not made.
  const p = join(REPO, 'marketing/src/styles/v3-tokens.css')
  if (!existsSync(p)) return
  const css = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/^\s*:root\s*\{/m.test(css),
    'v3-tokens.css declares a :root block — that leaks v3 radii/shadows onto all 36 pages')
  assert.ok(/^\s*\.v3\s*\{/m.test(css), 'v3-tokens.css must scope its tokens under .v3')
})
