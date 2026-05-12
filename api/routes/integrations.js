import express from 'express'
import { queryHogQL } from '../lib/posthog.js'

const router = express.Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

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
      SELECT COUNT(*) AS cnt
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND timestamp >= now() - INTERVAL 30 DAY
        AND (properties.utm_source IS NULL OR properties.utm_source = '')
    `

    const campaignSql = `
      SELECT properties.utm_campaign AS campaign, COUNT(*) AS cnt
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
      SELECT properties.referrer AS referrer, COUNT(*) AS cnt
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
      SELECT COUNT(*) AS cnt
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$conversion'
        AND timestamp >= now() - INTERVAL 30 DAY
        AND (properties.conversion_value IS NULL OR properties.conversion_value = '' OR toFloat64OrZero(toString(properties.conversion_value)) = 0)
    `

    const lowActivitySql = `
      SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, COUNT(*) AS cnt
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
      SELECT properties.ai_source, COUNT(*) AS cnt
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
      SELECT COUNT(*) AS cnt, MAX(timestamp) AS last_ts
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
        suggested_action: 'Check Install page and Event Debugger for tracker issues.'
      })
    }

    const today = Number(convRows?.[0]?.[0]) || 0
    const yesterday = Number(convRows?.[0]?.[1]) || 0
    if (yesterday > 0 && today < yesterday * 0.3) {
      alerts.push({
        id: 'conversion_drop', severity: 'high', metric: 'Conversions',
        message: `Conversions dropped ${Math.round((1 - today / yesterday) * 100)}% today vs yesterday`,
        comparison: `${today} vs ${yesterday} conversions`,
        suggested_action: 'Verify conversion tracking in Event Debugger and check funnel pages.'
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

export { router as integrationsRouter }
