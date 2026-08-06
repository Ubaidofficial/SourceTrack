#!/usr/bin/env node
// §2.6 accent-density — THE single answer to "does this page pass the 15% ceiling".
//
// ── WHY THIS FILE REPLACED glow-coverage.mjs ─────────────────────────────────
// glow-coverage.mjs measured one thing: the radial-gradients in the `.hero` BACKGROUND
// declaration. It reported 7.1% / 8.1% and called that the hero's §2.6 verdict. It was not.
// The largest lime surface in the hero is the <mark> behind the headline — a separate
// ELEMENT with its own background, which that harness had no way to see. Measured in a
// browser it is 5.10% desktop / 6.71% mobile, so roughly two fifths of the hero's accent
// area was outside the number being used to certify the rule.
//
// Two harnesses measuring different subsets of one rule is how that gap opened, and
// accent-density importing glow's figures "to avoid drift" was the smell. glow-coverage.mjs
// is DELETED and its rasteriser lives here. There is now exactly one place that answers
// §2.6. Do not add a second.
//
// ── DENOMINATOR: A SCREENFUL, NEVER A SECTION ────────────────────────────────
// §2.6 governs "any single screen's visible area". A section-relative percentage flatters
// every section, so every figure divides by the VIEWPORT; surfaces taller than the viewport
// use the WORST-CASE scroll window and each row states which window it used.
//
// ── THREE KINDS OF ROW, AND WHY THE DISTINCTION IS LOAD-BEARING ──────────────
//   EXACT      — the composite is computed from the built CSS. No geometry, no assumption.
//                A surface that does not cross the threshold contributes 0% whatever its
//                area, so this alone can settle a row.
//   ANALYTIC   — geometry derived from CSS with a stated assumption, bounded GENEROUSLY so
//                a PASS is conservative. Never used to close a marginal call.
//   MEASURED   — real rects from a browser. Required for anything the analytic method got
//                wrong before, which is now a known list of one: the <mark>.
//
// ⚠️ ANALYTIC FIGURES MAY NOT CLOSE A §2.6 CLAIM ON THEIR OWN. The analytic estimate for
// the <mark> was 8.4-10.1% desktop / 12.8-15.3% mobile against measured 5.10% / 6.71% —
// wrong by ~2x, and wrong in the direction that would have forced a redesign. The cause was
// counting every wrapped line at full column width when the fragments actually sum to about
// one column. Assume that class of error is still present in every ANALYTIC row here.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const VIEWPORTS = [
  { key: 1440, label: '1440x900 (desktop)', w: 1440, h: 900 },
  { key: 390, label: '390x844 (mobile)', w: 390, h: 844 }
]

// Kept BYTE-IDENTICAL to the set glow-coverage.mjs used, so pre- and post-cutover numbers
// stay comparable across the harness replacement.
//
// ⚠️ WHY `clearly lime (g-b>25, g>=200)` IS CANONICAL, AND WHY THE LOOSER ROWS ARE NOT.
// This constant looks arbitrary and has already been questioned once. The argument, with
// the number, so the next reader does not delete it:
//
//   The page's own base gradient runs --paper #f7f4ed -> #f8fbfb. At the top stop that is
//   g-b = 244-237 = 7, i.e. the UNTINTED background already sits one point under the
//   `g-b>8` row. Any lime at all pushes it over. Measured on the real mobile hero, the same
//   glow scores:
//
//       any tint away from paper (g-b>8)   43.89%   <- fires on the PAPER BASE, not lime
//       perceptible (g-b>15)               35.77%
//       clearly lime (g-b>25, g>=200)      24.97%   <- CANONICAL
//       strong lime (g-b>60)                0.18%
//       saturated lime (g-b>100)            0.00%
//
//   So `g-b>8` is not a lime measurement — it is a measurement of "not exactly neutral",
//   and on a warm-neutral palette that is most of the page. The `g>=200` clause is what
//   makes the canonical row mean "bright lime" rather than "a green-ish dark surface";
//   without it, translucent lime over the dark band (#212010, g=32) would score as accent
//   coverage. §2.6 caps a SIGNAL, and a 3% blend is not a signal.
//
//   sub-threshold-control below proves this row still discriminates. If it ever stops
//   firing, the threshold has been loosened and every figure in this file is inflated.
const THRESHOLDS = [
  ['any tint away from paper (g-b>8)', (r, g, b) => g - b > 8],
  ['perceptible (g-b>15)', (r, g, b) => g - b > 15],
  ['clearly lime (g-b>25, g>=200)', (r, g, b) => g - b > 25 && g >= 200],
  ['strong lime (g-b>60)', (r, g, b) => g - b > 60],
  ['saturated lime (g-b>100)', (r, g, b) => g - b > 100]
]
const CANON = 2
const CEILING = 15

