#!/usr/bin/env node
// SourceTrack — Phase 9 APP-PATH fixture injector (Option 1).
//
// PURPOSE: populate the phase9-fixtures-v1 events in BOTH stores in each store's
// NATIVE shape by sending synthetic events through the REAL app HTTP ingestion
// endpoints — so the app's own dual-write fans out to PostHog (469905) AND
// Tinybird (ST_Staging) exactly the way production does. Unlike
// ingest_ndjson_to_tinybird.mjs (Tinybird-only, NOT reconciliation-faithful),
// this drives the SAME path the Phase-9 harness validates.
//
// ⚠️ FOUNDER-GATED WRITE. Default (no --confirm) is DRY-RUN: it reshapes + prints
// exactly what WOULD be POSTed (endpoints, counts, a masked sample) and sends
// NOTHING. The real POSTs must be triggered by the founder with --confirm and the
// site_key/base URL in env. Agents do not run the --confirm path.
//
// TARGET ENDPOINTS (traced from api/index.js — CONFIRMED):
//   POST {ST_INJECT_BASE_URL}/api/track       ← $pageview        (api/index.js:383)
//   POST {ST_INJECT_BASE_URL}/api/conversion   ← $conversion      (api/index.js:437)
//   Both run validateSiteKey, which reads site_key from the request BODY
//   (auth.js:26 `req.body?.site_key || req.query?.site_key`) → we send it in the body.
//   Both DROP bot UAs via isBotUserAgent (track.js / bot-filter.js) → we send a
//   realistic browser User-Agent (asserted below to clear BOT_UA_PATTERN).
//
// FIXTURE SOURCE: the deterministic phase9-fixtures-v1 NDJSON, generated with
//   node tinybird/tools/generate_events.js --seed phase9-fixtures-v1 --visitors 400 --sites 3 --days 30 --conversion-rate 0.5 --out <file>
// Each flat line is reshaped into the track/conversion HTTP body below.
//
// RE-RUN SAFETY (flagged): /api/track pageviews have NO natural-id dedup (the
// dual-write derives a uuid), so RE-RUNNING DUPLICATES pageviews. /api/conversion
// dedups on order_id. → Run ONCE against a CLEAN test site, or purge the test
// site between runs. Deterministic seed keeps event content identical across runs
// but does NOT prevent pageview duplication.
//
// ENV (founder-supplied; NEVER committed/logged in full):
//   ST_INJECT_BASE_URL   staging API base, e.g. https://sourcetrack-api-staging.up.railway.app
//   ST_INJECT_SITE_KEY   the test site's site_key (masked in all output)
//
// Usage:
//   node tinybird/tools/phase9_app_path_injector.mjs --in <phase9.ndjson>                    # DRY-RUN (default)
//   ST_INJECT_BASE_URL=.. ST_INJECT_SITE_KEY=.. \
//     node tinybird/tools/phase9_app_path_injector.mjs --in <phase9.ndjson> --confirm        # SENDS (founder)
//   optional: --only-site-id <id>  --limit <N>

import { readFileSync } from 'node:fs'
import { isBotUserAgent } from '../../api/lib/bot-filter.js'

// A realistic desktop-Chrome UA. MUST clear BOT_UA_PATTERN (bot-filter.js) or the
// track/conversion routes silently drop the event. Guarded at run() start.
export const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export const TRACK_PATH = '/api/track'
export const CONVERSION_PATH = '/api/conversion'

// ── Reshape: flat generator event → HTTP body the route parses ────────────────
// track.js reads req.body.{event, anonymous_id, page_url, referrer, utm_*,
// first_touch_*, timestamp, properties, click ids}; site_key authenticates.
export function toPageview (ev, siteKey) {
  return {
    site_key: siteKey,
    event: '$pageview',
    anonymous_id: ev.distinct_id,
    page_url: ev.page_url,
    referrer: ev.referrer ?? null,
    utm_source: ev.utm_source ?? null,
    utm_medium: ev.utm_medium ?? null,
    utm_campaign: ev.utm_campaign ?? null,
    utm_content: ev.utm_content ?? null,
    utm_term: ev.utm_term ?? null,
    first_touch_source: ev.first_touch_source ?? null,
    first_touch_medium: ev.first_touch_medium ?? null,
    first_touch_campaign: ev.first_touch_campaign ?? null,
    first_touch_timestamp: ev.first_touch_timestamp ?? null,
    timestamp: ev.timestamp,
    properties: {}
  }
}

// conversion.js reads req.body.{anonymous_id, conversion_value, conversion_type,
// order_id, page_url, referrer, utm_*, getFirstTouchFields(first_touch_*),
// timestamp}; site_key authenticates.
export function toConversion (ev, siteKey) {
  return {
    site_key: siteKey,
    event: '$conversion',
    anonymous_id: ev.distinct_id,
    conversion_value: ev.conversion_value,
    conversion_type: ev.conversion_type,
    order_id: ev.order_id ?? null,
    page_url: ev.page_url,
    referrer: ev.referrer ?? null,
    utm_source: ev.utm_source ?? null,
    utm_medium: ev.utm_medium ?? null,
    utm_campaign: ev.utm_campaign ?? null,
    first_touch_source: ev.first_touch_source ?? null,
    first_touch_medium: ev.first_touch_medium ?? null,
    first_touch_campaign: ev.first_touch_campaign ?? null,
    first_touch_timestamp: ev.first_touch_timestamp ?? null,
    timestamp: ev.timestamp,
    properties: {}
  }
}

