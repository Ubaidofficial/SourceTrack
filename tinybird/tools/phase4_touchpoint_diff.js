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
// STATUS: the Pattern-B diff has a founder-run live PASS on the cc-4a fixtures
// (2026-07-03, post-9dd496c TZ fix: conversionsHogqlOnly=0 conversionsTinybirdOnly=0
// touchpointMismatches=0). Phase 9 extended this file with PICKED-VALUE diffs for
// the two remaining Phase-4 models: last_touch (per-field argMax picks vs the
// last_touch_by_site pipe) and ai_platforms (credited platform via the REAL
// exported selectAiTouchForConversion, fed by pageviews_by_visitors). The pure
// comparators are exported separately from the fetchers so
// tinybird/qa/phase4_replay_verify.mjs can replay committed store snapshots
// (tinybird/qa/phase4_snapshots/) with zero credentials.

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

export async function fetchTinybirdRows(pipeName, token, params) {
  if (!TINYBIRD_HOST || !token) {
    throw new Error(`TINYBIRD_HOST and a pipe-scoped READ token are required to query ${pipeName} (not set)`)
  }
  const url = new URL(`${TINYBIRD_HOST.replace(/\/$/, '')}/v0/pipes/${pipeName}.json`)
  // Array params (pageviews_by_visitors' visitor_ids) MUST be ONE comma-separated
  // value. Verified empirically against the deployed pipe (2026-07-03): repeated
  // same-name keys silently return rows for only the FIRST id — no error, just
  // partial data. NOTE: this contradicts api/lib/tinybird-read.js's repeated-key
  // serialization (its own header flags that format as never verified); tracked
  // as a separate live-app fix, deliberately not changed here.
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : v)
  }
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
export function toUtcSafeTs(ts) {
  if (typeof ts !== 'string') return ts
  const s = ts.trim()
  return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z'
}

function tsMs(ts) {
  const ms = new Date(toUtcSafeTs(ts)).getTime()
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

  const [hogqlConversions, hogqlPageviews, tbConversions, tbPageviews] = await Promise.all([
    fetchHogqlConversions(siteId, fromDate, toDate),
    fetchHogqlPageviews(siteId, lookbackStr, toDate),
    fetchTinybirdRows('conversions_by_site', conversionsReadToken, { site_id: siteId, date_from: fromIso, date_to: toIso }),
    fetchTinybirdRows('pageviews_windowed_by_site', pageviewsReadToken, { site_id: siteId, lookback_from: lookbackIso, date_to: toIso })
  ])

  return comparePatternBSets({ hogqlConversions, hogqlPageviews, tbConversions, tbPageviews, windowDays, fixturePrefix })
}

/**
 * PURE comparator half of diffTouchpointSets — no fetching, no credentials.
 * Exported separately so tinybird/qa/phase4_replay_verify.mjs can replay the
 * committed store snapshots offline. Logic is the former diffTouchpointSets
 * body, moved verbatim.
 */
export function comparePatternBSets({ hogqlConversions, hogqlPageviews, tbConversions, tbPageviews, windowDays, fixturePrefix = null }) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — PICKED-VALUE diffs for the two remaining Phase-4 models.
// Method per PHASE4_4C_PLAN.md §5 and PHASE4_4D_PLAN.md §3; build shape per
// tinybird/PHASE4_4C4D_DIFF_HARNESS_BUILD_PLAN.md. Fetchers and comparators are
// separate: comparators are pure and snapshot-replayable.
// ─────────────────────────────────────────────────────────────────────────────

// SCOPE_v3 §14 bag/NULLIF rule: schemaless HogQL yields null for absent keys,
// typed pipes can carry '' — coalesce both sides through the same NULLIF before
// any equality compare.
export function nullIfEmpty(v) {
  return v === '' || v === undefined ? null : v
}

export const LAST_TOUCH_PICK_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'ai_source']

