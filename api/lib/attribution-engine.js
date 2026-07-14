import NodeCache from 'node-cache'
import { queryHogQL } from './posthog.js'
import { deriveSessions, annotateSessions } from './sessionization.js'
import { channelFromEvent, detectAiPlatformFromEvent } from './channel-classifier.js'
import { getSupabase } from './supabase.js'
import { esc, isGoogleSource, isValidTimezone, getLocalDateString, getPaddedUtcDateRange } from './utils.js'
import { serializeHogQLDateRange, serializeHogQLDateTime, buildHogQLTimestampFilter } from './hogql-date.js'
import { LEAD_TYPES, classifyConversionType } from './conversion-classifier.js'
import { isSubscriptionCheckoutCarrier } from './stripe-subscription.js'
import { queryTinybirdPipe } from './tinybird-read.js'

// Read-backend injection seam (test-only; production uses the real modules).
// Tinybird reads are inert unless TINYBIRD_READ_ENABLED (+ optional
// TINYBIRD_READ_PIPES allowlist) is on — queryTinybirdPipe returns null when
// gated, and the 4 touch models fall back to _queryHogQL exactly as before.
let _queryTinybirdPipe = queryTinybirdPipe
let _queryHogQL = queryHogQL
export function __setAttributionReadDeps ({ queryTinybird, queryHog } = {}) {
  if (queryTinybird) _queryTinybirdPipe = queryTinybird
  if (queryHog) _queryHogQL = queryHog
}
export function __resetAttributionReadDeps () {
  _queryTinybirdPipe = queryTinybirdPipe
  _queryHogQL = queryHogQL
}

// Fail-closed dispatch guard — mirrors readTb() in api/routes/{alerts,sessions,live,
// hygiene,events}.js + api/lib/setup-doctor.js EXACTLY. Under the TEST-ONLY
// TINYBIRD_FORCE_READ, a pipe that was ATTEMPTED but returned null THROWS (proving the
// dispatch path was actually exercised) instead of a silent HogQL bypass. Flag UNSET →
// returns the pipe result unchanged (non-null → served; null → each site's existing
// inline HogQL fallback), so production behavior is byte-identical to today. `pipeName`
// is falsy ONLY when no pipe was attempted for this shape (the flexible_report NONE case;
// a filter-ineligible session read) — a legitimate no-dispatch, never a failure.
async function _pipeRead (pipeName, params) {
  const tb = pipeName ? await _queryTinybirdPipe(pipeName, params) : null
  if (pipeName && tb === null && process.env.TINYBIRD_FORCE_READ === 'true') {
    throw new Error(`[tinybird-force-read] ${pipeName} returned null under TINYBIRD_FORCE_READ — dispatch path not exercised`)
  }
  return tb
}

export function getDateFilterExpr(timestampCol, tz, dateFrom, dateTo) {
  const startStr = typeof dateFrom === 'string' ? dateFrom.trim() : new Date(dateFrom).toISOString().slice(0, 10)
  const endStr = typeof dateTo === 'string' ? dateTo.trim() : new Date(dateTo).toISOString().slice(0, 10)

  // Shift end date by +1 day for exclusive end in UTC
  const dEnd = new Date(endStr)
  dEnd.setUTCDate(dEnd.getUTCDate() + 1)
  const nextDayStr = dEnd.toISOString().slice(0, 10)

  if (!tz || tz === 'UTC') {
    return `${timestampCol} >= toDateTime('${startStr}T00:00:00.000Z') AND ${timestampCol} < toDateTime('${nextDayStr}T00:00:00.000Z')`
  }

  // Timezone-aware filtering:
  // 1. Pad the index scan range by 1 day in UTC to cover timezone differences
  const dFrom = new Date(startStr)
  dFrom.setUTCDate(dFrom.getUTCDate() - 1)
  const padFromStr = dFrom.toISOString().slice(0, 10)

  const dTo = new Date(endStr)
  dTo.setUTCDate(dTo.getUTCDate() + 2) // endStr + 2 days for safe padding
  const padToStr = dTo.toISOString().slice(0, 10)

  return `${timestampCol} >= toDateTime('${padFromStr}T00:00:00.000Z') AND ${timestampCol} < toDateTime('${padToStr}T00:00:00.000Z') AND toTimeZone(${timestampCol}, '${esc(tz)}') >= toDateTime('${startStr} 00:00:00', '${esc(tz)}') AND toTimeZone(${timestampCol}, '${esc(tz)}') < toDateTime('${nextDayStr} 00:00:00', '${esc(tz)}')`
}

const cache = new NodeCache({ stdTTL: 60, checkperiod: 30 })

export function extractReferrerDomain(referrer) {
  if (!referrer || referrer.trim() === '') return 'direct'
  let str = referrer.trim()
  if (!str.includes('://')) {
    str = 'https://' + str
  }
  try {
    const url = new URL(str)
    let host = url.hostname.toLowerCase()
    if (host.startsWith('www.')) {
      host = host.slice(4)
    }
    return host || 'unknown'
  } catch (_) {
    return 'unknown'
  }
}

export function makeReferrerDomainExpr(refVar) {
  return `multiIf(${refVar} IS NULL OR ${refVar} = '', 'direct', domain(${refVar}) = '', 'unknown', replaceRegexpAll(domain(${refVar}), '^www\\\\.', ''))`
}

const REFERRER_DOMAIN_SQL = makeReferrerDomainExpr('properties.referrer')

const PROVIDER_SQL = `COALESCE(NULLIF(properties.provider, ''), multiIf(properties.ingestion_method = 'server_routed', 'browser', properties.ingestion_method = 'offline', 'payments_api', 'unknown'))`

const ATTRIBUTION_STATUS_SQL = `COALESCE(NULLIF(properties.attribution_status, ''), multiIf(properties.ingestion_method = 'server_routed', 'attributed', properties.stitching_method IS NOT NULL AND properties.stitching_method != '' AND properties.stitching_method != 'none', 'attributed', properties.stitching_method = 'none', 'unattributed', 'unknown'))`

const STITCHING_METHOD_SQL = `COALESCE(NULLIF(properties.stitching_method, ''), multiIf(properties.ingestion_method = 'server_routed', 'browser', 'unknown'))`


function cacheKey(model, siteId, dateFrom, dateTo) {
  return `${model}:${siteId}:${dateFrom}:${dateTo}`
}

export async function firstTouchAttribution(siteId, dateFrom, dateTo) {
  const { from: fromDate, to: toDate } = serializeHogQLDateRange(dateFrom, dateTo)

  const sql = `
    SELECT
      COALESCE(NULLIF(properties.first_touch_source, ''), 'direct') AS source,
      COALESCE(NULLIF(properties.first_touch_medium, ''), 'none') AS medium,
      properties.first_touch_campaign AS campaign,
      count() AS conversions,
      SUM(toFloatOrZero(toString(properties.conversion_value))) AS revenue
    FROM events
    WHERE properties.site_id = '${esc(siteId)}'
      AND event = '$conversion'
      AND timestamp >= ${fromDate}
      AND timestamp < ${toDate}
    GROUP BY source, medium, campaign
    ORDER BY revenue DESC
    LIMIT 50000
  `

  // Tinybird cutover (allowlist-gated; null → HogQL fallback). Reuse the SAME
  // window bounds HogQL uses to guarantee date-parity; format for ClickHouse DateTime params.
  const _tbFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbTo   = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbRows = await _pipeRead('first_touch_by_site', { site_id: String(siteId), date_from: _tbFrom, date_to: _tbTo })
  if (_tbRows) {
    return _tbRows.map(r => ({
      source: r.source,
      medium: r.medium,
      campaign: r.campaign || null,
      conversions: Number(r.conversions) || 0,
      revenue: Number(r.revenue) || 0
    }))
  }

  const rows = await _queryHogQL(sql, 'first_touch_attribution')
  return rows.map(([source, medium, campaign, conversions, revenue]) => ({
    source,
    medium,
    campaign: campaign || null,
    conversions: Number(conversions) || 0,
    revenue: Number(revenue) || 0
  }))
}

export async function lastTouchAttribution(siteId, dateFrom, dateTo) {
  const { from: fromDate, to: toDate } = serializeHogQLDateRange(dateFrom, dateTo)

  const sql = `
    SELECT
      COALESCE(
        NULLIF(lt.utm_source, ''),
        NULLIF(lt.ai_source, ''),
        'direct'
      ) AS source,
      COALESCE(NULLIF(lt.utm_medium, ''), 'none')   AS medium,
      COALESCE(lt.utm_campaign, '')                  AS campaign,
      count()                                         AS conversions,
      SUM(toFloatOrZero(toString(e.properties.conversion_value))) AS revenue
    FROM events e
    LEFT JOIN (
      SELECT
        e_inner.uuid AS conversion_uuid,
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
    ) lt ON e.uuid = lt.conversion_uuid
    WHERE e.properties.site_id = '${esc(siteId)}'
      AND e.event = '$conversion'
      AND e.timestamp >= ${fromDate}
      AND e.timestamp < ${toDate}
    GROUP BY source, medium, campaign
    ORDER BY revenue DESC
    LIMIT 50000
  `

  // Tinybird cutover (allowlist-gated; null → HogQL fallback). Reuse the SAME
  // window bounds HogQL uses to guarantee date-parity; format for ClickHouse DateTime params.
  const _tbFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbTo   = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbRows = await _pipeRead('last_touch_by_site_agg', { site_id: String(siteId), date_from: _tbFrom, date_to: _tbTo })
  if (_tbRows) {
    return _tbRows.map(r => ({
      source: r.source,
      medium: r.medium,
      campaign: r.campaign || null,
      conversions: Number(r.conversions) || 0,
      revenue: Number(r.revenue) || 0
    }))
  }

  const rows = await _queryHogQL(sql, 'last_touch_attribution')
  return rows.map(([source, medium, campaign, conversions, revenue]) => ({
    source,
    medium,
    campaign: campaign || null,
    conversions: Number(conversions) || 0,
    revenue: Number(revenue) || 0
  }))
}

// Direct classification helper — used by non-direct attribution models.
// A touchpoint is direct when UTM source (trimmed+lowercased per ingestion normalization)
// is empty, null, or equal to 'direct'.
// This is intentionally conservative; only non-empty non-'direct' UTM sources qualify.
function isDirectCondition(tableAlias = 'events') {
  return `(${tableAlias}.properties.utm_source IS NULL OR ${tableAlias}.properties.utm_source = '' OR ${tableAlias}.properties.utm_source = 'direct')`
}

export async function firstTouchNonDirectAttribution(siteId, dateFrom, dateTo) {
  const { from: fromDate, to: toDate } = serializeHogQLDateRange(dateFrom, dateTo)

  const sql = `
    SELECT
      COALESCE(NULLIF(ft.utm_source, ''), 'direct') AS source,
      COALESCE(NULLIF(ft.utm_medium, ''), 'none') AS medium,
      ft.utm_campaign AS campaign,
      count() AS conversions,
      SUM(toFloatOrZero(toString(e.properties.conversion_value))) AS revenue
    FROM events e
    LEFT JOIN (
      SELECT
        e_inner.uuid AS conversion_uuid,
        argMin(pv.utm_source, pv.timestamp) AS utm_source,
        argMin(pv.utm_medium, pv.timestamp) AS utm_medium,
        argMin(pv.utm_campaign, pv.timestamp) AS utm_campaign
      FROM events e_inner
      LEFT JOIN (
        SELECT
          distinct_id,
          timestamp,
          properties.utm_source AS utm_source,
          properties.utm_medium AS utm_medium,
          properties.utm_campaign AS utm_campaign
        FROM events
        WHERE properties.site_id = '${esc(siteId)}'
          AND event = '$pageview'
          AND properties.utm_source IS NOT NULL
          AND properties.utm_source != ''
          AND properties.utm_source != 'direct'
      ) pv
        ON pv.distinct_id = e_inner.distinct_id
        AND pv.timestamp <= e_inner.timestamp
      WHERE e_inner.properties.site_id = '${esc(siteId)}'
        AND e_inner.event = '$conversion'
        AND e_inner.timestamp >= ${fromDate}
        AND e_inner.timestamp < ${toDate}
      GROUP BY conversion_uuid
    ) ft ON e.uuid = ft.conversion_uuid
    WHERE e.properties.site_id = '${esc(siteId)}'
      AND e.event = '$conversion'
      AND e.timestamp >= ${fromDate}
      AND e.timestamp < ${toDate}
    GROUP BY source, medium, campaign
    ORDER BY revenue DESC
    LIMIT 50000
  `

  // Tinybird cutover (allowlist-gated; null → HogQL fallback). Reuse the SAME
  // window bounds HogQL uses to guarantee date-parity; format for ClickHouse DateTime params.
  const _tbFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbTo   = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbRows = await _pipeRead('first_touch_non_direct_by_site', { site_id: String(siteId), date_from: _tbFrom, date_to: _tbTo })
  if (_tbRows) {
    return _tbRows.map(r => ({
      source: r.source,
      medium: r.medium,
      campaign: r.campaign || null,
      conversions: Number(r.conversions) || 0,
      revenue: Number(r.revenue) || 0
    }))
  }

  const rows = await _queryHogQL(sql, 'first_touch_non_direct_attribution')
  return rows.map(([source, medium, campaign, conversions, revenue]) => ({
    source,
    medium,
    campaign: campaign || null,
    conversions: Number(conversions) || 0,
    revenue: Number(revenue) || 0
  }))
}

export async function lastTouchNonDirectAttribution(siteId, dateFrom, dateTo) {
  const { from: fromDate, to: toDate } = serializeHogQLDateRange(dateFrom, dateTo)

  const sql = `
    SELECT
      COALESCE(NULLIF(lt.utm_source, ''), 'direct') AS source,
      COALESCE(NULLIF(lt.utm_medium, ''), 'none') AS medium,
      lt.utm_campaign AS campaign,
      count() AS conversions,
      SUM(toFloatOrZero(toString(e.properties.conversion_value))) AS revenue
    FROM events e
    LEFT JOIN (
      SELECT
        e_inner.uuid AS conversion_uuid,
        argMax(pv.utm_source, pv.timestamp) AS utm_source,
        argMax(pv.utm_medium, pv.timestamp) AS utm_medium,
        argMax(pv.utm_campaign, pv.timestamp) AS utm_campaign
      FROM events e_inner
      LEFT JOIN (
        SELECT
          distinct_id,
          timestamp,
          properties.utm_source AS utm_source,
          properties.utm_medium AS utm_medium,
          properties.utm_campaign AS utm_campaign
        FROM events
        WHERE properties.site_id = '${esc(siteId)}'
          AND event = '$pageview'
          AND properties.utm_source IS NOT NULL
          AND properties.utm_source != ''
          AND properties.utm_source != 'direct'
      ) pv
        ON pv.distinct_id = e_inner.distinct_id
        AND pv.timestamp <= e_inner.timestamp
      WHERE e_inner.properties.site_id = '${esc(siteId)}'
        AND e_inner.event = '$conversion'
        AND e_inner.timestamp >= ${fromDate}
        AND e_inner.timestamp < ${toDate}
      GROUP BY conversion_uuid
    ) lt ON e.uuid = lt.conversion_uuid
    WHERE e.properties.site_id = '${esc(siteId)}'
      AND e.event = '$conversion'
      AND e.timestamp >= ${fromDate}
      AND e.timestamp < ${toDate}
    GROUP BY source, medium, campaign
    ORDER BY revenue DESC
    LIMIT 50000
  `

  // Tinybird cutover (allowlist-gated; null → HogQL fallback). Reuse the SAME
  // window bounds HogQL uses to guarantee date-parity; format for ClickHouse DateTime params.
  const _tbFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbTo   = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbRows = await _pipeRead('last_touch_non_direct_by_site', { site_id: String(siteId), date_from: _tbFrom, date_to: _tbTo })
  if (_tbRows) {
    return _tbRows.map(r => ({
      source: r.source,
      medium: r.medium,
      campaign: r.campaign || null,
      conversions: Number(r.conversions) || 0,
      revenue: Number(r.revenue) || 0
    }))
  }

  const rows = await _queryHogQL(sql, 'last_touch_non_direct_attribution')
  return rows.map(([source, medium, campaign, conversions, revenue]) => ({
    source,
    medium,
    campaign: campaign || null,
    conversions: Number(conversions) || 0,
    revenue: Number(revenue) || 0
  }))
}

// Safe JS-based multi-touch attribution helper redirecting to the new pipeline
async function multiTouchAttributionHelper(siteId, model, dateFrom, dateTo) {
  const results = await getMultiTouchAttributionLive({
    siteId,
    model,
    dateFrom,
    dateTo,
    groupBy: 'source',
    metric: 'revenue'
  })
  return results.map(r => ({
    source: r.dim_value,
    medium: 'none',
    campaign: null,
    converting_users: Math.round(r.conversions),
    revenue: r.revenue
  }))
}

export function selectAiTouchForConversion(touchpoints, conversion, windowDays) {
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  const conversionTime = new Date(conversion.timestamp).getTime()

  // Filter touchpoints (pageviews) that occurred before conversion and within lookback window
  const inWindowPvs = touchpoints.filter(pv => {
    const pvTime = new Date(pv.timestamp).getTime()
    return pvTime <= conversionTime && pvTime >= conversionTime - windowMs
  })

  // Explicitly sort pageviews by timestamp ascending (earliest first)
  const sortedPvs = [...inWindowPvs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

  // Scan backwards to find the most recent AI touchpoint
  for (let i = sortedPvs.length - 1; i >= 0; i--) {
    const pv = sortedPvs[i]
    const platform = detectAiPlatformFromEvent(pv)
    if (platform) {
      return {
        touch: pv,
        type: 'journey_touchpoint',
        platform
      }
    }
  }

  // Fallback to conversion event itself
  const convPlatform = detectAiPlatformFromEvent(conversion)
  if (convPlatform) {
    return {
      touch: conversion,
      type: 'conversion_event',
      platform: convPlatform
    }
  }

  return null
}

export function chunkVisitorIds(uniqueIds, batchSize = 100) {
  const ids = [...new Set(uniqueIds)].filter(Boolean)
  const batches = []
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize))
  }
  return batches
}

