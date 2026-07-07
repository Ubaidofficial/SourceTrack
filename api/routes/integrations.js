import express from 'express'
import crypto from 'crypto'
import { queryHogQL } from '../lib/posthog.js'
import { getSupabase } from '../lib/supabase.js'
import { esc, encryptSecret } from '../lib/utils.js'
import { siteCache } from '../middleware/auth.js'
import { resolveCname, verifySslAndRouting, normalizeDnsName } from '../lib/dns-resolver.js'
import { addPullZoneHostname, loadFreeCertificate, removePullZoneHostname } from '../lib/bunny-edge.js'
import { invalidateProxyCache } from '../middleware/managed-proxy.js'
import { validateCrossDomainSettings } from '../lib/cross-domain-validation.js'
import { requireFeature } from '../lib/plan-features.js'

const router = express.Router()

router.get('/overview', async (req, res) => {
  try {
    const safeSite = esc(String(req.site.id))

    // Install status query
    const installSql = `
      SELECT event, timestamp, properties.page_url AS page_url
      FROM events
      WHERE properties.site_id = '${safeSite}'
      ORDER BY timestamp DESC
      LIMIT 1
    `

    // Hygiene queries
    const missingSourceSql = `
      SELECT count() AS cnt
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND timestamp >= now() - INTERVAL 30 DAY
        AND (properties.utm_source IS NULL OR properties.utm_source = '')
    `

    const campaignSql = `
      SELECT properties.utm_campaign AS campaign, count() AS cnt
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND properties.utm_campaign IS NOT NULL
        AND properties.utm_campaign != ''
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY campaign
      ORDER BY cnt DESC
      LIMIT 100
    `

    const referrerSql = `
      SELECT properties.referrer AS referrer, count() AS cnt
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND properties.referrer IS NOT NULL
        AND properties.referrer != ''
        AND properties.utm_source IS NULL
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY referrer
      ORDER BY cnt DESC
      LIMIT 30
    `

    const missingConvSql = `
      SELECT count() AS cnt
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$conversion'
        AND timestamp >= now() - INTERVAL 30 DAY
        AND (properties.conversion_value IS NULL OR properties.conversion_value = '' OR toFloatOrZero(toString(properties.conversion_value)) = 0)
    `

    const lowActivitySql = `
      SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, count() AS cnt
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY day
      HAVING cnt < 5
      ORDER BY day ASC
      LIMIT 30
    `

    // Alert queries
    const trafficSql = `
      SELECT
        SUM(CASE WHEN timestamp >= now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS this_week,
        SUM(CASE WHEN timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS last_week
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND timestamp >= now() - INTERVAL 14 DAY
    `

    const convSql = `
      SELECT
        SUM(CASE WHEN timestamp >= now() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN timestamp >= now() - INTERVAL 2 DAY AND timestamp < now() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS yesterday
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$conversion'
        AND timestamp >= now() - INTERVAL 2 DAY
    `

    const aiSql = `
      SELECT properties.ai_source, count() AS cnt
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND properties.ai_source IS NOT NULL
        AND properties.ai_source != ''
        AND timestamp >= now() - INTERVAL 7 DAY
      GROUP BY properties.ai_source
      ORDER BY cnt DESC
      LIMIT 10
    `

    const recentSql = `
      SELECT count() AS cnt, MAX(timestamp) AS last_ts
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND timestamp >= now() - INTERVAL 24 HOUR
    `

    const [
      installRows,
      [[missingSource]],
      campaignRows,
      referrerRows,
      [[missingConv]],
      lowActivityRows,
      trafficRows,
      convRows,
      aiRows,
      recentRows
    ] = await Promise.all([
      queryHogQL(installSql, 'integ_install'),
      queryHogQL(missingSourceSql, 'integ_missing_source'),
      queryHogQL(campaignSql, 'integ_campaigns'),
      queryHogQL(referrerSql, 'integ_referrers'),
      queryHogQL(missingConvSql, 'integ_missing_conv'),
      queryHogQL(lowActivitySql, 'integ_low_activity'),
      queryHogQL(trafficSql, 'integ_traffic'),
      queryHogQL(convSql, 'integ_conversions'),
      queryHogQL(aiSql, 'integ_ai'),
      queryHogQL(recentSql, 'integ_recent')
    ])

    // Install status
    let install = { status: 'not_installed', last_event: null, last_event_type: null, domain: null }
    if (installRows && installRows.length > 0) {
      const [event, timestamp, pageUrl] = installRows[0]
      let domain = null
      try {
        if (pageUrl) domain = new URL(pageUrl).hostname
      } catch { /* ignore */ }
      install = { status: 'verified', last_event: timestamp, last_event_type: event, domain }
    }

    // Hygiene issues
    const hygieneIssues = []
    const msCount = Number(missingSource) || 0
    if (msCount > 10) {
      hygieneIssues.push({
        type: 'missing_utm_source', severity: 'medium',
        message: `${msCount} pageviews have no UTM source in last 30 days`,
        detail: 'Add utm_source to campaign links for accurate attribution.'
      })
    }

    const campaigns = campaignRows.map(([c, cnt]) => ({ name: (c || '').toLowerCase(), count: Number(cnt) })).filter(c => c.count > 0)
    const seen = new Set()
    let inconsistentCount = 0
    for (const c of campaigns) {
      const normalized = c.name.replace(/[-_\s]+/g, '_').replace(/[^a-z0-9_]/g, '')
      if (seen.has(normalized)) { inconsistentCount++ } else { seen.add(normalized) }
    }
    if (inconsistentCount > 1) {
      hygieneIssues.push({
        type: 'campaign_naming', severity: 'low',
        message: `${inconsistentCount} campaign names may be inconsistent`,
        detail: 'Standardize campaign naming with underscores or hyphens only.'
      })
    }

    const unknownRefs = referrerRows.filter(([, cnt]) => Number(cnt) > 5)
    if (unknownRefs.length > 0) {
      hygieneIssues.push({
        type: 'unknown_referrers', severity: 'low',
        message: `${unknownRefs.length} referrers drive traffic without UTM params`,
        detail: 'Tag external links with utm_source for proper attribution.'
      })
    }

    const mcCount = Number(missingConv) || 0
    if (mcCount > 0) {
      hygieneIssues.push({
        type: 'missing_conversion_value', severity: 'medium',
        message: `${mcCount} conversions have no value`,
        detail: 'Add conversion_value to track monetary impact.'
      })
    }

    if (lowActivityRows.length > 5) {
      hygieneIssues.push({
        type: 'low_activity', severity: 'low',
        message: `${lowActivityRows.length} days with fewer than 5 events in last 30 days`,
        detail: 'Check that the tracking snippet is correctly installed on all pages.'
      })
    }

    // Alerts
    const alerts = []

    const thisWeek = Number(trafficRows?.[0]?.[0]) || 0
    const lastWeek = Number(trafficRows?.[0]?.[1]) || 0
    if (lastWeek > 0 && thisWeek < lastWeek * 0.5) {
      alerts.push({
        id: 'traffic_drop', severity: 'high', metric: 'Traffic',
        message: `Traffic dropped ${Math.round((1 - thisWeek / lastWeek) * 100)}% this week vs last`,
        comparison: `${thisWeek} vs ${lastWeek} pageviews`,
        suggested_action: 'Check Install page and Event Logger for tracker issues.'
      })
    }

    const today = Number(convRows?.[0]?.[0]) || 0
    const yesterday = Number(convRows?.[0]?.[1]) || 0
    if (yesterday > 0 && today < yesterday * 0.3) {
      alerts.push({
        id: 'conversion_drop', severity: 'high', metric: 'Conversions',
        message: `Conversions dropped ${Math.round((1 - today / yesterday) * 100)}% today vs yesterday`,
        comparison: `${today} vs ${yesterday} conversions`,
        suggested_action: 'Verify conversion tracking in Event Logger and check funnel pages.'
      })
    }

    const aiTotal = aiRows.reduce((s, [, c]) => s + Number(c), 0)
    const threshold = 5
    if (aiTotal > threshold && aiTotal < threshold * 2) {
      alerts.push({
        id: 'ai_traffic_low', severity: 'medium', metric: 'AI Traffic',
        message: `AI source traffic at ${aiTotal} events this week (below healthy threshold)`,
        comparison: `Threshold: ${threshold * 2} events/week`,
        suggested_action: 'Check if AI platform referrers changed or content was updated.'
      })
    }

    const recentCount = Number(recentRows?.[0]?.[0]) || 0
    if (recentCount === 0) {
      alerts.push({
        id: 'install_silent', severity: 'medium', metric: 'Install Health',
        message: 'No events received in the last 24 hours',
        comparison: '0 events in 24h',
        suggested_action: 'Verify the tracking snippet is still on your live site and the domain matches.'
      })
    }

    res.status(200).json({
      success: true,
      data: {
        install,
        hygiene: { total_issues: hygieneIssues.length, issues: hygieneIssues },
        alerts: { count: alerts.length, alerts }
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: 'Integration overview query failed' })
  }
})

// GET /api/integrations/google-ads/checklist — lightweight, authenticated, read-only setup checklist
router.get('/google-ads/checklist', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    const safeSite = esc(String(req.site.id))

    const checklistSql = `
      SELECT
        count() AS total_events,
        SUM(CASE WHEN (properties.utm_source IS NOT NULL AND properties.utm_source != '') OR (properties.utm_medium IS NOT NULL AND properties.utm_medium != '') THEN 1 ELSE 0 END) AS utms_detected_count,
        SUM(CASE WHEN (properties.gclid IS NOT NULL AND properties.gclid != '') OR (properties.gbraid IS NOT NULL AND properties.gbraid != '') OR (properties.wbraid IS NOT NULL AND properties.wbraid != '') THEN 1 ELSE 0 END) AS click_id_detected_count,
        SUM(CASE WHEN (properties.utm_id IS NOT NULL AND properties.utm_id != '') OR (properties.st_campaign_id IS NOT NULL AND properties.st_campaign_id != '') THEN 1 ELSE 0 END) AS campaign_id_detected_count,
        SUM(CASE WHEN (properties.st_adgroup_id IS NOT NULL AND properties.st_adgroup_id != '') THEN 1 ELSE 0 END) AS adgroup_id_detected_count,
        SUM(CASE WHEN (properties.st_ad_id IS NOT NULL AND properties.st_ad_id != '') OR (properties.utm_content IS NOT NULL AND properties.utm_content != '') THEN 1 ELSE 0 END) AS ad_id_detected_count,
        MAX(CASE WHEN (properties.gclid IS NOT NULL AND properties.gclid != '') OR (properties.gbraid IS NOT NULL AND properties.gbraid != '') OR (properties.wbraid IS NOT NULL AND properties.wbraid != '') THEN timestamp ELSE null END) AS last_paid_click_seen,
        MAX(CASE WHEN event = '$conversion' AND ((properties.gclid IS NOT NULL AND properties.gclid != '') OR (properties.gbraid IS NOT NULL AND properties.gbraid != '') OR (properties.wbraid IS NOT NULL AND properties.wbraid != '')) THEN timestamp ELSE null END) AS last_conversion_attributed
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND timestamp >= now() - INTERVAL 30 DAY
    `

    const [rows, { data: connection, error: connError }] = await Promise.all([
      queryHogQL(checklistSql, 'google_ads_checklist'),
      getSupabase()
        .from('ad_platform_connections')
        .select('status')
        .eq('site_key', siteKey)
        .eq('platform', 'google_ads')
        .maybeSingle()
    ])

    if (connError) throw connError

    const row = rows?.[0] || [0, 0, 0, 0, 0, 0, null, null]
    const totalEvents = Number(row[0]) || 0
    const utmsDetectedCount = Number(row[1]) || 0
    const clickIdDetectedCount = Number(row[2]) || 0
    const campaignIdDetectedCount = Number(row[3]) || 0
    const adgroupIdDetectedCount = Number(row[4]) || 0
    const adIdDetectedCount = Number(row[5]) || 0
    const lastPaidClickSeen = row[6] || null
    const lastConversionAttributed = row[7] || null

    const checklist = {
      pixel_installed: totalEvents > 0,
      utms_detected: utmsDetectedCount > 0,
      click_id_detected: clickIdDetectedCount > 0,
      campaign_id_detected: campaignIdDetectedCount > 0,
      adgroup_id_detected: adgroupIdDetectedCount > 0,
      ad_id_detected: adIdDetectedCount > 0,
      last_paid_click_seen: lastPaidClickSeen,
      last_conversion_attributed: lastConversionAttributed,
      cost_connection_status: connection?.status || null
    }

    // Determine tracking quality label
    let qualityLabel = 'Cost not connected'
    if (!checklist.pixel_installed) {
      qualityLabel = 'Missing pixel install'
    } else if (!checklist.utms_detected) {
      qualityLabel = 'Missing UTM source'
    } else if (!checklist.click_id_detected) {
      qualityLabel = 'Missing click ID'
    } else if (!checklist.campaign_id_detected) {
      qualityLabel = 'Missing campaign ID'
    } else if (!checklist.adgroup_id_detected || !checklist.ad_id_detected) {
      qualityLabel = 'Name-only attribution'
    } else if (checklist.cost_connection_status !== 'active') {
      qualityLabel = 'Cost not connected'
    } else {
      qualityLabel = 'Good tracking'
    }

    return res.status(200).json({
      success: true,
      data: {
        checklist,
        quality_label: qualityLabel
      },
      error: null
    })
  } catch (err) {
    console.error('[google-ads-checklist] GET error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch Google Ads setup checklist' })
  }
})

