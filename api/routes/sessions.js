import { queryHogQL } from '../lib/posthog.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { deriveSessions, sessionAggregates, annotateSessions } from '../lib/sessionization.js'
import { esc } from '../lib/utils.js'
import { serializeHogQLDateRange, buildHogQLTimestampFilter } from '../lib/hogql-date.js'

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

    // Tinybird DateTime boundary strings for the sessions_* pipes (space-separated, no T/Z),
    // derived from the SAME serialized range the HogQL filter uses — do not hand-roll formatting.
    const _tbFrom = range.from.match(/'([^']+)'/)?.[1]?.replace('T', ' ').replace('Z', '')
    const _tbTo = range.to.match(/'([^']+)'/)?.[1]?.replace('T', ' ').replace('Z', '')

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

    // Tinybird read cutover (flag-gated via TINYBIRD_READ_ENABLED; null -> HogQL fallback).
    const _tbPv = await queryTinybirdPipe('sessions_pageviews', { site_id: String(req.site.id), date_from_ts: _tbFrom, date_to_ts: _tbTo })
    const pvRows = _tbPv !== null ? _tbPv.map(r => [r.distinct_id, r.timestamp, r.page_url, r.utm_source, r.utm_medium, r.utm_campaign]) : await queryHogQL(pageviewSql, 'sessions_pageviews')

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

    // Tinybird read cutover (flag-gated via TINYBIRD_READ_ENABLED; null -> HogQL fallback).
    const _tbConv = await queryTinybirdPipe('sessions_conversions', { site_id: String(req.site.id), date_from_ts: _tbFrom, date_to_ts: _tbTo })
    const convRows = _tbConv !== null ? _tbConv.map(r => [r.distinct_id, r.timestamp, r.conversion_value]) : await queryHogQL(convSql, 'sessions_conversions')

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

    // Tinybird read cutover (flag-gated via TINYBIRD_READ_ENABLED; null -> HogQL fallback).
    const _tb = await queryTinybirdPipe('visitor_sessions', { site_id: String(req.site.id), distinct_id: String(distinct_id) })
    const rows = _tb !== null
      ? _tb.map(r => [r.event_type, r.timestamp, r.page_url, r.utm_source, r.utm_medium, r.utm_campaign, r.conversion_value])
      : await queryHogQL(sql, 'visitor_sessions')

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
