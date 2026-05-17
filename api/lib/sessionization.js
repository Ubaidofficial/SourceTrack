// Sessionization utility — derives sessions from event arrays on read.
// NOT materialized: sessions are computed at query time from raw pageview events.
// Session definition (ATTRIBUTION.md P3): continuous visit period for a given identity,
// separated by 30 minutes of inactivity or a new browser context.

const SESSION_TIMEOUT_MINUTES = 30

/**
 * Derive sessions from a chronologically sorted array of events for a single visitor.
 * @param {Array} events — array of event objects with timestamp (ISO string or Date),
 *   event name, and properties. Must be sorted by timestamp ASC.
 * @returns {Array} session objects
 */
export function deriveSessions(events) {
  if (!events || events.length === 0) return []

  const sessions = []
  let currentSession = null

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const ts = new Date(ev.timestamp).getTime()

    if (!currentSession) {
      currentSession = startSession(ev, ts, i)
      continue
    }

    const prevTs = new Date(events[i - 1].timestamp).getTime()
    const gapMinutes = (ts - prevTs) / (1000 * 60)

    if (gapMinutes > SESSION_TIMEOUT_MINUTES) {
      finalizeSession(currentSession, events, i - 1)
      sessions.push(currentSession)
      currentSession = startSession(ev, ts, i)
    } else {
      currentSession.event_count += 1
      currentSession.pageview_count += ev.event === '$pageview' ? 1 : 0
      if (ev.event === '$conversion') {
        currentSession.contains_conversion = true
        currentSession.conversion_value += ev.conversion_value || 0
      }
      currentSession.exit_page = ev.page_url || ev.properties?.page_url || null
    }
  }

  if (currentSession) {
    finalizeSession(currentSession, events, events.length - 1)
    sessions.push(currentSession)
  }

  return sessions
}

function startSession(firstEvent, ts, index) {
  const props = firstEvent.properties || {}
  return {
    session_index: index, // temporary, reassigned later
    started_at: firstEvent.timestamp,
    ended_at: firstEvent.timestamp,
    duration_seconds: 0,
    pageview_count: firstEvent.event === '$pageview' ? 1 : 0,
    event_count: 1,
    entry_page: firstEvent.page_url || props.page_url || null,
    exit_page: firstEvent.page_url || props.page_url || null,
    entry_source: firstEvent.utm_source || props.utm_source || null,
    entry_medium: firstEvent.utm_medium || props.utm_medium || null,
    entry_campaign: firstEvent.utm_campaign || props.utm_campaign || null,
    is_direct_entry: isDirect(firstEvent.utm_source || props.utm_source),
    contains_conversion: firstEvent.event === '$conversion',
    conversion_value: firstEvent.event === '$conversion' ? (firstEvent.conversion_value || 0) : 0
  }
}

function finalizeSession(session, events, lastIndex) {
  const startTs = new Date(session.started_at).getTime()
  const endTs = new Date(events[lastIndex].timestamp).getTime()
  session.ended_at = events[lastIndex].timestamp
  session.duration_seconds = Math.max(0, Math.round((endTs - startTs) / 1000))
  session.exit_page = events[lastIndex].page_url || events[lastIndex].properties?.page_url || session.exit_page
}

function isDirect(source) {
  return !source || source === '' || source.toLowerCase() === 'direct'
}

/**
 * Compute session aggregates from an array of sessions.
 * @param {Array} sessions
 * @returns {Object} aggregate stats
 */
export function sessionAggregates(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      total_sessions: 0,
      avg_duration_seconds: 0,
      avg_pageviews_per_session: 0,
      conversion_sessions: 0,
      total_conversion_value: 0
    }
  }

  const total = sessions.length
  const totalDuration = sessions.reduce((s, sess) => s + (sess.duration_seconds || 0), 0)
  const totalPageviews = sessions.reduce((s, sess) => s + (sess.pageview_count || 0), 0)
  const conversionSessions = sessions.filter(s => s.contains_conversion).length
  const totalConvValue = sessions.reduce((s, sess) => s + (sess.conversion_value || 0), 0)

  return {
    total_sessions: total,
    avg_duration_seconds: Math.round(totalDuration / total),
    avg_pageviews_per_session: Math.round((totalPageviews / total) * 10) / 10,
    conversion_sessions: conversionSessions,
    total_conversion_value: totalConvValue
  }
}

/**
 * Assign session indices and find converting session index.
 * @param {Array} sessions
 * @returns {Object} { sessions: Array, converting_session_index: number|null }
 */
export function annotateSessions(sessions) {
  let convertingIndex = null
  sessions.forEach((sess, idx) => {
    sess.session_index = idx + 1
    if (sess.contains_conversion && convertingIndex === null) {
      convertingIndex = idx + 1
    }
  })
  return { sessions, converting_session_index: convertingIndex }
}