// Literal copy of lastTouchAttribution's INNER subquery (attribution-engine.js
// :106-146 — the per-conversion argMax picks, NOT the outer GROUP BY aggregate:
// 4C §5's golden diff is per-conversion, pre-aggregation), extended with
// any(distinct_id)/any(timestamp) for the cross-store join. Same duplication
// risk as convSql/pvSql above (header note applies). NOTE: deliberately NO
// pageview-side time window — the live query has none (only pv.timestamp <=
// conversion.timestamp) and the deployed pipe mirrors that; do not add one.
export async function fetchHogqlLastTouchPicks(siteId, fromDate, toDate) {
  const sql = `
    SELECT
      e_inner.uuid AS conversion_uuid,
      any(e_inner.distinct_id) AS distinct_id,
      any(e_inner.timestamp) AS conversion_timestamp,
      argMax(pv.utm_source,   pv.timestamp) AS utm_source,
      argMax(pv.utm_medium,   pv.timestamp) AS utm_medium,
      argMax(pv.utm_campaign, pv.timestamp) AS utm_campaign,
      argMax(pv.ai_source,   pv.timestamp) AS ai_source
    FROM events e_inner
    LEFT JOIN (
      SELECT
        distinct_id,
        timestamp,
        properties.utm_source AS utm_source,
        properties.utm_medium AS utm_medium,
        properties.utm_campaign AS utm_campaign,
        properties.ai_source AS ai_source
      FROM events
      WHERE properties.site_id = '${esc(siteId)}'
        AND event = '$pageview'
    ) pv
      ON pv.distinct_id = e_inner.distinct_id
      AND pv.timestamp <= e_inner.timestamp
    WHERE e_inner.properties.site_id = '${esc(siteId)}'
      AND e_inner.event = '$conversion'
      AND e_inner.timestamp >= ${fromDate}
      AND e_inner.timestamp < ${toDate}
    GROUP BY conversion_uuid
    ORDER BY conversion_timestamp ASC
    LIMIT 50000
  `
  const rows = await queryHogQL(sql, 'phase4_diff_last_touch_picks_hogql')
  return rows.map(([conversionUuid, distinctId, conversionTimestamp, utmSource, utmMedium, utmCampaign, aiSource]) => ({
    conversion_id: conversionUuid,
    distinct_id: distinctId,
    conversion_timestamp: conversionTimestamp,
    utm_source: utmSource ?? null,
    utm_medium: utmMedium ?? null,
    utm_campaign: utmCampaign ?? null,
    ai_source: aiSource ?? null
  }))
}

// Maps a raw last_touch_by_site pipe row to the pick shape. The deployed pipe
// returns unaliased join columns with DOTTED names ('conv.distinct_id',
// 'src.utm_source', …) — verified against the live endpoint 2026-07-03.
export function mapTinybirdLastTouchRow(row) {
  return {
    conversion_id: row.conversion_event_id,
    distinct_id: row['conv.distinct_id'] ?? row.distinct_id,
    conversion_timestamp: row.conversion_timestamp,
    utm_source: row['src.utm_source'] ?? row.utm_source ?? null,
    utm_medium: row['med.utm_medium'] ?? row.utm_medium ?? null,
    utm_campaign: row['camp.utm_campaign'] ?? row.utm_campaign ?? null,
    ai_source: row['ai.ai_source'] ?? row.ai_source ?? null
  }
}

/**
 * last_touch golden diff (4C §5): per conversion, compare the PER-FIELD picked
 * values — utm_source/utm_medium/utm_campaign/ai_source may each legitimately
 * come from a DIFFERENT touchpoint (HogQL argMax skips NULLs per column; the
 * deployed pipe's 4 independent IS-NOT-NULL ASOF joins replicate exactly that —
 * so this is a picked-VALUE diff, deliberately NOT a touchpoint-set diff).
 * Cross-store join on (distinct_id, conversion_timestamp ±TS_TOLERANCE_MS) —
 * never on IDs (PostHog uuid vs Tinybird deriveEventId are different spaces).
 * Tie rows (4C §4: two touches at the EXACT same ms) are reported separately:
 * a tie disagreement is a documented ambiguity, NOT a parity failure (4C §5).
 */
