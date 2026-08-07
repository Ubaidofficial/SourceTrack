// Mark export parity — every export of the logo mark must be the SAME artwork.
//
// ── THE FAILURE THIS EXISTS TO PREVENT ──────────────────────────────────────────────────────
// `dashboard/src/components/Logo.jsx`'s own header records it: the two `favicon.svg` files had
// already DIVERGED FROM EACH OTHER — r=24 vs r=20, different arc and cursor path data — because
// each was traced separately on its own occasion, and every raster was then frozen against
// whichever one it happened to be cut from. Nothing detected it, because nothing compared them.
//
// So this file compares them, in three directions:
//   1. the two committed favicon.svg files, to each other        (byte-identical)
//   2. the committed SVG, to Logo.jsx's geometry constants       (the component is the source)
//   3. every raster, to a fresh rasterisation of its SVG source  (byte-identical)
//
// (3) is what makes a stale PNG impossible: a raster that was not regenerated after a geometry
// change no longer matches what its source renders to, and fails here.
//
// ── EVERY CHECK HAS A POSITIVE CONTROL ──────────────────────────────────────────────────────
// Each comparison is paired with a test that MUTATES the input in memory and asserts the same
// comparison REJECTS it. Without those, a comparator that silently always passes — a bad regex,
// an empty file list, a normaliser that flattens everything to '' — would look identical to a
// green suite. The controls are the difference between "the exports match" and "we looked".

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const p = (...s) => join(REPO, ...s)

const LOGO_JSX = p('dashboard', 'src', 'components', 'Logo.jsx')
const MK_SVG = p('marketing', 'public', 'favicon.svg')
const DB_SVG = p('dashboard', 'public', 'favicon.svg')
const SMALL_SVG = p('marketing', 'public', 'favicon-16.svg')

// Rasters, each with the SVG it is generated FROM and its pixel size. Mirrors
// scripts/generate-app-icons.mjs — if that script gains an output, add it here too.
// `flatten` mirrors generate-app-icons.mjs:53 — apple-touch-icon ONLY. iOS composites that one
// onto white when it carries alpha, which would frame the ink square in a white border, so it is
// flattened onto INK at generation time. Omitting it here would make a correct file look stale.
const RASTERS = [
  { file: p('marketing', 'public', 'favicon-32.png'), src: MK_SVG, size: 32 },
  { file: p('marketing', 'public', 'favicon-16.png'), src: SMALL_SVG, size: 16 },
  { file: p('marketing', 'public', 'apple-touch-icon.png'), src: MK_SVG, size: 180, flatten: true },
  { file: p('marketing', 'public', 'icon-192.png'), src: MK_SVG, size: 192 },
  { file: p('marketing', 'public', 'icon-512.png'), src: MK_SVG, size: 512 },
  { file: p('dashboard', 'public', 'apple-touch-icon.png'), src: MK_SVG, size: 180, flatten: true },
  { file: p('dashboard', 'public', 'icon-192.png'), src: MK_SVG, size: 192 },
  { file: p('dashboard', 'public', 'icon-512.png'), src: MK_SVG, size: 512 }
]

// The ink the apple-touch-icon is flattened onto — read from Logo.jsx, not retyped, so a change
// to the square colour cannot leave this constant silently stale.
const INK_HEX = readFileSync(LOGO_JSX, 'utf8').match(/const INK = '(#[0-9A-Fa-f]{6})'/)[1]

