import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import NodeCache from 'node-cache'
import { ph } from '../lib/posthog.js'
import { dispatchWebhook } from '../lib/webhook.js'
import { sendMetaCAPI, sendGoogleConversion, sendMicrosoftConversion, sendLinkedInConversion, sendTikTokConversion } from '../lib/conversion-sync.js'
import { getSupabase } from '../lib/supabase.js'
import { normalizeUtm, getFirstTouchFields } from '../lib/utils.js'
import { hasFeature } from '../lib/plan-features.js'

// In-memory dedup cache — 24h TTL. Prevents duplicate conversions when:
// - Form submits twice (double-click, retry)
// - Beacon fires twice
// Keys: external_event_id (site_id:order_id:type) → true
// Note: restarts lose the cache. For absolute dedup use a DB — this catches
// the common case (same session, same minute) without a DB round-trip.
const dedupCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 })

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

// Alias kept for the CAPI block readability — same singleton underneath.
const getCapiSupabase = getSupabase

export async function conversion(req, res) {
  try {
    const enriched = enrich(req)

    const props = {
      site_id: req.site.id,
      anonymous_id: req.body.anonymous_id,
      is_conversion: true,
      conversion_value: req.body.conversion_value,
      ...getFirstTouchFields(req.body),
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
      // Feature: custom event properties — any object passed as `properties` is merged in
      ...(req.body.properties && typeof req.body.properties === 'object' && !Array.isArray(req.body.properties)
        ? { custom_properties: req.body.properties }
        : {})
    }

    if (typeof req.body.conversion_type === 'string') {
      const ct = req.body.conversion_type.trim()
      if (ct.length > 0) props.conversion_type = ct
    }
    if (typeof req.body.form_name === 'string') {
      const fn = req.body.form_name.trim().slice(0, 120).replace(/[^a-zA-Z0-9 _-]/g, '')
      if (fn.length > 0) props.form_name = fn
    }

    const orderId = req.body.order_id || req.body.orderId || null
    const externalEventId = orderId
      ? `${req.site.id}:${orderId}:${props.conversion_type || 'conversion'}`
      : null
    props.external_event_id = externalEventId

    // Deduplication — skip if this exact external_event_id was seen in the last 24h
    if (externalEventId) {
      if (dedupCache.get(externalEventId)) {
        return res.status(200).json({ success: true, data: { received: true, dedup_skipped: true }, error: null })
      }
      dedupCache.set(externalEventId, true)
    }

    ph.capture({
      distinctId: req.body.anonymous_id || uuidv4(),
      event: '$conversion',
      properties: props
    })

    // CAPI sync — fire async, never block response. Gated by plan; free tier
    // skips the outbound fan-out entirely to keep costs down.
    if (hasFeature(req.site?.plan, 'capi_server_side')) try {
      getCapiSupabase()
        .from('sites')
        .select('meta_pixel_id,meta_capi_token,google_ads_customer_id,google_ads_conversion_action_id,google_ads_developer_token,microsoft_tag_id,microsoft_capi_token,linkedin_partner_id,linkedin_capi_token,tiktok_pixel_id,tiktok_access_token')
        .eq('id', req.site.id)
        .single()
        .then(({ data: capiSite }) => {
          if (!capiSite) return
          Promise.allSettled([
            sendMetaCAPI(capiSite, { ...props, ip_address: req.ip }),
            sendGoogleConversion(capiSite, props),
            sendMicrosoftConversion(capiSite, props),
            sendLinkedInConversion(capiSite, props),
            sendTikTokConversion(capiSite, { ...props, ip_address: req.ip })
          ]).then(results => results.forEach((r, i) => {
            if (r.status === 'rejected') console.error(`[CAPI ${i}]`, r.reason?.message)
          }))
        })
    } catch (_capiErr) { /* never block conversion response */ }

    dispatchWebhook('conversion', props)

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (err) {
    console.error('[conversion] ingestion error:', err?.message, { site_id: req.site?.id, type: req.body?.conversion_type })
    res.status(500).json({ success: false, data: null, error: 'Conversion failed' })
  }
}
