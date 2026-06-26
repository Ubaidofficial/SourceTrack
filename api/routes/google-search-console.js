import express from 'express'
import crypto from 'crypto'
import { getSupabase } from '../lib/supabase.js'
import { encryptSecret } from '../lib/utils.js'
import {
  getAuthUrl,
  verifyStateToken,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchGscProperties,
  fetchGscPerformance
} from '../lib/google-search-console.js'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'
import { normalizePath } from '../lib/url-normalization.js'
import { requireFeature } from '../lib/plan-features.js'

const router = express.Router()

// In-memory sync locks to prevent concurrent manual GSC syncs
const activeSyncs = new Set()

// Helper: Hashed site/user identifiers for privacy-hardened logging
function getLogHash(value) {
  const salt = process.env.ST_LOG_HASH_SECRET || process.env.TRACKER_SALT || process.env.ENCRYPTION_KEY
  if (!salt) {
    if (process.env.NODE_ENV === 'production') {
      return crypto.createHmac('sha256', 'missing-log-secret').update(value || '').digest('hex').slice(0, 8)
    } else {
      return crypto.createHash('sha256').update(value || '').digest('hex').slice(0, 8)
    }
  }
  return crypto.createHmac('sha256', salt).update(value || '').digest('hex').slice(0, 8)
}

// 1. PUBLIC ROUTE: OAuth Callback from Google
// Note: This route is public because it is the target of Google redirect.
// Authentication is handled securely via the signed state token.
router.get('/callback', async (req, res) => {
  const { code, state, error: authError } = req.query
  const dashboardBaseUrl = process.env.DASHBOARD_URL

  if (!dashboardBaseUrl) {
    return res.status(500).send('DASHBOARD_URL environment variable is not configured')
  }

  // Ensure redirect target appends fixed internal path. Must be the AUTHENTICATED
  // app route (/app/integrations) where the property-selection picker lives — not
  // the public marketing /integrations page, which has no picker and ignores the
  // gsc_connected/gsc_error params.
  const redirectTarget = `${dashboardBaseUrl.replace(/\/$/, '')}/app/integrations`

  if (authError) {
    console.error('[GSC OAuth Callback] Google authentication error:', authError)
    return res.redirect(`${redirectTarget}?gsc_error=connection_failed`)
  }

  // Reject missing code or state parameters immediately
  if (!code || typeof code !== 'string') {
    console.error('[GSC OAuth Callback] Rejecting request: missing authentication code')
    return res.redirect(`${redirectTarget}?gsc_error=missing_code`)
  }

  if (!state || typeof state !== 'string') {
    console.error('[GSC OAuth Callback] Rejecting request: missing OAuth state parameter')
    return res.redirect(`${redirectTarget}?gsc_error=invalid_state`)
  }

  try {
    // Verify HMAC signature, userId, and expiry of the state parameter
    const payload = verifyStateToken(state)
    const { siteKey, userId } = payload

    const supabase = getSupabase()

    // Fetch site information to verify user access
    const { data: site } = await supabase
      .from('sites')
      .select('site_key, owner_id, company_id')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (!site) {
      console.error(`[GSC OAuth Callback] Site not found for key hash: ${getLogHash(siteKey)}`)
      return res.redirect(`${redirectTarget}?gsc_error=invalid_site`)
    }

    // Verify user membership or site ownership
    let isAuthorized = site.owner_id === userId
    if (!isAuthorized && site.company_id) {
      const { data: member } = await supabase
        .from('company_members')
        .select('id')
        .eq('company_id', site.company_id)
        .eq('user_id', userId)
        .maybeSingle()
      if (member) isAuthorized = true
    }

    if (!isAuthorized) {
      console.error(`[GSC OAuth Callback] User ${getLogHash(userId)} is not authorized for site key hash ${getLogHash(siteKey)}`)
      return res.redirect(`${redirectTarget}?gsc_error=access_denied`)
    }

    // Exchange the auth code for access & refresh tokens
    let tokens
    try {
      tokens = await exchangeCodeForTokens(code)
    } catch (exchangeErr) {
      console.error('[GSC OAuth Callback] Token exchange failed:', exchangeErr.message)
      return res.redirect(`${redirectTarget}?gsc_error=token_exchange_failed`)
    }

    let encryptedRefreshToken = null
    if (tokens.refresh_token) {
      encryptedRefreshToken = encryptSecret(tokens.refresh_token)
    } else {
      // If refresh token is missing, check if we already have one
      const { data: existing } = await supabase
        .from('gsc_connections')
        .select('encrypted_refresh_token')
        .eq('site_key', siteKey)
        .maybeSingle()

      if (existing?.encrypted_refresh_token) {
        encryptedRefreshToken = existing.encrypted_refresh_token
      } else {
        // Save the reconnect state in the connections table for missing refresh token
        await supabase
          .from('gsc_connections')
          .upsert({
            site_key: siteKey,
            encrypted_refresh_token: null,
            status: 'needs_reconnect',
            last_error_code: 'missing_refresh_token',
            last_error_message: 'Missing offline access consent refresh token',
            updated_at: new Date().toISOString()
          }, { onConflict: 'site_key' })

        return res.redirect(`${redirectTarget}?gsc_error=missing_refresh_token`)
      }
    }

    // Save connection to database using service role (admin client)
    const { error: upsertError } = await supabase
      .from('gsc_connections')
      .upsert({
        site_key: siteKey,
        encrypted_refresh_token: encryptedRefreshToken,
        status: 'connected',
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'site_key' })

    if (upsertError) {
      throw upsertError
    }

    return res.redirect(`${redirectTarget}?gsc_connected=true`)
  } catch (err) {
    console.error('[GSC OAuth Callback] Exception handled:', err.message)
    // Map exception to safe browser-facing error codes
    let errCode = 'connection_failed'
    if (err.message.includes('expired')) {
      errCode = 'expired_state'
    } else if (err.message.includes('signature') || err.message.includes('state')) {
      errCode = 'invalid_state'
    }
    return res.redirect(`${redirectTarget}?gsc_error=${errCode}`)
  }
})