export async function getAiPlatformAttributionLive({
  siteId,
  dateFrom,
  dateTo,
  groupBy = 'source',
  metric = 'revenue',
  filters = {},
  groupBy2 = null,
  granularity = 'day',
  attributionWindow = null,
  attributeBy = 'conversion_date'
}) {
  const { from: fromDate, to: toDate } = serializeHogQLDateRange(dateFrom, dateTo)
  const safeSite = esc(siteId)

  // 1. Fetch conversions
  const convSql = `
    SELECT
      uuid,
      distinct_id,
      timestamp,
      properties.conversion_type AS conversion_type,
      toFloatOrZero(toString(properties.conversion_value)) AS conversion_value,
      properties.utm_source AS utm_source,
      properties.utm_medium AS utm_medium,
      properties.utm_campaign AS utm_campaign,
      properties.referrer AS referrer,
      properties.ai_source AS ai_source,
      properties.country AS country,
      properties.device_type AS device_type,
      properties.utm_term AS utm_term,
      properties.provider AS provider,
      properties.attribution_status AS attribution_status,
      properties.stitching_method AS stitching_method,
      properties.ingestion_method AS ingestion_method,
      properties.browser_name AS browser_name,
      properties.browser AS browser,
      properties.page_url AS page_url
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND event = '$conversion'
      AND timestamp >= ${fromDate}
      AND timestamp < ${toDate}
    ORDER BY timestamp DESC
    LIMIT 10000
  `
  // LEG 1 — Tinybird cutover (allowlist-gated; null → HogQL fallback). Same window
  // extraction as the touch models. The pipe returns NAMED rows; remap to the EXACT
  // 20-field positional array the destructure below consumes, so all downstream
  // derived logic (provider/attributionStatus/stitchingMethod) stays byte-identical.
  const _tbFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbTo = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbConv = await _pipeRead('aiplatform_conversions_by_site', { site_id: String(siteId), date_from: _tbFrom, date_to: _tbTo })
  const convRows = _tbConv
    ? _tbConv.map(r => [
      r.uuid, r.distinct_id, r.timestamp, r.conversion_type, r.conversion_value,
      r.utm_source, r.utm_medium, r.utm_campaign, r.referrer, r.ai_source,
      r.country, r.device_type, r.utm_term, r.provider, r.attribution_status,
      r.stitching_method, r.ingestion_method, r.browser_name, r.browser, r.page_url
    ])
    : await _queryHogQL(convSql, 'aiplatform_conversions_live')

  const conversions = convRows.map(([
    uuid, distinctId, timestamp, conversionType, conversionValue,
    utmSource, utmMedium, utmCampaign, referrer, aiSource,
    country, deviceType, utmTerm, rawProvider, rawAttrStatus,
    rawStitchMethod, rawIngestionMethod, browserName, browser, pageUrl
  ]) => {
    const ingestionMethod = rawIngestionMethod || null
    const provider = rawProvider || (ingestionMethod === 'server_routed' ? 'browser' : ingestionMethod === 'offline' ? 'payments_api' : 'unknown')
    const stitchingMethod = rawStitchMethod || (ingestionMethod === 'server_routed' ? 'browser' : 'unknown')
    let attributionStatus = rawAttrStatus || null
    if (!attributionStatus) {
      if (ingestionMethod === 'server_routed') attributionStatus = 'attributed'
      else if (rawStitchMethod && rawStitchMethod !== '' && rawStitchMethod !== 'none') attributionStatus = 'attributed'
      else if (rawStitchMethod === 'none') attributionStatus = 'unattributed'
      else attributionStatus = 'unknown'
    }
    return {
      uuid,
      distinct_id: distinctId,
      timestamp,
      conversion_type: conversionType || null,
      conversion_value: Number(conversionValue) || 0,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      referrer: referrer || null,
      ai_source: aiSource || null,
      country: country || null,
      device_type: deviceType || null,
      utm_term: utmTerm || null,
      provider,
      attribution_status: attributionStatus,
      stitching_method: stitchingMethod,
      browser_name: browserName || browser || 'unknown',
      page_url: pageUrl || '/'
    }
  })

  if (conversions.length === 0) {
    return []
  }

  // 2. Fetch pageviews for lookback window
  const windowDays = attributionWindow && attributionWindow !== 'ltv' && Number(attributionWindow) > 0 ? Number(attributionWindow) : 30
  const fromIso = fromDate.match(/'([^']+)'/)[1]
  const lookbackDate = new Date(new Date(fromIso).getTime() - windowDays * 24 * 60 * 60 * 1000)
  const lookbackStr = serializeHogQLDateTime(lookbackDate)

  const uniqueIds = [...new Set(conversions.map(c => c.distinct_id))].filter(Boolean)
  if (uniqueIds.length === 0) {
    return []
  }

  const AI_ATTRIBUTION_VISITOR_BATCH_SIZE = 100
  const AI_ATTRIBUTION_PAGEVIEW_PAGE_SIZE = 5000

  const batches = chunkVisitorIds(uniqueIds, AI_ATTRIBUTION_VISITOR_BATCH_SIZE)
  const pageviewsByVisitor = {}

  // Tinybird DateTime params for the pageview leg (same instants HogQL uses).
  const _tbPvTo = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbLookback = lookbackStr.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batchIds = batches[batchIdx]

    // ── LEG 2 Tinybird branch (allowlist-gated): OFFSET paging over
    // pageviews_by_visitors into a per-batch BUFFER, merged into
    // pageviewsByVisitor ONLY on a clean full read (a page shorter than
    // page_size). A gated page-0 null OR any mid-stream null discards the buffer
    // and this batch falls through to the unchanged HogQL keyset loop below — so
    // no dropped or duplicated rows. Inert in prod: page-0 returns null when the
    // flag/allowlist is off, so the HogQL path runs. Independently gated per leg.
    const _tbBuffer = []
    let _tbComplete = false
    let _tbPageOffset = 0
    while (true) {
      const _tbPv = await _pipeRead('pageviews_by_visitors', {
        site_id: String(siteId),
        visitor_ids: batchIds, // array → the client comma-joins it
        lookback_from: _tbLookback,
        date_to: _tbPvTo,
        page_size: AI_ATTRIBUTION_PAGEVIEW_PAGE_SIZE,
        page_offset: _tbPageOffset
      })
      if (_tbPv === null) break
      for (const r of _tbPv) {
        _tbBuffer.push({
          distinctId: r.distinct_id,
          pvObj: {
            timestamp: r.timestamp,
            utm_source: r.utm_source || null,
            utm_medium: r.utm_medium || null,
            utm_campaign: r.utm_campaign || null,
            referrer: r.referrer || null,
            ai_source: r.ai_source || null,
            gclid: r.gclid || null,
            gbraid: r.gbraid || null,
            wbraid: r.wbraid || null,
            fbclid: r.fbclid || null,
            msclkid: r.msclkid || null,
            ttclid: r.ttclid || null,
            li_fat_id: r.li_fat_id || null,
            li_fatid: r.li_fatid || null,
            twclid: r.twclid || null,
            dclid: r.dclid || null,
            snapclid: r.snapclid || null,
            pclid: r.pclid || null,
            sccid: r.sccid || null,
            ko_click_id: r.ko_click_id || null,
            page_url: r.page_url || null,
            utm_term: r.utm_term || null
          }
        })
      }
      if (_tbPv.length < AI_ATTRIBUTION_PAGEVIEW_PAGE_SIZE) { _tbComplete = true; break }
      _tbPageOffset += AI_ATTRIBUTION_PAGEVIEW_PAGE_SIZE
    }
    if (_tbComplete) {
      for (const { distinctId, pvObj } of _tbBuffer) {
        if (!pageviewsByVisitor[distinctId]) pageviewsByVisitor[distinctId] = []
        pageviewsByVisitor[distinctId].push(pvObj)
      }
      continue
    }

    const escapedIds = batchIds.map(id => `'${esc(id)}'`)

    // Keyset (cursor) pagination, NOT OFFSET: PostHog's HogQL API rejects any
    // query containing an OFFSET clause when authenticated with a personal API
    // key — confirmed via a real call, fails even at OFFSET 0 ("OFFSET is not
    // supported on queries made with a personal API key"). The standard
    // tiebreaker-safe keyset idiom (`timestamp > X OR (timestamp = X AND
    // uuid > Y)`) ALSO fails here — verified this is a distinct HogQL/ClickHouse
    // bug with the `(A OR (B AND C))` boolean-nesting shape itself, reproduced
    // even with zero timestamp/date values involved. The working alternative,
    // verified end-to-end against real data (13 pages, 316/316 rows, zero
    // duplicates): compare a single computed sort-key string with one plain
    // `>` predicate instead of a boolean OR/AND structure.
    let pageNum = 0
    let cursor = null
    while (true) {
      const cursorClause = cursor ? `\n          AND concat(toString(timestamp), '|', uuid) > '${esc(cursor)}'` : ''
      const batchPvSql = `
        SELECT
          distinct_id,
          timestamp,
          properties.utm_source AS utm_source,
          properties.utm_medium AS utm_medium,
          properties.utm_campaign AS utm_campaign,
          properties.referrer AS referrer,
          properties.ai_source AS ai_source,
          properties.gclid AS gclid,
          properties.gbraid AS gbraid,
          properties.wbraid AS wbraid,
          properties.fbclid AS fbclid,
          properties.msclkid AS msclkid,
          properties.ttclid AS ttclid,
          properties.li_fat_id AS li_fat_id,
          properties.li_fatid AS li_fatid,
          properties.twclid AS twclid,
          properties.dclid AS dclid,
          properties.snapclid AS snapclid,
          properties.pclid AS pclid,
          properties.sccid AS sccid,
          properties.ko_click_id AS ko_click_id,
          properties.page_url AS page_url,
          properties.utm_term AS utm_term,
          concat(toString(timestamp), '|', uuid) AS _cursor_key
        FROM events
        WHERE properties.site_id = '${safeSite}'
          AND event = '$pageview'
          AND timestamp >= ${lookbackStr}
          AND timestamp < ${toDate}
          AND distinct_id IN (${escapedIds.join(',')})${cursorClause}
        ORDER BY _cursor_key ASC
        LIMIT ${AI_ATTRIBUTION_PAGEVIEW_PAGE_SIZE}
      `
      const pvRows = await _queryHogQL(batchPvSql, `aiplatform_pageviews_live_batch_${batchIdx}_page_${pageNum}`)

      for (const row of pvRows) {
        const distinctId = row[0]
        const timestamp = row[1]
        const utmSource = row[2]
        const utmMedium = row[3]
        const utmCampaign = row[4]
        const referrer = row[5]
        const aiSource = row[6]
        const gclid = row[7]
        const gbraid = row[8]
        const wbraid = row[9]
        const fbclid = row[10]
        const msclkid = row[11]
        const ttclid = row[12]
        const li_fat_id = row[13]
        const li_fatid = row[14]
        const twclid = row[15]
        const dclid = row[16]
        const snapclid = row[17]
        const pclid = row[18]
        const sccid = row[19]
        const ko_click_id = row[20]
        const pageUrl = row[21]
        const utmTerm = row[22]
        const cursorKey = row[23]

        const pvObj = {
          timestamp,
          utm_source: utmSource || null,
          utm_medium: utmMedium || null,
          utm_campaign: utmCampaign || null,
          referrer: referrer || null,
          ai_source: aiSource || null,
          gclid: gclid || null,
          gbraid: gbraid || null,
          wbraid: wbraid || null,
          fbclid: fbclid || null,
          msclkid: msclkid || null,
          ttclid: ttclid || null,
          li_fat_id: li_fat_id || null,
          li_fatid: li_fatid || null,
          twclid: twclid || null,
          dclid: dclid || null,
          snapclid: snapclid || null,
          pclid: pclid || null,
          sccid: sccid || null,
          ko_click_id: ko_click_id || null,
          page_url: pageUrl || null,
          utm_term: utmTerm || null
        }

        if (!pageviewsByVisitor[distinctId]) pageviewsByVisitor[distinctId] = []
        pageviewsByVisitor[distinctId].push(pvObj)
        cursor = cursorKey
      }

      if (pvRows.length < AI_ATTRIBUTION_PAGEVIEW_PAGE_SIZE) {
        break
      }
      pageNum++
    }
  }

  // 3. Match conversions to their AI platform touchpoint
  const aggregated = {}

  for (const conv of conversions) {
    const visitorPvs = pageviewsByVisitor[conv.distinct_id] || []
    const match = selectAiTouchForConversion(visitorPvs, conv, windowDays)

    if (!match) continue

    const creditedPlatform = match.platform

    // Apply UTM / Platform filters if present
    if (filters.source && creditedPlatform !== filters.source) continue
    if (filters.ai_source && creditedPlatform !== filters.ai_source) continue
    if (filters.country && conv.country !== filters.country) continue
    if (filters.device_type && conv.device_type !== filters.device_type) continue
    if (filters.conversion_type && conv.conversion_type !== filters.conversion_type) continue

    // Grouping
    let dimVal = 'unknown'
    if (groupBy === 'source' || groupBy === 'ai_source') dimVal = creditedPlatform
    else if (groupBy === 'channel') dimVal = 'AI Search'
    else if (groupBy === 'conversion_type') dimVal = conv.conversion_type || 'untyped'
    else if (groupBy === 'country') dimVal = conv.country || 'unknown'
    else if (groupBy === 'device') dimVal = conv.device_type || 'unknown'
    else if (groupBy === 'browser') dimVal = conv.browser_name || 'unknown'
    else if (groupBy === 'provider') dimVal = conv.provider || 'unknown'
    else if (groupBy === 'attribution_status') dimVal = conv.attribution_status || 'unknown'
    else if (groupBy === 'stitching_method') dimVal = conv.stitching_method || 'unknown'
    else if (groupBy === 'date') {
      const refDate = new Date(attributeBy === 'first_seen_date' && visitorPvs[0] ? visitorPvs[0].timestamp : conv.timestamp)
      if (granularity === 'quarter') {
        const q = Math.floor(refDate.getUTCMonth() / 3) + 1
        dimVal = `${refDate.getUTCFullYear()}-Q${q}`
      } else if (granularity === 'month') {
        dimVal = refDate.toISOString().slice(0, 7)
      } else {
        dimVal = refDate.toISOString().slice(0, 10)
      }
    } else {
      dimVal = '—'
    }

    let dimVal2 = null
    if (groupBy2) {
      if (groupBy2 === 'source' || groupBy2 === 'ai_source') dimVal2 = creditedPlatform
      else if (groupBy2 === 'channel') dimVal2 = 'AI Search'
      else if (groupBy2 === 'conversion_type') dimVal2 = conv.conversion_type || 'untyped'
      else if (groupBy2 === 'country') dimVal2 = conv.country || 'unknown'
      else if (groupBy2 === 'device') dimVal2 = conv.device_type || 'unknown'
      else if (groupBy2 === 'browser') dimVal2 = conv.browser_name || 'unknown'
      else if (groupBy2 === 'provider') dimVal2 = conv.provider || 'unknown'
      else if (groupBy2 === 'attribution_status') dimVal2 = conv.attribution_status || 'unknown'
      else if (groupBy2 === 'stitching_method') dimVal2 = conv.stitching_method || 'unknown'
      else if (groupBy2 === 'date') {
        const refDate = new Date(attributeBy === 'first_seen_date' && visitorPvs[0] ? visitorPvs[0].timestamp : conv.timestamp)
        if (granularity === 'quarter') {
          const q = Math.floor(refDate.getUTCMonth() / 3) + 1
          dimVal2 = `${refDate.getUTCFullYear()}-Q${q}`
        } else if (granularity === 'month') {
          dimVal2 = refDate.toISOString().slice(0, 7)
        } else {
          dimVal2 = refDate.toISOString().slice(0, 10)
        }
      } else {
        dimVal2 = '—'
      }
    }

    const groupKey = groupBy2 ? `${dimVal}||${dimVal2}` : dimVal
    if (!aggregated[groupKey]) {
      aggregated[groupKey] = { dim_value: dimVal, dim_value2: dimVal2, conversions: 0, revenue: 0 }
    }
    aggregated[groupKey].conversions += 1
    aggregated[groupKey].revenue += conv.conversion_value
  }

  // Format results to match expected flexible report schema
  const results = Object.values(aggregated).map(g => {
    const item = {
      dim_value: g.dim_value,
      ...(groupBy2 ? { dim_value2: g.dim_value2 } : {}),
      revenue: parseFloat(g.revenue.toFixed(2)),
      conversions: g.conversions
    }
    // Also inject specific metric key to match getFlexibleReport's custom keys
    if (metric !== 'revenue' && metric !== 'conversions') {
      item[metric] = metric === 'avg_conversion_value'
        ? g.conversions > 0 ? parseFloat((g.revenue / g.conversions).toFixed(2)) : 0
        : g.conversions
    }
    return item
  })

  return results.sort((a, b) => b.revenue - a.revenue)
}

export async function aiPlatformAttribution(siteId, dateFrom, dateTo) {
  let windowDays = 30
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('sites')
      .select('attribution_window_days')
      .eq('id', siteId)
      .single()
    if (data?.attribution_window_days) {
      windowDays = data.attribution_window_days
    }
  } catch (err) {
    console.error('[aiPlatformAttribution] failed to fetch site window:', err)
  }

  const results = await getAiPlatformAttributionLive({
    siteId,
    dateFrom,
    dateTo,
    groupBy: 'source',
    metric: 'revenue',
    attributionWindow: String(windowDays)
  })

  return results.map(r => ({
    source: r.dim_value,
    conversions: r.conversions,
    revenue: r.revenue
  }))
}

export async function getAttribution(siteId, model, dateFrom, dateTo) {
  const key = cacheKey(model, siteId, dateFrom, dateTo)
  const cached = cache.get(key)
  if (cached) return cached

  let results
  switch (model) {
    case 'first_touch':
      results = await firstTouchAttribution(siteId, dateFrom, dateTo)
      break
    case 'last_touch':
      results = await lastTouchAttribution(siteId, dateFrom, dateTo)
      break
    case 'first_touch_non_direct':
      results = await firstTouchNonDirectAttribution(siteId, dateFrom, dateTo)
      break
    case 'last_touch_non_direct':
      results = await lastTouchNonDirectAttribution(siteId, dateFrom, dateTo)
      break
    case 'linear':
    case 'u_shaped':
    case 'time_decay':
    case 'w_shaped':
      results = await multiTouchAttributionHelper(siteId, model, dateFrom, dateTo)
      break
    case 'ai_platforms':
      results = await aiPlatformAttribution(siteId, dateFrom, dateTo)
      break
    default:
      throw new Error(`Unknown attribution model: ${model}`)
  }

  const isTruncated = Array.isArray(results) && results.length >= 50000

  const finalResult = isTruncated
    ? { results, truncated: true, truncated_at: 50000 }
    : results

  cache.set(key, finalResult)
  return finalResult
}

/**
 * Session report — derives sessions from pageview events on read.
 * NOT materialized: sessions are computed at query time using the 30-minute inactivity rule.
 * Limited to 50,000 pageview events per query for performance.
 * Sessions are attributed by entry source (UTM source of the first pageview in the session).
 */

// channelFromEvent is imported from ./channel-classifier.js (shared with nightly job)
export { channelFromEvent }

// Tool/test-only seam: evict getSessionReport's NodeCache entry for a report so an A/B
// parity run forces a fresh OFF-vs-ON dispatch — otherwise the ON leg reads the OFF leg's
// cached result within the 60s TTL and masks divergence (route_ab_diff.mjs session-report
// target, mirroring events-health's __evictHealthCache). Must reproduce the cacheKey below
// EXACTLY. Never used on a live request path.
export function __evictSessionReportCache (siteId, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null) {
  cache.del(cacheKey(`session:${groupBy}:${metric}:${JSON.stringify(filters)}:${groupBy2 || ''}`, siteId, dateFrom, dateTo))
}

