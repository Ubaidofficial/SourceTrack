import crypto from 'crypto'
import { decryptSecret } from './utils.js'

// Google OAuth configuration endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3'

// Generates a cryptographically secure signed state token
export function generateStateToken(siteKey, userId) {
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is missing')
  }

  const nonce = crypto.randomBytes(16).toString('hex')
  const issuedAt = Date.now()
  const expiresAt = issuedAt + 10 * 60 * 1000 // 10 minutes expiry

  const payload = JSON.stringify({ siteKey, userId, nonce, issuedAt, expiresAt })
  const hmac = crypto.createHmac('sha256', encryptionKey)
    .update(payload)
    .digest('base64url')

  return `${Buffer.from(payload).toString('base64url')}.${hmac}`
}

// Verifies the state token signature, shape, and expiration
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

  // Timing safe equal check
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

  // Validate state payload shape and data types
  if (
    !payload.siteKey || typeof payload.siteKey !== 'string' || payload.siteKey.trim() === '' ||
    !payload.userId || typeof payload.userId !== 'string' || payload.userId.trim() === '' ||
    !payload.nonce || typeof payload.nonce !== 'string' || payload.nonce.trim() === '' ||
    typeof payload.issuedAt !== 'number' || Number.isNaN(payload.issuedAt) ||
    typeof payload.expiresAt !== 'number' || Number.isNaN(payload.expiresAt)
  ) {
    throw new Error('OAuth state payload has invalid shape')
  }

  if (payload.expiresAt <= payload.issuedAt) {
    throw new Error('OAuth state payload timeline is inverted')
  }

  // Max 10 minutes plus 5 seconds clock tolerance
  if (payload.expiresAt - payload.issuedAt > 10 * 60 * 1000 + 5000) {
    throw new Error('OAuth state payload has invalid lifetime')
  }

  if (Date.now() > payload.expiresAt) {
    throw new Error('OAuth state token has expired')
  }

  return payload

}

// Generates the Google OAuth Redirect Consent screen URL
export function getAuthUrl(siteKey, userId) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_GSC_REDIRECT_URI

  if (!clientId || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_GSC_REDIRECT_URI is not configured')
  }

  const state = generateStateToken(siteKey, userId)

  if (process.env.ST_MOCK_GSC === 'true') {
    // In mock mode, direct the flow straight to callback route locally
    return `${redirectUri}?code=mock_code_123&state=${state}`
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

// Exchanges authorization code for tokens
export async function exchangeCodeForTokens(code) {
  if (process.env.ST_MOCK_GSC === 'true') {
    return {
      refresh_token: 'mock_refresh_token_123',
      access_token: 'mock_access_token_123',
      expires_in: 3600
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_GSC_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GSC credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_GSC_REDIRECT_URI) not configured')
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
    if (process.env.DEBUG === 'true') {
      const errorText = await response.text()
      console.error(`[GSC Client Debug] Token exchange failed status: ${response.status}. Body:`, errorText.slice(0, 500))
    }
    throw new Error('google_token_exchange_failed')
  }

  const data = await response.json()
  return {
    refresh_token: data.refresh_token || null,
    access_token: data.access_token,
    expires_in: data.expires_in
  }
}

// Refreshes the short-lived access token using the decrypted refresh token
export async function refreshAccessToken(encryptedRefreshToken) {
  if (process.env.ST_MOCK_GSC === 'true') {
    return {
      access_token: 'mock_access_token_refreshed_123',
      expires_in: 3600
    }
  }

  const refreshToken = decryptSecret(encryptedRefreshToken)
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials are not configured')
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
    if (process.env.DEBUG === 'true') {
      const errorText = await response.text()
      console.error(`[GSC Client Debug] Refresh token failed status: ${response.status}. Body:`, errorText.slice(0, 500))
    }
    throw new Error('google_access_token_refresh_failed')
  }

  const data = await response.json()
  return {
    access_token: data.access_token,
    expires_in: data.expires_in
  }
}

// Lists verified properties from Google Search Console
export async function fetchGscProperties(accessToken) {
  if (process.env.ST_MOCK_GSC === 'true') {
    return [
      { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' },
      { siteUrl: 'https://example.com/', permissionLevel: 'siteOwner' },
      { siteUrl: 'https://example.com/blog/', permissionLevel: 'siteMember' }
    ]
  }

  const response = await fetch(`${GSC_API_BASE}/sites`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    if (process.env.DEBUG === 'true') {
      const errorText = await response.text()
      console.error(`[GSC Client Debug] Fetch sites failed status: ${response.status}. Body:`, errorText.slice(0, 500))
    }
    throw new Error('gsc_properties_fetch_failed')
  }

  const data = await response.json()
  return data.siteEntry || []
}

// Fetches performance data grouped by query, date, and page
export async function fetchGscPerformance(propertyUrl, startDate, endDate, accessToken, startRow = 0, rowLimit = 5000) {
  if (process.env.ST_MOCK_GSC === 'true') {
    // Return realistic mock rows matching landing page paths
    const mockQueries = ['sourcetrack analytics', 'conversion attribution tool', 'first touch attribution model', 'hogql query help', 'shopify attribution']
    const mockPages = ['https://example.com/', 'https://example.com/pricing', 'https://example.com/blog/attribution-guide', 'https://example.com/features']

    // Seed random performance rows
    const rows = []
    const start = new Date(startDate)
    const end = new Date(endDate)

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]
      for (let i = 0; i < mockPages.length; i++) {
        const page = mockPages[i]
        for (let j = 0; j < mockQueries.length; j++) {
          const query = mockQueries[j]
          // Make it deterministic based on page/query string hash
          const hash = (page.length + query.length + d.getDate()) % 10
          if (hash > 4) { // 50% density
            const clicks = hash * 5 + 3
            const impressions = clicks * 12 + hash * 2 + 10
            rows.push({
              keys: [dateStr, query, page],
              clicks,
              impressions,
              ctr: clicks / impressions,
              position: 1.2 + hash * 0.8
            })
          }
        }
      }
    }

    // Slice rows for pagination simulation
    return rows.slice(startRow, startRow + rowLimit)
  }

  const url = `${GSC_API_BASE}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['date', 'query', 'page'],
      rowLimit,
      startRow
    })
  })

  if (!response.ok) {
    if (process.env.DEBUG === 'true') {
      const errorText = await response.text()
      console.error(`[GSC Client Debug] Query performance failed status: ${response.status}. Body:`, errorText.slice(0, 500))
    }
    throw new Error('gsc_performance_query_failed')
  }

  const data = await response.json()
  return data.rows || []
}