// GET /api/integrations/settings — fetch current site settings
router.get('/settings', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'site_key required' })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('sites')
      .select('id, site_key, attribution_window_days, timezone, excluded_paths, custom_url_params, cross_domain_domains, cross_domain_cookie_domain, domain')
      .eq('site_key', siteKey)
      .single()

    if (error) {
      throw error
    }

    return res.json({ success: true, data, error: null })
  } catch (err) {
    console.error('[integrations] GET settings error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch settings' })
  }
})

// PATCH /api/integrations/settings — update per-site attribution window and cross-domain tracking
router.patch('/settings', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'site_key required' })
    }

    const ALLOWED_WINDOWS = [1, 7, 14, 30, 60, 90]
    const raw = req.body.attribution_window_days
    const windowDays = raw != null ? parseInt(raw, 10) : null

    if (windowDays !== null && !ALLOWED_WINDOWS.includes(windowDays)) {
      return res.status(400).json({
        success: false, data: null,
        error: `attribution_window_days must be one of: ${ALLOWED_WINDOWS.join(', ')}`
      })
    }

    let timezone = req.body.timezone
    if (timezone !== undefined) {
      if (timezone === null) {
        timezone = 'UTC'
      } else if (typeof timezone !== 'string') {
        return res.status(400).json({ success: false, data: null, error: 'timezone must be a string' })
      } else if (timezone.trim() === '') {
        timezone = 'UTC'
      } else {
        timezone = timezone.trim()
        try {
          Intl.DateTimeFormat(undefined, { timeZone: timezone })
        } catch (_) {
          return res.status(400).json({ success: false, data: null, error: `Invalid timezone: ${timezone}` })
        }
      }
    }

    let excludedPaths = null
    if (req.body.excluded_paths !== undefined) {
      const rawExcl = req.body.excluded_paths
      if (Array.isArray(rawExcl)) {
        excludedPaths = rawExcl.map(p => String(p).trim()).filter(Boolean)
      } else if (typeof rawExcl === 'string') {
        excludedPaths = rawExcl.split(',').map(p => p.trim()).filter(Boolean)
      } else if (rawExcl === null) {
        excludedPaths = []
      } else {
        return res.status(400).json({ success: false, data: null, error: 'excluded_paths must be an array or comma-separated string' })
      }
    }

    let customUrlParams = null
    if (req.body.custom_url_params !== undefined) {
      const rawParams = req.body.custom_url_params
      if (!Array.isArray(rawParams)) {
        return res.status(400).json({ success: false, data: null, error: 'custom_url_params must be an array' })
      }

      // Deduplicate, normalize to lowercase, filter out empty values
      const uniqueParams = [...new Set(rawParams.map(p => typeof p === 'string' ? p.trim().toLowerCase() : '').filter(Boolean))]

      // Limit check
      if (uniqueParams.length > 10) {
        return res.status(400).json({ success: false, data: null, error: 'Maximum of 10 custom URL parameters allowed per site' })
      }

      // Regex validation (lowercase letters, numbers, underscore, dash only, length 1-40)
      const paramRegex = /^[a-z0-9_-]{1,40}$/
      const blockedSubstrings = ['email', 'phone', 'name', 'address', 'token', 'secret', 'password', 'session', 'auth', 'cookie', 'card', 'ssn']

      for (const p of uniqueParams) {
        if (!paramRegex.test(p)) {
          return res.status(400).json({
            success: false,
            data: null,
            error: `Invalid custom URL parameter key "${p}". Keys must be 1-40 characters and contain only lowercase letters, numbers, underscores, or dashes.`
          })
        }

        for (const sub of blockedSubstrings) {
          if (p.includes(sub)) {
            return res.status(400).json({
              success: false,
              data: null,
              error: `Custom URL parameter key "${p}" is blocked. It contains the sensitive word "${sub}".`
            })
          }
        }
      }

      customUrlParams = uniqueParams
    }

    let crossDomainDomains = undefined
    let crossDomainCookieDomain = undefined
    if (req.body.cross_domain_domains !== undefined || req.body.cross_domain_cookie_domain !== undefined) {
      try {
        const validated = validateCrossDomainSettings(
          req.body,
          req.site?.domain
        )
        crossDomainDomains = validated.crossDomainDomains
        crossDomainCookieDomain = validated.crossDomainCookieDomain
      } catch (err) {
        return res.status(400).json({ success: false, data: null, error: err.message })
      }
    }

    const supabase = getSupabase()

    const updates = {}
    if (windowDays !== null) updates.attribution_window_days = windowDays
    if (timezone !== undefined) updates.timezone = timezone
    if (excludedPaths !== null) updates.excluded_paths = excludedPaths
    if (customUrlParams !== null) updates.custom_url_params = customUrlParams
    if (crossDomainDomains !== undefined) updates.cross_domain_domains = crossDomainDomains
    if (crossDomainCookieDomain !== undefined) updates.cross_domain_cookie_domain = crossDomainCookieDomain

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, data: null, error: 'No valid fields to update' })
    }

    const { data, error } = await supabase
      .from('sites')
      .update(updates)
      .eq('site_key', siteKey)
      .select('id, attribution_window_days, excluded_paths, timezone, custom_url_params, cross_domain_domains, cross_domain_cookie_domain')
      .single()

    if (error) {
      // Graceful degradation if column doesn't exist yet (migration not run)
      if (error.message?.includes('attribution_window_days')) {
        return res.status(503).json({
          success: false, data: null,
          error: 'Attribution window column not yet available. Please run the DB migration.'
        })
      }
      throw error
    }

    // Invalidate site cache so validateSiteKey picks up changes immediately
    if (req.site?.site_key) {
      siteCache.del(siteKey)
    }

    return res.json({ success: true, data, error: null })
  } catch (err) {
    console.error('[integrations] PATCH settings error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to update settings' })
  }
})

