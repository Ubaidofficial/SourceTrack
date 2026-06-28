import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'

// Persisted anomaly-watcher notifications (site_alerts table) for the dashboard
// bell/drawer. Distinct from routes/alerts.js, which serves plan-gated,
// real-time HogQL-computed alerts and is left untouched.
//
// Mounted with requireUserAuth + validateSiteKey + requireSiteMembership (see
// api/index.js), so req.site is the authenticated tenant. getSupabase() uses the
// service-role key and bypasses RLS, so every query is tenant-scoped to
// req.site.id IN CODE per CLAUDE.md §6.5.

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET / — undismissed alerts for the site, newest first, capped at 20.
router.get('/', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('site_alerts')
      .select('id, type, message, data_json, created_at')
      .eq('site_id', req.site.id)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    return res.status(200).json({
      success: true,
      data: { alerts: data || [], count: (data || []).length },
      error: null
    })
  } catch (_err) {
    console.error('[site-alerts] list failed:', _err?.message || _err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to load alerts' })
  }
})

// POST /:id/dismiss — soft-dismiss, scoped to the authenticated site so a user
// can never dismiss another tenant's alert.
router.post('/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ success: false, data: null, error: 'Alert not found' })
    }
    const { data, error } = await getSupabase()
      .from('site_alerts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('site_id', req.site.id)
      .is('dismissed_at', null)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, data: null, error: 'Alert not found' })
    }
    return res.status(200).json({ success: true, data: { id }, error: null })
  } catch (_err) {
    console.error('[site-alerts] dismiss failed:', _err?.message || _err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to dismiss alert' })
  }
})

export { router as siteAlertsRouter }
