import { createHash } from 'crypto'
import { encryptSecret, decryptSecret } from './utils.js'
import { logCapiDelivery } from './capi-deliveries.js'

function sha256(str) {
  return createHash('sha256').update(str.trim().toLowerCase()).digest('hex')
}

// CAPI tokens are stored encrypted at rest (AES-256-GCM, ENCRYPTION_KEY) — same
// pattern as gsc/stripe secrets. Decrypt FAIL-SAFE: a token that can't be
// decrypted (bad/corrupt/plaintext) returns null so that platform NO-OPS — we
// never send a garbage token to an ad platform and never throw into the
// conversion path. Phase 2's config-write path must call encryptCapiToken().
function safeDecrypt(value) {
  if (!value) return null
  try {
    return decryptSecret(value)
  } catch (_) {
    return null
  }
}

// Phase 2 (config UI / write path) calls this before persisting a CAPI token.
// Exported now so the encrypt/decrypt pair lives in one place.
export function encryptCapiToken(value) {
  return encryptSecret(value)
}

/**
 * fetch wrapper with bounded retry on 429 / 5xx.
 * CAPI providers occasionally return transient errors (Meta especially during
 * peak hours). Without retry, a single network hiccup means a lost conversion
 * in the ad platform — bad for ROAS reporting.
 *
 * Retries: 2 attempts after the first (3 total), exponential backoff.
 * 4xx other than 429 (auth, validation) are surfaced immediately — retrying
 * those would only burn rate-limit budget.
 */
async function fetchWithRetry(url, opts = {}, label = 'CAPI') {
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response
    try {
      response = await fetch(url, opts)
    } catch (networkErr) {
      // DNS / connection reset / timeout — retry transparently.
      if (attempt < maxAttempts - 1) {
        const wait = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250) // + jitter
        console.warn(`[${label}] network error (${networkErr.message}) — retrying in ${wait}ms`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      throw networkErr
    }

    const retryable = response.status === 429 || response.status >= 500
    if (retryable && attempt < maxAttempts - 1) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10)
      const wait = retryAfter > 0 ? retryAfter * 1000 : 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250) // + jitter
      console.warn(`[${label}] HTTP ${response.status} — retrying in ${wait}ms (attempt ${attempt + 1}/${maxAttempts})`)
      await new Promise(r => setTimeout(r, wait))
      continue
    }

    return response
  }
}

// ─── Event-key normalization ────────────────────────────────────────────────
// Customers ship every casing imaginable: 'Purchase', 'add-to-cart',
// 'Initiate Checkout', 'AddToCart', 'form_submit'. Normalize once.
//   - lowercase
//   - hyphens and whitespace → underscore
//   - trim
function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_')
}

// ─── Meta CAPI event name mapping ────────────────────────────────────────────
// Maps SourceTrack conversion_type → Meta standard event name.
// Full reference: https://developers.facebook.com/docs/meta-pixel/reference
const META_EVENT_MAP = {
  // Purchases
  purchase:          'Purchase',
  sale:              'Purchase',
  order:             'Purchase',
  buy:               'Purchase',
  // Cart / checkout
  add_to_cart:       'AddToCart',
  addtocart:         'AddToCart',
  add_cart:          'AddToCart',
  checkout:          'InitiateCheckout',
  initiate_checkout: 'InitiateCheckout',
  begin_checkout:    'InitiateCheckout',
  // Lead-gen
  lead:              'Lead',
  form:              'Lead',
  form_submit:       'Lead',
  contact:           'Lead',
  // Registration / trial
  signup:            'CompleteRegistration',
  sign_up:           'CompleteRegistration',
  register:          'CompleteRegistration',
  registration:      'CompleteRegistration',
  trial:             'CompleteRegistration',
  trial_start:       'CompleteRegistration',
  // Subscription
  subscribe:         'Subscribe',
  subscription:      'Subscribe',
  // Content / browse
  view_content:      'ViewContent',
  page_view:         'ViewContent',
  search:            'Search',
  wishlist:          'AddToWishlist',
  donate:            'Donate',
}

