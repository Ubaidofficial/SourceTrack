import express from 'express'
import crypto from 'crypto'
import { getSupabase } from '../lib/supabase.js'
import { encryptSecret, decryptSecret } from '../lib/utils.js'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'
import {
  getAuthUrl,
  verifyStateToken,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchGoogleAdsPerformance
} from '../lib/google-ads.js'
import {
  normalizeMetaAccountId,
  validateMetaCredentials,
  fetchMetaPerformance
} from '../lib/meta-ads.js'
import {
  normalizeAdCostRow,
  aggregateAdCostRows,
  buildCampaignCostUpsertRows,
  upsertCampaignCostRows
} from '../lib/ad-cost-imports.js'

const router = express.Router()

// In-memory locks to prevent concurrent syncs per site+platform
const activeSyncLocks = new Set()

// Helper: Hashed site identifiers for privacy-safe logs
function getLogHash(value) {
  const salt = process.env.ST_LOG_HASH_SECRET || process.env.TRACKER_SALT || process.env.ENCRYPTION_KEY
  if (!salt) {
    return crypto.createHash('sha256').update(value || '').digest('hex').slice(0, 8)
  }
  return crypto.createHmac('sha256', salt).update(value || '').digest('hex').slice(0, 8)
}

// 1. PUBLIC CALLBACK: Redirect target from Google Ads OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code, state, error: authError } = req.query
  const dashboardBaseUrl = process.env.DASHBOARD_URL || process.env.FRONTEND_URL || 'http://localhost:5173'
  const redirectTarget = `${dashboardBaseUrl.replace(/\/$/, '')}/integrations`

  if (authError) {
    console.error('[Google Ads OAuth] Callback auth error:', authError)
    return res.redirect(`${redirectTarget}?google_ads_error=connection_failed`)
  }

  if (!code || typeof code !== 'string') {
    return res.redirect(`${redirectTarget}?google_ads_error=missing_code`)
  }

  if (!state || typeof state !== 'string') {
    return res.redirect(`${redirectTarget}?google_ads_error=invalid_state`)
  }

  try {
    // Verify signature, userId, and expiry
    const payload = verifyStateToken(state)
    const { siteKey, userId } = payload

    const supabase = getSupabase()

    // Verify site key exists and client membership
    const { data: site } = await supabase
      .from('sites')
      .select('site_key, owner_id, company_id')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (!site) {
      console.error(`[Google Ads Callback] Site not found for key hash: ${getLogHash(siteKey)}`)
      return res.redirect(`${redirectTarget}?google_ads_error=invalid_site`)
    }

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
      console.error(`[Google Ads Callback] User unauthorized`)
      return res.redirect(`${redirectTarget}?google_ads_error=access_denied`)
    }

    // Exchange auth code for refresh token
    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      // Check if we already have a refresh token saved
      const { data: existing } = await supabase
        .from('ad_platform_connections')
        .select('encrypted_refresh_token')
        .eq('site_key', siteKey)
        .eq('platform', 'google_ads')
        .maybeSingle()

      if (!existing?.encrypted_refresh_token) {
        return res.redirect(`${redirectTarget}?google_ads_error=missing_refresh_token`)
      }
      tokens.refresh_token = decryptSecret(existing.encrypted_refresh_token)
    }

    // Encrypt and store connection credentials under status 'needs_account'
    const encryptedRefreshToken = encryptSecret(tokens.refresh_token)
    const { error: upsertError } = await supabase
      .from('ad_platform_connections')
      .upsert({
        site_key: siteKey,
        platform: 'google_ads',
        encrypted_refresh_token: encryptedRefreshToken,
        status: 'needs_account',
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'site_key,platform' })

    if (upsertError) throw upsertError

    return res.redirect(`${redirectTarget}?google_ads_connected=true`)

  } catch (err) {
    console.error('[Google Ads Callback] Exception handled:', err.message)
    let errCode = 'connection_failed'
    if (err.message.includes('expired')) {
      errCode = 'expired_state'
    } else if (err.message.includes('signature') || err.message.includes('state')) {
      errCode = 'invalid_state'
    }
    return res.redirect(`${redirectTarget}?google_ads_error=${errCode}`)
  }
})

