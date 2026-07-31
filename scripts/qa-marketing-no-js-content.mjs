#!/usr/bin/env node
// Guards the BUILT marketing HTML against primary content that is invisible until JS runs.
//
// WHY THIS EXISTS: several sections shipped their content styled `opacity:0` in the static HTML
// and relied on a scroll-triggered animation to reveal it. That fails CLOSED — if the bundle
// 404s, is blocked, throws, or never hydrates, the content is permanently invisible even though
// it is right there in the page source. Observed in a real browser with JS disabled: the
// WhyChooseUs grid painted only its dividers and centre star, and the pricing section painted
// as bare page background — no plan names, no prices, no feature lists, no CTAs.
//
// Two distinct mechanisms produced identical symptoms, which is why the fix was not shared:
//   - Astro partials (WhyChooseUs, SectionHeader, IconBox, Badge, PageHeader, KeyFeatures)
//     hand-wrote style="opacity:0" into the markup, on top of a <script> that ALSO sets opacity 0
//     itself. The markup copy was pure redundancy and the only fail-closed part; the script's own
//     hide is fail-open, because the module that hides is the module that reveals. Fixed in #530.
//   - React islands (Pricing, Accordion) used Framer Motion `initial="hidden"` + `whileInView`.
//     Framer resolves `initial` during SSR and writes it into the static HTML, so those props
//     emitted opacity:0 on the plan grid, every plan wrapper and every card — three nested
//     layers over the price figures — with nothing to remove them until hydration. #530
//     explicitly could not reach this half; it is fixed alongside this check.
//
// This gate covers BOTH mechanisms, which is the point: they are edited in different files by
// different reasoning, and only the built HTML shows whether the content actually survives.
//
// SCOPE: deliberately narrow. It guards the elements that were fixed, NOT every opacity:0 in the
// output. Counter, CallToAction (cta-*), the footer and the social list still carry the same
// fail-closed pattern and are knowingly out of scope here — widening this check without fixing
// them first would just ship a red pipeline. Add a target below when you fix one.
//
// Usage:  node scripts/qa-marketing-no-js-content.mjs [dist-dir]   (default: marketing/dist)
//         Exit 0 = clean.  Exit 1 = primary content hidden behind JS.  Exit 2 = self-test failed.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.argv[2] || 'marketing/dist'

// Elements whose visibility must not depend on JS, matched against a built tag's attributes.
// `label` is what gets printed; keep it human, it is the whole error message.
const TARGETS = [
  { label: 'pricing price figure', test: a => /\bdata-price-tag-monthly\b/.test(a) },
  { label: 'WhyChooseUs feature card', test: a => /\bid="wcu-/.test(a) },
  { label: 'FAQ accordion row', test: a => /\brole="button"/.test(a) && /\baria-expanded=/.test(a) },
  { label: 'section header', test: a => /\bid="sh-/.test(a) },
  { label: 'page header', test: a => /\bid="ph-/.test(a) },
  { label: 'feature icon box', test: a => /\bid="iconbox-/.test(a) },
  { label: 'section badge', test: a => /\bid="badge-/.test(a) },
  { label: 'KeyFeatures panel', test: a => /\bid="kf-(left|right)-/.test(a) },
  { label: 'KeyFeatures card', test: a => /\bclass="[^"]*\bkf-card\b/.test(a) },
]

// `data-price-tag-yearly` is legitimately opacity:0 — it is the billing period NOT currently
// selected, stacked absolutely behind the active one. It is a duplicate of content already
// visible, not content of its own, so it is exempt.
const EXEMPT = a => /\bdata-price-tag-yearly\b/.test(a)

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'])

const hidesInline = attrs => /style="[^"]*\bopacity:\s*0\s*[;"]/.test(attrs)

// Walk the tag stream tracking how many *ancestors* are inline-hidden. Opacity is not
// inherited as a value but it composites: an element inside an opacity:0 subtree paints
// nothing, no matter what its own opacity says. So an ancestor counts as a hit.
function scan (html, file, findings) {
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
  const stack = []
  let hiddenDepth = 0
  let m
  while ((m = re.exec(html))) {
    const [raw, closing, rawName, attrs, selfClose] = m
    const name = rawName.toLowerCase()
    if (name === 'script' || name === 'style' || name === 'template') {
      // skip the body wholesale — inline JS/CSS is not markup
      const end = html.indexOf(`</${name}`, re.lastIndex)
      if (!closing && end !== -1) re.lastIndex = end
      continue
    }
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          for (let j = stack.length - 1; j >= i; j--) if (stack[j].hidden) hiddenDepth--
          stack.length = i
          break
        }
      }
      continue
    }

    const own = hidesInline(attrs)
    const hit = TARGETS.find(t => t.test(attrs))
    if (hit && !EXEMPT(attrs) && (own || hiddenDepth > 0)) {
      findings.push({
        file,
        label: hit.label,
        why: own ? 'carries style="opacity:0" itself' : `sits inside ${hiddenDepth} inline opacity:0 wrapper(s)`,
        line: html.slice(0, m.index).split('\n').length,
        snip: raw.slice(0, 150),
      })
    }

    if (VOID.has(name) || selfClose) continue
    stack.push({ name, hidden: own })
    if (own) hiddenDepth++
  }
}

// ── self-test: a checker that cannot fail is not coverage ───────────────────
{
  const bad = []
  scan('<div style="opacity:0"><h3 data-price-tag-monthly>$49</h3></div>', 'synthetic', bad)
  scan('<div id="wcu-abc123" style="opacity:0"><p>x</p></div>', 'synthetic', bad)
  const good = []
  scan('<div><h3 data-price-tag-monthly>$49</h3></div>', 'synthetic', good)
  scan('<div style="opacity:0"><h3 data-price-tag-yearly>$470</h3></div>', 'synthetic', good)
  // closing an opacity:0 wrapper must restore visibility for later siblings
  scan('<div style="opacity:0"><span>a</span></div><div id="wcu-zzz"><p>y</p></div>', 'synthetic', good)
  if (bad.length !== 2 || good.length !== 0) {
    console.error(`[qa-marketing-no-js-content] SELF-TEST FAILED — expected 2 detections and 0 false positives, got ${bad.length} and ${good.length}`)
    process.exit(2)
  }
}

if (!existsSync(ROOT)) {
  console.error(`[qa-marketing-no-js-content] ${ROOT} does not exist — run \`cd marketing && npm run build\` first.`)
  process.exit(1)
}

function walk (dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e.endsWith('.html')) out.push(p)
  }
  return out
}

const files = walk(ROOT)
const findings = []
for (const f of files) scan(readFileSync(f, 'utf8'), relative(ROOT, f), findings)

console.log(`[qa-marketing-no-js-content] ${files.length} pages under ${ROOT}`)
if (!findings.length) {
  console.log('  ✓ no primary content hidden behind JS')
  process.exit(0)
}

const byLabel = {}
for (const f of findings) (byLabel[f.label] ||= []).push(f)
console.error(`\n  ✗ ${findings.length} element(s) invisible until JS runs\n`)
for (const [label, list] of Object.entries(byLabel)) {
  console.error(`  ── ${label}: ${list.length}`)
  for (const it of list.slice(0, 5)) console.error(`       ${it.file}:${it.line}  ${it.why}\n         ${it.snip}`)
  if (list.length > 5) console.error(`       … ${list.length - 5} more`)
}
console.error('\n  This content is in the page source but paints nothing without JS. Do not reveal it')
console.error('  with a scroll animation — let the reveal script own the hide, or drop the SSR')
console.error('  `initial` state on the island. Rebuild and re-run.')
process.exit(1)