// GET /api/integrations/ingestion-events — recent webhook activity log (read-only)
//   Used by the Integrations page to show whether Stripe/Shopify/Payments-API webhooks
//   actually arrived, were deduped, or errored — without exposing PII.
router.get('/ingestion-events', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const ALLOWED_PROVIDERS = new Set(['stripe', 'shopify', 'payments_api'])
    const provider = typeof req.query.provider === 'string' ? req.query.provider.toLowerCase() : ''
    if (!ALLOWED_PROVIDERS.has(provider)) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid provider' })
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 25)

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('revenue_ingestion_events')
      .select('id, provider, status, value, currency, order_id, provider_event_id, error_message, created_at')
      .eq('site_key', siteKey)
      .eq('provider', provider)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return res.json({ success: true, data: { events: data || [] }, error: null })
  } catch (err) {
    console.error('[integrations] GET ingestion-events error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch ingestion events' })
  }
})

// GET /api/integrations/stripe — fetch stripe integration settings
router.get('/stripe', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const supabase = getSupabase()
    const { data: site, error } = await supabase
      .from('sites')
      .select('encrypted_stripe_webhook_secret')
      .eq('site_key', siteKey)
      .single()

    if (error) throw error

    const hasSecret = !!site?.encrypted_stripe_webhook_secret

    return res.json({
      success: true,
      data: {
        configured: hasSecret,
        masked_secret: hasSecret ? 'whsec_••••••••••••••••' : null
      },
      error: null
    })
  } catch (err) {
    console.error('[integrations] GET stripe secret status error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch Stripe webhook sync status' })
  }
})

