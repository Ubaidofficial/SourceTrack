import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: WebSocket } }
)

// POST /api/reports/saved — save a new report config
// Body: { name, config } — config is a JSON object with report parameters
// Auth: requireUserAuth + validateSiteKey + requireSiteMembership applied at parent mount
router.post('/saved', async (req, res) => {
  try {
    const { name, config } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, data: null, error: 'Report name is required' })
    }
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ success: false, data: null, error: 'Report config is required' })
    }

    const { data, error } = await supabase
      .from('saved_reports')
      .insert({
        user_id: req.user.id,
        site_id: req.site.id,
        name: name.trim(),
        config
      })
      .select()
      .single()

    if (error) throw error

    return res.json({ success: true, data, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({
      success: false,
      data: null,
      error: process.env.NODE_ENV === 'production'
        ? 'Failed to save report'
        : (_err.message || 'Failed to save report')
    })
  }
})

// GET /api/reports/saved — list saved reports for current user + site
// Auth: requireUserAuth + validateSiteKey + requireSiteMembership applied at parent mount
router.get('/saved', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('saved_reports')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('site_id', req.site.id)
      .order('updated_at', { ascending: false })

    if (error) throw error

    return res.json({ success: true, data: data || [], error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to list saved reports' })
  }
})


// PUT /api/reports/saved/:id — update an existing saved report
// Auth: requireUserAuth + validateSiteKey + requireSiteMembership applied at parent mount
router.put('/saved/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, config } = req.body

    if (!id) {
      return res.status(400).json({ success: false, data: null, error: 'Report ID is required' })
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, data: null, error: 'Report name is required' })
    }
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ success: false, data: null, error: 'Report config is required' })
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('saved_reports')
      .select('id, user_id, site_id')
      .eq('id', id)
      .eq('site_id', req.site.id)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: 'Report not found' })
    }
    if (existing.user_id !== req.user.id) {
      return res.status(403).json({ success: false, data: null, error: 'You do not own this report' })
    }

    const { data, error } = await supabase
      .from('saved_reports')
      .update({
        name: name.trim(),
        config,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .eq('site_id', req.site.id)
      .select()
      .single()

    if (error) throw error

    return res.json({ success: true, data, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to update report' })
  }
})

// DELETE /api/reports/saved/:id — delete a saved report
// Auth: requireUserAuth + validateSiteKey + requireSiteMembership applied at parent mount
router.delete('/saved/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({ success: false, data: null, error: 'Report ID is required' })
    }

    // Verify ownership before delete
    const { data: existing, error: fetchErr } = await supabase
      .from('saved_reports')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: 'Report not found' })
    }
    if (existing.user_id !== req.user.id) {
      return res.status(403).json({ success: false, data: null, error: 'You do not own this report' })
    }

    const { error } = await supabase
      .from('saved_reports')
      .delete()
      .eq('id', id)

    if (error) throw error

    return res.json({ success: true, data: { id }, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to delete report' })
  }
})

export { router as savedReportsRouter }
