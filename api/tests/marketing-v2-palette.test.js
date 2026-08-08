// v2 marketing palette guard — the two pre-v1.3 components and the v2 pages they sit beside.
//
// ╔════════════════════════════════════════════════════════════════════════════════════════╗
// ║ ⚠️  THIS FILE ASSERTS THE v1.4 PALETTE, WHICH design.md v1.5 RETIRED (2026-08-08).      ║
// ║     THAT IS CORRECT FOR NOW. DO NOT "FIX" THE HEXES BELOW IN ISOLATION.                 ║
// ╚════════════════════════════════════════════════════════════════════════════════════════╝
// v1.5 replaced §3 wholesale — lime #D2EC2A -> #CCF03F, warm neutrals -> cool, and #E54545 /
// #FF8800 changed sides. Every value in TOKENS below, and several in RETIRED, is now stale
// against §3.2.
//
// It still passes, and it SHOULD: the two components and the V2_PAGES it scans have not been
// migrated yet. They are still painted in v1.4, so checking them for v1.4-internal consistency
// is exactly right. What this guard must NOT be read as is a statement of the canonical
// palette — design.md §3.2 is that, and it disagrees with TOKENS on every line.
//
// TWO TRAPS, both live right now:
//   · TOKENS is a v1.4 allowlist. Repainting these components to v1.5 will make this guard
//     fail on the CORRECT colours. Rewrite TOKENS in the SAME change that repaints them —
//     never separately, or one half lands green against the wrong half.
//   · RETIRED bans `31,35,35` (as "cool #1F2323 shadow") and `FF8800`. Both are now LIVE
//     values in v1.5: #1F2323 is the ink (§3.2) and #FF8800 is --f-orange (§3.3.1). The ban
//     is still correct HERE, because these components are v1.4 — but copying either pattern
//     into a guard with wider scope would ban what we ship.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// MarketingBeforeAfter.jsx and MarketingInteractiveDemo.jsx were built on a pre-v1.3 cool
// palette: 8 of 9 and 23 of 25 distinct hexes were cool, including #E5E7EB which
// docs/design/design.md §3.8 bans BY NAME, plus a second lime (#C8F000, superseded at v1.3),
// a third (#b5d800), a third orange (#FF8800) and a success green (#18C76E) that §3.8/:439
// forbids outright. They are live on /demo, /solutions/ecommerce and /solutions/saas — v2
// pages that STAY LIVE when /v3 is promoted, so promotion does not fix them.
//
// ── THE TWO CLASSES OF CHECK, AND WHY THE SECOND MATTERS MORE ────────────────────────────────
// (1) No retired value survives — IN ANY FORM. A hex grep alone is not enough: the accent also
//     appeared as `rgba(200,240,0,…)`, decimal RGB for #C8F000, in six places including a
//     box-shadow. A source scan that only looks for `C8F000` reports those files clean while
//     the built CSS still ships the colour. Both forms are checked here.
//
// (2) The STATE distinctions survive. These are interactive components: two hexes that look
//     adjacent can be carrying resting-vs-hover. Collapsing them to one token would leave the
//     markup valid, the palette clean, and the hover feedback silently dead — a regression no
//     colour audit would catch. The pairs are pinned below.

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const p = (...s) => join(REPO, ...s)

const BEFORE_AFTER = p('marketing', 'src', 'components', 'MarketingBeforeAfter.jsx')
const DEMO = p('marketing', 'src', 'components', 'MarketingInteractiveDemo.jsx')
const V2_PAGES = [
  p('marketing', 'src', 'pages', 'solutions', 'saas.astro'),
  p('marketing', 'src', 'pages', 'docs', 'index.astro'),
  p('marketing', 'src', 'pages', 'developers', 'index.astro'),
  p('marketing', 'src', 'pages', 'compare', 'ga4.astro')
]

// Every retired value, with the form it actually appears in. `rgba` entries are the SAME colour
// expressed as decimal RGB — the form a hex-only grep misses.
const RETIRED = [
  { pattern: 'C8F000', why: 'pre-v1.3 lime, §3.8:494 lists it as superseded' },
  { pattern: '200,240,0', why: '#C8F000 as decimal rgba() — the form a hex grep misses' },
  { pattern: 'b5d800', why: 'a third lime; the accent hover is --color-accent-hover #BCD41C' },
  { pattern: '18C76E', why: 'success green; design.md:439 — "Success is lime, not green"' },
  { pattern: 'FF8800', why: 'a third orange; the counterweight is --color-spend #FF7A33' },
  { pattern: 'E5E7EB', why: 'cool grey banned BY NAME at §3.8:496' },
  { pattern: '1C1D20', why: 'cool surface; the dark surface is --color-surface #1B1811' },
  { pattern: '31,35,35', why: 'cool #1F2323 shadow as decimal rgba()' }
]

// Strip line comments so a value NAMED in an explanatory comment (this file documents why
// #18C76E was removed) is not mistaken for a live use. Without this the guard would flag its
// own documentation and force the reasoning to be deleted to stay green.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const liveSource = (f) => stripComments(readFileSync(f, 'utf8'))

// ── 1. No retired value, in any form ────────────────────────────────────────────────────────