// --- MIDDLEWARE PROTECTION GATE ---
// All routes below this require standard dashboard user auth, site key validation, and membership checks.
router.use(requireUserAuth, validateSiteKey, requireSiteMembership)

const gateGscFeature = (req, res, next) => {
  const block = requireFeature(req.site?.plan, 'gsc_seo_revenue', 'Google Search Console')
  if (block) return res.status(402).json(block)
  next()
}

// 2. GET /auth-url: Get Google Consent Screen Redirect URL
router.get('/auth-url', gateGscFeature, (req, res) => {
  try {
    const siteKey = req.site.site_key
    const userId = req.user.id
    const url = getAuthUrl(siteKey, userId)
    res.json({ success: true, url })
  } catch (err) {
    console.error('[GSC /auth-url] Failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to generate consent URL' })
  }
})

// 3. GET /status: Get Current Connection Status
router.get('/status', async (req, res) => {
  try {
    const siteKey = req.site.site_key
    const supabase = getSupabase()

    const { data: conn, error } = await supabase
      .from('gsc_connections')
      .select('property_url, status, last_error_code, last_error_message, last_synced_at, created_at')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (error) throw error

    if (!conn) {
      return res.json({ success: true, connected: false })
    }

    res.json({
      success: true,
      connected: true,
      status: conn.status,
      property_url: conn.property_url || null,
      property_selected: !!conn.property_url,
      last_synced_at: conn.last_synced_at || null,
      last_error_message: conn.last_error_message || null
    })
  } catch (err) {
    console.error('[GSC /status] Failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to retrieve connection status' })
  }
})

// 4. GET /properties: Get verified properties for connection
router.get('/properties', gateGscFeature, async (req, res) => {
  try {
    const siteKey = req.site.site_key
    const supabase = getSupabase()

    const { data: conn } = await supabase
      .from('gsc_connections')
      .select('encrypted_refresh_token')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (!conn?.encrypted_refresh_token) {
      return res.status(400).json({ success: false, error: 'Google Search Console connection not configured.' })
    }

    const { access_token } = await refreshAccessToken(conn.encrypted_refresh_token)
    const properties = await fetchGscProperties(access_token)

    res.json({ success: true, properties })
  } catch (err) {
    console.error('[GSC /properties] Failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to retrieve properties' })
  }
})

