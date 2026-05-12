import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'

const router = Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

router.get('/utms', validateSiteKey, async (req, res) => {
  try {
    const siteId = esc(req.site.id)

    // Missing UTM source on pageviews
    const missingSourceSql = `
      SELECT count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$pageview'
        AND timestamp >= now() - INTERVAL 30 DAY
        AND (properties.utm_source IS NULL OR properties.utm_source = '')
    `

    // Campaign naming: detect inconsistent patterns
    const campaignSql = `
      SELECT
        properties.utm_campaign AS campaign,
        count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$pageview'
        AND properties.utm_campaign IS NOT NULL
        AND properties.utm_campaign != ''
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY campaign
      ORDER BY cnt DESC
      LIMIT 100
    `

    // Unknown referrers
    const referrerSql = `
      SELECT
        properties.referrer AS referrer,
        count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$pageview'
        AND properties.referrer IS NOT NULL
        AND properties.referrer != ''
        AND properties.utm_source IS NULL
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY referrer
      ORDER BY cnt DESC
      LIMIT 30
    `

    // Missing conversion values
    const missingConvSql = `
      SELECT count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$conversion'
        AND timestamp >= now() - INTERVAL 30 DAY
        AND (properties.conversion_value IS NULL OR properties.conversion_value = '' OR toFloatOrZero(toString(properties.conversion_value)) = 0)
    `

    // Low event activity: days with < 5 events in last 30 days
    const lowActivitySql = `
      SELECT
        formatDateTime(timestamp, '%Y-%m-%d') AS day,
        count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY day
      HAVING cnt < 5
      ORDER BY day ASC
      LIMIT 30
    `

    const [[missingSource]] = await queryHogQL(missingSourceSql, 'hygiene_missing_source')
    const campaignRows = await queryHogQL(campaignSql, 'hygiene_campaigns')
    const referrerRows = await queryHogQL(referrerSql, 'hygiene_referrers')
    const [[missingConv]] = await queryHogQL(missingConvSql, 'hygiene_missing_conv')
    const lowActivityRows = await queryHogQL(lowActivitySql, 'hygiene_low_activity')

    const issues = []

    const msCount = Number(missingSource) || 0
    if (msCount > 10) {
      issues.push({
        type: 'missing_utm_source',
        severity: 'medium',
        message: `${msCount} pageviews have no UTM source in last 30 days`,
        detail: 'Add utm_source to campaign links for accurate attribution.'
      })
    }

    // Campaign naming inconsistencies: detect near-duplicates
    const campaigns = campaignRows.map(([c, cnt]) => ({ name: (c || '').toLowerCase(), count: Number(cnt) })).filter(c => c.count > 0)
    const seen = new Set()
    const inconsistent = []
    for (const c of campaigns) {
      const normalized = c.name.replace(/[-_\s]+/g, '_').replace(/[^a-z0-9_]/g, '')
      if (seen.has(normalized)) {
        inconsistent.push(c.name)
      } else {
        seen.add(normalized)
      }
    }
    if (inconsistent.length > 1) {
      issues.push({
        type: 'campaign_naming',
        severity: 'low',
        message: `${inconsistent.length} campaign names may be inconsistent (e.g. "summer-sale" vs "summer_sale")`,
        detail: 'Standardize campaign naming with underscores or hyphens only.'
      })
    }

    // Unknown referrers without UTM
    const unknownRefs = referrerRows.filter(([, cnt]) => Number(cnt) > 5)
    if (unknownRefs.length > 0) {
      issues.push({
        type: 'unknown_referrers',
        severity: 'low',
        message: `${unknownRefs.length} referrers drive traffic without UTM params`,
        detail: 'Tag external links with utm_source for proper attribution.'
      })
    }

    const mcCount = Number(missingConv) || 0
    if (mcCount > 0) {
      issues.push({
        type: 'missing_conversion_value',
        severity: 'medium',
        message: `${mcCount} conversions have no value`,
        detail: 'Add conversion_value to track monetary impact.'
      })
    }

    if (lowActivityRows.length > 5) {
      issues.push({
        type: 'low_activity',
        severity: 'low',
        message: `${lowActivityRows.length} days with fewer than 5 events in last 30 days`,
        detail: 'Check that the tracking snippet is correctly installed on all pages.'
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        issues,
        summary: {
          missing_utm_source: msCount,
          campaign_count: campaignRows.length,
          unknown_referrers: unknownRefs.length,
          missing_conversion_value: mcCount,
          low_activity_days: lowActivityRows.length,
          total_issues: issues.length
        }
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Hygiene check failed' })
  }
})

export { router as hygieneRouter }