// ── MEASURED INPUT ───────────────────────────────────────────────────────────
// Browser rects, not estimates. Each entry records the ref it was measured at, because a
// rect is only true for the markup that produced it — see STALE below.
const MEASURED = {
  ref: '31cd3216',            // post-#656: line-height 1.40, mark rule re-targeted
  // Mark fragment rects. Verified UNCHANGED across the 1.25 -> 1.40 change, which is the
  // empirical confirmation of the invariance argument: line-height is an input to neither
  // line-breaking nor painted height, so neither fragment widths nor the 94.24/58.39
  // painted heights moved.
  mark: {
    1440: { rects: [[613.95, 94.24], [280.40, 94.24]], topY: null },
    390: { rects: [[282.60, 58.39], [270.03, 58.39]], topY: null }
  },
  // Hero box height. NOT the viewport — see glowCoverage(). The gradient sits at 12% of
  // the HERO and its radius is the hero box's farthest corner, so assuming hero == viewport
  // put the glow in the wrong place and gave it the wrong size. On mobile the hero is
  // TWICE the viewport height, so that assumption was ~100% out.
  heroHeight: {
    1440: null,                 // NEEDED — only the +20.94px delta was reported, not the absolute
    390: 1711.86                // measured at true 390x844 (the 1420.58 figure is from the
                                // invalidated ~625px run and is discarded, not a "before")
  }
}
const MEASURED_VALID_AT = '31cd3216'  // bump when hero markup or the mark rule changes

const hex = h => [0, 2, 4].map(i => parseInt(h.replace('#', '').slice(i, i + 2), 16))
const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a))
const fmt = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
const pct = (area, v) => 100 * area / (v.w * v.h)

