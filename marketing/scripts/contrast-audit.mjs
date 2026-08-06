#!/usr/bin/env node
// WCAG 2.1 contrast audit for the marketing hero. Deterministic math, no browser.
//
// Resolves colours from the BUILT stylesheet in dist/ rather than from source, so what is
// measured is what actually ships (the source-vs-dist distinction that bit PR #565).
// Custom properties are resolved transitively from the :root block; every pair is then
// scored with the WCAG 2.1 relative-luminance formula.
//
// Usage:  node scripts/contrast-audit.mjs [path/to/built.css]
//         (defaults to the single stylesheet dist/index.html links)

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ── colour parsing ───────────────────────────────────────────────────────────
function hexToRgb (hex) {
  const h = hex.trim().replace(/^#/, '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
}

// WCAG 2.1 relative luminance (sRGB).
function luminance ([r, g, b]) {
  const f = c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio (fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

// ── resolve --custom-properties from the built CSS ───────────────────────────
function readVars (css) {
  const vars = {}
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi)) {
    const name = m[1].trim()
    const val = m[2].trim()
    if (!(name in vars)) vars[name] = val   // first definition wins, matching cascade order here
  }
  return vars
}

function resolve (value, vars, depth = 0) {
  if (depth > 10 || typeof value !== 'string') return value
  const m = value.match(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/i)
  if (!m) return value
  const next = vars[m[1]] ?? m[2] ?? ''
  return resolve(value.replace(m[0], next.trim()), vars, depth + 1)
}

function toRgb (value, vars) {
  const v = resolve(String(value).trim(), vars).trim()
  return hexToRgb(v)
}

// ── the pairs under test ─────────────────────────────────────────────────────
// Each: where it appears, the foreground token, the background token, and the WCAG level
// that applies. 'AA-large' = >=18.66px bold or >=24px regular (WCAG 1.4.3), threshold 3.0.
const PAIRS = [
  // ── text on LIME ──
  { id: 'hero <mark> highlight',        sel: '#hero-title>mark',        fg: 'var(--color-text)',  bg: 'var(--color-primary)',   level: 'AA-large' },
  { id: 'btn-primary label @stop25%',   sel: '.btn-primary',           fg: 'var(--color-dark)',  bg: 'var(--color-primary)',   level: 'AA' },
  { id: 'btn-primary label @stop100%',  sel: '.btn-primary',           fg: 'var(--color-dark)',  bg: 'var(--color-secondary)', level: 'AA' },
  { id: 'badge lime text @stop0%',      sel: '.gradient-text-primary', fg: 'var(--color-primary)',   bg: 'var(--color-dark)',      level: 'AA' },
  { id: 'badge lime text @stop100%',    sel: '.gradient-text-primary', fg: 'var(--color-secondary)', bg: 'var(--color-dark-gray)', level: 'AA' },

  // ── home-design.css link + orange text ──
  // ⚠️ THIS COMMENT USED TO READ "These mirror real selectors, not hypotheticals."
  // It was FALSE for two of its five pairs, and the false claim of having-been-checked is
  // why nobody checked. `.calc-row.hi b` and `.plan li em` referenced `calc-row`, `hi` and
  // `plan` — classes that exist on NO page of the built site, on any route, ever. Both were
  // introduced by 2a alongside this file and scored green for three phases while matching
  // nothing. They are REMOVED rather than repointed: home-design.css styles a component set
  // the marketing site does not build, so there is no element for them to point at.
  // --orange-600 is banned for text (see the BAN check below), asserted absent, not scored.
  { id: '.st-home a on paper',          sel: '.st-home a',             fg: 'var(--orange-700)',  bg: 'var(--paper)',           level: 'AA' },
  { id: '.st-home a:hover on paper',    sel: '.st-home a:hover',       fg: 'var(--ink)',         bg: 'var(--paper)',           level: 'AA' },
  { id: 'hero .pill label on gray-100', sel: '.st-home .pill',         fg: 'var(--black)',       bg: 'var(--gray-100)',        level: 'AA' },
  { id: 'hero-sub on paper',            sel: '.st-home .hero-sub',     fg: '#586464',            bg: 'var(--paper)',           level: 'AA' },
  { id: 'demo-chrome url on ink',       sel: '.demo-chrome .url',      fg: '#8a9494',            bg: '#12100c',                level: 'AA' },

  // ── surrounding hero text, for baseline ──
  { id: 'hero body copy on bone',       sel: '#hero-content',          fg: 'var(--color-text-light)', bg: 'var(--color-body)', level: 'AA' },
  // ⚠️ VALUE CHANGED, and not by a regression. This pair targeted `.hero-text` and so
  // matched nothing on the homepage from 2a onward, while reporting 16.85 PASS. Repointed
  // to the real hero h1, its tokens are also different: home-design.css gives it
  // `color: var(--black)` (#12100c), not --color-text, over the hero's own gradient base
  // whose top stop is --paper. 17.30 is the FIRST true reading of this pair, not an
  // improvement on 16.85 — there was nothing to improve on.
  { id: 'hero h1 on hero base',         sel: '#hero-title',            fg: 'var(--black)',       bg: 'var(--paper)',           level: 'AA-large' },
  { id: 'btn-dark label',               sel: '.btn-dark',              fg: 'var(--color-white)', bg: 'var(--color-dark)',      level: 'AA' },

  // ── Phase 2b sections ──
  // TrustBar flipped from a dark band (#1B1811) to the light contrast band at §2.7
  // position 2, so every pair in it is recomputed against the NEW surface rather than
  // carried forward. The badge is handled separately: its background is translucent
  // (10% lime), so it has no static hex to resolve — see the composite block below.
  { id: 'TrustBar eyebrow',             sel: '.trustbar-eyebrow',      fg: 'var(--gray-600)',    bg: 'var(--gray-50)',         level: 'AA' },
  { id: 'TrustBar logo label',          sel: '.trustbar-logo',         fg: 'var(--black)',       bg: 'var(--gray-50)',         level: 'AA' },
  // DirectRescue keeps its dark band unchanged; pinned so a later edit cannot drift it.
  { id: 'DirectRescue h2',              sel: 'h2.text-h2.text-\\[\\#F6F3EB\\]',   fg: '#F6F3EB',            bg: '#18150F',                level: 'AA-large' },
  { id: 'DirectRescue lede',            sel: 'p.text-lg.text-\\[\\#A79E8C\\]',    fg: '#A79E8C',            bg: '#18150F',                level: 'AA' },
  // JourneyShowcase gained a frame but kept its paper surface and type colours.
  { id: 'Journey h2 on paper',          sel: 'h2.text-h2.font-medium',        fg: 'var(--color-text)',  bg: 'var(--color-body)',      level: 'AA-large' },
  { id: 'Journey lede on paper',        sel: 'p.text-lg.mt-4',                fg: 'var(--color-text-light)', bg: 'var(--color-body)', level: 'AA' },
  { id: 'Journey frame chrome url',     sel: '.demo-chrome .url',      fg: '#8a9494',            bg: '#12100c',                level: 'AA' },

  // ── Phase 2c ──
  // ProofStrip and ComparisonTable both had TRANSLUCENT section surfaces (/70 and /60
  // dark over the paper page). Both are now opaque, and every pair below is measured
  // against the real rendered surface. Pinned rather than checked-and-discarded so a
  // later re-tint cannot silently reintroduce the failure.
  { id: 'ProofStrip heading',           sel: 'h2.text-h2.text-\\[\\#F6F3EB\\]',   fg: '#F6F3EB',            bg: '#18150F',                level: 'AA-large' },
  { id: 'ProofStrip lede',              sel: 'p.text-lg.text-\\[\\#A79E8C\\]',    fg: '#A79E8C',            bg: '#18150F',                level: 'AA' },
  { id: 'IconTrio h3',                  sel: 'h3.text-xl.text-\\[\\#F6F3EB\\]',   fg: '#F6F3EB',            bg: '#18150F',                level: 'AA' },
  { id: 'IconTrio body',                sel: 'p.text-sm.text-\\[\\#A79E8C\\]',    fg: '#A79E8C',            bg: '#18150F',                level: 'AA' },
  { id: 'ComparisonTable lede',         sel: '.comparison-section p',  fg: 'var(--color-gray)',  bg: 'var(--color-body)',      level: 'AA' },
  { id: 'ComparisonTable cell',         sel: 'td.px-4.text-\\[\\#A79E8C\\]',      fg: '#A79E8C',            bg: '#1B1811',                level: 'AA' },
  { id: 'Footer §29.8 disclosure',      sel: 'p.text-gray',                   fg: 'var(--color-gray)',  bg: 'var(--color-body)',      level: 'AA' },

  // ── Phase 2d — FAQ ──
  // ESTABLISHING A BASELINE, NOT COMPARING TO ONE. The FAQ and Pricing are React
  // islands (client:visible) and were never in this list: before 2d there were ZERO
  // pairs for either, so "0 FAIL" across 30 pairs was true only of the sections that
  // happened to be listed. These six rows are the FAQ's first measurement — read them as
  // a starting point, not as an after-figure with a before behind it.
  //
  // Surfaces are real: the accordion is `bg-card` (#fffdf8) on the `--color-body` page,
  // not on paper, and its answer text is `text-gray`. The badge pill interior is the
  // same `bg-gradient-black-grid` used by nine other sections, so its two stops are
  // scored at both ends exactly as the hero badge is.
  { id: 'FAQ h2 on body',               sel: 'h2.text-h1',                    fg: 'var(--color-text)',      bg: 'var(--color-body)',      level: 'AA-large' },
  { id: 'FAQ subtitle on body',         sel: 'p.text-lg',                     fg: 'var(--color-text)',      bg: 'var(--color-body)',      level: 'AA' },
  { id: 'FAQ question on card',         sel: 'h3.text-xl.font-medium',        fg: 'var(--color-text)',      bg: 'var(--color-card)',      level: 'AA' },
  { id: 'FAQ answer on card',           sel: 'div.mt-4.text-gray',            fg: 'var(--color-gray)',      bg: 'var(--color-card)',      level: 'AA' },
  { id: 'FAQ badge label @stop0%',      sel: 'span.gradient-text-primary',    fg: 'var(--color-primary)',   bg: 'var(--color-dark)',      level: 'AA' },
  { id: 'FAQ badge label @stop100%',    sel: 'span.gradient-text-primary',    fg: 'var(--color-secondary)', bg: 'var(--color-dark-gray)', level: 'AA' }
]

// Pairs whose background is TRANSLUCENT and therefore has no resolvable hex in the
// stylesheet — the effective colour depends on what is behind it. Composited here
// explicitly, because carrying a pre-composite number forward is exactly how
// TrustBar's badge would have shipped at 1.22:1: `text-primary` on `bg-primary/10`
// measured 10.54:1 over the old dark band and never changed its own declaration, but
// the surface under it flipped to a light tint.
const COMPOSITE_PAIRS = [
  { id: 'TrustBar badge text', fg: '#12100c', over: '#d2ec2a', alpha: 0.10, base: '#faf8f1', level: 'AA' }
]

const THRESHOLD = { AA: 4.5, 'AA-large': 3.0 }

// ── run ──────────────────────────────────────────────────────────────────────
let cssPath = process.argv[2]
if (!cssPath) {
  const dir = 'dist/_astro'
  const html = readFileSync('dist/index.html', 'utf8')
  const linked = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map(m => m[1])
  // ALL linked stylesheets, not just the first. R4 scoped home-design.css to the
  // homepage entry, so `/` now links two files and the tokens are split across them:
  // --color-* live in the Base bundle, --lime/--paper/--gray-* in the homepage one.
  // Reading only linked[0] silently turned 12 pairs into "UNRESOLVED" — an audit that
  // reports "cannot score" instead of PASS/FAIL is a false-pass surface, so it reads
  // the whole set the page actually loads.
  cssPath = linked.length
    ? linked.map(h => join('dist', h.replace(/^\//, ''))).join(',')
    : join(dir, readdirSync(dir).find(f => f.endsWith('.css')))
}

const cssFiles = cssPath.split(',')
const css = cssFiles.map(f => readFileSync(f, 'utf8')).join('\n')
// home-design.css tokens are only measurable once they reach dist; fall back to source so
// the orange pairs are still scored pre-wiring, and label them.
let srcVars = {}
try { srcVars = readVars(readFileSync('src/styles/home-design.css', 'utf8')) } catch {}
const distVars = readVars(css)

console.log(`stylesheets (${cssFiles.length}): ${cssFiles.join(" + ")}  (${css.length} chars total)\n`)
console.log('pair'.padEnd(34) + 'fg'.padEnd(10) + 'bg'.padEnd(10) + 'ratio'.padEnd(9) + 'need'.padEnd(7) + 'verdict')
console.log('-'.repeat(84))

let fails = 0, unresolved = 0
for (const p of PAIRS) {
  let fg = toRgb(p.fg, distVars)
  let bg = toRgb(p.bg, distVars)
  let note = ''
  if (!fg) { fg = toRgb(p.fg, { ...srcVars, ...distVars }); if (fg) note = ' (token from source — NOT in dist)' }
  if (!bg) { bg = toRgb(p.bg, { ...srcVars, ...distVars }); if (bg) note = note || ' (token from source — NOT in dist)' }
  if (!fg || !bg) {
    unresolved++
    console.log(p.id.padEnd(34) + 'UNRESOLVED'.padEnd(20) + '—'.padEnd(9) + '—'.padEnd(7) + 'CANNOT SCORE')
    continue
  }
  const r = ratio(fg, bg)
  const need = THRESHOLD[p.level]
  const pass = r >= need
  if (!pass) fails++
  const hex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('')
  console.log(
    p.id.padEnd(34) + hex(fg).padEnd(10) + hex(bg).padEnd(10) +
    r.toFixed(2).padEnd(9) + String(need).padEnd(7) +
    (pass ? 'PASS' : 'FAIL') + ` (${p.level})` + note
  )
}

// Composite (translucent-background) pairs.
for (const p of COMPOSITE_PAIRS) {
  const over = hexToRgb(p.over), base = hexToRgb(p.base), fg = hexToRgb(p.fg)
  const bg = over.map((c, i) => Math.round(c * p.alpha + base[i] * (1 - p.alpha)))
  const r = ratio(fg, bg)
  const need = THRESHOLD[p.level]
  const pass = r >= need
  if (!pass) fails++
  const hex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('')
  console.log(
    p.id.padEnd(34) + p.fg.padEnd(10) + hex(bg).padEnd(10) +
    r.toFixed(2).padEnd(9) + String(need).padEnd(7) +
    (pass ? 'PASS' : 'FAIL') + ` (${p.level}, composited ${p.over}@${p.alpha} over ${p.base})`
  )
}

console.log('-'.repeat(84))
console.log(`${PAIRS.length + COMPOSITE_PAIRS.length} pairs · ${fails} FAIL · ${unresolved} unresolved`)

// ── ZERO-MATCH GUARD ─────────────────────────────────────────────────────────
// THE DEFECT THIS EXISTS FOR: 2a rebuilt the hero and dropped `class="hero-text"`. The
// pairs `hero <mark> highlight` and `hero h1 on bone` both targeted `.hero-text`, matched
// NOTHING on the homepage from that moment, and reported PASS (13.90 and 16.85) through 2a,
// 2b AND 2c. A green number for an element that is not on the page is worse than no number:
// it actively certifies the thing it failed to look at. Meanwhile the real <mark> was
// rendering in the browser's default yellow.
//
// A selector's class/id tokens must all appear in the BUILT html. That is a necessary
// condition, not a full CSS engine — it cannot prove the combination matches one element —
// but it catches every failure of this shape at zero cost, which is the shape that shipped.
//
// Tailwind arbitrary values arrive escaped in a selector (`text-\\[\\#F6F3EB\\]`) and
// unescaped in the class attribute (`text-[#F6F3EB]`), so tokens are unescaped before the
// comparison. Getting that backwards would make every arbitrary-value pair look orphaned.
const htmlPath = 'dist/index.html'
const builtHtml = readFileSync(htmlPath, 'utf8')
const domTokens = new Set()
for (const m of builtHtml.matchAll(/\b(?:class|id)="([^"]*)"/g)) {
  for (const t of m[1].split(/\s+/)) if (t) domTokens.add(t)
}
const selTokens = sel => (sel.match(/[.#]((?:\\.|[A-Za-z0-9_-])+)/g) || [])
  .map(t => t.slice(1).replace(/\\(.)/g, '$1'))

const orphans = []
for (const p of PAIRS) {
  const missing = selTokens(p.sel).filter(t => !domTokens.has(t))
  if (missing.length) orphans.push({ id: p.id, sel: p.sel, missing })
}
console.log(`\nZERO-MATCH GUARD — every selector's class/id tokens must exist in ${htmlPath}`)
console.log(`  ${domTokens.size} distinct class/id tokens in the built page`)
if (orphans.length) {
  fails += orphans.length
  for (const o of orphans) {
    console.log(`  ORPHAN ✗  ${o.id.padEnd(32)} sel='${o.sel}'  missing: ${o.missing.join(', ')}`)
  }
  console.log(`  ${orphans.length} selector(s) match NOTHING — a pair that cannot be seen cannot be scored.`)
} else {
  console.log('  clean ✓ — every asserted selector resolves against the built page')
}

// Positive control: the guard must be able to FIRE. A guard that has never failed is
// indistinguishable from one that cannot fail — which is precisely how the orphans above
// survived three phases of green output.
const FAKE = { id: '__positive_control__', sel: '.definitely-not-a-real-class-xyz' }
const fakeMissing = selTokens(FAKE.sel).filter(t => !domTokens.has(t))
console.log(`  guard positive control: fake pair '${FAKE.sel}' -> ${
  fakeMissing.length ? 'DETECTED as orphan ✓' : 'NOT DETECTED ✗ (guard is broken)'}`)
if (!fakeMissing.length) fails++
// Negative control: a token known to be present must NOT be flagged, or the guard would
// report every pair as an orphan and be ignored as noise.
const realTok = domTokens.has('hero-sub')
console.log(`  guard negative control: known-present '.hero-sub' -> ${
  realTok ? 'not flagged ✓' : 'FLAGGED ✗ (guard over-fires)'}`)
if (!realTok) fails++

// ── BAN: --orange-600 must never be a text colour ────────────────────────────
// #e85a1a is 3.24:1 on --paper and 3.21:1 on --orange-50 — both below AA. It is a
// fill/border/icon token only. Scanning the BUILT css catches a reintroduction
// wherever it happens, including in a file this audit does not know about.
const banHits = [...css.matchAll(/color\s*:\s*var\(\s*--orange-600\s*\)/g)]
// `color:` matches `background-color:` as a substring, so re-check the property boundary.
const realBanHits = banHits.filter(m => {
  const before = css.slice(Math.max(0, m.index - 18), m.index)
  return !/(background|border|outline|text-decoration|caret|column-rule|-)$/.test(before)
})
console.log(`\nBAN --orange-600 as text: ${realBanHits.length === 0
  ? 'clean ✓ (0 occurrences of `color: var(--orange-600)`)'
  : `VIOLATED ✗ — ${realBanHits.length} occurrence(s)`}`)
if (realBanHits.length) fails += realBanHits.length

// Positive control for the ban scanner: it must be able to find the pattern at all.
const banControl = /color\s*:\s*var\(\s*--orange-600\s*\)/.test('color:var(--orange-600)')
console.log(`  ban-scanner positive control: ${banControl ? 'detects the pattern ✓' : 'BROKEN ✗'}`)

// ── positive control: a pair that MUST fail, proving the checker can fail ─────
const ctlFg = [0xd2, 0xec, 0x2a]   // lime
const ctlBg = [0xff, 0xff, 0xff]   // white
const ctl = ratio(ctlFg, ctlBg)
console.log(`\npositive control (lime #d2ec2a on white #ffffff): ${ctl.toFixed(2)} — expect FAIL vs 4.5 -> ${ctl < 4.5 ? 'FAILS correctly ✓' : 'DID NOT FAIL ✗ checker is broken'}`)
const ctl2 = ratio([0, 0, 0], [255, 255, 255])
console.log(`positive control (black on white): ${ctl2.toFixed(2)} — expect 21.00 -> ${Math.abs(ctl2 - 21) < 0.01 ? 'correct ✓' : 'WRONG ✗'}`)

process.exitCode = fails > 0 ? 1 : 0