// 5. POST /select-property: Save selected GSC property URL
router.post('/select-property', gateGscFeature, async (req, res) => {
  const { property_url } = req.body
  const siteKey = req.site.site_key

  if (!property_url || typeof property_url !== 'string') {
    return res.status(400).json({ success: false, error: 'property_url parameter is required' })
  }

  try {
    const supabase = getSupabase()

    // 1. Fetch connection
    const { data: conn } = await supabase
      .from('gsc_connections')
      .select('encrypted_refresh_token')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (!conn?.encrypted_refresh_token) {
      return res.status(400).json({ success: false, error: 'Google Search Console connection not found.' })
    }

    // 2. Fetch properties list to verify ownership
    const { access_token } = await refreshAccessToken(conn.encrypted_refresh_token)
    const properties = await fetchGscProperties(access_token)

    const isVerified = properties.some(p => p.siteUrl === property_url)
    if (!isVerified) {
      return res.status(400).json({ success: false, error: 'The selected property is not verified in your Google Search Console account.' })
    }

    // 3. Update property URL and ensure row was updated
    const { data: updated, error } = await supabase
      .from('gsc_connections')
      .update({
        property_url,
        status: 'connected',
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('site_key', siteKey)
      .select('site_key')
      .maybeSingle()

    if (error || !updated) {
      return res.status(404).json({ success: false, error: 'Google Search Console connection not found.' })
    }

    res.json({ success: true, message: 'GSC property selected successfully.' })
  } catch (err) {
    console.error('[GSC /select-property] Failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to select GSC property' })
  }
})

// 6. POST /disconnect: Remove GSC integration credentials and cached data
router.post('/disconnect', async (req, res) => {
  const siteKey = req.site.site_key

  try {
    const supabase = getSupabase()

    // Purge credentials
    const { error: deleteConnError } = await supabase
      .from('gsc_connections')
      .delete()
      .eq('site_key', siteKey)

    if (deleteConnError) throw deleteConnError

    // Purge cached performance records
    await supabase
      .from('gsc_performance_daily')
      .delete()
      .eq('site_key', siteKey)

    // Purge cached sync runs logs
    await supabase
      .from('gsc_sync_runs')
      .delete()
      .eq('site_key', siteKey)

    res.json({ success: true, message: 'Google Search Console disconnected and cached data purged.' })
  } catch (err) {
    console.error('[GSC /disconnect] Failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to disconnect integration' })
  }
})

// 7. POST /sync: Trigger background synchronization (bounded daily performance rows)
router.post('/sync', gateGscFeature, async (req, res) => {
  const siteKey = req.site.site_key
  const requestedDays = Number.parseInt(req.body.days, 10)
  const days = Math.max(1, Math.min(Number.isFinite(requestedDays) ? requestedDays : 30, 90))

  // 1. Concurrency Lock: check in-memory set
  if (activeSyncs.has(siteKey)) {
    return res.status(409).json({ success: false, error: 'A search performance synchronization is already running.' })
  }

  try {
    const supabase = getSupabase()

    // 2. Concurrency Lock: check DB gsc_sync_runs log
    const { data: recentPending } = await supabase
      .from('gsc_sync_runs')
      .select('id')
      .eq('site_key', siteKey)
      .eq('status', 'pending')
      .gt('sync_start', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .limit(1)

    if (recentPending && recentPending.length > 0) {
      return res.status(409).json({ success: false, error: 'A sync run was recently started. Please try again in 15 minutes.' })
    }

    const { data: conn } = await supabase
      .from('gsc_connections')
      .select('property_url, encrypted_refresh_token')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (!conn?.encrypted_refresh_token || !conn?.property_url) {
      return res.status(400).json({ success: false, error: 'GSC connection properties are not configured.' })
    }

    // Set lock
    activeSyncs.add(siteKey)

    // Run the sync process asynchronously in the background
    runBackgroundSync(siteKey, conn.property_url, conn.encrypted_refresh_token, days)
      .then(() => {}, (syncErr) => console.error(`[Background Sync Fail Site: ${getLogHash(siteKey)}] Error:`, syncErr.message))

    res.json({ success: true, message: 'Sync started in the background.' })
  } catch (err) {
    console.error('[GSC /sync] Launch failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to start synchronization' })
  }
})

