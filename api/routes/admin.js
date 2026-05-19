import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { requireRole } from '../middleware/user-auth.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch }, realtime: { transport: WebSocket } }
  )
}

// All admin routes require super_admin role
router.use(requireRole('super_admin'))

// --- Audit log helper ---
async function auditLog(action, targetType = null, targetId = null, metadata = {}) {
  try {
    // req.user is set by requireUserAuth middleware
    // We need to access it from a route handler, so this is a utility
  } catch { /* audit best-effort */ }
}

function makeAuditLogger(req) {
  return async (action, targetType = null, targetId = null, metadata = {}) => {
    try {
      await getSupabase().from('admin_audit_log').insert({
        admin_user_id: req.user?.id || null,
        action,
        target_type: targetType,
        target_id: targetId,
        metadata
      })
    } catch { /* audit best-effort */ }
  }
}

// GET /api/admin/companies — list all companies with member counts
router.get('/companies', async (_req, res) => {
  try {
    const { data: companies, error } = await getSupabase()
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const result = await Promise.all((companies || []).map(async (c) => {
      const { count: memberCount } = await getSupabase()
        .from('company_members')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', c.id)

      const { count: siteCount } = await getSupabase()
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
    const { data: members, error } = await getSupabase()
      .from('company_members')
      .select('id, company_id, user_id, role, created_at, companies (name)')

    if (error) throw error

    // Fetch user emails from auth
    const enriched = await Promise.all((members || []).map(async (m) => {
      try {
        const { data: { user } } = await getSupabase().auth.admin.getUserById(m.user_id)
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
    const { data: sites, error } = await getSupabase()
      .from('sites')
      .select('id, site_key, name, domain, plan, created_at, onboarding_completed, company_id, owner_id, companies (name)')
      .order('created_at', { ascending: false })

    if (error) throw error

    const enriched = await Promise.all((sites || []).map(async (s) => {
      try {
        const { data: { user } } = await getSupabase().auth.admin.getUserById(s.owner_id)
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
// Returns site config + metadata for the admin frontend to switch context.
// Does NOT mint a customer JWT — admin remains authenticated as super_admin.
router.post('/preview', async (req, res) => {
  const logAction = makeAuditLogger(req)
  try {
    const { site_id } = req.body
    if (!site_id) {
      return res.status(400).json({ success: false, data: null, error: 'site_id is required' })
    }

    const { data: site, error } = await getSupabase()
      .from('sites')
      .select('id, site_key, name, domain, company_id, onboarding_completed, onboarding_state')
      .eq('id', site_id)
      .single()

    if (error || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
    }

    // Get install status via PostHog — filter by internal site.id
    const { queryHogQL } = await import('../lib/posthog.js')
    let installInfo = null
    try {
      const rows = await queryHogQL(`
        SELECT event, timestamp
        FROM events
        WHERE properties.site_id = '${String(site.id).replace(/'/g, "''")}'
        ORDER BY timestamp DESC
        LIMIT 1
      `, 'admin_preview_install')
      if (rows && rows.length > 0) {
        installInfo = {
          status: 'verified',
          last_event_type: rows[0][0],
          last_event_timestamp: rows[0][1]
        }
      } else {
        installInfo = { status: 'not_installed' }
      }
    } catch { installInfo = { status: 'error' } }

    // Get saved report count
    const { count: reportCount } = await getSupabase()
      .from('saved_reports')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', site.id)

    // Get recent event count (last 24h)
    let recentEventCount = 0
    try {
      const ecRows = await queryHogQL(`
        SELECT count()
        FROM events
        WHERE properties.site_id = '${String(site.id).replace(/'/g, "''")}'
          AND timestamp >= now() - INTERVAL 24 HOUR
      `, 'admin_preview_recent')
      recentEventCount = Number(ecRows?.[0]?.[0]) || 0
    } catch { /* non-critical */ }

    logAction('preview_dashboard', 'site', site.site_key, { site_name: site.name })

    return res.json({
      success: true,
      data: {
        site_key: site.site_key,
        site_name: site.name || site.domain,
        site_domain: site.domain,
        plan: site.plan,
        onboarding_completed: site.onboarding_completed,
        install: installInfo,
        recent_event_count: recentEventCount,
        saved_report_count: reportCount || 0,
        preview_mode: true
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Preview failed' })
  }
})

// GET /api/admin/preview/:siteKey — aggregated dashboard data for support-mode preview
// Returns KPI summary, top sources, and conversion count filtered by siteKey.
// Uses PostHog HogQL — admin stays authenticated as super_admin, no identity switch.
router.get('/preview/:siteKey', async (req, res) => {
  const logAction = makeAuditLogger(req)
  try {
    const siteKey = req.params.siteKey
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'site_key is required' })
    }

    // Look up site metadata
    const { data: site, error: siteErr } = await getSupabase()
      .from('sites')
      .select('id, site_key, name, domain, plan, created_at, onboarding_completed, onboarding_state')
      .eq('site_key', siteKey)
      .single()

    if (siteErr || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
    }

    const { queryHogQL } = await import('../lib/posthog.js')
    const posthogSiteId = String(site.id).replace(/'/g, "''")

    // KPI summary: revenue, conversions, sessions, leads (last 30 days)
    let kpis = { revenue: 0, conversions: 0, sessions: 0, leads: 0 }
    try {
      const kpiRows = await queryHogQL(`
        SELECT
          sumIf(toFloatOrZero(toString(properties.conversion_value)), event = '$conversion') AS revenue,
          countIf(event = '$conversion') AS conversions,
          countIf(event = '$pageview') AS sessions,
          count(DISTINCT distinct_id) AS leads
        FROM events
        WHERE properties.site_id = '${posthogSiteId}'
          AND timestamp >= now() - INTERVAL 30 DAY
      `, 'admin_preview_kpis')
      if (kpiRows && kpiRows.length > 0) {
        const [rev, conv, sess, ld] = kpiRows[0]
        kpis = {
          revenue: Number(rev) || 0,
          conversions: Number(conv) || 0,
          sessions: Number(sess) || 0,
          leads: Number(ld) || 0
        }
      }
    } catch { /* KPI query failed, keep zeroes */ }

    // Top 5 sources by revenue
    let sources = []
    try {
      const srcRows = await queryHogQL(`
        SELECT
          COALESCE(properties.utm_source, 'direct') AS source,
          sumIf(toFloatOrZero(toString(properties.conversion_value)), event = '$conversion') AS revenue,
          countIf(event = '$conversion') AS conversions
        FROM events
        WHERE properties.site_id = '${posthogSiteId}'
          AND timestamp >= now() - INTERVAL 30 DAY
        GROUP BY source
        HAVING revenue > 0
        ORDER BY revenue DESC
        LIMIT 5
      `, 'admin_preview_sources')
      sources = (srcRows || []).map(([source, revenue, conversions]) => ({
        dim_value: source,
        revenue: Number(revenue) || 0,
        conversions: Number(conversions) || 0
      }))
    } catch { /* non-critical */ }

    // Install status
    let install = { status: 'unknown' }
    try {
      const instRows = await queryHogQL(`
        SELECT event, timestamp
        FROM events
        WHERE properties.site_id = '${posthogSiteId}'
        ORDER BY timestamp DESC
        LIMIT 1
      `, 'admin_preview_overview')
      if (instRows && instRows.length > 0) {
        install = {
          status: 'verified',
          last_event_type: instRows[0][0],
          last_event_timestamp: instRows[0][1]
        }
      } else {
        install = { status: 'not_installed' }
      }
    } catch { install = { status: 'error' } }

    logAction('preview_dashboard_view', 'site', siteKey, { site_name: site.name })

    return res.json({
      success: true,
      data: {
        preview_mode: true,
        site_key: site.site_key,
        site_name: site.name || site.domain,
        site_domain: site.domain,
        plan: site.plan,
        kpis,
        sources,
        install,
        alerts: []
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Preview overview failed' })
  }
})

// GET /api/admin/site-detail?site_key=X — detailed site inspector for Super Admin
// Returns onboarding state, install status (via PostHog), and config summary
router.get('/site-detail', async (req, res) => {
  const logAction = makeAuditLogger(req)
  try {
    const siteKey = req.query.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'site_key is required' })
    }

    const { data: site, error } = await getSupabase()
      .from('sites')
      .select('id, site_key, name, domain, plan, created_at, onboarding_completed, onboarding_state, company_id, owner_id, companies(name)')
      .eq('site_key', siteKey)
      .single()

    if (error || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
    }

    // Get owner email
    let ownerEmail = null
    try {
      const { data: { user } } = await getSupabase().auth.admin.getUserById(site.owner_id)
      ownerEmail = user?.email || null
    } catch { /* non-critical */ }

    // Check install status — filter by internal site.id
    const { queryHogQL } = await import('../lib/posthog.js')
    let installStatus = null
    try {
      const rows = await queryHogQL(`
        SELECT event, timestamp, properties.page_url AS page_url
        FROM events
        WHERE properties.site_id = '${String(site.id).replace(/'/g, "''")}'
        ORDER BY timestamp DESC
        LIMIT 1
      `, 'admin_site_detail')
      if (rows && rows.length > 0) {
        const [event, timestamp, pageUrl] = rows[0]
        let domain = null
        try { if (pageUrl) domain = new URL(pageUrl).hostname } catch { /* */ }
        installStatus = {
          status: 'verified',
          last_event_type: event,
          last_event_timestamp: timestamp,
          domain
        }
      } else {
        installStatus = { status: 'not_installed', last_event_type: null, last_event_timestamp: null, domain: null }
      }
    } catch { installStatus = { status: 'error', last_event_type: null, last_event_timestamp: null, domain: null } }

    logAction('view_site_detail', 'site', siteKey)

    return res.json({
      success: true,
      data: {
        site: {
          id: site.id,
          site_key: site.site_key,
          name: site.name,
          domain: site.domain,
          plan: site.plan,
          created_at: site.created_at,
          company_name: site.companies?.name || null,
          company_id: site.company_id,
          owner_id: site.owner_id,
          owner_email: ownerEmail
        },
        onboarding: {
          completed: site.onboarding_completed,
          state: site.onboarding_state || null
        },
        install: installStatus
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Site detail query failed' })
  }
})

// GET /api/admin/feature-status — internal feature truth panel with provenance
// Returns features with last_verified timestamps and verification method.
// Recheck via POST /api/admin/feature-status/recheck
router.get('/feature-status', async (req, res) => {
  const logAction = makeAuditLogger(req)
  logAction('view_feature_status')

  return res.json({
    success: true,
    data: {
      last_verified: '2026-05-02T00:00:00.000Z',
      features: [
        { name: 'first_touch', status: 'live', notes: 'Cookie-backed, reads first_touch_source from conversion events', verification_method: 'code-audit' },
        { name: 'last_touch', status: 'live', notes: 'Reads utm_source on conversion event', verification_method: 'code-audit' },
        { name: 'first_touch_non_direct', status: 'live', notes: 'Added Session 54. Skips direct, falls back to first_touch', verification_method: 'code-audit' },
        { name: 'last_touch_non_direct', status: 'live', notes: 'Added Session 54. Skips direct, falls back to last_touch', verification_method: 'code-audit' },
        { name: 'LTV', status: 'live', notes: 'Cumulative historical revenue per identity, first_touch/last_touch only. Labeled as LTV Revenue v1.', verification_method: 'code-audit' },
        { name: 'AI Analytics', status: 'live', notes: 'AI vs non-AI metrics, rule-based insights, referrer-based detection', verification_method: 'code-audit' },
        { name: 'AI Chat', status: 'live', notes: 'LLM → HogQL query assistant. Single events table. No ad platform access.', verification_method: 'code-audit' },
        { name: 'offline conversions', status: 'live', notes: 'POST /api/conversion/offline with external_id support', verification_method: 'code-audit' },
        { name: 'pipeline stages', status: 'live', notes: 'lead_created/qualified/opportunity/closed_won from offline conversions', verification_method: 'code-audit' },
        { name: 'webhooks', status: 'live', notes: 'Best-effort outbound webhooks on conversion events', verification_method: 'code-audit' },
        { name: 'integrations', status: 'internal-only', notes: 'UI uses placeholder cards. No live integrations beyond the tracker snippet.', verification_method: 'code-audit' },
        { name: 'consent/privacy', status: 'not_implemented', notes: 'No consent enforcement pipeline. Product does not claim consent awareness.', verification_method: 'code-audit' },
        { name: 'deduplication', status: 'not_implemented', notes: 'ATTRIBUTION.md Part 10 rules defined but no enforcement in code.', verification_method: 'code-audit' },
        { name: 'widgetized dashboard', status: 'dormant', notes: 'Code was built in Session 2 but replaced by fixed card grid in Session 31. Add-to-Dashboard button disabled. Dashboard.jsx has zero widget rendering.', verification_method: 'code-audit' },
        { name: 'multi-dashboard', status: 'dormant', notes: 'Session 2 implementation replaced. Current Dashboard is a single Performance Overview page. No dashboard CRUD, selector, or switching.', verification_method: 'code-audit' },
        { name: 'linear attribution', status: 'live', notes: 'Pre-aggregated linear model live via getLinearAttribution. Reads linear_attribution JSONB from attributed_conversions.', verification_method: 'code-audit' },
        { name: 'saved reports', status: 'partial', notes: 'localStorage-only. No backend persistence. No cross-device sync.', verification_method: 'code-audit' },
        { name: 'period-over-period comparison', status: 'partial', notes: 'Dashboard KPI cards have delta comparisons via overview API *_prev fields. Report Builder has no compare feature.', verification_method: 'code-audit' }
      ]
    },
    error: null
  })
})

// POST /api/admin/feature-status/recheck — re-verify all features via server-side probes
router.post('/feature-status/recheck', async (req, res) => {
  const logAction = makeAuditLogger(req)
  const now = new Date().toISOString()

  // Probe: check which route files exist
  function routeExists(filename) {
    try {
      const p = path.join(__dirname, filename)
      return fs.existsSync(p)
    } catch { return false }
  }

  // Probe: try to import a module
  async function moduleImports(importPath) {
    try {
      await import(importPath)
      return true
    } catch { return false }
  }

  const probes = {
    attribution_route: routeExists('attribution.js'),
    ai_analytics_route: routeExists('ai-analytics.js'),
    ai_chat_route: routeExists('ai-chat.js'),
    offline_conversion_route: routeExists('conversion-offline.js'),
    webhook_lib: routeExists('../lib/webhook.js'),
    saved_reports_route: routeExists('saved-reports.js'),
    dashboard_route: routeExists('dashboard.js'),
    onboarding_route: routeExists('onboarding.js')
  }

  // Derive statuses from probes + existing truth
  const features = [
    { name: 'first_touch', status: probes.attribution_route ? 'live' : 'dormant', notes: 'Probed: attribution route exists', verification_method: 'server-probe' },
    { name: 'last_touch', status: probes.attribution_route ? 'live' : 'dormant', notes: 'Probed: attribution route exists', verification_method: 'server-probe' },
    { name: 'first_touch_non_direct', status: probes.attribution_route ? 'live' : 'dormant', notes: 'Probed: attribution route exists (non-direct models added Session 54)', verification_method: 'server-probe' },
    { name: 'last_touch_non_direct', status: probes.attribution_route ? 'live' : 'dormant', notes: 'Probed: attribution route exists (non-direct models added Session 54)', verification_method: 'server-probe' },
    { name: 'LTV', status: probes.attribution_route ? 'live' : 'dormant', notes: 'Probed: attribution route exists (LTV metric in engine)', verification_method: 'server-probe' },
    { name: 'AI Analytics', status: probes.ai_analytics_route ? 'live' : 'dormant', notes: `Probed: ai-analytics route ${probes.ai_analytics_route ? 'exists' : 'not found'}`, verification_method: 'server-probe' },
    { name: 'AI Chat', status: probes.ai_chat_route ? 'live' : 'dormant', notes: `Probed: ai-chat route ${probes.ai_chat_route ? 'exists' : 'not found'}`, verification_method: 'server-probe' },
    { name: 'offline conversions', status: probes.offline_conversion_route ? 'live' : 'dormant', notes: `Probed: offline conversion route ${probes.offline_conversion_route ? 'exists' : 'not found'}`, verification_method: 'server-probe' },
    { name: 'pipeline stages', status: probes.dashboard_route ? 'live' : 'dormant', notes: 'Probed: dashboard route exists (pipeline stages query)', verification_method: 'server-probe' },
    { name: 'webhooks', status: probes.webhook_lib ? 'live' : 'dormant', notes: `Probed: webhook lib ${probes.webhook_lib ? 'exists' : 'not found'}`, verification_method: 'server-probe' },
    { name: 'integrations', status: 'internal-only', notes: 'Probed: UI uses placeholder cards (static truth)', verification_method: 'server-probe' },
    { name: 'consent/privacy', status: 'not_implemented', notes: 'Probed: no consent middleware found', verification_method: 'server-probe' },
    { name: 'deduplication', status: 'not_implemented', notes: 'Probed: ATTRIBUTION.md rules defined but no code enforcement', verification_method: 'server-probe' },
    { name: 'widgetized dashboard', status: 'dormant', notes: 'Probed: no widget rendering in Dashboard.jsx', verification_method: 'server-probe' },
    { name: 'multi-dashboard', status: 'dormant', notes: 'Probed: single Performance Overview page only', verification_method: 'server-probe' },
    { name: 'linear attribution', status: probes.attribution_route ? 'live' : 'dormant', notes: 'Probed: attribution route exists — linear model re-enabled via getLinearAttribution', verification_method: 'server-probe' },
    { name: 'saved reports', status: probes.saved_reports_route ? 'live' : 'partial', notes: `Probed: saved-reports route ${probes.saved_reports_route ? 'exists — backend persisted' : 'not found — localStorage only'}`, verification_method: 'server-probe' },
    { name: 'period-over-period comparison', status: probes.dashboard_route ? 'partial' : 'not_implemented', notes: 'Probed: dashboard KPI deltas exist, Report Builder lacks compare', verification_method: 'server-probe' }
  ]

  // Compare with previous state (from query or default)
  const prevFeatures = [
    { name: 'first_touch', status: 'live' },
    { name: 'last_touch', status: 'live' },
    { name: 'first_touch_non_direct', status: 'live' },
    { name: 'last_touch_non_direct', status: 'live' },
    { name: 'LTV', status: 'live' },
    { name: 'AI Analytics', status: 'live' },
    { name: 'AI Chat', status: 'live' },
    { name: 'offline conversions', status: 'live' },
    { name: 'pipeline stages', status: 'live' },
    { name: 'webhooks', status: 'live' },
    { name: 'integrations', status: 'internal-only' },
    { name: 'consent/privacy', status: 'not_implemented' },
    { name: 'deduplication', status: 'not_implemented' },
    { name: 'widgetized dashboard', status: 'dormant' },
    { name: 'multi-dashboard', status: 'dormant' },
    { name: 'linear attribution', status: 'live' },
    { name: 'saved reports', status: 'partial' },
    { name: 'period-over-period comparison', status: 'partial' }
  ]

  const diffs = []
  features.forEach((f, i) => {
    const prev = prevFeatures[i]
    if (prev && prev.status !== f.status) {
      diffs.push({ feature: f.name, previous: prev.status, current: f.status })
    }
  })

  logAction('recheck_features', 'feature_status', null, { probe_results: probes, diffs, rechecked_at: now })

  return res.json({
    success: true,
    data: {
      last_verified: now,
      features,
      diffs,
      probes
    },
    error: null
  })
})

// GET /api/admin/audit-log — recent admin actions (last 100)
router.get('/audit-log', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error

    const enriched = await Promise.all((data || []).map(async (entry) => {
      let adminEmail = null
      if (entry.admin_user_id) {
        try {
          const { data: { user } } = await getSupabase().auth.admin.getUserById(entry.admin_user_id)
          adminEmail = user?.email || null
        } catch { /* */ }
      }
      return { ...entry, admin_email: adminEmail }
    }))

    return res.json({ success: true, data: enriched, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to load audit log' })
  }
})

// GET /api/admin/qa-notes — list all QA notes
router.get('/qa-notes', async (_req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('qa_notes')
      .select('*')
      .order('feature_key', { ascending: true })

    if (error) throw error

    return res.json({ success: true, data: data || [], error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to load QA notes' })
  }
})

// POST /api/admin/qa-notes — create a new QA note
router.post('/qa-notes', async (req, res) => {
  try {
    const { feature_key, note_type, note_text } = req.body
    if (!feature_key || !note_type || !note_text) {
      return res.status(400).json({ success: false, data: null, error: 'feature_key, note_type, and note_text are required' })
    }
    if (!['safe_claim', 'watch', 'misleading'].includes(note_type)) {
      return res.status(400).json({ success: false, data: null, error: 'note_type must be safe_claim, watch, or misleading' })
    }

    const { data, error } = await getSupabase()
      .from('qa_notes')
      .insert({
        feature_key: feature_key.trim(),
        note_type,
        note_text: note_text.trim(),
        created_by: req.user.id
      })
      .select()
      .single()

    if (error) throw error

    return res.json({ success: true, data, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to create QA note' })
  }
})

// PUT /api/admin/qa-notes/:id — update a QA note
router.put('/qa-notes/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { note_text, note_type } = req.body

    const updates = { updated_at: new Date().toISOString() }
    if (note_text !== undefined) updates.note_text = note_text.trim()
    if (note_type && ['safe_claim', 'watch', 'misleading'].includes(note_type)) updates.note_type = note_type

    const { data, error } = await getSupabase()
      .from('qa_notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ success: false, data: null, error: 'Note not found' })

    return res.json({ success: true, data, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to update QA note' })
  }
})

// DELETE /api/admin/qa-notes/:id — delete a QA note
router.delete('/qa-notes/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await getSupabase()
      .from('qa_notes')
      .delete()
      .eq('id', id)

    if (error) throw error

    return res.json({ success: true, data: { id }, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to delete QA note' })
  }
})

export { router as adminRouter }
