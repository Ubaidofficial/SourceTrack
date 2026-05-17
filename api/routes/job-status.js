import express from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { requireUserAuth } from '../middleware/user-auth.js'

function getSupabase() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { global: { fetch }, realtime: { transport: WebSocket } }) }
const router = express.Router()

router.get('/attribution/status', requireUserAuth, async (req, res) => {
  const { data, error } = await getSupabase()
    .from('job_runs')
    .select('*')
    .eq('job_name', 'nightly-attribution')
    .order('ran_at', { ascending: false })
    .limit(10)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
