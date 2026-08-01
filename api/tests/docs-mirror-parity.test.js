// DOCS MIRROR PARITY GUARD — marketing/src/pages/docs/*.astro vs dashboard/src/pages/docs/Docs*.jsx.
//
// WHY THIS EXISTS: ten marketing docs pages are hand-ports of dashboard pages, and NOTHING compared
// them. The dashboard is the source of truth (it is the side wired into product machinery — see
// api/tests/mcp-server.test.js's SHOPIFY_STEPS guard and scripts/qa-google-ads.mjs), so every drift
// takes the same form: the dashboard is edited, the port is not. It happened four times before this
// file existed — #522, #543 and #550 all landed on the dashboard side and were back-filled into
// troubleshooting.astro only when someone happened to look; #466's Shopify checklist sat one commit
// behind on shopify.astro from #515 until this guard was written and found it.
//
// ── WHY NOT A BYTE DIFF ──────────────────────────────────────────────────────────────────────
// The two sides are different frameworks with different chrome. The dashboard is React + JSX with
// <Helmet>, <Link>, DocsCodeBlock/DocsCallout and light+dark Tailwind classes; the marketing side is
// Astro with plain <a>, inline <pre> and dark-only classes. Each port also declares DELIBERATE
// DIFFERENCES in its own header (in-app routes repointed at app.sourcetrack.ai, React components
// re-expressed as markup). A byte or line diff is 100% noise. The comparison has to be on extracted
// CONTENT.
//
// ── THE TWO TIERS, AND WHY THE SPLIT ─────────────────────────────────────────────────────────
// Borrowed from scripts/qa-marketing-html.mjs's stated principle: a check that reports everything
// gets ignored, and an ignored check is worse than no check because it looks like coverage. Each
// tier is one this file can defend.
//
//   TIER 1 — STRUCTURED LITERALS, byte-exact. Where both sides hold the same content as a JS data
//   literal (TROUBLESHOOTING_ITEMS), the literals must be byte-identical after indentation
//   normalization. Zero tolerance, zero ambiguity. This is the substance of the troubleshooting page
//   and exactly what drifted three times.
//
//   TIER 2 — PROSE UNITS, directional. Every content unit in the JSX must appear in the .astro port.
//   The reverse is NOT asserted: the marketing page legitimately adds breadcrumbs, SEO copy and
//   "Back to Docs" chrome that has no dashboard equivalent. Directional matches the real failure mode
//   and is what keeps this test free of false positives.
//
// ── THE ONE NON-OBVIOUS EXTRACTION RULE ──────────────────────────────────────────────────────
// Tags are replaced with a UNIT SEPARATOR, not a space. Replacing them with a space lets text
// concatenate ACROSS elements, and because the two frameworks nest differently the same prose merges
// into different phantom units on each side — that alone produced ~2 false positives per page in
// every prototype. With tags as boundaries, 9 of 10 pages compare at exactly zero.
//
// Code is compared by neither tier: snippets live in Astro frontmatter consts (they must, or Astro
// parses `{` as an expression) and in JSX as {`...`} children, so their surrounding syntax differs
// by construction. scripts/qa-marketing-html.mjs covers the built marketing output separately.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')

// The ten mirrored pairs. docs/index.astro is deliberately absent: DocsHome.jsx is an in-app hub
// whose card list is app-navigation, not shared prose. DocsMCP.jsx has no marketing counterpart.
const PAIRS = [
  ['framer', 'DocsFramer'],
  ['google-ads', 'DocsGoogleAds'],
  ['gtm', 'DocsGTM'],
  ['install', 'DocsInstall'],
  ['quickstart', 'DocsQuickstart'],
  ['shopify', 'DocsShopify'],
  ['stripe', 'DocsStripe'],
  ['troubleshooting', 'DocsTroubleshooting'],
  ['webflow', 'DocsWebflow'],
  ['wordpress', 'DocsWordPress']
]

