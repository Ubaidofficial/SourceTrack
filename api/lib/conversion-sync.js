import { createHash } from 'crypto'
import { encryptSecret, decryptSecret } from './utils.js'
import { logCapiDelivery } from './capi-deliveries.js'
// Reused as-is by sendGoogleConversion. The ad-cost sync path already owns the Google
// OAuth refresh; CAPI shares that one implementation rather than re-deriving it.
import { refreshAccessToken } from './google-ads.js'
import { normalizeCurrencyCode, hasKnownCurrency } from './currency.js'
import { isErasureSuppressed, logSuppressionBlocked } from './erasure-suppression.js'

// Emit `{ [field]: 'XXX' }` for a known currency, or `{}` — the field is OMITTED — when the unit
// is unknown. Each platform names the field differently, hence the parameter.
//
// This replaces `evt.currency ?? 'USD'`, which stood in all six senders and asserted dollars onto
// an ad platform's ledger for any event whose unit we never knew. A wrong currency there is not a
// display bug: the platform books the amount, bids on it, and reports ROAS from it.
//
// Omitting beats defaulting because every one of these APIs treats currency as optional when there
// is no amount to denominate, and revenue-bearing events can no longer arrive here without a unit —
// dispatchCapi() drops those before any sender runs (see the gate there). So in practice this
// returns {} only for zero-value events, where there is no money to mislabel.
function capiCurrency (evt, field) {
  const code = normalizeCurrencyCode(evt?.currency)
  return code ? { [field]: code } : {}
}

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

