import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { checkSiteCreationLimit } from '../lib/site-limits.js'

const router = Router()

const MAX_STEP = 6
const VALID_BUSINESS_TYPES = ['ecommerce', 'saas', 'leadgen']
const VALID_INSTALL_METHODS = ['gtm', 'standard']
const VALID_CONVERSIONS = ['purchase', 'trial', 'lead', 'signup', 'meeting']

// ── Helpers ──────────────────────────────────────────────────────────────────

// Canonicalize a user-entered domain to ONE stored form: lowercased hostname with a leading "www."
// stripped. So "www.Example.com", "https://example.com/x", and "example.com" all collapse to
// "example.com" — the same normalization the tracker's Referer lookup (privacy-suppression.js) and the
// sites_normalized_domain_uniq index use. Prevents a second site row for the same domain typed with/
// without www. The URL parse also sanitizes the value (a valid hostname carries no PostgREST operator
// characters), so it is safe to interpolate into the .or() filter below. Exported for unit tests.
export function normalizeDomain(input) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return null
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const host = url.hostname.replace(/^www\./i, '')
    // new URL() lets commas / parens / semicolons through the hostname, and `host` is interpolated into
    // the PostgREST .or() STRING filter below (NOT a parameterized value binding). Reject anything that
    // is not plain hostname characters, or a crafted domain could break out of the filter and read
    // another tenant's site (§6.5). This also rejects IPv6/ports, which are never registrable sites.
    if (!/^[a-z0-9.-]+$/.test(host)) return null
    return host
  } catch {
    return null
  }
}

async function getUserSitesSorted(user) {
  const query = getSupabase()
    .from('sites')
    .select('id, site_key, domain, name, business_type, onboarding_completed, onboarding_state, company_id, owner_id')
    .order('created_at', { ascending: false })

  if (user.role === 'super_admin') {
    const { data } = await query
    return data || []
  }

  if (user.company_id) query.eq('company_id', user.company_id)
  else query.eq('owner_id', user.id)

  const { data } = await query
  return data || []
}

function resolveDashboardSite(user, req, sites) {
  if (!sites || sites.length === 0) return null

  const selectedKey = req.query?.site_key || req.headers?.['x-site-key'] || req.headers?.['x-active-site-key']
  const selectedId = req.query?.site_id || req.headers?.['x-site-id']

  if (selectedKey) {
    const matched = sites.find(s => s.site_key === selectedKey)
    if (matched && matched.onboarding_completed) return matched
  }
  if (selectedId) {
    const matched = sites.find(s => String(s.id) === String(selectedId))
    if (matched && matched.onboarding_completed) return matched
  }

  const completed = sites.find(s => s.onboarding_completed)
  if (completed) return completed

  const incomplete = sites.find(s => !s.onboarding_completed)
  if (incomplete) return incomplete

  return null
}

function resolveOnboardingSite(user, req, sites) {
  if (!sites || sites.length === 0) return null

  const selectedKey = req.query?.site_key || req.headers?.['x-site-key'] || req.headers?.['x-active-site-key']
  const selectedId = req.query?.site_id || req.headers?.['x-site-id']

  if (selectedKey) {
    const matched = sites.find(s => s.site_key === selectedKey)
    if (matched && !matched.onboarding_completed) return matched
  }
  if (selectedId) {
    const matched = sites.find(s => String(s.id) === String(selectedId))
    if (matched && !matched.onboarding_completed) return matched
  }

  const incomplete = sites.find(s => !s.onboarding_completed)
  if (incomplete) return incomplete

  const completed = sites.find(s => s.onboarding_completed)
  if (completed) return completed

  return null
}

function userCanAccessSite(user, site) {
  if (user.role === 'super_admin') return true
  if (site.company_id) return site.company_id === user.company_id
  return site.owner_id === user.id
}

function validateStep(step) {
  const num = Number(step)
  if (!Number.isInteger(num) || num < 1 || num > MAX_STEP) return null
  return num
}

// Validate any of business_type / install_method / selected_conversions when
// they appear, regardless of step number. Frontend can jump or resume freely.
function validateStepData(step, data) {
  if (!data) return { valid: true }

  if (data.business_type !== undefined && !VALID_BUSINESS_TYPES.includes(data.business_type)) {
    return { valid: false, error: `business_type must be one of: ${VALID_BUSINESS_TYPES.join(', ')}` }
  }

  if (data.install_method !== undefined && data.install_method !== null && !VALID_INSTALL_METHODS.includes(data.install_method)) {
    return { valid: false, error: `install_method must be one of: ${VALID_INSTALL_METHODS.join(', ')}` }
  }

  if (data.selected_conversions !== undefined) {
    if (!Array.isArray(data.selected_conversions)) {
      return { valid: false, error: 'selected_conversions must be an array' }
    }
    for (const conv of data.selected_conversions) {
      if (!VALID_CONVERSIONS.includes(conv)) {
        return { valid: false, error: `Invalid conversion: ${conv}. Must be one of: ${VALID_CONVERSIONS.join(', ')}` }
      }
    }
  }

  return { valid: true }
}

