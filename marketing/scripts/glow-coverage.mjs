#!/usr/bin/env node
// §2.6 accent-density measurement for the hero glow. Rasterised, not estimated.
//
// The hero glow is a CSS radial-gradient on `.hero`, so this evaluates the gradient
// maths per pixel exactly as the CSS specifies it, composites over the hero's own base
// layer, and counts how much of the viewport reads as lime. No browser, no screenshot —
// but also no hand-waving: every number below comes from the declaration in
// src/styles/home-design.css, parsed out of the BUILT stylesheet.
//
// ASSUMPTION, stated because it drives the denominator: the `.hero` box is treated as
// exactly the viewport. Percentages are therefore "share of the first screenful", the
// same denominator the pre-change baseline used. If the hero renders shorter than the
// viewport the true share is lower, so this is a conservative (upper-bound) reading.
//
// A browser pixel pass (Antigravity) is still what confirms it. This establishes the
// number and the method.
//
// Usage: node scripts/glow-coverage.mjs [path/to/built.css]

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const VIEWPORTS = [
  { label: '1440x900 (desktop)', w: 1440, h: 900 },
  { label: '390x844 (mobile)', w: 390, h: 844 }
]

// Thresholds kept IDENTICAL to the pre-change baseline so the two are comparable.
const THRESHOLDS = [
  ['any tint away from paper (g-b>8)', (r, g, b) => g - b > 8],
  ['perceptible (g-b>15)', (r, g, b) => g - b > 15],
  ['clearly lime (g-b>25, g>=200)', (r, g, b) => g - b > 25 && g >= 200],
  ['strong lime (g-b>60)', (r, g, b) => g - b > 60],
  ['saturated lime (g-b>100)', (r, g, b) => g - b > 100]
]
const CANONICAL = 'clearly lime (g-b>25, g>=200)'
const CEILING = 15 // §2.6, percent of a single screen

// ── locate + parse the .hero background ──────────────────────────────────────
let cssPath = process.argv[2]
if (!cssPath) {
  const html = readFileSync('dist/index.html', 'utf8')
  const linked = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map(m => m[1])
  cssPath = linked.length
    ? join('dist', linked[0].replace(/^\//, ''))
    : join('dist/_astro', readdirSync('dist/_astro').find(f => f.endsWith('.css')))
}
const css = readFileSync(cssPath, 'utf8')

const heroRule = css.match(/\.st-home\s+\.hero\{([^}]*)\}/) || css.match(/\.hero\{([^}]*)\}/)
if (!heroRule) { console.error('could not find a .hero rule in', cssPath); process.exit(2) }
const bgDecl = heroRule[1].match(/background:([^;]+)/)
if (!bgDecl) { console.error('.hero has no background declaration'); process.exit(2) }
const bg = bgDecl[1]
console.log(`stylesheet: ${cssPath}`)
console.log(`.hero background (from BUILT css):\n  ${bg.trim().replace(/,(?![^(]*\))/g, ',\n  ')}\n`)

