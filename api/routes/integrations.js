import express from 'express'
import { queryHogQL } from '../lib/posthog.js'
import { getSupabase } from '../lib/supabase.js'
import { esc, encryptSecret } from '../lib/utils.js'
import { siteCache } from '../middleware/auth.js'
import { resolveCname, verifySslAndRouting, normalizeDnsName } from '../lib/dns-resolver.js'
import { invalidateProxyCache } from '../middleware/managed-proxy.js'

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

// PATCH /api/integrations/settings — update per-site attribution window
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

    const supabase = getSupabase()

    const updates = {}
    if (windowDays !== null) updates.attribution_window_days = windowDays
    if (timezone !== undefined) updates.timezone = timezone
    if (excludedPaths !== null) updates.excluded_paths = excludedPaths
    if (customUrlParams !== null) updates.custom_url_params = customUrlParams

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, data: null, error: 'No valid fields to update' })
    }

    const { data, error } = await supabase
      .from('sites')
      .update(updates)
      .eq('site_key', siteKey)
      .select('id, attribution_window_days, excluded_paths, timezone, custom_url_params')
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
      // 2. Perform HTTP/HTTPS health self-check routing verification
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

export { router as integrationsRouter }
