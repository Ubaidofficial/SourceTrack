import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { dispatchWebhook } from '../lib/webhook.js'
import { sendMetaCAPI, sendGoogleConversion, sendMicrosoftConversion, sendLinkedInConversion, sendTikTokConversion } from '../lib/conversion-sync.js'
import { getSupabase } from '../lib/supabase.js'
import { getFirstTouchFields, redactPiiFromObject, normalizeClickIds } from '../lib/utils.js'
import { hasFeature } from '../lib/plan-features.js'
import { claimIdempotencyKeys, logIngestionEvent } from '../lib/idempotency.js'

import { storeIdentityLink, resolveAnonymousId } from '../lib/identity-links.js'

// Alias kept for the CAPI block readability — same singleton underneath.
const getCapiSupabase = getSupabase

export async function conversionOffline(req, res) {
  try {
    // 1. Validate and normalize conversion_value / amount (must be numeric, >= 0)
    const rawValue = req.body.conversion_value !== undefined ? req.body.conversion_value : req.body.amount
    if (rawValue === undefined || rawValue === null) {
      return res.status(400).json({ success: false, error: 'conversion_value or amount is required' })
    }
    const val = Number(rawValue)
    if (isNaN(val) || typeof rawValue === 'boolean') {
      return res.status(400).json({ success: false, error: 'conversion_value must be a valid number' })
    }
    if (val < 0) {
      return res.status(400).json({ success: false, error: 'conversion_value must be greater than or equal to 0' })
    }
    const conversionValue = val

    // 2. Validate and normalize currency (required only if value > 0, must match /^[A-Z]{3}$/)
    let currency = typeof req.body.currency === 'string' ? req.body.currency.trim().toUpperCase() : null
    if (conversionValue > 0) {
      if (!currency || !/^[A-Z]{3}$/.test(currency)) {
        return res.status(400).json({ success: false, error: 'A valid 3-letter currency code (e.g. USD) is required for revenue events.' })
      }
    }

    // 3. Identity stitching & dedupe key extraction
    const userId      = typeof req.body.user_id      === 'string' ? req.body.user_id.trim()      : null
    const anonymousId = typeof req.body.anonymous_id === 'string' ? req.body.anonymous_id.trim() : null

    const orderId         = typeof req.body.order_id         === 'string' ? req.body.order_id.trim()         : null
    const paymentId       = typeof req.body.payment_id       === 'string' ? req.body.payment_id.trim()       : null
    const idempotencyKey   = typeof req.body.idempotency_key   === 'string' ? req.body.idempotency_key.trim()   : null
    const providerEventId = typeof req.body.provider_event_id === 'string' ? req.body.provider_event_id.trim() : null

    const hasIdentity = !!(userId || anonymousId)
    const hasDedupeKey = !!(orderId || paymentId || idempotencyKey || providerEventId)

    // Require either identity or a dedupe key
    if (!hasIdentity && !hasDedupeKey) {
      return res.status(400).json({ success: false, error: 'user_id or anonymous_id is required, or a stable deduplication key must be provided' })
    }

    // Require stable dedupe key if conversion_value > 0
    if (conversionValue > 0 && !hasDedupeKey) {
      return res.status(400).json({ success: false, error: 'At least one stable deduplication key (order_id, payment_id, idempotency_key, or provider_event_id) is required for revenue events.' })
    }

    // 4. Validate and normalize provider (default payments_api, lowercase, trim, max 50 chars, match /^[a-z0-9_-]+$/)
    let provider = typeof req.body.provider === 'string' ? req.body.provider.trim().toLowerCase() : 'payments_api'
    if (!/^[a-z0-9_-]+$/.test(provider) || provider.length > 50 || provider.length === 0) {
      return res.status(400).json({ success: false, error: 'provider must be 1-50 characters and contain only letters, numbers, underscores, or hyphens' })
    }

    // 5. Parse occurred_at / timestamp (validation must happen before claiming idempotency)
    let occurredAt = new Date().toISOString()
    const rawTime = req.body.occurred_at || req.body.timestamp
    if (rawTime !== undefined && rawTime !== null) {
      if (typeof rawTime === 'string') {
        const parsed = new Date(rawTime)
        if (!isNaN(parsed.getTime())) {
          occurredAt = parsed.toISOString()
        } else {
          return res.status(400).json({ success: false, error: 'occurred_at or timestamp must be a valid ISO 8601 date string' })
        }
      } else {
        return res.status(400).json({ success: false, error: 'occurred_at or timestamp must be a string' })
      }
    }

    // 6. Construct and claim deduplication keys
    const keys = []
    if (orderId) keys.push({ key_type: 'order_id', key_value: orderId })
    if (paymentId) keys.push({ key_type: 'payment_id', key_value: paymentId })
    if (idempotencyKey) keys.push({ key_type: 'idempotency_key', key_value: idempotencyKey })
    if (providerEventId) keys.push({ key_type: 'provider_event_id', key_value: providerEventId })

    if (keys.length > 0) {
      const claim = await claimIdempotencyKeys(req.site.site_key, provider, keys)
      if (claim.duplicate) {
        await logIngestionEvent(req.site.site_key, provider, {
          providerEventId: providerEventId || idempotencyKey || orderId || paymentId,
          orderId,
          value: conversionValue,
          currency,
          status: 'duplicate'
        })
        return res.status(200).json({ success: true, duplicate: true })
      }
      if (!claim.success) {
        await logIngestionEvent(req.site.site_key, provider, {
          providerEventId: providerEventId || idempotencyKey || orderId || paymentId,
          orderId,
          value: conversionValue,
          currency,
          status: 'error',
          errorMessage: claim.error || 'Failed to claim idempotency keys'
        })
        return res.status(500).json({ success: false, error: 'Temporary database failure' })
      }
    }

    // 7. Stitching method and distinct ID setup
    let distinctId
    let attributionStatus = undefined
    let stitchingMethod = 'none'
    let resolvedAnonymousId = null

    if (hasIdentity) {
      if (anonymousId) {
        distinctId = anonymousId
        stitchingMethod = 'anonymous_id'
        if (userId && userId !== anonymousId) {
          // Store mapping in background
          storeIdentityLink(req.site.id, userId, anonymousId, 'offline_conversion')
        }
      } else {
        // Only userId is present
        resolvedAnonymousId = await resolveAnonymousId(req.site.id, userId)
        if (resolvedAnonymousId) {
          distinctId = resolvedAnonymousId
          stitchingMethod = 'user_id_resolved'
        } else {
          distinctId = userId
          stitchingMethod = 'user_id'
        }
      }
    } else {
      distinctId = `${provider}_unattributed:${orderId || paymentId || idempotencyKey || providerEventId || uuidv4()}`
      attributionStatus = 'unattributed'
      stitchingMethod = 'none'
    }

    // 8. Sanitize metadata/custom properties using redactPiiFromObject (accept properties or metadata)
    let customProperties = {}
    const rawProps = req.body.properties || req.body.metadata
    if (rawProps && typeof rawProps === 'object' && !Array.isArray(rawProps)) {
      customProperties = redactPiiFromObject(rawProps)
    }

    const conversionType = typeof req.body.conversion_type === 'string' && req.body.conversion_type.trim()
      ? req.body.conversion_type.trim()
      : (conversionValue > 0 ? 'purchase' : 'conversion')

    const props = {
      ...customProperties, // Spread first, explicit fields override
      site_id: req.site.id,
      site_key: req.site.site_key,
      is_conversion: true,
      conversion_value: conversionValue,
      currency: currency || null,
      ...getFirstTouchFields(req.body),
      ingestion_method: 'offline',
      server_timestamp: occurredAt,
      user_agent: req.headers['user-agent'] || null,
      provider,
      provider_event_id: providerEventId,
      order_id: orderId,
      payment_id: paymentId,
      idempotency_key: idempotencyKey,
      conversion_type: conversionType,
      stitching_method: stitchingMethod,
      external_event_id: orderId ? `${req.site.id}:${orderId}:${conversionType}` : null
    }

    if (userId) props.user_id = userId
    if (anonymousId) props.anonymous_id = anonymousId
    if (resolvedAnonymousId) {
      props.has_resolved_anonymous_id = true
      if (!props.anonymous_id) {
        props.anonymous_id = resolvedAnonymousId
      }
    }
    if (attributionStatus) props.attribution_status = attributionStatus

    if (typeof req.body.external_id === 'string' && req.body.external_id.trim()) {
      props.external_id = req.body.external_id.trim()
    }
    if (typeof req.body.form_name === 'string' && req.body.form_name.trim()) {
      props.form_name = req.body.form_name.trim().slice(0, 120).replace(/[^a-zA-Z0-9 _-]/g, '')
    }
    // UTM fields (passed through for attribution stitching)
    ;['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','fbclid','msclkid','ttclid','li_fat_id','li_fatid','twclid','dclid','snapclid','pclid'].forEach(k => {
      if (typeof req.body[k] === 'string' && req.body[k].trim()) {
        props[k] = req.body[k].trim()
      }
    })

    // Normalize click IDs and LinkedIn aliases
    Object.assign(props, normalizeClickIds(props))

    ph.capture({
      distinctId,
      event: '$conversion',
      timestamp: new Date(occurredAt),
      properties: props
    })

    // Fire CAPI integrations async (keep original behavior, gated by plan)
    if (hasFeature(req.site?.plan, 'capi_server_side')) try {
      getCapiSupabase()
        .from('sites')
        .select('meta_pixel_id,meta_capi_token,google_ads_customer_id,google_ads_conversion_action_id,google_ads_developer_token,google_ads_access_token,microsoft_tag_id,microsoft_capi_token,linkedin_partner_id,linkedin_capi_token,tiktok_pixel_id,tiktok_access_token')
        .eq('id', req.site.id)
        .single()
        .then(({ data: capiSite }) => {
          if (!capiSite) return
          Promise.allSettled([
            sendMetaCAPI(capiSite, { ...props }),
            sendGoogleConversion(capiSite, props),
            sendMicrosoftConversion(capiSite, props),
            sendLinkedInConversion(capiSite, props),
            sendTikTokConversion(capiSite, { ...props })
          ]).then(results => results.forEach((r, i) => {
            if (r.status === 'rejected') console.error(`[offline CAPI ${i}]`, r.reason?.message)
          }))
        })
    } catch (_capiErr) { /* never block offline conversion response */ }

    dispatchWebhook('conversion.offline', props)

    await logIngestionEvent(req.site.site_key, provider, {
      providerEventId: providerEventId || idempotencyKey || orderId || paymentId,
      orderId,
      value: conversionValue,
      currency,
      status: 'success'
    })

    res.status(200).json({
      success: true,
      duplicate: false,
      data: { received: true, distinct_id: distinctId, ingestion_method: 'offline' },
      error: null
    })
  } catch (err) {
    console.error('[conversion-offline] error:', err?.message, { site_id: req.site?.id })
    res.status(500).json({ success: false, error: 'Offline conversion failed' })
  }
}
