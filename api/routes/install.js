import { Router } from 'express'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'

import { getSupabase } from '../lib/supabase.js'


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

    const trackerBaseUrl = normalizeBaseUrl(
      process.env.TRACKER_BASE_URL ||
      process.env.FRONTEND_URL ||
      `http://localhost:${process.env.PORT || 3000}`
    )
    const snippet = `<script async src="${trackerBaseUrl}/tracker/tracker.min.js" data-site-key="${site.site_key}"></script>`

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

    if (!site.last_seen_at) {
      return res.status(200).json({
        success: true,
        data: {
          verified: false,
          status: 'pending',
          message: 'Waiting for the first pageview event...',
          last_seen_at: null,
          domain: null
        },
        error: null
      })
    }

    const state = site.onboarding_state || {}
    const lastEventAt = site.last_seen_at
    const lastEventName = state.last_event_name || '$pageview'
    const lastEventUrl = state.last_event_url || ''
    const lastEventDomain = state.last_event_domain || null

    const normalizeDomain = (d) => String(d || '').trim().toLowerCase().replace(/^www\./i, '')
    const registeredDomain = normalizeDomain(site.domain)
    const eventDomain = normalizeDomain(lastEventDomain)

    if (eventDomain && registeredDomain && eventDomain !== registeredDomain) {
      return res.status(200).json({
        success: true,
        data: {
          verified: false,
          status: 'wrong_domain',
          last_seen_at: lastEventAt,
          last_event_name: lastEventName,
          last_event_url: lastEventUrl,
          site_key: site.site_key,
          domain: lastEventDomain,
          message: `We detected an event from '${lastEventDomain}', but this site is registered for '${site.domain}'.`
        },
        error: null
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        verified: true,
        status: 'verified',
        last_seen_at: lastEventAt,
        last_event_name: lastEventName,
        last_event_url: lastEventUrl,
        site_key: site.site_key,
        domain: lastEventDomain || site.domain,
        message: 'Snippet verified successfully!'
      },
      error: null
    })
  } catch (_err) {
    console.error('[install/status] query failed:', _err?.message || _err)
    return res.status(200).json({
      success: true,
      data: {
        verified: false,
        status: 'error',
        message: 'Verification check failed',
        last_seen_at: null,
        domain: null
      },
      error: null
    })
  }
})

export { router as installRouter }
