import express from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { getPreAggregatedAttribution } from '../lib/attribution-engine.js'
import { requireUserAuth } from '../middleware/user-auth.js'

const router = express.Router()
function getSupabase() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { global: { fetch }, realtime: { transport: WebSocket } }) }

// GET /api/public/:token — no auth, returns dashboard data for public share
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params
    if (!token || token.length < 10) return res.status(404).json({ error: 'Not found' })

    const { data: site } = await getSupabase()
      .from('sites')
      .select('id, site_key, public_share_enabled, public_share_token')
      .eq('public_share_token', token)
      .eq('public_share_enabled', true)
      .single()

    if (!site) return res.status(404).json({ error: 'Dashboard not found or sharing disabled' })

    const days = parseInt(req.query.days) || 30
    const today = new Date()
    const dateFrom = new Date(today - days * 86400000).toISOString().slice(0, 10)
    const dateTo = today.toISOString().slice(0, 10)

    const [topSources, topCampaigns, topChannels] = await Promise.all([
      getPreAggregatedAttribution({ siteId: site.id, model: 'first_touch', dateFrom, dateTo, groupBy: 'source', metric: 'revenue' }),
      getPreAggregatedAttribution({ siteId: site.id, model: 'first_touch', dateFrom, dateTo, groupBy: 'campaign', metric: 'revenue' }),
      getPreAggregatedAttribution({ siteId: site.id, model: 'first_touch', dateFrom, dateTo, groupBy: 'channel', metric: 'revenue' })
    ])

    const totalRevenue = topSources.reduce((s, r) => s + (r.revenue || 0), 0)
    const totalConversions = topSources.reduce((s, r) => s + (r.conversions || 0), 0)

    res.json({
      success: true,
      data: {
        date_from: dateFrom,
        date_to: dateTo,
        days,
        kpis: { total_revenue: totalRevenue, total_conversions: totalConversions },
        top_sources: topSources.slice(0, 10),
        top_campaigns: topCampaigns.slice(0, 10),
        top_channels: topChannels.slice(0, 10)
      }
    })
  } catch (err) {
    console.error('[public-dashboard]', err.message)
    res.status(500).json({ error: 'Failed to load dashboard' })
  }
})

// PATCH /api/public/settings — toggle public sharing (auth required)
router.patch('/settings', requireUserAuth, async (req, res) => {
  try {
    const { site_id, enabled } = req.body
    if (!site_id) return res.status(400).json({ error: 'site_id required' })

    // Verify requester owns or belongs to the site's company
    const { data: site } = await getSupabase()
      .from('sites')
      .select('id, company_id, owner_id')
      .eq('id', site_id)
      .single()

    if (!site) return res.status(404).json({ error: 'Site not found' })

    const isSuperAdmin = req.user?.role === 'super_admin'
    const isOwner = site.owner_id === req.user?.id
    const isMember = site.company_id && site.company_id === req.user?.company_id
    if (!isSuperAdmin && !isOwner && !isMember) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { data, error } = await getSupabase()
      .from('sites')
      .update({ public_share_enabled: !!enabled })
      .eq('id', site_id)
      .select('public_share_token, public_share_enabled')
      .single()

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export { router as publicDashboardRouter }
