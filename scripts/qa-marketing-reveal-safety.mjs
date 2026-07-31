#!/usr/bin/env node
// Bans the raw scroll-reveal pattern in marketing SOURCE: hiding an element from JS and handing
// the un-hiding to an IntersectionObserver, with nothing to recover it if the observer never fires.
//
// WHY A SECOND CHECK, AND WHY IT READS SOURCE RATHER THAN OUTPUT:
// qa-marketing-no-js-content.mjs reads the built HTML and catches content the SERVER shipped
// hidden. It is structurally blind to this defect. CallToAction, Footer and Social never put
// opacity in their markup — their built HTML is and always was clean — yet with
// IntersectionObserver stubbed dead and the element scrolled on screen, every one of them sat at
// opacity 0 indefinitely. Measured in a real browser, not inferred. No amount of scanning static
// HTML can see that, because the failure only exists once the script has run.
//
// This is also the mechanism #530 did NOT close. #530 removed style="opacity:0" from 13 Astro
// components' markup, which fixed scripting-disabled visitors. It left the runtime hide in place,
// so all 13 stayed vulnerable to a working-JS-but-no-trigger render. Same symptom, opposite cause.
//
// THE RULE: components must not write `.style.opacity = "0"` themselves. Route reveals through
// `revealOnScroll` (marketing/src/lib/revealOnScroll.ts), which keeps the animation and adds a
// viewport-checked sweep that reveals anything still hidden while actually on screen.
//
// Usage:  node scripts/qa-marketing-reveal-safety.mjs [src-dir]   (default: marketing/src)
//         Exit 0 = clean.  Exit 1 = raw hide found.  Exit 2 = self-test failed.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.argv[2] || 'marketing/src'

// The helper is the one place allowed to do this — it is what owns the recovery path.
//
// Hero is the one justified exception, and it is an exception about the MECHANISM, not a
// grandfathered debt. Every other component hides and then waits for inView(); Hero hides and
// then animates on the very next statement, unconditionally, on load. There is no observer
// anywhere in its path and therefore no trigger that can fail to arrive — verified with
// IntersectionObserver stubbed dead, where all six of its elements still reached opacity 1.
// Routing it through revealOnScroll would be a regression, not a fix: it would put an on-load
// entrance animation behind a scroll trigger it never had.
const ALLOWED = ['lib/revealOnScroll.ts', 'layouts/components/Hero.astro']

// `el.style.opacity = "0"` / `.style.opacity='0'` / with optional whitespace. Deliberately does
// NOT match setting opacity to anything else: `style.opacity = ""` is how you REVEAL, and
// `style.opacity = "1"` is harmless. Only hiding needs a recovery path.
const RAW_HIDE = /\.style\.opacity\s*=\s*(['"`])0\1/g

// Blank comment bodies before matching, offsets preserved so line numbers stay true. Without
// this, prose ABOUT the banned pattern trips the check — the comments explaining this very fix
// each contain the literal `el.style.opacity = "0"`. The `:` guard keeps `https://` in a string
// from being mistaken for a line comment.
function blankComments (src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length))
}

function check (rawSrc, file, findings) {
  const src = blankComments(rawSrc)
  let m
  RAW_HIDE.lastIndex = 0
  while ((m = RAW_HIDE.exec(src))) {
    findings.push({
      file,
      line: src.slice(0, m.index).split('\n').length,
      snip: src.slice(Math.max(0, m.index - 60), m.index + 30).split('\n').pop().trim(),
    })
  }
}

// ── self-test: a checker that cannot fail is not coverage ───────────────────
{
  const bad = []
  check('el.style.opacity = "0";', 'synthetic', bad)
  check("li.style.opacity='0'", 'synthetic', bad)
  const good = []
  check('el.style.opacity = "";', 'synthetic', good)   // this is a reveal
  check('el.style.opacity = "1";', 'synthetic', good)
  check('animate(el, { opacity: [0, 1] })', 'synthetic', good)
  check('// prose about el.style.opacity = "0" must not trip this', 'synthetic', good)
  check('const u = "https://x.example/a"; el.style.opacity = "1";', 'synthetic', good)
  if (bad.length !== 2 || good.length !== 0) {
    console.error(`[qa-marketing-reveal-safety] SELF-TEST FAILED — expected 2 detections and 0 false positives, got ${bad.length} and ${good.length}`)
    process.exit(2)
  }
}

if (!existsSync(ROOT)) {
  console.error(`[qa-marketing-reveal-safety] ${ROOT} does not exist.`)
  process.exit(1)
}

function walk (dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(astro|tsx|ts|jsx|js)$/.test(e)) out.push(p)
  }
  return out
}

const files = walk(ROOT)
const findings = []
for (const f of files) {
  const rel = relative(ROOT, f)
  if (ALLOWED.includes(rel)) continue
  check(readFileSync(f, 'utf8'), rel, findings)
}

console.log(`[qa-marketing-reveal-safety] ${files.length} source files under ${ROOT}`)
if (!findings.length) {
  console.log('  ✓ no reveal can strand its element hidden')
  process.exit(0)
}

console.error(`\n  ✗ ${findings.length} raw hide(s) with no recovery path\n`)
for (const f of findings) console.error(`     ${f.file}:${f.line}  ${f.snip}`)
console.error('\n  An element hidden this way is only ever un-hidden by an IntersectionObserver')
console.error('  callback. If that callback never arrives — observer unavailable, page captured or')
console.error('  printed without a scroll, element on screen but never reported — the content is')
console.error('  invisible for good, on a page where JS is working fine.')
console.error('  Use revealOnScroll from @/lib/revealOnScroll instead; it keeps the animation.')
process.exit(1)