// Background sync worker
async function runBackgroundSync(siteKey, propertyUrl, encryptedRefreshToken, days) {
  const supabase = getSupabase()

  // 1. Create a pending sync run record
  const { data: syncRun, error: insertError } = await supabase
    .from('gsc_sync_runs')
    .insert({
      site_key: siteKey,
      property_url: propertyUrl,
      status: 'pending',
      sync_type: 'manual',
      records_synced: 0
    })
    .select('id')
    .single()

  if (insertError) {
    activeSyncs.delete(siteKey)
    throw insertError
  }

  const syncRunId = syncRun.id
  let recordsSyncedCount = 0

  try {
    // Get GSC access token
    const { access_token } = await refreshAccessToken(encryptedRefreshToken)

    // Setup bounded range: last N days, skipping "today" (unfinalized GSC data)
    // To ensure complete finalized stats, Google has a 2-3 day lag, so we fetch up to yesterday/2 days ago
    const toDate = new Date()
    toDate.setDate(toDate.getDate() - 1) // up to yesterday
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)

    const fromStr = fromDate.toISOString().split('T')[0]
    const toStr = toDate.toISOString().split('T')[0]

    let startRow = 0
    const rowLimit = 5000
    const maxSyncRows = 25000
    let hasMore = true
    const aggregatedRows = []

    while (hasMore && startRow < maxSyncRows) {
      const rows = await fetchGscPerformance(propertyUrl, fromStr, toStr, access_token, startRow, rowLimit)
      if (rows && rows.length > 0) {
        aggregatedRows.push(...rows)
        startRow += rowLimit
        if (rows.length < rowLimit) {
          hasMore = false
        }
      } else {
        hasMore = false
      }
    }

    if (aggregatedRows.length > 0) {
      const recordsToUpsert = aggregatedRows.map(row => {
        const date = row.keys[0]
        const query = row.keys[1]
        const pageUrl = row.keys[2]
        const pagePath = normalizePath(pageUrl)

        return {
          site_key: siteKey,
          property_url: propertyUrl,
          date,
          query,
          page_url: pageUrl,
          page_path: pagePath,
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0
        }
      })

      // Upsert daily performance rows in batches of 1,000 using Supabase admin client
      const batchSize = 1000
      for (let i = 0; i < recordsToUpsert.length; i += batchSize) {
        const batch = recordsToUpsert.slice(i, i + batchSize)
        const { error: upsertError } = await supabase
          .from('gsc_performance_daily')
          .upsert(batch, { onConflict: 'site_key,property_url,date,query,page_url' })

        if (upsertError) throw upsertError
      }

      recordsSyncedCount = recordsToUpsert.length
    }

    // Mark sync log as success
    await supabase
      .from('gsc_sync_runs')
      .update({
        status: 'success',
        records_synced: recordsSyncedCount,
        sync_end: new Date().toISOString()
      })
      .eq('id', syncRunId)

    // Update last synced at timestamp in connection
    await supabase
      .from('gsc_connections')
      .update({
        status: 'connected',
        last_synced_at: new Date().toISOString(),
        last_error_code: null,
        last_error_message: null
      })
      .eq('site_key', siteKey)

  } catch (err) {
    console.error(`[Background Sync Fail Site: ${getLogHash(siteKey)}]`, err.message)

    // Log failure on sync runs
    await supabase
      .from('gsc_sync_runs')
      .update({
        status: 'failed',
        error_message: err.message,
        sync_end: new Date().toISOString()
      })
      .eq('id', syncRunId)

    // Log error on connections table
    await supabase
      .from('gsc_connections')
      .update({
        status: 'error',
        last_error_code: 'sync_failed',
        last_error_message: err.message
      })
      .eq('site_key', siteKey)
  } finally {
    // Release lock
    activeSyncs.delete(siteKey)
  }
}

export { router as googleSearchConsoleRouter }
