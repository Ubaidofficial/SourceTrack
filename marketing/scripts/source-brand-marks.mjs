#!/usr/bin/env node
/**
 * SOURCE BRAND MARKS — fetch each integration's logo from THAT COMPANY'S OWN DOMAIN.
 *
 * ── WHY DIRECT, AND WHY NO LICENCE IS NEEDED ────────────────────────────────
 * Showing Stripe's logo to say "we integrate with Stripe" is nominative use — using a
 * mark to identify the thing it names. No permission is required for that, which is why
 * every integrations page on the internet does it, and why design.md §3.4 already says
 * "Bundle third-party logos as local SVG or PNG assets."
 *
 * The licence questions that surrounded logo.dev and Apistemic were never about the
 * COMPANIES. They were about the middleman: those services impose their own terms
 * because you would be using their compiled database. Going to the source removes that
 * contract entirely — and it is also exactly what §35.4 requires: "confirm the URL is
 * the company's own domain — not an aggregator, icon library, or resale site."
 *
 * ── WHAT NOMINATIVE USE STILL REQUIRES ──────────────────────────────────────
 * Three conditions, all satisfied by how BrandMark renders these:
 *   · Use only as much of the mark as identification needs — the mark, not their trade
 *     dress, not their page design.
 *   · Do not alter or recolour it. BrandMark scales it inside our own tile and never
 *     restyles the artwork.
 *   · Do not imply partnership or endorsement. These sit in a "what we capture from"
 *     grid, which states a technical capability, not a relationship.
 * A vendor whose brand guidelines forbid even identification use stays a text label —
 * the registry's default, and §35.4's stated correct answer.
 *
 * ── HOW IT PICKS AN ASSET ───────────────────────────────────────────────────
 * Fetches the company's own homepage and reads the icons IT declares, in quality order:
 *   1. <link rel="icon" type="image/svg+xml">   — vector, scales to any tile size
 *   2. <link rel="apple-touch-icon">            — usually 180x180 PNG, ample for 22-30px
 *   3. <link rel="icon"> with the largest sizes
 *   4. /favicon.ico                             — last resort
 *
 * Every accepted asset records the EXACT URL it came from, which is what
 * api/tests/brand-mark-provenance.test.js checks. A mark that cannot be fetched, or
 * whose bytes do not look like an image, is left as a text label rather than guessed at.
 *
 * Usage:  node scripts/source-brand-marks.mjs [--only slug,slug] [--dry]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/brand')
const DOMAINS = JSON.parse(readFileSync(join(ROOT, 'src/lib/brand-domains.json'), 'utf8'))

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const onlyArg = args.indexOf('--only')
const ONLY = onlyArg > -1 ? args[onlyArg + 1].split(',') : null

const UA = 'SourceTrackBot/1.0 (+https://www.sourcetrack.ai; integration logo sourcing)'

const get = async (url, as = 'text') => {
  const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow',
                               signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return as === 'buf' ? Buffer.from(await r.arrayBuffer()) : r.text()
}

/** Icon candidates the site itself declares, best quality first. */
function candidates (html, base) {
  const out = []
  const links = html.match(/<link\b[^>]*>/gi) || []
  const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i')) || [])[1]
  for (const tag of links) {
    const rel = (attr(tag, 'rel') || '').toLowerCase()
    const href = attr(tag, 'href')
    if (!href || !/icon/.test(rel)) continue
    const type = (attr(tag, 'type') || '').toLowerCase()
    const sizes = attr(tag, 'sizes') || ''
    const px = Math.max(0, ...(sizes.match(/\d+/g) || []).map(Number))
    let rank = 1
    if (type.includes('svg') || /\.svg(\?|$)/i.test(href)) rank = 100
    else if (rel.includes('apple-touch-icon')) rank = 50 + px / 100
    else rank = 10 + px / 100
    try { out.push({ rank, url: new URL(href, base).href }) } catch {}
  }
  // WELL-KNOWN PATHS THE SITE MAY SERVE WITHOUT DECLARING. Slack and Intercom both
  // declared only a 32x32 favicon, which is soft at a 30px tile on a 2x display — but
  // both serve a 180px apple-touch-icon at the conventional path anyway. Probing these
  // is the difference between a crisp mark and a blurry one.
  out.push({ rank: 45, url: new URL('/apple-touch-icon.png', base).href })
  out.push({ rank: 44, url: new URL('/apple-touch-icon-precomposed.png', base).href })
  out.push({ rank: 0, url: new URL('/favicon.ico', base).href })
  // Dedupe by URL, keeping the best rank for each.
  const best = new Map()
  for (const c of out) if (!best.has(c.url) || best.get(c.url).rank < c.rank) best.set(c.url, c)
  return [...best.values()].sort((a, b) => b.rank - a.rank)
}

/** Reject HTML error pages saved with an image extension — the classic silent failure. */
function looksLikeImage (buf, url) {
  const head = buf.subarray(0, 400).toString('latin1').trim().toLowerCase()
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return false
  if (/\.svg(\?|$)/i.test(url) || head.includes('<svg')) return head.includes('<svg')
  if (buf[0] === 0x89 && buf[1] === 0x50) return true                    // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true                    // JPEG
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF') return true      // WebP
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01) return true // ICO
  return false
}

const extFor = (buf, url) => {
  if (/\.svg(\?|$)/i.test(url) || buf.subarray(0, 400).toString('latin1').includes('<svg')) return 'svg'
  if (buf[0] === 0x89) return 'png'
  if (buf[0] === 0xff) return 'jpg'
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF') return 'webp'
  return 'ico'
}

if (!DRY) mkdirSync(OUT, { recursive: true })

const results = []
const entries = Object.entries(DOMAINS).filter(([slug, d]) => d && (!ONLY || ONLY.includes(slug)))

for (const [slug, domain] of entries) {
  const base = `https://${domain}/`
  try {
    const html = await get(base)
    let saved = null
    for (const c of candidates(html, base).slice(0, 4)) {
      try {
        const buf = await get(c.url, 'buf')
        if (!looksLikeImage(buf, c.url) || buf.length < 100) continue
        const ext = extFor(buf, c.url)
        if (!DRY) writeFileSync(join(OUT, `${slug}.${ext}`), buf)
        saved = { url: c.url, ext, bytes: buf.length }
        break
      } catch {}
    }
    if (saved) {
      results.push({ slug, ok: true, ...saved, domain })
      console.log(`✓ ${slug.padEnd(20)} ${saved.ext.padEnd(4)} ${String(saved.bytes).padStart(7)}B  ${saved.url.slice(0, 72)}`)
    } else {
      results.push({ slug, ok: false, domain, why: 'no usable icon' })
      console.log(`· ${slug.padEnd(20)} no usable icon -> stays a text label`)
    }
  } catch (e) {
    results.push({ slug, ok: false, domain, why: String(e.message) })
    console.log(`· ${slug.padEnd(20)} ${e.message} -> stays a text label`)
  }
}

const ok = results.filter((r) => r.ok)
console.log(`\n${ok.length}/${results.length} sourced. ${results.length - ok.length} remain text labels.`)
if (!DRY) writeFileSync(join(ROOT, 'src/lib/brand-sourced.json'), JSON.stringify(
  Object.fromEntries(ok.map((r) => [r.slug, { file: `${r.slug}.${r.ext}`, brandPage: r.url, domain: r.domain }])), null, 2) + '\n')
