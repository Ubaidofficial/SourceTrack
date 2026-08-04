#!/usr/bin/env node
// SourceTrack — Demo Ecommerce (40ae22f2) STAGING fixture generator.
//
// WHY THIS IS COMMITTED: it was first written to a scratchpad, and the generated NDJSON was
// then one `git worktree remove` away from vanishing. A fixture you cannot regenerate is not a
// fixture, it is a one-off file someone has to babysit. Committing the GENERATOR (never the
// generated NDJSON — ~1 MB of synthetic rows does not belong in git history) makes the dataset
// reproducible from a seed instead of preserved by luck.
//
// WRITES NDJSON TO DISK ONLY. It never ingests. The write path is
// tinybird/tools/ingest_ndjson_to_tinybird.mjs, which is guarded by
// scripts/lib/staging-seed-guard.mjs (#634) and founder-run with --confirm.
//
// DETERMINISTIC: same --seed + --end => byte-identical file. mulberry32 PRNG, fixed reference
// date; no Date.now()/Math.random() anywhere in the data path — the same rule
// generate_events.js follows, pinned by api/tests/demo-ecom-fixture-determinism.test.js.
//
// SCHEMA: lines are FLAT objects. events.datasource maps `properties` to `json:$` (the whole
// root), so typed columns and JSON-bag keys (order_id, …) are top-level siblings. There is no
// nested "properties" object. Tinybird stores site_id and NOT site_key (site_key is dropped by
// design — §6.5, it is a customer-facing secret), so the fixture keys on site_id.
//
// Usage:
//   node tinybird/tools/generate_demo_ecom_fixture.mjs --out demo-ecom.ndjson
//   node tinybird/tools/generate_demo_ecom_fixture.mjs --out f.ndjson --seed s1 --end 2026-08-04
//   ... --no-nonconverting     # conversions + their backing pageviews only (100% CVR — see below)

import { writeFileSync } from 'node:fs'

// The staging Demo Ecommerce site. Allowlisted in scripts/lib/staging-seed-guard.mjs
// (STAGING_SITE_IDS) — verified present in staging Supabase and absent from prod.
export const DEMO_ECOM_SITE_ID = '40ae22f2-1ec4-4653-a6cd-c1e116848a60'

export const DEFAULT_SEED = 's1'
export const DEFAULT_END = '2026-08-04'
const DAYS = 30