// POST /api/integrations/stripe — configure or delete stripe secret
router.post('/stripe', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const { secret } = req.body
    const supabase = getSupabase()

    let encryptedSecret = null

    if (secret !== undefined && secret !== null && secret.trim() !== '') {
      const trimmedSecret = secret.trim()
      if (!trimmedSecret.startsWith('whsec_')) {
        return res.status(400).json({ success: false, data: null, error: 'Webhook secret must start with whsec_' })
      }
      encryptedSecret = encryptSecret(trimmedSecret)
    }

    const { error } = await supabase
      .from('sites')
      .update({ encrypted_stripe_webhook_secret: encryptedSecret })
      .eq('site_key', siteKey)

    if (error) throw error

    // Invalidate site cache so validateSiteKey picks up changes immediately
    if (req.site?.site_key) {
      siteCache.del(siteKey)
    }

    return res.json({ success: true, data: { configured: !!encryptedSecret }, error: null })
  } catch (err) {
    console.error('[integrations] POST stripe secret error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to save Stripe webhook secret' })
  }
})

// GET /api/integrations/shopify — fetch shopify integration settings
router.get('/shopify', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const supabase = getSupabase()
    const { data: site, error } = await supabase
      .from('sites')
      .select('encrypted_shopify_shared_secret')
      .eq('site_key', siteKey)
      .single()

    if (error) throw error

    const hasSecret = !!site?.encrypted_shopify_shared_secret

    return res.json({
      success: true,
      data: {
        configured: hasSecret,
        masked_secret: hasSecret ? 'shpss_••••••••' : null
      },
      error: null
    })
  } catch (err) {
    console.error('[integrations] GET shopify secret status error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch Shopify webhook sync status' })
  }
})

