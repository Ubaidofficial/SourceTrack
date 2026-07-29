#!/usr/bin/env node
// Static integrity check of the BUILT marketing HTML (marketing/dist).
//
// WHY THIS EXISTS: `className` on a plain element in a .astro file is not an error and not a
// warning at runtime — Astro is not JSX, so it emits the attribute verbatim and the DOM ignores
// it. The element ships with NO class at all. 267 of them across 30 of 50 pages reached
// production and rendered substantially unstyled, because nothing in the pipeline looked at the
// output. The source-level guard (`astro check`, wired alongside this in ci.yml) catches the
// same class of bug earlier, but only THIS check reads what actually ships.
//
// FATAL vs ADVISORY is the whole design. A check that reports everything gets ignored, and an
// ignored check is worse than no check — it looks like coverage. Every advisory class below was
// individually inspected against real output and confirmed benign; the fatal ones cannot be
// anything but a defect. If you add a rule, put it in the tier you can defend.
//
// Usage:  node scripts/qa-marketing-html.mjs [dist-dir]     (default: marketing/dist)
//         Exit 0 = clean or advisory-only.  Exit 1 = fatal findings.  Exit 2 = self-test failed.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.argv[2] || 'marketing/dist'

if (!existsSync(ROOT)) {
  console.error(`[qa-marketing-html] ${ROOT} does not exist — run \`cd marketing && npm run build\` first.`)
  process.exit(1)
}

// ── helpers ────────────────────────────────────────────────────────────────
function walk (dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e.endsWith('.html')) out.push(p)
  }
  return out
}

// Blank script/style BODIES (offsets preserved so line numbers stay true). A `{` or `${` inside
// inline JS, JSON-LD or CSS is legitimate and would otherwise bury the signal.
function blankEmbedded (html) {
  return html.replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi,
    (_m, open, _tag, body, close) => open + body.replace(/[^\n]/g, ' ') + close)
}

const lineOf = (s, i) => s.slice(0, i).split('\n').length

function* tags (html) {
  const re = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let m
  while ((m = re.exec(html))) yield { name: m[1], attrs: m[2], index: m.index, raw: m[0] }
}

function parseAttrs (attrStr) {
  const out = []
  const re = /([^\s=/][^\s=]*)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let m
  while ((m = re.exec(attrStr))) {
    if (!m[1] || m[1] === '/') continue
    out.push({ name: m[1], value: m[3] ?? m[4] ?? m[5] ?? null, hasValue: !!m[2] })
  }
  return out
}

// Quote-aware scan of a tag's attribute region.
//
// Regexing the whole attribute string is WRONG, and the two obvious forms both fail loudly:
//   /"[^\s/>=]/       matches the OPENING quote against the value's first character  -> fires
//                     on every well-formed attribute (12,837 false hits on this very build).
//   /"[^"]*"[^\s/>]/  straddles attribute boundaries: closing quote, ` content=`, opening
//                     quote, `s` -> fires on every tag with 2+ attributes (7,600 false hits).
// The only correct approach is to walk the string and skip each quoted region as a unit.
function scanAttrRegion (attrs) {
  const issues = []
  let i = 0
  while (i < attrs.length) {
    const c = attrs[i]
    if (c === '"' || c === "'") {
      const end = attrs.indexOf(c, i + 1)
      if (end === -1) { issues.push('unclosed-quote'); break }
      const next = attrs[end + 1]
      if (next !== undefined && !/[\s/]/.test(next)) issues.push('no-separator')
      i = end + 1
    } else i++
  }
  return issues
}

// ── SELF-TEST ──────────────────────────────────────────────────────────────
// This detector's earlier drafts produced 20k false positives against clean output. It does not
// get to gate CI without proving on every run that it separates clean markup from broken.
function selfTest () {
  const clean = [
    ' name="theme-name" content="sourcetrack-astro"',
    ' rel="preload" href="/f.woff2" as="font" type="font/woff2" crossorigin',
    ' class="a b c" data-astro-cid-rq644orq',
    ' points="11 9 22 9" transform="rotate(45 10 10)"',
    ' href="/" data-close-menu data-nav-url="/" class="nav-link block"',
    " alt='it&#39;s fine' title='ok'",
    ' viewBox="0 0 20 20" fill="none" preserveAspectRatio="none"',
    ' src="/a.png" srcset="/a.png 1x, /b.png 2x" sizes="(max-width: 600px) 100vw, 50vw"',
    ''
  ]
  const dirty = [[' foo="a"bar="b"', 'no-separator'], [' class="unterminated', 'unclosed-quote'], [' a="1"b', 'no-separator']]
  for (const c of clean) {
    const got = scanAttrRegion(c)
    if (got.length) { console.error(`[qa-marketing-html] SELF-TEST FAILED: clean input flagged ${JSON.stringify(got)}\n  ${c}`); process.exit(2) }
  }
  for (const [d, want] of dirty) {
    if (!scanAttrRegion(d).includes(want)) { console.error(`[qa-marketing-html] SELF-TEST FAILED: "${d}" did not yield ${want}`); process.exit(2) }
  }
}

