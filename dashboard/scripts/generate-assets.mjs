/**
 * Generates og-image.png (1200×630) and favicon.ico for SourceTrack.
 * Run once: node scripts/generate-assets.mjs
 * Requires: sharp (devDependency)
 */

import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(__dirname, '../public')

// ─── Brand colors ────────────────────────────────────────────────────────────
const LIME    = '#CCF03F'
const BG      = '#0D0F0F'
const CARD    = '#1A1D1A'
const WHITE   = '#FFFFFF'
const GRAY    = '#8A8F9A'
const MUTED   = '#3A3F3F'
const GREEN   = '#00A457'
const BLUE    = '#4B9EFF'
const ORANGE  = '#FF8800'
const PURPLE  = '#9B5DE5'

// ─── OG Image SVG (1200×630) ──────────────────────────────────────────────────
const ogSvg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#0D0F0F"/>
      <stop offset="100%" stop-color="#141918"/>
    </linearGradient>
    <radialGradient id="glowLime" cx="78%" cy="30%" r="45%">
      <stop offset="0%"   stop-color="${LIME}"  stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${LIME}"  stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowBlue" cx="20%" cy="85%" r="35%">
      <stop offset="0%"   stop-color="#4B9EFF" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#4B9EFF" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  <rect width="1200" height="630" fill="url(#glowLime)"/>
  <rect width="1200" height="630" fill="url(#glowBlue)"/>

  <!-- Subtle grid lines -->
  <line x1="0" y1="210" x2="1200" y2="210" stroke="#1F2323" stroke-width="1"/>
  <line x1="0" y1="420" x2="1200" y2="420" stroke="#1F2323" stroke-width="1"/>
  <line x1="400" y1="0" x2="400" y2="630" stroke="#1F2323" stroke-width="1"/>
  <line x1="800" y1="0" x2="800" y2="630" stroke="#1F2323" stroke-width="1"/>

  <!-- Logo mark: lime square with bold S -->
  <rect x="80" y="80" width="64" height="64" rx="14" fill="${LIME}"/>
  <text x="112" y="133" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="44" font-weight="900" fill="#0D0F0F" text-anchor="middle">S</text>

  <!-- Brand name -->
  <text x="80" y="270" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="700" fill="${WHITE}" letter-spacing="-2">SourceTrack</text>

  <!-- Tagline -->
  <text x="80" y="340" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${GRAY}">AI-Powered Multi-Touch Attribution</text>

  <!-- Divider -->
  <rect x="80" y="375" width="60" height="3" rx="2" fill="${LIME}"/>

  <!-- Feature pills row -->
  <!-- Pill 1: Attribution models (highlighted) -->
  <rect x="80" y="405" width="218" height="42" rx="21" fill="#1F2323" stroke="${LIME}" stroke-width="1.5"/>
  <text x="189" y="431" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="${LIME}" text-anchor="middle" font-weight="600">8 Attribution Models</text>

  <!-- Pill 2 -->
  <rect x="312" y="405" width="176" height="42" rx="21" fill="#1A1D1A" stroke="${MUTED}" stroke-width="1"/>
  <text x="400" y="431" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="${GRAY}" text-anchor="middle">15 AI Platforms</text>

  <!-- Pill 3 -->
  <rect x="502" y="405" width="210" height="42" rx="21" fill="#1A1D1A" stroke="${MUTED}" stroke-width="1"/>
  <text x="607" y="431" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="${GRAY}" text-anchor="middle">Server-side CAPI</text>

  <!-- Pill 4 -->
  <rect x="726" y="405" width="190" height="42" rx="21" fill="#1A1D1A" stroke="${MUTED}" stroke-width="1"/>
  <text x="821" y="431" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="${GRAY}" text-anchor="middle">GDPR Cookieless</text>

  <!-- Attribution journey visualization (right side) -->
  <!-- Conversion node (center) -->
  <circle cx="1060" cy="315" r="22" fill="${LIME}" fill-opacity="0.15" stroke="${LIME}" stroke-width="2"/>
  <text x="1060" y="322" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${LIME}" text-anchor="middle" font-weight="700">CONV</text>

  <!-- Source nodes -->
  <!-- Google -->
  <circle cx="880" cy="200" r="14" fill="${BLUE}" fill-opacity="0.2" stroke="${BLUE}" stroke-width="1.5"/>
  <text x="880" y="218" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${BLUE}" text-anchor="middle">Google</text>

  <!-- ChatGPT -->
  <circle cx="940" cy="130" r="14" fill="${GREEN}" fill-opacity="0.2" stroke="${GREEN}" stroke-width="1.5"/>
  <text x="940" y="148" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${GREEN}" text-anchor="middle">ChatGPT</text>

  <!-- Meta -->
  <circle cx="870" cy="350" r="14" fill="${ORANGE}" fill-opacity="0.2" stroke="${ORANGE}" stroke-width="1.5"/>
  <text x="870" y="368" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${ORANGE}" text-anchor="middle">Meta</text>

  <!-- Perplexity -->
  <circle cx="960" cy="470" r="14" fill="${PURPLE}" fill-opacity="0.2" stroke="${PURPLE}" stroke-width="1.5"/>
  <text x="960" y="488" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${PURPLE}" text-anchor="middle">Perplexity</text>

  <!-- TikTok -->
  <circle cx="1050" cy="480" r="14" fill="#FF3B5C" fill-opacity="0.2" stroke="#FF3B5C" stroke-width="1.5"/>
  <text x="1050" y="498" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#FF3B5C" text-anchor="middle">TikTok</text>

  <!-- Connection lines (with weight-based opacity to suggest attribution) -->
  <line x1="894" y1="205" x2="1038" y2="305" stroke="${BLUE}"   stroke-width="2" stroke-opacity="0.5" stroke-dasharray="6,3"/>
  <line x1="953" y1="137" x2="1041" y2="296" stroke="${GREEN}"  stroke-width="1.5" stroke-opacity="0.4" stroke-dasharray="5,4"/>
  <line x1="884" y1="342" x2="1038" y2="320" stroke="${ORANGE}" stroke-width="2.5" stroke-opacity="0.55" stroke-dasharray="6,3"/>
  <line x1="974" y1="468" x2="1042" y2="334" stroke="${PURPLE}" stroke-width="1"   stroke-opacity="0.35" stroke-dasharray="5,4"/>
  <line x1="1044" y1="467" x2="1055" y2="337" stroke="#FF3B5C"  stroke-width="1"   stroke-opacity="0.3" stroke-dasharray="5,4"/>

  <!-- Attribution weight bars (small) beside lines -->
  <rect x="950"  y="248" width="36" height="5" rx="2.5" fill="${BLUE}"   fill-opacity="0.5"/>
  <rect x="950"  y="248" width="22" height="5" rx="2.5" fill="${BLUE}"/>

  <rect x="912"  y="330" width="36" height="5" rx="2.5" fill="${ORANGE}" fill-opacity="0.5"/>
  <rect x="912"  y="330" width="30" height="5" rx="2.5" fill="${ORANGE}"/>

  <!-- Pricing & CTA strip -->
  <rect x="0" y="565" width="1200" height="65" fill="#111414"/>
  <line x1="0" y1="565" x2="1200" y2="565" stroke="#1F2323" stroke-width="1"/>

  <text x="80"  y="604" font-family="Arial, Helvetica, sans-serif" font-size="19" fill="${GRAY}">Start free ·</text>
  <text x="182" y="604" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="${LIME}">$49/mo</text>
  <text x="247" y="604" font-family="Arial, Helvetica, sans-serif" font-size="19" fill="${GRAY}">after trial · No credit card required</text>

  <text x="1130" y="604" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#4A5568" text-anchor="end">sourcetrack.ai</text>
