import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { getSupabase } from './supabase.js'
import { redactPiiFromUrl } from './utils.js'
import { channelFromEvent } from './channel-classifier.js'
import { hasFeature } from './plan-features.js'

const WEBHOOK_URL = process.env.WEBHOOK_URL || null
const WEBHOOK_TIMEOUT_MS = 5000

// Helper to filter out sensitive PII keys from custom properties
function sanitizeCustomProperties(props) {
  if (!props || typeof props !== 'object') return {}
  const clean = {}
  const piiKeys = [
    'email', 'phone', 'name', 'password', 'token', 'secret',
    'address', 'ip', 'user_agent', 'ua', 'authorization'
  ]
  for (const [key, val] of Object.entries(props)) {
    const isPii = piiKeys.some(k => key.toLowerCase().includes(k))
    if (!isPii) {
      clean[key] = val
    }
  }
  return clean
}

// Raw ad click identifiers that may be present on a conversion (mirrors
// normalizeClickIds in lib/utils.js). Collected into a nested object, empties
// omitted, so the payload only carries the click IDs that were actually seen.
const CLICK_ID_KEYS = [
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid',
  'li_fat_id', 'li_fatid', 'twclid', 'dclid', 'snapclid', 'pclid',
  'sccid', 'ko_click_id'
]
function collectClickIds(props) {
  const out = {}
  for (const key of CLICK_ID_KEYS) {
    const val = props?.[key]
    if (val !== null && val !== undefined && val !== '') out[key] = val
  }
  return out
}

// Outbound Webhook Test Dispatcher
export async function sendTestWebhook(destination, siteKey) {
  const mockPayload = {
    event: "conversion.created",
    created_at: new Date().toISOString(),
    site_key: siteKey || 'sk_live_mock123',
    conversion: {
      type: "purchase",
      value: 100.00,
      currency: "USD",
      order_id: "TEST-ORD-1234",
      event_id: uuidv4()
    },
    visitor: {
      anonymous_id: "test-anon-uuid-1234",
      user_id: "test-user-1234"
    },
    attribution: {
      source: "google",
      medium: "cpc",
      campaign: "test-campaign",
      content: "test-content",
      term: "test-term",
      channel: "Paid Search",
      ai_source: null,
      click_ids: { gclid: "TEST-gclid-1234" }
    },
    page: {
      page_url: "https://example.com/checkout/thank-you",
      referrer: "https://google.com"
    },
    properties: {
      test: true
    }
  }

  const bodyStr = JSON.stringify(mockPayload)
  const signature = crypto
    .createHmac('sha256', destination.secret)
    .update(bodyStr)
    .digest('hex')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

  let statusCode = null
  let success = false
  let errorMessage = null

  try {
    const res = await fetch(destination.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SourceTrack-Signature': signature,
        'X-SourceTrack-Event': 'conversion.created'
      },
      body: bodyStr,
      signal: controller.signal
    })

    statusCode = res.status
    success = res.ok
    if (!res.ok) {
      errorMessage = `HTTP error ${res.status}`
    }
  } catch (err) {
    success = false
    errorMessage = err.name === 'AbortError' ? 'Webhook timed out after 5000ms' : err.message
  } finally {
    clearTimeout(timer)
  }

  try {
    const supabase = getSupabase()
    await supabase
      .from('webhook_deliveries')
      .insert({
        destination_id: destination.id,
        event_type: 'conversion.created',
        status_code: statusCode,
        success,
        error_message: errorMessage ? errorMessage.substring(0, 500) : null
      })
  } catch (logErr) {
    console.error('[webhooks] failed to log test delivery:', logErr.message)
  }

  return { statusCode, success, errorMessage }
}

