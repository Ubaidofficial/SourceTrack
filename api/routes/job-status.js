import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { requireUserAuth } from '../middleware/user-auth.js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const router = express.Router()

router.get('/attribution/status', requireUserAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('job_runs')
    .select('*')
    .eq('job_name', 'nightly-attribution')
    .order('ran_at', { ascending: false })
    .limit(10)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