export async function getSessionReport(siteId, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null) {
  const key = cacheKey(`session:${groupBy}:${metric}:${JSON.stringify(filters)}:${groupBy2 || ''}`, siteId, dateFrom, dateTo)
  const cached = cache.get(key)
  if (cached) return cached

  const { from: fromDate, to: toDate } = serializeHogQLDateRange(dateFrom, dateTo)
  const safeSite = esc(siteId)

  // Build filter clauses (same pattern as getFlexibleReport)
  let filterClauses = ''
  if (filters.channel) {
    filterClauses += `
    AND COALESCE(
  multiIf(
    properties.ai_source IS NOT NULL AND properties.ai_source != '', 'AI Search',
    lower(COALESCE(properties.utm_medium, '')) IN ('cpc','ppc','paid','paid_search','sem'), 'Paid Search',
    lower(COALESCE(properties.utm_medium, '')) IN ('paid_social','paidsocial','social_paid'), 'Paid Social',
    lower(COALESCE(properties.utm_medium, '')) IN ('email','newsletter'), 'Email',
    lower(COALESCE(properties.utm_medium, '')) IN ('social','organic_social'), 'Organic Social',
    lower(COALESCE(properties.utm_medium, '')) IN ('organic','seo'), 'Organic Search',
    lower(COALESCE(properties.utm_source, '')) IN ('google','bing','duckduckgo','yahoo','brave') AND lower(COALESCE(properties.utm_medium, '')) NOT IN ('cpc','ppc','paid','paid_search','sem'), 'Organic Search',
    lower(COALESCE(properties.utm_source, '')) IN ('facebook','instagram','linkedin','twitter','x','tiktok','youtube','reddit') AND lower(COALESCE(properties.utm_medium, '')) NOT IN ('paid_social','paidsocial','social_paid'), 'Organic Social',
    lower(COALESCE(properties.utm_source, '')) IN ('mailchimp','klaviyo','hubspot','sendgrid','customer.io'), 'Email',
    properties.referrer IS NULL OR properties.referrer = '', 'Direct',
    'Referral'
  ),
  'Other'
) = '${esc(filters.channel)}'`
  }

  if (filters.conversion_type) {
    filterClauses += `
    AND properties.conversion_type = '${esc(filters.conversion_type)}'`
  }
  if (filters.source) {
    filterClauses += `\n    AND properties.utm_source = '${esc(filters.source)}'`
  }
  if (filters.medium) {
    filterClauses += `\n    AND properties.utm_medium = '${esc(filters.medium)}'`
  }
  if (filters.campaign) {
    filterClauses += `\n    AND properties.utm_campaign = '${esc(filters.campaign)}'`
  }
  if (filters.country) {
    filterClauses += `\n    AND properties.country = '${esc(filters.country)}'`
  }
  if (filters.device_type) {
    filterClauses += `\n    AND properties.device_type = '${esc(filters.device_type)}'`
  }

  const getCustomKey = (dim) => dim && dim.startsWith('custom_param:') ? dim.split(':')[1] : null
  const custKey1 = getCustomKey(groupBy)
  const custKey2 = getCustomKey(groupBy2)

  const selectParts = []
  if (custKey1) selectParts.push(`properties.custom_${custKey1} AS custom_${custKey1}`)
  if (custKey2 && custKey2 !== custKey1) selectParts.push(`properties.custom_${custKey2} AS custom_${custKey2}`)
  const customSelect = selectParts.length > 0 ? ',\n      ' + selectParts.join(',\n      ') : ''

  // Query pageviews for session derivation
  const sql = `
    SELECT
      distinct_id AS distinct_id,
      timestamp,
      properties.page_url,
      properties.utm_source,
      properties.utm_medium,
      properties.utm_campaign,
      properties.country,
      properties.device_type${customSelect}
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND event = '$pageview'
      AND timestamp >= ${fromDate}
      AND timestamp < ${toDate}${filterClauses}
    ORDER BY distinct_id ASC, timestamp ASC
    LIMIT 50000
  `

  // Tinybird cutover (allowlist-gated; null -> HogQL fallback). SAME window bounds HogQL
  // uses; format for ClickHouse DateTime params. Pipe named rows -> HogQL positional order
  // so the mapRows below is byte-identical. #155 central-normalizes the pipe timestamp at
  // the boundary, so the started_at.split('T') daily bucket stays correct — no raw
  // new Date()/.split('T') is reintroduced here.
  const _tbFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbTo = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbPvParams = { site_id: String(siteId), date_from_ts: _tbFrom, date_to_ts: _tbTo }
  if (custKey1) _tbPvParams.custom_key1 = custKey1
  if (custKey2 && custKey2 !== custKey1) _tbPvParams.custom_key2 = custKey2
  // FILTER GATE: getSessionReport calls the pipes WITHOUT the content-filter params (channel/source/
  // medium/campaign/country/device_type/conversion_type), while the HogQL leg applies them via
  // filterClauses — so a FILTERED request would over-count from the pipe (unfiltered rows). Fall back
  // to HogQL whenever any content filter is active (mirrors the flexible_report filterClauses gate).
  // Unfiltered requests still serve from the pipe; custom-param GROUPING is not a content filter and
  // stays pipe-eligible (custom_key1/2 are the group dims, passed above). ReportBuilder lets a user
  // combine a session metric with a filter, so this path is live-reachable.
  const _sessionPipeEligible = filterClauses === ''
  const _tbPv = _sessionPipeEligible ? await _pipeRead('session_report_pageviews', _tbPvParams) : null
  const rows = _tbPv
    ? _tbPv.map(r => {
        const base = [r.distinct_id, r.timestamp, r.page_url, r.utm_source, r.utm_medium, r.utm_campaign, r.country, r.device_type]
        if (custKey1) base.push(r.custom_key1)
        if (custKey2 && custKey2 !== custKey1) base.push(r.custom_key2)
        return base
      })
    : await _queryHogQL(sql, 'session_report_pageviews')

  // Also query conversions for conversion_sessions metric
  const convSql = `
    SELECT
      distinct_id AS distinct_id,
      timestamp
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND event = '$conversion'
      AND timestamp >= ${fromDate}
      AND timestamp < ${toDate}${filterClauses}
    ORDER BY distinct_id ASC, timestamp ASC
    LIMIT 50000
  `

  const _tbConv = _sessionPipeEligible ? await _pipeRead('session_report_conversions', { site_id: String(siteId), date_from_ts: _tbFrom, date_to_ts: _tbTo }) : null
  const convRows = _tbConv
    ? _tbConv.map(r => [r.distinct_id, r.timestamp])
    : await _queryHogQL(convSql, 'session_report_conversions')

  // Build events array per visitor
  const eventsByVisitor = new Map()

  for (const row of rows) {
    const distinctId = row[0]
    const timestamp = row[1]
    const pageUrl = row[2]
    const utmSource = row[3]
    const utmMedium = row[4]
    const utmCampaign = row[5]
    const country = row[6]
    const deviceType = row[7]

    const eventObj = {
      event: '$pageview',
      timestamp,
      page_url: pageUrl || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      country: country || null,
      device_type: deviceType || null,
      conversion_value: null
    }

    if (custKey1) eventObj[`custom_${custKey1}`] = row[8]
    if (custKey2) eventObj[`custom_${custKey2}`] = row[custKey1 && custKey1 !== custKey2 ? 9 : 8]

    if (!eventsByVisitor.has(distinctId)) eventsByVisitor.set(distinctId, [])
    eventsByVisitor.get(distinctId).push(eventObj)
  }

  for (const row of convRows) {
    const [distinctId, timestamp] = row
    if (!eventsByVisitor.has(distinctId)) eventsByVisitor.set(distinctId, [])
    eventsByVisitor.get(distinctId).push({
      event: '$conversion',
      timestamp,
      page_url: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      country: null,
      device_type: null,
      conversion_value: null
    })
  }

  // Derive sessions per visitor
  let allSessions = []
  for (const [, events] of eventsByVisitor) {
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    const sessions = deriveSessions(events)
    allSessions = allSessions.concat(sessions)
  }

  // Group sessions by dimension
  const dimKey = (sess) => {
    if (groupBy.startsWith('custom_param:')) {
      const key = groupBy.split(':')[1]
      return sess.entry_event?.[`custom_${key}`] || 'unknown'
    }
    switch (groupBy) {
      case 'conversion_type': return "COALESCE(NULLIF(any(properties.conversion_type), ''), 'untyped')"
      case 'channel': return channelFromEvent(sess.entry_event || sess.events?.[0] || sess)
      case 'source': return sess.entry_source || 'direct'
      case 'medium': return sess.entry_medium || 'none'
      case 'campaign': return sess.entry_campaign || 'unknown'
      case 'landing_page': return sess.entry_page || '/'
      case 'country': return sess.country || 'unknown'
      case 'device': return sess.device_type || 'unknown'
      case 'date': return sess.started_at.split('T')[0]
      default: return 'unknown'
    }
  }

  const dim2Key = groupBy2 ? (sess) => {
    if (groupBy2.startsWith('custom_param:')) {
      const key = groupBy2.split(':')[1]
      return sess.entry_event?.[`custom_${key}`] || 'unknown'
    }
    switch (groupBy2) {
      case 'source': return sess.entry_source || 'direct'
      case 'medium': return sess.entry_medium || 'none'
      case 'campaign': return sess.entry_campaign || 'unknown'
      case 'landing_page': return sess.entry_page || '/'
      case 'country': return sess.country || 'unknown'
      case 'device': return sess.device_type || 'unknown'
      case 'date': return sess.started_at.split('T')[0]
      default: return 'unknown'
    }
  } : null

  const groups = new Map()

  for (const sess of allSessions) {
    const d1 = dimKey(sess)
    const d2 = dim2Key ? dim2Key(sess) : null
    const key = d2 ? `${d1}||${d2}` : d1

    if (!groups.has(key)) {
      groups.set(key, { dim_value: d1, dim_value2: d2, sessions: [], total_duration: 0, total_pageviews: 0, conversion_sessions: 0 })
    }
    const g = groups.get(key)
    g.sessions.push(sess)
    g.total_duration += sess.duration_seconds || 0
    g.total_pageviews += sess.pageview_count || 0
    if (sess.contains_conversion) g.conversion_sessions += 1
  }

  let results = []
  for (const g of groups.values()) {
    const count = g.sessions.length
    const avgDuration = count > 0 ? g.total_duration / count : 0
    const avgPages = count > 0 ? g.total_pageviews / count : 0

    let metricValue
    switch (metric) {
      case 'session_count': metricValue = count; break
      case 'avg_session_duration': metricValue = Math.round(avgDuration); break
      case 'pages_per_session': metricValue = Math.round(avgPages * 10) / 10; break
      case 'conversion_sessions': metricValue = g.conversion_sessions; break
      default: metricValue = 0
    }

    const item = {
      dim_value: g.dim_value,
      ...(dim2Key ? { dim_value2: g.dim_value2 } : {}),
      [metric]: metricValue
    }
    results.push(item)
  }

  results.sort((a, b) => (b[metric] || 0) - (a[metric] || 0))

  const isTruncated = rows.length >= 50000 || convRows.length >= 50000

  const finalResult = isTruncated
    ? { results, truncated: true, truncated_at: 50000 }
    : results

  cache.set(key, finalResult)
  return finalResult
}

// Attribution explanation: for a given distinct_id, site, and model, return WHY
// credit was assigned — the specific touchpoint, journey timeline, and model logic.
export async function getAttributionExplanation(siteId, model, distinctId) {
  const safeSite = esc(siteId)
  const safeId = esc(distinctId)

  // 1. Fetch the conversion event for this visitor
  const convSql = `
    SELECT
      timestamp,
      toFloatOrZero(toString(properties.conversion_value)) AS conversion_value,
      properties.utm_source,
      properties.utm_medium,
      properties.utm_campaign,
      properties.first_touch_source,
      properties.first_touch_medium,
      properties.first_touch_campaign,
      properties.ai_source,
      properties.page_url,
      properties.user_id,
      properties.anonymous_id,
      properties.ingestion_method
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND event = '$conversion'
      AND distinct_id = '${safeId}'
    ORDER BY timestamp DESC
    LIMIT 1
  `
  // Tinybird cutover (allowlist-gated; null -> HogQL fallback). No date window — keyed by
  // distinct_id, LIMIT 1. Pipe named rows -> HogQL positional order so the destructure below
  // is byte-identical. #155 central-normalizes the pipe timestamp; no raw new Date()/.split('T')
  // reintroduced. An empty pipe result ([], not null) = no conversion for this visitor -> the
  // length-0 guard below returns null exactly as HogQL does; a null pipe result = flag off/error
  // -> HogQL fallback.
  const _tbConv = await _pipeRead('attribution_explain_conversion', { site_id: String(siteId), distinct_id: String(distinctId) })
  const convRows = _tbConv
    ? _tbConv.map(r => [r.timestamp, r.conversion_value, r.utm_source, r.utm_medium, r.utm_campaign, r.first_touch_source, r.first_touch_medium, r.first_touch_campaign, r.ai_source, r.page_url, r.user_id, r.anonymous_id, r.ingestion_method])
    : await _queryHogQL(convSql, 'attribution_explain_conversion')
  if (!convRows || convRows.length === 0) {
    return null
  }

  const [convTs, convValue, utmSrc, utmMed, utmCamp, ftSrc, ftMed, ftCamp, aiSrc, pageUrl, userId, anonId, ingestion] = convRows[0]

  const conversion = {
    timestamp: convTs,
    value: Number(convValue) || 0,
    page_url: pageUrl || null,
    user_id: userId || null,
    anonymous_id: anonId || null,
    ingestion_method: ingestion || 'server_routed'
  }

  // 2. Fetch all events (journey) for this visitor
  const journeySql = `
    SELECT
      event,
      timestamp,
      properties.page_url,
      properties.utm_source,
      properties.utm_medium,
      properties.utm_campaign,
      properties.ai_source,
      properties.conversion_value
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND distinct_id = '${safeId}'
    ORDER BY timestamp ASC
    LIMIT 500
  `
  // Journey stays on HogQL (no pipe for this leg) but via the injectable _queryHogQL seam so
  // the A/B harness controls both legs. On the harness ON leg this is an EXPECTED HogQL read
  // (the explain target allowlists 'attribution_explain_journey'), so it does NOT trip the
  // zero-fallback hit-guard — only the wired conversion read falling back would.
  const journeyRows = await _queryHogQL(journeySql, 'attribution_explain_journey')
  const journey = (journeyRows || []).map(([evt, ts, url, src, med, camp, ais, cv]) => ({
    event: evt,
    timestamp: ts,
    page_url: url || null,
    utm_source: src || null,
    utm_medium: med || null,
    utm_campaign: camp || null,
    ai_source: ais || null,
    conversion_value: cv ? Number(cv) : null
  }))

  const touchpoints = journey.filter(j => j.event === '$pageview')
  const directTouches = touchpoints.filter(t => !t.utm_source || t.utm_source === '' || t.utm_source === 'direct')
  const nonDirectTouches = touchpoints.filter(t => t.utm_source && t.utm_source !== '' && t.utm_source !== 'direct')

  // 3. Derive sessions from journey events (computed on read, not materialized)
  const sessions = deriveSessions(journey)
  const annotated = annotateSessions(sessions)

  // 4. Build explanation based on model
  let explanation = {
    model,
    distinct_id: distinctId,
    conversion,
    journey_summary: {
      total_events: journey.length,
      touchpoint_count: touchpoints.length,
      direct_touches: directTouches.length,
      non_direct_touches: nonDirectTouches.length,
      journey_duration_days: touchpoints.length >= 2
        ? Math.max(0, Math.round((new Date(touchpoints[touchpoints.length - 1].timestamp) - new Date(touchpoints[0].timestamp)) / (1000 * 60 * 60 * 24)))
        : 0,
      session_count: sessions.length,
      first_session_at: sessions.length > 0 ? sessions[0].started_at : null,
      last_session_at: sessions.length > 0 ? sessions[sessions.length - 1].ended_at : null,
      converting_session_index: annotated.converting_session_index
    },
    sessions: annotated.sessions,
    attributed_to: null,
    reason: '',
    fallback: false,
    skipped_touches: [],
    all_touches: touchpoints.map(t => ({
      timestamp: t.timestamp,
      page_url: t.page_url,
      source: t.utm_source || 'direct',
      medium: t.utm_medium || 'none',
      campaign: t.utm_campaign || null,
      type: (!t.utm_source || t.utm_source === '' || t.utm_source === 'direct') ? 'direct' : 'non_direct',
      ai_source: t.ai_source || null
    }))
  }

  switch (model) {
    case 'first_touch': {
      const ft = ftSrc || 'direct'
      explanation.attributed_to = { source: ft, medium: ftMed || 'none', campaign: ftCamp || null }
      explanation.reason = ft === 'direct'
        ? 'First touch was direct (no UTM on first visit)'
        : 'First touch source stored in browser cookie at initial visit'
      explanation.fallback = false
      break
    }
    case 'last_touch': {
      const lt = utmSrc || 'direct'
      explanation.attributed_to = { source: lt, medium: utmMed || 'none', campaign: utmCamp || null }
      explanation.reason = lt === 'direct'
        ? 'Last touch was direct (no UTM on conversion page)'
        : 'UTM parameters present on the page at time of conversion'
      explanation.fallback = false
      break
    }
    case 'first_touch_non_direct': {
      if (nonDirectTouches.length > 0) {
        const firstNd = nonDirectTouches[0]
        explanation.attributed_to = {
          source: firstNd.utm_source,
          medium: firstNd.utm_medium || 'none',
          campaign: firstNd.utm_campaign || null
        }
        explanation.reason = 'Earliest non-direct pageview for this visitor'
        explanation.fallback = false
        explanation.skipped_touches = directTouches
          .filter(t => new Date(t.timestamp) < new Date(firstNd.timestamp))
          .map(t => ({
            timestamp: t.timestamp,
            source: t.utm_source || 'direct',
            reason: 'Skipped: direct touch before first non-direct'
          }))
      } else {
        explanation.attributed_to = { source: ftSrc || 'direct', medium: ftMed || 'none', campaign: ftCamp || null }
        explanation.reason = 'No non-direct touchpoints found — fell back to first_touch cookie value'
        explanation.fallback = true
      }
      break
    }
    case 'last_touch_non_direct': {
      if (nonDirectTouches.length > 0) {
        const lastNd = nonDirectTouches[nonDirectTouches.length - 1]
        explanation.attributed_to = {
          source: lastNd.utm_source,
          medium: lastNd.utm_medium || 'none',
          campaign: lastNd.utm_campaign || null
        }
        explanation.reason = 'Latest non-direct pageview for this visitor'
        explanation.fallback = false
        explanation.skipped_touches = directTouches
          .filter(t => new Date(t.timestamp) > new Date(lastNd.timestamp))
          .map(t => ({
            timestamp: t.timestamp,
            source: t.utm_source || 'direct',
            reason: 'Skipped: direct touch after last non-direct'
          }))
      } else {
        explanation.attributed_to = { source: utmSrc || 'direct', medium: utmMed || 'none', campaign: utmCamp || null }
        explanation.reason = 'No non-direct touchpoints found — fell back to conversion page UTM (or direct)'
        explanation.fallback = true
      }
      break
    }
    case 'ai_platforms': {
      const windowDays = 30
      const match = selectAiTouchForConversion(touchpoints, conversion, windowDays)

      if (match) {
        explanation.attributed_to = {
          source: match.platform,
          medium: '—',
          campaign: null,
          type: match.type
        }
        explanation.reason = match.type === 'journey_touchpoint'
          ? `Most recent AI platform touchpoint in journey: ${match.platform} (pageview)`
          : `AI platform detected on the conversion event itself (fallback)`
        explanation.fallback = false
      } else {
        explanation.attributed_to = { source: 'unknown', medium: '—', campaign: null }
        explanation.reason = 'No AI platform touchpoint found in journey or at conversion time'
        explanation.fallback = true
      }
      break
    }
    case 'linear':
    case 'time_decay':
    case 'u_shaped':
    case 'w_shaped': {
      explanation.attributed_to = null
      explanation.reason = 'Step-by-step explanations are currently available for single-touch models only. Advanced models are calculated in aggregate reports.'
      explanation.fallback = false
      break
    }
    default:
      explanation.reason = `Unknown model: ${model}`
  }

  return explanation
}

const CHANNEL_DIM_SQL = `
COALESCE(
  multiIf(
    properties.ai_source IS NOT NULL AND properties.ai_source != '', 'AI Search',
    lower(COALESCE(properties.utm_medium, '')) IN ('cpc','ppc','paid','paid_search','sem'), 'Paid Search',
    lower(COALESCE(properties.utm_medium, '')) IN ('paid_social','paidsocial','social_paid'), 'Paid Social',
    lower(COALESCE(properties.utm_medium, '')) IN ('email','newsletter'), 'Email',
    lower(COALESCE(properties.utm_medium, '')) IN ('social','organic_social'), 'Organic Social',
    lower(COALESCE(properties.utm_medium, '')) IN ('organic','seo'), 'Organic Search',
    lower(COALESCE(properties.utm_source, '')) IN ('google','bing','duckduckgo','yahoo','brave') AND lower(COALESCE(properties.utm_medium, '')) NOT IN ('cpc','ppc','paid','paid_search','sem'), 'Organic Search',
    lower(COALESCE(properties.utm_source, '')) IN ('facebook','instagram','linkedin','twitter','x','tiktok','youtube','reddit') AND lower(COALESCE(properties.utm_medium, '')) NOT IN ('paid_social','paidsocial','social_paid'), 'Organic Social',
    lower(COALESCE(properties.utm_source, '')) IN ('mailchimp','klaviyo','hubspot','sendgrid','customer.io'), 'Email',
    properties.referrer IS NULL OR properties.referrer = '', 'Direct',
    'Referral'
  ),
  'Other'
)
`