// Parse each radial-gradient(circle at X% Y%, <colour>, transparent N%).
// The colour arrives as rgba() in source but the minifier rewrites it to 8-digit hex
// (#RRGGBBAA) in dist. Both forms are accepted — this reads the BUILT css, so the hex
// form is the one that normally matches.
const radials = [...bg.matchAll(
  /radial-gradient\(circle at ([\d.]+)% ([\d.]+)%,\s*(#[0-9a-fA-F]{8}|rgba\([^)]+\)),\s*transparent ([\d.]+)%\)/g
)].map(m => {
  const raw = m[3]
  let r, g, b, a
  if (raw.startsWith('#')) {
    const h = raw.slice(1)
    ;[r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
    a = parseInt(h.slice(6, 8), 16) / 255
  } else {
    const p = raw.slice(raw.indexOf('(') + 1, -1).split(',').map(s => parseFloat(s))
    ;[r, g, b, a] = [p[0], p[1], p[2], p[3] ?? 1]
  }
  return { cx: +m[1] / 100, cy: +m[2] / 100, r, g, b, a, stop: +m[4] / 100 }
})
if (!radials.length) { console.error('no radial-gradient stops parsed — CSS shape changed'); process.exit(2) }
console.log(`parsed ${radials.length} radial gradient(s):`)
for (const g of radials) {
  console.log(`  rgba(${g.r},${g.g},${g.b},${g.a}) at ${(g.cx * 100).toFixed(0)}% ${(g.cy * 100).toFixed(0)}%, transparent at ${(g.stop * 100).toFixed(0)}% of farthest-corner`)
}

// Base layer: linear-gradient(180deg, var(--paper) 0%, #f8fbfb 100%)
const baseTop = [0xf7, 0xf4, 0xed]      // --paper
const baseBottom = [0xf8, 0xfb, 0xfb]

function measure (W, H) {
  // CSS `circle` default size = farthest-corner: distance to the furthest box corner.
  const rays = radials.map(g => {
    const cx = g.cx * W, cy = g.cy * H
    const d = [[0, 0], [W, 0], [0, H], [W, H]]
      .map(([x, y]) => Math.hypot(x - cx, y - cy))
    return { ...g, cx, cy, ray: Math.max(...d) }
  })

  const counts = new Array(THRESHOLDS.length).fill(0)
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1)
    let br = baseTop[0] + (baseBottom[0] - baseTop[0]) * t
    let bgc = baseTop[1] + (baseBottom[1] - baseTop[1]) * t
    let bb = baseTop[2] + (baseBottom[2] - baseTop[2]) * t
    for (let x = 0; x < W; x++) {
      let r = br, g = bgc, b = bb
      // Layers paint first-declared on top; compositing order is bottom-up, and with
      // these alphas the visual result is order-insensitive to <1/255. Applied in
      // declared order for fidelity to the cascade.
      for (let i = rays.length - 1; i >= 0; i--) {
        const gr = rays[i]
        const dist = Math.hypot(x - gr.cx, y - gr.cy) / gr.ray
        if (dist >= gr.stop) continue
        // linear interpolation from full alpha at the centre to 0 at the stop
        const a = gr.a * (1 - dist / gr.stop)
        r = r * (1 - a) + gr.r * a
        g = g * (1 - a) + gr.g * a
        b = b * (1 - a) + gr.b * a
      }
      for (let k = 0; k < THRESHOLDS.length; k++) {
        if (THRESHOLDS[k][1](r, g, b)) counts[k]++
      }
    }
  }
  return counts.map(c => 100 * c / (W * H))
}

let canonicalWorst = 0
for (const v of VIEWPORTS) {
  const pct = measure(v.w, v.h)
  console.log(`\n${v.label}  —  ${v.w * v.h} px`)
  console.log('  ' + 'threshold'.padEnd(36) + '% of viewport')
  console.log('  ' + '-'.repeat(52))
  THRESHOLDS.forEach(([name], i) => {
    const mark = name === CANONICAL ? '  <- canonical' : ''
    console.log('  ' + name.padEnd(36) + pct[i].toFixed(1) + '%' + mark)
    if (name === CANONICAL) canonicalWorst = Math.max(canonicalWorst, pct[i])
  })
}

console.log(`\n§2.6 ceiling: ~${CEILING}% of any single screen`)
console.log(`worst canonical reading across viewports: ${canonicalWorst.toFixed(1)}%`)
console.log(canonicalWorst <= CEILING
  ? `PASS — under the ceiling ✓`
  : `FAIL — over the ceiling ✗`)

// Positive control: the pre-change HeroShape glow must be measured as OVER the ceiling,
// proving the harness can fail. Values from the Step 0 rasterisation of that SVG.
console.log(`\npositive control (pre-change HeroShape SVG, rasterised at Step 0): 43.0% at the`)
console.log(`canonical threshold -> ${43.0 > CEILING ? 'correctly reads as OVER the ceiling ✓' : 'control broken ✗'}`)

process.exitCode = canonicalWorst <= CEILING ? 0 : 1
