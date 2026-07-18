import { Router } from 'express'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { getSupabase as getSupabaseAdmin } from '../lib/supabase.js'
import { esc, isValidTimezone, getLocalDateString, getPaddedUtcDateRange, getNow, cappedRate } from '../lib/utils.js'
import { channelFromEvent } from '../lib/channel-classifier.js'
import { getSetupDiagnostics } from '../lib/setup-doctor.js'
import { classifyConversionType } from '../lib/conversion-classifier.js'
import { normalizeSource } from '../lib/source-normalizer.js'



const router = Router()

// ── Tinybird read seam (Grade B dashboard cutover) — mirrors analytics.js/seo-revenue.js.
// Unit tests inject stubs for the two read backends; production uses the real imports.
let _queryTinybirdPipe = queryTinybirdPipe
export function __setDashboardReadDeps ({ queryTinybird } = {}) {
  if (queryTinybird) _queryTinybirdPipe = queryTinybird
}
export function __resetDashboardReadDeps () {
  _queryTinybirdPipe = queryTinybirdPipe
}
// Tinybird-first read: null (flag off / error) -> HogQL fallback; the pipe's NAMED rows are
// remapped to the HogQL POSITIONAL shape (mapRows) so every downstream consumer is
// byte-identical. Fail-closed under the test-only TINYBIRD_FORCE_READ. Tenant isolation:
// pipes are called with the authenticated site_id (req.site.id), never client-supplied.
async function readTb (pipeName, params, hogSql, hogName, mapRows) {
  const tb = await _queryTinybirdPipe(pipeName, params)
  if (tb !== null) return mapRows(tb)
  // D1b: the HogQL fallback is DELETED — Tinybird is the SOLE read path for this reader. PostHog is a
  // dead store; the old fallback served zeros (§6). A null means the DEPLOYED pipe is not serving ->
  // throw loud (500) instead of a silent dead-store read. FIX THE PIPE, do not restore the read. The
  // queryHogQL import/seam stays inert (the injectable cutover tests force the null via it); D3 removes it.
  throw new Error(`[tinybird-force-read] ${pipeName} returned null — FIX THE PIPE, do not restore the read`)
}
// Under the test-only TINYBIRD_FORCE_READ, a route's graceful catch would otherwise swallow
// the fail-closed throw into a 200 with empty data. This makes the failure visible (500).
// Flag OFF (production) → returns false, so the existing graceful path is byte-identical.
function forceReadFailure (res) {
  if (process.env.TINYBIRD_FORCE_READ !== 'true') return false
  res.status(500).json({ success: false, error: 'tinybird-force-read: dispatch path not exercised' })
  return true
}

const AI_SOURCE_PATTERNS = ['chatgpt', 'claude', 'perplexity', 'gemini', 'grok', 'copilot', 'deepseek', 'meta ai', 'you.com', 'bing ai', 'bard', 'mistral']
function isAISource(source) {
  if (!source) return false
  const s = source.toLowerCase()
  return AI_SOURCE_PATTERNS.some(p => s.includes(p))
}