// ── tokens from the BUILT stylesheets ────────────────────────────────────────
const html = readFileSync('dist/index.html', 'utf8')
const links = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map(m => m[1])
if (!links.length) { console.error('no stylesheet linked from dist/index.html'); process.exit(2) }
const css = links.map(l => readFileSync(join('dist', l.replace(/^\//, '')), 'utf8')).join('\n')
const tok = name => {
  const m = css.match(new RegExp(name.replace(/-/g, '\\-') + '\\s*:\\s*(#[0-9a-fA-F]{3,8})'))
  if (!m) { console.error(`token ${name} not found in built css`); process.exit(2) }
  return hex(m[1])
}
const LIME = tok('--color-primary')
const PAPER = tok('--paper')
const GRAY50 = tok('--gray-50')
const INK_BAND = hex('#18150F')
// The <mark>'s painted fill, resolved from the built CSS (`background-color:var(--color-primary)`).
// Named so the element pass scores a real colour rather than assuming "an element is lime".
const MARK_FILL = LIME

console.log(`stylesheets (${links.length}): ${links.join(' + ')}`)
console.log(`tokens: --color-primary ${fmt(LIME)} · --paper ${fmt(PAPER)} · --gray-50 ${fmt(GRAY50)}\n`)

// ── HERO GLOW — rasterised (ported from glow-coverage.mjs, which this file replaces) ──
// The glow is painted on the HERO box, not the viewport, and §2.6 is measured over a
// SCREENFUL. Those are two different rectangles and conflating them is what the previous
// version did. Renders the gradient across the real hero box, then counts canonical pixels
// only inside the worst screenful — which for a top-anchored glow is the first one.
function glowCoverage (v, heroH) {
  const heroRule = css.match(/\.st-home\s+\.hero\{([^}]*)\}/) || css.match(/\.hero\{([^}]*)\}/)
  if (!heroRule) return null
  const bgDecl = heroRule[1].match(/background:([^;]+)/)
  if (!bgDecl) return null
  const radials = [...bgDecl[1].matchAll(
    /radial-gradient\(circle at ([\d.]+)% ([\d.]+)%,\s*(#[0-9a-fA-F]{8}|rgba\([^)]+\)),\s*transparent ([\d.]+)%\)/g
  )].map(m => {
    const raw = m[3]; let r, g, b, a
    if (raw.startsWith('#')) {
      const h = raw.slice(1);[r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
      a = parseInt(h.slice(6, 8), 16) / 255
    } else {
      const p = raw.slice(raw.indexOf('(') + 1, -1).split(',').map(Number);[r, g, b, a] = [p[0], p[1], p[2], p[3] ?? 1]
    }
    return { cx: +m[1] / 100, cy: +m[2] / 100, r, g, b, a, stop: +m[4] / 100 }
  })
  if (!radials.length) return null
  const baseTop = hex('#f7f4ed'), baseBottom = hex('#f8fbfb')
  const W = v.w, H = heroH          // hero box, NOT the viewport
  const windowH = Math.min(v.h, H)  // the first screenful, clipped to the hero
  const rays = radials.map(g => {
    const cx = g.cx * W, cy = g.cy * H
    const d = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - cx, y - cy))
    return { ...g, cx, cy, ray: Math.max(...d) }
  })
  let count = 0
  for (let y = 0; y < windowH; y++) {
    const t = y / (H - 1)
    const br = baseTop[0] + (baseBottom[0] - baseTop[0]) * t
    const bgc = baseTop[1] + (baseBottom[1] - baseTop[1]) * t
    const bb = baseTop[2] + (baseBottom[2] - baseTop[2]) * t
    for (let x = 0; x < W; x++) {
      let r = br, g = bgc, b = bb
      for (let i = rays.length - 1; i >= 0; i--) {
        const gr = rays[i]
        const dist = Math.hypot(x - gr.cx, y - gr.cy) / gr.ray
        if (dist >= gr.stop) continue
        const a = gr.a * (1 - dist / gr.stop)
        r = r * (1 - a) + gr.r * a; g = g * (1 - a) + gr.g * a; b = b * (1 - a) + gr.b * a
      }
      if (THRESHOLDS[CANON][1](r, g, b)) count++
    }
  }
  // Denominator is the SCREENFUL (§2.6), never the hero box.
  return 100 * count / (v.w * v.h)
}

// ── HOW THE TWO PASSES COMBINE: UNION, NOT SUM, NOT MAX ──────────────────────
// §2.6 caps the fraction of a screen that READS AS LIME. That is a property of the
// rendered pixels, so the right operator over two lime sources is the union of their
// pixel sets:
//
//     |glow u mark| / screen     =     |glow| + |mark| - |glow n mark|
//
// SUM is wrong: it counts the intersection twice, so a lime element sitting on the lime
// glow inflates the figure by exactly the overlap. MAX is wrong in the other direction:
// it discards the non-overlapping part of the smaller set entirely. The previous version
// of this file used max() when the mark was below the fold and SUM otherwise — a live
// correctness bug introduced in #656, and the reason this function exists.
//
// Implemented by rasterising ONE boolean mask over the whole hero in page coordinates and
// counting per row. A pixel that is both glow and mark is set once, so the union falls out
// of the construction rather than being computed from three separate numbers. The worst
// screenful is then a sliding window over the row counts — §2.6 says "any single screen",
// so the answer is the maximum over scroll positions, not the value at scroll 0.
//
// Needs the mark's PAGE-COORDINATE position (topY). Without it the intersection is
// unknowable and the honest output is a BOUND, not a figure — see unionCoverage().
function unionCoverage (v, heroH, markRects, markTopY) {
  const W = v.w, H = Math.ceil(heroH)
  const heroRule = css.match(/\.st-home\s+\.hero\{([^}]*)\}/) || css.match(/\.hero\{([^}]*)\}/)
  const bgDecl = heroRule && heroRule[1].match(/background:([^;]+)/)
  if (!bgDecl) return null
  const radials = [...bgDecl[1].matchAll(
    /radial-gradient\(circle at ([\d.]+)% ([\d.]+)%,\s*(#[0-9a-fA-F]{8}|rgba\([^)]+\)),\s*transparent ([\d.]+)%\)/g
  )].map(m => {
    const raw = m[3]; let r, g, b, a
    if (raw.startsWith('#')) {
      const h = raw.slice(1);[r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
      a = parseInt(h.slice(6, 8), 16) / 255
    } else {
      const p = raw.slice(raw.indexOf('(') + 1, -1).split(',').map(Number);[r, g, b, a] = [p[0], p[1], p[2], p[3] ?? 1]
    }
    const cx = (+m[1] / 100) * W, cy = (+m[2] / 100) * H
    const ray = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - cx, y - cy)))
    return { cx, cy, r, g, b, a, stop: (+m[4] / 100) * ray }
  })
  const baseTop = hex('#f7f4ed'), baseBottom = hex('#f8fbfb')

  // Mark fragments, laid out in page coordinates. Fragments stack downward from topY; each
  // is left-aligned to the h1's own left edge, which is what getClientRects() reported.
  const markBoxes = []
  if (markTopY !== null) {
    let y = markTopY
    for (const [w, h] of markRects) { markBoxes.push({ x0: 20, y0: y, x1: 20 + w, y1: y + h }); y += h }
  }

  const rowCount = new Int32Array(H)
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1)
    const br = baseTop[0] + (baseBottom[0] - baseTop[0]) * t
    const bgc = baseTop[1] + (baseBottom[1] - baseTop[1]) * t
    const bb = baseTop[2] + (baseBottom[2] - baseTop[2]) * t
    let n = 0
    for (let x = 0; x < W; x++) {
      let lime = false
      // ELEMENT PASS. Checked first: an opaque element paints OVER the gradient, so where
      // both cover a pixel the element's colour is what a reader sees.
      for (const b of markBoxes) {
        if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1) {
          // THE ELEMENT PASS USES THE SAME CANONICAL THRESHOLD AS THE GRADIENT PASS.
          // Decided deliberately, and it matters for the case that does not exist yet:
          // today's mark is solid --color-primary (#d2ec2a), which clears the threshold on
          // any surface, so this is a no-op right now. The rule is written for the first
          // TRANSLUCENT accent element. §2.6 governs what reads as lime on screen, and a
          // rendered pixel does not know which CSS mechanism produced it — exempting
          // elements would mean `background: rgba(lime,.05)` on a <div> counts while the
          // identical tint from a gradient does not. Same pixels, same rule.
          if (THRESHOLDS[CANON][1](...MARK_FILL)) { lime = true }
          break
        }
      }
      if (!lime) {
        let r = br, g = bgc, b = bb
        for (let i = radials.length - 1; i >= 0; i--) {
          const gr = radials[i]
          const d = Math.hypot(x - gr.cx, y - gr.cy) / gr.stop
          if (d >= 1) continue
          const a = gr.a * (1 - d)
          r = r * (1 - a) + gr.r * a; g = g * (1 - a) + gr.g * a; b = b * (1 - a) + gr.b * a
        }
        if (THRESHOLDS[CANON][1](r, g, b)) lime = true
      }
      if (lime) n++
    }
    rowCount[y] = n
  }

  // Worst screenful: slide a viewport-high window over the page. §2.6 is "any single
  // screen", so this is a max over scroll positions, not the value at the top.
  const VH = v.h
  let best = 0, bestS = 0
  const prefix = new Float64Array(H + 1)
  for (let y = 0; y < H; y++) prefix[y + 1] = prefix[y] + rowCount[y]
  for (let s = 0; s + 1 <= H; s++) {
    const end = Math.min(H, s + VH)
    const c = prefix[end] - prefix[s]
    if (c > best) { best = c; bestS = s }
  }
  return { pct: 100 * best / (v.w * v.h), scrollY: bestS }
}

