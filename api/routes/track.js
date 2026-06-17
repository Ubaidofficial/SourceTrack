import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { normalizeUtm, redactPiiFromObject, isPathExcluded, extractCustomParams, sanitizeClientTimestamp, sanitizeValueTrack, sanitizeVerificationToken, normalizeClickIds } from '../lib/utils.js'
import { resolveClientIp } from '../lib/ip-resolver.js'
import { ph } from '../lib/posthog.js'
import { claimPageviewUsage } from '../lib/pageview-limits.js'


import { getSupabase } from '../lib/supabase.js'


// Same crawler pattern used by /api/analytics/collect — keeps PostHog event
// counts clean (Googlebot, Lighthouse, scripted clients don't represent users).
const BOT_UA_PATTERN = /bot|crawl|spider|slurp|mediapartners|adsbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|bingpreview|googleweblight|lighthouse|pagespeed|headlesschrome|phantomjs|selenium|puppeteer|playwright|wget|curl\/|python-requests|axios\/|go-http|java\/|ruby\/|php\//i

async function updateTelemetryMetadata(site, body) {
  try {
    const supabase = getSupabase()
    const now = new Date().toISOString()

    // Parse event domain
    const pageUrl = body.page_url || ''
    let eventDomain = null
    try {
      if (pageUrl) {
        eventDomain = new URL(pageUrl).hostname.replace(/^www\./i, '')
      }
    } catch (_) {}

    // First fetch the latest onboarding_state to prevent race conditions during onboarding
    // (stale cache won't overwrite fresh step-selections in DB)
    const { data } = await supabase
      .from('sites')
      .select('last_seen_at, onboarding_state')
      .eq('id', site.id)
      .single()

    // Authoritative throttle check against fresh DB data
    const freshLastSeenAt = data?.last_seen_at ? new Date(data.last_seen_at).getTime() : 0
    const isStale = !freshLastSeenAt || Number.isNaN(freshLastSeenAt) || Date.now() - freshLastSeenAt > 5 * 60 * 1000

    if (!isStale) return // Skip update, already processed recently

    const currentState = data?.onboarding_state || {}
    const mergedState = {
      ...currentState,
      last_event_at: now,
      last_event_name: body.event || '$pageview',
      last_event_url: pageUrl,
      last_event_domain: eventDomain
    }

    await supabase
      .from('sites')
      .update({
        last_seen_at: now,
        onboarding_state: mergedState
      })
      .eq('id', site.id)
  } catch (err) {
    console.error('[telemetry-update] failed:', err?.message)
  }
}

function enrich(req) {
  const ip = resolveClientIp(req)
  const ua = req.headers['user-agent'] || ''
  const parser = new UAParser(ua)
  const browser = parser.getBrowser()
  const os = parser.getOS()

  let country = null
  if (ip) {
    const geo = geoip.lookup(ip)
    country = geo?.country || null
  }

  return {
    device_type: parser.getDevice().type || 'desktop',
    browser_name: (browser.name || '').toLowerCase() || null,
    browser_version: browser.version || null,
    os_name: os.name || null,
    os_version: os.version || null,
    country,
    server_timestamp: new Date().toISOString(),
    ai_source: req.ai_source || null
  }
}

