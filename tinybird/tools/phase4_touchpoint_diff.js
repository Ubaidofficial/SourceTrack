// SourceTrack — Phase 4 touchpoint-set reconciliation harness (Pattern B).
//
// Diffs the touchpoint SET that the live PostHog HogQL path
// (getMultiTouchAttributionLive, api/lib/attribution-engine.js:1382) returns
// against the touchpoint SET the new Tinybird pipe pair
// (conversions_by_site.pipe + pageviews_windowed_by_site.pipe) returns, for the
// same site_id + model + date window. Does NOT re-derive or re-test the
// allocation math (calculateAttribution, attribution-engine.js:2886) — that
// function is unchanged and is fed the SAME array on both legs once the rows
// match, so allocation-output equality follows automatically from row-set
// equality. See tinybird/PHASE4_4A_FIELD_MAPPING.md for the verified field
// mapping and diff-tuple derivation this script implements.
//
// READ-ONLY. Queries PostHog via the existing queryHogQL() path and Tinybird via
// its published pipe HTTP endpoints (TOKEN "phase4_conversions_read" /
// "phase4_pageviews_read" — least-privilege READ tokens declared in the .pipe
// files, NOT the .tinyb admin/user token). Writes nothing to either store.
//
// KNOWN DUPLICATION RISK: convSql/pvSql below are literal copies of the live
// queries at attribution-engine.js:1399 and :1478 (those query builders are not
// exported as standalone functions). If attribution-engine.js's queries change,
// this harness silently goes stale. Recommend (separately, not in this change)
// extracting buildMultiTouchConversionsSql/buildMultiTouchPageviewsSql as pure
// exported functions so the live path and this harness share one source of
// truth instead of two copies that can drift.
//
// NOT YET RUN. tb push has not been executed for the new pipes (pending founder
// go-ahead — see Phase 4a report). This script is reviewable, not yet executed
// end-to-end.

import { queryHogQL } from '../../api/lib/posthog.js'
import { esc } from '../../api/lib/utils.js'
import { serializeHogQLDateRange, serializeHogQLDateTime } from '../../api/lib/hogql-date.js'

const TINYBIRD_HOST = process.env.TINYBIRD_HOST
const TINYBIRD_READ_TOKEN = process.env.TINYBIRD_READ_TOKEN // distinct from TINYBIRD_APPEND_TOKEN; least-privilege READ token minted for the two Phase 4a pipes

// Diff tuple per tinybird/PHASE4_4A_FIELD_MAPPING.md §3 — the COMPLETE set of
// tp.* fields calculateAttribution's tpCh/tpBase read, minus country/device/
// browser/landing_page (structurally absent from this pull on both legs today).
const DIFF_FIELDS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'ai_source',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid',
  'li_fat_id', 'li_fatid', 'twclid', 'dclid', 'snapclid', 'pclid', 'sccid', 'ko_click_id',
  'referrer', 'page_url'
]

// Literal copy of attribution-engine.js:1464-1467 — guardrail 4: pin EXACTLY,
// including the 'ltv' quirk (falls through to 30, does NOT mean unlimited here).
function resolveLookback(attributionWindow, fromDateHogQL) {
  const windowDays = attributionWindow && attributionWindow !== 'ltv' && Number(attributionWindow) > 0
    ? Number(attributionWindow)
    : 30
  const fromIso = fromDateHogQL.match(/'([^']+)'/)[1]
  const lookbackDate = new Date(new Date(fromIso).getTime() - windowDays * 24 * 60 * 60 * 1000)
  return { windowDays, lookbackStr: serializeHogQLDateTime(lookbackDate) }
}

