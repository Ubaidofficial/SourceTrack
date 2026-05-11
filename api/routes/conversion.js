import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { dispatchWebhook } from '../lib/webhook.js'

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

export async function conversion(req, res) {
  try {
    const enriched = enrich(req)

    const props = {
      site_id: req.site.id,
      anonymous_id: req.body.anonymous_id,
      is_conversion: true,
      conversion_value: req.body.conversion_value,
      page_url: req.body.page_url,
      referrer: req.body.referrer,
      utm_source: normalizeUtm(req.body.utm_source),
      utm_medium: normalizeUtm(req.body.utm_medium),
      utm_campaign: normalizeUtm(req.body.utm_campaign),
      utm_content: normalizeUtm(req.body.utm_content),
      utm_term: normalizeUtm(req.body.utm_term),
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

    ph.capture({
      distinctId: req.body.anonymous_id || uuidv4(),
      event: '$conversion',
      properties: props
    })

    await ph.shutdown()

    dispatchWebhook('conversion', props)

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (_err) {
    res.status(500).json({ success: false, data: null, error: 'Conversion failed' })
  }
}
