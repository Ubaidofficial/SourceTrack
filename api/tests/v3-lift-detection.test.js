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
  //    today, wrong the moment someone "fixes" violet to be violet. --green violates §3.4
  //    outright ("no separate success green"). Their presence in our source means handoff
  //    CSS was pasted rather than rebuilt.
  { pattern: /--violet(-\d+)?\b/, why: 'rejected token name (--violet-* holds ORANGE values — §3.4 bans purple)' },
  { pattern: /--shadow-violet\b/, why: 'rejected token name' },
  { pattern: /--green(-\d+)?\b/, why: 'rejected token (§3.4: no separate success green)' },

  // 4. The two Tier-2 hexes that must never enter the build. Both differ from the v1.4
  //    value by ~two characters and mean the same thing, so the wrong one is invisible in
  //    review and would silently change a contrast ratio contrast-audit.mjs then certifies.
  { pattern: /#B3480E/i, why: "handoff's --orange-700; v1.4's --color-spend-text is #B4420E" },
  { pattern: /#E54545/i, why: "handoff's --red; v1.4's --color-danger is #C4381C" },

  // 5. Sample-data badges. §29.8 is ONE footer disclosure line, CI-enforced elsewhere.
  { pattern: /data-sample-badge/i, why: 'per-card sample-data badge — §29.8 allows one footer line' }
]

/** Source files v3 owns. Legacy pages are out of scope and are not scanned. */
function v3SourceFiles () {
  const roots = [
    'marketing/src/layouts/v3',
    'marketing/src/styles/v3-tokens.css',
    'marketing/src/pages/v3'
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
    ['--green-100: #DDF6EA;', 1],
    ['color: #B3480E;', 1],
    ['background: #E54545;', 1],
    ['<span data-sample-badge>Sample</span>', 1]
  ]
  for (const [sample, atLeast] of samples) {
    const hits = scan(sample)
    assert.ok(hits.length >= atLeast,
      `scanner FAILED to flag a known lift fingerprint: ${JSON.stringify(sample)} — it is not guarding`)
  }
})

test('NEGATIVE CONTROL — legitimate v3 source is not flagged', () => {
  // Over-firing gets a guard muted, which is as bad as under-firing.
  const clean = [
    '--v3-orange-600: #E85A1A;',
    '--v3-spend-text: var(--color-spend-text);',
    'background: var(--v3-paper-card);',
    '<div class="v3-bento-cell">',
    'transition: transform 0.25s var(--v3-ease-out);'
  ].join('\n')
  assert.deepEqual(scan(clean), [], 'the scanner flagged legitimate v3 source — it over-fires')
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
