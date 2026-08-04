import express from 'express'
import crypto from 'crypto'
import { getSupabase } from '../lib/supabase.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { normalizePath } from '../lib/url-normalization.js'
import { esc } from '../lib/utils.js'
import { requireFeature } from '../lib/plan-features.js'
import { ORGANIC_SEARCH_ENGINE_HOSTS, ORGANIC_SEARCH_SOURCES } from '../lib/channel-classifier.js'

const router = express.Router()

// ── Test seam ────────────────────────────────────────────────────────────────
// Mirrors the merged live.js/hygiene.js pattern (no ESM module mocker): unit
// tests inject stubs for the two read backends; production uses the real imports.
let _queryTinybirdPipe = queryTinybirdPipe
export function __setSeoRevenueReadDeps ({ queryTinybird } = {}) {
  if (queryTinybird) _queryTinybirdPipe = queryTinybird
}
export function __resetSeoRevenueReadDeps () {
  _queryTinybirdPipe = queryTinybirdPipe
}

// Tinybird-first read helper: null (flag off / error) -> HogQL fallback; rows
// remapped to the HogQL positional shape so downstream is byte-identical.
// Fail-closed under the test-only TINYBIRD_FORCE_READ. Tenant isolation: pipes
// called with the authenticated site_id, never client-supplied.
async function readTb (pipeName, params, hogSql, hogName, mapRows) {
  const tb = await _queryTinybirdPipe(pipeName, params)
  if (tb !== null) return mapRows(tb)
  // D1b: the HogQL fallback is DELETED — Tinybird is the SOLE read path for this reader. PostHog is a
  // dead store; the old fallback served zeros (§6). A null means the DEPLOYED pipe is not serving ->
  // throw loud (500) instead of a silent dead-store read. FIX THE PIPE, do not restore the read. The
  // queryHogQL import/seam stays inert (the injectable cutover tests force the null via it); D3 removes it.
  throw new Error(`[tinybird-force-read] ${pipeName} returned null — FIX THE PIPE, do not restore the read`)
}

// Helper: hashed site identifier for privacy-hardened logging (mirrors the
// getLogHash used in google-search-console.js / ad-platforms.js).
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