router.get('/overview', validateSiteKey, async (req, res) => {
  try {
    const posthogSiteId = String(req.site.id)
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90)
    const tz = isValidTimezone(req.site?.timezone) ? req.site.timezone : 'UTC'

    // Compute local date boundaries
    const now = getNow(req)
    const localDateTo = getLocalDateString(now, tz)
    const localDateFrom = getLocalDateString(new Date(now.getTime() - days * 86400000), tz)
    const localPrevDateFrom = getLocalDateString(new Date(now.getTime() - days * 2 * 86400000), tz)
    const localPrevDateTo = getLocalDateString(new Date(now.getTime() - days * 86400000), tz)

    // Compute padded UTC boundaries for Supabase index querying (±1 day)
    const currentPadded = getPaddedUtcDateRange(localDateFrom, localDateTo)
    const priorPadded = getPaddedUtcDateRange(localPrevDateFrom, localPrevDateTo)

    const supabase = getSupabaseAdmin()

    // 2 Supabase + 4 PostHog in parallel; bounce_rate runs after (separate await)
    const [
      { data: acRows },
      { data: acRowsPrior },
      installRows,
      alertRows,
      stageRows,
      topPagesRows
    ] = await Promise.all([
      supabase
        .from('attributed_conversions')
        .select('first_touch_source, first_touch_channel, last_touch_channel, first_touch_campaign, conversion_value, conversion_type, conversion_date, status, touchpoint_count, conversion_timestamp, distinct_id, anonymous_id')
        .eq('site_id', req.site.id)
        .gte('conversion_date', currentPadded.from)
        .lte('conversion_date', currentPadded.to),
      supabase
        .from('attributed_conversions')
        .select('first_touch_source, first_touch_channel, last_touch_channel, conversion_value, conversion_type, status, conversion_date, conversion_timestamp, distinct_id, anonymous_id')
        .eq('site_id', req.site.id)
        .gte('conversion_date', priorPadded.from)
        .lte('conversion_date', priorPadded.to),
      // :62 dash_install → integ_install pipe (VERIFIED exact-SQL match: event_type,
      // timestamp, page_url; same WHERE any-event, ORDER BY timestamp DESC, LIMIT 1).
      readTb('integ_install', { site_id: posthogSiteId }, `
        SELECT event, timestamp, properties.page_url AS page_url
        FROM events
        WHERE properties.site_id = '${esc(posthogSiteId)}'
        ORDER BY timestamp DESC
        LIMIT 1
      `, 'dash_install', tb => tb.map(r => [r.event_type, r.timestamp, r.page_url])),
      readTb('dash_alerts', { site_id: posthogSiteId }, `
        SELECT
          SUM(CASE WHEN timestamp >= now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS this_week,
          SUM(CASE WHEN timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS last_week,
          countIf(timestamp >= now() - INTERVAL 1 DAY) AS count_day,
          countIf(timestamp >= now() - INTERVAL 1 HOUR) AS count_hour,
          MAX(timestamp) AS last_event
        FROM events
        WHERE properties.site_id = '${esc(posthogSiteId)}'
          AND event = '$pageview'
      `, 'dash_alerts', tb => tb.map(r => [r.this_week, r.last_week, r.count_day, r.count_hour, r.last_event])),
      readTb('dash_stages', { site_id: posthogSiteId, current_from_ts: `${currentPadded.from} 00:00:00`, current_to_ts: `${currentPadded.to} 23:59:59`, local_from_ts: `${localDateFrom} 00:00:00`, local_to_ts: `${localDateTo} 23:59:59`, tz }, `
        SELECT
          properties.conversion_type AS stage,
          count() AS count,
          SUM(toFloatOrZero(toString(properties.conversion_value))) AS revenue
        FROM events
        WHERE properties.site_id = '${esc(posthogSiteId)}'
          AND event = '$conversion'
          AND properties.ingestion_method = 'offline'
          AND properties.conversion_type IN ('lead_created', 'qualified', 'opportunity', 'closed_won')
          AND timestamp >= toDateTime('${currentPadded.from} 00:00:00')
          AND timestamp <= toDateTime('${currentPadded.to} 23:59:59')
          AND toTimeZone(timestamp, '${esc(tz)}') >= toDateTime('${localDateFrom} 00:00:00')
          AND toTimeZone(timestamp, '${esc(tz)}') <= toDateTime('${localDateTo} 23:59:59')
        GROUP BY stage
        ORDER BY count DESC
        LIMIT 100
      `, 'dash_stages', tb => tb.map(r => [r.stage, r.count, r.revenue])),
      readTb('dash_top_pages', { site_id: posthogSiteId, current_from_ts: `${currentPadded.from} 00:00:00`, current_to_ts: `${currentPadded.to} 23:59:59`, local_from_ts: `${localDateFrom} 00:00:00`, local_to_ts: `${localDateTo} 23:59:59`, tz }, `
        SELECT
          properties.page_url AS page_url,
          count() AS count
        FROM events
        WHERE properties.site_id = '${esc(posthogSiteId)}'
          AND event = '$pageview'
          AND timestamp >= toDateTime('${currentPadded.from} 00:00:00')
          AND timestamp <= toDateTime('${currentPadded.to} 23:59:59')
          AND toTimeZone(timestamp, '${esc(tz)}') >= toDateTime('${localDateFrom} 00:00:00')
          AND toTimeZone(timestamp, '${esc(tz)}') <= toDateTime('${localDateTo} 23:59:59')
        GROUP BY page_url
        ORDER BY count DESC
        LIMIT 500
      `, 'dash_top_pages', tb => tb.map(r => [r.page_url, r.count]))
    ])

    const rows = acRows || []
    const priorRows = acRowsPrior || []

    // ── Aggregate current period from Supabase rows ────────────────────────
    const sourceMap = {}
    const campaignMap = {}
    const revTrendMap = {}
    const channelTrendMap = {}
    const aiSourceMap = {}
    const aiTrendMap = {}
    const convTypeMap = {}

    let totalRevenue = 0
    let totalConversions = 0
    let totalCustomers = 0
    let totalAIRevenue = 0
    let sqlCount = 0
    let ftNonDirectRevenue = 0
    let ltNonDirectRevenue = 0
    // DISTINCT converters by canonical visitor identity (distinct_id == anonymous_id),
    // the same key the denominator (totalSessions = count(DISTINCT distinct_id)) uses.
    // Rate numerators must count people, not raw rows, or repeat conversions push >100%.
    const converters = new Set()
    const leadConverters = new Set()
    const customerConverters = new Set()

    for (const r of rows) {
      const localDate = getLocalDateString(new Date(r.conversion_timestamp || r.conversion_date), tz)
      if (localDate < localDateFrom || localDate > localDateTo) {
        continue
      }

      const val = Number(r.conversion_value) || 0
      const source = r.first_touch_source || 'Direct'
      const campaign = r.first_touch_campaign || null
      const ftChannel = r.first_touch_channel || 'Direct'
      const ltChannel = r.last_touch_channel || 'Direct'
      const ai = isAISource(r.first_touch_source)

      totalRevenue += val
      totalConversions++

      const typeClass = classifyConversionType(r.conversion_type)
      if (typeClass === 'customer') {
        totalCustomers++
      }

      // Leads counted as DISTINCT lead identities (people), not raw conversion
      // rows — unifies the unit with the Leads page and dedupes repeat submitters.
      const convId = r.distinct_id || r.anonymous_id
      if (convId) {
        converters.add(convId)
        if (typeClass === 'lead') leadConverters.add(convId)
        else if (typeClass === 'customer') customerConverters.add(convId)
      }

      if (r.status === 'sql') sqlCount++
      if (ftChannel !== 'Direct') ftNonDirectRevenue += val
      if (ltChannel !== 'Direct') ltNonDirectRevenue += val

      // source breakdown
      const normSource = normalizeSource(source).name
      if (!sourceMap[normSource]) sourceMap[normSource] = { dim_value: normSource, revenue: 0, conversions: 0, sessions: 0, rpv: 0 }
      sourceMap[normSource].revenue += val
      sourceMap[normSource].conversions++

      // campaign breakdown
      if (campaign) {
        if (!campaignMap[campaign]) campaignMap[campaign] = { dim_value: campaign, revenue: 0, conversions: 0 }
        campaignMap[campaign].revenue += val
        campaignMap[campaign].conversions++
      }

      // revenue trend by date
      if (localDate) {
        if (!revTrendMap[localDate]) revTrendMap[localDate] = { dim_value: localDate, revenue: 0 }
        revTrendMap[localDate].revenue += val
      }

      // conversions trend by date — ALL attributed conversions, not just leads
      // (a customer-only site has no leads, so a leads-only trend read empty).
      if (localDate) {
        if (!channelTrendMap[localDate]) channelTrendMap[localDate] = { dim_value: localDate, conversions: 0 }
        channelTrendMap[localDate].conversions++
      }

      // AI source breakdown
      if (ai) {
        totalAIRevenue += val
        const aiSrc = r.first_touch_source
        if (!aiSourceMap[aiSrc]) aiSourceMap[aiSrc] = { dim_value: aiSrc, ai_revenue: 0, ai_conversions: 0, ai_leads: 0 }
        aiSourceMap[aiSrc].ai_revenue += val
        aiSourceMap[aiSrc].ai_conversions++
        aiSourceMap[aiSrc].ai_leads++
        if (localDate) {
          if (!aiTrendMap[localDate]) aiTrendMap[localDate] = { dim_value: localDate, ai_revenue: 0 }
          aiTrendMap[localDate].ai_revenue += val
        }
      }

      // conversion types
      const ct = r.conversion_type || 'untyped'
      if (!convTypeMap[ct]) convTypeMap[ct] = { count: 0, revenue: 0 }
      convTypeMap[ct].count++
      convTypeMap[ct].revenue += val
    }

    // ── Attribution model totals ────────────────────────────────────────────
    // first/last/linear/u_shaped all share the same total (different distribution per source)
    // Non-direct models exclude conversions whose respective touch was Direct or null
    const modelRevenues = {
      first_touch: totalRevenue,
      last_touch: totalRevenue,
      first_touch_non_direct: ftNonDirectRevenue,
      last_touch_non_direct: ltNonDirectRevenue,
      ai_platforms: totalAIRevenue,
      linear: totalRevenue,
      u_shaped: totalRevenue
    }

    // ── Build sorted result arrays ──────────────────────────────────────────
    const sources = Object.values(sourceMap)
      .map(s => ({ ...s, rpv: s.conversions > 0 ? parseFloat((s.revenue / s.conversions).toFixed(2)) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)

    const campaigns = Object.values(campaignMap).sort((a, b) => b.revenue - a.revenue)
    const revenueTrend = Object.values(revTrendMap).sort((a, b) => a.dim_value.localeCompare(b.dim_value))
    const channelTrend = Object.values(channelTrendMap).sort((a, b) => a.dim_value.localeCompare(b.dim_value))
    const aiSources = Object.values(aiSourceMap).sort((a, b) => b.ai_revenue - a.ai_revenue)
    const aiTrend = Object.values(aiTrendMap).sort((a, b) => a.dim_value.localeCompare(b.dim_value))

    // ── Process and Normalize Top Pages ─────────────────────────────────────
    const topPagesMap = {}
    for (const row of (topPagesRows || [])) {
      const [pageUrl, count] = row
      const path = getPathOnly(pageUrl)
      topPagesMap[path] = (topPagesMap[path] || 0) + (Number(count) || 0)
    }

    const topPages = Object.entries(topPagesMap)
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 20)

    // ── Aggregate prior period ──────────────────────────────────────────────
    let prevRevenue = 0, prevCustomers = 0, prevConversions = 0, prevAIRevenue = 0
    // Leads counted as DISTINCT lead identities (same unit as the current period
    // and the Leads page), so the delta compares like-for-like, not rows-vs-people.
    const prevLeadConverters = new Set()
    for (const r of priorRows) {
      const localDate = getLocalDateString(new Date(r.conversion_timestamp || r.conversion_date), tz)
      if (localDate < localPrevDateFrom || localDate > localPrevDateTo) {
        continue
      }
      const val = Number(r.conversion_value) || 0
      prevRevenue += val
      prevConversions++

      const typeClass = classifyConversionType(r.conversion_type)
      if (typeClass === 'lead') {
        const convId = r.distinct_id || r.anonymous_id
        if (convId) prevLeadConverters.add(convId)
      } else if (typeClass === 'customer') {
        prevCustomers++
      }

      if (isAISource(r.first_touch_source)) prevAIRevenue += val
    }

    // ── KPIs ────────────────────────────────────────────────────────────────
    const sqlPercent = totalConversions > 0 ? parseFloat((sqlCount / totalConversions * 100).toFixed(1)) : 0
    const avgValue = totalCustomers > 0 ? parseFloat((totalRevenue / totalCustomers).toFixed(2)) : 0
    const aiShareTotal = totalRevenue > 0 ? parseFloat(((totalAIRevenue / totalRevenue) * 100).toFixed(2)) : 0
    // convRate uses totalSessions from PostHog bounce_rate query (populated below)
    // bestRPV uses revenue/conversions per source (no per-source session data available)
    const bestRPV = sources.length > 0
      ? sources.reduce((best, r) => (r.rpv || 0) > (best.rpv || 0) ? r : best, { rpv: 0, dim_value: '—' })
      : { rpv: 0, dim_value: '—' }

    // ── Bounce rate + sessions (single PostHog call — same subquery) ─────────
    // Returns [bounce_rate_pct, total_unique_visitors] in one round-trip
    const bounceRateSql = `
      SELECT countIf(pv_count = 1) * 100.0 / count(), count() AS total_sessions
      FROM (
        SELECT distinct_id, count() AS pv_count
        FROM events
        WHERE event = '$pageview'
          AND properties.site_id = '${posthogSiteId}'
          AND timestamp >= toDateTime('${currentPadded.from} 00:00:00')
          AND timestamp <= toDateTime('${currentPadded.to} 23:59:59')
          AND toTimeZone(timestamp, '${esc(tz)}') >= toDateTime('${localDateFrom} 00:00:00')
          AND toTimeZone(timestamp, '${esc(tz)}') <= toDateTime('${localDateTo} 23:59:59')
        GROUP BY distinct_id
      )
    `
    let bounceRate = null
    let totalSessions = 0
    try {
      const br = await readTb(
        'dashboard_bounce_rate',
        { site_id: posthogSiteId, current_from_ts: `${currentPadded.from} 00:00:00`, current_to_ts: `${currentPadded.to} 23:59:59`, local_from_ts: `${localDateFrom} 00:00:00`, local_to_ts: `${localDateTo} 23:59:59`, tz },
        bounceRateSql, 'bounce_rate',
        tb => tb.map(r => [r.bounce_rate_pct, r.total_sessions])
      )
      bounceRate = br?.[0]?.[0] ? parseFloat(Number(br[0][0]).toFixed(1)) : null
      totalSessions = Number(br?.[0]?.[1]) || 0
    } catch (_e) {
      // Fail-closed: don't swallow the FORCE_READ signal into a null bounce rate.
      if (process.env.TINYBIRD_FORCE_READ === 'true') throw _e
    }

    // ── Install status ──────────────────────────────────────────────────────
    let installData = null
    if (installRows?.length > 0) {
      const [event, timestamp, pageUrl] = installRows[0]
      let domain = null
      try { if (pageUrl) domain = new URL(pageUrl).hostname } catch { /* */ }
      installData = { status: 'verified', last_event: timestamp, last_event_type: event, domain }
    } else {
      installData = { status: 'not_installed', last_event: null, domain: null }
    }

    // ── Tracker health ──────────────────────────────────────────────────────
    let healthStatus = 'never_seen'
    let countDay = 0, countHour = 0
    if (alertRows?.length > 0) {
      const [_thisWeek, _lastWeek, cd, ch, lastEvt] = alertRows[0]
      countDay = Number(cd) || 0
      countHour = Number(ch) || 0
      if (cd > 0) healthStatus = 'healthy'
      else if (lastEvt) healthStatus = 'silent_24h'
    }

    const alerts = []
    if (healthStatus === 'silent_24h') {
      alerts.push({ id: 'silent', metric: 'Tracking', message: 'No events in the last 24 hours', severity: 'high', suggested_action: 'Check your snippet is still live on your site.' })
    }

    // ── Pipeline stages (offline CRM — from PostHog) ────────────────────────
    const pipelineStages = {}
    for (const [stage, count, revenue] of (stageRows || [])) {
      pipelineStages[stage] = { count: Number(count) || 0, revenue: Number(revenue) || 0 }
    }

    return res.status(200).json({
      success: true,
      data: {
        date_from: localDateFrom,
        date_to: localDateTo,
        business_type: req.site.business_type || 'saas',
        kpis: {
          revenue: totalRevenue,
          revenue_prev: prevRevenue,
          conversions: totalConversions,
          conversions_prev: prevConversions,
          sessions: totalSessions,
          bounce_rate: bounceRate,
          leads: leadConverters.size,
          leads_prev: prevLeadConverters.size,
          customers: totalCustomers,
          customers_prev: prevCustomers,
          sql_percent: sqlPercent,
          ai_revenue: totalAIRevenue,
          ai_revenue_prev: prevAIRevenue,
          ai_revenue_share: aiShareTotal,
          conversion_rate: parseFloat(cappedRate(converters.size, totalSessions).toFixed(2)),
          lead_conversion_rate: parseFloat(cappedRate(leadConverters.size, totalSessions).toFixed(2)),
          customer_conversion_rate: parseFloat(cappedRate(customerConverters.size, totalSessions).toFixed(2)),
          avg_value: avgValue,
          best_rpv_channel: bestRPV.dim_value,
          best_rpv: bestRPV.rpv
        },
        models: modelRevenues,
        ai_sources: aiSources.slice(0, 5),
        ai_trend: aiTrend,
        sources: sources.slice(0, 10),
        landing_pages: [], // NOTE: Landing pages & Exit Pages are intentionally deferred because true visitor session telemetry is not persisted.
        top_pages: topPages,
        campaigns: campaigns.slice(0, 5),
        channel_trend: channelTrend,
        revenue_trend: revenueTrend,
        install: installData,
        health: { status: healthStatus, count_day: countDay, count_hour: countHour },
        alerts,
        conversion_types: convTypeMap,
        pipeline_stages: pipelineStages
      },
      error: null
    })
  } catch (_err) {
    if (forceReadFailure(res)) return
    console.error('[dashboard/overview] query failed:', _err?.message || _err)
    return res.status(200).json({
      success: true,
      data: {
        date_from: null,
        date_to: null,
        business_type: req.site?.business_type || 'saas',
        analytics_unavailable: true,
        kpis: {
          revenue: 0, revenue_prev: 0,
          conversions: 0, conversions_prev: 0,
          sessions: 0, bounce_rate: null,
          leads: 0, sql_percent: 0, leads_prev: 0,
          ai_revenue: 0, ai_revenue_prev: 0, ai_revenue_share: 0,
          conversion_rate: 0, avg_value: null,
          best_rpv_channel: null, best_rpv: 0
        },
        models: {},
        ai_sources: [],
        ai_trend: [],
        sources: [],
        landing_pages: [], // NOTE: Landing pages & Exit Pages are intentionally deferred because true visitor session telemetry is not persisted.
        top_pages: [],
        campaigns: [],
        channel_trend: [],
        revenue_trend: [],
        install: { status: 'not_installed', last_event: null, domain: null },
        health: { status: 'never_seen', count_day: 0, count_hour: 0 },
        alerts: [],
        conversion_types: {},
        pipeline_stages: {}
      },
      error: null
    })
  }
})