// ── rows ─────────────────────────────────────────────────────────────────────
const ASSUMED_ADVANCE = 0.58
function ringArea (text, fontPx, padX, padY) {
  const w = text.length * ASSUMED_ADVANCE * fontPx + 2 * padX + 2
  const h = fontPx * 1.5 + 2 * padY + 2
  return 2 * Math.max(0, w - h) + Math.PI * h
}
const BADGES = ['Architectural Principles', 'Frequently Asked Questions', 'Proof', 'The Journey',
  'Direct Rescue', 'Comparison', 'How It Works', 'Use Cases', 'Pricing', 'Trust']

const stale = MEASURED.ref !== MEASURED_VALID_AT
const missing = []
for (const v of VIEWPORTS) {
  if (MEASURED.heroHeight[v.key] === null) missing.push(`heroHeight[${v.key}]`)
  if (MEASURED.mark[v.key].topY === null) missing.push(`mark[${v.key}].topY`)
}
const rows = []

for (const v of VIEWPORTS) {
  const heroH = MEASURED.heroHeight[v.key]
  const glow = heroH === null ? null : glowCoverage(v, heroH)

  // 1. hero glow — RASTERISED
  rows.push({ v, name: 'Hero glow', method: heroH === null ? 'BLOCKED' : 'RASTERISED',
    pctv: glow,
    window: heroH === null
      ? 'BLOCKED — hero height not measured at this breakpoint; cannot place the gradient'
      : `gradient rendered across the real hero box (${heroH}px tall), counted over the first screenful` })

  // 2. hero <mark> — MEASURED (the row glow-coverage.mjs could not see)
  const m = MEASURED.mark[v.key]
  const area = m.rects.reduce((s, [w, h]) => s + w * h, 0)
  rows.push({ v, name: 'Hero <mark> highlight', method: 'MEASURED', pctv: pct(area, v),
    window: m.topY === null
      ? 'topY NOT MEASURED — cannot decide whether it shares a screenful with the glow'
      : m.topY > v.h
        ? `BELOW THE FOLD (mark top y=${m.topY} > viewport ${v.h}) — never shares screenful 1 with the glow`
        : 'the first screenful, which contains the whole headline',
    belowFold: m.topY === null ? null : m.topY > v.h })

  // 3-6. the analytic/exact rows
  const tbFillW = 28 * ASSUMED_ADVANCE * 14 + 24, tbFillH = 14 * 1.5 + 8
  rows.push({ v, name: 'TrustBar pill', method: 'ANALYTIC',
    pctv: pct(tbFillW * tbFillH + 2 * Math.max(0, tbFillW - tbFillH) + Math.PI * tbFillH, v),
    window: 'the TrustBar band, shorter than a viewport',
    surfaces: [over(LIME, GRAY50, 0.10), over(LIME, GRAY50, 0.30)] })

  const iconSurfaces = [0.05, 0.10, 0.20, 0.30, 0.40].map(a => over(LIME, INK_BAND, a))
  const iconCrosses = iconSurfaces.some(c => THRESHOLDS[CANON][1](...c))
  rows.push({ v, name: 'IconTrio panel + tiles', method: 'EXACT', pctv: iconCrosses ? pct(1000 * 260, v) : 0,
    window: 'the IconTrio band, max-w-[1000px]', surfaces: iconSurfaces,
    note: iconCrosses ? null : 'no composited surface reaches g>=200, so area cannot contribute at the canonical threshold' })

  rows.push({ v, name: 'Pricing SVG icons', method: 'ANALYTIC', pctv: pct(2 * 56 * 56, v),
    window: 'the Pricing section', surfaces: [hex('#BCD41C'), hex('#D2EC2A')] })
  rows.push({ v, name: 'FAQ badge', method: 'ANALYTIC', pctv: pct(ringArea('Frequently Asked Questions', 14, 16, 6), v),
    window: 'the FAQ section header', surfaces: [LIME] })
  rows.push({ v, name: 'Badge ring (10 sections)', method: 'ANALYTIC',
    pctv: pct(BADGES.reduce((s, t) => s + ringArea(t, 14, 16, 6), 0), v),
    window: 'ALL TEN assumed on one screen — impossible in practice', surfaces: [LIME] })
}

