import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { esc } from '../lib/utils.js'
import { requireFeature } from '../lib/plan-features.js'

const router = Router()

// ── Test seam ────────────────────────────────────────────────────────────────
// Mirrors the merged live.js/hygiene.js pattern (no ESM module mocker): unit
// tests inject stubs for the two read backends; production uses the real imports.
let _queryTinybirdPipe = queryTinybirdPipe
let _queryHogQL = queryHogQL
export function __setAlertsReadDeps ({ queryTinybird, queryHog } = {}) {
  if (queryTinybird) _queryTinybirdPipe = queryTinybird
  if (queryHog) _queryHogQL = queryHog
}
export function __resetAlertsReadDeps () {
  _queryTinybirdPipe = queryTinybirdPipe
  _queryHogQL = queryHogQL
}

// Tinybird-first read helper: null (flag off / error) -> HogQL fallback; rows
// remapped to the HogQL positional shape so downstream is byte-identical.
// Fail-closed under the test-only TINYBIRD_FORCE_READ. Tenant isolation: pipes
// called with the authenticated site_id, never client-supplied.
async function readTb (pipeName, params, hogSql, hogName, mapRows) {
  const tb = await _queryTinybirdPipe(pipeName, params)
  if (tb !== null) return mapRows(tb)
  if (process.env.TINYBIRD_FORCE_READ === 'true') {
    throw new Error(`[tinybird-force-read] ${pipeName} returned null under TINYBIRD_FORCE_READ — dispatch path not exercised`)
  }
  return _queryHogQL(hogSql, hogName)
}

const requireAlertsFeature = (req, res, next) => {
  const block = requireFeature(req.site?.plan, 'alerts', 'Alerts')
  if (block) return res.status(block.status ?? 402).json(block)
  return next()
}

router.get('/', validateSiteKey, requireAlertsFeature, async (req, res) => {
  try {
    const siteId = esc(req.site.id)
    const alerts = []

    // 1. Traffic drop week-over-week
    const trafficSql = `
      SELECT
        SUM(CASE WHEN timestamp >= now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS this_week,
        SUM(CASE WHEN timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS last_week
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$pageview'
        AND timestamp >= now() - INTERVAL 14 DAY
    `
    // WIRED (pageview counts, week-over-week).
    const trafficRows = await readTb('alert_traffic', { site_id: req.site.id }, trafficSql, 'alert_traffic', tb => [[tb?.[0]?.this_week ?? 0, tb?.[0]?.last_week ?? 0]])
    const thisWeek = Number(trafficRows?.[0]?.[0]) || 0
    const lastWeek = Number(trafficRows?.[0]?.[1]) || 0
    if (lastWeek > 0 && thisWeek < lastWeek * 0.5) {
      alerts.push({
        id: 'traffic_drop',
        severity: 'high',
        metric: 'Traffic',
        message: `Traffic dropped ${Math.round((1 - thisWeek / lastWeek) * 100)}% this week vs last`,
        comparison: `${thisWeek} vs ${lastWeek} pageviews`,
        suggested_action: 'Check Install page and Event Logger for tracker issues.'
      })
    }

    // 2. Conversion drop day-over-day
    const convSql = `
      SELECT
        SUM(CASE WHEN timestamp >= now() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN timestamp >= now() - INTERVAL 2 DAY AND timestamp < now() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS yesterday
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$conversion'
        AND timestamp >= now() - INTERVAL 2 DAY
    `
    // MONEY-RAIL: wired Tinybird-first (alert_conversions) with HogQL fallback, via
    // readTb. Pipe named {today, yesterday} remapped to the single [[today, yesterday]]
    // positional row the consumer reads, byte-identical to the HogQL path.
    const convRows = await readTb('alert_conversions', { site_id: req.site.id }, convSql, 'alert_conversions', tb => [[tb?.[0]?.today ?? 0, tb?.[0]?.yesterday ?? 0]])
    const today = Number(convRows?.[0]?.[0]) || 0
    const yesterday = Number(convRows?.[0]?.[1]) || 0
    if (yesterday > 0 && today < yesterday * 0.3) {
      alerts.push({
        id: 'conversion_drop',
        severity: 'high',
        metric: 'Conversions',
        message: `Conversions dropped ${Math.round((1 - today / yesterday) * 100)}% today vs yesterday`,
        comparison: `${today} vs ${yesterday} conversions`,
        suggested_action: 'Verify conversion tracking in Event Logger and check funnel pages.'
      })
    }

    // 3. AI source traffic below threshold
    const aiSql = `
      SELECT properties.ai_source, count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$pageview'
        AND properties.ai_source IS NOT NULL
        AND properties.ai_source != ''
        AND timestamp >= now() - INTERVAL 7 DAY
      GROUP BY properties.ai_source
      ORDER BY cnt DESC
      LIMIT 10
    `
    // MONEY-RAIL: wired Tinybird-first (alert_ai) with HogQL fallback, via readTb.
    // Pipe named {ai_source, cnt} remapped to the positional [ai_source, cnt] rows the
    // consumer reduces over, byte-identical to the HogQL path. ai_source is a Nullable
    // typed column; the pipe's own `IS NOT NULL AND != ''` matches HogQL's bag `!= ''`
    // (JSONExtractString yields '' not NULL), so the filtered row set is identical.
    const aiRows = await readTb('alert_ai', { site_id: req.site.id }, aiSql, 'alert_ai', tb => tb.map(r => [r.ai_source, r.cnt]))
    const aiTotal = aiRows.reduce((s, [, c]) => s + Number(c), 0)
    const threshold = 5
    if (aiTotal > threshold && aiTotal < threshold * 2) {
      alerts.push({
        id: 'ai_traffic_low',
        severity: 'medium',
        metric: 'AI Traffic',
        message: `AI source traffic at ${aiTotal} events this week (below healthy threshold)`,
        comparison: `Threshold: ${threshold * 2} events/week`,
        suggested_action: 'Check if AI platform referrers changed or content was updated.'
      })
    }

    // 4. Install silent / no recent events
    const recentSql = `
      SELECT count() AS cnt, MAX(timestamp) AS last_ts
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND timestamp >= now() - INTERVAL 24 HOUR
    `
    // WIRED (event count + last timestamp, trailing 24h).
    const recentRows = await readTb('alert_recent', { site_id: req.site.id }, recentSql, 'alert_recent', tb => [[tb?.[0]?.cnt ?? 0, tb?.[0]?.last_ts ?? null]])
    const recentCount = Number(recentRows?.[0]?.[0]) || 0
    if (recentCount === 0) {
      alerts.push({
        id: 'install_silent',
        severity: 'medium',
        metric: 'Install Health',
        message: 'No events received in the last 24 hours',
        comparison: '0 events in 24h',
        suggested_action: 'Verify the tracking snippet is still on your live site and the domain matches.'
      })
    }

    return res.status(200).json({
      success: true,
      data: { alerts, count: alerts.length },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Alert check failed' })
  }
})

export { router as alertsRouter }
