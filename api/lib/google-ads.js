import crypto from 'crypto'
import { decryptSecret } from './utils.js'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

// Generates a cryptographically secure signed state token for Google Ads
export function generateStateToken(siteKey, userId) {
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is missing')
  }

  const nonce = crypto.randomBytes(16).toString('hex')
  const issuedAt = Date.now()
  const expiresAt = issuedAt + 10 * 60 * 1000 // 10 minutes expiry

  const payload = JSON.stringify({ siteKey, userId, platform: 'google_ads', nonce, issuedAt, expiresAt })
  const hmac = crypto.createHmac('sha256', encryptionKey)
    .update(payload)
    .digest('base64url')

  return `${Buffer.from(payload).toString('base64url')}.${hmac}`
}

// Verifies the state token signature, shape, platform, and expiration
export function verifyStateToken(state) {
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is missing')
  }

  if (!state || typeof state !== 'string') {
    throw new Error('Missing OAuth state token')
  }

  const parts = state.split('.')
  if (parts.length !== 2) {
    throw new Error('Invalid OAuth state format')
  }

  const [payloadB64, signature] = parts
  const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8')

  // Verify HMAC signature
  const expectedHmac = crypto.createHmac('sha256', encryptionKey)
    .update(payloadStr)
    .digest('base64url')

  const a = Buffer.from(signature)
  const b = Buffer.from(expectedHmac)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('OAuth state signature verification failed')
  }

  let payload
  try {
    payload = JSON.parse(payloadStr)
  } catch (_e) {
    throw new Error('OAuth state JSON parsing failed')
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('OAuth state payload is not an object')
  }

  if (
    !payload.siteKey || typeof payload.siteKey !== 'string' ||
    !payload.userId || typeof payload.userId !== 'string' ||
    payload.platform !== 'google_ads' ||
    !payload.nonce || typeof payload.nonce !== 'string' ||
    typeof payload.issuedAt !== 'number' ||
    typeof payload.expiresAt !== 'number'
  ) {
    throw new Error('OAuth state payload has invalid shape')
  }

  if (Date.now() > payload.expiresAt) {
    throw new Error('OAuth state token has expired')
  }

  return payload
}

// Generates the Google OAuth Redirect screen URL (returns not_configured if env vars missing)
export function getAuthUrl(siteKey, userId) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return { not_configured: true }
  }

  const state = generateStateToken(siteKey, userId)

  if (process.env.ST_MOCK_AD_PLATFORMS === 'true') {
    return { url: `${redirectUri}?code=mock_google_code_123&state=${state}` }
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent',
    state
  })

  return { url: `${GOOGLE_AUTH_URL}?${params.toString()}` }
}

// Exchanges authorization code for tokens
export async function exchangeCodeForTokens(code) {
  if (process.env.ST_MOCK_AD_PLATFORMS === 'true') {
    return {
      refresh_token: 'mock_google_refresh_token_123',
      access_token: 'mock_google_access_token_123',
      expires_in: 3600
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_ADS_REDIRECT_URI not configured')
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })

  if (!response.ok) {
    throw new Error('google_token_exchange_failed')
  }

  const data = await response.json()
  return {
    refresh_token: data.refresh_token || null,
    access_token: data.access_token,
    expires_in: data.expires_in
  }
}

// Refreshes the short-lived access token using decrypted refresh token
export async function refreshAccessToken(encryptedRefreshToken) {
  if (process.env.ST_MOCK_AD_PLATFORMS === 'true') {
    return {
      access_token: 'mock_google_access_token_refreshed_123',
      expires_in: 3600
    }
  }

  const refreshToken = decryptSecret(encryptedRefreshToken)
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured')
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    throw new Error('google_access_token_refresh_failed')
  }

  const data = await response.json()
  return {
    access_token: data.access_token,
    expires_in: data.expires_in
  }
}

// Fetches daily campaign performance data via GAQL Search
export async function fetchGoogleAdsPerformance(customerId, startDate, endDate, accessToken, loginCustomerId) {
  const cleanCustomerId = String(customerId || '').replace(/-/g, '').trim()
  const cleanLoginCustomerId = loginCustomerId ? String(loginCustomerId).replace(/-/g, '').trim() : null

  if (process.env.ST_MOCK_AD_PLATFORMS === 'true') {
    if (cleanCustomerId === '0000000000') {
      throw new Error('invalid_customer_id')
    }
    if (cleanLoginCustomerId === '9999999999') {
      throw new Error('login_customer_id_required_or_invalid')
    }
    // Return mock campaign rows
    return [
      {
        campaign: { id: '2001', name: 'Google Search Promo' },
        metrics: { costMicros: '25000000', clicks: '15', impressions: '250' },
        customer: { currencyCode: 'USD' },
        segments: { date: startDate }
      },
      {
        campaign: { id: '2002', name: 'Google Performance Max' },
        metrics: { costMicros: '75000000', clicks: '40', impressions: '800' },
        customer: { currencyCode: 'USD' },
        segments: { date: startDate }
      }
    ]
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) {
    throw new Error('invalid_developer_token')
  }

  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || 'v24'
  const url = `https://googleads.googleapis.com/${apiVersion}/customers/${cleanCustomerId}/googleAds:search`

  const headers = {
    'developer-token': developerToken,
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }

  if (cleanLoginCustomerId) {
    headers['login-customer-id'] = cleanLoginCustomerId
  }

  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      customer.currency_code
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query })
  })

  if (!response.ok) {
    const errorText = await response.text()
    if (response.status === 400 && errorText.includes('INVALID_CUSTOMER_ID')) {
      throw new Error('invalid_customer_id')
    }
    if (response.status === 400 && errorText.includes('DEVELOPER_TOKEN')) {
      throw new Error('invalid_developer_token')
    }
    if (response.status === 400 && errorText.includes('LOGIN_CUSTOMER_ID')) {
      throw new Error('login_customer_id_required_or_invalid')
    }
    if (response.status === 401 || errorText.includes('UNAUTHENTICATED') || errorText.includes('INVALID_CREDENTIALS')) {
      throw new Error('revoked_token')
    }
    if (response.status === 429 || errorText.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('quota_or_rate_limited')
    }
    throw new Error('google_ads_api_unavailable')
  }

  const data = await response.json()
  return data.results || []
}
