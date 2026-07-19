import crypto from 'crypto'
import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { decryptSecret } from '../lib/utils.js'
import { claimIdempotencyKeys, logIngestionEvent, rollbackIdempotencyKeys } from '../lib/idempotency.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { dualWriteEvent } from '../../tinybird/adapter/dual-write.js'


const router = Router()

router.post('/:site_key', async (req, res) => {
  const { site_key: siteKey } = req.params

  if (!siteKey) {
    return res.status(400).json({ error: 'Missing site_key' })
  }

  // 1. Confirm req.body is a Buffer (raw request body is required for Shopify signature verification)
  if (!Buffer.isBuffer(req.body)) {
    console.error('[shopify-webhook] Error: req.body is not a Buffer. Check middleware configuration.')
    return res.status(500).json({ error: 'Internal configuration error: raw body middleware required' })
  }

  // 2. Retrieve site by site_key
  let site = null
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('sites')
      .select('id, site_key, encrypted_shopify_shared_secret, plan')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (error) throw error
    site = data
  } catch (dbErr) {
    console.error('[shopify-webhook] Database site lookup failed:', dbErr.message)
    return res.status(500).json({ error: 'Internal database error' })
  }

  // 3. Reject with 404/400 if site or secret is missing
  if (!site || !site.encrypted_shopify_shared_secret) {
    return res.status(404).json({ error: 'Site not found or Shopify sync not configured' })
  }

  // 4. Decrypt the secret
  let decryptedSecret
  try {
    decryptedSecret = decryptSecret(site.encrypted_shopify_shared_secret)
  } catch (decErr) {
    console.error('[shopify-webhook] Webhook secret decryption failed:', decErr.message)
    return res.status(500).json({ error: 'Failed to process webhook configurations' })
  }

  // 5. Verify Shopify signature timing-safely
  const signature = req.headers['x-shopify-hmac-sha256']
  if (!signature) {
    return res.status(400).json({ error: 'Missing X-Shopify-Hmac-Sha256 header' })
  }

  const computed = crypto
    .createHmac('sha256', decryptedSecret)
    .update(req.body)
    .digest('base64')

  const computedBuf = Buffer.from(computed, 'utf8')
  const providedBuf = Buffer.from(signature, 'utf8')

  if (computedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(computedBuf, providedBuf)) {
    console.error('[shopify-webhook] HMAC verification failed')
    return res.status(400).json({ error: 'Invalid HMAC signature' })
  }

  // 5b. Block inactive / archived sites
  if (site.plan === 'inactive' || site.plan === 'archived') {
    const msg = site.plan === 'archived'
      ? 'Site archived after 60 days of inactivity. Reactivate from your dashboard.'
      : 'Subscription inactive'
    return res.status(402).json({ success: false, data: null, error: msg })
  }


  // 6. Parse JSON payload only after verification
  let payload
  try {
    payload = JSON.parse(req.body.toString('utf8'))
  } catch (jsonErr) {
    console.error('[shopify-webhook] JSON parse error:', jsonErr.message)
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  // 7. Verify topic and filter for paid orders
  const topic = req.headers['x-shopify-topic']
  if (topic !== 'orders/paid' && topic !== 'orders/create') {
    return res.status(200).json({ received: true, ignored: true, reason: `Topic ${topic} ignored` })
  }

  if (topic === 'orders/create' && payload.financial_status !== 'paid') {
    return res.status(200).json({
      received: true,
      ignored: true,
      reason: `orders/create event ignored because financial_status is '${payload.financial_status || 'missing'}'`
    })
  }

  // 8. Validate value and currency before claiming idempotency
  const rawValue = payload.total_price !== undefined ? payload.total_price : payload.current_total_price
  const value = parseFloat(rawValue || 0)
  if (isNaN(value) || value < 0) {
    return res.status(400).json({ error: 'Invalid conversion value' })
  }

  const currency = (payload.currency || payload.presentment_currency || '').trim().toUpperCase()
  if (value > 0) {
    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ error: 'Invalid currency code' })
    }
  }

  const orderId = payload.id ? String(payload.id) : null
  if (!orderId) {
    return res.status(400).json({ error: 'Missing Shopify order id' })
  }

  const providerEventId = req.headers['x-shopify-webhook-id'] || null
  const occurredAt = payload.processed_at || payload.created_at || new Date().toISOString()

  // 9. Claim idempotency keys
  const keys = []
  if (providerEventId) {
    keys.push({ key_type: 'provider_event_id', key_value: providerEventId })
  }
  keys.push({ key_type: 'order_id', key_value: orderId })

  const claim = await claimIdempotencyKeys(siteKey, 'shopify', keys)

  if (claim.duplicate) {
    console.log(`[shopify-webhook] Duplicate event ${providerEventId || orderId} for site ${siteKey}`)
    await logIngestionEvent(siteKey, 'shopify', {
      providerEventId,
      orderId,
      value,
      currency,
      status: 'duplicate'
    })
    return res.status(200).json({ received: true, duplicate: true })
  }

  if (!claim.success) {
    console.error(`[shopify-webhook] Idempotency DB claim error for site ${siteKey}:`, claim.error)
    await logIngestionEvent(siteKey, 'shopify', {
      providerEventId,
      orderId,
      value,
      currency,
      status: 'error',
      errorMessage: claim.error || 'Failed to claim idempotency keys'
    })
    return res.status(500).json({ error: 'Temporary processing failure' })
  }

  // 10. Extract stitching ID from note_attributes or attributes
  const noteAttributes = payload.note_attributes || []
  const attributes = payload.attributes || {}
  const targetKeys = ['_st_aid', 'st_aid', 'anonymous_id', 'visitor_id', 'sourcetrack_user_id', 'site_user_id']

  let stitchingId = null
  let stitchingMethod = 'none'

  // Scan note_attributes array
  if (Array.isArray(noteAttributes)) {
    for (const key of targetKeys) {
      const attr = noteAttributes.find(a => a && a.name === key)
      if (attr && attr.value && String(attr.value).trim()) {
        stitchingId = String(attr.value).trim()
        stitchingMethod = `note_attributes.${key}`
        break
      }
    }
  }

  // Scan attributes map if not found
  if (!stitchingId && attributes && typeof attributes === 'object') {
    for (const key of targetKeys) {
      if (attributes[key] && String(attributes[key]).trim()) {
        stitchingId = String(attributes[key]).trim()
        stitchingMethod = `attributes.${key}`
        break
      }
    }
  }

  let distinctId
  let attributionStatus = undefined

  if (stitchingId) {
    distinctId = stitchingId
  } else {
    distinctId = `shopify_unattributed:${orderId}`
    attributionStatus = 'unattributed'
    stitchingMethod = 'none'
  }

  // 11. PostHog ingestion (privacy-safe, NO customer object, email, phone, names, addresses)
  try {
    const conversionProperties = {
      site_id: site.id,
      site_key: site.site_key,
      conversion_value: value,
      currency: currency || null,
      conversion_type: 'purchase',
      conversion_event_id: orderId,
      order_id: orderId,
      order_name: payload.name || (payload.order_number ? String(payload.order_number) : null) || null,
      provider: 'shopify',
      provider_event_id: providerEventId,
      occurred_at: occurredAt,
      ingestion_method: 'webhook_shopify',
      stitching_method: stitchingMethod,
      utm_source: 'shopify',
      utm_medium: 'webhook',
      utm_campaign: null,
      first_touch_source: 'shopify',
      first_touch_medium: 'webhook'
    }

    if (attributionStatus) {
      conversionProperties.attribution_status = attributionStatus
    }

    // Enforce monthly conversion limits (fail-open on DB errors)
    let limitCheckAllowed = true
    try {
      const limitCheck = await claimConversionUsage(site)
      if (!limitCheck.allowed) {
        limitCheckAllowed = false
      }
    } catch (limitErr) {
      console.error('[shopify-webhook] Conversion limit check failed, failing open:', limitErr.message || limitErr)
    }

    if (!limitCheckAllowed) {
      try {
        await rollbackIdempotencyKeys(siteKey, 'shopify', keys)
      } catch (rollbackErr) {
        console.error('[shopify-webhook] Failed to rollback idempotency keys after conversion limit block:', rollbackErr.message || rollbackErr)
      }
      return res.status(200).json({
        success: false,
        data: null,
        error: 'Conversion limit reached for your plan',
        ignored: true
      })
    }

    // Wave-2b cutover: Tinybird is the SOLE writer for this $conversion (ph.capture
    // removed; flag-gated OFF -> no-op + no network when off).
    // Reached ONLY after HMAC verify (:57-72), the PERSISTENT claimIdempotencyKeys
    // duplicate-skip (:138), and the plan-limit block (:249) returned — so a
    // duplicate the claim skips never dual-writes. No external_event_id on Shopify;
    // conversionProperties.order_id (= String(payload.id)) lets deriveEventId branch-5
    // resolve event_id = order_id. site_key in props is dropped by the adapter.
    dualWriteEvent({ distinctId, event: '$conversion', timestamp: occurredAt, properties: conversionProperties })

    await logIngestionEvent(siteKey, 'shopify', {
      providerEventId,
      orderId,
      value,
      currency,
      status: 'success'
    })

    return res.status(200).json({ received: true })
  } catch (phErr) {
    console.error('[shopify-webhook] PostHog capture conversion ingestion failed:', phErr.message)
    await logIngestionEvent(siteKey, 'shopify', {
      providerEventId,
      orderId,
      value,
      currency,
      status: 'error',
      errorMessage: phErr.message || 'event ingestion failed'
    })
    return res.status(500).json({ error: 'Temporary processing failure' })
  }
})

export { router as shopifyWebhookRouter }
