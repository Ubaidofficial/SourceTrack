import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: WebSocket } }
)

const MAX_STEP = 6
const VALID_BUSINESS_TYPES = ['ecommerce', 'saas', 'leadgen']
const VALID_INSTALL_METHODS = ['gtm', 'standard']
const VALID_CONVERSIONS = ['purchase', 'trial', 'lead', 'signup', 'meeting']

function validateStep(step) {
  const num = Number(step)
  if (!Number.isInteger(num) || num < 1 || num > MAX_STEP) return null
  return num
}

function validateStepData(step, data) {
  if (!data) return { valid: true }

  switch (step) {
    case 2: {
      if (data.business_type !== undefined && !VALID_BUSINESS_TYPES.includes(data.business_type)) {
        return { valid: false, error: `business_type must be one of: ${VALID_BUSINESS_TYPES.join(', ')}` }
      }
      break
    }
    case 3: {
      if (data.install_method !== undefined && !VALID_INSTALL_METHODS.includes(data.install_method)) {
        return { valid: false, error: `install_method must be one of: ${VALID_INSTALL_METHODS.join(', ')}` }
      }
      break
    }
    case 5: {
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
      break
    }
  }

  return { valid: true }
}

router.get('/status', async (req, res) => {
  try {
    const siteId = req.query.site_id
    if (!siteId) {
      return res.status(400).json({ success: false, data: null, error: 'site_id is required' })
    }

    const { data: site, error } = await supabase
      .from('sites')
      .select('id, site_key, onboarding_completed, onboarding_state')
      .eq('id', siteId)
      .single()

    if (error || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
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
        business_type: state.business_type || null,
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

    const { data: site, error: fetchErr } = await supabase
      .from('sites')
      .select('id, onboarding_state, onboarding_completed')
      .eq('id', site_id)
      .single()

    if (fetchErr || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
    }

    if (site.onboarding_completed) {
      return res.status(400).json({
        success: false, data: null,
        error: 'Onboarding already completed. Use a different site or reset state.'
      })
    }

    const currentState = site.onboarding_state || {}
    const currentStep = currentState.current_step || 1

    if (targetStep < currentStep && targetStep !== 1) {
      return res.status(400).json({
        success: false, data: null,
        error: `Cannot go back to step ${targetStep} from step ${currentStep}. Only forward progression is allowed.`
      })
    }

    const validJump = targetStep === currentStep ||
                      targetStep === currentStep + 1 ||
                      (targetStep > currentStep && targetStep <= MAX_STEP)

    if (!validJump) {
      return res.status(400).json({
        success: false, data: null,
        error: `Invalid step transition from ${currentStep} to ${targetStep}`
      })
    }

    const dataValidation = validateStepData(targetStep, stepData)
    if (!dataValidation.valid) {
      return res.status(400).json({ success: false, data: null, error: dataValidation.error })
    }

    const merged = {
      ...currentState,
      current_step: targetStep,
      ...(stepData || {})
    }

    if (targetStep < currentState.current_step) {
      delete merged.business_type
      delete merged.install_method
      delete merged.selected_conversions
    }

    const { error: updateErr } = await supabase
      .from('sites')
      .update({ onboarding_state: merged })
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

    const { data: site, error: fetchErr } = await supabase
      .from('sites')
      .select('id, site_key, onboarding_state, onboarding_completed')
      .eq('id', site_id)
      .single()

    if (fetchErr || !site) {
      return res.status(404).json({ success: false, data: null, error: 'Site not found' })
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

    const merged = { ...currentState, current_step: MAX_STEP }

    const { error: updateErr } = await supabase
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
