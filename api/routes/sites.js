import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const supabase = getSupabase()

    // Query only safe fields from the sites table
    const query = supabase
      .from('sites')
      .select('id, site_key, name, domain, plan, created_at, last_seen_at, timezone, excluded_paths, trial_started_at, trial_ends_at, onboarding_completed, onboarding_state, business_type')
      .order('created_at', { ascending: false })

    if (req.user.role === 'super_admin') {
      const { data: sites, error } = await query
      if (error) throw error
      return res.json({ success: true, data: { sites }, error: null })
    }

    if (req.user.company_id) {
      query.eq('company_id', req.user.company_id)
    } else {
      query.eq('owner_id', req.user.id)
    }

    const { data: sites, error } = await query
    if (error) throw error

    return res.json({ success: true, data: { sites }, error: null })
  } catch (err) {
    console.error('[sites]', err.message)
    res.status(500).json({ success: false, data: null, error: 'Failed to load sites' })
  }
})

export { router as sitesRouter }
