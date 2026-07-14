import { queryHogQL } from './posthog.js'
import { queryTinybirdPipe } from './tinybird-read.js'
import { esc, sanitizeVerificationToken } from './utils.js'

// ── Test seam ────────────────────────────────────────────────────────────────
// Mirrors live.js's __setLiveReadDeps (no ESM module mocker in the repo): lets
// unit tests inject stubs for the two read backends. Production never calls the
// setter, so it uses the real imports and behaves identically.
let _queryTinybirdPipe = queryTinybirdPipe
let _queryHogQL = queryHogQL
export function __setSetupDoctorReadDeps ({ queryTinybird, queryHog } = {}) {
  if (queryTinybird) _queryTinybirdPipe = queryTinybird
  if (queryHog) _queryHogQL = queryHog
}
export function __resetSetupDoctorReadDeps () {
  _queryTinybirdPipe = queryTinybirdPipe
  _queryHogQL = queryHogQL
}

function normalizeDomain(d) {
  return String(d || '').trim().toLowerCase().replace(/^www\./i, '')
}

/**
 * Perform consolidated setup diagnostics for a site.
 * Does not mutate database state.
 *
 * @param {object} params
 * @param {object} params.site - Supabase site record
 * @param {string|null} params.verificationToken - Optional client-supplied st_verify token
 * @returns {Promise<object>} Diagnostics object containing sanitized status and checks
 */
