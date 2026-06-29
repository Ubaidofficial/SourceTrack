#!/usr/bin/env node
// SourceTrack — synthetic event generator (Phase 0).
//
// Produces NDJSON events conforming EXACTLY to the committed
// tinybird/datasources/events.datasource schema (48 typed columns + the
// `properties String json:$` whole-root catch-all). One generator feeds both
// (a) the Phase-1 sorting-key load test and (b) later dual-write validation.
//
// SCHEMA NOTE (verify against events.datasource): `properties` maps to `json:$`
// — the ENTIRE row object. So every NDJSON line is a flat object whose top-level
// keys are the typed columns PLUS the §2.6 JSON-bag keys (order_id, stripe_*,
// dynamic custom-params, ...). Tinybird extracts typed columns via their
// `json:$.<col>` paths and stores the whole line as `properties`. There is no
// nested "properties" object.
//
// Edge-case flagging: a non-schema top-level `_synthetic` object rides in each
// line (captured by json:$ into `properties`, queryable via JSONExtract) so
// validation can target refunds / dups / null-fields / custom-params precisely.
//
// AUTHOR + WRITE TO DISK ONLY. This script never ingests. See README for the
// (non-executed, token-free) Events API ingest command.
//
// ESM (package.json "type":"module"); no external deps; no require().

import { createWriteStream } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// ----------------------------------------------------------------------------
// Seeded RNG — mulberry32. Deterministic: same --seed + flags => identical file
// (required so the same set can later be replayed into PostHog AND Tinybird to
// diff). No Date.now()/Math.random() anywhere in the data path.
// ----------------------------------------------------------------------------
function hashSeed (str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
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

// ----------------------------------------------------------------------------
// CLI flags
// ----------------------------------------------------------------------------
function parseArgs (argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : 'true'
      out[key] = val
    }
  }
  return out
}
const args = parseArgs(process.argv.slice(2))
const VISITORS = parseInt(args.visitors ?? '200', 10)
const SITES = parseInt(args.sites ?? '3', 10)
const DAYS = parseInt(args.days ?? '30', 10)
const CONV_RATE = parseFloat(args['conversion-rate'] ?? '0.3')
const SEED = String(args.seed ?? 'sourcetrack')
// --end is a FIXED reference date (not Date.now()) so the dataset is reproducible
// across run-days. Override with --end YYYY-MM-DD.
const END = String(args.end ?? '2026-06-30')
const OUT = String(args.out ?? 'tinybird/fixtures/events_sample.ndjson')

const rng = mulberry32(hashSeed(SEED))
const endMs = Date.parse(END + 'T23:59:59.000Z')
const rangeMs = DAYS * 24 * 60 * 60 * 1000

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const pick = (arr) => arr[Math.floor(rng() * arr.length)]
const chance = (p) => rng() < p
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))
const round2 = (n) => Math.round(n * 100) / 100
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('')
// UUIDv4-shaped id — intentionally used for anonymous visitor_id so the dataset
// exercises the LTV UUID-exclusion path (attribution-engine.js:2373).
const uuid4 = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(rng() * 4)]}${hex(3)}-${hex(12)}`
const iso = (ms) => new Date(ms).toISOString() // DateTime64(3) ISO w/ millis, UTC

// Attribution pools — varied so multi-touch models have something to resolve.
const SOURCES = ['google', 'facebook', 'bing', 'tiktok', 'linkedin', 'newsletter', 'reddit', 'direct']
const MEDIUMS = ['cpc', 'organic', 'social', 'email', 'referral', 'none']
const CAMPAIGNS = ['spring_sale', 'retargeting', 'brand', 'q2_launch', 'evergreen', '']
const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'CA', 'AU', 'NL', 'IN']
const DEVICES = ['desktop', 'mobile', 'tablet']
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge']
const AI_SOURCES = ['chatgpt.com', 'perplexity.ai', 'gemini.google.com', null, null, null]
const CLICKID_FOR = { google: 'gclid', facebook: 'fbclid', bing: 'msclkid', tiktok: 'ttclid', linkedin: 'li_fat_id' }
const PROVIDERS = [
  { provider: 'browser', ingestion_method: 'server_routed', conversion_type: 'form' },
  { provider: 'stripe', ingestion_method: 'webhook_stripe', conversion_type: 'purchase' },
  { provider: 'shopify', ingestion_method: 'webhook_shopify', conversion_type: 'purchase' },
  { provider: 'payments_api', ingestion_method: 'offline', conversion_type: 'purchase' }
]

const siteId = (n) => `site-${String(n).padStart(2, '0')}`

// The full set of typed columns, with null/default-aware emission. Optional
// (Nullable) columns are emitted as explicit null when absent so the NDJSON
// exercises the read-side COALESCE/NULLIF default mapping. DEFAULT-backed
// columns (conversion_value, conversion_type, first_touch_*) are always emitted.
function baseEvent (ctx, eventType, ts, eventId) {
  const nullFields = chance(0.12) // edge: null/empty optionals
  return {
    site_id: ctx.site_id,
    event_type: eventType,
    event_id: eventId,
    distinct_id: ctx.distinct_id,
    visitor_id: ctx.visitor_id,
    timestamp: iso(ts),
    ingestion_method: eventType === '$conversion' ? ctx.conv.ingestion_method : 'server_routed',
    // first-touch carried from the journey's opening pageview (resolves first-touch models)
    first_touch_source: ctx.ft.source,
    first_touch_medium: ctx.ft.medium,
    first_touch_campaign: ctx.ft.campaign,
    first_touch_timestamp: ctx.ft.timestamp,
    // per-event attribution (null-field edge zeroes these out)
    utm_source: nullFields ? null : ctx.touch.source,
    utm_medium: nullFields ? null : ctx.touch.medium,
    utm_campaign: nullFields ? null : ctx.touch.campaign,
    utm_content: chance(0.3) ? `ad_${hex(4)}` : null,
    utm_term: chance(0.2) ? pick(['shoes', 'crm software', 'running gear']) : null,
    ai_source: pick(AI_SOURCES),
    page_url: `https://${ctx.site_host}/${pick(['', 'pricing', 'blog/post', 'product/x', 'checkout'])}`,
    referrer: chance(0.5) ? `https://${ctx.touch.source}.com/` : null,
    country: nullFields ? null : pick(COUNTRIES),
    device_type: nullFields ? null : pick(DEVICES),
    browser_name: pick(BROWSERS),
    server_timestamp: iso(ts),
    _synthetic: { journey: ctx.journey_id, seq: ctx.seq, edge: nullFields ? 'null_fields' : null }
  }
}