// Literal copy of convSql shape (attribution-engine.js:1399-1425), trimmed to the
// touchpoint-diff-relevant columns (distinct_id + timestamp are needed for
// per-conversion windowing; the rest are conversion-level, not part of
// DIFF_FIELDS, included only to drive per-conversion windowing downstream).
async function fetchHogqlConversions(siteId, fromDate, toDate) {
  const sql = `
    SELECT uuid, distinct_id, timestamp
    FROM events
    WHERE properties.site_id = '${esc(siteId)}'
      AND event = '$conversion'
      AND timestamp >= ${fromDate}
      AND timestamp < ${toDate}
    ORDER BY timestamp DESC
    LIMIT 10000
  `
  const rows = await queryHogQL(sql, 'phase4_diff_conversions_hogql')
  return rows.map(([uuid, distinctId, timestamp]) => ({ uuid, distinct_id: distinctId, timestamp }))
}

// Literal copy of pvSql (attribution-engine.js:1478-1510), full column set.
async function fetchHogqlPageviews(siteId, lookbackStr, toDate) {
  const sql = `
    SELECT
      distinct_id, timestamp,
      properties.utm_source AS utm_source, properties.utm_medium AS utm_medium,
      properties.utm_campaign AS utm_campaign, properties.referrer AS referrer,
      properties.ai_source AS ai_source,
      properties.gclid AS gclid, properties.gbraid AS gbraid, properties.wbraid AS wbraid,
      properties.fbclid AS fbclid, properties.msclkid AS msclkid, properties.ttclid AS ttclid,
      properties.li_fat_id AS li_fat_id, properties.li_fatid AS li_fatid, properties.twclid AS twclid,
      properties.dclid AS dclid, properties.snapclid AS snapclid, properties.pclid AS pclid,
      properties.sccid AS sccid, properties.ko_click_id AS ko_click_id,
      properties.page_url AS page_url, properties.utm_term AS utm_term
    FROM events
    WHERE properties.site_id = '${esc(siteId)}'
      AND event = '$pageview'
      AND timestamp >= ${lookbackStr}
      AND timestamp < ${toDate}
    ORDER BY timestamp ASC
    LIMIT 100000
  `
  const rows = await queryHogQL(sql, 'phase4_diff_pageviews_hogql')
  return rows.map(r => ({
    distinct_id: r[0], timestamp: r[1],
    utm_source: r[2] || null, utm_medium: r[3] || null, utm_campaign: r[4] || null, referrer: r[5] || null,
    ai_source: r[6] || null, gclid: r[7] || null, gbraid: r[8] || null, wbraid: r[9] || null,
    fbclid: r[10] || null, msclkid: r[11] || null, ttclid: r[12] || null, li_fat_id: r[13] || null,
    li_fatid: r[14] || null, twclid: r[15] || null, dclid: r[16] || null, snapclid: r[17] || null,
    pclid: r[18] || null, sccid: r[19] || null, ko_click_id: r[20] || null, page_url: r[21] || null,
    utm_term: r[22] || null
  }))
}