// Default fallback. Most CAPI traffic is eCommerce — Purchase is the safer
// default for Meta's optimisation than Lead, per platform UX guidance.
function getMetaEventName(conversionType) {
  return META_EVENT_MAP[normalizeKey(conversionType)] || 'Purchase'
}

// ─── TikTok CAPI event name mapping ──────────────────────────────────────────
// Reference: https://business-api.tiktok.com/portal/docs
const TIKTOK_EVENT_MAP = {
  // Purchases (TikTok calls this PlaceAnOrder)
  purchase:    'PlaceAnOrder',
  sale:        'PlaceAnOrder',
  order:       'PlaceAnOrder',
  buy:         'PlaceAnOrder',
  // Cart / checkout
  add_to_cart: 'AddToCart',
  addtocart:   'AddToCart',
  add_cart:    'AddToCart',
  checkout:    'InitiateCheckout',
  initiate_checkout: 'InitiateCheckout',
  begin_checkout:    'InitiateCheckout',
  // Lead-gen
  lead:        'SubmitForm',
  form:        'SubmitForm',
  form_submit: 'SubmitForm',
  contact:     'Contact',
  // Registration / trial
  signup:      'CompleteRegistration',
  sign_up:     'CompleteRegistration',
  register:    'CompleteRegistration',
  registration:'CompleteRegistration',
  trial:       'CompleteRegistration',
  // Subscription
  subscribe:   'Subscribe',
  subscription:'Subscribe',
  // Content / browse
  view_content:'ViewContent',
  page_view:   'ViewContent',
  search:      'Search',
  download:    'Download',
}

function getTikTokEventName(conversionType) {
  return TIKTOK_EVENT_MAP[normalizeKey(conversionType)] || 'PlaceAnOrder'
}

