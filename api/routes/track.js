import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { sendMetaCAPI, sendGoogleConversion, sendMicrosoftConversion, sendLinkedInConversion } from '../lib/conversion-sync.js'
import { createClient as _sbClient } from '@supabase/supabase-js'
const _convSupabase = _sbClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { realtime: { transport: WebSocket } })

function enrich(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || ''
  const ua = req.headers['user-agent'] || ''
  const parser = new UAParser(ua)

  let country = null
  if (ip) {
    const geo = geoip.lookup(ip)
    country = geo?.country || null
  }

  return {
    device_type: parser.getDevice().type || 'desktop',
    country,
    server_timestamp: new Date().toISOString(),
    ai_source: req.ai_source || null
  }
}

function normalizeUtm(value) {
  if (!value || typeof value !== 'string') return value
  return value.trim().toLowerCase()
}

export async function track(req, res) {
  try {
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
        country: enriched.country,
        server_timestamp: enriched.server_timestamp,
        ingestion_method: 'server_routed'
      }
    })

    // Conversion sync to ad platforms
    if (req.body.event === '$conversion' || req.body.event_type === 'conversion') {
      const { data: convSite } = await _convSupabase
        .from('sites')
        .select('meta_pixel_id, meta_capi_token, google_ads_customer_id, google_ads_conversion_action_id, google_ads_developer_token, microsoft_tag_id, microsoft_capi_token, linkedin_partner_id, linkedin_capi_token')
        .eq('site_key', req.body.site_key)
        .single()

      if (convSite) {
        Promise.allSettled([
          sendMetaCAPI(convSite, { ...req.body, ip_address: req.ip }),
          sendGoogleConversion(convSite, req.body),
          sendMicrosoftConversion(convSite, req.body),
          sendLinkedInConversion(convSite, req.body)
        ]).then(results => results.forEach((r, i) => {
          if (r.status === 'rejected') console.error(`[ConvSync ${i}]`, r.reason?.message)
        }))
      }
    }

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (_err) {
    res.status(500).json({ success: false, data: null, error: 'Track failed' })
  }
}