// Route a flat event to its { path, body }. Returns null for unknown event types.
export function reshape (ev, siteKey) {
  if (ev.event_type === '$pageview') return { path: TRACK_PATH, body: toPageview(ev, siteKey) }
  if (ev.event_type === '$conversion') return { path: CONVERSION_PATH, body: toConversion(ev, siteKey) }
  return null
}

// Mask a secret for logs: keep a short non-reversible prefix only.
export function maskKey (k) {
  if (!k || typeof k !== 'string') return '(unset)'
  return k.length <= 6 ? '****' : `${k.slice(0, 4)}…****(len ${k.length})`
}

// ── Core runner ───────────────────────────────────────────────────────────────
// opts: { events[], siteKey, baseUrl, confirm, ua, fetchImpl, log }
// DRY-RUN (confirm !== true): builds every payload, prints a summary + masked
// sample, and NEVER calls fetchImpl. Returns { sent:0, wouldSend, byPath }.
// CONFIRM: requires baseUrl + siteKey; POSTs each event with the browser UA.
export async function run (opts = {}) {
  const {
    events = [], siteKey, baseUrl, confirm = false,
    ua = DEFAULT_UA, fetchImpl = globalThis.fetch, log = console.log
  } = opts

  // Bot-filter self-check: a bot UA would be silently dropped by the routes.
  if (isBotUserAgent(ua)) {
    throw new Error(`[phase9-inject] User-Agent would be dropped by the bot filter — refusing to run. UA=${ua}`)
  }

  const planned = []
  for (const ev of events) {
    const r = reshape(ev, siteKey)
    if (r) planned.push(r)
  }
  const byPath = planned.reduce((m, p) => { m[p.path] = (m[p.path] || 0) + 1; return m }, {})

  if (confirm !== true) {
    log('DRY-RUN (no --confirm): WOULD POST via the real app ingestion path; sending NOTHING.')
    log(`  base URL : ${baseUrl || '(ST_INJECT_BASE_URL unset)'}`)
    log(`  site_key : ${maskKey(siteKey)}`)
    log(`  UA       : ${ua}  (bot-filter clears=${!isBotUserAgent(ua)})`)
    log(`  totals   : ${planned.length} events → ${JSON.stringify(byPath)}`)
    const samplePv = planned.find(p => p.path === TRACK_PATH)
    const sampleConv = planned.find(p => p.path === CONVERSION_PATH)
    if (samplePv) log(`  sample ${TRACK_PATH}: ${JSON.stringify({ ...samplePv.body, site_key: maskKey(samplePv.body.site_key) })}`)
    if (sampleConv) log(`  sample ${CONVERSION_PATH}: ${JSON.stringify({ ...sampleConv.body, site_key: maskKey(sampleConv.body.site_key) })}`)
    return { sent: 0, wouldSend: planned.length, byPath }
  }

  // ── --confirm path: FOUNDER-RUN. Actually send. ──
  if (!baseUrl || !siteKey) {
    throw new Error('[phase9-inject] --confirm set but ST_INJECT_BASE_URL / ST_INJECT_SITE_KEY missing — refusing to send.')
  }
  let sent = 0
  const errors = []
  for (const p of planned) {
    const url = `${baseUrl.replace(/\/$/, '')}${p.path}`
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
        body: JSON.stringify(p.body)
      })
      if (!res.ok) errors.push(`${p.path} ${res.status}`)
      else sent++
    } catch (err) {
      errors.push(`${p.path} threw: ${err?.message || err}`)
    }
  }
  log(`[phase9-inject] SENT ${sent}/${planned.length} (${JSON.stringify(byPath)}); errors=${errors.length}`)
  if (errors.length) log(`[phase9-inject] first errors: ${errors.slice(0, 5).join(' | ')}`)
  return { sent, wouldSend: planned.length, byPath, errors }
}

// ── CLI ───────────────────────────────────────────────────────────────────────
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

function readNdjson (file, onlySiteId, limit) {
  const lines = readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
  let evs = lines.map(l => JSON.parse(l))
  if (onlySiteId) evs = evs.filter(e => String(e.site_id) === String(onlySiteId))
  // Send in timestamp order so first/last-touch derive naturally on the app side.
  evs.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
  if (limit) evs = evs.slice(0, Number(limit))
  return evs
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  if (!args.in) {
    console.error('[phase9-inject] --in <phase9-fixtures-v1.ndjson> is required. See header for how to generate it.')
    process.exit(2)
  }
  const events = readNdjson(args.in, args['only-site-id'], args.limit)
  if (events.length === 0) {
    console.error('[phase9-inject] 0 events after filtering — nothing to do (check --in / --only-site-id).')
    process.exit(2)
  }
  const confirm = args.confirm === 'true' || args.confirm === true
  const result = await run({
    events,
    siteKey: process.env.ST_INJECT_SITE_KEY,
    baseUrl: process.env.ST_INJECT_BASE_URL,
    confirm
  })
  process.exit(result.errors && result.errors.length ? 1 : 0)
}

// Run as CLI only when invoked directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err?.stack || err); process.exit(1) })
}
