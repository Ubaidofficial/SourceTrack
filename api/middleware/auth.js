import NodeCache from 'node-cache'
import { getSupabase } from '../lib/supabase.js'

const TRIAL_DAYS = 14

// In-memory site key cache — 5 min TTL.
// Eliminates one Supabase round-trip per tracking event. Without this, every
// pageview and conversion hits the DB just to validate the site key.
// On cache miss (first request, or after 5 min), we still hit Supabase.
// Supabase downtime is still a risk but the blast radius is much smaller.
export const siteCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

export async function validateSiteKey(req, res, next) {
  try {
    if (req.method === 'OPTIONS') return next()

    const siteKey = req.body?.site_key || req.query?.site_key

    if (!siteKey) {
      return res.status(401).json({ success: false, data: null, error: 'Missing site_key' })
    }

    // Cache hit — skip DB call entirely
    const cached = siteCache.get(siteKey)
    if (cached) {
      // Trial re-check still needed (TTL is 5min, trial could expire within that window)
      if (cached.plan === 'trial') {
        const trialEnd = cached.trial_ends_at
          ? new Date(cached.trial_ends_at)
          : new Date(new Date(cached.created_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
        if (new Date() > trialEnd) {
          siteCache.del(siteKey) // bust cache so next request re-checks DB
          return res.status(402).json({ success: false, data: null, error: 'Trial expired' })
        }
      }
      if (cached.plan === 'inactive') {
        return res.status(402).json({ success: false, data: null, error: 'Subscription inactive' })
      }
      req.site = cached.site
      return next()
    }

    // Cache miss — query Supabase
    const supabase = getSupabase()
    let { data, error } = await supabase
      .from('sites')
      .select('id, site_key, plan, pv_limit, created_at, company_id, owner_id, business_type, trial_ends_at, attribution_window_days, onboarding_completed, last_seen_at, onboarding_state, domain, excluded_paths, timezone, custom_url_params, cross_domain_domains, cross_domain_cookie_domain')
      .eq('site_key', siteKey)
      .single()

    const isMissingColumn = error && (
      error.code === '42703' ||
      (error.message && error.message.includes('column') && error.message.includes('attribution_window_days'))
    )

    if (isMissingColumn) {
      console.warn('[validateSiteKey] LOUD WARNING: sites.attribution_window_days or cross-domain columns do not exist in database. Falling back to default values.')
      const retryResult = await supabase
        .from('sites')
        .select('id, site_key, plan, pv_limit, created_at, company_id, owner_id, business_type, trial_ends_at, onboarding_completed, last_seen_at, onboarding_state, domain, excluded_paths, timezone, custom_url_params')
        .eq('site_key', siteKey)
        .single()

      if (retryResult.error) {
        return res.status(401).json({ success: false, data: null, error: 'Invalid site_key' })
      }

      data = retryResult.data
      data.attribution_window_days = 30
      data.cross_domain_domains = null
      data.cross_domain_cookie_domain = null
      error = null
    }

    if (error || !data) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid site_key' })
    }

    if (data.plan === 'inactive' || data.plan === 'archived') {
      const msg = data.plan === 'archived'
        ? 'Site archived after 60 days of inactivity. Reactivate from your dashboard.'
        : 'Subscription inactive'
      return res.status(402).json({ success: false, data: null, error: msg })
    }

    // Email verification gate — free plan only. Paid users have proven identity
    // via Stripe; trial sign-ups also skip this until they convert. Only the
    // free tier requires a verified email before the tracker activates.
    if (data.plan === 'free' && data.owner_id) {
      try {
        const { data: authUser, error: authUserErr } = await supabase.auth.admin.getUserById(data.owner_id)
        if (authUserErr) {
          console.warn('[validateSiteKey] getUserById returned error:', authUserErr.message || authUserErr)
          // SECURITY BOUNDARY:
          // 1. For public tracker ingestion endpoints (where req.user is undefined, e.g. /api/track, /track),
          //    we must fail-closed with a 503 Service Unavailable so that unverified users cannot bypass
          //    email confirmation enforcement during a temporary Supabase admin API lookup failure.
          // 2. For authenticated dashboard routes (where req.user is defined), we allow the request to
          //    continue with a warning so dashboard diagnostics and troubleshooting (e.g. Tracking Doctor)
          //    remain accessible to the logged-in owner during temporary Supabase auth service outages.
          if (!req.user) {
            return res.status(503).json({
              success: false,
              data: null,
              error: 'Service temporarily unavailable',
              message: 'We are temporarily unable to verify your account status. Please try again shortly.'
            })
          }
        } else if (authUser?.user && !authUser.user.email_confirmed_at) {
          return res.status(402).json({
            success: false,
            data: null,
            error: 'Email not verified',
            message: 'Please verify your email to activate tracking. Check your inbox for the verification link.'
          })
        }
      } catch (authErr) {
        console.error('[validateSiteKey] Failed to check email verification status:', authErr?.message || authErr)
        // SECURITY BOUNDARY:
        // Fail-closed with 503 for public tracker ingestion if an unexpected error occurs during admin lookup.
        // Bypass for authenticated dashboard routes to maintain user diagnostics accessibility.
        if (!req.user) {
          return res.status(503).json({
            success: false,
            data: null,
            error: 'Service temporarily unavailable',
            message: 'We are temporarily unable to verify your account status. Please try again shortly.'
          })
        }
      }
    }

    if (data.plan === 'trial') {
      const trialEnd = data.trial_ends_at
        ? new Date(data.trial_ends_at)
        : new Date(new Date(data.created_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
      if (new Date() > trialEnd) {
        return res.status(402).json({ success: false, data: null, error: 'Trial expired' })
      }
    }

    const site = {
      id: data.id,
      site_key: data.site_key,
      plan: data.plan,
      pv_limit: data.pv_limit ?? null,
      company_id: data.company_id,
      owner_id: data.owner_id,
      business_type: data.business_type || null,
      trial_ends_at: data.trial_ends_at || null,
      attribution_window_days: data.attribution_window_days || 30,
      onboarding_completed: !!data.onboarding_completed,
      last_seen_at: data.last_seen_at || null,
      onboarding_state: data.onboarding_state || {},
      domain: data.domain || null,
      excluded_paths: data.excluded_paths || [],
      timezone: data.timezone || 'UTC',
      custom_url_params: data.custom_url_params || []
    }


    // Store in cache — include plan/trial_ends_at so cache can do quick plan checks
    siteCache.set(siteKey, { site, plan: data.plan, trial_ends_at: data.trial_ends_at, created_at: data.created_at })

    req.site = site
    next()
  } catch (_err) {
    console.error('[validateSiteKey] Supabase lookup failed:', _err?.message || _err)
    res.status(401).json({ success: false, data: null, error: 'Invalid site_key' })
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
