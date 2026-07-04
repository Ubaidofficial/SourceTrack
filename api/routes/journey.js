import { queryHogQL } from '../lib/posthog.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { esc } from '../lib/utils.js'
import { deriveSessions, annotateSessions, sessionAggregates } from '../lib/sessionization.js'
import { getSupabase } from '../lib/supabase.js'
import { normalizeSource } from '../lib/source-normalizer.js'

/**
 * Classify a session's entry source using UTM/referrer/AI data.
 * Local helper — does NOT import from analytics.js routes.
 */
function classifyEntrySource(session) {
  if (!session) return 'Direct / None'

  // AI source takes priority
  if (session.entry_ai_source) {
    const norm = normalizeSource(session.entry_ai_source)
    return norm.name
  }

  // UTM source
  if (session.entry_source) {
    const norm = normalizeSource(session.entry_source)
    if (norm.category === 'paid') return norm.name
    const medium = (session.entry_medium || '').toLowerCase()
    if (['cpc', 'ppc', 'paid', 'paid_search'].includes(medium)) {
      return norm.name.endsWith('Ads') ? norm.name : `${norm.name} Ads`
    }
    return norm.name
  }

  // Referrer
  if (session.entry_referrer) {
    try {
      const host = new URL(session.entry_referrer).hostname.replace('www.', '')
      const norm = normalizeSource(host)
      return norm.name
    } catch (_e) { /* invalid URL */ }
  }

  return 'Direct / None'
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
        properties.destination_url,
        properties.source_system,
        properties.ingestion_method
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND distinct_id = '${esc(visitorId)}'
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `

    // Tinybird read cutover (flag-gated via TINYBIRD_READ_ENABLED; null -> HogQL fallback).
    // Pipe param is 'visitor_id' (source filters distinct_id = visitorId). 23 fields mapped in SELECT order.
    const _tb = await queryTinybirdPipe('journey', { site_id: String(req.site.id), visitor_id: String(visitorId) })
    const rows = _tb !== null
      ? _tb.map(r => [r.event_type, r.timestamp, r.page_url, r.referrer, r.utm_source, r.utm_medium, r.utm_campaign, r.ai_source, r.is_conversion, r.conversion_value, r.conversion_type, r.device_type, r.browser_name, r.browser_version, r.os_name, r.os_version, r.country, r.user_id, r.order_id, r.destination_domain, r.destination_url, r.source_system, r.ingestion_method])
      : await queryHogQL(sql, 'journey')

    const events = rows.map(([
      event, timestamp, pageUrl, referrer,
      utmSource, utmMedium, utmCampaign,
      aiSource, isConversion, conversionValue,
      conversionType, deviceType, browserName, browserVersion,
      osName, osVersion, country, userId,
      orderId, destinationDomain, destinationUrl,
      sourceSystem, ingestionMethod
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
      destination_url: destinationUrl || null,
      source_system: sourceSystem || null,
      ingestion_method: ingestionMethod || null
    }))
    const userId = events.find(e => e.user_id)?.user_id || null

    // Query single lead Supabase attribution data
    const { data: convs, error: convErr } = await getSupabase()
      .from('attributed_conversions')
      .select('first_touch_source, first_touch_medium, first_touch_campaign, channel, first_touch_channel, ai_influenced_source, ai_influenced_session_at')
      .eq('site_id', posthogSiteId)
      .eq('distinct_id', visitorId)

    if (convErr) {
      console.error('Failed to query attributed_conversions in journey:', convErr)
    }

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
      sess.entry_source = firstEvent.utm_source || null
      sess.entry_medium = firstEvent.utm_medium || null
      sess.entry_campaign = firstEvent.utm_campaign || null

      // Overwrite first session with Supabase attribution if available
      if (sessions.length === 0 && convs && convs.length > 0) {
        const c = convs[0]
        sess.entry_source = c.first_touch_source || sess.entry_source
        sess.entry_medium = c.first_touch_medium || sess.entry_medium
        sess.entry_campaign = c.first_touch_campaign || sess.entry_campaign
        if (c.first_touch_channel === 'AI Search') {
          sess.entry_ai_source = c.first_touch_source || sess.entry_ai_source
        } else {
          sess.entry_ai_source = null
        }
      }

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
        session_timeout_minutes: 30,
        // Dark-traffic stitching: prior AI session behind a Direct conversion.
        // Non-null only when the attribution engine stitched one deterministically.
        ai_influence: (convs?.[0]?.ai_influenced_source)
          ? { source: convs[0].ai_influenced_source, session_at: convs[0].ai_influenced_session_at || null }
          : null
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: 'Journey query failed' })
  }
}