function hashSeed (s) {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  return (h ^ (h >>> 16)) >>> 0
}
function mulberry32 (a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Source mix ────────────────────────────────────────────────────────────────────────────────
// `weight` drives NON-converting sessions; `conversions` is the exact converting count, so the
// per-source conversion split is pinned rather than emergent. AI (ChatGPT + Perplexity) is 7/23
// ≈ 30% of conversions — weighted as the product differentiator, not sprinkled in as decoration.
//
// ai_source uses the CANONICAL display names the classifier maps to (api/lib/channel-classifier.js
// :59,64 — 'chatgpt.com' -> 'ChatGPT'). A non-canonical value is REJECT-UNKNOWN'd on the app path
// and would read as unattributed here, so the fixture must supply the already-canonical form.
const SOURCES = [
  { key: 'google_organic', conversions: 5, weight: 34, utm_source: null, utm_medium: null, utm_campaign: null, referrer: 'https://www.google.com/', ai_source: null },
  { key: 'google_cpc', conversions: 3, weight: 12, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'summer-tees-2026', referrer: 'https://www.google.com/', ai_source: null, gclid: true },
  { key: 'chatgpt', conversions: 4, weight: 10, utm_source: null, utm_medium: null, utm_campaign: null, referrer: 'https://chatgpt.com/', ai_source: 'ChatGPT' },
  { key: 'perplexity', conversions: 3, weight: 7, utm_source: null, utm_medium: null, utm_campaign: null, referrer: 'https://www.perplexity.ai/', ai_source: 'Perplexity' },
  { key: 'instagram', conversions: 2, weight: 14, utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'reels-launch', referrer: 'https://l.instagram.com/', ai_source: null },
  { key: 'facebook', conversions: 2, weight: 11, utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'reels-launch', referrer: 'https://l.facebook.com/', ai_source: null },
  { key: 'direct', conversions: 2, weight: 8, utm_source: null, utm_medium: null, utm_campaign: null, referrer: null, ai_source: null },
  { key: 'email', conversions: 2, weight: 4, utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'august-drop', referrer: null, ai_source: null }
]

const LANDING = ['/', '/collections/new-in', '/collections/tees', '/products/linen-shirt', '/products/canvas-tote', '/collections/sale']
const PRODUCT = ['/products/linen-shirt', '/products/canvas-tote', '/products/wool-scarf', '/products/denim-jacket', '/products/cotton-cap']
const COUNTRIES = ['US', 'US', 'US', 'GB', 'DE', 'CA', 'AU', 'NL', 'FR']
const DEVICES = ['mobile', 'mobile', 'mobile', 'desktop', 'desktop', 'tablet']
const BROWSERS = { mobile: ['Mobile Safari', 'Chrome Mobile'], desktop: ['Chrome', 'Safari', 'Firefox', 'Edge'], tablet: ['Mobile Safari', 'Chrome'] }
const ORIGIN = 'https://demo-ecom.sourcetrack.ai'
const ZERO_DAYS = new Set([6, 19]) // genuine no-traffic days, so the series has real gaps
const TARGET_NONCONVERTING_SESSIONS = 780

// PURE. Same (seed, end, withNonConverting) => identical rows, in identical order.
export function buildDemoEcomFixture ({ seed = DEFAULT_SEED, end = DEFAULT_END, withNonConverting = true } = {}) {
  const rnd = mulberry32(hashSeed(seed))
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
  const between = (lo, hi) => lo + rnd() * (hi - lo)
  const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1))

  const endMs = Date.parse(end + 'T00:00:00Z')

  // Day shape: explicitly NOT flat and NOT clustered — a weekly rhythm (weekends lighter for this
  // store), a mid-window promo bump, one quiet Tuesday, plus the two zero days above.
  function dayWeight (d) {
    if (ZERO_DAYS.has(d)) return 0
    const dow = new Date(endMs - (DAYS - 1 - d) * 86400000).getUTCDay()
    let w = (dow === 0 || dow === 6) ? 0.55 : 1
    if (d >= 21 && d <= 24) w *= 1.9
    if (d === 12) w *= 0.4
    return w * between(0.75, 1.3)
  }
  const dayW = Array.from({ length: DAYS }, (_, d) => dayWeight(d))
  const totalW = dayW.reduce((a, b) => a + b, 0)

  function tsOnDay (d) {
    // Diurnal shape, most traffic 09:00–21:00 UTC. The hour is capped at 21 so a whole session
    // (up to ~4 pageviews plus a conversion, ≈17 min of dwell) still lands inside the same UTC
    // day. Without the cap, late sessions tipped past midnight and the file ran to END+1 — 31
    // calendar days, with rows dated after the reference date. The dashboard's traffic/cost
    // gates read a 30-day window, so that silently changed what the fixture demonstrates.
    const base = endMs - (DAYS - 1 - d) * 86400000
    const hour = Math.min(21, Math.max(0, Math.round(between(8, 21) + between(-1.5, 1.5))))
    const ms = base + hour * 3600000 + intBetween(0, 59) * 60000 + intBetween(0, 59) * 1000 + intBetween(0, 999)
    return new Date(ms).toISOString().replace('T', ' ').replace('Z', '')
  }

  let seq = 0
  const eid = (p) => `${p}-${DEMO_ECOM_SITE_ID.slice(0, 8)}-${(++seq).toString().padStart(5, '0')}`
  const rows = []

  function baseRow (src, visitorId, ts, device) {
    const row = {
      site_id: DEMO_ECOM_SITE_ID,
      distinct_id: visitorId,
      visitor_id: visitorId,
      timestamp: ts,
      ingestion_method: 'server_routed',
      country: pick(COUNTRIES),
      device_type: device,
      browser_name: pick(BROWSERS[device]),
      referrer: src.referrer,
      utm_source: src.utm_source,
      utm_medium: src.utm_medium,
      utm_campaign: src.utm_campaign,
      ai_source: src.ai_source
    }
    if (src.gclid) row.gclid = `Cj0KCQjw${Math.floor(rnd() * 1e12).toString(36)}`
    return row
  }

  const firstTouchSource = (src) => src.utm_source || (src.ai_source ? src.ai_source.toLowerCase() : (src.referrer ? 'google' : 'direct'))
  const firstTouchMedium = (src) => src.utm_medium || (src.ai_source ? 'ai' : (src.referrer ? 'organic' : 'none'))

  function session (src, day, converts) {
    const visitorId = `v_${DEMO_ECOM_SITE_ID.slice(0, 4)}_${(++seq).toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`
    const device = pick(DEVICES)
    const startTs = tsOnDay(day)
    const nPages = converts ? intBetween(2, 4) : intBetween(1, 3)
    const startMs = Date.parse(startTs.replace(' ', 'T') + 'Z')

    const pages = [pick(LANDING)]
    for (let i = 1; i < nPages; i++) pages.push(pick(PRODUCT))
    if (converts) pages.push('/checkout')

    let lastMs = startMs
    for (let i = 0; i < pages.length; i++) {
      lastMs += i === 0 ? 0 : intBetween(25, 210) * 1000
      rows.push({
        ...baseRow(src, visitorId, new Date(lastMs).toISOString().replace('T', ' ').replace('Z', ''), device),
        event_type: '$pageview',
        event_id: eid('pv'),
        page_url: ORIGIN + pages[i],
        first_touch_source: firstTouchSource(src),
        first_touch_medium: firstTouchMedium(src),
        first_touch_campaign: src.utm_campaign,
        first_touch_timestamp: startTs
      })
    }

    if (!converts) return

    // Order values: $25–$250, deliberately non-round and right-skewed (most orders low-to-mid, a
    // few large) rather than an even sweep of the range. Real baskets are not uniformly spread.
    const r = rnd()
    const value = r < 0.55 ? between(25, 78) : r < 0.85 ? between(78, 150) : between(150, 250)
    lastMs += intBetween(45, 240) * 1000
    rows.push({
      ...baseRow(src, visitorId, new Date(lastMs).toISOString().replace('T', ' ').replace('Z', ''), device),
      event_type: '$conversion',
      event_id: eid('cv'),
      page_url: ORIGIN + '/checkout/thank-you',
      conversion_value: Math.round(value * 100) / 100,
      currency: 'USD',
      conversion_type: 'purchase',
      first_touch_source: firstTouchSource(src),
      first_touch_medium: firstTouchMedium(src),
      first_touch_campaign: src.utm_campaign,
      first_touch_timestamp: startTs,
      order_id: `SO-${10000 + seq}`
    })
  }

  const activeDays = [...Array(DAYS).keys()].filter((d) => dayW[d] > 0)
  function weightedDay () {
    let r = rnd() * totalW
    for (let d = 0; d < DAYS; d++) { r -= dayW[d]; if (r <= 0 && dayW[d] > 0) return d }
    return activeDays[activeDays.length - 1]
  }

  for (const src of SOURCES) {
    for (let i = 0; i < src.conversions; i++) session(src, weightedDay(), true)
  }

  // Non-converting traffic so the fixture has a believable conversion rate (~2.9%). Without it
  // every visitor converts — a 100% conversion rate that reads as obviously fake on any
  // dashboard, which defeats the point of a screenshot fixture.
  if (withNonConverting) {
    const srcTotalW = SOURCES.reduce((a, s) => a + s.weight, 0)
    for (const src of SOURCES) {
      const n = Math.round(TARGET_NONCONVERTING_SESSIONS * (src.weight / srcTotalW))
      for (let i = 0; i < n; i++) session(src, weightedDay(), false)
    }
  }

  rows.sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0)
  return rows
}

