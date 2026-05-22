import express from 'express'
import { queryHogQL } from '../lib/posthog.js'
import { esc } from '../lib/utils.js'

const router = express.Router()

// Parent mount in api/index.js applies requireUserAuth + validateSiteKey +
// requireSiteMembership, so req.site is guaranteed populated here.
router.get('/', async (req, res) => {
  try {
    if (!req.site?.id) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const sql = `
      SELECT count(DISTINCT properties.anonymous_id) AS live_visitors
      FROM events
      WHERE event = '$pageview'
        AND properties.site_id = '${esc(req.site.id)}'
        AND timestamp >= now() - INTERVAL 5 MINUTE
    `
    const rows = await queryHogQL(sql, 'live_visitors')
    const live_visitors = Number(rows?.[0]?.[0] ?? 0)
    res.json({ success: true, data: { live_visitors }, error: null })
  } catch (err) {
    console.error('Live visitors error:', err)
    // Soft-fail to 0 so the dashboard widget doesn't break on PostHog hiccups.
    res.json({ success: true, data: { live_visitors: 0 }, error: null })
  }
})

export default router