</svg>`

// ─── Favicon SVG (512×512 → multiple sizes) ──────────────────────────────────
const faviconSvg = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${LIME}"/>
  <text
    x="${size / 2}"
    y="${size * 0.76}"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-size="${size * 0.68}"
    font-weight="900"
    fill="#0D0F0F"
    text-anchor="middle"
  >S</text>
</svg>`

// ─── ICO builder (embeds one or more PNGs) ────────────────────────────────────
function buildIco(pngBuffers, sizes) {
  const count = pngBuffers.length
  const headerSize = 6
  const dirEntrySize = 16
  const dirSize = count * dirEntrySize
  const headerAndDir = headerSize + dirSize

  // Calculate total size
  let totalSize = headerAndDir
  for (const buf of pngBuffers) totalSize += buf.length

  const ico = Buffer.alloc(totalSize)
  let offset = 0

  // ICO header
  ico.writeUInt16LE(0, offset); offset += 2       // reserved
  ico.writeUInt16LE(1, offset); offset += 2       // type: 1 = ICO
  ico.writeUInt16LE(count, offset); offset += 2   // image count

  // Directory entries
  let imageOffset = headerAndDir
  for (let i = 0; i < count; i++) {
    const s = sizes[i]
    const len = pngBuffers[i].length
    ico.writeUInt8(s >= 256 ? 0 : s, offset);     offset += 1  // width  (0 = 256)
    ico.writeUInt8(s >= 256 ? 0 : s, offset);     offset += 1  // height (0 = 256)
    ico.writeUInt8(0, offset);                     offset += 1  // colorCount
    ico.writeUInt8(0, offset);                     offset += 1  // reserved
    ico.writeUInt16LE(1, offset);                  offset += 2  // planes
    ico.writeUInt16LE(32, offset);                 offset += 2  // bitCount
    ico.writeUInt32LE(len, offset);                offset += 4  // bytesInRes
    ico.writeUInt32LE(imageOffset, offset);        offset += 4  // imageOffset
    imageOffset += len
  }

  // PNG data
  for (const buf of pngBuffers) {
    buf.copy(ico, offset)
    offset += buf.length
  }

  return ico
}

// ─── Generate ────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(PUBLIC, { recursive: true })

  // 1. OG image
  console.log('Generating og-image.png...')
  await sharp(Buffer.from(ogSvg))
    .resize(1200, 630)
    .png({ quality: 95 })
    .toFile(join(PUBLIC, 'og-image.png'))
  console.log('  ✓ public/og-image.png')

  // 2. Favicon sizes as PNG
  const FAVICON_SIZES = [16, 32, 48]
  const favPngs = await Promise.all(
    FAVICON_SIZES.map(size =>
      sharp(Buffer.from(faviconSvg(size * 4)))  // render 4× then downscale for crispness
        .resize(size, size, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer()
    )
  )

  // 3. Build favicon.ico (16, 32, 48)
  console.log('Generating favicon.ico...')
  const icoBuffer = buildIco(favPngs, FAVICON_SIZES)
  writeFileSync(join(PUBLIC, 'favicon.ico'), icoBuffer)
  console.log('  ✓ public/favicon.ico')

  // 4. Also write a 192×192 PNG for Apple Touch / PWA
  console.log('Generating apple-touch-icon.png...')
  await sharp(Buffer.from(faviconSvg(768)))
    .resize(192, 192, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(join(PUBLIC, 'apple-touch-icon.png'))
  console.log('  ✓ public/apple-touch-icon.png')

  console.log('\nAll assets generated.')
}

main().catch(err => { console.error(err); process.exit(1) })