// ── GET /me ──────────────────────────────────────────────────────────────────
// Used by the dashboard ProtectedRoute to decide whether to gate onto onboarding.
router.get('/me', async (req, res) => {
  try {
    const sites = await getUserSitesSorted(req.user)
    const isOnboardingPage = req.query?.mode === 'onboarding'

    const site = isOnboardingPage
      ? resolveOnboardingSite(req.user, req, sites)
      : resolveDashboardSite(req.user, req, sites)

    if (!site) {
      return res.status(200).json({
        success: true,
        data: { has_site: false, onboarding_completed: false, site: null },
        error: null
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        has_site: true,
        site_id: site.id,
        site_key: site.site_key,
        domain: site.domain,
        business_type: site.business_type || site.onboarding_state?.business_type || null,
        onboarding_completed: !!site.onboarding_completed,
        onboarding_state: site.onboarding_state || {},
        current_step: site.onboarding_state?.current_step || 1
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to load onboarding status' })
  }
})

// ── POST /site ───────────────────────────────────────────────────────────────
// Creates or resumes the user's onboarding site. No `plan` is passed in the
// insert — the sites table DEFAULT 'free' (from migration 20260522000001)
// applies, so new signups land on the free tier as intended.
router.post('/site', async (req, res) => {
  try {
    const domain = normalizeDomain(req.body?.domain)
    if (!domain) {
      return res.status(400).json({ success: false, data: null, error: 'Please enter a valid domain, for example yoursite.com' })
    }

    // Match EITHER stored form (bare or www-prefixed) so a pre-normalization "www." row is still found
    // by a bare input — never create a second row for the same domain. Deterministic: oldest match wins
    // (no .maybeSingle(), which would error if a tenant already has the duplicate pair pre-index).
    const query = getSupabase()
      .from('sites')
      .select('id, site_key, domain, onboarding_completed, onboarding_state, business_type, company_id, owner_id, created_at')
      .or(`domain.eq.${domain},domain.eq.www.${domain}`)
      .order('created_at', { ascending: true })

    if (req.user.company_id) query.eq('company_id', req.user.company_id)
    else query.eq('owner_id', req.user.id)

    const { data: matches, error: existingErr } = await query
    if (existingErr) throw existingErr
    const existing = matches?.[0] || null

    // Step 1 Domain Policy:
    // 1. If same-domain site exists and is incomplete, resume/update it.
    // 2. If same-domain site exists and is completed, avoid accidental duplicate and guide/navigate to dashboard.
    // 3. Different domain inserts a fresh site (no silent duplicate same-domain sites).
    if (existing) {
      if (!userCanAccessSite(req.user, existing)) {
        return res.status(403).json({ success: false, data: null, error: 'Access denied' })
      }

      const state = existing.onboarding_state || {}
      const nextState = existing.onboarding_completed
        ? state
        : { ...state, current_step: Math.max(Number(state.current_step) || 1, 2) }

      if (!existing.onboarding_completed) {
        await getSupabase().from('sites').update({ onboarding_state: nextState }).eq('id', existing.id)
      }

      return res.status(200).json({
        success: true,
        data: {
          site_id: existing.id,
          site_key: existing.site_key,
          domain: existing.domain,
          onboarding_completed: !!existing.onboarding_completed,
          onboarding_state: nextState,
          business_type: existing.business_type || nextState.business_type || null,
          resumed: true
        },
        error: null
      })
    }

    // Enforce active site limits before creating a new site
    const checkScope = req.user.company_id
      ? { company_id: req.user.company_id }
      : { owner_id: req.user.id }

    try {
      const limitCheck = await checkSiteCreationLimit(checkScope)
      if (!limitCheck.allowed) {
        return res.status(402).json({
          success: false,
          data: null,
          error: 'Site limit reached for your plan'
        })
      }
    } catch (limitErr) {
      console.error('[onboarding] Site limit check failed:', limitErr.message || limitErr)
      return res.status(500).json({
        success: false,
        data: null,
        error: 'Database error while checking plan limits'
      })
    }

    const onboardingState = { current_step: 2 }
    // Don't pass `plan` — let the DB DEFAULT 'free' (set by migration
    // 20260522000001_free_tier_and_plan_realign.sql) apply. Passing 'trial'
    // here would override the free-tier landing target.
    const insert = {
      owner_id: req.user.id,
      company_id: req.user.company_id || null,
      domain,
      name: domain,
      onboarding_state: onboardingState,
      onboarding_completed: false
    }

    const { data: site, error: createErr } = await getSupabase()
      .from('sites')
      .insert(insert)
      .select('id, site_key, domain, onboarding_state, onboarding_completed, business_type')
      .single()

    if (createErr) {
      // sites_normalized_domain_uniq rejects a second site for the same normalized domain. The
      // tenant-scoped check above only sees THIS account's sites, so a domain already tracked by a
      // DIFFERENT account lands here — surface a clear message instead of a raw 500.
      if (createErr.code === '23505') {
        return res.status(409).json({ success: false, data: null, error: 'This domain is already being tracked by another account. If it is yours, contact support to transfer it.' })
      }
      throw createErr
    }

    return res.status(200).json({
      success: true,
      data: {
        site_id: site.id,
        site_key: site.site_key,
        domain: site.domain,
        onboarding_state: site.onboarding_state,
        onboarding_completed: !!site.onboarding_completed,
        business_type: site.business_type || null,
        resumed: false
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to register domain. Please try again.' })
  }
})

router.get('/status', async (req, res) => {
  try {
    const sites = await getUserSitesSorted(req.user)
    let site
    const siteId = req.query.site_id

    if (siteId) {
      site = sites.find(s => String(s.id) === String(siteId))
      if (!site) {
        return res.status(404).json({ success: false, data: null, error: 'Site not found' })
      }
    } else {
      site = resolveOnboardingSite(req.user, req, sites)
      if (!site) {
        return res.status(404).json({ success: false, data: null, error: 'No site resolved' })
      }
    }

    if (site.onboarding_completed) {
      return res.status(200).json({
        success: true,
        data: { completed: true, site_id: site.id, site_key: site.site_key },
        error: null
      })
    }

    const state = site.onboarding_state || {}
    return res.status(200).json({
      success: true,
      data: {
        completed: false,
        current_step: state.current_step || 1,
        site_id: site.id,
        site_key: site.site_key,
        business_type: site.business_type || state.business_type || null,
        install_method: state.install_method || null,
        selected_conversions: state.selected_conversions || []
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Status check failed' })
  }
})

router.post('/update', async (req, res) => {
  try {
    const { site_id, step, data: stepData } = req.body

    if (!site_id) {
      return res.status(400).json({ success: false, data: null, error: 'site_id is required' })
    }

    const targetStep = validateStep(step)
    if (targetStep === null) {
      return res.status(400).json({ success: false, data: null, error: `step must be an integer between 1 and ${MAX_STEP}` })
    }

    const { data: site, error: fetchErr } = await getSupabase()
      .from('sites')
      .select('id, onboarding_state, onboarding_completed, company_id, owner_id')
      .eq('id', site_id)
      .single()

    if (fetchErr || !site) {
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

    if (site.onboarding_completed) {
      return res.status(400).json({
        success: false, data: null,
        error: 'Onboarding already completed. Use a different site or reset state.'
      })
    }

    const currentState = site.onboarding_state || {}
    const currentStep = currentState.current_step || 1

    // Allow re-saving previous steps (targetStep <= currentStep)
    // or advancing to the next step (targetStep === currentStep + 1)
    const isValidTransition = targetStep <= currentStep || targetStep === currentStep + 1
    if (!isValidTransition) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Invalid step transition from step ${currentStep} to step ${targetStep}`
      })
    }

    const dataValidation = validateStepData(targetStep, stepData)
    if (!dataValidation.valid) {
      return res.status(400).json({ success: false, data: null, error: dataValidation.error })
    }

    // Keep the furthest progress as the database current_step to preserve stepper progress clickability
    const nextStep = Math.max(targetStep, currentStep)
    const merged = {
      ...currentState,
      current_step: nextStep,
      ...(stepData || {})
    }

    const { error: updateErr } = await getSupabase()
      .from('sites')
      .update({ onboarding_state: merged, ...(merged.business_type ? { business_type: merged.business_type } : {}) })
      .eq('id', site_id)

    if (updateErr) {
      console.error(updateErr)
      return res.status(500).json({ success: false, data: null, error: 'Update failed' })
    }

    return res.status(200).json({
      success: true,
      data: { current_step: targetStep, saved: true },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Update failed' })
  }
})

router.post('/complete', async (req, res) => {
  try {
    const { site_id } = req.body
    if (!site_id) {
      return res.status(400).json({ success: false, data: null, error: 'site_id is required' })
    }

    const { data: site, error: fetchErr } = await getSupabase()
      .from('sites')
      .select('id, site_key, onboarding_state, onboarding_completed, company_id, owner_id')
      .eq('id', site_id)
      .single()

    if (fetchErr || !site) {
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

    if (site.onboarding_completed) {
      return res.status(200).json({
        success: true,
        data: { completed: true, message: 'Already completed' },
        error: null
      })
    }

    const currentState = site.onboarding_state || {}
    const currentStep = currentState.current_step || 1

    if (currentStep < MAX_STEP) {
      return res.status(400).json({
        success: false, data: null,
        error: `Cannot complete onboarding from step ${currentStep}. Must reach step ${MAX_STEP} (verification) first.`
      })
    }

    if (!currentState.business_type || !currentState.install_method) {
      return res.status(400).json({
        success: false, data: null,
        error: 'Cannot complete onboarding: business type or install method not set.'
      })
    }

    const merged = {
      ...currentState,
      current_step: MAX_STEP,
      verification_status: currentState.verification_status || 'pending'
    }

    const { error: updateErr } = await getSupabase()
      .from('sites')
      .update({ onboarding_completed: true, onboarding_state: merged })
      .eq('id', site_id)

    if (updateErr) {
      console.error(updateErr)
      return res.status(500).json({ success: false, data: null, error: 'Complete failed' })
    }

    return res.status(200).json({
      success: true,
      data: { completed: true },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Complete failed' })
  }
})

export { router as onboardingRouter }
