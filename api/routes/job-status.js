import express from 'express'
import { requireUserAuth, requireRole } from '../middleware/user-auth.js'
import { getSupabase } from '../lib/supabase.js'

const router = express.Router()

router.get('/attribution/status', requireUserAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('job_runs')
      .select('*')
      .eq('job_name', 'nightly-attribution')
      .order('ran_at', { ascending: false })
      .limit(10)

    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  } catch (err) {
    console.error('[job-status]', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
