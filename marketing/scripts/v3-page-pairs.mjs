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

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

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
}

// Pages that exist in the build and must therefore be registered above.
// Populated as v3 pages land; a page here with no pairs is an error, not a skip.
export const V3_ROUTES = ['/v3']

const DIST = 'dist'
let fails = 0

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
  for (const pair of pairs) {
    const missing = selTokens(pair.sel).filter(t => !domTokens.has(t))
    if (missing.length) {
      console.error(`  ✗ ${route}  ${pair.id}: sel='${pair.sel}' misses ${missing.join(', ')}`)
      orphans++
    }
  }
  if (orphans) fails += orphans
  else console.log(`  ✓ ${route}: ${pairs.length} pair(s), all selectors resolve`)
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

console.log(fails ? `\n${fails} problem(s)` : '\nregistry clean')
process.exit(fails ? 1 : 0)