export function compareLastTouchPicks(hogqlPicks, tbPicks, { tieDistinctIds = [] } = {}) {
  const matchConv = (a, b) =>
    a.distinct_id === b.distinct_id && Math.abs(tsMs(a.conversion_timestamp) - tsMs(b.conversion_timestamp)) <= TS_TOLERANCE_MS

  const rows = []
  const mismatches = []
  const tieReport = []
  const conversionsHogqlOnly = []
  const tbUnmatched = [...tbPicks]

  for (const h of hogqlPicks) {
    const idx = tbUnmatched.findIndex(t => matchConv(h, t))
    if (idx === -1) { conversionsHogqlOnly.push(h); continue }
    const t = tbUnmatched.splice(idx, 1)[0]

    const fields = {}
    let rowMismatch = false
    for (const f of LAST_TOUCH_PICK_FIELDS) {
      const hv = nullIfEmpty(h[f] ?? null)
      const tv = nullIfEmpty(t[f] ?? null)
      const match = hv === tv
      if (!match) rowMismatch = true
      fields[f] = { hogql: hv, tinybird: tv, match }
    }

    const isTie = tieDistinctIds.includes(h.distinct_id)
    rows.push({ distinct_id: h.distinct_id, isTie, fields })
    if (rowMismatch) {
      if (isTie) tieReport.push({ distinct_id: h.distinct_id, agreement: false, fields })
      else mismatches.push({ distinct_id: h.distinct_id, fields })
    } else if (isTie) {
      tieReport.push({ distinct_id: h.distinct_id, agreement: true, fields })
    }
  }

  return {
    pass: mismatches.length === 0 && conversionsHogqlOnly.length === 0 && tbUnmatched.length === 0,
    totalConversions: rows.length,
    rows,
    mismatches,
    tieReport,
    conversionsHogqlOnly,
    conversionsTinybirdOnly: tbUnmatched
  }
}

