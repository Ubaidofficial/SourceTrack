import express from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey } from '../middleware/auth.js'

const router = express.Router()
function getSupabase() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { global: { fetch }, realtime: { transport: WebSocket } }) }

router.get('/', requireUserAuth, validateSiteKey, async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const { data, error } = await getSupabase()
      .from('campaign_costs')
      .select('*')
      .eq('site_id', req.site.id)
      .gte('period_start', date_from || '2020-01-01')
      .lte('period_end', date_to || new Date().toISOString().slice(0, 10))
      .order('period_start', { ascending: false })
    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/', requireUserAuth, validateSiteKey, async (req, res) => {
  try {
    const { campaign_name, spend, period_start, period_end } = req.body
    if (!campaign_name || spend === undefined || !period_start || !period_end) {
      return res.status(400).json({ success: false, error: 'campaign_name, spend, period_start, period_end required' })
    }
    const { data, error } = await getSupabase()
      .from('campaign_costs')
      .upsert({
        site_id: req.site.id,
        campaign_name: String(campaign_name).trim(),
        spend: parseFloat(spend) || 0,
        period_start,
        period_end
      }, { onConflict: 'site_id,campaign_name,period_start' })
      .select()
      .single()
    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/:id', requireUserAuth, validateSiteKey, async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from('campaign_costs')
      .delete()
      .eq('id', req.params.id)
      .eq('site_id', req.site.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export { router as campaignCostsRouter }