const GROUP_COLUMNS = {

  channel: {
    first_touch: CHANNEL_DIM_SQL,
    last_touch: CHANNEL_DIM_SQL,
    first_touch_non_direct: CHANNEL_DIM_SQL,
    last_touch_non_direct: CHANNEL_DIM_SQL,
    ai_platforms: CHANNEL_DIM_SQL
  },
  conversion_type: {
    first_touch: "COALESCE(NULLIF(properties.conversion_type, ''), 'untyped')",
    last_touch: "COALESCE(NULLIF(properties.conversion_type, ''), 'untyped')",
    first_touch_non_direct: "COALESCE(NULLIF(properties.conversion_type, ''), 'untyped')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.conversion_type, ''), 'untyped')",
    ai_platforms: "COALESCE(NULLIF(properties.conversion_type, ''), 'untyped')"
  },
  source: {
    first_touch: "COALESCE(NULLIF(properties.first_touch_source, ''), 'direct')",
    last_touch: "COALESCE(NULLIF(properties.utm_source, ''), 'direct')",
    linear: "COALESCE(NULLIF(properties.utm_source, ''), 'direct')",
    ai_platforms: 'properties.ai_source',
    first_touch_non_direct: "COALESCE(NULLIF(any(_nd.nd_source), ''), COALESCE(NULLIF(properties.first_touch_source, ''), 'direct'))",
    last_touch_non_direct: "COALESCE(NULLIF(any(_nd.nd_source), ''), COALESCE(NULLIF(properties.utm_source, ''), 'direct'))"
  },
  medium: {
    first_touch: "COALESCE(NULLIF(properties.first_touch_medium, ''), 'none')",
    last_touch: "COALESCE(NULLIF(properties.utm_medium, ''), 'none')",
    linear: "COALESCE(NULLIF(properties.utm_medium, ''), 'none')",
    ai_platforms: "'—'",
    first_touch_non_direct: "COALESCE(NULLIF(any(_nd.nd_medium), ''), COALESCE(NULLIF(properties.first_touch_medium, ''), 'none'))",
    last_touch_non_direct: "COALESCE(NULLIF(any(_nd.nd_medium), ''), COALESCE(NULLIF(properties.utm_medium, ''), 'none'))"
  },
  campaign: {
    first_touch: 'properties.first_touch_campaign',
    last_touch: 'properties.utm_campaign',
    linear: 'properties.utm_campaign',
    ai_platforms: "'—'",
    first_touch_non_direct: 'COALESCE(_nd.nd_campaign, properties.first_touch_campaign)',
    last_touch_non_direct: 'COALESCE(_nd.nd_campaign, properties.utm_campaign)'
  },
  keyword: {
    first_touch: "COALESCE(NULLIF(properties.utm_term, ''), 'unknown')",
    last_touch: "COALESCE(NULLIF(properties.utm_term, ''), 'unknown')",
    linear: "COALESCE(NULLIF(properties.utm_term, ''), 'unknown')",
    ai_platforms: "'—'",
    first_touch_non_direct: "COALESCE(NULLIF(_nd.nd_term, ''), COALESCE(NULLIF(properties.utm_term, ''), 'unknown'))",
    last_touch_non_direct: "COALESCE(NULLIF(_nd.nd_term, ''), COALESCE(NULLIF(properties.utm_term, ''), 'unknown'))"
  },
  referrer_domain: {
    first_touch: REFERRER_DOMAIN_SQL,
    last_touch: REFERRER_DOMAIN_SQL,
    linear: REFERRER_DOMAIN_SQL,
    ai_platforms: "'—'",
    first_touch_non_direct: REFERRER_DOMAIN_SQL,
    last_touch_non_direct: REFERRER_DOMAIN_SQL
  },
  provider: {
    first_touch: PROVIDER_SQL,
    last_touch: PROVIDER_SQL,
    linear: PROVIDER_SQL,
    ai_platforms: PROVIDER_SQL,
    first_touch_non_direct: PROVIDER_SQL,
    last_touch_non_direct: PROVIDER_SQL
  },
  attribution_status: {
    first_touch: ATTRIBUTION_STATUS_SQL,
    last_touch: ATTRIBUTION_STATUS_SQL,
    linear: ATTRIBUTION_STATUS_SQL,
    ai_platforms: ATTRIBUTION_STATUS_SQL,
    first_touch_non_direct: ATTRIBUTION_STATUS_SQL,
    last_touch_non_direct: ATTRIBUTION_STATUS_SQL
  },
  stitching_method: {
    first_touch: STITCHING_METHOD_SQL,
    last_touch: STITCHING_METHOD_SQL,
    linear: STITCHING_METHOD_SQL,
    ai_platforms: STITCHING_METHOD_SQL,
    first_touch_non_direct: STITCHING_METHOD_SQL,
    last_touch_non_direct: STITCHING_METHOD_SQL
  },
  ai_source: {
    first_touch: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    last_touch: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    linear: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    ai_platforms: 'properties.ai_source',
    first_touch_non_direct: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.ai_source, ''), 'none')"
  },
  landing_page: {
    first_touch: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    last_touch: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    linear: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    ai_platforms: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    first_touch_non_direct: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.page_url, ''), '/')"
  },
  country: {
    first_touch: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    last_touch: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    linear: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    ai_platforms: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    first_touch_non_direct: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.country, ''), 'unknown')"
  },
  device: {
    first_touch: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    last_touch: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    linear: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    ai_platforms: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    first_touch_non_direct: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')"
  },
  browser: {
    first_touch: "COALESCE(NULLIF(properties.browser_name, ''), NULLIF(properties.browser, ''), 'unknown')",
    last_touch: "COALESCE(NULLIF(properties.browser_name, ''), NULLIF(properties.browser, ''), 'unknown')",
    linear: "COALESCE(NULLIF(properties.browser_name, ''), NULLIF(properties.browser, ''), 'unknown')",
    ai_platforms: "COALESCE(NULLIF(properties.browser_name, ''), NULLIF(properties.browser, ''), 'unknown')",
    first_touch_non_direct: "COALESCE(NULLIF(properties.browser_name, ''), NULLIF(properties.browser, ''), 'unknown')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.browser_name, ''), NULLIF(properties.browser, ''), 'unknown')"
  },
  date: {
    // These entries are dead code — date dimExpr is now always generated
    // via formatDateTime(refTs, ...) to support attributeBy.
    // Kept for documentation of the expected format per model.
    first_touch: null,
    last_touch: null,
    linear: null,
    ai_platforms: null,
    first_touch_non_direct: null,
    last_touch_non_direct: null
  }
}

// Confirmed with PostHog/ClickHouse formatDateTime:
// day (%Y-%m-%d) ✓, week (%Y-W%V) ✓, month (%Y-%m) ✓, year (%Y) ✓
// quarter uses concat(toYear,toQuarter) since %Q is not a valid ClickHouse specifier.
// The quarter entry below is dead code kept for documentation — the actual quarter path
// uses the concat() expression in dimExpr/dim2Expr directly.
const GRANULARITY_MAP = {
  day: "'%Y-%m-%d'",
  week: "'%Y-W%V'",
  month: "'%Y-%m'",
  quarter: "'%Y-Q'",
  year: "'%Y'"
}

// attributeBy: determines which timestamp is used for date-based grouping.
// - 'conversion_date': uses the conversion event's own timestamp (default, current behavior)
// - 'first_seen_date': uses the visitor's first event timestamp (MIN(timestamp) per distinct_id)
// - 'original_source_date': uses the first event timestamp where UTM source was present
// Non-date dimensions (source, campaign, etc.) are unaffected by attributeBy.
export async function getMultiTouchAttributionLive({
  siteId,
  model,
  dateFrom,
  dateTo,
  groupBy,
  metric = 'revenue',
  filters = {},
  groupBy2 = null,
  granularity = 'day',
  attributionWindow = null,
  attributeBy = 'conversion_date'
}) {
  const { from: fromDate, to: toDate } = serializeHogQLDateRange(dateFrom, dateTo)
  const safeSite = esc(siteId)

  // 1. Fetch conversions
  const convSql = `
    SELECT
      uuid,
      distinct_id,
      timestamp,
      properties.conversion_type AS conversion_type,
      toFloatOrZero(toString(properties.conversion_value)) AS conversion_value,
      properties.utm_source AS utm_source,
      properties.utm_medium AS utm_medium,
      properties.utm_campaign AS utm_campaign,
      properties.referrer AS referrer,
      properties.ai_source AS ai_source,
      properties.country AS country,
      properties.device_type AS device_type,
      properties.utm_term AS utm_term,
      properties.provider AS provider,
      properties.attribution_status AS attribution_status,
      properties.stitching_method AS stitching_method,
      properties.ingestion_method AS ingestion_method,
      properties.stripe_subscription_id AS stripe_subscription_id,
      properties.stripe_event_type AS stripe_event_type
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND event = '$conversion'
      AND timestamp >= ${fromDate}
      AND timestamp < ${toDate}
    ORDER BY timestamp DESC
    LIMIT 10000
  `
  // Tinybird cutover (allowlist-gated; null -> HogQL fallback). Reuse the SAME window
  // bounds HogQL uses to guarantee date-parity; format for ClickHouse DateTime params.
  // Pipe named rows are remapped to the HogQL POSITIONAL order so the mapRows below is
  // byte-identical — preserving ALL 5 $0-carrier discriminator fields (provider,
  // conversion_type, conversion_value, stripe_subscription_id, stripe_event_type) that
  // isSubscriptionCheckoutCarrier reads. #155 central-normalizes the pipe timestamp;
  // no raw new Date()/.split('T') is (re)introduced here.
  const _tbFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbTo = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _tbConv = await _pipeRead('multitouch_conversions_by_site', { site_id: String(siteId), date_from: _tbFrom, date_to: _tbTo })
  const convRows = _tbConv
    ? _tbConv.map(r => [r.uuid, r.distinct_id, r.timestamp, r.conversion_type, r.conversion_value, r.utm_source, r.utm_medium, r.utm_campaign, r.referrer, r.ai_source, r.country, r.device_type, r.utm_term, r.provider, r.attribution_status, r.stitching_method, r.ingestion_method, r.stripe_subscription_id, r.stripe_event_type])
    : await _queryHogQL(convSql, 'multitouch_conversions_live')

  const conversions = convRows.map(([uuid, distinctId, timestamp, conversionType, conversionValue, utmSource, utmMedium, utmCampaign, referrer, aiSource, country, deviceType, utmTerm, rawProvider, rawAttrStatus, rawStitchMethod, rawIngestionMethod, stripeSubscriptionId, stripeEventType]) => {
    const ingestionMethod = rawIngestionMethod || null
    const provider = rawProvider || (ingestionMethod === 'server_routed' ? 'browser' : ingestionMethod === 'offline' ? 'payments_api' : 'unknown')
    const stitchingMethod = rawStitchMethod || (ingestionMethod === 'server_routed' ? 'browser' : 'unknown')
    let attributionStatus = rawAttrStatus || null
    if (!attributionStatus) {
      if (ingestionMethod === 'server_routed') attributionStatus = 'attributed'
      else if (rawStitchMethod && rawStitchMethod !== '' && rawStitchMethod !== 'none') attributionStatus = 'attributed'
      else if (rawStitchMethod === 'none') attributionStatus = 'unattributed'
      else attributionStatus = 'unknown'
    }
    return {
      uuid,
      distinct_id: distinctId,
      timestamp,
      conversion_type: conversionType || null,
      conversion_value: Number(conversionValue) || 0,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      referrer: referrer || null,
      ai_source: aiSource || null,
      country: country || null,
      device_type: deviceType || null,
      utm_term: utmTerm || null,
      provider,
      attribution_status: attributionStatus,
      stitching_method: stitchingMethod,
      stripe_subscription_id: stripeSubscriptionId || null,
      stripe_event_type: stripeEventType || null
    }
  })

  if (conversions.length === 0) {
    return []
  }

  // 2. Fetch pageviews for lookback window
  const windowDays = attributionWindow && attributionWindow !== 'ltv' && Number(attributionWindow) > 0 ? Number(attributionWindow) : 30
  const fromIso = fromDate.match(/'([^']+)'/)[1]
  const lookbackDate = new Date(new Date(fromIso).getTime() - windowDays * 24 * 60 * 60 * 1000)
  const lookbackStr = serializeHogQLDateTime(lookbackDate)

  const getCustomKey = (dim) => dim && dim.startsWith('custom_param:') ? dim.split(':')[1] : null
  const custKey1 = getCustomKey(groupBy)
  const custKey2 = getCustomKey(groupBy2)

  const selectParts = []
  if (custKey1) selectParts.push(`properties.custom_${custKey1} AS custom_${custKey1}`)
  if (custKey2 && custKey2 !== custKey1) selectParts.push(`properties.custom_${custKey2} AS custom_${custKey2}`)
  const customPvSelect = selectParts.length > 0 ? ',\n      ' + selectParts.join(',\n      ') : ''

  const pvSql = `
    SELECT
      distinct_id,
      timestamp,
      properties.utm_source AS utm_source,
      properties.utm_medium AS utm_medium,
      properties.utm_campaign AS utm_campaign,
      properties.referrer AS referrer,
      properties.ai_source AS ai_source,
      properties.gclid AS gclid,
      properties.gbraid AS gbraid,
      properties.wbraid AS wbraid,
      properties.fbclid AS fbclid,
      properties.msclkid AS msclkid,
      properties.ttclid AS ttclid,
      properties.li_fat_id AS li_fat_id,
      properties.li_fatid AS li_fatid,
      properties.twclid AS twclid,
      properties.dclid AS dclid,
      properties.snapclid AS snapclid,
      properties.pclid AS pclid,
      properties.sccid AS sccid,
      properties.ko_click_id AS ko_click_id,
      properties.page_url AS page_url,
      properties.utm_term AS utm_term${customPvSelect}
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND event = '$pageview'
      AND timestamp >= ${lookbackStr}
      AND timestamp < ${toDate}
    ORDER BY timestamp ASC
    LIMIT 100000
  `
  // Tinybird cutover (allowlist-gated; null -> HogQL fallback via _pipeRead). This is THE fix:
  // the HogQL leg is dead, so without this every conversion fell to the :1866 "no pageviews ->
  // 100% Direct" branch and four of five models silently lied. SAME half-open window bounds the
  // HogQL pvSql uses, formatted for ClickHouse DateTime params. The pipe returns NAMED rows; map
  // them back to the EXACT positional order the destructure below reads (row[0]..row[22], custom at
  // 23/24) — a wrong key renders as garbage and fails nowhere (the field-name trap). pvSql has no
  // content filters (only site_id/event_type/window), so no filter gate is needed.
  const _mtLb = lookbackStr.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _mtTo = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
  const _mtParams = { site_id: String(siteId), date_from_ts: _mtLb, date_to_ts: _mtTo }
  if (custKey1) _mtParams.custom_key1 = `custom_${custKey1}`
  if (custKey2 && custKey2 !== custKey1) _mtParams.custom_key2 = `custom_${custKey2}`
  const _mtPv = await _pipeRead('multitouch_pageviews_live', _mtParams)
  const pvRows = _mtPv
    ? _mtPv.map(r => {
        const base = [
          r.distinct_id, r.timestamp, r.utm_source, r.utm_medium, r.utm_campaign, r.referrer, r.ai_source,
          r.gclid, r.gbraid, r.wbraid, r.fbclid, r.msclkid, r.ttclid, r.li_fat_id, r.li_fatid, r.twclid,
          r.dclid, r.snapclid, r.pclid, r.sccid, r.ko_click_id, r.page_url, r.utm_term
        ]
        if (custKey1) base.push(r.custom_key1)
        if (custKey2 && custKey2 !== custKey1) base.push(r.custom_key2)
        return base
      })
    : await _queryHogQL(pvSql, 'multitouch_pageviews_live')

  // Group pageviews by visitor distinct_id
  const pageviewsByVisitor = {}
  for (const row of pvRows) {
    const distinctId = row[0]
    const timestamp = row[1]
    const utmSource = row[2]
    const utmMedium = row[3]
    const utmCampaign = row[4]
    const referrer = row[5]
    const aiSource = row[6]
    const gclid = row[7]
    const gbraid = row[8]
    const wbraid = row[9]
    const fbclid = row[10]
    const msclkid = row[11]
    const ttclid = row[12]
    const li_fat_id = row[13]
    const li_fatid = row[14]
    const twclid = row[15]
    const dclid = row[16]
    const snapclid = row[17]
    const pclid = row[18]
    const sccid = row[19]
    const ko_click_id = row[20]
    const pageUrl = row[21]
    const utmTerm = row[22]

    const pvObj = {
      timestamp,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      referrer: referrer || null,
      ai_source: aiSource || null,
      gclid: gclid || null,
      gbraid: gbraid || null,
      wbraid: wbraid || null,
      fbclid: fbclid || null,
      msclkid: msclkid || null,
      ttclid: ttclid || null,
      li_fat_id: li_fat_id || null,
      li_fatid: li_fatid || null,
      twclid: twclid || null,
      dclid: dclid || null,
      snapclid: snapclid || null,
      pclid: pclid || null,
      sccid: sccid || null,
      ko_click_id: ko_click_id || null,
      page_url: pageUrl || null,
      utm_term: utmTerm || null,
      derived_source: (() => {
        const raw = utmSource || aiSource || (referrer ? (() => { try { return new URL(referrer).hostname.replace('www.', '') } catch (_) { return null } })() : null) || 'direct'
        return isGoogleSource(raw) ? 'google' : raw
      })()
    }

    if (custKey1) pvObj[`custom_${custKey1}`] = row[23]
    if (custKey2) pvObj[`custom_${custKey2}`] = row[custKey1 && custKey1 !== custKey2 ? 24 : 23]

    if (!pageviewsByVisitor[distinctId]) pageviewsByVisitor[distinctId] = []
    pageviewsByVisitor[distinctId].push(pvObj)
  }

  // 3. For each conversion, calculate touchpoint attribution fractions
  const aggregated = {}

  for (const conv of conversions) {
    // Phase 7: exclude the $0 subscription-checkout carrier from conversion-COUNT
    // credit (revenue is unaffected — it's already $0 on this row). This is a
    // COUNT-only exclusion; the carrier's touchpoints/pageviews are untouched, and
    // this loop has no write path of its own (no Supabase write here at all).
    if (isSubscriptionCheckoutCarrier(conv)) continue

    const visitorPvs = pageviewsByVisitor[conv.distinct_id] || []

    // Filter pageviews within the window
    const conversionTime = new Date(conv.timestamp).getTime()
    const windowMs = windowDays * 24 * 60 * 60 * 1000
    const touchpoints = visitorPvs.filter(pv => {
      const pvTime = new Date(pv.timestamp).getTime()
      return pvTime <= conversionTime && pvTime >= conversionTime - windowMs
    })

    const attribution = calculateAttribution(touchpoints, conv.conversion_value)

    // Choose model attribution array
    let shares = []
    if (model === 'linear') shares = attribution.linear
    else if (model === 'u_shaped') shares = attribution.u_shaped
    else if (model === 'time_decay') shares = attribution.time_decay
    else if (model === 'w_shaped') shares = attribution.w_shaped

    // If conversion has no pageviews, attribute it 100% to Direct
    if (!shares || shares.length === 0) {
      shares = [{
        source: 'direct',
        medium: 'none',
        campaign: null,
        channel: 'Direct',
        timestamp: conv.timestamp,
        fraction: 1.0,
        attributed_value: conv.conversion_value
      }]
    }

    // Apply attribution allocations
    for (const share of shares) {
      let dimVal = 'direct'
      if (groupBy.startsWith('custom_param:')) {
        const key = groupBy.split(':')[1]
        dimVal = share[`custom_${key}`] || 'unknown'
      }
      else if (groupBy === 'source') dimVal = share.source || 'direct'
      else if (groupBy === 'medium') dimVal = share.medium || 'none'
      else if (groupBy === 'campaign') dimVal = share.campaign || 'none'
      else if (groupBy === 'keyword') dimVal = share.keyword || share.utm_term || 'unknown'
      else if (groupBy === 'referrer_domain') dimVal = share.referrer_domain || 'direct'
      else if (groupBy === 'channel') dimVal = share.channel || 'Direct'
      else if (groupBy === 'landing_page') {
        dimVal = share.page_url ? (() => { try { return new URL(share.page_url).pathname } catch (_) { return '/' } })() : '/'
      } else if (groupBy === 'country') dimVal = conv.country || 'unknown'
      else if (groupBy === 'device') dimVal = conv.device_type || 'unknown'
      else if (groupBy === 'conversion_type') dimVal = conv.conversion_type || 'untyped'
      else if (groupBy === 'provider') dimVal = conv.provider || 'unknown'
      else if (groupBy === 'attribution_status') dimVal = conv.attribution_status || 'unknown'
      else if (groupBy === 'stitching_method') dimVal = conv.stitching_method || 'unknown'
      else if (groupBy === 'date') {
        const refDate = new Date(attributeBy === 'first_seen_date' && touchpoints[0] ? touchpoints[0].timestamp : conv.timestamp)
        if (granularity === 'quarter') {
          const q = Math.floor(refDate.getUTCMonth() / 3) + 1
          dimVal = `${refDate.getUTCFullYear()}-Q${q}`
        } else if (granularity === 'month') {
          dimVal = refDate.toISOString().slice(0, 7)
        } else {
          dimVal = refDate.toISOString().slice(0, 10)
        }
      }

      // Apply UTM filters if present
      if (filters.source && share.source !== filters.source) continue
      if (filters.medium && share.medium !== filters.medium) continue
      if (filters.campaign && share.campaign !== filters.campaign) continue
      if (filters.country && conv.country !== filters.country) continue
      if (filters.device_type && conv.device_type !== filters.device_type) continue
      if (filters.conversion_type && conv.conversion_type !== filters.conversion_type) continue

      if (!aggregated[dimVal]) {
        aggregated[dimVal] = { revenue: 0, conversions: 0 }
      }

      // Metric calculations
      const shareVal = Number(share.attributed_value) || 0
      const shareFrac = Number(share.fraction) || 0

      if (metric === 'revenue' || metric === 'avg_conversion_value' || metric === 'ltv_revenue') {
        aggregated[dimVal].revenue += shareVal
        aggregated[dimVal].conversions += shareFrac
      } else if (metric === 'conversions') {
        aggregated[dimVal].conversions += shareFrac
      } else if (metric === 'sessions') {
        aggregated[dimVal].conversions += shareFrac
      } else {
        aggregated[dimVal].revenue += shareVal
        aggregated[dimVal].conversions += shareFrac
      }
    }
  }

  // Format results to match expected flexible report schema
  const results = Object.entries(aggregated).map(([dim_value, stats]) => {
    const item = {
      dim_value: dim_value || 'unknown',
      revenue: parseFloat(stats.revenue.toFixed(2)),
      conversions: parseFloat(stats.conversions.toFixed(2))
    }
    // Also inject specific metric key to match getFlexibleReport's custom keys
    if (metric !== 'revenue' && metric !== 'conversions') {
      item[metric] = metric === 'avg_conversion_value'
        ? stats.conversions > 0 ? parseFloat((stats.revenue / stats.conversions).toFixed(2)) : 0
        : parseFloat(stats.conversions.toFixed(2))
    }
    return item
  })

  return results.sort((a, b) => b.revenue - a.revenue)
}

