#!/usr/bin/env node
// scripts/bench-live-vs-nightly.mjs — READ-ONLY latency benchmark: the real-time LIVE engine
// vs the Supabase NIGHTLY pre-agg, for model=linear + group_by=source, to decide whether the
// nightly can be retired (one engine, one truth, real-time).
//
// ── WHAT IT MEASURES ─────────────────────────────────────────────────────────
// For each window (7/30/90d) over ITER measured iterations (after WARMUP):
//   LIVE     = getMultiTouchAttributionLive({groupBy:'source'})  — full wall time, DECOMPOSED
//              into its two legs via the read seam:
//                • pipe   : multitouch_conversions_by_site   (Tinybird, materialized)
//                • hogql  : multitouch_pageviews_live        (HogQL, LIMIT 100000, NOT a pipe)
//   NIGHTLY  = getLinearAttribution({groupBy:'source'})         — Supabase single-row JSON read
// Reports p50/p95/p99/min/max/mean per path + per leg, plus the event VOLUME of the window.
//
// ── THE POINT (read before trusting any number) ──────────────────────────────
// The nightly pre-agg exists because HogQL couldn't serve these at scale (today's prod 504 on
// flexible_report is proof). That was HOGQL's limit, not Tinybird's. BUT the current LIVE path
// is a HYBRID: conversions from a Tinybird pipe, PAGEVIEWS STILL FROM HogQL (line ~1747,
// `_queryHogQL('multitouch_pageviews_live')`, LIMIT 100000, un-wired). Pageviews are the volume
// driver, so the hogql leg is the 504 risk. A fast conversions pipe proves NOTHING on its own —
// watch the `hogql pageviews` p95. Retiring the nightly requires the pageviews leg be
// materialized too (candidate: pageviews_windowed_by_site.pipe, exists, not wired here).
//
// ── VOLUME REQUIREMENT (this benchmark is meaningless without it) ─────────────
// A tiny fixture (staging de200000…) or empty tenant (techrupt.pk) proves NOTHING. The window
// needs realistic single-site volume — at or above the prod tenant that currently 504s. The
// script PRINTS the pageview/conversion counts per window so every latency is qualified as
// "p95=Xms at N pageviews". If N is in the hundreds, STOP — seed a volume fixture first.
//
// ── RUN (READ-ONLY; needs staging read creds injected) ───────────────────────
//   TINYBIRD_READ_ENABLED=true must be set AND TINYBIRD_READ_PIPES must include
//   multitouch_conversions_by_site (else the LIVE conversions leg silently uses HogQL and you're
//   benchmarking the wrong thing — the script refuses if so).
//   railway run --environment staging -s SourceTrack-Api \
//     SITE_ID=<uuid> ITER=25 node scripts/bench-live-vs-nightly.mjs
//   Optional env: WINDOWS=7,30,90  WARMUP=3  TODAY=2026-07-11  METRIC=conversions
//   Needs: TINYBIRD_HOST/READ_TOKEN (+flags), POSTHOG_* (pageviews leg), SUPABASE_* (nightly).
// No writes. No routing change. Measurement only.

import { performance } from 'node:perf_hooks'
import { queryTinybirdPipe, isPipeReadAllowed } from '../api/lib/tinybird-read.js'
import { queryHogQL } from '../api/lib/posthog.js'
import { esc } from '../api/lib/utils.js'
import { serializeHogQLDateRange } from '../api/lib/hogql-date.js'
import {
  getMultiTouchAttributionLive, getLinearAttribution,
  __setAttributionReadDeps, __resetAttributionReadDeps
} from '../api/lib/attribution-engine.js'

const SITE_ID = process.env.SITE_ID
const ITER = Number(process.env.ITER || 25)
const WARMUP = Number(process.env.WARMUP || 3)
const METRIC = process.env.METRIC || 'conversions'
const WINDOWS = (process.env.WINDOWS || '7,30,90').split(',').map((s) => Number(s.trim())).filter(Boolean)
const TODAY = process.env.TODAY ? new Date(process.env.TODAY + 'T00:00:00Z') : new Date()

if (!SITE_ID) { console.error('SITE_ID env is required (a single-site UUID with realistic volume).'); process.exit(2) }

// The LIVE conversions leg MUST serve from the pipe, or the benchmark is measuring HogQL twice.
if (!isPipeReadAllowed('multitouch_conversions_by_site')) {
  console.error('REFUSING: multitouch_conversions_by_site is not pipe-allowed (TINYBIRD_READ_ENABLED!=true or not in TINYBIRD_READ_PIPES). The LIVE conversions leg would silently use HogQL — benchmark invalid.')
  process.exit(3)
}

const fmt = (d) => d.toISOString().slice(0, 10)
const dateWindows = WINDOWS.map((days) => {
  const to = new Date(TODAY); const from = new Date(TODAY); from.setUTCDate(from.getUTCDate() - days)
  return { days, dateFrom: fmt(from), dateTo: fmt(to) }
})

function pct (arr, p) { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] }
const stat = (arr) => ({ n: arr.length, p50: pct(arr, 50), p95: pct(arr, 95), p99: pct(arr, 99), min: Math.min(...arr), max: Math.max(...arr), mean: arr.reduce((s, x) => s + x, 0) / arr.length })
const r0 = (n) => Math.round(n)