router.get('/cac', validateSiteKey, async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const siteId = req.site.id
    const dateFrom = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const dateTo = date_to || new Date().toISOString().slice(0, 10)

    const supabase = getSupabaseAdmin()

    const [{ data: spendData, error: spendErr }, { data: convData, error: convErr }] = await Promise.all([
      supabase
        .from('campaign_costs')
        .select('campaign_name, spend')
        .eq('site_id', siteId)
        .gte('period_start', dateFrom)
        .lte('period_end', dateTo),
      supabase
        .from('attributed_conversions')
        .select('first_touch_channel, conversion_value')
        .eq('site_id', siteId)
        .gte('conversion_date', dateFrom)
        .lte('conversion_date', dateTo)
    ])

    if (spendErr) throw spendErr
    if (convErr) throw convErr

    // Aggregate spend by campaign_name (treated as channel)
    const spendByChannel = {}
    for (const row of (spendData || [])) {
      const ch = (row.campaign_name || '').trim().toLowerCase()
      if (!ch) continue
      spendByChannel[ch] = (spendByChannel[ch] || 0) + parseFloat(row.spend || 0)
    }

    // Aggregate conversions by first_touch_channel
    const convByChannel = {}
    for (const row of (convData || [])) {
      const ch = (row.first_touch_channel || '').trim().toLowerCase()
      if (!ch) continue
      if (!convByChannel[ch]) convByChannel[ch] = { conversions: 0, totalValue: 0 }
      convByChannel[ch].conversions++
      convByChannel[ch].totalValue += parseFloat(row.conversion_value || 0)
    }

    // Join and calculate CAC / payback
    const results = []
    const allChannels = new Set([...Object.keys(spendByChannel), ...Object.keys(convByChannel)])

    for (const ch of allChannels) {
      const totalSpend = spendByChannel[ch] || null
      const conv = convByChannel[ch] || { conversions: 0, totalValue: 0 }
      const conversions = conv.conversions
      const avgValue = conversions > 0 ? conv.totalValue / conversions : 0

      const cac = (totalSpend != null && conversions > 0) ? totalSpend / conversions : null
      const paybackMonths = (cac != null && avgValue > 0) ? cac / avgValue : null

      results.push({
        channel: ch,
        total_spend: totalSpend != null ? parseFloat(totalSpend.toFixed(2)) : null,
        conversions,
        avg_value: parseFloat(avgValue.toFixed(2)),
        cac: cac != null ? parseFloat(cac.toFixed(2)) : null,
        payback_months: paybackMonths != null ? parseFloat(paybackMonths.toFixed(1)) : null
      })
    }

    results.sort((a, b) => {
      if (a.cac == null && b.cac == null) return 0
      if (a.cac == null) return 1
      if (b.cac == null) return -1
      return a.cac - b.cac
    })

    return res.status(200).json({ success: true, data: results, error: null })
  } catch (_err) {
    console.error('[dashboard/cac] calculation failed:', _err?.message || _err)
    return res.status(200).json({
      success: true,
      data: {
        cac_unavailable: true,
        results: []
      },
      error: null
    })
  }
})