// GET /api/seo-revenue: Generate Estimated SEO Revenue report
router.get('/', async (req, res) => {
  const block = requireFeature(req.site?.plan, 'gsc_seo_revenue', 'Google Search Console')
  if (block) return res.status(402).json(block)

  const { from, to } = req.query
  const siteKey = req.site.site_key
  const siteId = req.site.id

  if (!from || !to) {
    return res.status(400).json({ success: false, error: 'from and to date parameters are required' })
  }

  try {
    const supabase = getSupabase()

    // 1. Check GSC connection and property url selection status
    const { data: conn } = await supabase
      .from('gsc_connections')
      .select('property_url, status')
      .eq('site_key', siteKey)
      .maybeSingle()

    const gscConnected = !!(conn && conn.status === 'connected')
    const gscPropertySelected = !!(conn?.property_url)
    const propertyUrl = conn?.property_url || null

    // 2. Fetch conversions from Supabase (attributed_conversions)
    let conversionRows = []
    try {
      const { data } = await supabase
        .from('attributed_conversions')
        .select('distinct_id, conversion_value, conversion_date')
        .eq('site_id', siteId)
        .eq('first_touch_channel', 'Organic Search')
        .gte('conversion_date', from)
        .lte('conversion_date', to)

      conversionRows = data || []
    } catch (dbErr) {
      console.error('[SEO Revenue] Database query failed:', dbErr.message)
    }

    // Map: distinct_id -> { conversionsCount, revenue }
    const conversionsByVisitor = {}
    let totalOrganicConversions = 0
    let totalOrganicRevenue = 0

    for (const row of conversionRows) {
      const distinctId = row.distinct_id
      const value = Number(row.conversion_value) || 0
      totalOrganicConversions += 1
      totalOrganicRevenue += value

      if (!conversionsByVisitor[distinctId]) {
        conversionsByVisitor[distinctId] = { count: 0, revenue: 0 }
      }
      conversionsByVisitor[distinctId].count += 1
      conversionsByVisitor[distinctId].revenue += value
    }

    const uniqueVisitorIds = Object.keys(conversionsByVisitor)

    // 3. Resolve landing page paths for converting visitors via PostHog
    const visitorLandingPages = {}
    // Tracks whether the landing-page lookup itself failed (timeout / query
    // error). Distinguishes "unknown because the lookup broke" (data-quality
    // failure — all organic revenue dumped to 'unknown') from "unknown because
    // this visitor genuinely has no resolvable organic landing pageview".
    let landingLookupFailed = false
    if (uniqueVisitorIds.length > 0) {
      // Cap at 1,000 distinct IDs
      const cappedVisitorIds = uniqueVisitorIds.slice(0, 1000)
      const escapedIds = cappedVisitorIds.map(id => `'${esc(id)}'`).join(',')

      // Landing page = the visitor's FIRST ORGANIC-SEARCH pageview WITHIN the
      // report window — not their all-time-first pageview (which credited an
      // unrelated historical page). Organic is detected from the shared
      // channel-classifier lists (single source of truth with channelFromEvent):
      // referrer host is a known search engine, OR utm_source is one with no
      // paid medium. Visitors with no organic pageview in-window return no row
      // here and fall to the 'unknown' bucket (surfaced by the #29 logging).
      const organicReferrerClause = ORGANIC_SEARCH_ENGINE_HOSTS
        .map(h => `properties.referrer ILIKE '%${h}%'`)
        .join(' OR ')
      const organicSourceInList = ORGANIC_SEARCH_SOURCES.map(s => `'${s}'`).join(', ')

      const sql = `
        SELECT distinct_id, argMin(properties.page_url, timestamp)
        FROM events
        WHERE properties.site_id = '${esc(siteId)}'
          AND event = '$pageview'
          AND distinct_id IN (${escapedIds})
          AND timestamp >= toDateTime('${esc(from)} 00:00:00')
          AND timestamp <= toDateTime('${esc(to)} 23:59:59')
          AND (
            (${organicReferrerClause})
            OR (lower(properties.utm_source) IN (${organicSourceInList}) AND coalesce(properties.utm_medium, '') = '')
          )
        GROUP BY distinct_id
      `

      // Tinybird-first dispatch. Pipe params mirror the HogQL bounds exactly
      // (from/to inclusive-day window). The pipe returns named rows
      // {distinct_id, landing_page}; remap to the HogQL positional [distinct_id,
      // page_url] shape so the row-walk below is byte-identical. `sql` (unchanged)
      // stays the flag-off HogQL fallback.
      const params = {
        site_id: siteId,
        visitor_ids: cappedVisitorIds,
        from_ts: `${from} 00:00:00`,
        to_ts: `${to} 23:59:59`
      }
      const mapRows = (rows) => rows.map(r => [r.distinct_id, r.landing_page])

      // 10-second timeout Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('seo_revenue_landing_pages pipe read timed out')), 10000)
      })

      try {
        const phRows = await Promise.race([
          readTb('seo_revenue_landing_pages', params, sql, 'seo-revenue-landing-pages', mapRows),
          timeoutPromise
        ])

        if (phRows && Array.isArray(phRows)) {
          for (const row of phRows) {
            if (row && row[0] && row[1]) {
              visitorLandingPages[row[0]] = normalizePath(row[1])
            }
          }
        }
      } catch (phErr) {
        // Fail-closed: under the test-only TINYBIRD_FORCE_READ, a dispatch failure
        // must NOT be swallowed into a degraded 200 — propagate so the route 500s
        // (the sessions/alerts fail-closed contract). This inner catch is unique to
        // seo-revenue (graceful landing-lookup degradation); without this guard it
        // would silently absorb the FORCE_READ signal. Flag off (production): a
        // landing-lookup timeout/error still degrades to the 'unknown' bucket exactly
        // as before.
        if (process.env.TINYBIRD_FORCE_READ === 'true') throw phErr
        landingLookupFailed = true
        console.error('[SEO Revenue] Tinybird seo_revenue_landing_pages read failed or timed out:', phErr.message)
      }
    }

    // Aggregate SourceTrack conversions and revenue by normalized page path
    // Default unmatched pageviews to 'unknown'
    const sourceTrackPagesMap = {}
    for (const distinctId of uniqueVisitorIds) {
      const pagePath = visitorLandingPages[distinctId] || 'unknown'
      const stats = conversionsByVisitor[distinctId]

      if (!sourceTrackPagesMap[pagePath]) {
        sourceTrackPagesMap[pagePath] = { conversions: 0, revenue: 0 }
      }
      sourceTrackPagesMap[pagePath].conversions += stats.count
      sourceTrackPagesMap[pagePath].revenue += stats.revenue
    }

    // Observability: surface revenue that landed in the 'unknown' bucket, and
    // distinguish the two causes. Signal only — does NOT change any attribution
    // numbers (the bucketing above is unchanged).
    if (uniqueVisitorIds.length > 0) {
      const unknownBucket = sourceTrackPagesMap['unknown'] || { conversions: 0, revenue: 0 }
      const resolvedVisitors = Object.keys(visitorLandingPages).length
      if (landingLookupFailed) {
        // Lookup broke (timeout / query error) → unknown is a data-quality failure.
        console.error('[SEO Revenue] gsc_landing_lookup_failed ' + JSON.stringify({
          site: getLogHash(siteKey),
          reason: 'gsc_landing_lookup_failed',
          organic_visitors: uniqueVisitorIds.length,
          resolved_visitors: resolvedVisitors,
          unknown_conversions: unknownBucket.conversions,
          unknown_revenue: unknownBucket.revenue
        }))
      } else if (unknownBucket.conversions > 0) {
        // Lookup succeeded but some visitors have no resolvable organic landing
        // pageview — genuinely unknown, not a failure.
        console.warn('[SEO Revenue] gsc_landing_no_match ' + JSON.stringify({
          site: getLogHash(siteKey),
          reason: 'gsc_landing_no_match',
          organic_visitors: uniqueVisitorIds.length,
          resolved_visitors: resolvedVisitors,
          unknown_conversions: unknownBucket.conversions,
          unknown_revenue: unknownBucket.revenue
        }))
      }
    }

    // 4. Fetch GSC daily performance performance rows from Supabase cache
    let gscPerformanceRows = []
    if (gscConnected && gscPropertySelected && propertyUrl) {
      try {
        const { data } = await supabase
          .from('gsc_performance_daily')
          .select('page_path, query, clicks, impressions, position')
          .eq('site_key', siteKey)
          .eq('property_url', propertyUrl)
          .gte('date', from)
          .lte('date', to)

        gscPerformanceRows = data || []
      } catch (dbErr) {
        console.error('[SEO Revenue] GSC performance lookup failed:', dbErr.message)
      }
    }

    // Group GSC daily performance rows:
    // pagePath -> { clicks, impressions, queriesMap: { query -> { clicks, impressions, sumPositionImpressions } } }
    const gscPagesMap = {}
    let totalGscClicks = 0

    for (const row of gscPerformanceRows) {
      const pagePath = row.page_path
      const query = row.query || '(not provided)'
      const clicks = row.clicks || 0
      const impressions = row.impressions || 0
      const position = row.position || 0

      totalGscClicks += clicks

      if (!gscPagesMap[pagePath]) {
        gscPagesMap[pagePath] = { clicks: 0, impressions: 0, queriesMap: {} }
      }

      gscPagesMap[pagePath].clicks += clicks
      gscPagesMap[pagePath].impressions += impressions

      if (!gscPagesMap[pagePath].queriesMap[query]) {
        gscPagesMap[pagePath].queriesMap[query] = { clicks: 0, impressions: 0, sumPositionImpressions: 0 }
      }
      gscPagesMap[pagePath].queriesMap[query].clicks += clicks
      gscPagesMap[pagePath].queriesMap[query].impressions += impressions
      gscPagesMap[pagePath].queriesMap[query].sumPositionImpressions += (position * impressions)
    }

    // 5. Build Landing Pages Table and distribute revenue to associated queries
    const landingPagesList = []
    const queriesMapGlobal = {}

    // Combine paths from both maps
    const allPaths = new Set([
      ...Object.keys(sourceTrackPagesMap),
      ...Object.keys(gscPagesMap)
    ])

    for (const path of allPaths) {
      const stStats = sourceTrackPagesMap[path] || { conversions: 0, revenue: 0 }
      const gscStats = gscPagesMap[path] || { clicks: 0, impressions: 0, queriesMap: {} }

      const pageConversions = stStats.conversions
      const pageRevenue = stStats.revenue
      const pageClicks = gscStats.clicks
      const pageImpressions = gscStats.impressions

      const pageItem = {
        page_path: path,
        conversions: pageConversions,
        revenue: pageRevenue,
        clicks: pageClicks,
        impressions: pageImpressions,
        queries: []
      }

      landingPagesList.push(pageItem)

      // Associated Queries for this page path
      const queriesEntries = Object.entries(gscStats.queriesMap)

      for (const [queryText, qStats] of queriesEntries) {
        // click share allocation logic
        const clickShare = pageClicks > 0 ? (qStats.clicks / pageClicks) : 0
        const estimatedRevenue = clickShare * pageRevenue
        const estimatedConversions = clickShare * pageConversions

        pageItem.queries.push({
          query: queryText,
          clicks: qStats.clicks,
          impressions: qStats.impressions,
          ctr: qStats.impressions > 0 ? (qStats.clicks / qStats.impressions) : 0,
          position: qStats.impressions > 0 ? (qStats.sumPositionImpressions / qStats.impressions) : 0,
          estimated_revenue: estimatedRevenue,
          estimated_conversions: estimatedConversions
        })

        // Accumulate in global query stats
        if (!queriesMapGlobal[queryText]) {
          queriesMapGlobal[queryText] = { clicks: 0, impressions: 0, sumPositionImpressions: 0, estimatedRevenue: 0, estimatedConversions: 0 }
        }
        queriesMapGlobal[queryText].clicks += qStats.clicks
        queriesMapGlobal[queryText].impressions += qStats.impressions
        queriesMapGlobal[queryText].sumPositionImpressions += qStats.sumPositionImpressions
        queriesMapGlobal[queryText].estimatedRevenue += estimatedRevenue
        queriesMapGlobal[queryText].estimatedConversions += estimatedConversions
      }

      // Sort page queries by clicks descending, then estimated revenue descending
      pageItem.queries.sort((a, b) => (b.clicks - a.clicks) || (b.estimated_revenue - a.estimated_revenue))
    }

    // Sort landing pages: organic revenue descending, conversions descending, clicks descending
    landingPagesList.sort((a, b) => (b.revenue - a.revenue) || (b.conversions - a.conversions) || (b.clicks - a.clicks))

    // Build Global Queries list
    const queriesListGlobal = Object.entries(queriesMapGlobal).map(([queryText, qStats]) => ({
      query: queryText,
      clicks: qStats.clicks,
      impressions: qStats.impressions,
      ctr: qStats.impressions > 0 ? (qStats.clicks / qStats.impressions) : 0,
      position: qStats.impressions > 0 ? (qStats.sumPositionImpressions / qStats.impressions) : 0,
      estimated_revenue: qStats.estimatedRevenue,
      estimated_conversions: qStats.estimatedConversions
    }))

    // Sort global queries by clicks descending, then estimated revenue descending
    queriesListGlobal.sort((a, b) => (b.clicks - a.clicks) || (b.estimated_revenue - a.estimated_revenue))

    res.json({
      success: true,
      gsc_connected: gscConnected,
      gsc_property_selected: gscPropertySelected,
      property_url: propertyUrl,
      summary: {
        organic_conversions: totalOrganicConversions,
        organic_revenue: totalOrganicRevenue,
        gsc_clicks: totalGscClicks
      },
      landing_pages: landingPagesList,
      queries: queriesListGlobal
    })
  } catch (err) {
    console.error('[SEO Revenue Report] Failed:', err.message)
    res.status(500).json({ success: false, error: 'Failed to generate SEO revenue allocation report' })
  }
})

export { router as seoRevenueRouter }