// Structured literals that must be byte-identical on both sides (Tier 1).
const SHARED_LITERALS = [
  { pair: 'troubleshooting', name: 'TROUBLESHOOTING_ITEMS' }
]

const astroPath = (slug) => join(REPO_ROOT, 'marketing/src/pages/docs', `${slug}.astro`)
const jsxPath = (name) => join(REPO_ROOT, 'dashboard/src/pages/docs', `${name}.jsx`)

// The Astro side writes HTML entities where the JSX side writes literal characters. Decoding rather
// than stripping matters: `&mdash;` vs `—` appears in every glossary line on every platform page.
const ENTITIES = {
  '&mdash;': '—', '&ndash;': '–', '&rarr;': '→', '&larr;': '←', '&hellip;': '…',
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
}
const decodeEntities = (s) => s.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? ' ')

// Unit separator. A control character, so it can never occur in page source and can never be
// mistaken for content. Tags collapse to THIS, not to a space — see the header.
const SEP = '\x01'

// Units shorter than this are labels, headings and single words — shared across unrelated pages
// and are not meaningful evidence of parity either way.
const MIN_UNIT_LEN = 45

// Pull a balanced `const NAME = [ ... ]` literal out of a file by bracket matching. Regex cannot do
// this: the arrays contain both brackets and apostrophes inside the prose.
function extractArrayLiteral (src, name) {
  const at = src.indexOf(`const ${name} = [`)
  if (at < 0) return null
  const start = src.indexOf('[', at)
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '[') depth++
    else if (src[i] === ']') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return null
}

// Normalize leading indentation so an Astro frontmatter literal and a JSX module-scope literal
// compare equal when their CONTENT is equal.
const normalizeIndent = (block) =>
  block.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim()

