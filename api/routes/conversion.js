import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'

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

export async function conversion(req, res) {
  try {
    const enriched = enrich(req)

    ph.capture({
      distinctId: req.body.anonymous_id || uuidv4(),
      event: '$conversion',
      properties: {
        site_id: req.site.id,
        anonymous_id: req.body.anonymous_id,
        is_conversion: true,
        conversion_value: req.body.conversion_value,
        page_url: req.body.page_url,
        referrer: req.body.referrer,
        utm_source: req.body.utm_source,
        utm_medium: req.body.utm_medium,
        utm_campaign: req.body.utm_campaign,
        utm_content: req.body.utm_content,
        utm_term: req.body.utm_term,
        ai_source: enriched.ai_source,
        device_type: enriched.device_type,
        country: enriched.country,
        server_timestamp: enriched.server_timestamp
      }
    })

    await ph.shutdown()

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (_err) {
    res.status(500).json({ success: false, data: null, error: 'Conversion failed' })
  }
}
