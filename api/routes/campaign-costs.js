import express from 'express'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'
import { getSupabase } from '../lib/supabase.js'
import { requireFeature } from '../lib/plan-features.js'
import { getCostDedupeKey, validateAdCostRows, aggregateAdCostRows } from '../lib/ad-cost-imports.js'

const router = express.Router()

// GET /api/campaign-costs - Retrieve spend records for a site
router.get('/', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const { data, error } = await getSupabase()
      .from('campaign_costs')
      .select('id, site_id, campaign_name, spend, period_start, period_end, platform, campaign_id, cost_dedupe_key, clicks, impressions, currency, created_at')
      .eq('site_id', req.site.id)
      .gte('period_start', date_from || '2020-01-01')
      .lte('period_end', date_to || new Date().toISOString().slice(0, 10))
      .order('period_start', { ascending: false })

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    console.error('[campaign-costs] query failed:', err?.message || err)
    res.status(200).json({
      success: true,
      data: {
        campaign_costs_unavailable: true,
        results: []
      },
      error: null
    })
  }
})

// POST /api/campaign-costs - Legacy manual spend inline update (preserves range spend)
router.post('/', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const block = requireFeature(req.site?.plan, 'manual_spend', 'Manual spend entry')
    if (block) return res.status(402).json(block)

    const { campaign_name, spend, period_start, period_end } = req.body
    if (!campaign_name || spend === undefined || !period_start || !period_end) {
      return res.status(400).json({ success: false, error: 'campaign_name, spend, period_start, period_end required' })
    }

    const name = String(campaign_name).trim()
    const dedupeKey = getCostDedupeKey(null, name)

    const { data, error } = await getSupabase()
      .from('campaign_costs')
      .upsert({
        site_id: req.site.id,
        campaign_name: name,
        campaign_id: null,
        platform: 'manual',
        cost_dedupe_key: dedupeKey,
        spend: parseFloat(spend) || 0,
        clicks: 0,
        impressions: 0,
        currency: 'USD',
        period_start,
        period_end
      }, { onConflict: 'site_id,platform,cost_dedupe_key,period_start' })
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    console.error('[campaign-costs] post manual spend failed:', err?.message || err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/campaign-costs/import - Bulk CSV/Paste imports
router.post('/import', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  const supabase = getSupabase()
  let runLogId = null

  try {
    const block = requireFeature(req.site?.plan, 'manual_spend', 'Manual spend entry')
    if (block) return res.status(402).json(block)

    const { rows } = req.body
    if (!Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: 'rows array is required' })
    }

    // Shared Helper Validation
    const validationErrors = validateAdCostRows(rows)
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: validationErrors })
    }

    // Shared Helper Aggregation (sums duplicate campaign/platform/date entries)
    const aggregated = aggregateAdCostRows(rows)
    if (aggregated.length === 0) {
      return res.json({ success: true, records_synced: 0 })
    }

    // Log the import execution run as pending
    const { data: runLog, error: runLogErr } = await supabase
      .from('ad_sync_runs')
      .insert({
        site_key: req.site.site_key,
        platform: 'manual_csv',
        source: 'csv_import',
        status: 'pending',
        sync_type: 'manual',
        sync_start: new Date().toISOString()
      })
      .select('id')
      .single()

    if (runLogErr) throw runLogErr
    runLogId = runLog.id

    // Map rows to Supabase table records, deriving site_id from authenticated site context ONLY
    const dbRows = aggregated.map(r => {
      const platform = r.platform || 'manual_csv'
      const dedupeKey = getCostDedupeKey(r.campaign_id, r.campaign_name)
      return {
        site_id: req.site.id,
        campaign_name: r.campaign_name,
        campaign_id: r.campaign_id || null,
        platform,
        cost_dedupe_key: dedupeKey,
        spend: r.spend,
        clicks: r.clicks,
        impressions: r.impressions,
        currency: r.currency || 'USD',
        period_start: r.date,
        period_end: r.date
      }
    })

    // Perform bulk upserts based on non-null dedupe key
    const { error: upsertErr } = await supabase
      .from('campaign_costs')
      .upsert(dbRows, { onConflict: 'site_id,platform,cost_dedupe_key,period_start' })

    if (upsertErr) throw upsertErr

    // Update import history log to success
    await supabase
      .from('ad_sync_runs')
      .update({
        status: 'success',
        records_synced: dbRows.length,
        sync_end: new Date().toISOString()
      })
      .eq('id', runLogId)

    res.json({ success: true, records_synced: dbRows.length })

  } catch (err) {
    console.error('[campaign-costs] import execution failed:', err?.message || err)

    if (runLogId) {
      // Record failure inside run log
      await supabase
        .from('ad_sync_runs')
        .update({
          status: 'failed',
          error_message: err.message || 'Unknown database error',
          sync_end: new Date().toISOString()
        })
        .eq('id', runLogId)
        .catch(logErr => console.error('[campaign-costs] failed to update failed run status:', logErr.message))
    }

    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/campaign-costs/import-history - Retrieve recent import history logs
router.get('/import-history', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('ad_sync_runs')
      .select('id, site_key, platform, source, sync_start, sync_end, status, records_synced, error_message, sync_type')
      .eq('site_key', req.site.site_key)
      .order('sync_start', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    console.error('[campaign-costs] query import history failed:', err?.message || err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// DELETE /api/campaign-costs/:id - Delete cost entry
router.delete('/:id', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const block = requireFeature(req.site?.plan, 'manual_spend', 'Manual spend entry')
    if (block) return res.status(402).json(block)

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