// ─── Meta CAPI ────────────────────────────────────────────────────────────────
export async function sendMetaCAPI(site, evt) {
  const token = safeDecrypt(site.meta_capi_token)
  if (!site.meta_pixel_id || !token) return null  // no/undecryptable token → no-op (fail-safe)

  const userData = {}
  if (evt.ip_address)  userData.client_ip_address  = evt.ip_address
  if (evt.user_agent)  userData.client_user_agent  = evt.user_agent
  if (evt.email)       userData.em                 = [sha256(evt.email)]
  // Prefer the real Meta cookies (highest match quality); else derive fbc from fbclid.
  if (evt.fbp)         userData.fbp = evt.fbp
  if (evt.fbc)         userData.fbc = evt.fbc
  else if (evt.fbclid) userData.fbc = `fb.1.${Date.now()}.${evt.fbclid}`

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
        ...capiCurrency(evt, 'currency'),
        ...(evt.order_id       ? { order_id: evt.order_id }             : {}),
        ...(evt.conversion_type? { content_type: evt.conversion_type }  : {}),
      }
    }]
  }

  // Only attach test_event_code if explicitly set — never use a hardcoded fallback
  const testCode = process.env.META_TEST_EVENT_CODE
  if (testCode) body.test_event_code = testCode

  // Same env var + default as the ad-cost sync path, so the two Meta callers cannot drift.
  const apiVersion = process.env.META_GRAPH_API_VERSION || 'v26.0'
  const r = await fetchWithRetry(
    `https://graph.facebook.com/${apiVersion}/${site.meta_pixel_id}/events?access_token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    'Meta CAPI'
  )
  const result = await r.json().catch(() => ({}))
  if (!r.ok) console.error('[Meta CAPI]', eventName, JSON.stringify(result))
  return { ok: r.ok, http_status: r.status, error_message: r.ok ? null : JSON.stringify(result).slice(0, 500) }
}

// ─── Google Ads Conversion Upload ────────────────────────────────────────────
// Authenticates from the site's Google Ads OAuth CONNECTION, not from sites columns.
//
// WHAT THIS REPLACED, AND WHY — the previous version could never work, for two
// independent reasons, and both are fixed here:
//
//   1. It sent `developer-token` from the per-site sites.google_ads_developer_token
//      column. A Google Ads developer token is issued ONCE to the software provider
//      (SourceTrack), never to an individual advertiser, so no customer could ever
//      paste a correct value. The developer token is now the shared, app-level
//      process.env.GOOGLE_ADS_DEVELOPER_TOKEN — the SAME env var the ad-cost sync
//      worker already reads (api/lib/google-ads.js fetchGoogleAdsPerformance).
//
//   2. It read an OAuth2 ACCESS token: `site.google_ads_access_token` with a
//      GOOGLE_ADS_ACCESS_TOKEN env fallback. That column exists in NO migration and
//      in NO SELECT list — verified absent from prod `sites` — so the column read was
//      always undefined and it always fell through to the env var. An access token
//      lives ~1h and there was no refresh path, so an env-pinned one is expired almost
//      immediately. Auth is now a refresh-token flow via refreshAccessToken().
//
// Ad-cost import (read direction) and this upload (write direction) need the SAME
// OAuth grant, so both now share one ad_platform_connections row per site.
//
// The connection is PRE-LOADED onto `site.google_ads_connection` by the conversion
// routes before dispatchCapi runs — senders keep their pure (site, evt) signature and
// do no I/O of their own beyond the platform call.
export async function sendGoogleConversion(site, evt) {
  const conn = site.google_ads_connection
  // Fail-safe no-op (returns null → no attempt, not logged), same convention as every
  // other sender. Covers: no connection row, OAuth not finished, revoked/errored
  // connection, and a connection that imports cost but has no conversion action set.
  if (!conn || conn.status !== 'connected') return null
  if (!conn.account_id || !conn.conversion_action_id || !conn.encrypted_refresh_token) return null
  if (!evt.gclid && !evt.gbraid && !evt.wbraid) return null // no click ID = no attribution

  // App-level, shared, single value. Absent in every environment today (the token has
  // not been issued yet), so this no-ops rather than logging a failed delivery for
  // every conversion on every site — a missing app-level credential is "not configured",
  // not "delivery failed".
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) return null

  // Short-lived access token, minted per send. This is a live call to Google's token
  // endpoint on every conversion — the same thing runGoogleSync already does per sync.
  let accessToken
  try {
    const refreshed = await refreshAccessToken(conn.encrypted_refresh_token)
    accessToken = refreshed?.access_token
  } catch (err) {
    // A refresh failure means the grant is broken (revoked/expired), which is a REAL
    // delivery failure worth surfacing — unlike the not-configured cases above, which
    // no-op. refreshAccessToken throws bare codes ('google_access_token_refresh_failed',
    // 'Google OAuth credentials not configured'), never a token value.
    const msg = String(err?.message || err).slice(0, 500)
    console.error('[Google Ads CAPI] token refresh failed:', msg)
    return { ok: false, http_status: null, error_message: msg }
  }
  if (!accessToken) return { ok: false, http_status: null, error_message: 'google_access_token_missing_after_refresh' }

  // Same normalisation the sync path uses — the API rejects dashed ids.
  const customerId = String(conn.account_id).replace(/-/g, '').trim()
  const loginCustomerId = conn.login_customer_id
    ? String(conn.login_customer_id).replace(/-/g, '').trim()
    : null

  const clickIds = {}
  if (evt.gclid)  clickIds.gclid  = evt.gclid
  if (evt.gbraid) clickIds.gbraid = evt.gbraid
  if (evt.wbraid) clickIds.wbraid = evt.wbraid

  const body = {
    conversions: [{
      ...clickIds,
      conversion_action: `customers/${customerId}/conversionActions/${conn.conversion_action_id}`,
      conversion_date_time: new Date(evt.timestamp ?? Date.now()).toISOString().replace('T', ' ').replace('Z', '+00:00'),
      conversion_value: Number(evt.conversion_value) || 0,
      ...capiCurrency(evt, 'currency_code'),
      order_id: evt.order_id ?? undefined,
      user_identifiers: evt.email ? [{ hashed_email: sha256(evt.email) }] : []
    }]
  }

  const headers = {
    'Authorization':   `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type':    'application/json'
  }
  // Manager (MCC) account header, only when the connection captured one.
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

  // Version comes from the same env var + default as the sync path, so the two Google
  // Ads callers cannot drift. The old hardcoded v16 had already drifted from v24.
  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || 'v24'
  const r = await fetchWithRetry(
    `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}:uploadClickConversions`,
    { method: 'POST', headers, body: JSON.stringify(body) },
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
      ...capiCurrency(evt, 'Currency'),
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
      ...capiCurrency(evt, 'currencyCode'),
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

// ─── GA4 Measurement Protocol event name mapping ─────────────────────────────
// Maps SourceTrack conversion_type → GA4 RECOMMENDED event name. These exact
// strings are what GA4's built-in reports key off — a 'purchase' populates the
// revenue reports, an arbitrary string lands in "other" and reports nothing. So
// the map is the minimum correct behaviour, not decoration.
// Reference: https://developers.google.com/analytics/devguides/collection/ga4/reference/events
const GA4_EVENT_MAP = {
  purchase:          'purchase',
  sale:              'purchase',
  order:             'purchase',
  buy:               'purchase',
  subscribe:         'purchase',
  subscription:      'purchase',
  donate:            'purchase',
  add_to_cart:       'add_to_cart',
  addtocart:         'add_to_cart',
  add_cart:          'add_to_cart',
  checkout:          'begin_checkout',
  initiate_checkout: 'begin_checkout',
  begin_checkout:    'begin_checkout',
  lead:              'generate_lead',
  form:              'generate_lead',
  form_submit:       'generate_lead',
  contact:           'generate_lead',
  signup:            'sign_up',
  sign_up:           'sign_up',
  register:          'sign_up',
  registration:      'sign_up',
  trial:             'sign_up',
  trial_start:       'sign_up',
  view_content:      'view_item',
  page_view:         'page_view',
  search:            'search',
  wishlist:          'add_to_wishlist',
}

// ─── GA4 Measurement Protocol ────────────────────────────────────────────────
// No OAuth: measurement_id + api_secret are query params. api_secret is the
// secret half and is stored encrypted (safeDecrypt below).
//
// ⚠️ HONEST LIMITATION — what a 'success' delivery row means here. GA4's
// production ingestion endpoint answers 204 No Content for ANY structurally
// readable payload, including a malformed or rejected body; only the separate
// /debug/mp/collect endpoint validates. So for this platform (unlike Meta or
// TikTok) `ok: true` means "GA4 accepted the request", NOT "GA4 processed the
// event". The delivery log cannot say more than that because GA4 does not tell
// us more. Documented rather than dressed up as a stronger guarantee.
export async function sendGA4Conversion(site, evt) {
  const apiSecret = safeDecrypt(site.ga4_api_secret)
  if (!site.ga4_measurement_id || !apiSecret) return null  // no/undecryptable secret → no-op (fail-safe)

  // MP requires a client_id to attach the event to a user. Prefer a real GA4
  // client_id when the merchant forwards one; otherwise fall back to our own
  // visitor id. On the fallback the event still lands, but it starts a NEW GA4
  // user instead of joining the visitor's existing _ga session — a real
  // match-quality limit, stated here rather than hidden.
  const clientId = evt.ga_client_id || evt.anonymous_id || evt.distinct_id || null
  if (!clientId) return null  // no client_id = MP cannot attribute it → no attempt

  const eventName = GA4_EVENT_MAP[normalizeKey(evt.conversion_type)] || 'purchase'

  const body = {
    client_id: String(clientId),
    events: [{
      name: eventName,
      params: {
        value:                 Number(evt.conversion_value) || 0,
        ...capiCurrency(evt, 'currency'),
        engagement_time_msec:  1,           // required for the event to count toward engagement
        ...(evt.order_id ? { transaction_id: evt.order_id } : {}),
        ...(evt.page_url ? { page_location: evt.page_url } : {}),
      }
    }]
  }

  const r = await fetchWithRetry(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(site.ga4_measurement_id)}&api_secret=${encodeURIComponent(apiSecret)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    'GA4 MP'
  )
  if (!r.ok) console.error('[GA4 MP]', eventName, 'HTTP', r.status)
  return { ok: r.ok, http_status: r.status, error_message: r.ok ? null : `HTTP ${r.status}` }
}

// ─── TikTok Events API event name mapping ────────────────────────────────────
// TikTok's standard web events differ from Meta's — same conversion, different
// vocabulary (Purchase → CompletePayment, Lead → SubmitForm). A non-standard
// name is accepted by the API but cannot be optimised against, so this map is
// load-bearing for the customer's campaigns.
// Reference: https://business-api.tiktok.com/portal/docs (Events API — standard events)
const TIKTOK_EVENT_MAP = {
  purchase:          'CompletePayment',
  sale:              'CompletePayment',
  order:             'CompletePayment',
  buy:               'CompletePayment',
  donate:            'CompletePayment',
  add_to_cart:       'AddToCart',
  addtocart:         'AddToCart',
  add_cart:          'AddToCart',
  checkout:          'InitiateCheckout',
  initiate_checkout: 'InitiateCheckout',
  begin_checkout:    'InitiateCheckout',
  lead:              'SubmitForm',
  form:              'SubmitForm',
  form_submit:       'SubmitForm',
  contact:           'Contact',
  signup:            'CompleteRegistration',
  sign_up:           'CompleteRegistration',
  register:          'CompleteRegistration',
  registration:      'CompleteRegistration',
  trial:             'CompleteRegistration',
  trial_start:       'CompleteRegistration',
  subscribe:         'Subscribe',
  subscription:      'Subscribe',
  view_content:      'ViewContent',
  page_view:         'ViewContent',
  search:            'Search',
  wishlist:          'AddToWishlist',
}

// ─── TikTok Events API ───────────────────────────────────────────────────────
// Auth is the `Access-Token` header (a real header — not Microsoft's mistake of
// decrypting a token only to gate on its presence and then never sending it).
// `event_source_id` is the TikTok PIXEL CODE, not the advertiser id — see the
// column-name note in supabase/migrations/20260729000000_capi_ga4_tiktok_columns.sql.
export async function sendTikTokConversion(site, evt) {
  const token = safeDecrypt(site.tiktok_capi_token)
  if (!site.tiktok_pixel_code || !token) return null  // no/undecryptable token → no-op (fail-safe)

  // TikTok requires email/phone SHA-256 hashed; ttclid / ip / user_agent go raw.
  const user = {}
  if (evt.email)      user.email      = sha256(evt.email)
  if (evt.ttclid)     user.ttclid     = evt.ttclid
  if (evt.ip_address) user.ip         = evt.ip_address
  if (evt.user_agent) user.user_agent = evt.user_agent

  const eventName = TIKTOK_EVENT_MAP[normalizeKey(evt.conversion_type)] || 'CompletePayment'

  const body = {
    event_source:    'web',
    event_source_id: site.tiktok_pixel_code,
    data: [{
      event:      eventName,
      event_time: Math.floor(new Date(evt.timestamp ?? Date.now()).getTime() / 1000),
      ...(evt.external_event_id ? { event_id: evt.external_event_id } : {}),  // dedup vs browser pixel
      ...(evt.page_url ? { page: { url: evt.page_url } } : {}),
      user,
      properties: {
        value:    Number(evt.conversion_value) || 0,
        ...capiCurrency(evt, 'currency'),
        ...(evt.order_id ? { order_id: evt.order_id } : {}),
      }
    }]
  }

  const r = await fetchWithRetry('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    method: 'POST',
    headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, 'TikTok Events API')

  // TikTok answers HTTP 200 with the real verdict in the BODY: code 0 = accepted,
  // non-zero = rejected. Trusting r.ok alone would log a REJECTED event as
  // 'success' — the silent-success class this codebase treats as a defect.
  const result = await r.json().catch(() => ({}))
  const accepted = r.ok && Number(result?.code) === 0
  if (!accepted) console.error('[TikTok Events API]', eventName, 'HTTP', r.status, JSON.stringify(result).slice(0, 200))
  return {
    ok: accepted,
    http_status: r.status,
    error_message: accepted ? null : JSON.stringify({ code: result?.code ?? null, message: result?.message ?? null }).slice(0, 500)
  }
}

// ─── Google Ads connection pre-load ──────────────────────────────────────────
// Attaches the tenant's Google Ads OAuth connection to `site` so sendGoogleConversion
// can stay a pure (site, evt) sender that does no I/O of its own. Called by the
// conversion routes immediately before dispatchCapi.
//
// GUARD — why the click ID and not sites.google_ads_customer_id:
// the brief specified gating this extra read on `site.google_ads_customer_id` being set.
// That column is one of the DEAD ones this PR retires: it is populated on ZERO prod sites
// and the new OAuth flow never writes it, so that guard would be false forever and Google
// CAPI could never fire — it would defeat the change it is part of. The guard's intent was
// "don't add a query to every conversion on every site", and the click ID serves that
// intent strictly better: sendGoogleConversion already returns null without a Google click
// ID, so a conversion with no gclid/gbraid/wbraid can never produce an upload no matter
// what the connection says. Most conversions carry no Google click ID, so this skips more
// reads than the column guard would have, while still firing whenever an upload is
// actually possible.
//
// Never throws: a failed lookup leaves the connection null, which makes Google no-op.
// The conversion path is never blocked or failed by CAPI setup state.
export async function attachGoogleAdsConnection(supabase, siteKey, site, evt) {
  site.google_ads_connection = null
  if (!siteKey) return site
  if (!evt?.gclid && !evt?.gbraid && !evt?.wbraid) return site
  try {
    const { data } = await supabase
      .from('ad_platform_connections')
      .select('status, account_id, login_customer_id, conversion_action_id, encrypted_refresh_token')
      .eq('site_key', siteKey)          // tenant isolation in code (service-role client bypasses RLS)
      .eq('platform', 'google_ads')
      .maybeSingle()
    if (data?.status === 'connected') site.google_ads_connection = data
  } catch (_) { /* never block or fail a conversion because of CAPI config state */ }
  return site
}

// ─── CAPI fan-out + delivery log ─────────────────────────────────────────────
// Runs the configured senders for one conversion and writes ONE capi_deliveries
// row per real send attempt (success/failed). A sender that returns null (no
// token / undecryptable token / no click id) made no attempt and is NOT logged
// — keeps the table to genuine attempts. Never throws into the conversion path.
// `site` must include `id` (selected by the caller) + the CAPI columns, and — for
// Google only — `google_ads_connection`, the pre-loaded ad_platform_connections row
// (or null). Google's credential lives in that table rather than in sites columns, and
// senders stay pure (site, evt) with no I/O of their own, so the caller loads it. A
// caller that forgets simply makes Google no-op; it can never send with wrong creds.
export async function dispatchCapi(supabase, site, evt) {
  const eventRef = evt.external_event_id || evt.order_id || null

  // MONEY-TRUTH GATE — one place, all six senders. An event that MOVES money but carries no
  // usable currency has an unknowable amount, so it is not uploaded anywhere. Previously each
  // sender defaulted it to USD, which posted a made-up unit to six ad ledgers at once.
  //
  // Gated on value, not on currency alone, and that distinction is measured rather than assumed:
  // on prod (2026-07-31) all 106 revenue-bearing ingestion events carry a currency, and all 6
  // events missing one are exactly $0. So this gate suppresses NOTHING today — it is a guard that
  // fires the moment a revenue event first arrives without a unit. Gating on currency alone would
  // instead silently stop CAPI for those 6 zero-value lead conversions, where there is no amount
  // to denominate and nothing to get wrong.
  // NOT written to capi_deliveries, deliberately. This is a no-attempt skip, and the loop below
  // already treats those as "skipped (no attempt) — not logged". Logging six rows here would also
  // invent a `failed` delivery for every platform the site never configured, which reads in the UI
  // as five broken integrations. Named on stderr instead, so the drop is visible and greppable
  // rather than silent.
  if (Number(evt.conversion_value) !== 0 && !hasKnownCurrency(evt.currency)) {
    console.warn(`[capi] suppressed all senders for event ${eventRef || '(no ref)'} on site ${site.id}: revenue event has no usable currency code`)
    return
  }

  // ERASURE-SUPPRESSION GATE — the LAST point at which this is still recoverable.
  //
  // Every other suppression call site (PR 2) guards a Supabase write, where a miss is repairable:
  // the row is ours, and a later erasure or the PR 3 re-sweep can still delete it. This one is
  // different in kind. Once a conversion reaches Meta, Google, GA4, TikTok or LinkedIn it is in a
  // third party's ledger, under their retention, and NO sweep of ours can reach it. There is no
  // "clean up afterwards" for an egress — so the check has to happen before the send, not after.
  //
  // Placed here rather than in the six senders because dispatchCapi is the single choke point for
  // all of them (the money-truth gate above uses the same property), so one gate cannot be
  // bypassed by a sender added later. Checked ONCE per event, not per platform: six identical
  // lookups would only multiply the cost of the same answer.
  //
  // Keys mirror what the senders actually transmit — the subject id and the email they hash into
  // user_data (sendMetaCAPI :152, sendGoogleConversion :271, sendLinkedInConversion :336,
  // sendGA4Conversion :412, sendTikTokConversion :487). isErasureSuppressed treats them as an OR,
  // so either one being suppressed stops all six.
  //
  // FAIL CLOSED, inherited rather than reimplemented: isErasureSuppressed already returns true
  // when the lookup itself is degraded. For a Supabase write that means "skip a row we could
  // re-add later"; here it means "do not put an erased person's data somewhere we can never
  // retract it". Refusing to send on an unknown suppression state is the only safe direction, and
  // the cost of being wrong is one missing ad-platform conversion — recoverable by a re-send,
  // unlike the opposite error.
  const suppressed = await isErasureSuppressed(supabase, {
    siteId: site.id,
    subjectId: evt.distinct_id || evt.anonymous_id || null,
    email: evt.email || null
  })
  if (suppressed) {
    logSuppressionBlocked('capi_dispatch', { siteId: site.id, subjectId: evt.distinct_id || evt.anonymous_id || null })
    // Not written to capi_deliveries, matching the money-truth gate directly above: this is a
    // no-attempt skip for all six platforms, and six `failed` rows would read in the UI as six
    // broken integrations rather than one deliberate suppression.
    return
  }

  const senders = [
    ['meta', sendMetaCAPI],
    ['google', sendGoogleConversion],
    ['microsoft', sendMicrosoftConversion],
    ['linkedin', sendLinkedInConversion],
    ['ga4', sendGA4Conversion],
    ['tiktok', sendTikTokConversion]
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
