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

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (_err) {
    res.status(500).json({ success: false, data: null, error: 'Track failed' })
  }
}