// Drop-in dispatchWebhook replacement that performs tenant webhook routing
export function dispatchWebhook(eventType, properties) {
  // Fire and forget: run in background so it doesn't block the caller's response
  Promise.resolve().then(async () => {
    try {
      const siteKey = properties.site_key
      if (!siteKey) return

      const supabase = getSupabase()

      // 1. Query active webhook destination for this tenant site
      const { data: dest, error: destErr } = await supabase
        .from('webhook_destinations')
        .select('id, url, secret, active, site_key')
        .eq('site_key', siteKey)
        .eq('active', true)
        .maybeSingle()

      if (destErr) {
        console.error('[webhooks] failed to query webhook destinations:', destErr.message)
      }

      if (dest) {
        // Query owner site's plan features separately
        const { data: site, error: siteErr } = await supabase
          .from('sites')
          .select('plan')
          .eq('site_key', siteKey)
          .maybeSingle()

        if (siteErr) {
          console.error('[webhooks] failed to query site plan:', siteErr.message)
          return // Safe skip / fail closed
        }

        if (!site || !site.plan || !hasFeature(site.plan, 'webhook_outbound')) {
          return // Silent skip: plan downgraded or missing site/plan
        }



        // 2. Format attributed conversion payload
        const source = properties.first_touch_source !== 'direct' ? properties.first_touch_source : (properties.utm_source || 'direct')
        const medium = properties.first_touch_medium !== 'none' ? properties.first_touch_medium : (properties.utm_medium || 'none')
        const campaign = properties.first_touch_campaign || properties.utm_campaign || ''

        const channel = channelFromEvent({
          utm_source: source,
          utm_medium: medium,
          utm_campaign: campaign,
          referrer: properties.referrer,
          page_url: properties.page_url,
          ai_source: properties.ai_source,
          gclid: properties.gclid,
          fbclid: properties.fbclid,
          msclkid: properties.msclkid,
          ttclid: properties.ttclid,
          li_fat_id: properties.li_fat_id
        })

        // Standard conversions keep 'conversion.created' for backward-compat;
        // offline conversions get their own event name so consumers can tell
        // them apart. (eventType is 'conversion' or 'conversion.offline'.)
        const eventName = eventType === 'conversion.offline' ? 'conversion.offline' : 'conversion.created'

        const payload = {
          event: eventName,
          created_at: new Date().toISOString(),
          site_key: siteKey,
          conversion: {
            type: properties.conversion_type || 'conversion',
            value: parseFloat(properties.conversion_value) || 0,
            currency: properties.currency || 'USD',
            order_id: properties.order_id || null,
            event_id: uuidv4()
          },
          visitor: {
            anonymous_id: properties.anonymous_id || null,
            user_id: properties.user_id || null
          },
          attribution: {
            source,
            medium,
            campaign,
            content: properties.utm_content || null,
            term: properties.utm_term || null,
            channel,
            ai_source: properties.ai_source || null,
            click_ids: collectClickIds(properties)
          },
          page: {
            page_url: properties.page_url ? redactPiiFromUrl(properties.page_url) : null,
            referrer: properties.referrer ? redactPiiFromUrl(properties.referrer) : null
          },
          properties: sanitizeCustomProperties(properties.custom_properties || properties.properties)
        }

        const bodyStr = JSON.stringify(payload)
        const signature = crypto
          .createHmac('sha256', dest.secret)
          .update(bodyStr)
          .digest('hex')

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

        let statusCode = null
        let success = false
        let errorMessage = null

        try {
          const res = await fetch(dest.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-SourceTrack-Signature': signature,
              'X-SourceTrack-Event': eventName
            },
            body: bodyStr,
            signal: controller.signal
          })

          statusCode = res.status
          success = res.ok
          if (!res.ok) {
            errorMessage = `HTTP error ${res.status}`
          }
        } catch (fetchErr) {
          success = false
          errorMessage = fetchErr.name === 'AbortError' ? 'Webhook timed out after 5000ms' : fetchErr.message
        } finally {
          clearTimeout(timer)
        }

        // Write log (no response body stored)
        try {
          await supabase
            .from('webhook_deliveries')
            .insert({
              destination_id: dest.id,
              event_type: eventName,
              status_code: statusCode,
              success,
              error_message: errorMessage ? errorMessage.substring(0, 500) : null
            })
        } catch (logErr) {
          console.error('[webhooks] failed to log delivery:', logErr.message)
        }
      }

      const shouldSendGlobal = WEBHOOK_URL && process.env.NODE_ENV !== 'production'

      if (shouldSendGlobal) {
        const legacyPayload = {
          event_id: uuidv4(),
          event_type: eventType,
          occurred_at: new Date().toISOString(),
          source: 'sourcetrack',
          data: {}
        }

        if (properties.site_id) legacyPayload.data.site_id = properties.site_id
        if (properties.site_key) legacyPayload.data.site_key = properties.site_key
        if (properties.anonymous_id) legacyPayload.data.anonymous_id = properties.anonymous_id
        if (properties.user_id) legacyPayload.data.user_id = properties.user_id
        if (properties.conversion_type) legacyPayload.data.conversion_type = properties.conversion_type
        if (properties.conversion_value !== undefined) legacyPayload.data.conversion_value = properties.conversion_value
        if (properties.form_name) legacyPayload.data.form_name = properties.form_name
        if (properties.ingestion_method) legacyPayload.data.ingestion_method = properties.ingestion_method
        if (properties.external_id) legacyPayload.data.external_id = properties.external_id
        if (properties.source_system) legacyPayload.data.source_system = properties.source_system

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

        fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(legacyPayload),
          signal: controller.signal
        })
          .catch(err => {
            console.error('[webhooks] global webhook failed:', err.message)
          })
          .finally(() => clearTimeout(timer))
      }
    } catch (err) {
      console.error('[webhooks] global error in background dispatch:', err.message)
    }
  }).catch(err => {
    console.error('[webhooks] uncaught exception in background dispatch promise:', err.message)
  })
}