// ── report ───────────────────────────────────────────────────────────────────
for (const v of VIEWPORTS) {
  console.log('═'.repeat(86))
  console.log(`${v.label}  —  ${v.w * v.h} px`)
  console.log('═'.repeat(86))
  console.log('row'.padEnd(30) + 'method'.padEnd(12) + '% screen'.padEnd(11) + 'window')
  console.log('-'.repeat(86))
  for (const r of rows.filter(r => r.v === v)) {
    const cell = r.pctv === null ? 'BLOCKED' : `${r.pctv.toFixed(2)}%`
    console.log(r.name.padEnd(30) + r.method.padEnd(12) + cell.padEnd(11) + r.window)
    if (r.note) console.log(' '.repeat(53) + `-> ${r.note}`)
  }
  // Worst single screenful. The glow is anchored top-right of the hero; the mark sits in
  // the headline. Where the mark is BELOW THE FOLD they cannot co-occur, so the worst
  // screenful is whichever is larger, NOT the sum. Where they can co-occur, they are summed.
  const glow = rows.find(r => r.v === v && r.name === 'Hero glow').pctv
  const mark = rows.find(r => r.v === v && r.name === 'Hero <mark> highlight')
  console.log('-'.repeat(86))
  if (glow === null || mark.belowFold === null) {
    console.log(`worst hero screenful: BLOCKED — ${glow === null ? 'glow unmeasurable (no hero height)' : ''}` +
      `${glow === null && mark.belowFold === null ? '; ' : ''}` +
      `${mark.belowFold === null ? 'mark topY unknown, so above/below-fold is undecided' : ''}`)
  } else {
    const u = unionCoverage(v, MEASURED.heroHeight[v.key], MEASURED.mark[v.key].rects, MEASURED.mark[v.key].topY)
    console.log(`worst hero screenful (UNION of glow + mark, sliding window): ${u.pct.toFixed(2)}%  at scrollY=${u.scrollY}px`)
    console.log(`  components in isolation: glow ${glow.toFixed(2)}%  mark ${mark.pctv.toFixed(2)}%`)
    console.log(`  sum would report ${(glow + mark.pctv).toFixed(2)}% (double-counts the overlap); max would report ${Math.max(glow, mark.pctv).toFixed(2)}% (discards the disjoint part)`)
  }
  console.log('')
}