// --- GATED PRIVATE ROUTES ---
router.use(requireUserAuth, validateSiteKey, requireSiteMembership)

// 2. GET `/status`: Returns status overview for all ad platform sync accounts
router.get('/status', async (req, res) => {
  try {
    const siteKey = req.site.site_key
    const supabase = getSupabase()

    const { data: connections, error } = await supabase
      .from('ad_platform_connections')
      .select('platform, account_id, account_name, status, last_error_code, last_error_message, last_synced_at')
      .eq('site_key', siteKey)

    if (error) throw error

    const statusMap = {
      google_ads: { connected: false, status: 'not_configured', env_configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_ADS_REDIRECT_URI) },
      meta_ads: { connected: false, status: 'not_configured' }
    }

    for (const c of connections || []) {
      statusMap[c.platform] = {
        connected: true,
        status: c.status,
        account_id: c.account_id || null,
        account_name: c.account_name || null,
        last_synced_at: c.last_synced_at || null,
        last_error_message: c.last_error_message || null,
        env_configured: c.platform === 'google_ads' ? statusMap.google_ads.env_configured : undefined
      }
    }

    res.json({ success: true, data: statusMap })
  } catch (err) {
    console.error('[ad-platforms/status] Error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to retrieve connection statuses' })
  }
})

// 3. GET `/sync-history`: Retrieve recent sync runs matching platforms
router.get('/sync-history', async (req, res) => {
  try {
    const siteKey = req.site.site_key
    const { data, error } = await getSupabase()
      .from('ad_sync_runs')
      .select('id, platform, source, sync_start, sync_end, status, records_synced, error_message, sync_type')
      .eq('site_key', siteKey)
      .in('platform', ['google_ads', 'meta_ads'])
      .order('sync_start', { ascending: false })
      .limit(30)

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) {
    console.error('[ad-platforms/sync-history] Error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to retrieve sync history' })
  }
})

// 4. GET `/google/auth-url`: Retrieve Google Ads authorization redirect link
router.get('/google/auth-url', (req, res) => {
  try {
    const siteKey = req.site.site_key
    const userId = req.user.id
    const result = getAuthUrl(siteKey, userId)

    if (result.not_configured) {
      return res.json({ success: true, not_configured: true })
    }

    res.json({ success: true, url: result.url })
  } catch (err) {
    console.error('[ad-platforms/google/auth-url] Error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to generate auth URL' })
  }
})

