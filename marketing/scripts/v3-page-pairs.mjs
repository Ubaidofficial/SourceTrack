#!/usr/bin/env node
// V3 PER-PAGE CONTRAST PAIRS — the scaffold that keeps the zero-match guard from going blind.
//
// THE PROBLEM THIS SOLVES. contrast-audit.mjs's zero-match guard fails loudly when an
// asserted selector matches nothing in the built page. That is what would have caught
// `.hero-text > mark` orphaning itself in 2a — but it only covers pairs that are DECLARED.
// A v3 page whose pairs were never added is not "passing"; it is unmeasured, and the audit
// reports a clean run either way. Across 12 pages that gap compounds.
//
// So: every v3 page registers here IN THE SAME PR THAT BUILDS IT. A page present in the
// build but absent from this registry FAILS — silence is not consent.
//
// Usage:  node scripts/v3-page-pairs.mjs        (after an astro build)

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// ── the registry ─────────────────────────────────────────────────────────────
// route -> pairs. Add a page's entry in the PR that creates the page.
// `sel` must be a REAL CSS selector whose class/id tokens exist in that page's built HTML —
// not a descriptive label. Nine descriptive labels in contrast-audit.mjs had to be rewritten
// precisely because a label cannot be verified against a DOM.
export const V3_PAGE_PAIRS = {
  // ── /v3 homepage. Registered in the SAME PR that builds the page. ──────────
  // ⚠️ THE DARK BAND (section 4) IS WHY THIS MATTERS. Flipping a section's surface
  // invalidates every carried-forward number on it, even when the text's own CSS
  // is untouched: TrustBar's badge went 10.54 -> 1.22 on exactly this kind of flip
  // in 2b because the surface beneath it changed. Every pair on a dark surface
  // below is computed against that surface, not inherited from a light one.
  '/v3': [
    // dark band — section 4, the new surface
    { id: 'dark band title', sel: '.v3-section--dark .v3-section-title', fg: '#f6f3eb', bg: '#0B0A07', level: 'AA-large' },
    { id: 'dark band lede', sel: '.v3-section--dark .v3-section-lede', fg: '#a79e8c', bg: '#0B0A07', level: 'AA' },
    { id: 'dark band eyebrow', sel: '.v3-section--dark .v3-eyebrow', fg: '#a79e8c', bg: '#0B0A07', level: 'AA' },
    // bento cells — a second, lighter dark surface (--v3-black-700), scored separately
    { id: 'bento dark h3', sel: '.v3-bento-cell-dark', fg: '#f6f3eb', bg: '#2A251E', level: 'AA' },
    { id: 'bento dark body', sel: '.v3-bento-cell-dark', fg: '#a79e8c', bg: '#2A251E', level: 'AA' },
    // accent cell — ink on a lime tint. §3.6: lime is a SURFACE you put dark text on.
    { id: 'bento accent h3', sel: '.v3-bento-cell-accent', fg: '#161310', bg: '#E9F58A', level: 'AA' },
    // ⚠️ SECTION 18 PAIRS RE-SCORED, NOT CARRIED FORWARD. The full-bleed lime band
    // was replaced with a paper close (§2.6's "never a full-bleed wash behind primary
    // content"), so every ratio measured against the lime surface is VOID — a
    // carried-forward ratio across a surface flip is the TrustBar 10.54 -> 1.22 failure
    // exactly, and it happens without the text's own CSS changing.
    //
    // ⚠️ WHY OPTION 2 IS RIGHT — AND WHY THE ORIGINAL ARGUMENT FOR IT WAS NOT.
    // Recorded so the next reader inherits the correct reasoning, not the bad one.
    //
    // The ruling was made on measured coverage of 30.9% desktop / 32.1% mobile
    // against §2.6's ~15% ceiling. Those figures were invalid. --v3-accent was
    // unresolved at the time (see v3-tokens.css), so `.v3-cta-band`'s background
    // computed to `transparent` and real lime coverage was ZERO. Worse, the
    // replacement was equally unpainted: `.v3-btn-accent` sets background and
    // color from --v3-accent / --v3-ink, both dead. Both states rendered zero
    // lime, so option 2 was a visual no-op when it was ruled — it did not remove
    // a lime close, it chose where lime would land once the tokens were fixed.
    //
    // OPTION 2 STANDS ANYWAY, on §2.6's SECOND clause, which is independent of
    // coverage: a full-bleed lime wash behind an <h2> and a <p> is the named
    // never-case regardless of how many pixels it occupies. That was true before
    // the tokens broke and is true now that lime paints. A button is on §2.6's
    // own acceptable-uses list. Destination right, original reasoning wrong.
    //
    // Do not "restore" the band by citing the 30.9%/32.1% figures as evidence it
    // was once justified. They measured a transparent box.
    // The lede also stopped using opacity .82 and takes --v3-gray-600 instead: a token
    // has a fixed value, an opacity has to be composited before it can be scored.
    { id: 'CTA close heading on paper', sel: '.v3-cta-close h2', fg: 'var(--v3-ink)', bg: 'var(--v3-paper)', level: 'AA-large' },
    { id: 'CTA close lede on paper', sel: '.v3-cta-close p', fg: '#665F50', bg: '#F7F4ED', level: 'AA' },
    // The button is now the ENTIRE accent presence in section 18 — and lime as a button
    // is on §2.6's own acceptable-uses list, not a workaround around it.
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#12100C', bg: '#D2EC2A', level: 'AA' },
    // light surfaces
    { id: 'frame chrome url', sel: '.v3-frame-url', fg: '#8a9494', bg: '#12100C', level: 'AA' },
    { id: 'card body on paper-card', sel: '.v3-card p', fg: '#665F50', bg: '#FFFDF8', level: 'AA' },
    { id: 'eyebrow on paper', sel: '.v3-eyebrow', fg: '#5B5548', bg: '#F7F4ED', level: 'AA' }
  ],
  // ── /v3/pricing ───────────────────────────────────────────────────────────
  '/v3/pricing': [
    { id: 'plan name on card', sel: '.v3-plan h3', fg: '#161310', bg: '#FFFDF8', level: 'AA' },
    { id: 'plan feature li', sel: '.v3-plan li', fg: '#5B5548', bg: '#FFFDF8', level: 'AA' },
    { id: 'plan-alt small', sel: '.v3-plan-alt', fg: '#665F50', bg: '#FFFDF8', level: 'AA' },
    // The featured plan uses a 2px accent BORDER and a small badge, never a lime
    // fill: §2.6's acceptable uses are a badge, a button, a highlighted line. A
    // filled card would be lime behind primary content, the clause with no budget.
    { id: 'plan badge ink on lime', sel: '.v3-plan-badge', fg: '#12100C', bg: '#D2EC2A', level: 'AA' },
    { id: 'toggle active', sel: '.v3-billing-toggle span[data-active]', fg: '#12100C', bg: '#FFFDF8', level: 'AA' },
    { id: 'toggle inactive', sel: '.v3-billing-toggle span', fg: '#5B5548', bg: '#EFEADC', level: 'AA' },
    { id: 'table cell', sel: '.v3-table-card td', fg: '#665F50', bg: '#FFFDF8', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#12100C', bg: '#F7F4ED', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#12100C', bg: '#D2EC2A', level: 'AA' }
  ],
  // ── /v3/compare-ga4 ───────────────────────────────────────────────────────
  '/v3/compare-ga4': [
    { id: 'compare panel label', sel: '.v3-compare-panel h3', fg: '#5B5548', bg: '#FFFDF8', level: 'AA' },
    { id: 'compare value', sel: '.v3-compare-value', fg: '#12100C', bg: '#FFFDF8', level: 'AA-large' },
    { id: 'compare panel body', sel: '.v3-compare-panel p', fg: '#665F50', bg: '#FFFDF8', level: 'AA' },
    // Dark band pairs are scored against THIS page's dark surface, not carried
    // over from the homepage — same tokens, but a carried-forward ratio across a
    // surface is the habit that produced TrustBar 10.54 -> 1.22.
    { id: 'dark band title', sel: '.v3-section--dark .v3-section-title', fg: '#f6f3eb', bg: '#0B0A07', level: 'AA-large' },
    { id: 'dark band lede', sel: '.v3-section--dark .v3-section-lede', fg: '#a79e8c', bg: '#0B0A07', level: 'AA' },
    { id: 'stat label', sel: '.v3-stat-label', fg: '#5B5548', bg: '#F7F4ED', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#12100C', bg: '#F7F4ED', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#12100C', bg: '#D2EC2A', level: 'AA' }
  ],
}

// Pages that exist in the build and must therefore be registered above.
// Populated as v3 pages land; a page here with no pairs is an error, not a skip.
export const V3_ROUTES = ['/v3', '/v3/pricing', '/v3/compare-ga4']

const DIST = 'dist'
let fails = 0

// ── SCORING ──────────────────────────────────────────────────────────────────
// ⚠️ ADDED AFTER THE TOKEN DEFECT. Until now this script resolved SELECTORS and
// nothing else — every `fg`/`bg` in the registry above was declared and never
// computed. That is 29 asserted ratios (68 once Phase 4/5 land) that no check
// could contradict, and it is why --v3-accent could resolve to NOTHING across
// #660, #661 and #662 while this script printed "registry clean" every time.
//
// It is the same class as `.hero-text > mark` orphaning itself while every
// numeric check passed: a number that looks answered and is not. The fix is not
// a corrected constant, it is a control that fails loudly.
//
// Unresolvable colours FAIL rather than skip. Unmeasured has to be louder than
// passing or the gap silently reopens.
//
// ⚠️ KNOWN LIMIT OF THE PAIR SCORER — READ BEFORE TRUSTING A GREEN RUN.
// This scorer only computes what a pair DECLARES. A pair written with literal
// hexes — { fg: '#12100C', bg: '#D2EC2A' } — scores green whether or not the
// element's real CSS token is alive, because the scorer never looks at the rule
// that styles the element. It checks that the SELECTOR exists and that the
// DECLARED colours contrast; it does not check that the declared colours are
// what the element actually renders.
//
// That is exactly how --v3-accent stayed dead for three PRs: most pairs declare
// hexes, so they kept passing while the token feeding those elements resolved to
// nothing. Only the pair that happened to declare `var(--v3-ink)` /
// `var(--v3-paper)` ever failed.
//
// The TOKEN RESOLUTION block at the bottom is what closes this. It checks every
// --v3-* token independently of how any pair is written. NEITHER GUARD IS
// SUFFICIENT ALONE — a green pair run does not mean the page renders correctly,
// and a clean token run does not mean the contrast is adequate. Both must pass,
// and a future edit that removes either one reopens the hole.
//
// (Documented here rather than in a review comment on purpose: a limit that
// lives only in a chat message is the fictional-guard pattern in reverse — the
// next reader inherits the check without inheriting what it cannot do.)
const THRESHOLD = { AA: 4.5, 'AA-large': 3, AAA: 7 }

function hexToRgb (hex) {
  const h = String(hex).trim().replace(/^#/, '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return /^[0-9a-fA-F]{6}$/.test(full) ? [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) : null
}

function luminance ([r, g, b]) {
  const f = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio (fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

function readVars (css) {
  const vars = {}
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi)) {
    if (!(m[1].trim() in vars)) vars[m[1].trim()] = m[2].trim()
  }
  return vars
}

// Returns null when a var() names a property that does not exist and has no
// fallback — which is exactly what the browser does with it (guaranteed-invalid
// -> the declaration is invalid at computed-value time). Silently treating that
// as "some colour" is the bug this whole block exists to prevent.
function resolveVar (value, vars, depth = 0) {
  if (depth > 10 || typeof value !== 'string') return value
  const m = value.match(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/i)
  if (!m) return value
  const next = vars[m[1]] ?? m[2]
  if (next === undefined) return null
  return resolveVar(value.replace(m[0], next.trim()), vars, depth + 1)
}

const toRgb = (v, vars) => {
  const r = resolveVar(String(v).trim(), vars)
  return r === null ? null : hexToRgb(r.trim())
}

const cssFiles = () => {
  try {
    return readdirSync(join(DIST, '_astro')).filter(f => f.endsWith('.css'))
      .map(f => join(DIST, '_astro', f))
  } catch { return [] }
}

// ⚠️ INLINE <style> BLOCKS COUNT. Astro's `inlineStylesheets: 'auto'` emits small
// stylesheets INTO THE HTML rather than as a bundle — v3-pages.css never appears
// in dist/_astro at all, so its billing toggle, compare split, plan badge and
// featured-plan border live only in inline <style>. Reading just dist/_astro/*.css
// makes every one of those rules, and any custom property declared alongside
// them, invisible to this script.
//
// That is the same blindness this whole file exists to close, one level down: a
// harness that reports green because it never opened the place the CSS actually
// is. Found while confirming .v3-plan-badge and .v3-plan--featured — both of
// which are inline-only and were dead on main.
const inlineStyles = () => {
  const out = []
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name))
      else if (e.name.endsWith('.html')) {
        const html = readFileSync(join(dir, e.name), 'utf8')
        for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) out.push(m[1])
      }
    }
  }
  try { walk(DIST) } catch { /* no dist yet — caller already handles that */ }
  return out
}

