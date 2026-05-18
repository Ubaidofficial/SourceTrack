import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { dispatchWebhook } from '../lib/webhook.js'
import { sendMetaCAPI, sendGoogleConversion, sendMicrosoftConversion, sendLinkedInConversion, sendTikTokConversion } from '../lib/conversion-sync.js'
import { createClient as _capiClient } from '@supabase/supabase-js'
import _ws from 'ws'

function getFirstTouchFields(body = {}) {
  const props = body.properties || {};

  return {
    first_touch_source:
      body.first_touch_source ||
      body.firstTouchSource ||
      props.first_touch_source ||
      props.firstTouchSource ||
      'direct',

    first_touch_medium:
      body.first_touch_medium ||
      body.firstTouchMedium ||
      props.first_touch_medium ||
      props.firstTouchMedium ||
      'none',

    first_touch_campaign:
      body.first_touch_campaign ||
      body.firstTouchCampaign ||
      props.first_touch_campaign ||
      props.firstTouchCampaign ||
      ''
  };
}


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

function getCapiSupabase() {
  return _capiClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY,
    { realtime: { transport: _ws } })
}

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
      country: enriched.country,
      server_timestamp: enriched.server_timestamp,
      ingestion_method: 'server_routed'
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

    ph.capture({
      distinctId: req.body.anonymous_id || uuidv4(),
      event: '$conversion',
      properties: props
    })

    // CAPI sync — fire async, never block response
    try {
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
  } catch (_err) {
    res.status(500).json({ success: false, data: null, error: 'Conversion failed' })
  }
}