// POST /api/integrations/shopify — configure or delete shopify secret
router.post('/shopify', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const { secret } = req.body
    const supabase = getSupabase()

    let encryptedSecret = null

    if (secret !== undefined && secret !== null && secret.trim() !== '') {
      const trimmedSecret = secret.trim()
      if (trimmedSecret.length > 200) {
        return res.status(400).json({ success: false, data: null, error: 'Secret is too long (maximum 200 characters)' })
      }
      encryptedSecret = encryptSecret(trimmedSecret)
    }

    const { error } = await supabase
      .from('sites')
      .update({ encrypted_shopify_shared_secret: encryptedSecret })
      .eq('site_key', siteKey)

    if (error) throw error

    // Invalidate site cache so validateSiteKey picks up changes immediately
    if (req.site?.site_key) {
      siteCache.del(siteKey)
    }

    return res.json({ success: true, data: { configured: !!encryptedSecret }, error: null })
  } catch (err) {
    console.error('[integrations] POST shopify secret error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to save Shopify webhook secret' })
  }
})

// GET /api/integrations/proxy-domain — Retrieve custom proxy domain config
router.get('/proxy-domain', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('managed_proxy_domains')
      .select('domain, status, cname_target, verified_at, last_checked_at, error_code, error_message')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (error) throw error

    return res.json({ success: true, data: data || null, error: null })
  } catch (err) {
    console.error('[integrations] GET proxy-domain error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch custom tracking domain' })
  }
})