// Test/harness seam: evict the exact getFlexibleReport cache entry so the A/B parity harness
// recomputes each leg (mirrors __evictSessionReportCache). Key reconstruction MUST match below.
export function __evictFlexibleReportCache (siteId, model, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null, granularity = 'day', attributionWindow = null, attributeBy = 'conversion_date') {
  const filterKey = JSON.stringify(filters) + groupBy2 + granularity + attributionWindow + attributeBy
  cache.del(cacheKey(`${model}:${groupBy}:${metric}:${filterKey}`, siteId, dateFrom, dateTo))
}

export async function getFlexibleReport(siteId, model, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null, granularity = 'day', attributionWindow = null, attributeBy = 'conversion_date') {
  const filterKey = JSON.stringify(filters) + groupBy2 + granularity + attributionWindow + attributeBy
  const key = cacheKey(`${model}:${groupBy}:${metric}:${filterKey}`, siteId, dateFrom, dateTo)
  const cached = cache.get(key)
  if (cached) return cached

  // Intercept linear/advanced multi-touch models and process using safe JS pipeline
  const MULTI_TOUCH = new Set(['linear', 'time_decay', 'u_shaped', 'w_shaped'])
  if (MULTI_TOUCH.has(model)) {
    const results = await getMultiTouchAttributionLive({
      siteId,
      model,
      dateFrom,
      dateTo,
      groupBy,
      metric,
      filters,
      groupBy2,
      granularity,
      attributionWindow,
      attributeBy
    })
    const merged = mergeGoogleResults(results, groupBy, groupBy2, metric)
    const isTruncated = merged.length >= 50000
    const returnValue = isTruncated
      ? { results: merged, truncated: true, truncated_at: 50000 }
      : merged

    cache.set(key, returnValue)
    return returnValue
  }

  if (model === 'ai_platforms') {
    const results = await getAiPlatformAttributionLive({
      siteId,
      dateFrom,
      dateTo,
      groupBy,
      metric,
      filters,
      groupBy2,
      granularity,
      attributionWindow,
      attributeBy
    })
    const merged = mergeGoogleResults(results, groupBy, groupBy2, metric)
    const isTruncated = merged.length >= 50000
    const returnValue = isTruncated
      ? { results: merged, truncated: true, truncated_at: 50000 }
      : merged

    cache.set(key, returnValue)
    return returnValue
  }

  const { from: fromDate, to: toDate } = serializeHogQLDateRange(dateFrom, dateTo)
  const safeSite = esc(siteId)
  const tz = filters.timezone || 'UTC'

  // Linear attribution: legacy, dead code kept for safety / documentation
  if (model === 'linear') {
    const sql = `
    SELECT
      dim_value,
      sum(fractional_revenue) AS revenue,
      sum(fractional_conversions) AS conversions,
      count() AS touchpoints
    FROM (
      SELECT
        ${groupBy === 'channel' ? `CASE
          WHEN pv.properties.utm_medium IN ('cpc','ppc','paid','paid_search','paidsearch') THEN 'Paid Search'
          WHEN pv.properties.utm_medium IN ('paid_social','paidsocial') OR pv.properties.utm_source IN ('facebook','instagram','linkedin','twitter','tiktok') THEN 'Paid Social'
          WHEN pv.properties.utm_medium = 'email' OR pv.properties.utm_source = 'email' THEN 'Email'
          WHEN pv.properties.utm_medium IN ('affiliate','partner') THEN 'Affiliate'
          WHEN pv.properties.utm_source IS NOT NULL AND pv.properties.utm_source != '' THEN 'Organic Search'
          ELSE 'Direct'
        END` : `COALESCE(NULLIF(toString(pv.properties.utm_source), ''), 'direct')`} AS dim_value,
        toFloatOrZero(toString(cv.properties.conversion_value)) / touch_counts.touch_count AS fractional_revenue,
        1 / touch_counts.touch_count AS fractional_conversions
      FROM events cv
      INNER JOIN (
        SELECT
          cv_inner.uuid AS conversion_uuid,
          count() AS touch_count
        FROM events cv_inner
        INNER JOIN events pv_inner
          ON pv_inner.distinct_id = cv_inner.distinct_id
          AND pv_inner.properties.site_id = cv_inner.properties.site_id
          AND pv_inner.event = '$pageview'
          AND pv_inner.timestamp <= cv_inner.timestamp
          AND pv_inner.properties.utm_source IS NOT NULL
          AND pv_inner.properties.utm_source != ''
        WHERE cv_inner.properties.site_id = '${safeSite}'
          AND cv_inner.event = '$conversion'
          AND cv_inner.timestamp >= ${fromDate}
          AND cv_inner.timestamp < ${toDate}
        GROUP BY cv_inner.uuid
        HAVING touch_count > 0
      ) touch_counts ON touch_counts.conversion_uuid = cv.uuid
      INNER JOIN events pv
        ON pv.distinct_id = cv.distinct_id
        AND pv.properties.site_id = cv.properties.site_id
        AND pv.event = '$pageview'
        AND pv.timestamp <= cv.timestamp
        AND pv.properties.utm_source IS NOT NULL
        AND pv.properties.utm_source != ''
      WHERE cv.properties.site_id = '${safeSite}'
        AND cv.event = '$conversion'
        AND cv.timestamp >= ${fromDate}
        AND cv.timestamp < ${toDate}
    )
    GROUP BY dim_value
    ORDER BY revenue DESC
    LIMIT 50000
  `

    const rows = await queryHogQL(sql, 'flexible_report_linear')
    const results = rows.map(([dimValue, revenue, conversions, touchpoints]) => ({
      dim_value: dimValue || 'unknown',
      revenue: Number(revenue) || 0,
      conversions: Number(conversions) || 0,
      touchpoints: Number(touchpoints) || 0
    }))

    const merged = mergeGoogleResults(results, groupBy, groupBy2, 'revenue')
    const isTruncated = rows.length >= 50000
    const returnValue = isTruncated
      ? { results: merged, truncated: true, truncated_at: 50000 }
      : merged

    cache.set(key, returnValue)
    return returnValue
  }

  // Days to Convert: average days between first UTM-tagged pageview and conversion.
  // Excludes conversions with zero eligible UTM touchpoints.
  // Group by first-touch source only. attributionWindow and groupBy2 not supported.
  if (metric === 'days_to_convert') {
    const sql = `
    SELECT
      dim_value,
      round(avg(days_gap), 1) AS days_to_convert,
      count() AS conversions
    FROM (
      SELECT
        cv.uuid AS conversion_uuid,
        argMin(COALESCE(NULLIF(toString(pv.utm_source), ''), 'direct'), pv.timestamp) AS dim_value,
        dateDiff('day', min(pv.timestamp), cv.timestamp) AS days_gap
      FROM (
        SELECT uuid, distinct_id, timestamp
        FROM events
        WHERE properties.site_id = '${safeSite}'
          AND event = '$conversion'
          AND timestamp >= ${fromDate}
          AND timestamp < ${toDate}
      ) cv
      INNER JOIN (
        SELECT distinct_id, timestamp, properties.utm_source AS utm_source
        FROM events
        WHERE properties.site_id = '${safeSite}'
          AND event = '$pageview'
          AND properties.utm_source IS NOT NULL
          AND properties.utm_source != ''
      ) pv
        ON pv.distinct_id = cv.distinct_id
        AND pv.timestamp <= cv.timestamp
      GROUP BY cv.uuid, cv.timestamp
      HAVING days_gap >= 0
    )
    GROUP BY dim_value
    HAVING conversions > 0
    ORDER BY days_to_convert ASC
    LIMIT 50000
  `

    // Pipe-first (allowlist-gated, HogQL fallback via _pipeRead, mirrors :2852). The
    // days_to_convert branch ALWAYS groups by first-touch source with no groupBy2/window/
    // filters, so the pipe covers it unconditionally. Pipe named {dim_value,days_to_convert,
    // conversions} -> the positional [dim,metric,conversions] the consumer destructures.
    // Same +1-day-exclusive UTC bounds serializeHogQLDateRange gave the HogQL `sql`.
    const _dtcFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
    const _dtcTo = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
    const _dtcTb = await _pipeRead('flexible_report_days_to_convert_by_site', { site_id: String(siteId), date_from: _dtcFrom, date_to: _dtcTo })
    const rows = _dtcTb ? _dtcTb.map(r => [r.dim_value, r.days_to_convert, r.conversions]) : await _queryHogQL(sql, 'flexible_report_days_to_convert')
    const results = rows.map(([dimValue, daysToConvert, conversions]) => ({
      dim_value: dimValue || 'unknown',
      days_to_convert: Number(daysToConvert) || 0,
      conversions: Number(conversions) || 0
    }))

    const merged = mergeGoogleResults(results, groupBy, groupBy2, 'days_to_convert')
    const isTruncated = rows.length >= 50000
    const returnValue = isTruncated
      ? { results: merged, truncated: true, truncated_at: 50000 }
      : merged

    cache.set(key, returnValue)
    return returnValue
  }

  // Touchpoints per Conversion: average pageview touchpoints preceding each conversion.
  // Does not require UTM source on touchpoints (counts all pageviews).
  // Group by first-touch source only. attributionWindow and groupBy2 not supported.
  if (metric === 'touchpoints_per_conversion') {
    const sql = `
    SELECT
      dim_value,
      round(avg(touch_count), 1) AS touchpoints_per_conversion,
      count() AS conversions
    FROM (
      SELECT
        cv.uuid AS conversion_uuid,
        COALESCE(
          argMinIf(toString(pv.utm_source), pv.timestamp, pv.utm_source IS NOT NULL AND pv.utm_source != ''),
          NULLIF(toString(cv.utm_source), ''),
          'direct'
        ) AS dim_value,
        countIf(pv.event = '$pageview') AS touch_count
      FROM (
        SELECT uuid, distinct_id, timestamp, properties.utm_source AS utm_source
        FROM events
        WHERE properties.site_id = '${safeSite}'
          AND event = '$conversion'
          AND timestamp >= ${fromDate}
          AND timestamp < ${toDate}
      ) cv
      INNER JOIN (
        SELECT distinct_id, timestamp, event, properties.utm_source AS utm_source
        FROM events
        WHERE properties.site_id = '${safeSite}'
      ) pv
        ON pv.distinct_id = cv.distinct_id
        AND pv.timestamp <= cv.timestamp
      GROUP BY cv.uuid, cv.utm_source
      HAVING touch_count > 0
    )
    GROUP BY dim_value
    HAVING conversions > 0
    ORDER BY touchpoints_per_conversion DESC
    LIMIT 50000
  `

    // Pipe-first (allowlist-gated, HogQL fallback via _pipeRead, mirrors :2852). Like
    // days_to_convert, this branch always groups by first-touch source with no groupBy2/
    // window/filters, so the pipe covers it unconditionally. Pipe named {dim_value,
    // touchpoints_per_conversion,conversions} -> the positional shape the consumer reads.
    const _tpcFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
    const _tpcTo = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
    const _tpcTb = await _pipeRead('flexible_report_touchpoints_per_conversion_by_site', { site_id: String(siteId), date_from: _tpcFrom, date_to: _tpcTo })
    const rows = _tpcTb ? _tpcTb.map(r => [r.dim_value, r.touchpoints_per_conversion, r.conversions]) : await _queryHogQL(sql, 'flexible_report_touchpoints_per_conversion')
    const results = rows.map(([dimValue, touchpointsPerConversion, conversions]) => ({
      dim_value: dimValue || 'unknown',
      touchpoints_per_conversion: Number(touchpointsPerConversion) || 0,
      conversions: Number(conversions) || 0
    }))

    const merged = mergeGoogleResults(results, groupBy, groupBy2, 'touchpoints_per_conversion')
    const isTruncated = rows.length >= 50000
    const returnValue = isTruncated
      ? { results: merged, truncated: true, truncated_at: 50000 }
      : merged

    cache.set(key, returnValue)
    return returnValue
  }

  // Determine reference timestamp and optional JOIN for non-conversion_date attribution
  let refTs = 'timestamp'
  let refJoin = ''
  const needsAltDate = (groupBy === 'date' || groupBy2 === 'date') &&
    (attributeBy === 'first_seen_date' || attributeBy === 'original_source_date')

  if (needsAltDate) {
    if (attributeBy === 'first_seen_date') {
      refJoin = `
    INNER JOIN (
      SELECT distinct_id AS distinct_id, MIN(timestamp) AS ref_ts
      FROM events
      WHERE properties.site_id = '${safeSite}'
      GROUP BY distinct_id
    ) _ref ON events.distinct_id = _ref.distinct_id`
      refTs = '_ref.ref_ts'
    } else if (attributeBy === 'original_source_date') {
      // Original source date: first timestamp where UTM source was present.
      // Visitors with no UTM source in any event are excluded from results
      // (truthful exclusion — cannot attribute to an original source that doesn't exist).
      refJoin = `
    INNER JOIN (
      SELECT distinct_id AS distinct_id, MIN(timestamp) AS ref_ts
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND properties.utm_source IS NOT NULL
        AND properties.utm_source != ''
      GROUP BY distinct_id
    ) _ref ON events.distinct_id = _ref.distinct_id`
      refTs = '_ref.ref_ts'
    }
  }

  // Non-direct attribution models: LEFT JOIN that finds the first/last qualifying non-direct
  // pageview for each distinct_id. When no qualifying touchpoint exists, _nd.* columns are
  // NULL and the COALESCE in GROUP_COLUMNS falls back to the conversion event's own
  // first_touch/last_touch properties. This preserves model-parity totals.
  let qualifyingJoin = ''
  if (model === 'first_touch_non_direct' || model === 'last_touch_non_direct') {
    const ndAggFn = model === 'first_touch_non_direct' ? 'argMin' : 'argMax'
    qualifyingJoin = `
    LEFT JOIN (
      SELECT distinct_id AS distinct_id,
        ${ndAggFn}(properties.utm_source, timestamp) AS nd_source,
        ${ndAggFn}(properties.utm_medium, timestamp) AS nd_medium,
        ${ndAggFn}(properties.utm_campaign, timestamp) AS nd_campaign,
        ${ndAggFn}(properties.utm_term, timestamp) AS nd_term
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND properties.utm_source IS NOT NULL
        AND properties.utm_source != ''
        AND properties.utm_source != 'direct'
      GROUP BY distinct_id
    ) _nd ON events.distinct_id = _nd.distinct_id`
  }

  const getCustomKey = (dim) => dim && dim.startsWith('custom_param:') ? dim.split(':')[1] : null
  const custKey1 = getCustomKey(groupBy)
  const custKey2 = getCustomKey(groupBy2)

  let customJoin = ''
  if (custKey1 || custKey2) {
    const selectParts = []
    if (custKey1) {
      selectParts.push(`argMin(properties.custom_${custKey1}, timestamp) AS first_cust_${custKey1}`)
      selectParts.push(`argMax(properties.custom_${custKey1}, timestamp) AS last_cust_${custKey1}`)
    }
    if (custKey2 && custKey2 !== custKey1) {
      selectParts.push(`argMin(properties.custom_${custKey2}, timestamp) AS first_cust_${custKey2}`)
      selectParts.push(`argMax(properties.custom_${custKey2}, timestamp) AS last_cust_${custKey2}`)
    }
    customJoin = `
    LEFT JOIN (
      SELECT distinct_id AS distinct_id,
        ${selectParts.join(',\n        ')}
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
      GROUP BY distinct_id
    ) _cust ON events.distinct_id = _cust.distinct_id`
  }

  let dimExpr = null
  if (custKey1) {
    if (metric === 'sessions') {
      dimExpr = `COALESCE(NULLIF(properties.custom_${custKey1}, ''), 'unknown')`
    } else {
      const prefix = (model === 'first_touch' || model === 'first_touch_non_direct') ? 'first' : 'last'
      dimExpr = `COALESCE(NULLIF(_cust.${prefix}_cust_${custKey1}, ''), 'unknown')`
    }
  } else {
    dimExpr = groupBy === 'date'
      ? granularity === 'quarter'
        ? `concat(toString(toYear(${refTs})), '-Q', toString(toQuarter(${refTs})))`
        : `formatDateTime(${refTs}, ${GRANULARITY_MAP[granularity] || GRANULARITY_MAP.day})`
      : GROUP_COLUMNS[groupBy]?.[model]
  }

  if (!dimExpr) {
    throw new Error(`Unsupported group_by: ${groupBy} for model: ${model}`)
  }

  let dim2Expr = null
  if (groupBy2) {
    if (custKey2) {
      if (metric === 'sessions') {
        dim2Expr = `COALESCE(NULLIF(properties.custom_${custKey2}, ''), 'unknown')`
      } else {
        const prefix = (model === 'first_touch' || model === 'first_touch_non_direct') ? 'first' : 'last'
        dim2Expr = `COALESCE(NULLIF(_cust.${prefix}_cust_${custKey2}, ''), 'unknown')`
      }
    } else {
      dim2Expr = groupBy2 === 'date'
        ? granularity === 'quarter'
          ? `concat(toString(toYear(${refTs})), '-Q', toString(toQuarter(${refTs})))`
          : `formatDateTime(${refTs}, ${GRANULARITY_MAP[granularity] || GRANULARITY_MAP.day})`
        : GROUP_COLUMNS[groupBy2]?.[model]
    }
    if (!dim2Expr) {
      throw new Error(`Unsupported group_by2: ${groupBy2} for model: ${model}`)
    }
  }

  let metricCol, metricLabel, eventFilter, extraSelect, isLTVRevenue = false

  switch (metric) {
    case 'revenue':
      metricCol = `SUM(toFloatOrZero(toString(properties.conversion_value)))`
      metricLabel = 'revenue'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'conversions':
      metricCol = 'count()'
      metricLabel = 'conversions'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'sessions':
      metricCol = 'count(DISTINCT distinct_id)'
      metricLabel = 'sessions'
      eventFilter = "AND event = '$pageview'"
      extraSelect = ''
      break
    case 'leads':
      metricCol = 'count()'
      metricLabel = 'leads'
      const leadTypeList = LEAD_TYPES.map(t => `'${esc(t)}'`).join(', ')
      eventFilter = `AND event = '$conversion' AND lower(COALESCE(toString(properties.conversion_type), '')) IN (${leadTypeList})`
      extraSelect = ''
      break
    case 'conversion_rate':
      metricCol = 'count()'
      metricLabel = 'conversion_rate'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'avg_conversion_value':
      metricCol = `AVG(toFloatOrZero(toString(properties.conversion_value)))`
      metricLabel = 'avg_conversion_value'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'ai_conversions':
      metricCol = 'count()'
      metricLabel = 'ai_conversions'
      eventFilter = "AND event = '$conversion' AND properties.ai_source IS NOT NULL AND properties.ai_source != ''"
      extraSelect = ''
      break
    case 'ai_revenue':
      metricCol = `SUM(toFloatOrZero(toString(properties.conversion_value)))`
      metricLabel = 'ai_revenue'
      eventFilter = "AND event = '$conversion' AND properties.ai_source IS NOT NULL AND properties.ai_source != ''"
      extraSelect = ''
      break
    case 'ai_conversion_share':
      metricCol = 'count()'
      metricLabel = 'ai_conversion_share'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'ai_revenue_share':
      metricCol = `SUM(toFloatOrZero(toString(properties.conversion_value)))`
      metricLabel = 'ai_revenue_share'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'ltv_revenue':
      isLTVRevenue = true
      metricLabel = 'ltv_revenue'
      break
    case 'session_count':
    case 'avg_session_duration':
    case 'pages_per_session':
    case 'conversion_sessions':
      // Session metrics are derived on read from pageview events.
      // They bypass the standard attribution SQL path and use getSessionReport.
      return getSessionReport(siteId, dateFrom, dateTo, groupBy, metric, filters, groupBy2)
    default:
      throw new Error(`Unknown metric: ${metric}`)
  }

  // Deduplicate conversions by external_event_id before grouping/aggregating in ClickHouse
  if (eventFilter && eventFilter.includes("event = '$conversion'")) {
    eventFilter += ` AND (
      properties.external_event_id IS NULL
      OR toString(properties.external_event_id) = ''
      OR uuid IN (
        SELECT argMin(uuid, timestamp)
        FROM events
        WHERE properties.site_id = '${safeSite}'
          AND event = '$conversion'
          AND properties.external_event_id IS NOT NULL
          AND toString(properties.external_event_id) != ''
        GROUP BY properties.external_event_id
      )
    )`
  }

  // Attribution window: when set on a touchpoint model, only credit pageview touchpoints
  // that occurred within N days before each conversion. If no qualifying touchpoint exists
  // inside the window, the conversion falls back to 'direct'.
  const hasAttributionWindow =
    attributionWindow &&
    attributionWindow !== 'ltv' &&
    Number(attributionWindow) > 0

  const windowDays = hasAttributionWindow ? Number(attributionWindow) : null

  const isTouchModel = model === 'first_touch' || model === 'last_touch' || model === 'first_touch_non_direct' || model === 'last_touch_non_direct'

  // Windowed attribution: find the qualifying pageview touchpoint within N days of each conversion.
  //
  // KNOWN RESIDUAL: both self-join sides below are pre-filtered into subqueries
  // (site_id/event scoped inside each, before the join) — this fixed a 504 query
  // timeout that a direct self-join on the raw `events` table hit on EVERY prior
  // attempt, at any data volume, regardless of where the timestamp inequality
  // lived (confirmed empirically: even a pure-equality self-join with zero
  // inequality conditions timed out identically). That fix is not a 100%
  // guarantee, though: verification ran this exact query shape 21 times across
  // 4 real sites, 9 date ranges, and 3 window values (7/30/90d) — 20/21 passed
  // (188ms-4,487ms) and 1/21 hit the same 504 (~10.9s, at PostHog's own timeout
  // ceiling). That one failure was the FIRST invocation of this exact query
  // shape immediately after this code shipped — zero prior compiles anywhere.
  // It did NOT reproduce on a dedicated test after a genuine 3-minute real-time
  // pause (first call in that batch: 4,219ms; every call after: <300ms) — so
  // the residual risk looks like a one-time first-compile cost (PostHog/
  // ClickHouse warming up a query plan it hasn't seen before), not a per-request
  // risk that recurs under load or over time. Net: a real user could see this
  // metric silently return `analytics_unavailable: true` (swallowed by
  // api/routes/attribution.js's catch block, HTTP 200) on the very first
  // request against this query shape after a fresh deploy, before any request
  // has warmed it — accepted as a known, bounded, documented risk rather than
  // fixed further. If this ever needs closing, the candidate mitigation is a
  // single fire-and-forget warm-up call at service boot (see founder review).
  let windowJoin = ''
  let windowedDimExpr = null
  let windowedDim2Expr = null

  if (isTouchModel && hasAttributionWindow) {
    const aggFn = (model === 'first_touch' || model === 'first_touch_non_direct') ? 'argMin' : 'argMax'
    const ndFilter = (model === 'first_touch_non_direct' || model === 'last_touch_non_direct')
      ? `\n          AND properties.utm_source != 'direct'`
      : ''

    windowJoin = `
    LEFT JOIN (
      SELECT
        cv.uuid AS _win_uuid,
        ${aggFn}If(_pv.utm_source, _pv.timestamp,
          _pv.timestamp >= cv.timestamp - INTERVAL ${windowDays} DAY
          AND _pv.timestamp <= cv.timestamp) AS _w_source,
        ${aggFn}If(_pv.utm_medium, _pv.timestamp,
          _pv.timestamp >= cv.timestamp - INTERVAL ${windowDays} DAY
          AND _pv.timestamp <= cv.timestamp) AS _w_medium,
        ${aggFn}If(_pv.utm_campaign, _pv.timestamp,
          _pv.timestamp >= cv.timestamp - INTERVAL ${windowDays} DAY
          AND _pv.timestamp <= cv.timestamp) AS _w_campaign,
        ${aggFn}If(_pv.utm_term, _pv.timestamp,
          _pv.timestamp >= cv.timestamp - INTERVAL ${windowDays} DAY
          AND _pv.timestamp <= cv.timestamp) AS _w_term,
        ${aggFn}If(_pv.referrer, _pv.timestamp,
          _pv.timestamp >= cv.timestamp - INTERVAL ${windowDays} DAY
          AND _pv.timestamp <= cv.timestamp) AS _w_referrer
      FROM (
        SELECT uuid, distinct_id, timestamp
        FROM events
        WHERE properties.site_id = '${safeSite}'
          AND event = '$conversion'
          AND timestamp >= ${fromDate}
          AND timestamp < ${toDate}
      ) cv
      LEFT JOIN (
        SELECT
          distinct_id, timestamp,
          properties.utm_source AS utm_source,
          properties.utm_medium AS utm_medium,
          properties.utm_campaign AS utm_campaign,
          properties.utm_term AS utm_term,
          properties.referrer AS referrer
        FROM events
        WHERE properties.site_id = '${safeSite}'
          AND event = '$pageview'
          AND properties.utm_source IS NOT NULL
          AND properties.utm_source != ''${ndFilter}
          -- (c)-safe scan reduction: a qualifying touchpoint must be within windowDays BEFORE an
          -- in-window conversion (cv.timestamp in [fromDate, toDate)), so a pageview outside
          -- [fromDate - windowDays, toDate) can NEVER be within N days of any conversion in the set
          -- -> pruning it cannot change any argMaxIf result. Cuts the full-pageview-history scan.
          -- (Only the inherently-windowed _win join; _nd is an ALL-TIME lookback and is deliberately
          -- NOT bounded — date-bounding it would change non-direct attribution for no-window requests.)
          AND timestamp >= ${fromDate} - INTERVAL ${windowDays} DAY
          AND timestamp < ${toDate}
      ) AS _pv
        ON _pv.distinct_id = cv.distinct_id
      GROUP BY cv.uuid
    ) _win ON events.uuid = _win._win_uuid`

    if (groupBy === 'source' || groupBy === 'medium' || groupBy === 'campaign' || groupBy === 'keyword' || groupBy === 'referrer_domain') {
      windowedDimExpr = groupBy === 'source'
        ? "COALESCE(NULLIF(_win._w_source, ''), 'direct')"
        : groupBy === 'medium'
          ? "COALESCE(NULLIF(_win._w_medium, ''), 'none')"
          : groupBy === 'keyword'
            ? "COALESCE(NULLIF(_win._w_term, ''), 'unknown')"
            : groupBy === 'referrer_domain'
              ? makeReferrerDomainExpr('_win._w_referrer')
              : '_win._w_campaign'
    }

    if (groupBy2 === 'source' || groupBy2 === 'medium' || groupBy2 === 'campaign' || groupBy2 === 'keyword' || groupBy2 === 'referrer_domain') {
      windowedDim2Expr = groupBy2 === 'source'
        ? "COALESCE(NULLIF(_win._w_source, ''), 'direct')"
        : groupBy2 === 'medium'
          ? "COALESCE(NULLIF(_win._w_medium, ''), 'none')"
          : groupBy2 === 'keyword'
            ? "COALESCE(NULLIF(_win._w_term, ''), 'unknown')"
            : groupBy2 === 'referrer_domain'
              ? makeReferrerDomainExpr('_win._w_referrer')
              : '_win._w_campaign'
    }
  }

  const effectiveDimExpr = windowedDimExpr || dimExpr
  const effectiveDim2Expr = windowedDim2Expr || dim2Expr

  const orderClause = groupBy === 'date' ? 'ORDER BY dim_value ASC' : 'ORDER BY metric_value DESC'

  let havingClause = ''
  if (filters.min_conversions) {
    havingClause = `\n    HAVING metric_value >= ${Number(filters.min_conversions)}`
  }

  let filterClauses = ''
  if (filters.source) {
    filterClauses += `\n    AND properties.utm_source = '${esc(filters.source)}'`
  }
  if (filters.medium) {
    filterClauses += `\n    AND properties.utm_medium = '${esc(filters.medium)}'`
  }
  if (filters.campaign) {
    filterClauses += `\n    AND properties.utm_campaign = '${esc(filters.campaign)}'`
  }
  if (filters.ai_source) {
    filterClauses += `\n    AND properties.ai_source = '${esc(filters.ai_source)}'`
  }
  if (filters.country) {
    filterClauses += `\n    AND properties.country = '${esc(filters.country)}'`
  }
  if (filters.device_type) {
    filterClauses += `\n    AND properties.device_type = '${esc(filters.device_type)}'`
  }
  if (filters.is_conversion === 'true') {
    filterClauses += `\n    AND properties.is_conversion = true`
  }
  if (filters.conversion_type) {
    filterClauses += `\n    AND properties.conversion_type = '${esc(filters.conversion_type)}'`
  }
  if (filters.has_ai_source === 'true') {
    filterClauses += `\n    AND properties.ai_source IS NOT NULL AND properties.ai_source != ''`
  }
  if (filters.has_ai_source === 'false') {
    filterClauses += `\n    AND (properties.ai_source IS NULL OR properties.ai_source = '')`
  }

  // LTV v1: per-distinct_id revenue aggregation with single-touch attribution.
  // Supports all single-touch models: first_touch, last_touch, first_touch_non_direct,
  // last_touch_non_direct. Non-direct models LEFT JOIN qualifying pageviews to find
  // the attributed source per distinct_id, then sum all conversions for that customer.
  // UUID exclusion: anonymous-only visitors whose distinct_id matches the UUIDv4 format
  // (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) are excluded. These visitors never completed
  // identification via $identify / ph.alias() and cannot be reliably stitched across
  // sessions or devices. This is the same heuristic used in LeadDetail.jsx.
  if (isLTVRevenue) {
    const isNonDirect = model === 'first_touch_non_direct' || model === 'last_touch_non_direct'
    const ndAggFn = model === 'first_touch_non_direct' ? 'argMin' : 'argMax'

    function ltvPersonDimExpr(gb, md) {
      if (gb.startsWith('custom_param:')) {
        const key = gb.split(':')[1]
        const prefix = (md === 'first_touch' || md === 'first_touch_non_direct') ? 'first' : 'last'
        return `any(COALESCE(NULLIF(_cust.${prefix}_cust_${key}, ''), 'unknown'))`
      }

      if (gb === 'date') {
        return granularity === 'quarter'
          ? `concat(toString(toYear(MAX(timestamp))), '-Q', toString(toQuarter(MAX(timestamp))))`
          : `formatDateTime(MAX(timestamp), ${GRANULARITY_MAP[granularity] || GRANULARITY_MAP.day})`
      }

      if (md === 'first_touch') {
        switch (gb) {
          case 'source': return "any(COALESCE(NULLIF(properties.first_touch_source, ''), 'direct'))"
          case 'medium': return "any(COALESCE(NULLIF(properties.first_touch_medium, ''), 'none'))"
          case 'campaign': return 'any(properties.first_touch_campaign)'
          case 'keyword': return "any(COALESCE(NULLIF(properties.utm_term, ''), 'unknown'))"
          case 'referrer_domain': return `any(${makeReferrerDomainExpr('properties.referrer')})`
          case 'ai_source': return "any(COALESCE(NULLIF(properties.ai_source, ''), 'none'))"
          case 'landing_page': return "argMin(COALESCE(NULLIF(properties.page_url, ''), '/'), timestamp)"
          case 'country': return "any(COALESCE(NULLIF(properties.country, ''), 'unknown'))"
          case 'device': return "any(COALESCE(NULLIF(properties.device_type, ''), 'unknown'))"
          case 'provider': return `any(${PROVIDER_SQL})`
          case 'attribution_status': return `any(${ATTRIBUTION_STATUS_SQL})`
          case 'stitching_method': return `any(${STITCHING_METHOD_SQL})`
          default: throw new Error(`Unsupported group_by for LTV first_touch: ${gb}`)
        }
      }

      if (md === 'first_touch_non_direct') {
        switch (gb) {
          case 'source': return "COALESCE(NULLIF(any(_nd.nd_source), ''), COALESCE(NULLIF(any(properties.first_touch_source), ''), 'direct'))"
          case 'medium': return "COALESCE(NULLIF(any(_nd.nd_medium), ''), COALESCE(NULLIF(any(properties.first_touch_medium), ''), 'none'))"
          case 'campaign': return "COALESCE(NULLIF(any(_nd.nd_campaign), ''), any(properties.first_touch_campaign))"
          case 'keyword': return "COALESCE(NULLIF(any(_nd.nd_term), ''), any(COALESCE(NULLIF(properties.utm_term, ''), 'unknown')))"
          case 'referrer_domain': return `any(${makeReferrerDomainExpr('properties.referrer')})`
          case 'ai_source': return "any(COALESCE(NULLIF(properties.ai_source, ''), 'none'))"
          case 'landing_page': return "argMin(COALESCE(NULLIF(properties.page_url, ''), '/'), timestamp)"
          case 'country': return "any(COALESCE(NULLIF(properties.country, ''), 'unknown'))"
          case 'device': return "any(COALESCE(NULLIF(properties.device_type, ''), 'unknown'))"
          case 'provider': return `any(${PROVIDER_SQL})`
          case 'attribution_status': return `any(${ATTRIBUTION_STATUS_SQL})`
          case 'stitching_method': return `any(${STITCHING_METHOD_SQL})`
          default: throw new Error(`Unsupported group_by for LTV first_touch_non_direct: ${gb}`)
        }
      }

      if (md === 'last_touch_non_direct') {
        switch (gb) {
          case 'source': return "COALESCE(NULLIF(any(_nd.nd_source), ''), COALESCE(NULLIF(argMax(properties.utm_source, timestamp), ''), 'direct'))"
          case 'medium': return "COALESCE(NULLIF(any(_nd.nd_medium), ''), COALESCE(NULLIF(argMax(properties.utm_medium, timestamp), ''), 'none'))"
          case 'campaign': return "COALESCE(NULLIF(any(_nd.nd_campaign), ''), argMax(properties.utm_campaign, timestamp))"
          case 'keyword': return "COALESCE(NULLIF(any(_nd.nd_term), ''), argMax(COALESCE(NULLIF(properties.utm_term, ''), 'unknown'), timestamp))"
          case 'referrer_domain': return `argMax(${makeReferrerDomainExpr('properties.referrer')}, timestamp)`
          case 'ai_source': return "argMax(COALESCE(NULLIF(properties.ai_source, ''), 'none'), timestamp)"
          case 'landing_page': return "argMax(COALESCE(NULLIF(properties.page_url, ''), '/'), timestamp)"
          case 'country': return "argMax(COALESCE(NULLIF(properties.country, ''), 'unknown'), timestamp)"
          case 'device': return "argMax(COALESCE(NULLIF(properties.device_type, ''), 'unknown'), timestamp)"
          case 'provider': return `argMax(${PROVIDER_SQL}, timestamp)`
          case 'attribution_status': return `argMax(${ATTRIBUTION_STATUS_SQL}, timestamp)`
          case 'stitching_method': return `argMax(${STITCHING_METHOD_SQL}, timestamp)`
          default: throw new Error(`Unsupported group_by for LTV last_touch_non_direct: ${gb}`)
        }
      }

      // last_touch — inner subquery only scans conversion events, so argMax(timestamp)
      // correctly returns the most recent conversion's property value.
      switch (gb) {
        case 'source': return "argMax(COALESCE(NULLIF(properties.utm_source, ''), 'direct'), timestamp)"
        case 'medium': return "argMax(COALESCE(NULLIF(properties.utm_medium, ''), 'none'), timestamp)"
        case 'campaign': return 'argMax(properties.utm_campaign, timestamp)'
        case 'keyword': return "argMax(COALESCE(NULLIF(properties.utm_term, ''), 'unknown'), timestamp)"
        case 'referrer_domain': return `argMax(${makeReferrerDomainExpr('properties.referrer')}, timestamp)`
        case 'ai_source': return "argMax(COALESCE(NULLIF(properties.ai_source, ''), 'none'), timestamp)"
        case 'landing_page': return "argMax(COALESCE(NULLIF(properties.page_url, ''), '/'), timestamp)"
        case 'country': return "argMax(COALESCE(NULLIF(properties.country, ''), 'unknown'), timestamp)"
        case 'device': return "argMax(COALESCE(NULLIF(properties.device_type, ''), 'unknown'), timestamp)"
        case 'provider': return `argMax(${PROVIDER_SQL}, timestamp)`
        case 'attribution_status': return `argMax(${ATTRIBUTION_STATUS_SQL}, timestamp)`
        case 'stitching_method': return `argMax(${STITCHING_METHOD_SQL}, timestamp)`
        default: throw new Error(`Unsupported group_by for LTV last_touch: ${gb}`)
      }
    }

    const ltvDimExpr = ltvPersonDimExpr(groupBy, model)
    const ltvDim2Expr = groupBy2 ? ltvPersonDimExpr(groupBy2, model) : null

    // UUID exclusion rule: distinct_ids that match the UUIDv4 pattern
    // (8-4-4-4-12 hex chars) are anonymous-only visitors who never completed
    // identification via $identify. They are excluded from LTV because they
    // cannot be reliably stitched across sessions or devices.
    const uuidExclusion = "AND NOT match(events.distinct_id, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')"

    // Non-direct LTV: LEFT JOIN qualifying pageviews to attribute each distinct_id.
    // The main table remains unaliased so properties./timestamp. resolve correctly
    // and existing filterClauses work without modification.
    let ltvJoin = ''
    if (isNonDirect) {
      ltvJoin = `
    LEFT JOIN (
      SELECT distinct_id AS distinct_id,
        ${ndAggFn}(properties.utm_source, timestamp) AS nd_source,
        ${ndAggFn}(properties.utm_medium, timestamp) AS nd_medium,
        ${ndAggFn}(properties.utm_campaign, timestamp) AS nd_campaign,
        ${ndAggFn}(properties.utm_term, timestamp) AS nd_term
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND properties.utm_source IS NOT NULL
        AND properties.utm_source != ''
        AND properties.utm_source != 'direct'
      GROUP BY distinct_id
    ) _nd ON events.distinct_id = _nd.distinct_id`
    }

    const ltvSql = `
    SELECT
      ltv_dim AS dim_value${ltvDim2Expr ? `,\n      ltv_dim2 AS dim_value2` : ''},
      SUM(total_revenue) AS metric_value
    FROM (
      SELECT
        events.distinct_id,
        ${ltvDimExpr} AS ltv_dim${ltvDim2Expr ? `,\n        ${ltvDim2Expr} AS ltv_dim2` : ''},
        SUM(toFloatOrZero(toString(properties.conversion_value))) AS total_revenue
      FROM events${ltvJoin}${customJoin}
      WHERE properties.site_id = '${safeSite}'
        AND event = '$conversion'
        AND timestamp >= ${fromDate}
        AND timestamp < ${toDate}
        ${uuidExclusion}${filterClauses}
      GROUP BY events.distinct_id
      HAVING total_revenue > 0
    )
    GROUP BY ltv_dim${ltvDim2Expr ? ', ltv_dim2' : ''}
    ${havingClause}
    ORDER BY metric_value DESC
    LIMIT 50000
  `

    const ltvRows = await queryHogQL(ltvSql, 'flexible_report_ltv')
    const ltvResults = ltvRows.map((row) => {
      const dimValue = row[0]
      const dimValue2 = ltvDim2Expr ? row[1] : null
      const metricValue = ltvDim2Expr ? row[2] : row[1]
      return {
        dim_value: dimValue || 'unknown',
        ...(ltvDim2Expr ? { dim_value2: dimValue2 || 'unknown' } : {}),
        ltv_revenue: Number(metricValue) || 0
      }
    })

    const ltvTruncated = ltvRows.length >= 50000

    const finalLtvResult = ltvTruncated
      ? { results: ltvResults, truncated: true, truncated_at: 50000 }
      : ltvResults

    cache.set(key, finalLtvResult)
    return finalLtvResult
  }

  const sql = `
    SELECT
      ${effectiveDimExpr} AS dim_value${effectiveDim2Expr ? `,\n      ${effectiveDim2Expr} AS dim_value2` : ''},
      ${metricCol} AS metric_value
      ${extraSelect}
    FROM events${refJoin}${qualifyingJoin}${windowJoin}${customJoin}
    WHERE properties.site_id = '${safeSite}'
      AND ${getDateFilterExpr('timestamp', tz, dateFrom, dateTo)}
      ${eventFilter}${filterClauses}
    GROUP BY dim_value${effectiveDim2Expr ? ', dim_value2' : ''}
    ${havingClause}
    ${orderClause}
    LIMIT 50000
  `
  // flexible_report pipe-first wiring (allowlist-gated, HogQL fallback). Materialized base-case
  // slices; EVERYTHING else falls through to the unchanged HogQL `sql`. Common STRICT gate: single
  // dim, {revenue|conversions}, no _nd/window/custom joins, no filters, conversion_date, UTC. Both
  // pipes carry the external_event_id dedup for parity with the HogQL leg (#170).
  const _flexPipeCommon =
    !groupBy2 && (metric === 'revenue' || metric === 'conversions') &&
    attributeBy === 'conversion_date' &&
    !custKey1 && !custKey2 && tz === 'UTC' && filterClauses === ''
  // source × first_touch -> flexible_report_main_by_site (#168). The attribution window RE-ATTRIBUTES
  // source (windowedDimExpr is set for source), so this pipe — which reads the conversion's stored
  // first_touch_source, UNwindowed — can only match HogQL when NO window is active. Hence the extra
  // !hasAttributionWindow here. (The prod route always injects a >=30d window, so this case rarely
  // dispatches in prod — a separate base-case decision.)
  const _flexMainCase = _flexPipeCommon && !hasAttributionWindow && model === 'first_touch' && groupBy === 'source'
  // provider is a CONVERSION-PROPERTY dim (PROVIDER_SQL, model-independent, no _nd) -> ONE pipe serves
  // all 4 touch models. The window is a NO-OP for provider: windowedDimExpr is null for it (only
  // source/medium/campaign/keyword/referrer_domain are windowed), and the windowJoin is a non-fanning
  // 1:1 LEFT JOIN (`_win` GROUP BY cv.uuid ... ON events.uuid = _win._win_uuid) that neither filters nor
  // fans conversions — so count()/revenue per provider is identical with or without it. So NO
  // !hasAttributionWindow here: this is what lets the prod route (which always injects a window)
  // dispatch the pipe. last_touch_non_direct+provider is the live prod 504 this fixes.
  const _flexProviderCase = _flexPipeCommon && groupBy === 'provider' && isTouchModel
  // attribution_status is another CONVERSION-PROPERTY dim (ATTRIBUTION_STATUS_SQL, model-independent,
  // no _nd) -> same window-tolerant Class-A treatment as provider (proven GREEN on --live).
  const _flexAttributionStatusCase = _flexPipeCommon && groupBy === 'attribution_status' && isTouchModel
  // stitching_method — independent CONVERSION-PROPERTY dim (STITCHING_METHOD_SQL, own fallback,
  // model-independent, no _nd) -> same Class-A treatment.
  const _flexStitchingMethodCase = _flexPipeCommon && groupBy === 'stitching_method' && isTouchModel
  // conversion_type — CONVERSION-PROPERTY dim (plain COALESCE(...,'untyped'), no multiIf, no _nd,
  // model-independent) -> same Class-A treatment. (group_by=conversion_type, not filter_conversion_type.)
  const _flexConversionTypeCase = _flexPipeCommon && groupBy === 'conversion_type' && isTouchModel
  const _flexPipe = _flexMainCase
    ? 'flexible_report_main_by_site'
    : _flexProviderCase
      ? 'flexible_report_provider_by_site'
      : _flexAttributionStatusCase
        ? 'flexible_report_attribution_status_by_site'
        : _flexStitchingMethodCase
          ? 'flexible_report_stitching_method_by_site'
          : _flexConversionTypeCase
            ? 'flexible_report_conversion_type_by_site'
            : null
  // TEMP diagnostic (debug/flex-gate-instrument — removable once diagnosed): fires on EVERY
  // getFlexibleReport call that reaches the pipe-dispatch point. If ABSENT from prod logs for the
  // provider request, the request never reached here — an earlier branch served it (route fast-path,
  // a shadowing handler, or an HTTP/edge cache). Emitted via console.LOG (the proven-visible channel),
  // NOT console.debug (didn't surface in prod) and NOT logInfo (its sanitizer mangles last_touch/
  // first_touch model names to [REDACTED_KEY]). Names/booleans/lengths ONLY — no values, no PII.
  // (isTouchModel is a const boolean.)
  console.log(`[flex-gate] model=${model} groupBy=${groupBy} metric=${metric} tz=${tz} ` +
    `filterClauses.len=${filterClauses.length} groupBy2=${!!groupBy2} window=${!!hasAttributionWindow} ` +
    `attributeBy=${attributeBy} cust1=${!!custKey1} cust2=${!!custKey2} isTouch=${isTouchModel} ` +
    `-> pipe=${_flexPipe ?? 'NONE'}`)
  let rows
  if (_flexPipe) {
    // Same +1-day-exclusive UTC bounds the HogQL `sql` uses (serializeHogQLDateRange), formatted for
    // the pipe's DateTime params — guarantees date-parity.
    const _fbFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
    const _fbTo = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
    const _fbTb = await _pipeRead(_flexPipe, { site_id: String(siteId), date_from: _fbFrom, date_to: _fbTo, metric })
    // Named pipe rows -> positional [dim_value, metric_value] so the unchanged consumer (row[0]/row[1],
    // !hasDim2) stays byte-identical. Null -> injectable HogQL fallback (harness controls both legs).
    rows = _fbTb ? _fbTb.map(r => [r.dim_value, r.metric_value]) : await _queryHogQL(sql, 'flexible_report')
  } else {
    rows = await _queryHogQL(sql, 'flexible_report')
  }

  const results = rows.map((row) => {
    const hasDim2 = dim2Expr != null
    const dimValue = row[0]
    const dimValue2 = hasDim2 ? row[1] : null
    const metricValue = hasDim2 ? row[2] : row[1]
    const extra = hasDim2 ? row.slice(3) : row.slice(2)

    const item = {
      dim_value: dimValue || 'unknown',
      ...(dim2Expr ? { dim_value2: dimValue2 || 'unknown' } : {}),
      [metricLabel]: Number(metricValue) || 0
    }
    if (extraSelect.includes('sessions') && extra[0] != null) {
      item.sessions = Number(extra[0]) || 0
    }
    return item
  })

  if (metric === 'conversion_rate' && results.length > 0) {
    const sessKey = cacheKey(`sessions:${groupBy}${groupBy2 || ''}:${attributionWindow || 'ltv'}`, siteId, dateFrom, dateTo)
    let sessionsByDim = cache.get(sessKey)
    if (!sessionsByDim) {
      const sessSql = `
        SELECT
          ${dimExpr} AS dim_value${dim2Expr ? `,\n          ${dim2Expr} AS dim_value2` : ''},
          count(DISTINCT distinct_id) AS sessions
        FROM events${refJoin}${customJoin}
        WHERE properties.site_id = '${safeSite}'
          AND event = '$pageview'
          AND timestamp >= ${fromDate}
          AND timestamp < ${toDate}${filterClauses}
        GROUP BY dim_value${dim2Expr ? ', dim_value2' : ''}
        LIMIT 50000
      `
      // Pipe-first BASE-CASE ONLY (mirrors flexible_sessions_by_site's gate): dim=source,
      // first_touch model, single dim, no custom_param, no filters. (refJoin is absent here
      // because groupBy!=='date'.) dimExpr for source/first_touch is exactly the pipe's
      // COALESCE(NULLIF(first_touch_source,''),'direct'); the sessSql uses the UNwindowed
      // dimExpr, so the attribution window does not affect this leg. Anything else -> null
      // pipe -> unchanged HogQL sessSql (the _pipeRead falsy-name no-dispatch path).
      const _sessBase = groupBy === 'source' && model === 'first_touch' && !groupBy2 && !custKey1 && !custKey2 && filterClauses === ''
      const _sessFrom = fromDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
      const _sessTo = toDate.match(/'([^']+)'/)[1].replace('T', ' ').replace(/Z$/, '')
      const _sessTb = await _pipeRead(_sessBase ? 'flexible_sessions_by_site' : null, { site_id: String(siteId), date_from: _sessFrom, date_to: _sessTo })
      const sessRows = _sessTb ? _sessTb.map(r => [r.dim_value, r.sessions]) : await _queryHogQL(sessSql, 'flexible_sessions')
      sessionsByDim = {}
      for (const [d, s] of sessRows) {
        sessionsByDim[d || 'unknown'] = Number(s) || 1
      }
      cache.set(sessKey, sessionsByDim, 60)
    }
    for (const item of results) {
      const sess = sessionsByDim[item.dim_value] || 1
      item.conversion_rate = sess > 0 ? ((item.conversion_rate / sess) * 100) : 0
    }
  }

  if ((metric === 'ai_conversion_share' || metric === 'ai_revenue_share') && results.length > 0) {
    const shareSql = `
      SELECT
        ${dimExpr} AS dim_value${dim2Expr ? `,\n        ${dim2Expr} AS dim_value2` : ''},
        ${metric === 'ai_conversion_share' ? 'count()' : `SUM(toFloatOrZero(toString(properties.conversion_value)))`} AS ai_value
      FROM events${refJoin}
      WHERE properties.site_id = '${safeSite}'
        AND event = '$conversion'
        AND properties.ai_source IS NOT NULL
        AND properties.ai_source != ''
        AND timestamp >= ${fromDate}
        AND timestamp < ${toDate}${filterClauses}
      GROUP BY dim_value${dim2Expr ? ', dim_value2' : ''}
      LIMIT 50000
    `
    const shareRows = await queryHogQL(shareSql, 'flexible_ai_share')
    const aiByDim = {}
    for (const [d, v] of shareRows) {
      aiByDim[d || 'unknown'] = Number(v) || 0
    }
    const shareLabel = metric === 'ai_conversion_share' ? 'ai_conversion_share' : 'ai_revenue_share'
    for (const item of results) {
      const total = item[metric === 'ai_conversion_share' ? 'ai_conversion_share' : 'ai_revenue_share'] || 0
      const aiTotal = aiByDim[item.dim_value] || 0
      item[shareLabel] = total > 0 ? ((aiTotal / total) * 100) : 0
    }
  }

  const merged = mergeGoogleResults(results, groupBy, groupBy2, metricLabel)
  const isTruncated = rows.length >= 50000

  const finalResult = isTruncated
    ? { results: merged, truncated: true, truncated_at: 50000 }
    : merged

  cache.set(key, finalResult)
  return finalResult
}