export async function track(req, res) {
  try {
    // Silent bot drop — return 200 so crawlers don't retry/spam
    const ua = req.headers['user-agent'] || ''
    if (!ua || BOT_UA_PATTERN.test(ua)) {
      return res.status(200).json({ success: true, data: { received: true, filtered: 'bot' }, error: null })
    }

    // Check path exclusions
    if (req.body?.page_url && isPathExcluded(req.body.page_url, req.site?.excluded_paths)) {
      return res.status(200).json({ success: true, data: { received: true, filtered: 'excluded_path' }, error: null })
    }

    const customParams = extractCustomParams(req.body?.page_url, req.site?.custom_url_params)

    // Ingest-side query parameter redaction to prevent PII leaks
    if (req.body) {
      // Normalize destination_url if present to strip query strings and hash fragments (outbound link privacy)
      if (req.body.properties && typeof req.body.properties === 'object' && req.body.properties.destination_url) {
        try {
          const parsedDest = new URL(req.body.properties.destination_url)
          req.body.properties.destination_url = parsedDest.origin + parsedDest.pathname
        } catch (_) {
          let dest = String(req.body.properties.destination_url)
          const qIdx = dest.indexOf('?')
          if (qIdx > -1) dest = dest.substring(0, qIdx)
          const hIdx = dest.indexOf('#')
          if (hIdx > -1) dest = dest.substring(0, hIdx)
          req.body.properties.destination_url = dest
        }
      }

      req.body = redactPiiFromObject(req.body)
      if (req.body.properties && typeof req.body.properties === 'object' && !Array.isArray(req.body.properties)) {
        req.body.properties = redactPiiFromObject(req.body.properties)
      }
    }

    const enriched = enrich(req)
    const clientTimestamp = req.body?.timestamp ? sanitizeClientTimestamp(req.body.timestamp) : null

    // ── Shared field validators (used by form_submit and booking_scheduled) ──
    const validateFormMetadata = (val) => {
      if (typeof val !== 'string') return null
      const cleaned = val.trim()
      if (cleaned.length === 0 || cleaned.length > 120) return null
      const lower = cleaned.toLowerCase()
      if (lower.includes('@')) return null
      const digitCount = (lower.match(/\d/g) || []).length
      if (digitCount >= 6) return null
      if (
        lower.includes('sk_') ||
        lower.includes('pk_') ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('auth') ||
        lower.includes('key') ||
        lower.includes('pass') ||
        lower.includes('card') ||
        lower.includes('cc_')
      ) {
        return null
      }
      if (lower.includes('http://') || lower.includes('https://')) return null
      return cleaned
    }

    const validateFormActionHost = (val) => {
      if (typeof val !== 'string') return null
      const cleaned = val.trim().toLowerCase()
      if (cleaned.length === 0 || cleaned.length > 100) return null
      if (cleaned.includes('@')) return null
      if (cleaned.includes('/') || cleaned.includes('?') || cleaned.includes('#')) return null
      if (cleaned.startsWith('javascript:')) return null
      if (!/^[a-z0-9.-]+$/.test(cleaned)) return null
      return cleaned
    }

    const validatePathname = (val) => {
      if (typeof val !== 'string') return null
      let cleaned = val.trim()
      if (cleaned.length === 0 || cleaned.length > 200) return null

      // Strip query and hash first so we don't reject @ in query params
      const qIdx = cleaned.indexOf('?')
      if (qIdx > -1) cleaned = cleaned.substring(0, qIdx)
      const hIdx = cleaned.indexOf('#')
      if (hIdx > -1) cleaned = cleaned.substring(0, hIdx)

      const lower = cleaned.toLowerCase()
      if (lower.includes('@')) return null
      if (lower.startsWith('javascript:')) return null

      // Keep pathname only
      if (lower.indexOf('http://') !== -1 || lower.indexOf('https://') !== -1) {
        try {
          const u = new URL(cleaned)
          cleaned = u.pathname
        } catch (_) {
          return null
        }
      }

      // Ensure starts with '/'
      if (cleaned.length === 0) return null
      if (cleaned.charAt(0) !== '/') {
        cleaned = '/' + cleaned
      }

      // Final check on clean pathname
      if (cleaned.toLowerCase().includes('@')) return null
      return cleaned
    }

    // Ingest-side sanitization for form submit metadata
    let form_provider = null
    let form_id = null
    let form_name = null
    let form_action_host = null
    let form_action_path = null
    let page_path = null

    if (req.body?.event === 'form_submit') {
      const p = req.body.properties || {}

      if (typeof p.form_provider === 'string') {
        const fp = p.form_provider.trim().toLowerCase()
        if (['native', 'webflow', 'wordpress', 'unknown'].includes(fp)) {
          form_provider = fp
        }
      }
      if (!form_provider) form_provider = 'unknown'

      form_id = validateFormMetadata(p.form_id || req.body.form_id)
      form_name = validateFormMetadata(p.form_name || req.body.form_name)
      form_action_host = validateFormActionHost(p.form_action_host)
      form_action_path = validatePathname(p.form_action_path)
      page_path = validatePathname(p.page_path)
    }

    // Ingest-side sanitization for confirmed booking detection metadata
    let booking_provider = null
    let booking_detection_method = null
    let booking_event_type = null
    let booking_page_path = null

    if (req.body?.event === 'booking_scheduled') {
      const p = req.body.properties || {}

      if (typeof p.booking_provider === 'string') {
        const bp = p.booking_provider.trim().toLowerCase()
        if (['calendly', 'calcom'].includes(bp)) booking_provider = bp
      }

      if (typeof p.booking_detection_method === 'string') {
        const bdm = p.booking_detection_method.trim().toLowerCase()
        if (bdm === 'browser_embed_event') booking_detection_method = bdm
      }

      if (typeof p.booking_event_type === 'string') {
        const bet = p.booking_event_type.trim()
        if (['event_scheduled', 'bookingSuccessfulV2'].includes(bet)) booking_event_type = bet
      }

      booking_page_path = validatePathname(p.page_path)
    }

    // Pageview quota claim — 140G-4.
    // Only true $pageview events consume monthly quota. Custom events, conversions,
    // and outbound clicks are excluded. Claim happens here (after all filtering/validation)
    // to avoid burning quota for events that would have been dropped.
    // Fail-open on RPC/DB errors: a counter failure must never block tracking.
    const eventName = req.body?.event || '$pageview'
    if (eventName === '$pageview') {
      try {
        const pvCheck = await claimPageviewUsage(req.site)
        if (!pvCheck.allowed) {
          console.warn('[track] Pageview limit reached for site', req.site?.id, '— limit:', pvCheck.limit, '— skipping capture')
          return res.status(402).json({
            success: false,
            data: { received: false, limit_reached: true },
            error: 'Monthly pageview limit reached'
          })
        }
      } catch (pvErr) {
        // Fail open — DB/RPC error must not block tracking. Log clearly per 140G-4 tradeoff.
        console.error('[track] Pageview limit check failed, failing open:', pvErr?.message, { site_id: req.site?.id })
      }
    }

    ph.capture({
      distinctId: req.body.anonymous_id || uuidv4(),
      event: req.body.event || '$pageview',
      timestamp: clientTimestamp ? new Date(clientTimestamp) : undefined,
      properties: {
        site_id: req.site.id,
        anonymous_id: req.body.anonymous_id,
        page_url: req.body.page_url,
        referrer: req.body.referrer,
        utm_source: normalizeUtm(req.body.utm_source),
        utm_medium: normalizeUtm(req.body.utm_medium),
        utm_campaign: normalizeUtm(req.body.utm_campaign),
        utm_content: normalizeUtm(req.body.utm_content),
        utm_term: normalizeUtm(req.body.utm_term),
        ref_param: normalizeUtm(req.body.ref_param || req.body.ref),
        source_param: normalizeUtm(req.body.source_param || req.body.source),
        via_param: normalizeUtm(req.body.via_param || req.body.via),
        first_touch_source: normalizeUtm(req.body.first_touch_source),
        first_touch_medium: normalizeUtm(req.body.first_touch_medium),
        first_touch_campaign: normalizeUtm(req.body.first_touch_campaign),
        first_touch_timestamp: sanitizeClientTimestamp(req.body.first_touch_timestamp),
        ...normalizeClickIds(req.body),
        utm_id: normalizeUtm(req.body.utm_id),
        st_campaign_id: normalizeUtm(req.body.st_campaign_id),
        st_adgroup_id: normalizeUtm(req.body.st_adgroup_id),
        st_ad_id: normalizeUtm(req.body.st_ad_id),
        st_target_id: normalizeUtm(req.body.st_target_id),
        st_network: sanitizeValueTrack(req.body.st_network),
        st_device: sanitizeValueTrack(req.body.st_device),
        st_matchtype: sanitizeValueTrack(req.body.st_matchtype),
        st_verify: sanitizeVerificationToken(req.body.st_verify),
        ai_source: enriched.ai_source,
        device_type: enriched.device_type,
        browser_name: enriched.browser_name,
        browser_version: enriched.browser_version,
        os_name: enriched.os_name,
        os_version: enriched.os_version,
        country: enriched.country,
        server_timestamp: enriched.server_timestamp,
        ingestion_method: 'server_routed',
        ...(req.body?.event === 'form_submit' ? {
          event_type: 'form_submit',
          form_provider: form_provider,
          form_id: form_id,
          form_name: form_name,
          form_action_host: form_action_host,
          form_action_path: form_action_path,
          page_path: page_path
        } : {}),
        ...(req.body?.event === 'booking_scheduled' ? {
          event_type: 'booking_scheduled',
          booking_provider: booking_provider,
          booking_detection_method: booking_detection_method,
          booking_event_type: booking_event_type,
          page_path: booking_page_path
        } : {}),
        // Feature: custom event properties — any object passed as `properties` is spread
        // Excluded for form_submit and booking_scheduled (fixed schemas, no passthrough)
        ...((req.body?.event === 'form_submit' || req.body?.event === 'booking_scheduled')
          ? {}
          : req.body.properties && typeof req.body.properties === 'object' && !Array.isArray(req.body.properties)
            ? { custom_properties: req.body.properties }
            : {}),
        ...customParams
      }
    })

    // Update telemetry metadata asynchronously & throttled (non-blocking)
    // We use req.site from auth middleware which caches basic details
    try {
      const lastSeenAt = req.site.last_seen_at ? new Date(req.site.last_seen_at).getTime() : 0
      const lastSeenIsStale = !lastSeenAt || Number.isNaN(lastSeenAt) || Date.now() - lastSeenAt > 5 * 60 * 1000
      const shouldUpdate = lastSeenIsStale

      if (shouldUpdate) {
        // Execute without awaiting to avoid blocking response
        updateTelemetryMetadata(req.site, req.body).catch(() => {});
      }
    } catch (_) {}

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (err) {
    console.error('[track] ingestion error:', err?.message, { site_id: req.site?.id, event: req.body?.event })
    res.status(500).json({ success: false, data: null, error: 'Track failed' })
  }
}