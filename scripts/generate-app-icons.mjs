// Regenerate every raster app icon from the two committed SVG sources.
//
// Run: npm run icons
//
// This exists because the previous icon set was hand-extracted from dashboard/src/components/
// Logo.jsx and then diverged: the two favicon.svg files ended up with DIFFERENT geometry from
// each other (r=24 vs r=20, different arc and cursor path data) because each was traced on its
// own occasion, and every raster was frozen against whichever one it happened to be cut from.
// Rasters generated from a committed source cannot drift like that — re-run this and the nine
// binaries are exactly the two SVGs again.
//
// SOURCES (the only place the mark's geometry is defined for rasters):
//   marketing/public/favicon.svg     — the full mark: two lime discs on a warm-ink square
//   marketing/public/favicon-16.svg  — the 16px reduction: small disc dropped, per spec
//
// dashboard/public/favicon.svg is asserted to be byte-identical to the marketing one rather
// than used as a second source, so the two apps cannot drift apart again silently.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARKETING = join(ROOT, 'marketing', 'public')
const DASHBOARD = join(ROOT, 'dashboard', 'public')

const FULL = join(MARKETING, 'favicon.svg')
const SMALL = join(MARKETING, 'favicon-16.svg')
const INK = '#12100C'

// Fail loudly if the two favicon.svg files have drifted apart — the exact failure this
// script exists to prevent. Checked here, not just in CI, so `npm run icons` is self-policing.
async function assertFaviconsIdentical () {
  const [a, b] = await Promise.all([
    readFile(FULL, 'utf8'),
    readFile(join(DASHBOARD, 'favicon.svg'), 'utf8'),
  ])
  if (a.trim() !== b.trim()) {
    throw new Error(
      'marketing/public/favicon.svg and dashboard/public/favicon.svg have diverged.\n' +
      'They must be identical — fix one to match the other before regenerating icons.'
    )
  }
}

// PNG at an exact square size. `flatten` is for apple-touch-icon only: iOS composites that one
// onto white when it carries alpha, which would frame the ink square in a white border.
async function png (src, size, out, { flatten = false } = {}) {
  let img = sharp(await readFile(src), { density: 384 }).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  if (flatten) img = img.flatten({ background: INK })
  await writeFile(out, await img.png().toBuffer())
  return `${out.replace(ROOT + '/', '')}  ${size}x${size}`
}

// Minimal ICO container. sharp has no .ico encoder, and the format is just a 6-byte header plus
// one 16-byte directory entry per image plus the PNG payloads — a dependency would be heavier
// than the writer. PNG-in-ICO is supported by every browser still receiving security updates.
function buildIco (pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)          // reserved
  header.writeUInt16LE(1, 2)          // type: 1 = icon
  header.writeUInt16LE(pngs.length, 4)

  let offset = 6 + pngs.length * 16
  const entries = []
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)  // 0 encodes 256
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)                       // palette count
    e.writeUInt8(0, 3)                       // reserved
    e.writeUInt16LE(1, 4)                    // colour planes
    e.writeUInt16LE(32, 6)                   // bits per pixel
    e.writeUInt32LE(buf.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += buf.length
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)])
}

async function main () {
  await assertFaviconsIdentical()
  const written = []

  // marketing/public — 5 rasters
  written.push(await png(FULL, 32, join(MARKETING, 'favicon-32.png')))
  written.push(await png(SMALL, 16, join(MARKETING, 'favicon-16.png')))
  written.push(await png(FULL, 180, join(MARKETING, 'apple-touch-icon.png'), { flatten: true }))
  written.push(await png(FULL, 192, join(MARKETING, 'icon-192.png')))
  written.push(await png(FULL, 512, join(MARKETING, 'icon-512.png')))

  // dashboard/public — 3 rasters + the .ico
  written.push(await png(FULL, 180, join(DASHBOARD, 'apple-touch-icon.png'), { flatten: true }))
  written.push(await png(FULL, 192, join(DASHBOARD, 'icon-192.png')))
  written.push(await png(FULL, 512, join(DASHBOARD, 'icon-512.png')))

  // favicon.ico carries 16/32/48. The 16px slice uses the reduced mark, matching favicon-16.png.
  const icoSizes = [
    { size: 16, src: SMALL },
    { size: 32, src: FULL },
    { size: 48, src: FULL },
  ]
  const slices = []
  for (const { size, src } of icoSizes) {
    const buf = await sharp(await readFile(src), { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    slices.push({ size, buf })
  }
  const icoPath = join(DASHBOARD, 'favicon.ico')
  await writeFile(icoPath, buildIco(slices))
  written.push(`${icoPath.replace(ROOT + '/', '')}  16+32+48`)

  console.log(`Regenerated ${written.length} icon files from 2 SVG sources:`)
  for (const w of written) console.log('  ' + w)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