// Per-iteration leg collector: seam wrappers push {leg, ms} into whatever _current points at.
let _current = null
__setAttributionReadDeps({
  queryTinybird: async (pipe, params) => { const t = performance.now(); const r = await queryTinybirdPipe(pipe, params); if (_current) _current.push({ leg: `pipe:${pipe}`, ms: performance.now() - t }); return r },
  queryHog: async (sql, name) => { const t = performance.now(); const r = await queryHogQL(sql, name); if (_current) _current.push({ leg: `hogql:${name}`, ms: performance.now() - t }); return r }
})

async function eventVolume (dateFrom, dateTo) {
  const { from, to } = serializeHogQLDateRange(dateFrom, dateTo)
  const tbFrom = from.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const tbTo = to.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const q = `SELECT countIf(event_type='$pageview') AS pv, countIf(event_type='$conversion') AS cv FROM events WHERE site_id='${esc(SITE_ID)}' AND timestamp >= '${tbFrom}' AND timestamp < '${tbTo}' FORMAT JSON`
  try {
    const res = await fetch(`${process.env.TINYBIRD_HOST.replace(/\/$/, '')}/v0/sql?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${process.env.TINYBIRD_READ_TOKEN}` } })
    if (!res.ok) return null
    const b = await res.json(); return { pv: Number(b?.data?.[0]?.pv) || 0, cv: Number(b?.data?.[0]?.cv) || 0 }
  } catch { return null }
}

async function benchLive (dateFrom, dateTo) {
  const call = () => getMultiTouchAttributionLive({ siteId: SITE_ID, model: 'linear', groupBy: 'source', metric: METRIC, dateFrom, dateTo })
  for (let i = 0; i < WARMUP; i++) await call()
  const total = []; const legs = {}
  for (let i = 0; i < ITER; i++) {
    _current = []
    const t = performance.now(); await call(); total.push(performance.now() - t)
    for (const { leg, ms } of _current) { (legs[leg] ||= []).push(ms) }
    _current = null
  }
  return { total: stat(total), legs: Object.fromEntries(Object.entries(legs).map(([k, v]) => [k, stat(v)])) }
}

async function benchNightly (dateFrom, dateTo) {
  const call = () => getLinearAttribution({ siteId: SITE_ID, dateFrom, dateTo, groupBy: 'source', metric: METRIC })
  for (let i = 0; i < WARMUP; i++) await call()
  const total = []
  for (let i = 0; i < ITER; i++) { const t = performance.now(); await call(); total.push(performance.now() - t) }
  return stat(total)
}

async function main () {
  console.log(`\nBENCH live vs nightly | site=${SITE_ID} metric=${METRIC} iter=${ITER} warmup=${WARMUP} today=${fmt(TODAY)}\n`)
  try {
    for (const w of dateWindows) {
      const vol = await eventVolume(w.dateFrom, w.dateTo)
      const volStr = vol ? `${vol.pv.toLocaleString()} pageviews / ${vol.cv.toLocaleString()} conversions` : 'UNKNOWN (volume probe failed)'
      console.log(`── ${w.days}d  [${w.dateFrom} → ${w.dateTo}]  volume: ${volStr}`)
      if (vol && vol.pv < 10000) console.log('   ⚠️  LOW VOLUME (<10k pageviews) — result is NOT representative of prod scale. Seed a volume fixture.')
      const live = await benchLive(w.dateFrom, w.dateTo)
      const nightly = await benchNightly(w.dateFrom, w.dateTo)
      console.log(`   LIVE   total   p50=${r0(live.total.p50)}ms  p95=${r0(live.total.p95)}ms  p99=${r0(live.total.p99)}ms  max=${r0(live.total.max)}ms`)
      for (const [leg, s] of Object.entries(live.legs)) {
        const flag = leg.startsWith('hogql:') ? '  ← un-materialized (504 risk at volume)' : ''
        console.log(`          ${leg.padEnd(38)} p50=${r0(s.p50)}ms  p95=${r0(s.p95)}ms  max=${r0(s.max)}ms${flag}`)
      }
      console.log(`   NIGHTLY total   p50=${r0(nightly.p50)}ms  p95=${r0(nightly.p95)}ms  p99=${r0(nightly.p99)}ms  max=${r0(nightly.max)}ms  (baseline to justify beating)`)
      const verdict = live.total.p95 < 800 ? 'LIVE p95 < 800ms — meets the real-time bar (IF volume is realistic AND pageviews leg is materialized)' : 'LIVE p95 ≥ 800ms — does NOT meet the real-time bar; keep the split'
      console.log(`   → ${verdict}\n`)
    }
  } finally { __resetAttributionReadDeps() }
  console.log('DECISION RULE: retire the nightly ONLY IF, at prod-realistic volume across 7/30/90d, LIVE total p95 < 800ms')
  console.log('AND the hogql pageviews leg is first materialized to a pipe. As-is (pageviews=HogQL LIMIT 100000), the')
  console.log('live path inherits the same 504 that justified the nightly — so a fast conversions pipe is not sufficient.')
}

main().catch((e) => { console.error(e); process.exit(1) })