// Literal copy of getAiPlatformAttributionLive's IN-list pvSql shape
// (attribution-engine.js — the HogQL fallback's batchPvSql), minus the
// _cursor_key pagination plumbing (fixture-scale pulls fit one page; the LIMIT
// asserts that instead of silently truncating). Same duplication-risk note.
export async function fetchHogqlAiPageviews(siteId, distinctIds, lookbackStr, toDate) {
  const escapedIds = distinctIds.map(id => `'${esc(id)}'`)
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
      AND distinct_id IN (${escapedIds.join(',')})
    ORDER BY timestamp ASC
    LIMIT 5000
  `
  const rows = await queryHogQL(sql, 'phase4_diff_ai_pageviews_hogql')
  if (rows.length >= 5000) throw new Error('fetchHogqlAiPageviews hit the 5000-row page limit — result may be truncated; this fetcher is fixture-scale only')
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

/**
 * ai_platforms golden diff (4D §3): per conversion, compare the CREDITED
 * platform (a name, or null for no-credit) produced by running BOTH legs' row
 * sets through the REAL exported selectAiTouchForConversion — passed in as
 * `selectAiTouch` so this module never imports the heavy engine graph (the
 * runner/verifier dynamic-import it with the posthog.js capture-client stub).
 * Secondary check per 4D §3: the per-visitor in-window touchpoint SET each leg
 * feeds the selector must also be identical (same Pattern-B machinery).
 * Presence guard: a conversion missing from either leg FAILS — a dropped
 * no-credit visitor (cc-4d-visitorS) must not false-green.
 * Timestamps are normalized zoneless→UTC BEFORE entering selectAiTouch (it uses
 * bare new Date() internally — the 89dc70e mixed-store TZ bug class).
 */
export function compareAiPlatformCredits({ hogqlConversions, hogqlPageviews, tbConversions, tbPageviews, windowDays = 30, selectAiTouch }) {
  if (typeof selectAiTouch !== 'function') throw new Error('compareAiPlatformCredits requires selectAiTouch (import selectAiTouchForConversion from api/lib/attribution-engine.js)')

  const utc = (rows) => rows.map(r => ({ ...r, timestamp: toUtcSafeTs(r.timestamp) }))
  const hConvs = utc(hogqlConversions)
  const tConvs = utc(tbConversions)
  const hPvByVisitor = groupByVisitor(utc(hogqlPageviews))
  const tPvByVisitor = groupByVisitor(utc(tbPageviews))

  const conversionMatches = (a, b) =>
    a.distinct_id === b.distinct_id && Math.abs(tsMs(a.timestamp) - tsMs(b.timestamp)) <= TS_TOLERANCE_MS

  const credits = []
  const creditMismatches = []
  const rowSetMismatches = []
  const conversionsHogqlOnly = []
  const tbUnmatched = [...tConvs]

  for (const hConv of hConvs) {
    const idx = tbUnmatched.findIndex(t => conversionMatches(hConv, t))
    if (idx === -1) { conversionsHogqlOnly.push(hConv); continue }
    const tConv = tbUnmatched.splice(idx, 1)[0]

    // Row-level secondary check on the in-window sets each leg hands the selector
    const hTouches = windowPageviewsForConversion(hConv.timestamp, hPvByVisitor, hConv.distinct_id, windowDays)
    const tTouches = windowPageviewsForConversion(tConv.timestamp, tPvByVisitor, tConv.distinct_id, windowDays)
    const touchMatches = (a, b) =>
      tpFieldsKey(a) === tpFieldsKey(b) && Math.abs(tsMs(a.timestamp) - tsMs(b.timestamp)) <= TS_TOLERANCE_MS
    const hogqlOnly = hTouches.filter(h => !tTouches.some(t => touchMatches(h, t))).map(diffTuple)
    const tinybirdOnly = tTouches.filter(t => !hTouches.some(h => touchMatches(h, t))).map(diffTuple)
    if (hogqlOnly.length || tinybirdOnly.length) {
      rowSetMismatches.push({ distinct_id: hConv.distinct_id, hogqlOnly, tinybirdOnly })
    }

    const hCredit = selectAiTouch(hTouches, hConv, windowDays)?.platform ?? null
    const tCredit = selectAiTouch(tTouches, tConv, windowDays)?.platform ?? null
    credits.push({ distinct_id: hConv.distinct_id, hogql: hCredit, tinybird: tCredit, match: hCredit === tCredit })
    if (hCredit !== tCredit) creditMismatches.push({ distinct_id: hConv.distinct_id, hogql: hCredit, tinybird: tCredit })
  }

  return {
    pass: creditMismatches.length === 0 && rowSetMismatches.length === 0 && conversionsHogqlOnly.length === 0 && tbUnmatched.length === 0,
    totalConversions: credits.length,
    credits,
    creditMismatches,
    rowSetMismatches,
    conversionsHogqlOnly,
    conversionsTinybirdOnly: tbUnmatched
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — models 7/8/9 AGGREGATE-layer parity (first_touch / first_touch_non_
// direct / last_touch_non_direct). The landed pipes for these three are
// AGGREGATE endpoints (GROUP BY source/medium/campaign -> conversions, revenue),
// not per-visitor row pulls — so the parity check is at the aggregate layer:
// the pipe's SQL aggregate (Tinybird leg) vs an independent JS reference model
// computed from raw HogQL rows (PostHog leg). This also fills the spec's
// "aggregate-layer diff (unbuilt)" gap. Pure + offline-unit-tested; the credit
// functions mirror each pipe's SQL semantics EXACTLY (COALESCE/NULLIF included).

const tsOf = (x) => new Date(toUtcSafeTs(x?.timestamp ?? x)).getTime()
const coalesceSource = (s) => (s !== undefined && s !== null && s !== '') ? s : 'direct' // COALESCE(NULLIF(x,''),'direct')
const coalesceMedium = (m) => (m !== undefined && m !== null && m !== '') ? m : 'none'   // COALESCE(NULLIF(x,''),'none')

// Non-direct pageviews for a conversion's visitor, at/ before the conversion,
// ascending by ts — the shared population all non-direct joins draw from
// (pipe subqueries: utm_source IS NOT NULL AND != '' AND != 'direct').
function nonDirectPvsUpTo(conv, pageviews) {
  const cutoff = tsOf(conv)
  return (pageviews || [])
    .filter(p => p.utm_source && p.utm_source !== '' && p.utm_source !== 'direct' && tsOf(p) <= cutoff)
    .sort((a, b) => tsOf(a) - tsOf(b))
}

// Model 7 — first_touch: from the conversion's OWN first_touch_* columns
// (first_touch_by_site.pipe: COALESCE(NULLIF(first_touch_source,''),'direct'),
//  COALESCE(NULLIF(first_touch_medium,''),'none'), COALESCE(first_touch_campaign,'')).
export function creditFirstTouch(conv) {
  return {
    source: coalesceSource(conv.first_touch_source),
    medium: coalesceMedium(conv.first_touch_medium),
    campaign: conv.first_touch_campaign ?? '' // COALESCE(campaign,'') — null -> ''
  }
}

// Model 8 — first_touch_non_direct: EARLIEST non-direct pageview (argMinIf ts <= conv).
// Outer select COALESCEs source/medium; campaign is the raw utm_campaign (null if no match).
export function creditFirstTouchNonDirect(conv, pageviews) {
  const nd = nonDirectPvsUpTo(conv, pageviews)
  const first = nd[0] || null
  return {
    source: coalesceSource(first?.utm_source),
    medium: coalesceMedium(first?.utm_medium),
    campaign: first ? (first.utm_campaign ?? null) : null
  }
}

// Model 9 — last_touch_non_direct: per-field LATEST non-direct pageview (ASOF ts <= conv).
// Each field is independently the latest non-direct pv HAVING that field
// (src: any non-direct; med: + utm_medium not null; camp: + utm_campaign not null).
export function creditLastTouchNonDirect(conv, pageviews) {
  const nd = nonDirectPvsUpTo(conv, pageviews)
  const latest = (pred) => { for (let i = nd.length - 1; i >= 0; i--) if (pred(nd[i])) return nd[i]; return null }
  const src = latest(() => true)
  const med = latest(p => p.utm_medium !== undefined && p.utm_medium !== null)
  const camp = latest(p => p.utm_campaign !== undefined && p.utm_campaign !== null)
  return {
    source: coalesceSource(src?.utm_source),
    medium: coalesceMedium(med?.utm_medium),
    campaign: camp ? (camp.utm_campaign ?? null) : null
  }
}

const bucketKey = (b) => JSON.stringify([b.source, b.medium, b.campaign ?? null])

// Aggregate the reference model over raw HogQL rows into the pipe's output shape:
// GROUP BY (source, medium, campaign) -> { conversions, revenue }.
export function aggregateModelCredits(conversions, pageviews, creditFn) {
  const pvByVisitor = new Map()
  for (const pv of (pageviews || [])) {
    if (!pvByVisitor.has(pv.distinct_id)) pvByVisitor.set(pv.distinct_id, [])
    pvByVisitor.get(pv.distinct_id).push(pv)
  }
  const buckets = new Map()
  for (const conv of conversions) {
    const c = creditFn(conv, pvByVisitor.get(conv.distinct_id) || [])
    const k = bucketKey(c)
    const b = buckets.get(k) || { source: c.source, medium: c.medium, campaign: c.campaign ?? null, conversions: 0, revenue: 0 }
    b.conversions += 1
    b.revenue += Number(conv.conversion_value) || 0
    buckets.set(k, b)
  }
  return [...buckets.values()]
}

// Aggregate-set parity: bucket-key set equality + per-bucket conversions/revenue
// equality (revenue within a small float tolerance). Symmetric report.
export function compareAggregateBuckets(hogqlBuckets, tinybirdBuckets, { revenueTolerance = 0.01 } = {}) {
  const norm = (rows) => {
    const m = new Map()
    for (const r of (rows || [])) {
      m.set(bucketKey(r), {
        source: r.source, medium: r.medium, campaign: r.campaign ?? null,
        conversions: Number(r.conversions) || 0, revenue: Number(r.revenue) || 0
      })
    }
    return m
  }
  const A = norm(hogqlBuckets)
  const B = norm(tinybirdBuckets)
  const bucketsHogqlOnly = [...A.keys()].filter(k => !B.has(k)).map(k => A.get(k))
  const bucketsTinybirdOnly = [...B.keys()].filter(k => !A.has(k)).map(k => B.get(k))
  const valueMismatches = []
  for (const [k, a] of A) {
    const b = B.get(k)
    if (!b) continue
    if (a.conversions !== b.conversions || Math.abs(a.revenue - b.revenue) > revenueTolerance) {
      valueMismatches.push({ key: k, hogql: a, tinybird: b })
    }
  }
  const totalConversions = [...A.values()].reduce((s, x) => s + x.conversions, 0)
  return {
    totalConversions,
    buckets: A.size,
    bucketsHogqlOnly,
    bucketsTinybirdOnly,
    valueMismatches,
    pass: bucketsHogqlOnly.length === 0 && bucketsTinybirdOnly.length === 0 && valueMismatches.length === 0
  }
}