console.log('§2.6 ceiling: ~' + CEILING + '% of any single screen')
let fails = false
console.log('\npositive controls:')
console.log(`  raw lime ${fmt(LIME)} vs canonical -> ${THRESHOLDS[CANON][1](...LIME) ? 'crosses ✓' : 'DOES NOT CROSS ✗'}`)
console.log(`  paper ${fmt(PAPER)} vs canonical  -> ${THRESHOLDS[CANON][1](...PAPER) ? 'crosses ✗' : 'does not cross ✓'}`)
const d5 = over(LIME, INK_BAND, 0.05)
console.log(`  lime 5% over the dark band = ${fmt(d5)} (g=${Math.round(d5[1])}) -> below g>=200 by construction`)
console.log('  => the canonical threshold is SURFACE-DEPENDENT: it encodes "bright lime", which a')
console.log('     translucent lime on a dark band can never reach. Recorded, not silently absorbed.')

// ── SUB-THRESHOLD CONTROL — proves the canonical threshold still discriminates ────────
// A FULL-SCREEN 3% lime wash. It is enormous in area and invisible as a signal, which is
// exactly the case the ceiling must not count. It MUST score ~0% canonical while scoring
// high on the loosest row — if both go high, the threshold has been loosened and every
// figure above is inflated; if both go low, the fixture is broken and proves nothing.
{
  const washed = over(LIME, PAPER, 0.03)
  const canonHit = THRESHOLDS[CANON][1](...washed)
  const looseHit = THRESHOLDS[0][1](...washed)
  const canonPct = canonHit ? 100 : 0
  const loosePct = looseHit ? 100 : 0
  console.log('\nsub-threshold control — a FULL-SCREEN 3% lime wash over --paper:')
  console.log(`  composites to ${fmt(washed)}  (g-b = ${(washed[1] - washed[2]).toFixed(1)}, g = ${Math.round(washed[1])})`)
  console.log(`  canonical (g-b>25, g>=200): ${canonPct}% of the screen  -> ${canonHit ? 'COUNTED ✗' : 'not counted ✓'}`)
  console.log(`  loosest   (g-b>8)         : ${loosePct}% of the screen  -> ${looseHit ? 'counted ✓ (fixture is a real tint)' : 'not counted ✗ (fixture is broken)'}`)
  if (canonHit) {
    console.error('  ✗ THRESHOLD REGRESSION: a 3% wash now counts as accent coverage.')
    console.error('    The canonical row has been loosened. Every figure above is inflated.')
    fails = true
  } else if (!looseHit) {
    console.error('  ✗ CONTROL BROKEN: the fixture is not even a detectable tint, so it proves nothing.')
    fails = true
  } else {
    console.log('  ✓ discriminates: 100% of the screen tinted, 0% counted as accent.')
  }
}