// The nightly job freezes each conversion's touchpoint attribution at the SITE's configured
// window (attribution_window_days, clamped [1,90]) into attributed_conversions — one row per
// conversion, no window dimension (nightly-attribution.js:557). Every pre-aggregated reader below
// (getPreAggregatedAttribution + the four multi-touch readers) therefore serves ONLY that one
// materialized window; none take a window param and none can re-window. So the route may
// short-circuit to them ONLY when the window it is about to serve equals the materialized one.
// If they differ (a user picked a non-default lookback), the pre-agg would return the SITE-window
// numbers labeled as the REQUESTED window — a fake-window lie on the money rail (§6). In that case
// the caller must fall through to the live re-attributing path instead. The clamp here mirrors
// nightly-attribution.js:557 exactly so the comparison is against the true materialized window.
export function preAggregatedWindowMatches (resolvedWindow, attributionWindowDays) {
  const materialized = String(Math.min(90, Math.max(1, Number(attributionWindowDays) || 30)))
  return String(resolvedWindow) === materialized
}

// The genuinely un-materialized report dims — keyword, referrer_domain, custom_param:* — have no
// pre-agg column and no Tinybird pipe, so they always run the live HogQL windowJoin, which times
// out at volume over long ranges (#180 makes that failure honest but the customer still gets NO
// data). To return DATA instead of a 504, the route caps the lookback for these shapes to a range
// HogQL can complete and labels the response truthfully.
// NOTE: 31 is a CONSERVATIVE pre-fixture default — it covers the dominant "Last 30 days" preset, so
// only longer (60/90-day) requests on these dims are trimmed. The real safe ceiling must be measured
// against the ~1M-pageview/90d volume fixture and tuned here; this is a safety valve, not a
// calibrated limit.
export const UNMATERIALIZED_DIM_MAX_DAYS = 31