// ── Geometry extraction ─────────────────────────────────────────────────────────────────────
// Pulls the shape out of an SVG string as a comparable, order-independent structure. Deliberately
// strict: an unparseable file throws rather than yielding an empty object that would compare
// equal to another empty object and pass.
function shapeOfSvg (svg) {
  const rect = svg.match(/<rect[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*rx="([\d.]+)"[^>]*fill="(#[0-9A-Fa-f]{6})"/)
  assert.ok(rect, 'SVG must contain a parseable <rect> — parse failure must not read as "no shape"')
  const circles = [...svg.matchAll(/<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="([\d.]+)"[^>]*fill="(#[0-9A-Fa-f]{6})"/g)]
    .map(m => ({ cx: +m[1], cy: +m[2], r: +m[3], fill: m[4].toUpperCase() }))
  assert.ok(circles.length > 0, 'SVG must contain at least one <circle>')
  return {
    rect: { x: +rect[1], y: +rect[2], width: +rect[3], height: +rect[4], rx: +rect[5], fill: rect[6].toUpperCase() },
    circles
  }
}

// The same structure, read out of Logo.jsx's constants — the component is the source of truth,
// so the committed SVGs are checked AGAINST it rather than the other way round.
function shapeOfLogoJsx () {
  const src = readFileSync(LOGO_JSX, 'utf8')
  const one = (re, label) => {
    const m = src.match(re)
    assert.ok(m, `Logo.jsx must still declare ${label} — if this fails the constant was renamed, not the geometry checked`)
    return m[1]
  }
  const obj = (raw) => JSON.parse(raw.replace(/(\w+):/g, '"$1":').replace(/'/g, '"'))
  const sq = obj(one(/const SQUARE = (\{[^}]+\})/, 'SQUARE'))
  const dots = obj('[' + one(/const AGENT_DOTS = \[(.+)\]/, 'AGENT_DOTS') + ']')
  const agentR = +one(/const AGENT_R = ([\d.]+)/, 'AGENT_R')
  const sd = obj(one(/const SOURCE_DOT = (\{[^}]+\})/, 'SOURCE_DOT'))
  const INK = one(/const INK = '(#[0-9A-Fa-f]{6})'/, 'INK')
  const AGENT = one(/const AGENT = '(#[0-9A-Fa-f]{6})'/, 'AGENT')
  const LIME = one(/const LIME = '(#[0-9A-Fa-f]{6})'/, 'LIME')
  return {
    rect: { ...sq, fill: INK.toUpperCase() },
    circles: [
      ...dots.map(d => ({ cx: d.cx, cy: d.cy, r: agentR, fill: AGENT.toUpperCase() })),
      { cx: sd.cx, cy: sd.cy, r: sd.r, fill: LIME.toUpperCase() }
    ]
  }
}

const rasterise = async (svgPath, size, flatten = false) => {
  let img = sharp(readFileSync(svgPath), { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  if (flatten) img = img.flatten({ background: INK_HEX })
  return img.png().toBuffer()
}

// ── 1. The two favicon.svg files ────────────────────────────────────────────────────────────

test('the two favicon.svg files are byte-identical', () => {
  assert.strictEqual(
    readFileSync(MK_SVG, 'utf8'),
    readFileSync(DB_SVG, 'utf8'),
    'marketing and dashboard favicon.svg have diverged — the exact r=24-vs-r=20 failure this file exists to catch'
  )
})

test('CONTROL — the byte comparison rejects a one-character divergence', () => {
  const a = readFileSync(MK_SVG, 'utf8')
  const b = a.replace('r="13"', 'r="12"')
  assert.notStrictEqual(a, b, 'the mutation must actually change the string, or the control proves nothing')
  assert.throws(() => assert.strictEqual(a, b), 'a diverged favicon MUST fail the comparison')
})

// ── 2. Committed SVG vs Logo.jsx ────────────────────────────────────────────────────────────

test('favicon.svg geometry matches Logo.jsx MarkArtwork exactly', () => {
  assert.deepStrictEqual(
    shapeOfSvg(readFileSync(MK_SVG, 'utf8')),
    shapeOfLogoJsx(),
    'the committed SVG no longer matches the component it is generated from'
  )
})

test('CONTROL — the geometry comparison rejects a moved dot', () => {
  const mutated = shapeOfSvg(readFileSync(MK_SVG, 'utf8').replace('cx="55"', 'cx="56"'))
  assert.throws(
    () => assert.deepStrictEqual(mutated, shapeOfLogoJsx()),
    'a 1-unit move of the source disc MUST fail — otherwise the comparison is not reading position'
  )
})

test('CONTROL — the geometry comparison rejects a recoloured disc', () => {
  const mutated = shapeOfSvg(readFileSync(MK_SVG, 'utf8').replace('#D2EC2A', '#C8F000'))
  assert.throws(
    () => assert.deepStrictEqual(mutated, shapeOfLogoJsx()),
    'swapping the accent for the §3.8-banned lime MUST fail'
  )
})

// ── 3. Rasters vs their SVG source ──────────────────────────────────────────────────────────

test('every raster is byte-identical to a fresh render of its SVG source', async () => {
  for (const r of RASTERS) {
    assert.ok(existsSync(r.file), `${r.file} is missing — run \`npm run icons\``)
    const onDisk = readFileSync(r.file)
    const fresh = await rasterise(r.src, r.size, r.flatten)
    assert.ok(
      onDisk.equals(fresh),
      `${r.file} is STALE — it does not match a render of its source. Run \`npm run icons\` and commit.`
    )
  }
})

test('CONTROL — the raster comparison rejects a render of mutated geometry', async () => {
  const mutatedSvg = readFileSync(MK_SVG, 'utf8').replace('r="13"', 'r="11"')
  const fresh = await sharp(Buffer.from(mutatedSvg), { density: 384 })
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const onDisk = readFileSync(p('marketing', 'public', 'icon-192.png'))
  assert.ok(
    !onDisk.equals(fresh),
    'a raster rendered from CHANGED geometry must NOT match the committed one — if it does, the byte comparison is not comparing pixels'
  )
})

// ── 4. Colour invariants (§3.1 / §3.8) ──────────────────────────────────────────────────────

test('no export carries the §3.8-banned pre-v1.3 lime', () => {
  for (const f of [LOGO_JSX, MK_SVG, DB_SVG, SMALL_SVG]) {
    const s = readFileSync(f, 'utf8')
    const live = s.split('\n').filter(l => /#C8F000/i.test(l) && !/^\s*\/\/|^\s*\*/.test(l))
    assert.deepStrictEqual(live, [], `${f} carries #C8F000 outside a comment — §3.8:494 lists it as superseded`)
  }
})

test('the source disc is the §3.1 accent and the square is warm in both modes', () => {
  const src = readFileSync(LOGO_JSX, 'utf8')
  assert.match(src, /const LIME = '#D2EC2A'/, 'source disc must be the §3.1 accent')
  assert.match(src, /const SURFACE_DARK = '#1B1811'/, 'dark square must be §3.3 --color-surface, not a cool grey')
  for (const [name, hex] of [['INK', '#12100C'], ['SURFACE_DARK', '#1B1811'], ['AGENT', '#4A4634']]) {
    const [r, , b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
    assert.ok(r >= b, `${name} ${hex} must be warm (R >= B) — §3.8:496 bans cool greys anywhere`)
  }
})

test('CONTROL — the warmth check rejects a cool value', () => {
  const hex = '#1C1D20' // the cool dark originally specified for the square
  const [r, , b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  assert.ok(r < b, `${hex} must be detected as COOL — if this passes as warm the check is inert`)
})

// ── 5. The mark's meaning is its element count ───────────────────────────────────────────────

test('exactly three agent dots and one source disc — no fourth dot, no glow', () => {
  const { circles } = shapeOfSvg(readFileSync(MK_SVG, 'utf8'))
  const agents = circles.filter(c => c.fill === '#4A4634')
  const sources = circles.filter(c => c.fill === '#D2EC2A')
  assert.strictEqual(agents.length, 3, 'three AI assistants — a fourth dot changes the meaning')
  assert.strictEqual(sources.length, 1, 'exactly one earned the revenue')
  assert.strictEqual(circles.length, 4, 'four elements total — an extra circle would be a glow')
})