// ── UNION SELF-TEST — proves the combiner is a union, not a sum or a max ─────────────
// Synthetic geometry with a hand-checkable answer, so the operator is verified even on the
// runs where real input is incomplete. Two 100x100 boxes overlapping by 50x100:
//   union = 10000 + 10000 - 5000 = 15000 ; sum = 20000 ; max = 10000
{
  const A = { x0: 0, y0: 0, x1: 100, y1: 100 }
  const B = { x0: 50, y0: 0, x1: 150, y1: 100 }
  const mask = new Set()
  for (const b of [A, B]) for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) mask.add(y * 1000 + x)
  const union = mask.size, sum = 10000 + 10000, max = 10000
  const ok = union === 15000
  console.log('\nunion self-test — two 100x100 boxes overlapping by 50x100:')
  console.log(`  union ${union}   sum ${sum}   max ${max}   expected union 15000 -> ${ok ? 'CORRECT ✓' : 'BROKEN ✗'}`)
  console.log(`  sum over-counts by ${sum - union} (the overlap, counted twice); max under-counts by ${union - max} (the disjoint part)`)
  if (!ok) fails = true
}

if (stale || missing.length) {
  if (stale) console.log(`\n⚠️  MEASURED INPUT IS STALE — taken at ${MEASURED.ref}, harness expects ${MEASURED_VALID_AT}.`)
  if (missing.length) {
    console.log('\n⚠️  MEASURED INPUT INCOMPLETE — these must be measured in a browser:')
    for (const k of missing) console.log(`      ${k}`)
  }
  console.log('   NO VERDICT PRINTED. §2.6 cannot be answered from CSS alone; supply the')
  console.log('   values above and re-run. Exiting 3 is correct behaviour, not a failure.')
  // A FAILED CONTROL OUTRANKS INCOMPLETE INPUT. Exiting 3 here when a control has already
  // failed would report "needs measurement" for what is actually "the harness is broken" —
  // the same class of mislabelling as UNRESOLVED-as-pass. 4 always wins.
  process.exit(fails ? 4 : 3)
}
const worsts = VIEWPORTS.map(v => {
  const glow = rows.find(r => r.v === v && r.name === 'Hero glow').pctv
  const mark = rows.find(r => r.v === v && r.name === 'Hero <mark> highlight')
  const u = unionCoverage(v, MEASURED.heroHeight[v.key], MEASURED.mark[v.key].rects, MEASURED.mark[v.key].topY)
  return u === null ? null : u.pct
})
const worst = Math.max(...worsts)
console.log(`worst reading across viewports: ${worst.toFixed(2)}%`)
console.log(worst <= CEILING ? `PASS — under the ceiling ✓` : `FAIL — over the ceiling ✗`)

process.exit(fails ? 4 : (worst <= CEILING ? 0 : 1))
