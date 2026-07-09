import { queryHogQL } from '../lib/posthog.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { deriveSessions, sessionAggregates, annotateSessions } from '../lib/sessionization.js'
import { esc } from '../lib/utils.js'
import { serializeHogQLDateRange, buildHogQLTimestampFilter } from '../lib/hogql-date.js'

// ── Test seam ────────────────────────────────────────────────────────────────
// Mirrors the merged live.js/hygiene.js pattern (no ESM module mocker): unit
// tests inject stubs for the two read backends. Production never calls the
// setter, so it uses the real imports and behaves identically.
let _queryTinybirdPipe = queryTinybirdPipe
let _queryHogQL = queryHogQL
export function __setSessionsReadDeps ({ queryTinybird, queryHog } = {}) {
  if (queryTinybird) _queryTinybirdPipe = queryTinybird
  if (queryHog) _queryHogQL = queryHog
}
export function __resetSessionsReadDeps () {
  _queryTinybirdPipe = queryTinybirdPipe
  _queryHogQL = queryHogQL
}

// Tinybird-first read helper: null return (flag off / error) -> HogQL fallback;
// rows remapped to the HogQL positional shape so downstream is byte-identical.
// Fail-closed under the test-only TINYBIRD_FORCE_READ (throws instead of a
// silent HogQL bypass). Tenant isolation: pipes are called with the
// authenticated site_id, never client-supplied.
async function readTb (pipeName, params, hogSql, hogName, mapRows) {
  const tb = await _queryTinybirdPipe(pipeName, params)
  if (tb !== null) return mapRows(tb)
  if (process.env.TINYBIRD_FORCE_READ === 'true') {
    throw new Error(`[tinybird-force-read] ${pipeName} returned null under TINYBIRD_FORCE_READ — dispatch path not exercised`)
  }
  return _queryHogQL(hogSql, hogName)
}

/**
 * GET /api/sessions/overview?site_key=X&date_from=Y&date_to=Z
 * Returns session aggregates for the dashboard card.
 * Sessions are derived on read from pageview events using the 30-minute inactivity rule.
 */
