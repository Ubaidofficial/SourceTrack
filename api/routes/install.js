import { Router } from 'express'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'

import { getSupabase } from '../lib/supabase.js'
import { getSetupDiagnostics, getBasicInstallStatus } from '../lib/setup-doctor.js'


const normalizeBaseUrl = (value) => String(value || '').replace(/\/+$/, '');

const router = Router()

router.get('/snippet', async (req, res) => {
  try {
    const siteId = req.query.site_id
    if (!siteId) {
      return res.status(400).json({ success: false, data: null, error: 'site_id is required' })
    }

    const { data: site, error } = await getSupabase()
      .from('sites')
      .select('site_key, company_id, owner_id')
      .eq('id', siteId)
      .single()

    if (error || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
    }

    // Verify user has access to this site
    if (req.user.role !== 'super_admin') {
      if (site.company_id && site.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, data: null, error: 'Access denied' })
      }
      if (!site.company_id && site.owner_id !== req.user.id) {
        return res.status(403).json({ success: false, data: null, error: 'Access denied' })
      }
    }

    let trackerBaseUrl = normalizeBaseUrl(
      process.env.TRACKER_BASE_URL ||
      process.env.FRONTEND_URL
    )
    if (!trackerBaseUrl) {
      const reqHost = req.get('host')
      if (reqHost && !reqHost.includes('localhost') && !reqHost.includes('127.0.0.1')) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol
        trackerBaseUrl = `${protocol}://${reqHost}`
      } else {
        trackerBaseUrl = `http://localhost:${process.env.PORT || 3000}`
      }
    }
    const snippet = `<script async src="${trackerBaseUrl}/tracker.min.js" data-site-key="${site.site_key}"></script>`

    return res.status(200).json({
      success: true,
      data: { snippet, site_key: site.site_key },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Snippet generation failed' })
  }
})

router.get('/status', validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const supabase = getSupabase()
    const { data: site, error } = await supabase
      .from('sites')
      .select('id, site_key, domain, last_seen_at, onboarding_state')
      .eq('id', req.site.id)
      .single()

    if (error || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
    }

    const statusData = getBasicInstallStatus(site)

    return res.status(200).json({
      success: true,
      data: statusData,
      error: null
    })
  } catch (_err) {
    console.error('[install/status] query failed:', _err?.message || _err)
    return res.status(200).json({
      success: true,
      data: {
        verified: false,
        status: 'error',
        last_seen_at: null,
        last_event_name: null,
        last_event_url: null,
        site_key: req.site?.site_key || null,
        domain: null,
        message: 'Verification check failed'
      },
      error: null
    })
  }
})

router.get('/ping', async (req, res) => {
  return res.status(200).json({ success: true, service: 'install-ping' })
})

router.get('/doctor', validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const site = req.site
    const verificationToken = req.query.verification_token || null
    const diagnostics = await getSetupDiagnostics({ site, verificationToken })

    return res.status(200).json({
      success: true,
      data: diagnostics,
      error: null
    })
  } catch (err) {
    console.error('[install/doctor] failed:', err?.message || err)
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Diagnostics check failed'
    })
  }
})

export { router as installRouter }
