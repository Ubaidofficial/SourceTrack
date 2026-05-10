import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: WebSocket } }
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
      .select('id, plan, created_at, company_id, owner_id')
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

    req.site = { id: data.id, plan: data.plan, company_id: data.company_id, owner_id: data.owner_id }
    next()
  } catch (_err) {
    res.status(500).json({ success: false, data: null, error: 'Auth error' })
  }
}

// requireSiteMembership — enforces that the authenticated user belongs to the company
// that owns the requested site. Must run AFTER validateSiteKey and requireUserAuth.
// Super admins bypass this check.
export function requireSiteMembership(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, data: null, error: 'Authentication required' })
  }

  if (req.user.role === 'super_admin') return next()

  if (!req.site) {
    return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
  }

  // Legacy fallback: if the site has no company_id yet, allow the original owner
  if (!req.site.company_id) {
    if (req.site.owner_id === req.user.id) return next()
    return res.status(403).json({ success: false, data: null, error: 'Access denied — you do not own this site' })
  }

  if (req.site.company_id !== req.user.company_id) {
    return res.status(403).json({ success: false, data: null, error: 'Access denied — this site belongs to another workspace' })
  }

  next()
}
