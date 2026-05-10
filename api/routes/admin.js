import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { requireRole } from '../middleware/user-auth.js'

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: WebSocket } }
)

// All admin routes require super_admin role
router.use(requireRole('super_admin'))

// GET /api/admin/companies — list all companies with member counts
router.get('/companies', async (_req, res) => {
  try {
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const result = await Promise.all((companies || []).map(async (c) => {
      const { count: memberCount } = await supabase
        .from('company_members')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', c.id)

      const { count: siteCount } = await supabase
        .from('sites')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', c.id)

      return { ...c, member_count: memberCount || 0, site_count: siteCount || 0 }
    }))

    return res.json({ success: true, data: result, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to list companies' })
  }
})

// GET /api/admin/users — list all customer users with workspace info
router.get('/users', async (_req, res) => {
  try {
    const { data: members, error } = await supabase
      .from('company_members')
      .select('id, company_id, user_id, role, created_at, companies (name)')

    if (error) throw error

    // Fetch user emails from auth
    const enriched = await Promise.all((members || []).map(async (m) => {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(m.user_id)
        return {
          ...m,
          email: user?.email || m.user_id,
          company_name: m.companies?.name || null
        }
      } catch {
        return { ...m, email: m.user_id, company_name: m.companies?.name || null }
      }
    }))

    return res.json({ success: true, data: enriched, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to list users' })
  }
})

// GET /api/admin/sites — list all sites with company and owner info
router.get('/sites', async (_req, res) => {
  try {
    const { data: sites, error } = await supabase
      .from('sites')
      .select('id, site_key, name, domain, plan, created_at, onboarding_completed, company_id, owner_id, companies (name)')
      .order('created_at', { ascending: false })

    if (error) throw error

    const enriched = await Promise.all((sites || []).map(async (s) => {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(s.owner_id)
        return {
          ...s,
          owner_email: user?.email || s.owner_id,
          company_name: s.companies?.name || null
        }
      } catch {
        return { ...s, owner_email: s.owner_id, company_name: s.companies?.name || null }
      }
    }))

    return res.json({ success: true, data: enriched, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to list sites' })
  }
})

// POST /api/admin/preview — open a customer workspace in support mode
// Returns the site_key + company info so the admin frontend can switch context
router.post('/preview', async (req, res) => {
  try {
    const { site_id } = req.body
    if (!site_id) {
      return res.status(400).json({ success: false, data: null, error: 'site_id is required' })
    }

    const { data: site, error } = await supabase
      .from('sites')
      .select('id, site_key, name, domain, company_id, onboarding_completed, onboarding_state')
      .eq('id', site_id)
      .single()

    if (error || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
    }

    return res.json({
      success: true,
      data: {
        site,
        preview_token: site.site_key // used by frontend to switch context
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Preview failed' })
  }
})

export { router as adminRouter }