async function fetchTinybirdRows(pipeName, token, params) {
  if (!TINYBIRD_HOST || !token) {
    throw new Error(`TINYBIRD_HOST and a pipe-scoped READ token are required to query ${pipeName} (not set — pipes are not yet pushed either, see Phase 4a report)`)
  }
  const url = new URL(`${TINYBIRD_HOST.replace(/\/$/, '')}/v0/pipes/${pipeName}.json`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Tinybird pipe ${pipeName} failed (${res.status}): ${await res.text()}`)
  const body = await res.json()
  return body.data
}

// Guardrail 1: compare at FULL DateTime64(3) ms precision — never truncate.
// TZ-safety: HogQL rows carry an explicit 'Z' (parsed as UTC — correct, LEFT UNCHANGED).
// Tinybird DateTime64 rows come back space-separated with NO zone marker
// ('2026-06-28 01:29:28.976'); bare `new Date()` parses that as the RUNNER's LOCAL time
// — a TZ-dependent error (e.g. −120min on a Europe/Madrid runner, which produced the
// observed constant 7,200,339ms = 2h + 339ms offset). Normalize a ZONELESS string to UTC
// (swap the space for 'T', append 'Z'). No-op for any string already carrying a zone
// (Z or ±HH:MM) — so the HogQL parse is untouched. Chose this over a Date.UTC(...) manual
// component split: it's a strict no-op for the correct HogQL format and robust to format
// drift (any zone-carrying string passes through; a manual split would be brittle to the
// 6-decimal micros / varying fractional digits the two stores use).
function tsMs(ts) {
  let s = ts
  if (typeof s === 'string') {
    s = s.trim()
    const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)
    if (!hasZone) s = s.replace(' ', 'T') + 'Z'
  }
  const ms = new Date(s).getTime()
  if (Number.isNaN(ms)) throw new Error(`Unparseable timestamp in diff input: ${ts}`)
  return ms
}

// After the UTC-parse fix, the residual PostHog↔Tinybird gap is a constant ~339ms
// (PostHog's ingestion-side timestamp adjustment — the carried "compare intervals, not
// absolutes" rule). Exact-ms equality would still reject those, so conversion- and
// touchpoint-matching use a ±TS_TOLERANCE_MS window. 500ms covers the observed 339ms with
// margin and stays far below the minutes-apart spacing of distinct real touchpoints.
const TS_TOLERANCE_MS = 500

function diffTuple(pv) {
  return JSON.stringify([pv.distinct_id, tsMs(pv.timestamp), ...DIFF_FIELDS.map(f => pv[f] ?? null)])
}

// Touchpoint identity WITHOUT the timestamp (matched separately within TS_TOLERANCE_MS).
function tpFieldsKey(pv) {
  return JSON.stringify([pv.distinct_id, ...DIFF_FIELDS.map(f => pv[f] ?? null)])
}

function windowPageviewsForConversion(conversionTs, pageviewsByVisitor, distinctId, windowDays) {
  const conversionTime = tsMs(conversionTs)
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  return (pageviewsByVisitor[distinctId] || []).filter(pv => {
    const t = tsMs(pv.timestamp)
    return t <= conversionTime && t >= conversionTime - windowMs
  })
}

function groupByVisitor(pvRows) {
  const out = {}
  for (const pv of pvRows) {
    if (!out[pv.distinct_id]) out[pv.distinct_id] = []
    out[pv.distinct_id].push(pv)
  }
  return out
}

/**
 * Compare touchpoint sets for site/window/model between live HogQL and the new
 * Tinybird pipe pair. Returns { pass, totalConversions, mismatches }.
 * mismatches[i] = { distinct_id, conversion_timestamp, hogqlOnly: [...], tinybirdOnly: [...] }
 */
export async function diffTouchpointSets({ siteId, dateFrom, dateTo, attributionWindow = null, conversionsReadToken, pageviewsReadToken, fixturePrefix = null }) {
  const { from: fromDate, to: toDate } = serializeHogQLDateRange(dateFrom, dateTo)
  const { windowDays, lookbackStr } = resolveLookback(attributionWindow, fromDate)
  // Tinybird's DateTime(...) params on both target pipes are backed by ClickHouse
  // DateTime64(3, 'UTC'), which expects the native space-separated format
  // 'YYYY-MM-DD HH:MM:SS.mmm' — NOT the ISO-8601-with-T/Z string that HogQL's
  // toDateTime('...') wrapper carries (that form fails with TYPE_MISMATCH). Mirrors
  // the proven fix in commit 7cd3140 (getAiPlatformAttributionLive → pageviews_by_visitors).
  // Format-only: the underlying date VALUE is unchanged; only these Tinybird-bound
  // strings are reformatted. The HogQL fetches below use the wrapped fromDate/toDate/
  // lookbackStr directly and are untouched.
  const toTinybirdDateTime = (isoWithTZ) => isoWithTZ.replace('T', ' ').replace(/Z$/, '')
  const fromIso = toTinybirdDateTime(fromDate.match(/'([^']+)'/)[1])
  const toIso = toTinybirdDateTime(toDate.match(/'([^']+)'/)[1])
  const lookbackIso = toTinybirdDateTime(lookbackStr.match(/'([^']+)'/)[1])

  let [hogqlConversions, hogqlPageviews, tbConversions, tbPageviews] = await Promise.all([
    fetchHogqlConversions(siteId, fromDate, toDate),
    fetchHogqlPageviews(siteId, lookbackStr, toDate),
    fetchTinybirdRows('conversions_by_site', conversionsReadToken, { site_id: siteId, date_from: fromIso, date_to: toIso }),
    fetchTinybirdRows('pageviews_windowed_by_site', pageviewsReadToken, { site_id: siteId, lookback_from: lookbackIso, date_to: toIso })
  ])

  // Optional fixture isolation (default OFF — stays general-purpose): restrict BOTH
  // conversion legs to a distinct_id prefix (e.g. 'cc-4a-') so the diff runs only over
  // the intended fixtures, not every site conversion. The conversions_by_site pipe has
  // no distinct_id param, so this is a client-side post-fetch filter on both legs (the
  // touchpoint loop below runs only over hogqlConversions, and windowPageviewsForConversion
  // pulls only each conversion-visitor's pageviews, so filtering conversions is sufficient).
  if (fixturePrefix) {
    hogqlConversions = hogqlConversions.filter(c => typeof c.distinct_id === 'string' && c.distinct_id.startsWith(fixturePrefix))
    tbConversions = tbConversions.filter(c => typeof c.distinct_id === 'string' && c.distinct_id.startsWith(fixturePrefix))
  }

  const hogqlPvByVisitor = groupByVisitor(hogqlPageviews)
  const tbPvByVisitor = groupByVisitor(tbPageviews)

  const mismatches = []
  for (const conv of hogqlConversions) {
    const hogqlTouches = windowPageviewsForConversion(conv.timestamp, hogqlPvByVisitor, conv.distinct_id, windowDays)
    const tbTouches = windowPageviewsForConversion(conv.timestamp, tbPvByVisitor, conv.distinct_id, windowDays)

    // Tolerant touchpoint match: identical field-key AND timestamp within TS_TOLERANCE_MS
    // (was exact-ms Set equality — which the constant ~339ms cross-store offset broke).
    // Reported as diffTuple strings (timestamp included) for human diffability.
    const touchMatches = (a, b) =>
      tpFieldsKey(a) === tpFieldsKey(b) && Math.abs(tsMs(a.timestamp) - tsMs(b.timestamp)) <= TS_TOLERANCE_MS
    const hogqlOnly = hogqlTouches.filter(h => !tbTouches.some(t => touchMatches(h, t))).map(diffTuple)
    const tinybirdOnly = tbTouches.filter(t => !hogqlTouches.some(h => touchMatches(h, t))).map(diffTuple)

    if (hogqlOnly.length || tinybirdOnly.length) {
      mismatches.push({ distinct_id: conv.distinct_id, conversion_timestamp: conv.timestamp, hogqlOnly, tinybirdOnly })
    }
  }

  // Also flag conversion-set mismatches (conversion present in one store, not the other) —
  // a touchpoint-set diff is meaningless for a conversion neither store agrees exists.
  // Match: same distinct_id AND timestamps within TS_TOLERANCE_MS (was exact-ms Set
  // equality). Sets are fixture-scale, so O(n*m) is fine. Assumes a visitor's own
  // conversions are >TS_TOLERANCE_MS apart (true for these fixtures) — otherwise two
  // same-visitor near-simultaneous conversions could match ambiguously; flag if that
  // ever appears in real data.
  const conversionMatches = (a, b) =>
    a.distinct_id === b.distinct_id && Math.abs(tsMs(a.timestamp) - tsMs(b.timestamp)) <= TS_TOLERANCE_MS
  const conversionsHogqlOnly = hogqlConversions.filter(h => !tbConversions.some(t => conversionMatches(h, t)))
  const conversionsTinybirdOnly = tbConversions.filter(t => !hogqlConversions.some(h => conversionMatches(h, t)))

  return {
    pass: mismatches.length === 0 && conversionsHogqlOnly.length === 0 && conversionsTinybirdOnly.length === 0,
    totalConversions: hogqlConversions.length,
    windowDays,
    conversionsHogqlOnly,
    conversionsTinybirdOnly,
    mismatches
  }
}