// ─── Meta CAPI ────────────────────────────────────────────────────────────────
export async function sendMetaCAPI(site, evt) {
  const token = safeDecrypt(site.meta_capi_token)
  if (!site.meta_pixel_id || !token) return null  // no/undecryptable token → no-op (fail-safe)

  const userData = {}
  if (evt.ip_address)  userData.client_ip_address  = evt.ip_address
  if (evt.user_agent)  userData.client_user_agent  = evt.user_agent
  if (evt.email)       userData.em                 = [sha256(evt.email)]
  if (evt.fbclid)      userData.fbc = `fb.1.${Date.now()}.${evt.fbclid}`

  const eventName = getMetaEventName(evt.conversion_type)

  const body = {
    data: [{
      event_name:        eventName,
      event_time:        Math.floor(new Date(evt.timestamp ?? Date.now()).getTime() / 1000),
      action_source:     'website',
      event_source_url:  evt.page_url ?? null,
      event_id:          evt.external_event_id ?? undefined, // dedup key
      user_data:         userData,
      custom_data: {
        value:    Number(evt.conversion_value) || 0,
        currency: evt.currency ?? 'USD',
        ...(evt.order_id       ? { order_id: evt.order_id }             : {}),
        ...(evt.conversion_type? { content_type: evt.conversion_type }  : {}),
      }
    }]
  }

  // Only attach test_event_code if explicitly set — never use a hardcoded fallback
  const testCode = process.env.META_TEST_EVENT_CODE
  if (testCode) body.test_event_code = testCode

  const r = await fetchWithRetry(
    `https://graph.facebook.com/v19.0/${site.meta_pixel_id}/events?access_token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    'Meta CAPI'
  )
  const result = await r.json().catch(() => ({}))
  if (!r.ok) console.error('[Meta CAPI]', eventName, JSON.stringify(result))
  return { ok: r.ok, http_status: r.status, error_message: r.ok ? null : JSON.stringify(result).slice(0, 500) }
}

// ─── Google Ads Conversion Upload ────────────────────────────────────────────
// Requires an OAuth2 access token (NOT the developer token).
// Customers must provide their own token via GOOGLE_ADS_ACCESS_TOKEN env var
// or per-site google_ads_access_token column.
//
// How to get an access token:
//   1. Create OAuth2 credentials in Google Cloud Console
//   2. Complete OAuth2 flow for the Google Ads account
//   3. Use the resulting access_token (refresh periodically — 1h TTL)
//   Reference: https://developers.google.com/google-ads/api/docs/oauth/overview
export async function sendGoogleConversion(site, evt) {
  const devToken = safeDecrypt(site.google_ads_developer_token)
  if (!site.google_ads_customer_id || !devToken) return null  // no/undecryptable token → no-op
  if (!evt.gclid && !evt.gbraid && !evt.wbraid) return null // no click ID = no attribution

  // OAuth2 access token: per-site column (encrypted) takes priority, then global env var
  const accessToken = safeDecrypt(site.google_ads_access_token) || process.env.GOOGLE_ADS_ACCESS_TOKEN
  if (!accessToken) {
    console.warn('[Google Ads CAPI] Skipped — no OAuth2 access token configured. Set GOOGLE_ADS_ACCESS_TOKEN env var or google_ads_access_token on the site.')
    return null
  }

  const clickIds = {}
  if (evt.gclid)  clickIds.gclid  = evt.gclid
  if (evt.gbraid) clickIds.gbraid = evt.gbraid
  if (evt.wbraid) clickIds.wbraid = evt.wbraid

  const body = {
    conversions: [{
      ...clickIds,
      conversion_action: `customers/${site.google_ads_customer_id}/conversionActions/${site.google_ads_conversion_action_id}`,
      conversion_date_time: new Date(evt.timestamp ?? Date.now()).toISOString().replace('T', ' ').replace('Z', '+00:00'),
      conversion_value: Number(evt.conversion_value) || 0,
      currency_code: evt.currency ?? 'USD',
      order_id: evt.order_id ?? undefined,
      user_identifiers: evt.email ? [{ hashed_email: sha256(evt.email) }] : []
    }]
  }

  const r = await fetchWithRetry(
    `https://googleads.googleapis.com/v16/customers/${site.google_ads_customer_id}:uploadClickConversions`,
    {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${accessToken}`,       // OAuth2 token
        'developer-token': devToken,                        // separate header (decrypted)
        'Content-Type':    'application/json'
      },
      body: JSON.stringify(body)
    },
    'Google Ads CAPI'
  )
  let detail = ''
  if (!r.ok) {
    detail = await r.text().catch(() => '')
    console.error('[Google Ads CAPI] HTTP', r.status, detail.slice(0, 200))
  }
  return { ok: r.ok, http_status: r.status, error_message: r.ok ? null : detail.slice(0, 500) }
}

// ─── Microsoft UET ───────────────────────────────────────────────────────────
export async function sendMicrosoftConversion(site, evt) {
  // Decrypt to validate the token is present + well-formed (fail-safe). The
  // existing Microsoft request shape is unchanged (Phase 1 adds no new sender
  // behavior); Phase 2 wires the token into the request if/when needed.
  const token = safeDecrypt(site.microsoft_capi_token)
  if (!site.microsoft_tag_id || !token) return null  // no/undecryptable token → no-op

  const r = await fetchWithRetry('https://bat.bing.com/bat.svc/c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      TagId:    site.microsoft_tag_id,
      MsclkId:  evt.msclkid ?? null,
      Revenue:  Number(evt.conversion_value) || 0,
      Currency: evt.currency ?? 'USD',
      EventType: evt.conversion_type ?? 'conversion'
    })
  }, 'Microsoft UET')
  if (!r.ok) console.error('[Microsoft UET] HTTP', r.status)
  return { ok: r.ok, http_status: r.status, error_message: r.ok ? null : `HTTP ${r.status}` }
}

// ─── LinkedIn CAPI ───────────────────────────────────────────────────────────
export async function sendLinkedInConversion(site, evt) {
  const token = safeDecrypt(site.linkedin_capi_token)
  if (!site.linkedin_partner_id || !token) return null  // no/undecryptable token → no-op

  const body = {
    conversion: `urn:lla:llaPartnerConversion:${site.linkedin_partner_id}`,
    conversionHappenedAt: new Date(evt.timestamp ?? Date.now()).getTime(),
    conversionValue: {
      currencyCode: evt.currency ?? 'USD',
      amount: String(Number(evt.conversion_value) || 0)
    }
  }
  if (evt.email) {
    body.user = { userIds: [{ idType: 'SHA256_EMAIL', idValue: sha256(evt.email) }] }
  }
  if (evt.li_fat_id) {
    body.user = body.user || { userIds: [] }
    body.user.userIds.push({ idType: 'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID', idValue: evt.li_fat_id })
  }

  const r = await fetchWithRetry('https://api.linkedin.com/v2/conversionEvents', {
    method: 'POST',
    headers: {
      'Authorization':    `Bearer ${token}`,
      'LinkedIn-Version': '202406',
      'Content-Type':     'application/json'
    },
    body: JSON.stringify(body)
  }, 'LinkedIn CAPI')
  if (!r.ok) console.error('[LinkedIn CAPI] HTTP', r.status)
  return { ok: r.ok, http_status: r.status, error_message: r.ok ? null : `HTTP ${r.status}` }
}

// ─── TikTok CAPI ─────────────────────────────────────────────────────────────
export async function sendTikTokConversion(site, eventData) {
  if (!site?.tiktok_pixel_id || !site?.tiktok_access_token) return

  const eventName = getTikTokEventName(eventData.conversion_type)

  try {
    const payload = {
      pixel_code: site.tiktok_pixel_id,
      event:      eventName,
      event_time: Math.floor(new Date(eventData.timestamp ?? Date.now()).getTime() / 1000),
      event_id:   eventData.external_event_id ?? undefined, // dedup key
      context: {
        user: {
          ...(eventData.ttclid    ? { ttclid: eventData.ttclid } : {}),
          ...(eventData.ip_address ? { ip:     sha256(eventData.ip_address) } : {}),
          ...(eventData.email      ? { email:  sha256(eventData.email) }      : {}),
        },
        page: { url: eventData.page_url || undefined }
      },
      properties: {
        currency:     'USD',
        value:        Number(eventData.conversion_value) || 0,
        ...(eventData.order_id       ? { order_id:     eventData.order_id }       : {}),
        ...(eventData.conversion_type? { content_type: eventData.conversion_type } : {}),
      }
    }

    const res = await fetchWithRetry('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': site.tiktok_access_token
      },
      body: JSON.stringify({
        pixel_code: site.tiktok_pixel_id,
        batch: [payload]
      })
    }, 'TikTok CAPI')
    if (!res.ok) {
      const err = await res.text()
      console.error('[TikTok CAPI]', eventName, err.slice(0, 200))
    }
  } catch (e) {
    console.error('[TikTok CAPI]', e.message)
  }
}

// ─── CAPI fan-out + delivery log ─────────────────────────────────────────────
// Runs the configured senders for one conversion and writes ONE capi_deliveries
// row per real send attempt (success/failed). A sender that returns null (no
// token / undecryptable token / no click id) made no attempt and is NOT logged
// — keeps the table to genuine attempts. Never throws into the conversion path.
// `site` must include `id` (selected by the caller) + the CAPI columns.
export async function dispatchCapi(supabase, site, evt) {
  const eventRef = evt.external_event_id || evt.order_id || null
  const senders = [
    ['meta', sendMetaCAPI],
    ['google', sendGoogleConversion],
    ['microsoft', sendMicrosoftConversion],
    ['linkedin', sendLinkedInConversion]
  ]

  await Promise.allSettled(senders.map(async ([platform, fn]) => {
    let result
    try {
      result = await fn(site, evt)
    } catch (err) {
      await logCapiDelivery(supabase, {
        site_id: site.id, platform, event_ref: eventRef,
        status: 'failed', http_status: null,
        error_message: String(err?.message || err).slice(0, 500), attempt: 1
      })
      return
    }
    if (result === null || result === undefined) return  // skipped (no attempt) — not logged
    await logCapiDelivery(supabase, {
      site_id: site.id, platform, event_ref: eventRef,
      status: result.ok ? 'success' : 'failed',
      http_status: result.http_status ?? null,
      error_message: result.ok ? null : (result.error_message || null),
      attempt: 1
    })
  }))
}
