import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { dispatchWebhook } from '../lib/webhook.js'

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


export async function conversionOffline(req, res) {
  try {
    const value = req.body.conversion_value
    if (value === undefined || value === null || typeof value !== 'number' || isNaN(value)) {
      return res.status(400).json({ success: false, data: null, error: 'conversion_value must be a number' })
    }

    const userId = typeof req.body.user_id === 'string' ? req.body.user_id.trim() : null
    const anonymousId = typeof req.body.anonymous_id === 'string' ? req.body.anonymous_id.trim() : null

    if (!userId && !anonymousId) {
      return res.status(400).json({ success: false, data: null, error: 'user_id or anonymous_id is required for identity linking' })
    }

    const distinctId = userId || anonymousId

    let eventTimestamp = new Date().toISOString()
    if (typeof req.body.timestamp === 'string') {
      const parsed = new Date(req.body.timestamp)
      if (!isNaN(parsed.getTime())) {
        eventTimestamp = req.body.timestamp
      }
    }

    const props = {
      site_id: req.site.id,
      is_conversion: true,
      conversion_value: value,
      ...getFirstTouchFields(req.body),
      ingestion_method: 'offline',
      server_timestamp: eventTimestamp
    }

    if (userId) props.user_id = userId
    if (anonymousId) props.anonymous_id = anonymousId

    if (typeof req.body.external_id === 'string') {
      const ext = req.body.external_id.trim()
      if (ext.length > 0) props.external_id = ext
    }

    if (typeof req.body.conversion_type === 'string') {
      const ct = req.body.conversion_type.trim()
      if (ct.length > 0) props.conversion_type = ct
    }
    if (typeof req.body.form_name === 'string') {
      const fn = req.body.form_name.trim().slice(0, 120).replace(/[^a-zA-Z0-9 _-]/g, '')
      if (fn.length > 0) props.form_name = fn
    }

    if (typeof req.body.utm_source === 'string' && req.body.utm_source.trim().length > 0) {
      props.utm_source = req.body.utm_source.trim()
    }
    if (typeof req.body.utm_medium === 'string' && req.body.utm_medium.trim().length > 0) {
      props.utm_medium = req.body.utm_medium.trim()
    }
    if (typeof req.body.utm_campaign === 'string' && req.body.utm_campaign.trim().length > 0) {
      props.utm_campaign = req.body.utm_campaign.trim()
    }

    ph.capture({
      distinctId,
      event: '$conversion',
      properties: props
    })


    dispatchWebhook('conversion.offline', props)

    res.status(200).json({
      success: true,
      data: { received: true, distinct_id: distinctId, ingestion_method: 'offline' },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    res.status(500).json({ success: false, data: null, error: 'Offline conversion failed' })
  }
}