export function isUnmaterializedReportDim (dim) {
  return dim === 'keyword' || dim === 'referrer_domain' || (typeof dim === 'string' && dim.startsWith('custom_param:'))
}

// Pure. When the report groups by an un-materialized dim (primary OR secondary), clamp dateFrom to
// at most maxDays before dateTo. Returns { dateFrom, capped }. Dates are 'YYYY-MM-DD' (UTC midnight).
// A shape that isn't un-materialized, or is already within range, is returned unchanged (capped:false).
export function capUnmaterializedRange ({ groupBy, groupBy2, dateFrom, dateTo, maxDays = UNMATERIALIZED_DIM_MAX_DAYS }) {
  if (!isUnmaterializedReportDim(groupBy) && !isUnmaterializedReportDim(groupBy2)) {
    return { dateFrom, capped: false }
  }
  const to = new Date(`${dateTo}T00:00:00Z`)
  const from = new Date(`${dateFrom}T00:00:00Z`)
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) return { dateFrom, capped: false }
  const spanDays = Math.round((to.getTime() - from.getTime()) / 86400000)
  if (spanDays <= maxDays) return { dateFrom, capped: false }
  const cappedFrom = new Date(to.getTime() - maxDays * 86400000).toISOString().slice(0, 10)
  return { dateFrom: cappedFrom, capped: true }
}