// ── rule tiers ─────────────────────────────────────────────────────────────
// FATAL — cannot be anything but a defect in shipped markup.
//   react-prop        the DOM ignores it; for className the element renders with NO class
//   unresolved-value  a template/expression reached the browser as literal text
//   malformed-tag     unclosed quote or attributes fused together; the parser will mis-read it
//
// ADVISORY — inspected against real output and confirmed benign; reported, never fatal.
//   empty-class       `class=""` from a conditional that resolved empty. No visual effect.
//   empty-data-attr   `data-prefix=""` etc. are deliberate; the counter script reads them.
//   boolean-attr      `selected=""` is valid HTML5 boolean-attribute serialization.
//   island-props      `<astro-island props="{&quot;…}">` is Astro's own escaped JSON.
const REACT_PROPS = new Set(['classname', 'htmlfor', 'onclick', 'onchange', 'onsubmit', 'oninput', 'defaultvalue', 'defaultchecked', 'dangerouslysetinnerhtml'])
const CAMEL_ATTRS = /^(strokeWidth|strokeLinecap|strokeLinejoin|fillRule|clipRule|tabIndex|autoComplete|maxLength|minLength|colSpan|rowSpan|cellPadding|cellSpacing|frameBorder|allowFullScreen|noValidate|crossOrigin|referrerPolicy)$/
// Empty values that are legitimate rather than a missing interpolation.
const EMPTY_OK = /^(alt|value|content|class|placeholder|title|srcset|action|style|selected|checked|disabled|aria-label)$/i

selfTest()

const fatal = []
const advisory = []
const files = walk(ROOT).sort()

for (const abs of files) {
  const file = relative(ROOT, abs)
  const html = blankEmbedded(readFileSync(abs, 'utf8'))
  const F = (line, kind, detail, snip) => fatal.push({ file, line, kind, detail, snip: (snip || '').slice(0, 150).replace(/\s+/g, ' ') })
  const A = (line, kind, detail) => advisory.push({ file, line, kind, detail })

  // unresolved expressions / leaked values
  for (const [re, detail] of [
    [/\[object (?:Object|Undefined|Null)\]/g, 'stringified object leaked into output'],
    [/\$\{[^}\n]{1,120}\}/g, 'template literal not interpolated'],
    [/\bNaN\b/g, 'NaN rendered']
  ]) {
    let m
    while ((m = re.exec(html))) F(lineOf(html, m.index), 'unresolved-value', detail, m[0])
  }
  {
    let m
    const re = /\b([\w:-]+)\s*=\s*["'](undefined|null|NaN|\[object Object\])["']/g
    while ((m = re.exec(html))) F(lineOf(html, m.index), 'unresolved-value', `attribute ${m[1]} rendered the literal "${m[2]}"`, m[0])
  }

  // empty class — advisory
  {
    let m
    const re = /\bclass\s*=\s*["']\s*["']/g
    while ((m = re.exec(html))) A(lineOf(html, m.index), 'empty-class', 'class attribute is empty')
  }

  for (const t of tags(html)) {
    const line = lineOf(html, t.index)
    const seen = new Set()

    for (const a of parseAttrs(t.attrs)) {
      const lower = a.name.toLowerCase()

      if (seen.has(lower)) F(line, 'malformed-tag', `duplicate attribute "${a.name}" on <${t.name}> — the last one silently wins`, t.raw)
      seen.add(lower)

      if (REACT_PROPS.has(lower)) {
        F(line, 'react-prop',
          lower === 'classname'
            ? `className on <${t.name}> — Astro is not JSX; this element ships with NO class`
            : `React prop "${a.name}" on <${t.name}> — the DOM ignores it`, t.raw)
      }
      if (CAMEL_ATTRS.test(a.name)) F(line, 'react-prop', `JSX-cased "${a.name}" on <${t.name}> — HTML expects the hyphenated form`, t.raw)
      if (/[<>{}]/.test(a.name)) F(line, 'malformed-tag', `attribute name contains markup characters: "${a.name}"`, t.raw)

      if (a.hasValue && a.value === '' && !EMPTY_OK.test(lower)) {
        if (lower.startsWith('data-')) A(line, 'empty-data-attr', `${a.name} on <${t.name}>`)
        else F(line, 'malformed-tag', `empty value for "${a.name}" on <${t.name}>`, t.raw)
      }
    }

    if (t.name.toLowerCase() === 'astro-island') continue   // its props= is escaped JSON by design

    for (const issue of scanAttrRegion(t.attrs)) {
      F(line, 'malformed-tag',
        issue === 'unclosed-quote' ? `unclosed quoted value in <${t.name}>` : `attributes not separated by whitespace in <${t.name}>`, t.raw)
    }
    if (/[{}]/.test(t.attrs)) F(line, 'unresolved-value', `brace in attribute region of <${t.name}> — un-evaluated expression`, t.raw)
  }
}

// ── report ─────────────────────────────────────────────────────────────────
console.log(`[qa-marketing-html] ${files.length} pages under ${ROOT}`)

if (advisory.length) {
  const byKind = {}
  for (const a of advisory) byKind[a.kind] = (byKind[a.kind] || 0) + 1
  console.log(`  advisory (not failing): ${Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join('  ')}`)
}

if (!fatal.length) {
  console.log('  ✓ no fatal findings')
  process.exit(0)
}

const byKind = {}
for (const f of fatal) (byKind[f.kind] ||= []).push(f)
console.error(`\n  ✗ ${fatal.length} FATAL finding(s)\n`)
for (const [kind, list] of Object.entries(byKind)) {
  console.error(`  ── ${kind}: ${list.length}`)
  const byDetail = {}
  for (const f of list) (byDetail[f.detail] ||= []).push(f)
  for (const [detail, items] of Object.entries(byDetail)) {
    console.error(`     • ${detail} — ${items.length}`)
    for (const it of items.slice(0, 5)) console.error(`         ${it.file}:${it.line}  ${it.snip}`)
    if (items.length > 5) console.error(`         … ${items.length - 5} more`)
  }
}
console.error('\n  These are defects in HTML that SHIPPED. Fix the .astro source, rebuild, re-run.')
process.exit(1)
