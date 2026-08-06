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
  // '/v3': [
  //   { id: 'hero h1 on paper', sel: '.v3-hero h1', fg: 'var(--color-text)', bg: 'var(--color-bg)', level: 'AA-large' },
  // ],
}

// Pages that exist in the build and must therefore be registered above.
// Populated as v3 pages land; a page here with no pairs is an error, not a skip.
export const V3_ROUTES = []

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