router.get('/live', validateSiteKey, async (req, res) => {
  try {
    const posthogSiteId = String(req.site.id)
    const sql = `SELECT count(DISTINCT distinct_id) FROM events WHERE event = '$pageview' AND properties.site_id = '${posthogSiteId}' AND timestamp >= now() - INTERVAL 5 MINUTE`
    const rows = await readTb('dashboard_live_visitors', { site_id: posthogSiteId }, sql, 'live_visitors', tb => tb.map(r => [r.live_visitors]))
    const count = Number(rows?.[0]?.[0]) || 0
    res.json({ success: true, data: { live_visitors: count } })
  } catch (err) {
    if (forceReadFailure(res)) return
    res.json({ success: true, data: { live_visitors: 0 } })
  }
})

router.get('/tracking-health', validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin()
    // Fresh query to get latest telemetry state without cache lag
    const { data: site, error } = await supabase
      .from('sites')
      .select('id, last_seen_at, domain, onboarding_state')
      .eq('id', req.site.id)
      .single()

    if (error || !site) {
      throw new Error(error?.message || 'Site not found')
    }

    const diagnostics = await getSetupDiagnostics({ site })

    return res.status(200).json({
      success: true,
      data: {
        status: diagnostics.status,
        severity: diagnostics.severity,
        last_seen_at: diagnostics.tracker_install.last_seen_at,
        last_event_name: diagnostics.tracker_install.last_event_name,
        last_event_domain: diagnostics.domain_match.event_domain,
        last_event_url: diagnostics.domain_match.last_event_url,
        registered_domain: diagnostics.domain_match.registered_domain,
        message: diagnostics.message,
        checks: diagnostics.checks,
        ...diagnostics
      },
      error: null
    })
  } catch (e) {
    console.error('[dashboard/tracking-health] failed:', e.message)
    return res.status(200).json({
      success: true,
      data: {
        status: 'unknown',
        severity: 'warning',
        last_seen_at: null,
        last_event_name: null,
        last_event_domain: null,
        last_event_url: null,
        registered_domain: req.site?.domain || null,
        message: 'We could not check tracking health right now.',
        checks: [
          {
            label: 'Tracker events',
            status: 'unknown',
            detail: 'Failed to retrieve telemetry'
          },
          {
            label: 'Domain match',
            status: 'unknown',
            detail: 'Failed to match domain'
          }
        ]
      },
      error: null
    })
  }
})

