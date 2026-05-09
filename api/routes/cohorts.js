import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'

const router = Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

router.get('/weekly', validateSiteKey, async (req, res) => {
  try {
    const siteId = esc(req.site.id)

    const sql = `
      SELECT
        formatDateTime(min_ts, '%Y-W%V') AS cohort_week,
        COUNT(DISTINCT distinct_id) AS users,
        SUM(is_converted) AS converted_users
      FROM (
        SELECT
          distinct_id,
          MIN(timestamp) AS min_ts,
          MAX(CASE WHEN event = '$conversion' THEN 1 ELSE 0 END) AS is_converted
        FROM events
        WHERE properties.site_id = '${siteId}'
          AND (event = '$pageview' OR event = '$conversion')
        GROUP BY distinct_id
        HAVING min_ts IS NOT NULL
      )
      GROUP BY cohort_week
      ORDER BY cohort_week ASC
      LIMIT 500
    `

    const rows = await queryHogQL(sql, 'cohorts_weekly')

    const cohorts = rows.map(([week, users, converted]) => ({
      cohort_week: week,
      users: Number(users) || 0,
      converted_users: Number(converted) || 0,
      conversion_rate: users > 0 ? ((Number(converted) || 0) / Number(users)) * 100 : 0
    }))

    return res.status(200).json({
      success: true,
      data: { cohorts },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Cohort query failed' })
  }
})

router.get('/ai-source', validateSiteKey, async (req, res) => {
  try {
    const siteId = esc(req.site.id)

    const sql = `
      SELECT
        formatDateTime(first_seen, '%Y-W%V') AS cohort_week,
        properties.ai_source AS ai_source,
        COUNT(DISTINCT distinct_id) AS users
      FROM (
        SELECT
          distinct_id,
          MIN(timestamp) AS first_seen,
          argMin(properties.ai_source, timestamp) AS ai_source
        FROM events
        WHERE properties.site_id = '${siteId}'
          AND event = '$pageview'
          AND properties.ai_source IS NOT NULL
          AND properties.ai_source != ''
        GROUP BY distinct_id
      )
      GROUP BY cohort_week, ai_source
      ORDER BY cohort_week ASC, users DESC
      LIMIT 1000
    `

    const rows = await queryHogQL(sql, 'cohorts_ai')

    const cohorts = rows.map(([week, aiSource, users]) => ({
      cohort_week: week,
      ai_source: aiSource,
      users: Number(users) || 0
    }))

    return res.status(200).json({
      success: true,
      data: { cohorts },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'AI cohort query failed' })
  }
})

export { router as cohortsRouter }