// 5. POST `/google/save-account`: Connect ad customer ID to Google connection
router.post('/google/save-account', async (req, res) => {
  const { customer_id, login_customer_id } = req.body
  const siteKey = req.site.site_key

  const cleanCustomerId = String(customer_id || '').replace(/-/g, '').trim()
  const cleanLoginCustomerId = login_customer_id ? String(login_customer_id).replace(/-/g, '').trim() : null

  if (!cleanCustomerId || !/^\d{10}$/.test(cleanCustomerId)) {
    return res.status(400).json({ success: false, error: 'Google Customer ID must be a 10-digit numeric value' })
  }

  if (cleanLoginCustomerId && !/^\d{10}$/.test(cleanLoginCustomerId)) {
    return res.status(400).json({ success: false, error: 'Login Customer ID must be a 10-digit numeric value' })
  }

  try {
    const supabase = getSupabase()

    // Fetch refresh token to verify OAuth setup is ready
    const { data: conn } = await supabase
      .from('ad_platform_connections')
      .select('encrypted_refresh_token')
      .eq('site_key', siteKey)
      .eq('platform', 'google_ads')
      .maybeSingle()

    if (!conn?.encrypted_refresh_token) {
      return res.status(400).json({ success: false, error: 'Google Ads OAuth connection must be established first' })
    }

    // Save configuration settings. Set status to 'connected' (validation checked at first sync run)
    const { error } = await supabase
      .from('ad_platform_connections')
      .update({
        account_id: cleanCustomerId,
        login_customer_id: cleanLoginCustomerId || null,
        status: 'connected',
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('site_key', siteKey)
      .eq('platform', 'google_ads')

    if (error) throw error

    res.json({ success: true, message: 'Google Ads account configuration saved' })
  } catch (err) {
    console.error('[ad-platforms/google/save-account] Error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to save account configuration' })
  }
})

// 6. POST `/google/sync`: Daily cost synchronization task for Google Ads
router.post('/google/sync', async (req, res) => {
  const siteKey = req.site.site_key
  const lockKey = `${siteKey}:google_ads`

  if (activeSyncLocks.has(lockKey)) {
    return res.status(409).json({ success: false, error: 'Sync run already active for this platform connection' })
  }

  try {
    const supabase = getSupabase()

    const { data: conn } = await supabase
      .from('ad_platform_connections')
      .select('account_id, login_customer_id, encrypted_refresh_token')
      .eq('site_key', siteKey)
      .eq('platform', 'google_ads')
      .maybeSingle()

    if (!conn?.encrypted_refresh_token || !conn?.account_id) {
      return res.status(400).json({ success: false, error: 'Google Ads sync connection properties missing' })
    }

    activeSyncLocks.add(lockKey)

    // Execute background worker task
    runGoogleSync(req.site, conn, lockKey)
      .catch(syncErr => console.error(`[Google Sync Job Fail] ${syncErr.message}`))

    res.json({ success: true, message: 'Google Ads sync initiated in the background' })
  } catch (err) {
    console.error('[ad-platforms/google/sync] Launch failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to execute sync operation' })
  }
})