function getPathOnly(urlStr) {
  if (!urlStr) return '/'
  try {
    const url = new URL(urlStr, 'http://dummy.com')
    return url.pathname || '/'
  } catch (_) {
    return '/'
  }
}

function getDomainOnly(referrerStr) {
  if (!referrerStr) return null
  try {
    const url = new URL(referrerStr)
    return url.hostname.replace(/^www\./i, '')
  } catch (_) {
    try {
      return referrerStr.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '')
    } catch (__) {
      return null
    }
  }
}

router.get('/recent-activity', validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const posthogSiteId = String(req.site.id)
    const sql = `
      SELECT
        event,
        timestamp,
        properties.page_url AS page_url,
        properties.referrer AS referrer,
        properties.utm_medium AS utm_medium,
        properties.utm_source AS utm_source,
        properties.first_touch_source AS first_touch_source,
        properties.first_touch_medium AS first_touch_medium,
        properties.first_touch_campaign AS first_touch_campaign,
        properties.gclid AS gclid,
        properties.fbclid AS fbclid,
        properties.msclkid AS msclkid,
        properties.ttclid AS ttclid,
        properties.li_fat_id AS li_fat_id,
        properties.ai_source AS ai_source,
        properties.conversion_value AS conversion_value,
        properties.user_id AS user_id,
        properties.anonymous_id AS anonymous_id,
        distinct_id
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND timestamp >= now() - INTERVAL 30 MINUTE
      ORDER BY timestamp DESC
      LIMIT 1000
    `

    const rows = await readTb('dashboard_recent_activity_events', { site_id: posthogSiteId }, sql, 'recent_activity_events', tb => tb.map(r => [
      r.event_type, r.timestamp, r.page_url, r.referrer, r.utm_medium, r.utm_source,
      r.first_touch_source, r.first_touch_medium, r.first_touch_campaign, r.gclid, r.fbclid,
      r.msclkid, r.ttclid, r.li_fat_id, r.ai_source, r.conversion_value, r.user_id, r.anonymous_id, r.distinct_id
    ]))

    let pageviewsCount = 0
    let conversionsCount = 0
    const uniqueVisitors = new Set()
    const referrersCount = {}
    const pagesCount = {}
    const channelsCount = {}
    const eventsList = []

    for (const row of (rows || [])) {
      const [
        event,
        timestamp,
        pageUrl,
        referrer,
        utmMedium,
        utmSource,
        firstTouchSource,
        firstTouchMedium,
        firstTouchCampaign,
        gclid,
        fbclid,
        msclkid,
        ttclid,
        liFatId,
        aiSource,
        conversionValue,
        userId,
        anonymousId,
        distinctId
      ] = row

      const visitorId = userId || anonymousId
      if (visitorId) {
        uniqueVisitors.add(visitorId)
      }

      if (event === '$pageview') {
        pageviewsCount++
      } else if (event === '$conversion') {
        conversionsCount++
      }

      const normPath = getPathOnly(pageUrl)
      const normReferrer = getDomainOnly(referrer)

      const channel = channelFromEvent({
        utm_medium: utmMedium,
        utm_source: utmSource,
        referrer: referrer,
        page_url: pageUrl,
        ai_source: aiSource,
        gclid,
        fbclid,
        msclkid,
        ttclid,
        li_fat_id: liFatId
      })

      if (event === '$pageview' && normReferrer) {
        referrersCount[normReferrer] = (referrersCount[normReferrer] || 0) + 1
      }

      if (event === '$pageview' && normPath) {
        pagesCount[normPath] = (pagesCount[normPath] || 0) + 1
      }

      if (channel) {
        channelsCount[channel] = (channelsCount[channel] || 0) + 1
      }

      eventsList.push({
        event,
        timestamp,
        page_path: normPath,
        referrer_domain: normReferrer,
        channel,
        conversion_value: conversionValue ? Number(conversionValue) || 0 : null,
        visitor_id: visitorId || null
      })
    }

    const topReferrers = Object.entries(referrersCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const topPages = Object.entries(pagesCount)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const topChannels = Object.entries(channelsCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return res.status(200).json({
      success: true,
      data: {
        pageviews: pageviewsCount,
        visitors: uniqueVisitors.size,
        conversions: conversionsCount,
        events: eventsList.slice(0, 20),
        top_referrers: topReferrers,
        top_pages: topPages,
        top_channels: topChannels
      },
      error: null
    })
  } catch (err) {
    if (forceReadFailure(res)) return
    console.error('[dashboard/recent-activity] failed:', err.message)
    return res.status(200).json({
      success: true,
      data: {
        pageviews: 0,
        visitors: 0,
        conversions: 0,
        events: [],
        top_referrers: [],
        top_pages: [],
        top_channels: []
      },
      error: null
    })
  }
})

export { router as dashboardRouter }
