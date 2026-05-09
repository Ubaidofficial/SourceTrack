import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const TRIAL_DAYS = 14

export async function validateSiteKey(req, res, next) {
  try {
    const siteKey = req.body?.site_key || req.query?.site_key

    if (!siteKey) {
      return res.status(401).json({ success: false, data: null, error: 'Missing site_key' })
    }

    const { data, error } = await supabase
      .from('sites')
      .select('id, plan, created_at')
      .eq('site_key', siteKey)
      .single()

    if (error || !data) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid site_key' })
    }

    if (data.plan === 'inactive') {
      return res.status(402).json({ success: false, data: null, error: 'Subscription inactive' })
    }

    if (data.plan === 'trial') {
      const createdAt = new Date(data.created_at)
      const trialEnd = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
      if (new Date() > trialEnd) {
        return res.status(402).json({ success: false, data: null, error: 'Trial expired' })
      }
    }

    req.site = { id: data.id, plan: data.plan }
    next()
  } catch (_err) {
    res.status(500).json({ success: false, data: null, error: 'Auth error' })
  }
}