export async function getSetupDiagnostics({ site, verificationToken = null }) {
  const posthogSiteId = String(site.id)
  const lastSeen = site.last_seen_at ? new Date(site.last_seen_at) : null
  const onboardingState = site.onboarding_state || {}

  const lastEventName = onboardingState.last_event_name || null
  const lastEventUrl = onboardingState.last_event_url || null
  const lastEventDomain = onboardingState.last_event_domain || null

  const registeredDomain = normalizeDomain(site.domain)
  const eventDomain = normalizeDomain(lastEventDomain)

  // 1. Domain Match & Environment Classification
  const isLocal = eventDomain === 'localhost' || eventDomain === '127.0.0.1' || eventDomain.endsWith('.local')

  let envClass = 'none'
  let domainStatus = 'warning'

  if (!eventDomain) {
    envClass = 'unknown'
    domainStatus = 'unknown'
  } else if (!registeredDomain) {
    envClass = 'unknown'
    domainStatus = 'needs_domain'
  } else if (eventDomain === registeredDomain) {
    envClass = 'production'
    domainStatus = 'passed'
  } else if (isLocal) {
    envClass = 'test_env'
    domainStatus = 'test_env'
  } else if (eventDomain.endsWith('.' + registeredDomain)) {
    // Staging or dev subdomains of the registered root domain
    envClass = 'test_env'
    domainStatus = 'test_env'
  } else {
    envClass = 'wrong_domain'
    domainStatus = 'warning'
  }

  // Tinybird-first read helper (Wave-2 read-cutover). Returns the HogQL
  // positional shape so downstream positional access stays byte-identical; a
  // null Tinybird return (flag off / missing config / error) falls back to the
  // unchanged HogQL query. Fail-closed under the test-only TINYBIRD_FORCE_READ
  // (throws instead of silently bypassing to HogQL). Tenant isolation: the
  // pipe's required site_id is the authenticated site.id, never client-supplied.
  const forceRead = process.env.TINYBIRD_FORCE_READ === 'true'
  const readTb = async (pipeName, params, hogSql, hogName, mapRows) => {
    const tb = await _queryTinybirdPipe(pipeName, params)
    if (tb !== null) return mapRows(tb)
    if (forceRead) throw new Error(`[tinybird-force-read] ${pipeName} returned null under TINYBIRD_FORCE_READ — dispatch path not exercised`)
    return _queryHogQL(hogSql, hogName)
  }

  // 2. Fetch HogQL queries in parallel
  const queries = [
    // [0] Pageview count in the last 30 days — WIRED (pure pageview count).
    readTb('doctor_pageviews_30d', { site_id: posthogSiteId }, `
      SELECT count()
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND event = '$pageview'
        AND timestamp >= now() - INTERVAL 30 DAY
    `, 'doctor_pageviews_30d', tb => [[tb?.[0]?.pageviews_30d ?? 0]]).catch(err => {
      if (forceRead) throw err
      console.warn('[setup-doctor] doctor_pageviews_30d query failed:', err?.message || err)
      return null
    }),
    // [1] Last conversion in the last 30 days — MONEY-RAIL (NOT wired): reads
    // event='$conversion' + conversion_type. HogQL only; flagged for review.
    _queryHogQL(`
      SELECT timestamp, properties.conversion_type AS conversion_type
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND event = '$conversion'
        AND timestamp >= now() - INTERVAL 30 DAY
      ORDER BY timestamp DESC
      LIMIT 1
    `, 'doctor_last_conversion').catch(err => {
      console.warn('[setup-doctor] doctor_last_conversion query failed:', err?.message || err)
      return null
    }),
    // [2] Last event with click ID in the last 30 days — MONEY-RAIL (NOT wired):
    // reads click-ID attribution params. HogQL only; flagged for review.
    _queryHogQL(`
      SELECT properties.gclid, properties.gbraid, properties.wbraid, properties.fbclid, properties.msclkid, properties.ttclid, properties.twclid, properties.li_fat_id, properties.li_fatid, properties.dclid, properties.snapclid, properties.pclid, properties.sccid, properties.ko_click_id
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND timestamp >= now() - INTERVAL 30 DAY
        AND (
          (properties.gclid != '' AND isNotNull(properties.gclid)) OR
          (properties.gbraid != '' AND isNotNull(properties.gbraid)) OR
          (properties.wbraid != '' AND isNotNull(properties.wbraid)) OR
          (properties.fbclid != '' AND isNotNull(properties.fbclid)) OR
          (properties.msclkid != '' AND isNotNull(properties.msclkid)) OR
          (properties.ttclid != '' AND isNotNull(properties.ttclid)) OR
          (properties.twclid != '' AND isNotNull(properties.twclid)) OR
          (properties.li_fat_id != '' AND isNotNull(properties.li_fat_id)) OR
          (properties.li_fatid != '' AND isNotNull(properties.li_fatid)) OR
          (properties.dclid != '' AND isNotNull(properties.dclid)) OR
          (properties.snapclid != '' AND isNotNull(properties.snapclid)) OR
          (properties.pclid != '' AND isNotNull(properties.pclid)) OR
          (properties.sccid != '' AND isNotNull(properties.sccid)) OR
          (properties.ko_click_id != '' AND isNotNull(properties.ko_click_id))
        )
      ORDER BY timestamp DESC
      LIMIT 1
    `, 'doctor_last_click_id').catch(err => {
      console.warn('[setup-doctor] doctor_last_click_id query failed:', err?.message || err)
      return null
    }),
    // [3] Check if any paid params were seen at all in the last 30 days —
    // MONEY-RAIL (NOT wired): reads click-ID + campaign-ID attribution params.
    // HogQL only; flagged for review.
    _queryHogQL(`
      SELECT count()
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND timestamp >= now() - INTERVAL 30 DAY
        AND (
          (properties.gclid != '' AND isNotNull(properties.gclid)) OR
          (properties.gbraid != '' AND isNotNull(properties.gbraid)) OR
          (properties.wbraid != '' AND isNotNull(properties.wbraid)) OR
          (properties.fbclid != '' AND isNotNull(properties.fbclid)) OR
          (properties.msclkid != '' AND isNotNull(properties.msclkid)) OR
          (properties.ttclid != '' AND isNotNull(properties.ttclid)) OR
          (properties.twclid != '' AND isNotNull(properties.twclid)) OR
          (properties.li_fat_id != '' AND isNotNull(properties.li_fat_id)) OR
          (properties.li_fatid != '' AND isNotNull(properties.li_fatid)) OR
          (properties.dclid != '' AND isNotNull(properties.dclid)) OR
          (properties.snapclid != '' AND isNotNull(properties.snapclid)) OR
          (properties.pclid != '' AND isNotNull(properties.pclid)) OR
          (properties.sccid != '' AND isNotNull(properties.sccid)) OR
          (properties.ko_click_id != '' AND isNotNull(properties.ko_click_id)) OR
          (properties.utm_id != '' AND isNotNull(properties.utm_id)) OR
          (properties.st_campaign_id != '' AND isNotNull(properties.st_campaign_id)) OR
          (properties.st_adgroup_id != '' AND isNotNull(properties.st_adgroup_id))
        )
    `, 'doctor_paid_params_count').catch(err => {
      console.warn('[setup-doctor] doctor_paid_params_count query failed:', err?.message || err)
      return null
    })
  ]

  // Optional Token Verification Check (HogQL query [4])
  let tokenPromise = null
  const sanitizedToken = verificationToken ? sanitizeVerificationToken(verificationToken) : null
  if (sanitizedToken) {
    // [4] Verification-token presence, trailing 15 min — WIRED (pure count).
    tokenPromise = readTb('doctor_token_verify', { site_id: posthogSiteId, st_verify: sanitizedToken }, `
      SELECT count()
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND properties.st_verify = '${esc(sanitizedToken)}'
        AND timestamp >= now() - INTERVAL 15 MINUTE
    `, 'doctor_token_verify', tb => [[tb?.[0]?.token_verify_count ?? 0]]).catch(err => {
      if (forceRead) throw err
      console.warn('[setup-doctor] doctor_token_verify query failed:', err?.message || err)
      return null
    })
    queries.push(tokenPromise)
  }

  const results = await Promise.all(queries)

  const pageviews30d = results[0]?.[0]?.[0] ? parseInt(results[0][0][0], 10) : 0
  const lastConvRow = results[1]?.[0]
  const lastClickRow = results[2]?.[0]
  const paidParamsCount = results[3]?.[0]?.[0] ? parseInt(results[3][0][0], 10) : 0
  const tokenVerifyCount = tokenPromise ? (results[4]?.[0]?.[0] ? parseInt(results[4][0][0], 10) : 0) : 0

  let privacySignalsCount = null
  try {
    const tb = await _queryTinybirdPipe('doctor_privacy_signals_30d', { site_id: posthogSiteId })
    if (tb !== null) {
      privacySignalsCount = tb?.[0]?.privacy_signals_30d ?? 0
    }
  } catch (err) {
    if (forceRead) throw err
    console.warn('[setup-doctor] doctor_privacy_signals_30d query failed:', err?.message || err)
  }

  // 3. Process verification token results
  const tokenSupplied = sanitizedToken !== null
  const tokenMatched = tokenVerifyCount > 0

  // 4. Determine setup health state
  let overallStatus = 'pending'
  let severity = 'info'
  let message = 'We are waiting for your first tracking event.'

  const checks = []

  if (!lastSeen) {
    overallStatus = 'pending'
    severity = 'info'
    message = 'We are waiting for your first tracking event.'
    checks.push({ label: 'Tracker events', status: 'pending', detail: 'No events have been received yet' })
    checks.push({ label: 'Domain match', status: 'pending', detail: 'Waiting for event domain telemetry' })
  } else {
    const now = Date.now()
    const diffMs = now - lastSeen.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)

    let freshnessStatus = 'fresh'
    if (diffHours > 24) {
      if (pageviews30d < 5) {
        freshnessStatus = 'no_recent_traffic'
      } else if (diffHours <= 48) {
        freshnessStatus = 'stale'
      } else {
        freshnessStatus = 'critical'
      }
    }

    // Populate checks list for unified UX
    checks.push({
      label: 'Tracker events',
      status: freshnessStatus === 'fresh' ? 'passed' : (freshnessStatus === 'no_recent_traffic' ? 'passed' : (freshnessStatus === 'stale' ? 'warning' : 'failed')),
      detail: freshnessStatus === 'fresh' ? 'Last event received recently'
        : freshnessStatus === 'no_recent_traffic' ? 'No recent events (low traffic site)'
        : freshnessStatus === 'stale' ? `Last event received ${Math.round(diffHours)} hours ago`
        : 'No events received in over 48 hours'
    })

    checks.push({
      label: 'Domain match',
      status: domainStatus === 'passed' ? 'passed' : (domainStatus === 'test_env' ? 'passed' : (domainStatus === 'unknown' || domainStatus === 'needs_domain' ? 'pending' : 'warning')),
      detail: domainStatus === 'passed' ? 'Events match registered domain'
        : domainStatus === 'test_env' ? `Events matching test environment: ${eventDomain}`
        : domainStatus === 'unknown' ? 'Waiting for domain telemetry'
        : domainStatus === 'needs_domain' ? 'Registered domain is missing'
        : `Events received from a different domain: ${eventDomain}`
    })

    if (domainStatus === 'warning') {
      overallStatus = 'wrong_domain'
      severity = 'warning'
      message = tokenMatched
        ? 'Verification event received, but it came from a different domain.'
        : `We detected events from '${eventDomain}', but this site is registered for '${site.domain}'.`
    } else if (domainStatus === 'needs_domain') {
      overallStatus = 'needs_domain'
      severity = 'warning'
      message = tokenMatched
        ? 'Verification event received, but registered domain is missing.'
        : 'Tracking events received, but no registered domain is set. Please register your website domain.'
    } else if (domainStatus === 'unknown') {
      overallStatus = 'warning'
      severity = 'warning'
      message = 'We received tracking events, but domain telemetry is not available yet.'
    } else if (domainStatus === 'test_env') {
      overallStatus = 'test_env'
      severity = 'info'
      message = tokenMatched
        ? 'Verification event received from a test environment.'
        : 'Test traffic detected from localhost/staging. Continue testing or view production reports.'
    } else {
      if (freshnessStatus === 'no_recent_traffic') {
        overallStatus = 'no_recent_traffic'
        severity = 'info'
        message = `No recent events detected. Last event was received ${Math.round(diffHours)} hours ago (low traffic site).`
      } else if (freshnessStatus === 'stale') {
        overallStatus = 'warning'
        severity = 'warning'
        message = `Tracking may need attention. Last event was received ${Math.round(diffHours)} hours ago.`
      } else if (freshnessStatus === 'critical') {
        overallStatus = 'critical'
        severity = 'error'
        message = 'Tracking may be offline. We have not received an event in over 48 hours.'
      } else {
        overallStatus = 'healthy'
        severity = 'success'
        message = tokenMatched
          ? 'Snippet verified successfully!'
          : 'Tracking is healthy. We received an event recently.'
      }
    }

    if (privacySignalsCount !== null && privacySignalsCount > 0) {
      checks.push({
        label: 'Privacy signals (GPC/DNT)',
        status: pageviews30d === 0 ? 'failed' : 'warning',
        detail: `At least ${privacySignalsCount} browsers sent a privacy signal (GPC/DNT) and were not tracked in the last 30 days`
      })

      if (pageviews30d === 0) {
        overallStatus = 'warning'
        severity = 'warning'
        message = `Tracking may need attention. At least ${privacySignalsCount} browsers sent a privacy signal (GPC/DNT) and were not tracked, with 0 pageviews recorded.`
      }
    }
  }

  // 5. Conversion verification
  const conversionDetected = lastConvRow != null
  const lastConversionAt = conversionDetected ? lastConvRow[0] : null
  const lastConversionType = conversionDetected ? lastConvRow[1] : null

  checks.push({
    label: 'Conversion tracking',
    status: conversionDetected ? 'passed' : 'pending',
    detail: conversionDetected ? `Conversions detected (${lastConversionType})` : 'No conversions received in the last 30 days'
  })

  // 6. Paid tracking check
  const paidDetected = paidParamsCount > 0
  let clickIdSeen = false
  let lastClickIdType = null

  if (lastClickRow) {
    const clickIdTypes = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'li_fatid', 'dclid', 'snapclid', 'pclid', 'sccid', 'ko_click_id']
    for (let i = 0; i < clickIdTypes.length; i++) {
      if (lastClickRow[i] && lastClickRow[i] !== '') {
        clickIdSeen = true
        lastClickIdType = clickIdTypes[i]
        break
      }
    }
  }

  // 7. Recommended action
  let actionKey = 'none'
  let actionMessage = 'Tracking is healthy. Ready to view reports.'

  if (!lastSeen) {
    actionKey = 'install_script'
    actionMessage = 'Copy the SourceTrack snippet and paste it into the HTML head of your site.'
  } else if (domainStatus === 'needs_domain') {
    actionKey = 'register_domain'
    actionMessage = 'Please enter your registered domain in site settings.'
  } else if (domainStatus === 'warning') {
    actionKey = 'fix_domain'
    actionMessage = `Update your site registered domain to match '${eventDomain}' or ensure the snippet is installed on the correct site.`
  } else if (!conversionDetected) {
    actionKey = 'test_conversions'
    actionMessage = 'Install conversion event triggers on your checkout or thank-you page to verify conversion tracking.'
  }

  // 8. Return strictly sanitized fields
  return {
    status: overallStatus,
    severity,
    message,
    tracker_install: {
      installed: lastSeen !== null,
      last_seen_at: site.last_seen_at || null,
      last_event_name: lastEventName
    },
    domain_match: {
      status: domainStatus,
      registered_domain: site.domain || null,
      event_domain: lastEventDomain || null,
      last_event_url: lastEventUrl || null
    },
    environment_detection: envClass,
    conversion_setup: {
      detected: conversionDetected,
      last_conversion_at: lastConversionAt,
      last_conversion_type: lastConversionType
    },
    paid_tracking: {
      parameters_detected: paidDetected,
      click_id_seen: clickIdSeen,
      last_click_id_type: lastClickIdType
    },
    verification_token: {
      token_supplied: tokenSupplied,
      token_matched: tokenMatched
    },
    recommended_next_action: {
      action_key: actionKey,
      message: actionMessage
    },
    privacy_suppression: privacySignalsCount !== null ? {
      suppressed_count: privacySignalsCount
    } : null,
    checks
  }
}