test('the two components carry no retired palette value, in hex OR decimal rgba form', () => {
  for (const f of [BEFORE_AFTER, DEMO]) {
    const src = liveSource(f)
    for (const { pattern, why } of RETIRED) {
      assert.ok(
        !new RegExp(pattern, 'i').test(src),
        `${f.split('/').pop()} still carries ${pattern} — ${why}`
      )
    }
  }
})

test('the v2 pages beside them carry no retired surface value', () => {
  for (const f of V2_PAGES) {
    assert.ok(
      !/1C1D20/i.test(liveSource(f)),
      `${f.split('/').pop()} still carries the cool #1C1D20 surface`
    )
  }
})

test('CONTROL — the scan detects a retired value when one is present', () => {
  const planted = 'className="bg-[#C8F000] shadow-[0_0_4px_rgba(200,240,0,0.2)]"'
  const hits = RETIRED.filter(r => new RegExp(r.pattern, 'i').test(planted))
  assert.strictEqual(hits.length, 2, 'must catch BOTH the hex and the decimal rgba form')
  assert.deepStrictEqual(hits.map(h => h.pattern).sort(), ['200,240,0', 'C8F000'])
})

test('CONTROL — the comment stripper does not blind the scan to live code', () => {
  // A value inside a comment is ignored...
  assert.ok(!/18C76E/i.test(stripComments('// was #18C76E before\nconst a = 1')))
  // ...but the SAME value in live code is still caught. Without this half, a stripper bug that
  // swallowed everything would make every check above pass vacuously.
  assert.ok(/18C76E/i.test(stripComments('const c = "#18C76E"')))
})

// ── 2. State distinctions — the checks that matter most ──────────────────────────────────────

test('inactive-tab resting and hover remain DISTINCT colours', () => {
  const src = readFileSync(DEMO, 'utf8')
  const pairs = [...src.matchAll(/text-\[(#[0-9A-Fa-f]{6})\]\s+hover:text-\[(#[0-9A-Fa-f]{6})\]/g)]
  assert.ok(pairs.length >= 2, 'the two tab rows must still declare a resting+hover pair each')
  for (const [, resting, hover] of pairs) {
    assert.notStrictEqual(
      resting.toUpperCase(), hover.toUpperCase(),
      'resting and hover collapsed to one colour — the hover is now a no-op'
    )
  }
})

test('the CTA button hover remains distinct from its resting fill', () => {
  const src = readFileSync(DEMO, 'utf8')
  const m = src.match(/bg-\[(#[0-9A-Fa-f]{6})\][^"]*hover:bg-\[(#[0-9A-Fa-f]{6})\]/)
  assert.ok(m, 'the CTA must still declare a resting fill and a hover fill')
  assert.notStrictEqual(m[1].toUpperCase(), m[2].toUpperCase(), 'CTA hover collapsed into its resting fill')
  assert.strictEqual(m[2].toUpperCase(), '#BCD41C', 'the hover must be --color-accent-hover')
})

test('the active mode button stays distinct from the inactive one', () => {
  const src = readFileSync(DEMO, 'utf8')
  assert.match(src, /activeMode === key\s*\n\s*\?\s*'bg-\[#D2EC2A\] text-\[#12100C\]/, 'active pill must be an accent fill')
  assert.match(src, /:\s*'text-\[#A79E8C\] hover:text-white'/, 'inactive must stay a muted text treatment, not an accent fill')
})

test('CONTROL — the state check fails when a pair IS collapsed', () => {
  const collapsed = `text-[#6E6656] hover:text-[#6E6656]`
  const pairs = [...collapsed.matchAll(/text-\[(#[0-9A-Fa-f]{6})\]\s+hover:text-\[(#[0-9A-Fa-f]{6})\]/g)]
  assert.strictEqual(pairs.length, 1, 'the matcher must find the pair at all')
  assert.throws(
    () => assert.notStrictEqual(pairs[0][1].toUpperCase(), pairs[0][2].toUpperCase()),
    'an identical resting/hover pair MUST fail — otherwise this check is inert'
  )
})

// ── 3. Every surviving colour is a design-system token ──────────────────────────────────────

// The §3.2 / §3.3 token values, plus `white`/`transparent` which Tailwind supplies by name.
const TOKENS = new Set([
  '#12100C', '#1B1811', '#241F17', '#302B22', '#6E6656', '#A79E8C', '#F6F3EB',
  '#D2EC2A', '#BCD41C', '#FF7A33', '#F0563A',
  '#F7F4ED', '#FFFDF8', '#E7E0D2', '#161310', '#6E675C'
])

test('every hex remaining in the two components is a design-system token value', () => {
  for (const f of [BEFORE_AFTER, DEMO]) {
    const found = [...new Set((liveSource(f).match(/#[0-9A-Fa-f]{6}/g) || []).map(h => h.toUpperCase()))]
    const strays = found.filter(h => !TOKENS.has(h))
    assert.deepStrictEqual(strays, [], `${f.split('/').pop()} carries non-token hexes: ${strays.join(', ')}`)
    assert.ok(found.length > 0, 'the file must contain hexes at all — an empty match set would pass vacuously')
  }
})

test('CONTROL — the token check rejects a plausible non-token value', () => {
  const strays = ['#1C1D20', '#7D8090'].filter(h => !TOKENS.has(h))
  assert.strictEqual(strays.length, 2, 'both retired neutrals must be recognised as non-tokens')
})