const ALL_CSS = [
  ...cssFiles().map(f => readFileSync(f, 'utf8')),
  ...inlineStyles()
].join('\n')
const VARS = readVars(ALL_CSS)

// ── run only when invoked directly ───────────────────────────────────────────
// ⚠️ contrast-audit.mjs IMPORTS this file to verify no built v3 page is left
// unaudited. Without this guard that import executes the whole runner and hits
// process.exit, so the importing script dies mid-audit — a scope guard that
// kills its own caller is worse than no scope guard.
const IS_MAIN = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (IS_MAIN) {

console.log('V3 per-page contrast-pair registry\n')

if (!existsSync(DIST)) {
  console.error('no dist/ — run `npx astro build` first')
  process.exit(2)
}

// ── coverage check: every registered route must exist, every built v3 route registered ──
for (const route of V3_ROUTES) {
  const p = route === '/' ? join(DIST, 'index.html') : join(DIST, route.replace(/^\//, ''), 'index.html')
  if (!existsSync(p)) {
    console.error(`  ✗ ${route}: registered but NOT BUILT (${p})`)
    fails++
    continue
  }
  const pairs = V3_PAGE_PAIRS[route]
  if (!pairs || !pairs.length) {
    console.error(`  ✗ ${route}: built but has NO PAIRS — unmeasured, not passing`)
    fails++
    continue
  }
  // Necessary condition: every class/id token a selector requires must exist in that page.
  // Tailwind arbitrary values arrive escaped in a selector and unescaped in the attribute,
  // so tokens are unescaped before comparison — getting that backwards makes every
  // arbitrary-value pair look orphaned.
  const html = readFileSync(p, 'utf8')
  const domTokens = new Set()
  for (const m of html.matchAll(/\b(?:class|id)="([^"]*)"/g)) {
    for (const t of m[1].split(/\s+/)) if (t) domTokens.add(t)
  }
  const selTokens = sel => (sel.match(/[.#]((?:\\.|[A-Za-z0-9_-])+)/g) || [])
    .map(t => t.slice(1).replace(/\\(.)/g, '$1'))
  let orphans = 0
  let bad = 0
  for (const pair of pairs) {
    const missing = selTokens(pair.sel).filter(t => !domTokens.has(t))
    if (missing.length) {
      console.error(`  ✗ ${route}  ${pair.id}: sel='${pair.sel}' misses ${missing.join(', ')}`)
      orphans++
    }
    // Actually COMPUTE the declared colours. Unresolvable is a failure, not a skip.
    const fg = toRgb(pair.fg, VARS)
    const bg = toRgb(pair.bg, VARS)
    if (!fg || !bg) {
      console.error(`  ✗ ${route}  ${pair.id}: UNRESOLVED colour (fg='${pair.fg}' bg='${pair.bg}') — unmeasured, not passing`)
      bad++
      continue
    }
    const r = ratio(fg, bg)
    const need = THRESHOLD[pair.level] ?? 4.5
    if (r < need) {
      console.error(`  ✗ ${route}  ${pair.id}: ${r.toFixed(2)} < ${need} (${pair.level})`)
      bad++
    }
  }
  if (orphans || bad) fails += orphans + bad
  else console.log(`  ✓ ${route}: ${pairs.length} pair(s), selectors resolve + ratios pass`)
}

if (!V3_ROUTES.length) {
  console.log('  (no v3 routes registered yet — Phase 1 ships the scaffold, pages register as they land)')
}

// ── positive control: the coverage check must be able to fail ────────────────
{
  const fakeTokens = new Set(['real-class'])
  const selTokens = sel => (sel.match(/[.#]((?:\\.|[A-Za-z0-9_-])+)/g) || []).map(t => t.slice(1))
  const missing = selTokens('.definitely-not-present').filter(t => !fakeTokens.has(t))
  console.log(`\n  positive control: fake selector detected as orphan -> ${missing.length ? 'YES ✓' : 'NO ✗ (guard broken)'}`)
  if (!missing.length) fails++
  const ok = selTokens('.real-class').filter(t => !fakeTokens.has(t))
  console.log(`  negative control: known-present selector not flagged -> ${ok.length === 0 ? 'YES ✓' : 'NO ✗ (over-fires)'}`)
  if (ok.length) fails++
}

// ── controls on the SCORER ───────────────────────────────────────────────────
// The coverage controls above say nothing about whether a RATIO can fail. These
// do. Without them the scorer could return a constant and the run would look
// identical to a real pass.
{
  const lime = ratio(hexToRgb('#d2ec2a'), hexToRgb('#ffffff'))
  const bw = ratio(hexToRgb('#000000'), hexToRgb('#ffffff'))
  console.log(`\n  scorer positive control: lime on white = ${lime.toFixed(2)} vs 4.5 -> ${lime < 4.5 ? 'FAILS correctly ✓' : 'PASSES ✗ (scorer broken)'}`)
  if (lime >= 4.5) fails++
  console.log(`  scorer negative control: black on white = ${bw.toFixed(2)} -> ${Math.abs(bw - 21) < 0.01 ? 'correct ✓' : 'wrong ✗'}`)
  if (Math.abs(bw - 21) >= 0.01) fails++
}

// ── TOKEN RESOLUTION — the check that would have caught the #660 defect ──────
// ⚠️ THIS IS THE REGRESSION GUARD FOR THE ACTUAL BUG. Seven of nine Tier-2
// aliases in v3-tokens.css named custom properties that do not exist
// (--color-bg, --color-surface, --color-accent, --color-accent-text,
// --color-spend, --color-spend-text, --color-danger). Every one silently became
// `unset`, so --v3-accent painted NOTHING — the full-bleed CTA band measured for
// the §2.6 ruling was transparent, not lime — and three PRs shipped green.
//
// Broader than the pair scorer above, which only sees tokens a pair happens to
// declare. USED-and-dead fails. UNUSED-and-dead is printed BY NAME, because
// silence is what let this run for three PRs.
//
// The positive control below reconstructs the exact #660 defect — an alias
// pointing at a non-existent --color-* name — and asserts it is detected. That
// is the "proves it can fail on exactly this" requirement.
{
  console.log('\nTOKEN RESOLUTION — every --v3-* colour token must resolve')
  const skip = /(radius|shadow|gutter|max|ease|font)/
  const names = Object.keys(VARS).filter(n => n.startsWith('--v3-') && !skip.test(n))
  const usedBy = n => (ALL_CSS.match(new RegExp(`var\\(\\s*${n}\\b`, 'g')) || []).length
  const dead = names.filter(n => toRgb(`var(${n})`, VARS) === null)
  const deadUsed = dead.filter(n => usedBy(n) > 0)
  const deadUnused = dead.filter(n => usedBy(n) === 0)

  console.log(`  ${names.length} colour token(s) checked`)
  for (const n of deadUsed) console.error(`  ✗ ${n}: ${VARS[n]} -> UNRESOLVABLE, used ${usedBy(n)}x (renders as unset)`)
  for (const n of deadUnused) console.log(`  ⚠ ${n}: ${VARS[n]} -> unresolved, 0 uses (declared-only; see v3-tokens.css)`)
  fails += deadUsed.length
  if (!deadUsed.length) console.log('  clean ✓ — every token that is USED resolves to a concrete colour')

  // Positive control: the #660 defect itself, reconstructed.
  const probe = { ...VARS, '--v3-probe-accent': 'var(--color-accent)' }   // the real dead alias
  const caught = toRgb('var(--v3-probe-accent)', probe) === null
  console.log(`  positive control (#660 defect: --v3-accent -> var(--color-accent)) -> ${caught ? 'DETECTED ✓' : 'MISSED ✗ (guard broken)'}`)
  if (!caught) fails++
  // Negative control: a real alias chain must still resolve.
  const live = toRgb('var(--v3-accent)', VARS)
  console.log(`  negative control (--v3-accent resolves today) -> ${live ? `#${live.map(v => v.toString(16).padStart(2, '0')).join('')} ✓` : 'UNRESOLVED ✗'}`)
  if (!live) fails++
}

console.log(fails ? `\n${fails} problem(s)` : '\nregistry clean')
process.exit(fails ? 1 : 0)

}