/**
 * Lightweight Supabase-only installer status check helper.
 * Does not query PostHog/HogQL.
 * Returns the legacy compatible shape.
 */
export function getBasicInstallStatus(site) {
  if (!site) {
    return {
      verified: false,
      status: 'error',
      last_seen_at: null,
      last_event_name: null,
      last_event_url: null,
      site_key: null,
      domain: null,
      message: 'Verification check failed: site missing'
    }
  }

  const lastSeen = site.last_seen_at ? new Date(site.last_seen_at) : null
  const onboardingState = site.onboarding_state || {}

  const lastEventName = onboardingState.last_event_name || '$pageview'
  const lastEventUrl = onboardingState.last_event_url || ''
  const lastEventDomain = onboardingState.last_event_domain || null

  const registeredDomain = normalizeDomain(site.domain)
  const eventDomain = normalizeDomain(lastEventDomain)

  if (!lastSeen) {
    return {
      verified: false,
      status: 'pending',
      last_seen_at: null,
      last_event_name: null,
      last_event_url: null,
      site_key: site.site_key || null,
      domain: null,
      message: 'Waiting for the first pageview event...'
    }
  }

  if (eventDomain && registeredDomain && eventDomain !== registeredDomain) {
    return {
      verified: false,
      status: 'wrong_domain',
      last_seen_at: site.last_seen_at || null,
      last_event_name: lastEventName,
      last_event_url: lastEventUrl,
      site_key: site.site_key || null,
      domain: lastEventDomain,
      message: `We detected an event from '${lastEventDomain}', but this site is registered for '${site.domain}'.`
    }
  }

  return {
    verified: true,
    status: 'verified',
    last_seen_at: site.last_seen_at || null,
    last_event_name: lastEventName,
    last_event_url: lastEventUrl,
    site_key: site.site_key || null,
    domain: lastEventDomain || site.domain || null,
    message: 'Snippet verified successfully!'
  }
}
