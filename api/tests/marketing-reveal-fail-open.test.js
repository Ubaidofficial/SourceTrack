// Scroll-reveal animations must fail OPEN: content visible by default, animation as
// progressive enhancement.
//
// WHY THIS EXISTS: 13 .astro components shipped `style="opacity:0"` inside their
// server-rendered markup and relied entirely on a client <script> (motion's inView()) to
// reveal it. That fails CLOSED — if the script never runs, never loads, or the page is
// captured without a scroll event, the copy is invisible forever while its container,
// borders and buttons render normally. A live homepage screenshot showed exactly that:
// section shells with nothing inside them.
//
// The fix direction is what this locks in. Every one of those scripts ALREADY did
// `el.style.opacity = "0"` before observing, so the baked-in attribute bought nothing except
// the failure mode. Removing it means: JS present -> identical behaviour (the script hides,
// then animates in); JS absent, broken, or never scrolled -> the content is simply there.
//
// With scripting off, the SSR markup IS what the user sees. So asserting no .astro template
// ships a hidden state is a direct test of the no-JS render, and it needs no build step —
// matching the other marketing tests, which are all static source analysis.
//
// SCOPE: .astro templates only. The React islands (FAQ/Accordion, Statistics, Pricing,
// Integration, OpenPositions) hide via motion's `initial` prop, which motion serialises INTO
// the server HTML; that cannot be fixed by deleting an attribute and is covered here only by
// the <noscript> net asserted at the bottom.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..')
const MARKETING_SRC = join(REPO, 'marketing', 'src')

function astroFiles (dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...astroFiles(full))
    else if (entry.endsWith('.astro')) out.push(full)
  }
  return out
}

// ── DELIBERATE EXCEPTIONS ────────────────────────────────────────────────────
// Both are genuinely-hidden UI affordances, NOT content, and both are hidden by something
// other than opacity — so neither is reachable by the failure this test guards.
//
//   .kf-arrow  — KeyFeatures' active-item arrow. `width:0` inside `overflow-hidden`, so it
//                occupies nothing and opacity is irrelevant. Its script never re-hides it;
//                it is expanded only for the ONE active feature. Default-hidden is correct.
//   .price-tag — Pricing's monthly/yearly tags are absolutely stacked; the inactive one is
//                hidden on purpose. Revealing it prints both prices on top of each other.
//                It is also driven by a pure CSS animation (`text-reveal`, `forwards`), so it
//                does not depend on JS at all.
const ALLOWED_HIDDEN = [/kf-arrow/, /price-tag/]

// Blank out /* … */ and <!-- … --> bodies while KEEPING the newlines, so reported line
// numbers still point at the real file. Comments in these files quote the very markup they
// warn about (Base.astro's noscript block spells out the exact hidden style it exists to
// undo), and scanning raw text reads those warnings as violations.
function stripComments (src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
}

function offendingLines (src) {
  return stripComments(src)
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /opacity:\s*0/.test(line))
    // Only markup counts. A `el.style.opacity = "0"` inside <script> is the CORRECT place for
    // the hidden state — that is the whole point of the fix.
    .filter(({ line }) => /style="[^"]*opacity:\s*0/.test(line))
    .filter(({ line }) => !ALLOWED_HIDDEN.some(re => re.test(line)))
}

test('no .astro template ships a scroll-reveal hidden state in its SSR markup', () => {
  const offenders = []
  for (const file of astroFiles(MARKETING_SRC)) {
    for (const { line, n } of offendingLines(readFileSync(file, 'utf8'))) {
      offenders.push(`${relative(REPO, file)}:${n}  ${line.trim()}`)
    }
  }
  assert.deepEqual(offenders, [],
    'These render invisible with no JS, slow JS, or no scroll event. Do not bake the hidden ' +
    'state into SSR markup — apply it from the component\'s own script before inView(), which ' +
    'is what every one of these scripts already does:\n' + offenders.join('\n'))
})

test('every .astro reveal script still establishes the hidden state itself', () => {
  // The other half of the same invariant. Deleting the attribute is only safe BECAUSE the
  // script sets opacity 0 before observing; if someone removes that line, the animation
  // silently degrades to "no fade at all" and the next person re-adds the SSR attribute to
  // "fix" it, reintroducing the bug. Any file that calls inView() must also hide first.
  const missing = []
  for (const file of astroFiles(MARKETING_SRC)) {
    const src = readFileSync(file, 'utf8')
    if (!/\binView\s*\(/.test(src)) continue
    if (!/\.style\.opacity\s*=\s*["']0["']/.test(src)) missing.push(relative(REPO, file))
  }
  assert.deepEqual(missing, [],
    'These call inView() but never set opacity to 0 in script, so their reveal animation has ' +
    'no starting state:\n' + missing.join('\n'))
})

test('Base.astro keeps the <noscript> reveal net for the React motion islands', () => {
  // The React islands serialise motion's `initial` into the server HTML, so they cannot be
  // fixed by the deletion above. With scripting off they never hydrate and stay hidden; this
  // block is what recovers them. Nothing animates without JS anyway, so it costs no motion.
  const base = readFileSync(join(MARKETING_SRC, 'layouts', 'Base.astro'), 'utf8')
  const noscript = base.match(/<noscript>[\s\S]*?<\/noscript>/)
  assert.ok(noscript, 'Base.astro must keep a <noscript> block recovering inline-hidden content')

  // Assert against the RULES, not the prose: the comment inside this block names
  // `transform:none` precisely to explain why it is not used, and a naive scan of the raw
  // text reads that explanation as the thing it warns against.
  const block = noscript[0].replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(block, /\[style\*="opacity:0"\]/,
    'the net must target inline-hidden elements')
  assert.match(block, /opacity:\s*1\s*!important/,
    'the override needs !important — it is fighting an inline style')
  assert.match(block, /:not\(\.price-tag\)/,
    'price-tag must stay excluded, or the monthly and yearly prices render stacked')
  assert.doesNotMatch(block, /transform:\s*none/,
    'do NOT reset transform: several of these are positioned by class-based Tailwind ' +
    'transforms (-translate-x-1/2 and friends) and would be dragged out of place')
})