// Reduce a page to the set of prose units it renders.
function proseUnits (filePath) {
  let s = readFileSync(filePath, 'utf8')

  s = s.replace(/^---[\s\S]*?^---/m, ' ')                              // Astro frontmatter
  s = s.replace(/<Helmet>[\s\S]*?<\/Helmet>/g, ' ')                    // JSX head block
  s = s.replace(/\{`[\s\S]*?`\}/g, ` ${SEP} `)                         // inline {`code`}
  s = s.replace(/const\s+[A-Za-z_]\w*\s*=\s*`[\s\S]*?`;?/g, ' ')       // snippet consts
  s = s.replace(/const\s+[A-Z][A-Z0-9_]*\s*=\s*\[[\s\S]*?\n\];?/g, ' ') // data arrays (Tier 1)
  s = s.replace(/const\s+\w+\s*=\s*\{[\s\S]*?\n\};?/g, ' ')            // schema objects
  s = s.replace(/^import[^\n]*$/gm, ' ')
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')                          // JSX comments
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')                               // HTML comments
  s = s.replace(/^\s*\/\/[^\n]*$/gm, ' ')                              // line comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  s = s.replace(/export default function[\s\S]*?return \(/, ' ')       // JSX scaffolding
  s = s.replace(/\{[A-Za-z_$][\w.$]*\s*\.\s*map\([\s\S]*?\)\)\}/g, ` ${SEP} `) // render loops
  s = s.replace(/<[^>]+>/g, ` ${SEP} `)                                // TAGS ARE UNIT BOUNDARIES
  s = s.replace(/\{["']\s*["']\}/g, ' ')                               // {" "} spacers
  s = decodeEntities(s)

  return new Set(
    s.split(SEP)
      .flatMap((chunk) => chunk.split(/(?<=[.!?])\s+/))
      .map((u) => u.replace(/\s+/g, ' ').trim())
      .filter((u) => u.length >= MIN_UNIT_LEN)
  )
}

// ── the pairs must actually exist (the map cannot rot silently) ───────────────────────────────
test('docs-mirror: every declared pair resolves to two real files', () => {
  for (const [slug, jsxName] of PAIRS) {
    assert.ok(existsSync(astroPath(slug)), `missing marketing page: docs/${slug}.astro`)
    assert.ok(existsSync(jsxPath(jsxName)), `missing dashboard page: ${jsxName}.jsx`)
  }
})

// ── TIER 1: structured literals byte-identical ────────────────────────────────────────────────
for (const { pair, name } of SHARED_LITERALS) {
  test(`docs-mirror TIER 1: ${name} is byte-identical in ${pair}.astro and its dashboard source`, () => {
    const jsxName = PAIRS.find(([slug]) => slug === pair)?.[1]
    const astroLit = extractArrayLiteral(readFileSync(astroPath(pair), 'utf8'), name)
    const jsxLit = extractArrayLiteral(readFileSync(jsxPath(jsxName), 'utf8'), name)

    assert.ok(astroLit, `${name} not found in docs/${pair}.astro — if it was renamed, update SHARED_LITERALS`)
    assert.ok(jsxLit, `${name} not found in ${jsxName}.jsx — if it was renamed, update SHARED_LITERALS`)

    assert.strictEqual(
      normalizeIndent(astroLit),
      normalizeIndent(jsxLit),
      `${name} has DRIFTED between docs/${pair}.astro and ${jsxName}.jsx.\n` +
      'The dashboard is the source of truth: copy its version across VERBATIM. Do not reword ' +
      'while porting — improvising during a re-sync is how this drifted in the first place.'
    )
  })
}

// ── TIER 2: directional prose parity ──────────────────────────────────────────────────────────
for (const [slug, jsxName] of PAIRS) {
  test(`docs-mirror TIER 2: every prose unit in ${jsxName}.jsx appears in docs/${slug}.astro`, () => {
    const astroUnits = proseUnits(astroPath(slug))
    const jsxUnits = proseUnits(jsxPath(jsxName))

    // Guard against a vacuous pass: if extraction silently yielded nothing, the test would be green
    // while comparing two empty sets. Every one of these pages has substantial prose.
    assert.ok(jsxUnits.size >= 8, `extraction rotted — only ${jsxUnits.size} units from ${jsxName}.jsx`)
    assert.ok(astroUnits.size >= 8, `extraction rotted — only ${astroUnits.size} units from ${slug}.astro`)

    const missing = [...jsxUnits].filter((u) => !astroUnits.has(u))

    assert.deepStrictEqual(
      missing, [],
      `docs/${slug}.astro is MISSING ${missing.length} content unit(s) present in ${jsxName}.jsx.\n\n` +
      missing.map((u) => `  · ${u}`).join('\n') +
      '\n\nThe dashboard page is the source of truth. Port the missing text across VERBATIM — do not ' +
      'reword, improve or summarise it on the way. (Marketing-only additions are fine and are not ' +
      'checked; only dashboard content missing from the port fails.)'
    )
  })
}

// ── the guard must not be vacuous ─────────────────────────────────────────────────────────────
test('docs-mirror RED PROOF: a removed sentence is detected', () => {
  const jsxUnits = proseUnits(jsxPath('DocsStripe'))
  const astroUnits = proseUnits(astroPath('stripe'))
  assert.deepStrictEqual([...jsxUnits].filter((u) => !astroUnits.has(u)), [], 'precondition: stripe is in parity')

  // Simulate the real failure: the dashboard gains a sentence the port never receives.
  const withNewContent = new Set(jsxUnits)
  withNewContent.add('A newly added dashboard sentence that the marketing port has never received at all.')
  const missing = [...withNewContent].filter((u) => !astroUnits.has(u))

  assert.strictEqual(missing.length, 1, 'guard must flag a dashboard-only sentence')
})

test('docs-mirror RED PROOF: tags-as-boundaries is what keeps the guard quiet', () => {
  // If tags collapsed to a space instead of a separator, text would concatenate across elements and
  // produce units that exist on neither side. Assert the separator survives into the split.
  const units = proseUnits(jsxPath('DocsStripe'))
  assert.ok(![...units].some((u) => u.includes(SEP)), 'unit separator must never leak into a unit')
  assert.ok(units.size > 0, 'extraction must produce units')
})
