import express from 'express'
import { requireUserAuth } from '../middleware/user-auth.js'
import { queryHogQL } from '../lib/posthog.js'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

function getSupabase() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { global: { fetch }, realtime: { transport: WebSocket } }) }

const router = express.Router()

router.get('/', requireUserAuth, async (req, res) => {
  try {
    const { site_key } = req.query
    if (!site_key) return res.status(400).json({ error: 'site_key required' })

    const supabase = getSupabase()
    const { data: site } = await supabase
      .from('sites').select('id').eq('site_key', site_key).single()

    if (!site) return res.status(404).json({ error: 'Site not found' })

    const sql = `
      SELECT count(DISTINCT properties.anonymous_id) AS live_visitors
      FROM events
      WHERE event = '$pageview'
        AND properties.site_id = '${site.id}'
        AND timestamp >= now() - INTERVAL 5 MINUTE
    `
    const result = await queryHogQL(sql)
    const live_visitors = Number(result?.results?.[0]?.[0] ?? 0)
    res.json({ live_visitors })
  } catch (err) {
    console.error('Live visitors error:', err)
    res.json({ live_visitors: 0 })
  }
})

export default router
