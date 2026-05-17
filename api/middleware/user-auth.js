import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch }, realtime: { transport: WebSocket } }
  )
}

// requireUserAuth — validates Supabase JWT and extracts user + role + company.
// Sets req.user = { id, email, role, company_id }
// Role is determined by:
//   1. raw_app_meta_data.role === 'super_admin' → role = 'super_admin'
//   2. company_members lookup → role = 'admin' or 'user'
//   3. fallback → role = null (no workspace membership)
export async function requireUserAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, data: null, error: 'Missing or invalid Authorization header' })
    }

    const token = authHeader.split(' ')[1]

    const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token)
    if (authErr || !user) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid or expired token' })
    }

    const metaRole = user.raw_app_meta_data?.role

    if (metaRole === 'super_admin') {
      req.user = { id: user.id, email: user.email, role: 'super_admin', company_id: null }
      return next()
    }

    // Look up workspace membership
    const { data: member } = await getSupabase()
      .from('company_members')
      .select('role, company_id')
      .eq('user_id', user.id)
      .maybeSingle()

    req.user = {
      id: user.id,
      email: user.email,
      role: member?.role || null,
      company_id: member?.company_id || null
    }

    next()
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Auth verification failed' })
  }
}

// requireRole(...roles) — returns middleware that restricts access to specific roles.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, data: null, error: 'Authentication required' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, data: null, error: 'Insufficient permissions' })
    }
    next()
  }
}
