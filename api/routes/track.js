import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { normalizeUtm, redactPiiFromObject, isPathExcluded } from '../lib/utils.js'

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
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || ''
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

    ph.capture({
      distinctId: req.body.anonymous_id || uuidv4(),
      event: req.body.event || '$pageview',
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
        gclid: req.body.gclid || null,
        gbraid: req.body.gbraid || null,
        wbraid: req.body.wbraid || null,
        fbclid: req.body.fbclid || null,
        msclkid: req.body.msclkid || null,
        ttclid: req.body.ttclid || null,
        li_fat_id: req.body.li_fat_id || null,
        twclid: req.body.twclid || null,
        ai_source: enriched.ai_source,
        device_type: enriched.device_type,
        browser_name: enriched.browser_name,
        browser_version: enriched.browser_version,
        os_name: enriched.os_name,
        os_version: enriched.os_version,
        country: enriched.country,
        server_timestamp: enriched.server_timestamp,
        ingestion_method: 'server_routed',
        // Feature: custom event properties — any object passed as `properties` is spread
        ...(req.body.properties && typeof req.body.properties === 'object' && !Array.isArray(req.body.properties)
          ? { custom_properties: req.body.properties }
          : {})
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