// Get pre-aggregated attribution from batch job results
export async function getPreAggregatedAttribution({
  siteId,
  model,
  dateFrom,
  dateTo,
  groupBy = 'source',
  metric = 'revenue',
  filters = {},
  timezone = 'UTC'
}) {
  const supabase = getSupabase()

  // Determine which attribution field to use
  const sourceField = model === 'first_touch' ? 'first_touch_source' : 'last_touch_source'
  const mediumField = model === 'first_touch' ? 'first_touch_medium' : 'last_touch_medium'
  const campaignField = model === 'first_touch' ? 'first_touch_campaign' : 'last_touch_campaign'

  let selectField, groupField
  if (groupBy === 'source') {
    selectField = sourceField
    groupField = sourceField
  } else if (groupBy === 'medium') {
    selectField = mediumField
    groupField = mediumField
  } else if (groupBy === 'campaign') {
    selectField = campaignField
    groupField = campaignField
  } else if (groupBy === 'channel') {
    selectField = model === 'last_touch' ? 'last_touch_channel' : 'first_touch_channel'
    groupField  = model === 'last_touch' ? 'last_touch_channel' : 'first_touch_channel'
  } else if (groupBy === 'country') {
    selectField = model === 'first_touch' ? 'first_touch_country' : 'last_touch_country'
    groupField = selectField
  } else if (groupBy === 'device') {
    selectField = model === 'first_touch' ? 'first_touch_device' : 'last_touch_device'
    groupField = selectField
  } else if (groupBy === 'browser') {
    selectField = model === 'first_touch' ? 'first_touch_browser' : 'last_touch_browser'
    groupField = selectField
  } else if (groupBy === 'landing_page') {
    selectField = model === 'first_touch' ? 'first_touch_landing_page' : 'last_touch_landing_page'
    groupField = selectField
  } else {
    selectField = sourceField
    groupField = sourceField
  }

  const tz = isValidTimezone(timezone) ? timezone : 'UTC'
  const padded = getPaddedUtcDateRange(dateFrom, dateTo)

  let query = supabase
    .from('attributed_conversions')
    .select(`${selectField}, conversion_value, distinct_id, conversion_date, conversion_type, conversion_timestamp`)
    .eq('site_id', siteId)
    .gte('conversion_date', padded.from)
    .lte('conversion_date', padded.to)
    .not(selectField, 'is', null)

  if (filters.customer_type) {
    query = query.order('conversion_date', { ascending: true })
  }

  const { data, error } = await query

  if (error) throw new Error(`Supabase query failed: ${error.message}`)

  let rows = (data || []).filter(r => {
    const localDate = getLocalDateString(new Date(r.conversion_timestamp || r.conversion_date), tz)
    return localDate >= dateFrom && localDate <= dateTo
  })

  // Apply new/returning customer filter in JS (attributed_conversions is pre-aggregated)
  if (filters.customer_type && rows.length > 0) {
    // For each distinct_id, find the earliest conversion_date in this result set
    const earliest = {}
    for (const r of rows) {
      const did = r.distinct_id
      if (!did) continue
      if (!earliest[did] || r.conversion_date < earliest[did]) {
        earliest[did] = r.conversion_date
      }
    }

    // Now check against ALL prior conversions for this site_id (not just in range)
    // Get all distinct_ids that had a conversion BEFORE dateFrom
    const prevConvIds = new Set()
    // Query for previously-converting distinct_ids (conversion before our window starts)
    const { data: prevData, error: prevErr } = await supabase
      .from('attributed_conversions')
      .select('distinct_id')
      .eq('site_id', siteId)
      .lt('conversion_date', padded.from)

    if (!prevErr && prevData) {
      for (const r of prevData) {
        if (r.distinct_id) prevConvIds.add(r.distinct_id)
      }
    }

    rows = rows.filter(r => {
      const did = r.distinct_id
      if (!did) return true
      const isFirstEver = !prevConvIds.has(did) && r.conversion_date === earliest[did]
      if (filters.customer_type === 'new') return isFirstEver
      if (filters.customer_type === 'returning') return !isFirstEver
      return true
    })
  }

  // Aggregate by dimension
  const aggregated = {}
  for (const row of rows) {
    let dimValue = row[selectField] || 'direct'
    if (isGoogleSource(dimValue)) {
      dimValue = 'google'
    }
    if (!aggregated[dimValue]) {
      aggregated[dimValue] = { revenue: 0, conversions: 0, leads: 0, customers: 0 }
    }
    aggregated[dimValue].revenue += parseFloat(row.conversion_value || 0)
    aggregated[dimValue].conversions += 1

    const typeClass = classifyConversionType(row.conversion_type)
    if (typeClass === 'lead') {
      aggregated[dimValue].leads += 1
    } else if (typeClass === 'customer') {
      aggregated[dimValue].customers += 1
    }
  }

  // Format results
  const results = Object.entries(aggregated).map(([dim_value, stats]) => {
    const customers = stats.customers
    return {
      dim_value,
      revenue: parseFloat(stats.revenue.toFixed(2)),
      conversions: stats.conversions,
      leads: stats.leads,
      customers: stats.customers,
      avg_conversion_value: customers > 0 ? parseFloat((stats.revenue / customers).toFixed(2)) : 0
    }
  })

  // Guard the sort key per user request
  const sortKey = ['revenue', 'conversions', 'leads', 'customers', 'avg_conversion_value'].includes(metric)
    ? metric
    : 'conversions'

  return results.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
}


// NOTE: The advanced multi-touch models (Linear, U-Shaped, W-Shaped, Time Decay) are temporarily
// hidden from the UI and gated at the API level because of a known HogQL outer-variable correlation
// issue: "Unable to resolve field: ce".
//
// These functions are preserved here to prevent code removal. Do not delete them.

// Get U-Shaped attribution (40/20/40) from pre-aggregated data
export async function getUShapedAttribution({
  siteId,
  dateFrom,
  dateTo,
  groupBy = 'source',
  metric = 'revenue'
}) {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('attributed_conversions')
    .select('u_shaped_attribution')
    .eq('site_id', siteId)
    .gte('conversion_date', dateFrom)
    .lte('conversion_date', dateTo)
    .not('u_shaped_attribution', 'is', null)

  if (error) throw new Error(`Supabase query failed: ${error.message}`)

  const aggregated = {}
  for (const row of data || []) {
    // Safety: legacy rows may have been stored as JSON string instead of JSONB array
    let uShapedData = row.u_shaped_attribution || []
    if (typeof uShapedData === 'string') {
      try { uShapedData = JSON.parse(uShapedData) } catch { uShapedData = [] }
    }
    if (!Array.isArray(uShapedData)) uShapedData = []
    for (const touch of uShapedData) {
      const dimValue = touch[groupBy] || touch.source || 'direct'
      if (!aggregated[dimValue]) {
        aggregated[dimValue] = { revenue: 0, conversions: 0 }
      }
      aggregated[dimValue].revenue += parseFloat(touch.attributed_value || 0)
      aggregated[dimValue].conversions += parseFloat(touch.fraction || 0)
    }
  }

  const results = Object.entries(aggregated).map(([dim_value, stats]) => ({
    dim_value,
    revenue: parseFloat(stats.revenue.toFixed(2)),
    conversions: parseFloat(stats.conversions.toFixed(4))
  }))

  return results.sort((a, b) => b[metric] - a[metric])
}

// Get Time Decay attribution from pre-aggregated data (7-day half-life)
export async function getTimeDecayAttribution({
  siteId,
  dateFrom,
  dateTo,
  groupBy = 'source',
  metric = 'revenue'
}) {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('attributed_conversions')
    .select('time_decay_attribution')
    .eq('site_id', siteId)
    .gte('conversion_date', dateFrom)
    .lte('conversion_date', dateTo)
    .not('time_decay_attribution', 'is', null)

  if (error) throw new Error(`Supabase query failed: ${error.message}`)

  const aggregated = {}
  for (const row of data || []) {
    let tdData = row.time_decay_attribution || []
    if (typeof tdData === 'string') {
      try { tdData = JSON.parse(tdData) } catch { tdData = [] }
    }
    if (!Array.isArray(tdData)) tdData = []
    for (const touch of tdData) {
      const dimValue = touch[groupBy] || touch.source || 'direct'
      if (!aggregated[dimValue]) aggregated[dimValue] = { revenue: 0, conversions: 0 }
      aggregated[dimValue].revenue += parseFloat(touch.attributed_value || 0)
      aggregated[dimValue].conversions += parseFloat(touch.fraction || 0)
    }
  }

  const results = Object.entries(aggregated).map(([dim_value, stats]) => ({
    dim_value,
    revenue: parseFloat(stats.revenue.toFixed(2)),
    conversions: parseFloat(stats.conversions.toFixed(4))
  }))

  return results.sort((a, b) => b[metric] - a[metric])
}

// Get W-Shaped attribution (30/30/30/10) from pre-aggregated data
export async function getWShapedAttribution({
  siteId,
  dateFrom,
  dateTo,
  groupBy = 'source',
  metric = 'revenue'
}) {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('attributed_conversions')
    .select('w_shaped_attribution')
    .eq('site_id', siteId)
    .gte('conversion_date', dateFrom)
    .lte('conversion_date', dateTo)
    .not('w_shaped_attribution', 'is', null)

  if (error) throw new Error(`Supabase query failed: ${error.message}`)

  const aggregated = {}
  for (const row of data || []) {
    let wsData = row.w_shaped_attribution || []
    if (typeof wsData === 'string') {
      try { wsData = JSON.parse(wsData) } catch { wsData = [] }
    }
    if (!Array.isArray(wsData)) wsData = []
    for (const touch of wsData) {
      const dimValue = touch[groupBy] || touch.source || 'direct'
      if (!aggregated[dimValue]) aggregated[dimValue] = { revenue: 0, conversions: 0 }
      aggregated[dimValue].revenue += parseFloat(touch.attributed_value || 0)
      aggregated[dimValue].conversions += parseFloat(touch.fraction || 0)
    }
  }

  const results = Object.entries(aggregated).map(([dim_value, stats]) => ({
    dim_value,
    revenue: parseFloat(stats.revenue.toFixed(2)),
    conversions: parseFloat(stats.conversions.toFixed(4))
  }))

  return results.sort((a, b) => b[metric] - a[metric])
}

// Get linear attribution from pre-aggregated data
export async function getLinearAttribution({
  siteId,
  dateFrom,
  dateTo,
  groupBy = 'source',
  metric = 'revenue'
}) {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('attributed_conversions')
    .select('linear_attribution')
    .eq('site_id', siteId)
    .gte('conversion_date', dateFrom)
    .lte('conversion_date', dateTo)
    .not('linear_attribution', 'is', null)

  if (error) throw new Error(`Supabase query failed: ${error.message}`)

  const aggregated = {}
  for (const row of data || []) {
    let linearData = row.linear_attribution || []
    if (typeof linearData === 'string') {
      try { linearData = JSON.parse(linearData) } catch { linearData = [] }
    }
    if (!Array.isArray(linearData)) linearData = []
    for (const touch of linearData) {
      // groupBy 'channel' uses stored channel field; others fall back to source
      const dimValue = touch[groupBy] || touch.source || 'direct'
      if (!aggregated[dimValue]) {
        aggregated[dimValue] = { revenue: 0, conversions: 0 }
      }
      aggregated[dimValue].revenue += parseFloat(touch.attributed_value || 0)
      aggregated[dimValue].conversions += parseFloat(touch.fraction || 0)
    }
  }

  const results = Object.entries(aggregated).map(([dim_value, stats]) => ({
    dim_value,
    revenue: parseFloat(stats.revenue.toFixed(2)),
    conversions: parseFloat(stats.conversions.toFixed(4))
  }))

  return results.sort((a, b) => b[metric] - a[metric])
}

export function calculateAttribution(touchpoints, conversionValue) {
  if (!touchpoints || touchpoints.length === 0) {
    return {
      first_touch: null,
      last_touch: null,
      linear: [],
      u_shaped: [],
      time_decay: [],
      w_shaped: []
    }
  }

  const firstTouchpoint = touchpoints[0]
  const lastTouchpoint = touchpoints[touchpoints.length - 1]

  const tpCh = (tp) => channelFromEvent({
    utm_source: tp.utm_source, utm_medium: tp.utm_medium,
    ai_source: tp.ai_source, gclid: tp.gclid, gbraid: tp.gbraid, wbraid: tp.wbraid,
    fbclid: tp.fbclid, msclkid: tp.msclkid, ttclid: tp.ttclid,
    li_fat_id: tp.li_fat_id, li_fatid: tp.li_fatid, twclid: tp.twclid,
    dclid: tp.dclid, snapclid: tp.snapclid, pclid: tp.pclid,
    sccid: tp.sccid, ko_click_id: tp.ko_click_id,
    referrer: tp.referrer, page_url: tp.page_url
  })
  const tpBase = (tp) => {
    const base = {
      source: tp.utm_source || null,
      medium: tp.utm_medium || null,
      campaign: tp.utm_campaign || null,
      keyword: tp.utm_term || null,
      utm_term: tp.utm_term || null,
      referrer_domain: extractReferrerDomain(tp.referrer),
      channel: tpCh(tp),
      timestamp: tp.timestamp,
      country: tp.country || 'unknown',
      device: tp.device || 'unknown',
      browser: tp.browser || 'unknown',
      landing_page: tp.landing_page || 'unknown'
    }
    for (const key of Object.keys(tp)) {
      if (key.startsWith('custom_')) {
        base[key] = tp[key]
      }
    }
    return base
  }

  // ── Linear ──────────────────────────────────────────────────────────────────
  const fraction = 1.0 / touchpoints.length
  const linearValue = conversionValue * fraction
  const linear = touchpoints.map(tp => ({
    ...tpBase(tp),
    fraction: parseFloat(fraction.toFixed(4)),
    attributed_value: parseFloat(linearValue.toFixed(2))
  }))

  // ── U-Shaped (40/20/40) ──────────────────────────────────────────────────────
  const u_shaped = (() => {
    if (touchpoints.length === 1) {
      return [{ ...tpBase(firstTouchpoint), fraction: 1.0, attributed_value: parseFloat(conversionValue.toFixed(2)) }]
    }
    if (touchpoints.length === 2) {
      return [
        { ...tpBase(firstTouchpoint), fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) },
        { ...tpBase(lastTouchpoint),  fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) }
      ]
    }
    const middleCount = touchpoints.length - 2
    const middleFraction = parseFloat((0.2 / middleCount).toFixed(4))
    const middleValue = parseFloat((conversionValue * 0.2 / middleCount).toFixed(2))
    return touchpoints.map((tp, i) => {
      if (i === 0) return { ...tpBase(tp), fraction: 0.4, attributed_value: parseFloat((conversionValue * 0.4).toFixed(2)) }
      if (i === touchpoints.length - 1) return { ...tpBase(tp), fraction: 0.4, attributed_value: parseFloat((conversionValue * 0.4).toFixed(2)) }
      return { ...tpBase(tp), fraction: middleFraction, attributed_value: middleValue }
    })
  })()

  // ── Time Decay (7-day half-life) ─────────────────────────────────────────────
  const time_decay = (() => {
    const conversionTime = new Date(lastTouchpoint.timestamp).getTime()
    const isConversionTimeValid = !isNaN(conversionTime)

    // Check if any touchpoint has an invalid timestamp
    let hasInvalid = !isConversionTimeValid
    const tpTimes = touchpoints.map(tp => {
      const t = new Date(tp.timestamp).getTime()
      if (isNaN(t)) hasInvalid = true
      return t
    })

    const halfLifeDays = 7
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000

    const rawWeights = touchpoints.map((tp, i) => {
      if (hasInvalid) {
        // Fall back to equal decay weights when valid ordering/dates cannot be computed
        return 1.0
      }
      const daysBack = Math.max(0, (conversionTime - tpTimes[i]) / halfLifeMs)
      return Math.pow(0.5, daysBack) // 0.5^(days/halfLife)
    })

    const totalWeight = rawWeights.reduce((s, w) => s + w, 0) || 1
    return touchpoints.map((tp, i) => {
      const frac = parseFloat((rawWeights[i] / totalWeight).toFixed(4))
      return {
        ...tpBase(tp),
        fraction: frac,
        attributed_value: parseFloat((conversionValue * frac).toFixed(2))
      }
    })
  })()

  // ── W-Shaped (30/30/30/10) ───────────────────────────────────────────────────
  const w_shaped = (() => {
    if (touchpoints.length === 1) {
      return [{ ...tpBase(firstTouchpoint), fraction: 1.0, attributed_value: parseFloat(conversionValue.toFixed(2)) }]
    }
    if (touchpoints.length === 2) {
      return [
        { ...tpBase(firstTouchpoint), fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) },
        { ...tpBase(lastTouchpoint),  fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) }
      ]
    }
    if (touchpoints.length === 3) {
      return touchpoints.map((tp, i) => ({
        ...tpBase(tp),
        fraction: 0.333,
        attributed_value: parseFloat((conversionValue / 3).toFixed(2))
      }))
    }
    const middleIdx = Math.floor((touchpoints.length - 1) / 2)
    const anchorIndices = new Set([0, middleIdx, touchpoints.length - 1])
    const otherCount = touchpoints.length - anchorIndices.size
    const otherFrac = otherCount > 0 ? parseFloat((0.1 / otherCount).toFixed(4)) : 0
    const otherValue = otherCount > 0 ? parseFloat((conversionValue * 0.1 / otherCount).toFixed(2)) : 0
    return touchpoints.map((tp, i) => {
      if (anchorIndices.has(i)) {
        return { ...tpBase(tp), fraction: 0.3, attributed_value: parseFloat((conversionValue * 0.3).toFixed(2)) }
      }
      return { ...tpBase(tp), fraction: otherFrac, attributed_value: otherValue }
    })
  })()

  const adjustReconciliation = (shares) => {
    if (!shares || shares.length === 0) return shares
    const sumOthers = shares.slice(0, -1).reduce((s, x) => s + x.attributed_value, 0)
    shares[shares.length - 1].attributed_value = parseFloat((conversionValue - sumOthers).toFixed(2))
    const fracOthers = shares.slice(0, -1).reduce((s, x) => s + x.fraction, 0)
    shares[shares.length - 1].fraction = parseFloat((1.0 - fracOthers).toFixed(4))
    return shares
  }

  return {
    first_touch: {
      source: firstTouchpoint.utm_source || null,
      medium: firstTouchpoint.utm_medium || null,
      campaign: firstTouchpoint.utm_campaign || null,
      keyword: firstTouchpoint.utm_term || null,
      utm_term: firstTouchpoint.utm_term || null,
      referrer_domain: extractReferrerDomain(firstTouchpoint.referrer),
      timestamp: firstTouchpoint.timestamp
    },
    last_touch: {
      source: lastTouchpoint.utm_source || null,
      medium: lastTouchpoint.utm_medium || null,
      campaign: lastTouchpoint.utm_campaign || null,
      keyword: lastTouchpoint.utm_term || null,
      utm_term: lastTouchpoint.utm_term || null,
      referrer_domain: extractReferrerDomain(lastTouchpoint.referrer),
      timestamp: lastTouchpoint.timestamp
    },
    linear: adjustReconciliation(linear),
    u_shaped: adjustReconciliation(u_shaped),
    time_decay: adjustReconciliation(time_decay),
    w_shaped: adjustReconciliation(w_shaped)
  }
}

export function mergeGoogleResults(results, groupBy, groupBy2, metricLabel) {
  if (!Array.isArray(results)) return results
  const mergedResults = []
  const seen = new Map()
  for (const item of results) {
    if (isGoogleSource(item.dim_value)) {
      item.dim_value = 'google'
    }
    if (groupBy2 && isGoogleSource(item.dim_value2)) {
      item.dim_value2 = 'google'
    }

    let key = item.dim_value
    if (groupBy2) {
      key += '|||' + item.dim_value2
    }

    if (seen.has(key)) {
      const existing = seen.get(key)
      for (const k of Object.keys(item)) {
        if (k === 'dim_value' || k === 'dim_value2' || k === 'conversions' || k === 'sessions') continue
        if (typeof item[k] === 'number') {
          if (k === 'avg_conversion_value' || k === 'days_to_convert' || k === 'touchpoints_per_conversion' || k === 'conversion_rate') {
            const existingWeight = existing.conversions || existing.sessions || 1
            const itemWeight = item.conversions || item.sessions || 1
            existing[k] = (existing[k] * existingWeight + item[k] * itemWeight) / (existingWeight + itemWeight)
          } else {
            existing[k] = (existing[k] || 0) + item[k]
          }
        }
      }
      if (item.conversions !== undefined) {
        existing.conversions = (existing.conversions || 0) + item.conversions
      }
      if (item.sessions !== undefined) {
        existing.sessions = (existing.sessions || 0) + item.sessions
      }
    } else {
      seen.set(key, { ...item })
      mergedResults.push(seen.get(key))
    }
  }

  // Sort again as merging could disrupt order
  if (groupBy === 'date') {
    mergedResults.sort((a, b) => String(a.dim_value).localeCompare(String(b.dim_value)))
  } else {
    mergedResults.sort((a, b) => (b[metricLabel] || 0) - (a[metricLabel] || 0))
  }
  return mergedResults
}
