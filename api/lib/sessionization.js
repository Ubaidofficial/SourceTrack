// Sessionization utility — derives sessions from event arrays on read.
// NOT materialized: sessions are computed at query time from raw pageview events.
// Session definition (ATTRIBUTION.md P3): continuous visit period for a given identity,
// separated by 30 minutes of inactivity OR a change in acquisition context
// (utm_source/medium/campaign or a paid click ID). Internal navigation that
// carries no UTM/click ID inherits the session's existing acquisition context,
// so blog→pricing on the same campaign does NOT create a new session.

const SESSION_TIMEOUT_MINUTES = 30

/**
 * Build an acquisition-context key for an event. Returns null when the event
 * carries no acquisition signal — those events inherit the session's entry
 * key instead of triggering a split.
 *
 * Path/title/page-URL changes are intentionally NOT part of the key: they
 * represent internal navigation, not a new acquisition.
 */
function acquisitionKey(ev) {
  const props = ev.properties || {}
  const pick = (k) => ev[k] || props[k] || null
  const src   = pick('utm_source')
  const med   = pick('utm_medium')
  const camp  = pick('utm_campaign')
  const click = pick('gclid') || pick('gbraid') || pick('wbraid')
    || pick('fbclid') || pick('msclkid') || pick('ttclid') || pick('li_fat_id')
  if (!src && !med && !camp && !click) return null
  return [src || '', med || '', camp || '', click || ''].join('|').toLowerCase()
}

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

    // Acquisition-context split: a non-null acquisition key that differs from
    // the session's entry key opens a new session. Internal navigation (no
    // UTM/click ID) leaves the session intact. Without this, Campaign A
    // landing → Campaign B landing within the 30-min window would collapse
    // into one session and under-count distinct campaign touches.
    const evAcqKey = acquisitionKey(ev)
    const acquisitionChanged = evAcqKey !== null && evAcqKey !== currentSession.acquisition_key

    if (gapMinutes > SESSION_TIMEOUT_MINUTES || acquisitionChanged) {
      finalizeSession(currentSession, events, i - 1)
      sessions.push(currentSession)
      currentSession = startSession(ev, ts, i)
    } else {
      currentSession.event_count += 1
      currentSession.pageview_count += ev.event === '$pageview' ? 1 : 0
      if (ev.event === '$conversion') {
        currentSession.contains_conversion = true
        currentSession.conversion_value += Number(ev.conversion_value || 0)
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

/**
 * Derive funnel-specific sessions from a chronologically sorted array of events for a single visitor.
 * Unlike deriveSessions(), deriveFunnelSessions() splits ONLY on a 30-minute inactivity timeout,
 * ignoring acquisition-context (UTM / click ID) changes mid-visit.
 *
 * This restores standard web analytics funnel behavior (GA4 / Plausible / Mixpanel / PostHog)
 * where a visitor navigating across campaign links within 30 minutes remains in a single continuous
 * browsing session for funnel step containment.
 *
 * @param {Array} events — array of event objects sorted by timestamp ASC.
 * @returns {Array} session objects
 */
export function deriveFunnelSessions(events) {
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
        currentSession.conversion_value += Number(ev.conversion_value || 0)
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
    // Same entry_* convention as the four above. getSessionReport's country/device
    // breakdowns read these: the caller already SELECTs country + device_type per
    // pageview, but the session dropped them, so both dims silently bucketed every
    // session under a fabricated 'unknown'. Scalars (not the raw entry event) so nothing
    // extra leaks into the journey/sessions API payloads that serialize a session.
    entry_country: firstEvent.country || props.country || null,
    entry_device_type: firstEvent.device_type || props.device_type || null,
    // Acquisition key is recorded once at session start and compared against
    // every subsequent event's key. Null means "session entered without any
    // UTM/click ID" — a non-null follow-up event still triggers a split.
    acquisition_key: acquisitionKey(firstEvent),
    is_direct_entry: isDirect(firstEvent.utm_source || props.utm_source),
    contains_conversion: firstEvent.event === '$conversion',
    conversion_value: firstEvent.event === '$conversion' ? Number(firstEvent.conversion_value || 0) : 0
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