export async function sessionsOverview(req, res) {
  try {
    const { date_from, date_to } = req.query
    const posthogSiteId = String(req.site.id)
    if (!date_from || !date_to) {
      return res.status(400).json({ success: false, data: null, error: 'date_from and date_to are required' })
    }

    let range
    try {
      range = serializeHogQLDateRange(date_from, date_to, { exclusiveEnd: true })
    } catch (err) {
      return res.status(400).json({ success: false, data: null, error: err.message })
    }

    const dateFilter = buildHogQLTimestampFilter('timestamp', range)
    // DateTime boundaries for the Tinybird pipe's DateTime(date_from_ts/date_to_ts)
    // params. The serialized HogQL expr carries an ISO datetime; the pipe's
    // ClickHouse DateTime param needs the canonical 'YYYY-MM-DD HH:MM:SS' literal
    // (UTC, second precision) — ISO's 'T'/'Z'/millis are not accepted. The HogQL
    // dateFilter (using range.from/to verbatim) remains the fallback.
    const toChDateTime = (expr) => {
      const iso = expr.match(/'([^']+)'/)?.[1]
      const d = iso ? new Date(iso) : null
      return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 19).replace('T', ' ') : null
    }
    const dateFromTs = toChDateTime(range.from)
    const dateToTs = toChDateTime(range.to)

    // Query all pageviews in range for session derivation
    const pageviewSql = `
      SELECT
        distinct_id,
        timestamp,
        properties.page_url,
        properties.utm_source,
        properties.utm_medium,
        properties.utm_campaign
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND event = '$pageview'
        AND ${dateFilter}
      ORDER BY distinct_id ASC, timestamp ASC
      LIMIT 50000
    `

    // WIRED (pure pageview read for session derivation): utm_* are campaign
    // dimensions on pageviews, not the attribution engine / ai_source / conversion.
    const pvRows = await readTb(
      'sessions_pageviews',
      { site_id: posthogSiteId, date_from_ts: dateFromTs, date_to_ts: dateToTs },
      pageviewSql, 'sessions_pageviews',
      tb => tb.map(r => [r.distinct_id, r.timestamp, r.page_url, r.utm_source, r.utm_medium, r.utm_campaign])
    )

    // Also query conversions to mark converting sessions
    const convSql = `
      SELECT
        distinct_id,
        timestamp,
        properties.conversion_value
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND event = '$conversion'
        AND ${dateFilter}
      ORDER BY distinct_id ASC, timestamp ASC
      LIMIT 50000
    `

    // MONEY-RAIL: wired Tinybird-first (sessions_conversions) with HogQL fallback,
    // via readTb — same (site_id, date range) params as the sessions_pageviews read
    // above. Pipe named rows remapped to the [distinct_id, timestamp, conversion_value]
    // positional shape the consumer destructures, byte-identical to the HogQL path.
    const convRows = await readTb(
      'sessions_conversions',
      { site_id: posthogSiteId, date_from_ts: dateFromTs, date_to_ts: dateToTs },
      convSql, 'sessions_conversions',
      tb => tb.map(r => [r.distinct_id, r.timestamp, r.conversion_value])
    )

    // Merge and sort all events per distinct_id
    const eventsByVisitor = new Map()

    for (const row of pvRows) {
      const [distinctId, timestamp, pageUrl, utmSource, utmMedium, utmCampaign] = row
      if (!eventsByVisitor.has(distinctId)) eventsByVisitor.set(distinctId, [])
      eventsByVisitor.get(distinctId).push({
        event: '$pageview',
        timestamp,
        page_url: pageUrl || null,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
        conversion_value: null
      })
    }

    for (const row of convRows) {
      const [distinctId, timestamp, conversionValue] = row
      if (!eventsByVisitor.has(distinctId)) eventsByVisitor.set(distinctId, [])
      eventsByVisitor.get(distinctId).push({
        event: '$conversion',
        timestamp,
        page_url: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        conversion_value: conversionValue ? Number(conversionValue) || 0 : 0
      })
    }

    // Sort each visitor's events by timestamp
    for (const [, events] of eventsByVisitor) {
      events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    }

    // Derive sessions per visitor and collect aggregates
    let allSessions = []
    const dailyCounts = new Map()

    for (const [, events] of eventsByVisitor) {
      const sessions = deriveSessions(events)
      allSessions = allSessions.concat(sessions)

      for (const sess of sessions) {
        const day = sess.started_at.split('T')[0]
        dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1)
      }
    }

    const aggregates = sessionAggregates(allSessions)

    // Build time series sorted by date
    const timeSeries = Array.from(dailyCounts.entries())
      .map(([date, count]) => ({ date, sessions: count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    res.status(200).json({
      success: true,
      data: {
        ...aggregates,
        time_series: timeSeries,
        // Honest note: derived on read, not materialized
        derived_from_events: true,
        session_timeout_minutes: 30
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: 'Session overview query failed' })
  }
}

/**
 * GET /api/sessions?site_key=X&distinct_id=Y
 * Returns per-visitor session list for the explanation modal.
 */
export async function visitorSessions(req, res) {
  try {
    const { distinct_id } = req.query
    const posthogSiteId = String(req.site.id)
    if (!distinct_id) {
      return res.status(400).json({ success: false, data: null, error: 'distinct_id is required' })
    }

    const sql = `
      SELECT
        event,
        timestamp,
        properties.page_url,
        properties.utm_source,
        properties.utm_medium,
        properties.utm_campaign,
        properties.conversion_value
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND distinct_id = '${esc(distinct_id)}'
        AND (event = '$pageview' OR event = '$conversion')
      ORDER BY timestamp ASC
      LIMIT 500
    `

    // MONEY-RAIL (NOT wired): reads event='$conversion' + conversion_value.
    // Held on HogQL, flagged for separate review.
    const rows = await _queryHogQL(sql, 'visitor_sessions')

    const events = rows.map(([
      event, timestamp, pageUrl,
      utmSource, utmMedium, utmCampaign, conversionValue
    ]) => ({
      event,
      timestamp,
      page_url: pageUrl || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      conversion_value: conversionValue ? Number(conversionValue) || 0 : null
    }))

    const sessions = deriveSessions(events)
    const annotated = annotateSessions(sessions)

    res.status(200).json({
      success: true,
      data: {
        distinct_id,
        sessions: annotated.sessions,
        converting_session_index: annotated.converting_session_index,
        session_count: sessions.length,
        derived_from_events: true,
        session_timeout_minutes: 30
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: 'Visitor sessions query failed' })
  }
}
