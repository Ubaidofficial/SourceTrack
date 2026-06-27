import { Router } from 'express'
import crypto from 'crypto'
import { getSupabase } from '../lib/supabase.js'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'
import { requireFeature } from '../lib/plan-features.js'
import { redactPiiFromUrl } from '../lib/utils.js'
import { sendTestWebhook } from '../lib/webhook.js'
import { validateWebhookUrl } from '../lib/ssrf-guard.js'

const router = Router()

const enforceWebhookOutbound = (req, res, next) => {
  const block = requireFeature(req.site?.plan, 'webhook_outbound', 'Outbound webhooks')
  if (block) return res.status(402).json(block)
  next()
}

// Mask utility for secrets
function maskSecret(secret) {
  if (!secret || secret.length < 15) return ''
  return secret.substring(0, 10) + '••••••••' + secret.substring(secret.length - 4)
}

// SSRF URL validation lives in ../lib/ssrf-guard.js so the delivery path can
// reuse it. Re-exported for backward-compat with any existing importers.
export { validateWebhookUrl }

// GET /api/webhooks?site_key=... (List webhook configurations for a site)
router.get('/', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const supabase = getSupabase()

    // Retrieve destination
    const { data: destination, error: destErr } = await supabase
      .from('webhook_destinations')
      .select('*')
      .eq('site_key', req.site.site_key)
      .maybeSingle()

    if (destErr) throw destErr

    if (!destination) {
      return res.json({ success: true, data: { webhook: null, deliveries: [] }, error: null })
    }

    // Retrieve 10 most recent deliveries
    const { data: deliveries, error: delErr } = await supabase
      .from('webhook_deliveries')
      .select('id, event_type, status_code, success, error_message, created_at')
      .eq('destination_id', destination.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (delErr) throw delErr

    // Mask secret
    destination.secret = maskSecret(destination.secret)

    return res.json({
      success: true,
      data: {
        webhook: destination,
        deliveries: deliveries || []
      },
      error: null
    })
  } catch (err) {
    console.error('[webhooks] GET list error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to load webhooks' })
  }
})

// POST /api/webhooks?site_key=... (Create a webhook destination)
router.post('/', requireUserAuth, validateSiteKey, requireSiteMembership, enforceWebhookOutbound, async (req, res) => {
  try {
    const { url, active } = req.body

    // 1. Validate URL
    const urlCheck = validateWebhookUrl(url)
    if (!urlCheck.valid) {
      return res.status(400).json({ success: false, data: null, error: urlCheck.error })
    }

    const supabase = getSupabase()

    // 2. Check if a webhook destination already exists for this site (MVP restriction)
    const { data: existing } = await supabase
      .from('webhook_destinations')
      .select('id')
      .eq('site_key', req.site.site_key)
      .maybeSingle()

    if (existing) {
      return res.status(400).json({ success: false, data: null, error: 'A webhook destination already exists for this site' })
    }

    // 3. Create destination and generate secret
    const secret = 'whsec_' + crypto.randomBytes(24).toString('hex')
    const isActive = active !== false

    const { data, error } = await supabase
      .from('webhook_destinations')
      .insert({
        site_key: req.site.site_key,
        url: url.trim(),
        secret,
        active: isActive
      })
      .select('*')
      .single()

    if (error) throw error

    return res.json({ success: true, data: { webhook: data }, error: null })
  } catch (err) {
    console.error('[webhooks] POST create error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to create webhook' })
  }
})

// PATCH /api/webhooks/:id?site_key=... (Update webhook url or active state)
router.patch('/:id', requireUserAuth, validateSiteKey, requireSiteMembership, enforceWebhookOutbound, async (req, res) => {
  try {
    const { id } = req.params
    const { url, active } = req.body

    const supabase = getSupabase()

    // 1. Verify existence & ownership
    const { data: existing, error: findErr } = await supabase
      .from('webhook_destinations')
      .select('id')
      .eq('id', id)
      .eq('site_key', req.site.site_key)
      .maybeSingle()

    if (findErr) throw findErr
    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: 'Webhook destination not found' })
    }

    // 2. Validate URL if provided
    const updates = {}
    if (url !== undefined) {
      const urlCheck = validateWebhookUrl(url)
      if (!urlCheck.valid) {
        return res.status(400).json({ success: false, data: null, error: urlCheck.error })
      }
      updates.url = url.trim()
    }

    if (active !== undefined) {
      updates.active = !!active
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, data: null, error: 'No fields to update' })
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('webhook_destinations')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    // Mask secret
    data.secret = maskSecret(data.secret)

    return res.json({ success: true, data: { webhook: data }, error: null })
  } catch (err) {
    console.error('[webhooks] PATCH update error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to update webhook' })
  }
})

// POST /api/webhooks/:id/test?site_key=... (Dispatch a test webhook)
router.post('/:id/test', requireUserAuth, validateSiteKey, requireSiteMembership, enforceWebhookOutbound, async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getSupabase()

    // Verify existence & ownership
    const { data: destination, error: findErr } = await supabase
      .from('webhook_destinations')
      .select('*')
      .eq('id', id)
      .eq('site_key', req.site.site_key)
      .maybeSingle()

    if (findErr) throw findErr
    if (!destination) {
      return res.status(404).json({ success: false, data: null, error: 'Webhook destination not found' })
    }

    // Send test webhook
    const result = await sendTestWebhook(destination, req.site.site_key)

    return res.json({
      success: true,
      data: {
        status_code: result.statusCode,
        success: result.success,
        error_message: result.errorMessage
      },
      error: null
    })
  } catch (err) {
    console.error('[webhooks] POST test error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to dispatch test webhook' })
  }
})

// POST /api/webhooks/:id/regenerate-secret?site_key=... (Regenerate signing secret)
router.post('/:id/regenerate-secret', requireUserAuth, validateSiteKey, requireSiteMembership, enforceWebhookOutbound, async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getSupabase()

    // Verify existence & ownership
    const { data: existing, error: findErr } = await supabase
      .from('webhook_destinations')
      .select('id')
      .eq('id', id)
      .eq('site_key', req.site.site_key)
      .maybeSingle()

    if (findErr) throw findErr
    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: 'Webhook destination not found' })
    }

    const newSecret = 'whsec_' + crypto.randomBytes(24).toString('hex')

    const { data, error } = await supabase
      .from('webhook_destinations')
      .update({ secret: newSecret, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return res.json({ success: true, data: { secret: data.secret }, error: null })
  } catch (err) {
    console.error('[webhooks] POST regenerate-secret error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to regenerate signing secret' })
  }
})

// DELETE /api/webhooks/:id?site_key=... (Delete a webhook destination)
router.delete('/:id', requireUserAuth, validateSiteKey, requireSiteMembership, enforceWebhookOutbound, async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getSupabase()

    // Verify existence & ownership
    const { data: existing, error: findErr } = await supabase
      .from('webhook_destinations')
      .select('id')
      .eq('id', id)
      .eq('site_key', req.site.site_key)
      .maybeSingle()

    if (findErr) throw findErr
    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: 'Webhook destination not found' })
    }

    const { error } = await supabase
      .from('webhook_destinations')
      .delete()
      .eq('id', id)

    if (error) throw error

    return res.json({ success: true, data: { deleted: true }, error: null })
  } catch (err) {
    console.error('[webhooks] DELETE error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to delete webhook' })
  }
})

export { router as webhooksRouter }
