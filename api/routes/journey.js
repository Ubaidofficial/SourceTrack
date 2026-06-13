import { queryHogQL } from '../lib/posthog.js'
import { esc } from '../lib/utils.js'
import { deriveSessions, annotateSessions, sessionAggregates } from '../lib/sessionization.js'

/**
 * Classify a session's entry source using UTM/referrer/AI data.
 * Local helper — does NOT import from analytics.js routes.
 */
function classifyEntrySource(session) {
  if (!session) return 'Direct'
  // AI source takes priority
  if (session.entry_ai_source) return `AI: ${session.entry_ai_source}`
  // UTM source
  if (session.entry_source) {
    const medium = (session.entry_medium || '').toLowerCase()
    if (['cpc', 'ppc', 'paid', 'paid_search'].includes(medium)) return 'Paid Search'
    if (['email', 'newsletter'].includes(medium)) return 'Email'
    return session.entry_source
  }
  // Referrer
  if (session.entry_referrer) {
    try {
      const host = new URL(session.entry_referrer).hostname.replace('www.', '')
      if (['google.', 'bing.', 'yahoo.', 'duckduckgo.'].some(s => host.includes(s))) return 'Organic Search'
      if (['facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com'].some(s => host.includes(s))) return 'Organic Social'
      return host
    } catch (_e) { /* invalid URL */ }
  }
  return session.is_direct_entry ? 'Direct' : 'Direct'
}

export async function journey(req, res) {
  try {
    const { visitorId } = req.params
    const posthogSiteId = String(req.site.id)
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 500, 1), 500)

    if (!visitorId) {
      return res.status(400).json({ success: false, data: null, error: 'visitorId is required' })
    }

    const sql = `
      SELECT
        event,
        timestamp,
        properties.page_url,
        properties.referrer,
        properties.utm_source,
        properties.utm_medium,
        properties.utm_campaign,
        properties.ai_source,
        properties.is_conversion,
        properties.conversion_value,
        properties.conversion_type,
        properties.device_type,
        properties.browser_name,
        properties.browser_version,
        properties.os_name,
        properties.os_version,
        properties.country,
        properties.user_id,
        properties.order_id,
        properties.destination_domain,
        properties.destination_url
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND distinct_id = '${esc(visitorId)}'
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `

    const rows = await queryHogQL(sql, 'journey')

    const events = rows.map(([
      event, timestamp, pageUrl, referrer,
      utmSource, utmMedium, utmCampaign,
      aiSource, isConversion, conversionValue,
      conversionType, deviceType, browserName, browserVersion,
      osName, osVersion, country, userId,
      orderId, destinationDomain, destinationUrl
    ]) => ({
      event,
      timestamp,
      page_url: pageUrl || null,
      referrer: referrer || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      ai_source: aiSource || null,
      is_conversion: isConversion === true || isConversion === 'true' || isConversion === 1,
      conversion_value: conversionValue ? Number(conversionValue) || 0 : null,
      conversion_type: conversionType || null,
      device_type: deviceType || null,
      browser_name: browserName || null,
      browser_version: browserVersion || null,
      os_name: osName || null,
      os_version: osVersion || null,
      country: country || null,
      user_id: userId || null,
      order_id: orderId || null,
      destination_domain: destinationDomain || null,
      destination_url: destinationUrl || null
    }))
    const userId = events.find(e => e.user_id)?.user_id || null

    // ── Derive sessions from flat events ──
    // deriveSessions expects objects with top-level fields; our events already match.
    // We need to also capture entry_referrer and entry_ai_source for source classification.
    const sessionsRaw = deriveSessions(events)
    const { sessions: annotatedSessions, converting_session_index } = annotateSessions(sessionsRaw)

    // Build event index ranges and nest events inside each session.
    // deriveSessions tracks events by order; we replicate by walking the events array.
    const sessions = []
    let eventCursor = 0
    for (const sess of annotatedSessions) {
      const sessionEvents = events.slice(eventCursor, eventCursor + sess.event_count)
      eventCursor += sess.event_count

      // Enrich session with entry referrer + AI source from first event
      const firstEvent = sessionEvents[0] || {}
      sess.entry_referrer = firstEvent.referrer || null
      sess.entry_ai_source = firstEvent.ai_source || null
      sess.source_label = classifyEntrySource(sess)
      sess.events = sessionEvents

      sessions.push(sess)
    }

    const aggregates = sessionAggregates(annotatedSessions)

    const person = {
      id: visitorId,
      created_at: events[0]?.timestamp || null,
      properties: userId ? { user_id: userId } : {}
    }

    res.status(200).json({
      success: true,
      data: {
        visitor_id: visitorId,
        user_id: userId,
        person,
        events,
        sessions,
        session_aggregates: aggregates,
        converting_session_index,
        event_count: events.length,
        session_count: sessions.length,
        derived_from_events: true,
        session_timeout_minutes: 30
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: 'Journey query failed' })
  }
}
