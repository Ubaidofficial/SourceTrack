import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { dispatchWebhook } from '../lib/webhook.js'
import { sendMetaCAPI, sendGoogleConversion, sendMicrosoftConversion, sendLinkedInConversion, sendTikTokConversion } from '../lib/conversion-sync.js'
import { getSupabase } from '../lib/supabase.js'

function getFirstTouchFields(body = {}) {
  const props = body.properties || {}
  return {
    first_touch_source:   body.first_touch_source   || body.firstTouchSource   || props.first_touch_source   || props.firstTouchSource   || 'direct',
    first_touch_medium:   body.first_touch_medium   || body.firstTouchMedium   || props.first_touch_medium   || props.firstTouchMedium   || 'none',
    first_touch_campaign: body.first_touch_campaign || body.firstTouchCampaign || props.first_touch_campaign || props.firstTouchCampaign || ''
  }
}

// Alias kept for the CAPI block readability — same singleton underneath.
const getCapiSupabase = getSupabase

export async function conversionOffline(req, res) {
  try {
    const value = req.body.conversion_value
    if (value === undefined || value === null || typeof value !== 'number' || isNaN(value)) {
      return res.status(400).json({ success: false, data: null, error: 'conversion_value must be a number' })
    }

    const userId      = typeof req.body.user_id      === 'string' ? req.body.user_id.trim()      : null
    const anonymousId = typeof req.body.anonymous_id === 'string' ? req.body.anonymous_id.trim() : null

    if (!userId && !anonymousId) {
      return res.status(400).json({ success: false, data: null, error: 'user_id or anonymous_id is required for identity linking' })
    }

    const distinctId = userId || anonymousId

    let eventTimestamp = new Date().toISOString()
    if (typeof req.body.timestamp === 'string') {
      const parsed = new Date(req.body.timestamp)
      if (!isNaN(parsed.getTime())) eventTimestamp = req.body.timestamp
    }

    const props = {
      site_id:          req.site.id,
      is_conversion:    true,
      conversion_value: value,
      ...getFirstTouchFields(req.body),
      ingestion_method: 'offline',
      server_timestamp: eventTimestamp,
      ip_address:       req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null,
      user_agent:       req.headers['user-agent'] || null
    }

    if (userId)      props.user_id      = userId
    if (anonymousId) props.anonymous_id = anonymousId

    if (typeof req.body.external_id     === 'string' && req.body.external_id.trim())     props.external_id     = req.body.external_id.trim()
    if (typeof req.body.conversion_type === 'string' && req.body.conversion_type.trim()) props.conversion_type = req.body.conversion_type.trim()
    if (typeof req.body.form_name       === 'string' && req.body.form_name.trim())       props.form_name       = req.body.form_name.trim().slice(0, 120).replace(/[^a-zA-Z0-9 _-]/g, '')
    if (typeof req.body.order_id        === 'string' && req.body.order_id.trim())        props.order_id        = req.body.order_id.trim()
    if (typeof req.body.email           === 'string' && req.body.email.trim())           props.email           = req.body.email.trim().toLowerCase()
    if (typeof req.body.currency        === 'string' && req.body.currency.trim())        props.currency        = req.body.currency.trim().toUpperCase()

    // UTM fields (passed through for attribution stitching)
    ;['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','fbclid','msclkid','ttclid','li_fat_id'].forEach(k => {
      if (typeof req.body[k] === 'string' && req.body[k].trim()) props[k] = req.body[k].trim()
    })

    const orderId = props.order_id || null
    if (orderId) props.external_event_id = `${req.site.id}:${orderId}:${props.conversion_type || 'conversion'}`

    ph.capture({ distinctId, event: '$conversion', properties: props })

    // Fire CAPI integrations async — same as online conversion route
    try {
      getCapiSupabase()
        .from('sites')
        .select('meta_pixel_id,meta_capi_token,google_ads_customer_id,google_ads_conversion_action_id,google_ads_developer_token,google_ads_access_token,microsoft_tag_id,microsoft_capi_token,linkedin_partner_id,linkedin_capi_token,tiktok_pixel_id,tiktok_access_token')
        .eq('id', req.site.id)
        .single()
        .then(({ data: capiSite }) => {
          if (!capiSite) return
          Promise.allSettled([
            sendMetaCAPI(capiSite,     { ...props }),
            sendGoogleConversion(capiSite, props),
            sendMicrosoftConversion(capiSite, props),
            sendLinkedInConversion(capiSite,  props),
            sendTikTokConversion(capiSite,    { ...props })
          ]).then(results => results.forEach((r, i) => {
            if (r.status === 'rejected') console.error(`[offline CAPI ${i}]`, r.reason?.message)
          }))
        })
    } catch (_capiErr) { /* never block offline conversion response */ }

    dispatchWebhook('conversion.offline', props)

    res.status(200).json({
      success: true,
      data: { received: true, distinct_id: distinctId, ingestion_method: 'offline' },
      error: null
    })
  } catch (err) {
    console.error('[conversion-offline] error:', err?.message, { site_id: req.site?.id })
    res.status(500).json({ success: false, data: null, error: 'Offline conversion failed' })
  }
}