// 7. POST `/google/disconnect`: Disconnect GAds, deleting connections but leaving cost rows intact
router.post('/google/disconnect', async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from('ad_platform_connections')
      .delete()
      .eq('site_key', req.site.site_key)
      .eq('platform', 'google_ads')

    if (error) throw error
    res.json({ success: true, message: 'Google Ads integration disconnected. Historical costs are preserved.' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 8. POST `/meta/connect`: Receives, encrypts, and validates manual access token details
router.post('/meta/connect', async (req, res) => {
  const { access_token, ad_account_id } = req.body
  const siteKey = req.site.site_key

  if (!access_token || !ad_account_id) {
    return res.status(400).json({ success: false, error: 'access_token and ad_account_id parameters are required' })
  }

  const cleanAdAccountId = normalizeMetaAccountId(ad_account_id)
  if (!/^\d+$/.test(cleanAdAccountId)) {
    return res.status(400).json({ success: false, error: 'Ad Account ID must be a numeric value after removing prefixes' })
  }

  try {
    // Minimally validate Meta token/account settings
    const accountInfo = await validateMetaCredentials(cleanAdAccountId, access_token)
    const accountName = accountInfo.name || 'Meta Ad Account'

    const encryptedToken = encryptSecret(access_token)
    const supabase = getSupabase()

    const { error } = await supabase
      .from('ad_platform_connections')
      .upsert({
        site_key: siteKey,
        platform: 'meta_ads',
        account_id: cleanAdAccountId,
        account_name: accountName,
        encrypted_access_token: encryptedToken,
        status: 'connected',
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'site_key,platform' })

    if (error) throw error

    res.json({ success: true, message: 'Meta Ads manual token connected successfully' })
  } catch (err) {
    console.error('[ad-platforms/meta/connect] Error:', err.message)
    res.status(400).json({ success: false, error: err.message })
  }
})

// 9. POST `/meta/sync`: Daily cost synchronization task for Meta Ads
router.post('/meta/sync', async (req, res) => {
  const siteKey = req.site.site_key
  const lockKey = `${siteKey}:meta_ads`

  if (activeSyncLocks.has(lockKey)) {
    return res.status(409).json({ success: false, error: 'Sync run already active for this platform connection' })
  }

  try {
    const supabase = getSupabase()

    const { data: conn } = await supabase
      .from('ad_platform_connections')
      .select('account_id, encrypted_access_token')
      .eq('site_key', siteKey)
      .eq('platform', 'meta_ads')
      .maybeSingle()

    if (!conn?.encrypted_access_token || !conn?.account_id) {
      return res.status(400).json({ success: false, error: 'Meta Ads sync connection properties missing' })
    }

    activeSyncLocks.add(lockKey)

    // Execute background worker task
    runMetaSync(req.site, conn, lockKey)
      .catch(syncErr => console.error(`[Meta Sync Job Fail] ${syncErr.message}`))

    res.json({ success: true, message: 'Meta Ads sync initiated in the background' })
  } catch (err) {
    console.error('[ad-platforms/meta/sync] Launch failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to execute sync operation' })
  }
})

// 10. POST `/meta/disconnect`: Disconnect Meta, deleting credentials but keeping campaign_costs
router.post('/meta/disconnect', async (req, res) => {
  try {
    const { error } = await getSupabase()
      .from('ad_platform_connections')
      .delete()
      .eq('site_key', req.site.site_key)
      .eq('platform', 'meta_ads')

    if (error) throw error
    res.json({ success: true, message: 'Meta Ads manual token disconnected. Historical costs are preserved.' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── SYNC WORKER ROUTINES ───

async function runGoogleSync(site, conn, lockKey) {
  const supabase = getSupabase()
  let syncRunId = null

  try {
    // 1. Log ad_sync_runs pending state
    const { data: run, error: logErr } = await supabase
      .from('ad_sync_runs')
      .insert({
        site_key: site.site_key,
        platform: 'google_ads',
        source: 'api_sync',
        sync_type: 'daily',
        status: 'pending',
        sync_start: new Date().toISOString()
      })
      .select('id')
      .single()

    if (logErr) throw logErr
    syncRunId = run.id

    // 2. Fetch/Refresh tokens
    const { access_token } = await refreshAccessToken(conn.encrypted_refresh_token)

    // 3. Setup bounded sync dates: default last 30 days
    const today = new Date()
    const endDate = new Date(today - 86400000).toISOString().split('T')[0] // yesterday
    const startDate = new Date(today - 30 * 86400000).toISOString().split('T')[0]

    // 4. Query performance GAQL
    const results = await fetchGoogleAdsPerformance(
      conn.account_id,
      startDate,
      endDate,
      access_token,
      conn.login_customer_id
    )

    // 5. Map results to normalized cost row shape
    const formattedRows = results.map(row => {
      const spend = Number(row.metrics.costMicros || 0) / 1000000
      return normalizeAdCostRow({
        date: row.segments.date,
        platform: 'google_ads',
        campaign_name: row.campaign.name,
        campaign_id: row.campaign.id,
        spend,
        clicks: row.metrics.clicks || 0,
        impressions: row.metrics.impressions || 0,
        currency: row.customer.currencyCode || 'USD'
      })
    })

    const aggregated = aggregateAdCostRows(formattedRows)
    const dbRows = buildCampaignCostUpsertRows(aggregated, site)

    await upsertCampaignCostRows(supabase, dbRows)

    // Update connection status on success
    await supabase
      .from('ad_platform_connections')
      .update({
        status: 'connected',
        last_error_code: null,
        last_error_message: null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('site_key', site.site_key)
      .eq('platform', 'google_ads')

    // Update sync run log
    await supabase
      .from('ad_sync_runs')
      .update({
        status: 'success',
        records_synced: dbRows.length,
        sync_end: new Date().toISOString()
      })
      .eq('id', syncRunId)

  } catch (err) {
    console.error(`[Google Sync Worker Error]`, err.message)

    if (syncRunId) {
      await supabase
        .from('ad_sync_runs')
        .update({
          status: 'failed',
          error_message: err.message || 'Unknown sync error',
          sync_end: new Date().toISOString()
        })
        .eq('id', syncRunId)
    }

    // Map sync error status
    await supabase
      .from('ad_platform_connections')
      .update({
        status: err.message === 'revoked_token' ? 'needs_reconnect' : 'error',
        last_error_code: err.message,
        last_error_message: err.message || 'Authentication or API query failed',
        updated_at: new Date().toISOString()
      })
      .eq('site_key', site.site_key)
      .eq('platform', 'google_ads')

  } finally {
    activeSyncLocks.delete(lockKey)
  }
}

async function runMetaSync(site, conn, lockKey) {
  const supabase = getSupabase()
  let syncRunId = null

  try {
    // 1. Log ad_sync_runs pending state
    const { data: run, error: logErr } = await supabase
      .from('ad_sync_runs')
      .insert({
        site_key: site.site_key,
        platform: 'meta_ads',
        source: 'api_sync',
        sync_type: 'daily',
        status: 'pending',
        sync_start: new Date().toISOString()
      })
      .select('id')
      .single()

    if (logErr) throw logErr
    syncRunId = run.id

    // 2. Fetch decrypt token
    const accessToken = decryptSecret(conn.encrypted_access_token)

    // 3. Setup bounded sync dates: default last 30 days
    const today = new Date()
    const endDate = new Date(today - 86400000).toISOString().split('T')[0] // yesterday
    const startDate = new Date(today - 30 * 86400000).toISOString().split('T')[0]

    // 4. Query performance insights Graph API
    const insights = await fetchMetaPerformance(conn.account_id, startDate, endDate, accessToken)

    // 5. Map results to normalized cost row shape
    const formattedRows = insights.map(row => {
      return normalizeAdCostRow({
        date: row.date_start,
        platform: 'meta_ads',
        campaign_name: row.campaign_name,
        campaign_id: row.campaign_id,
        spend: parseFloat(row.spend) || 0,
        clicks: parseInt(row.clicks, 10) || 0,
        impressions: parseInt(row.impressions, 10) || 0,
        currency: row.account_currency || 'USD'
      })
    })

    const aggregated = aggregateAdCostRows(formattedRows)
    const dbRows = buildCampaignCostUpsertRows(aggregated, site)

    await upsertCampaignCostRows(supabase, dbRows)

    // Update connection status on success
    await supabase
      .from('ad_platform_connections')
      .update({
        status: 'connected',
        last_error_code: null,
        last_error_message: null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('site_key', site.site_key)
      .eq('platform', 'meta_ads')

    // Update sync run log
    await supabase
      .from('ad_sync_runs')
      .update({
        status: 'success',
        records_synced: dbRows.length,
        sync_end: new Date().toISOString()
      })
      .eq('id', syncRunId)

  } catch (err) {
    console.error(`[Meta Sync Worker Error]`, err.message)

    if (syncRunId) {
      await supabase
        .from('ad_sync_runs')
        .update({
          status: 'failed',
          error_message: err.message || 'Unknown sync error',
          sync_end: new Date().toISOString()
        })
        .eq('id', syncRunId)
    }

    // Map sync error status
    await supabase
      .from('ad_platform_connections')
      .update({
        status: ['expired_token', 'invalid_token'].includes(err.message) ? 'needs_reconnect' : 'error',
        last_error_code: err.message,
        last_error_message: err.message || 'API query failed',
        updated_at: new Date().toISOString()
      })
      .eq('site_key', site.site_key)
      .eq('platform', 'meta_ads')

  } finally {
    activeSyncLocks.delete(lockKey)
  }
}

export { router as adPlatformsRouter }