// Click ids — set the one matching the source (most null, per normalizeClickIds).
function clickIds (source) {
  const ids = {
    gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null, ttclid: null,
    li_fat_id: null, li_fatid: null, twclid: null, dclid: null, snapclid: null,
    pclid: null, sccid: null, ko_click_id: null
  }
  const k = CLICKID_FOR[source]
  if (k && chance(0.8)) ids[k] = hex(20)
  return ids
}

// §2.6 JSON-bag keys for a conversion — realistic subset varying by provider.
function conversionBag (ctx, conv, orderId) {
  const bag = {
    conversion_event_id: orderId,
    order_id: orderId,
    provider_event_id: `evt_${hex(16)}`,
    anonymous_id: ctx.visitor_id,
    user_id: ctx.user_id,
    has_resolved_anonymous_id: !!ctx.user_id,
    identity_resolution_source: ctx.user_id ? 'identify' : 'none',
    identity_resolution_status: ctx.user_id ? 'resolved' : 'unresolved',
    tracking_method: 'server',
    external_id: chance(0.3) ? `ext_${hex(8)}` : null
  }
  if (conv.provider === 'stripe') {
    Object.assign(bag, {
      payment_id: `pi_${hex(16)}`,
      stripe_invoice_id: `in_${hex(12)}`,
      stripe_subscription_id: chance(0.5) ? `sub_${hex(12)}` : null,
      stripe_event_type: 'invoice.paid',
      stripe_billing_reason: pick(['subscription_create', 'subscription_cycle']),
      webhook_customer_id: `cus_${hex(12)}`,
      webhook_email_present: true,
      webhook_source: 'stripe'
    })
  } else if (conv.provider === 'shopify') {
    Object.assign(bag, { order_name: `#${randInt(1000, 9999)}`, webhook_source: 'shopify' })
  } else if (conv.provider === 'browser') {
    Object.assign(bag, {
      form_name: pick(['newsletter', 'demo_request', 'contact']),
      form_provider: pick(['native', 'typeform', 'hubspot']),
      form_action_host: ctx.site_host,
      form_action_path: '/submit',
      page_path: '/checkout'
    })
  }
  // dynamic custom-params edge — arbitrary keys inside the bag
  if (chance(0.25)) {
    bag.custom_properties = { plan_tier: pick(['starter', 'growth', 'founder']), coupon: `SAVE${randInt(5, 30)}` }
    bag[`cp_${pick(['segment', 'experiment', 'partner'])}`] = `v_${hex(4)}`
    bag._synthetic = { ...(ctx._bagSynthetic || {}), edge_custom_params: true }
  }
  return bag
}

let nextStripeCounter = 0
function makeConversion (ctx, ts) {
  const conv = ctx.conv
  const orderId = conv.provider === 'stripe' ? `in_${hex(12)}` : `ord_${hex(10)}`
  const eventId = orderId // §2.5: natural id is the canonical dedup key
  const value = round2(randInt(19, 499) + rng())
  const ev = baseEvent(ctx, '$conversion', ts, eventId)
  Object.assign(ev, clickIds(ev.utm_source || ctx.touch.source))
  ev.conversion_value = value
  ev.conversion_type = conv.conversion_type
  ev.provider = conv.provider
  ev.currency = conv.provider === 'browser' ? null : pick(['USD', 'EUR', 'GBP'])
  ev.stitching_method = ctx.user_id ? 'user_id_resolved' : 'anonymous_id'
  ev.attribution_status = ctx.user_id ? 'attributed' : 'unattributed'
  ev.external_event_id = chance(0.5) ? `cap_${hex(12)}` : null
  ev.occurred_at = iso(ts)
  Object.assign(ev, conversionBag(ctx, conv, orderId))
  return { ev, eventId, value }
}

