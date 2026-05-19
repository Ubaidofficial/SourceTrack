import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { createHash } from 'crypto'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'

const router = Router()
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch }, realtime: { transport: WebSocket } }
  )
}

router.post('/event', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, data: null, error: 'Missing API key' })
    }

    const rawKey = authHeader.split(' ')[1]
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const { data: apiKey, error: keyErr } = await getSupabase()
      .from('api_keys')
      .select('id, site_id')
      .eq('key_hash', keyHash)
      .maybeSingle()

    if (keyErr || !apiKey) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid API key' })
    }

    const siteId = apiKey.site_id
    const customerIp = req.body.user_ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || ''
    const customerUa = req.body.user_agent || req.headers['user-agent'] || ''
    const parser = new UAParser(customerUa)

    let country = null
    if (customerIp) {
      const geo = geoip.lookup(customerIp)
      country = geo?.country || null
    }

    ph.capture({
      distinctId: req.body.anonymous_id || req.body.user_id || uuidv4(),
      event: req.body.event || '$pageview',
      properties: {
        site_id: siteId,
        anonymous_id: req.body.anonymous_id || null,
        user_id: req.body.user_id || null,
        page_url: req.body.page_url || null,
        referrer: req.body.referrer || null,
        utm_source: req.body.utm_source || null,
        utm_medium: req.body.utm_medium || null,
        utm_campaign: req.body.utm_campaign || null,
        utm_content: req.body.utm_content || null,
        utm_term: req.body.utm_term || null,
        conversion_value: req.body.conversion_value || null,
        conversion_type: req.body.conversion_type || null,
        device_type: parser.getDevice().type || 'desktop',
        country,
        server_timestamp: req.body.timestamp || new Date().toISOString(),
        ingestion_method: 'server_sdk',
        ...(req.body.properties || {})
      }
    })

    await getSupabase()
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id)

    return res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, data: null, error: 'Server event failed' })
  }
})

export { router as serverEventsRouter }
