import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'

const router = Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

router.get('/status', validateSiteKey, async (req, res) => {
  try {
    const siteKey = req.query.site_key || req.body?.site_key

    const sql = `
      SELECT
        event,
        timestamp,
        properties.page_url AS page_url
      FROM events
      WHERE properties.site_id = '${esc(req.site.id)}'
      ORDER BY timestamp DESC
      LIMIT 1
    `

    const rows = await queryHogQL(sql, 'install_status')

    if (!rows || rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: { status: 'not_installed', last_event: null, domain: null },
        error: null
      })
    }

    const [event, timestamp, pageUrl] = rows[0]
    let domain = null
    try {
      if (pageUrl) domain = new URL(pageUrl).hostname
    } catch (_e) { /* ignore */ }

    return res.status(200).json({
      success: true,
      data: {
        status: 'verified',
        last_event: timestamp,
        last_event_type: event,
        domain
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Status check failed' })
  }
})

export { router as installRouter }