// POST /api/integrations/proxy-domain — Add or update custom tracking domain
router.post('/proxy-domain', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    let { domain } = req.body
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ success: false, data: null, error: 'Domain name is required' })
    }

    // Normalize domain
    domain = domain.trim().toLowerCase().replace(/\/+$/, '')

    if (/^https?:\/\//.test(domain)) {
      return res.status(400).json({ success: false, data: null, error: 'Enter domain only, without http:// or https://' })
    }
    if (domain.includes('/') || domain.includes('?') || domain.includes('*') || domain.includes(' ')) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid domain format (wildcards, paths, or spaces not allowed)' })
    }
    if (domain === 'localhost' || domain === '127.0.0.1' || domain === '::1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(domain)) {
      return res.status(400).json({ success: false, data: null, error: 'Localhost and IP addresses are not allowed as custom domains' })
    }

    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
    if (!domainRegex.test(domain) || domain.length > 253) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid custom domain subdomain format' })
    }

    const cnameTarget = normalizeDnsName(process.env.ST_MANAGED_PROXY_TARGET || 'proxy.sourcetrack.io')
    const supabase = getSupabase()

    // Enforce uniqueness across different sites
    const { data: duplicateCheck } = await supabase
      .from('managed_proxy_domains')
      .select('site_key')
      .eq('domain', domain)
      .maybeSingle()

    if (duplicateCheck && duplicateCheck.site_key !== siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'This custom domain is already registered by another site' })
    }

    // Retrieve old domain to invalidate its cache
    const { data: currentRecord } = await supabase
      .from('managed_proxy_domains')
      .select('domain')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (currentRecord) {
      invalidateProxyCache(currentRecord.domain)
    }

    // Upsert domain settings (Enforced 1-domain-per-site via site_key uniqueness)
    const { data: savedRecord, error } = await supabase
      .from('managed_proxy_domains')
      .upsert({
        site_key: siteKey,
        domain,
        status: 'pending_dns',
        cname_target: cnameTarget,
        updated_at: new Date().toISOString()
      }, { onConflict: 'site_key' })
      .select('domain, status, cname_target, verified_at, last_checked_at, error_code, error_message')
      .single()

    if (error) throw error

    invalidateProxyCache(domain)

    // Best-effort: pre-register the hostname on the Bunny edge so the free cert
    // can be issued at verify time. DNS-first UX is preserved — the customer
    // still needs to add the CNAME, and we do NOT block or issue a cert here.
    // Gated OFF in mock mode so DNS-mock tests never hit the network.
    if (process.env.ST_MOCK_DNS_RESOLVE !== 'true') {
      const reg = await addPullZoneHostname(domain)
      if (!reg.ok && !reg.disabled) {
        console.warn(`[integrations] Bunny hostname pre-registration non-fatal failure (status=${reg.status ?? 'n/a'})`)
      }
    }

    return res.json({ success: true, data: savedRecord, error: null })
  } catch (err) {
    console.error('[integrations] POST proxy-domain error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to configure custom tracking domain' })
  }
})

