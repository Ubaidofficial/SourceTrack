import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'

const router = Router()

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch }, realtime: { transport: WebSocket } }
  )
}

function esc(str) {
  return str.replace(/'/g, "''")
}

router.get('/snippet', async (req, res) => {
  try {
    const siteId = req.query.site_id
    if (!siteId) {
      return res.status(400).json({ success: false, data: null, error: 'site_id is required' })
    }

    const { data: site, error } = await getSupabase()
      .from('sites')
      .select('site_key, company_id, owner_id')
      .eq('id', siteId)
      .single()

    if (error || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
    }

    // Verify user has access to this site
    if (req.user.role !== 'super_admin') {
      if (site.company_id && site.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, data: null, error: 'Access denied' })
      }
      if (!site.company_id && site.owner_id !== req.user.id) {
        return res.status(403).json({ success: false, data: null, error: 'Access denied' })
      }
    }

    const apiUrl = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`
    const snippet = `<script async src="${apiUrl}/tracker/loader.min.js" data-site-key="${site.site_key}"></script>`

    return res.status(200).json({
      success: true,
      data: { snippet, site_key: site.site_key },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Snippet generation failed' })
  }
})

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