export function summarize (rows) {
  const convs = rows.filter((r) => r.event_type === '$conversion')
  const vals = convs.map((c) => c.conversion_value)
  const bySource = {}
  for (const c of convs) {
    const k = c.utm_source || c.ai_source || (c.referrer ? 'google (organic)' : 'direct')
    bySource[k] = bySource[k] || { conversions: 0, revenue: 0 }
    bySource[k].conversions++
    bySource[k].revenue += c.conversion_value
  }
  return {
    rows: rows.length,
    pageviews: rows.length - convs.length,
    conversions: convs.length,
    visitors: new Set(rows.map((r) => r.visitor_id)).size,
    activeDays: new Set(rows.map((r) => r.timestamp.slice(0, 10))).size,
    firstDay: rows[0].timestamp.slice(0, 10),
    lastDay: rows[rows.length - 1].timestamp.slice(0, 10),
    revenue: Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100,
    minValue: Math.min(...vals),
    maxValue: Math.max(...vals),
    bySource
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
// Guarded so the module can be imported by tests without writing a file or exiting.
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const n = argv[i + 1]
      args[a.slice(2)] = (n && !n.startsWith('--')) ? (i++, n) : 'true'
    }
  }
  const out = args.out
  if (!out || out === 'true') {
    console.error('ERROR: --out <file.ndjson> is required.')
    process.exit(2)
  }
  const rows = buildDemoEcomFixture({
    seed: args.seed || DEFAULT_SEED,
    end: args.end || DEFAULT_END,
    withNonConverting: args['no-nonconverting'] !== 'true'
  })
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')

  const s = summarize(rows)
  console.log(`file            ${out}`)
  console.log(`total rows      ${s.rows}  (${s.pageviews} pageview, ${s.conversions} conversion)`)
  console.log(`visitors        ${s.visitors}`)
  console.log(`date range      ${s.firstDay} -> ${s.lastDay}  (${s.activeDays} active days of ${DAYS})`)
  console.log(`revenue         $${s.revenue.toFixed(2)}   min $${s.minValue.toFixed(2)}  max $${s.maxValue.toFixed(2)}  avg $${(s.revenue / s.conversions).toFixed(2)}`)
  console.log(`conv rate       ${((s.conversions / s.visitors) * 100).toFixed(2)}% of visitors`)
  console.log('per source:')
  for (const [k, v] of Object.entries(s.bySource).sort((a, b) => b[1].revenue - a[1].revenue)) {
    console.log(`  ${k.padEnd(18)} ${String(v.conversions).padStart(2)} conv   $${v.revenue.toFixed(2)}`)
  }
}