// POST /api/integrations/proxy-domain/verify — Trigger DNS CNAME and SSL verification checks
router.post('/proxy-domain/verify', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const supabase = getSupabase()
    const { data: record, error: fetchErr } = await supabase
      .from('managed_proxy_domains')
      .select('domain, cname_target')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (fetchErr || !record) {
      return res.status(404).json({ success: false, data: null, error: 'No custom tracking domain configured' })
    }

    const domain = record.domain
    const expectedTarget = normalizeDnsName(record.cname_target)
    let dnsValid = false
    let resolvedCnames = []
    let dnsErrorCode = null
    let dnsErrorMessage = null

    // 1. Verify CNAME DNS records
    try {
      resolvedCnames = await resolveCname(domain)
      dnsValid = resolvedCnames.some(cname => normalizeDnsName(cname) === expectedTarget)
      if (!dnsValid) {
        dnsErrorCode = 'CNAME_MISMATCH'
        dnsErrorMessage = `Subdomain DNS records do not point to the expected target. Resolved: [${resolvedCnames.join(', ') || 'none'}], Expected: ${expectedTarget}.`
      }
    } catch (dnsErr) {
      dnsErrorCode = dnsErr.code || 'DNS_LOOKUP_FAILED'
      dnsErrorMessage = dnsErr.message || 'DNS query failed or timed out.'
    }

    let finalStatus = 'pending_dns'
    let verifiedAt = null

    if (dnsValid) {
      // 2. CNAME points at us — ask Bunny to register the hostname and issue the
      // free Let's Encrypt cert. addPullZoneHostname runs first to satisfy the
      // ordering constraint (loadFreeCertificate 404s if the hostname isn't on
      // the zone yet); both are idempotent and safe to re-run on every verify.
      // Cert issuance is ASYNC — we never force-activate on it. Gated OFF in
      // mock mode. Failures are non-fatal: the HTTPS self-check below is the
      // authoritative gate, so an unready cert simply keeps status pending.
      if (process.env.ST_MOCK_DNS_RESOLVE !== 'true') {
        await addPullZoneHostname(domain)
        await loadFreeCertificate(domain)
      }

      // 3. Perform HTTP/HTTPS health self-check routing verification
      const sslValid = await verifySslAndRouting(domain)
      if (sslValid) {
        finalStatus = 'active'
        verifiedAt = new Date().toISOString()
        dnsErrorCode = null
        dnsErrorMessage = null
      } else {
        finalStatus = 'pending_ssl_or_routing'
        dnsErrorCode = 'SSL_ROUTING_PENDING'
        dnsErrorMessage = 'DNS CNAME resolves correctly, but SSL/routing gateway is provisioning. Please allow 10-30 minutes for certificate generation.'
      }
    } else {
      finalStatus = 'error'
    }

    const { data: updatedRecord, error: updateErr } = await supabase
      .from('managed_proxy_domains')
      .update({
        status: finalStatus,
        verified_at: verifiedAt,
        last_checked_at: new Date().toISOString(),
        error_code: dnsErrorCode,
        error_message: dnsErrorMessage
      })
      .eq('site_key', siteKey)
      .select('domain, status, cname_target, verified_at, last_checked_at, error_code, error_message')
      .single()

    if (updateErr) throw updateErr

    invalidateProxyCache(domain)

    return res.json({ success: true, data: updatedRecord, error: null })
  } catch (err) {
    console.error('[integrations] POST proxy-domain/verify error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to verify custom tracking domain' })
  }
})