// ----------------------------------------------------------------------------
// Generation — realistic per-visitor journeys
// ----------------------------------------------------------------------------
mkdirSync(dirname(OUT), { recursive: true })
const stream = createWriteStream(OUT, { encoding: 'utf8' })
const write = (obj) => stream.write(JSON.stringify(obj) + '\n')

let total = 0
let conversions = 0
let refunds = 0
let dups = 0

for (let v = 0; v < VISITORS; v++) {
  const sIdx = randInt(0, SITES - 1)
  const site_id = siteId(sIdx)
  const site_host = `${site_id}.example.com`
  const visitorId = uuid4()
  const startMs = endMs - Math.floor(rng() * rangeMs)
  const opening = { source: pick(SOURCES), medium: pick(MEDIUMS), campaign: pick(CAMPAIGNS) }
  const ctx = {
    site_id,
    site_host,
    visitor_id: visitorId,
    distinct_id: visitorId, // cookieless: distinct_id == visitor_id across the journey
    user_id: null,
    journey_id: `j_${hex(8)}`,
    seq: 0,
    touch: opening,
    ft: { source: opening.source, medium: opening.medium, campaign: opening.campaign, timestamp: iso(startMs) },
    conv: pick(PROVIDERS)
  }

  let ts = startMs
  const pageviews = randInt(1, 8)
  for (let p = 0; p < pageviews; p++) {
    ctx.seq++
    ctx.touch = { source: pick(SOURCES), medium: pick(MEDIUMS), campaign: pick(CAMPAIGNS) } // multi-touch
    const pv = baseEvent(ctx, '$pageview', ts, `pv_${ctx.journey_id}_${p}`)
    Object.assign(pv, clickIds(pv.utm_source || ctx.touch.source))
    write(pv); total++
    ts += randInt(1, 240) * 60 * 1000 // minutes between touches
  }

  // optional $identify mid-to-late in the journey
  if (chance(0.4)) {
    ctx.seq++
    ctx.user_id = `user_${hex(10)}`
    const idv = baseEvent(ctx, '$identify', ts, `id_${ctx.journey_id}`)
    idv.user_id = ctx.user_id
    write(idv); total++
    ts += randInt(1, 120) * 60 * 1000
  }

  // optional custom event
  if (chance(0.2)) {
    ctx.seq++
    const cu = baseEvent(ctx, 'custom', ts, `cu_${ctx.journey_id}_${hex(4)}`)
    cu.event_type = 'custom'
    cu[`feature_${pick(['export', 'invite', 'upgrade_click'])}`] = true
    cu._synthetic = { journey: ctx.journey_id, seq: ctx.seq, edge: 'custom_params' }
    write(cu); total++
    ts += randInt(1, 120) * 60 * 1000
  }

  // conversion at the configured rate
  if (chance(CONV_RATE)) {
    ctx.seq++
    const { ev, eventId, value } = makeConversion(ctx, ts)
    write(ev); total++; conversions++

    // edge: duplicate — same (site_id, event_id) emitted twice (dedup target)
    if (chance(0.15)) {
      const dup = { ...ev, _synthetic: { journey: ctx.journey_id, seq: ctx.seq, edge: 'dup' } }
      write(dup); total++; dups++
    }

    // edge: refund — compensating $conversion, NEGATIVE value, related event_id
    // family (`<orig>:refund`) so it is NOT dedup-dropped (§9 signed-sum net).
    if (chance(0.2)) {
      ts += randInt(1, 20) * 24 * 60 * 60 * 1000
      const refundCtx = { ...ctx, seq: ctx.seq + 1 }
      const { ev: rev } = makeConversion(refundCtx, ts)
      rev.event_id = `${eventId}:refund`
      rev.conversion_event_id = `${eventId}:refund`
      rev.order_id = eventId
      rev.conversion_value = -value
      rev.conversion_type = 'refund'
      rev._synthetic = { journey: ctx.journey_id, seq: refundCtx.seq, edge: 'refund', refund_of: eventId }
      write(rev); total++; refunds++
    }
  }
}

stream.end(() => {
  process.stderr.write(
    `[generate_events] wrote ${total} events -> ${OUT}\n` +
    `  seed=${SEED} visitors=${VISITORS} sites=${SITES} days=${DAYS} end=${END} conversion-rate=${CONV_RATE}\n` +
    `  conversions=${conversions} refunds=${refunds} duplicates=${dups}\n`
  )
})