// DELETE /api/integrations/proxy-domain — Delete custom tracking domain config
router.delete('/proxy-domain', async (req, res) => {
  try {
    const siteKey = req.site?.site_key
    if (!siteKey) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const supabase = getSupabase()
    const { data: record } = await supabase
      .from('managed_proxy_domains')
      .select('domain')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (record) {
      invalidateProxyCache(record.domain)

      // Best-effort: release the hostname from the Bunny edge so it can be
      // re-added later. Non-fatal and gated OFF in mock mode.
      if (process.env.ST_MOCK_DNS_RESOLVE !== 'true') {
        await removePullZoneHostname(record.domain)
      }

      const { error } = await supabase
        .from('managed_proxy_domains')
        .delete()
        .eq('site_key', siteKey)

      if (error) throw error
    }

    return res.json({ success: true, data: { deleted: true }, error: null })
  } catch (err) {
    console.error('[integrations] DELETE proxy-domain error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to remove custom tracking domain' })
  }
})

// GET /api/integrations/api-keys — List API keys for the current site
router.get('/api-keys', async (req, res) => {
  try {
    const siteId = req.site?.id
    if (!siteId) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const supabase = getSupabase()
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, key_prefix, name, last_used_at, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return res.json({ success: true, data: keys || [], error: null })
  } catch (err) {
    console.error('[integrations] GET api-keys error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch API keys' })
  }
})

// POST /api/integrations/api-keys — Generate a new API key for the current site
router.post('/api-keys', async (req, res) => {
  try {
    const siteId = req.site?.id
    if (!siteId) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const name = req.body?.name?.trim()
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, data: null, error: 'Token name is required' })
    }
    if (name.length > 100) {
      return res.status(400).json({ success: false, data: null, error: 'Token name is too long (maximum 100 characters)' })
    }

    // Gating check
    const block = requireFeature(req.site?.plan, 'api_access', 'API access')
    if (block) {
      return res.status(402).json(block)
    }

    const randomPart = crypto.randomBytes(32).toString('hex')
    const rawToken = `st_live_${randomPart}`
    const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const keyPrefix = `st_live_${randomPart.slice(0, 4)}...`

    const supabase = getSupabase()
    const { data: newKey, error } = await supabase
      .from('api_keys')
      .insert({
        site_id: siteId,
        owner_id: req.user?.id,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        name
      })
      .select('id, key_prefix, name, last_used_at, created_at')
      .single()

    if (error) throw error

    return res.json({
      success: true,
      data: {
        ...newKey,
        token: rawToken
      },
      error: null
    })
  } catch (err) {
    console.error('[integrations] POST api-keys error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to create API key' })
  }
})

// DELETE /api/integrations/api-keys/:id — Revoke/delete an API key
router.delete('/api-keys/:id', async (req, res) => {
  try {
    const siteId = req.site?.id
    if (!siteId) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    const { id } = req.params
    if (!id) {
      return res.status(400).json({ success: false, data: null, error: 'Key ID is required' })
    }

    const supabase = getSupabase()
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id)
      .eq('site_id', siteId)

    if (error) throw error

    return res.json({ success: true, data: { revoked: true }, error: null })
  } catch (err) {
    console.error('[integrations] DELETE api-keys error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to revoke API key' })
  }
})

export { router as integrationsRouter }
