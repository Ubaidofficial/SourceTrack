import express from 'express'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { getSupabase } from '../lib/supabase.js'
import { redactPiiFromUrl, redactPiiFromObject, isGoogleSource } from '../lib/utils.js'
import { requireFeature, isSiteStatusBlocked } from '../lib/plan-features.js'
import { claimPageviewUsage } from '../lib/pageview-limits.js'
import {
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit
} from '../middleware/rate-limit.js'

const router = express.Router()

// Known bot/crawler UA patterns — silent drop (return 200 so bots don't retry)
const BOT_UA_PATTERN = /bot|crawl|spider|slurp|mediapartners|adsbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|bingpreview|googleweblight|lighthouse|pagespeed|headlesschrome|phantomjs|selenium|puppeteer|playwright|wget|curl\/|python-requests|axios\/|go-http|java\/|ruby\/|php\/|google-extended|headless/i

// ─── Filter parsing ──────────────────────────────────────────────────────────
// Supports two formats:
//   1. New multi-filter: ?f=Source:google&f=Country:US (repeated f param)
//   2. Legacy single:    ?filter_type=Source&filter_value=google
// Returns: [{ type, value }] — empty if neither present.
function parseFilters(req) {
  const out = []
  const f = req.query.f
  if (f) {
    const arr = Array.isArray(f) ? f : [f]
    for (const item of arr) {
      if (typeof item !== 'string') continue
      const idx = item.indexOf(':')
      if (idx === -1) continue
      const type = item.slice(0, idx)
      const value = item.slice(idx + 1)
      if (type && value) out.push({ type, value })
    }
  }
  // Legacy single-filter support
  if (req.query.filter_type && req.query.filter_value) {
    out.push({ type: String(req.query.filter_type), value: String(req.query.filter_value) })
  }
  return out
}

// Apply a list of filters to a Supabase pageviews query.
function applyPageviewFilters(query, filters) {
  for (const { type, value } of filters) {
    if (type === 'Page' || type === 'Entry' || type === 'Exit')
      query = query.ilike('url', `%${value}%`)
    else if (type === 'Source')
      query = query.eq('referrer', value)
    else if (type === 'Country')
      query = query.eq('country', value)
    else if (type === 'Device')
      query = query.eq('device', value)
    else if (type === 'Browser')
      query = query.eq('browser', value)
    else if (type === 'OS')
      query = query.eq('os', value)
    else if (type === 'AI Source')
      query = query.eq('ai_source', value)
  }
  return query
}

router.post('/collect',
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit,
  async (req, res) => {
    try {
      const { site_key, url, referrer, utm_source, utm_medium, utm_campaign, device, browser, session_id, duration_seconds, entry_page, exit_page, event_type, event_name, properties } = req.body
      if (!site_key || !url) return res.status(400).json({ error: 'site_key and url required' })

      // Bot filter — silent drop, 200 so crawlers don't retry
      const ua = req.headers['user-agent'] || ''
      if (!ua || BOT_UA_PATTERN.test(ua)) return res.json({ ok: true })

      const supabase = getSupabase()
      // LEGACY ROUTE: select pv_limit for quota enforcement (140G-4)
      // This route (POST /api/analytics/collect) is a legacy Supabase-based ingestion path.
      // Modern tracker uses POST /api/track (PostHog-only). This route is kept for backward
      // compatibility with older tracker installs and will be deprecated in a future session.
      const { data: site } = await supabase.from('sites').select('id, plan, pv_limit, trial_ends_at').eq('site_key', site_key).single()
      if (!site) return res.status(404).json({ error: 'Site not found' })

      if (isSiteStatusBlocked(site)) {
        const msg = site.plan === 'archived'
          ? 'Site archived after 60 days of inactivity. Reactivate from your dashboard.'
          : site.plan === 'trial'
            ? 'Your 14-day trial has ended. Upgrade to continue tracking.'
            : 'Subscription inactive'
        return res.status(402).json({ success: false, data: null, error: msg })
      }

    const sanitizedUrl = redactPiiFromUrl(url)
    const sanitizedReferrer = referrer ? redactPiiFromUrl(referrer) : null
    const sanitizedEntryPage = entry_page ? redactPiiFromUrl(entry_page) : null
    const sanitizedExitPage = exit_page ? redactPiiFromUrl(exit_page) : null
    const sanitizedProperties = properties ? redactPiiFromObject(properties) : {}

    // Handle outbound clicks and custom events
    if (event_type === 'outbound_click' || event_type === 'custom') {
      await supabase.from('custom_events').insert({
        site_id: site.id, event_type, event_name: event_name || event_type,
        url: sanitizedUrl || null, session_id: session_id || null,
        properties: sanitizedProperties || {}, timestamp: new Date().toISOString()
      })
      return res.json({ ok: true })
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || ''
    const parser = new UAParser(ua)
    let country = null
    if (ip) { const geo = geoip.lookup(ip); country = geo?.country || null }
    const serverBrowser = (() => { const n = (parser.getBrowser().name || '').toLowerCase(); if (n.includes('edge')) return 'edge'; if (n.includes('chrome')) return 'chrome'; if (n.includes('firefox')) return 'firefox'; if (n.includes('safari')) return 'safari'; return 'other' })()
    const serverOS = parser.getOS().name || 'unknown'
    const AI_DOMAINS = { 'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'claude.ai': 'Claude', 'perplexity.ai': 'Perplexity', 'gemini.google.com': 'Gemini', 'grok.com': 'Grok', 'copilot.microsoft.com': 'Copilot', 'deepseek.com': 'DeepSeek' }
    let ai_source = null
    if (sanitizedReferrer) { try { const h = new URL(sanitizedReferrer).hostname.replace('www.', ''); ai_source = AI_DOMAINS[h] || null } catch (_e) {} }
    if (duration_seconds > 0 && session_id) {
      await supabase.from('pageviews').update({ duration_seconds }).eq('site_id', site.id).eq('session_id', session_id).eq('url', sanitizedUrl)
      return res.json({ ok: true })
    }
    // Pageview quota claim — 140G-4 (legacy route enforcement).
    // outbound_click and custom events do not reach here (handled in the branch above).
    // Only true pageview inserts consume quota. Fail-open on RPC/DB errors.
    try {
      const pvCheck = await claimPageviewUsage({ id: site.id, plan: site.plan, pv_limit: site.pv_limit })
      if (!pvCheck.allowed) {
        console.warn('[analytics/collect] Pageview limit reached for site', site_key)
        return res.status(402).json({ ok: false, error: 'Monthly pageview limit reached' })
      }
    } catch (pvErr) {
      // Fail open — DB/RPC error must not block legacy tracking
      console.error('[analytics/collect] Pageview limit check failed, failing open:', pvErr?.message)
    }
    await supabase.from('pageviews').insert({ site_id: site.id, url: sanitizedUrl, referrer: sanitizedReferrer || null, utm_source: utm_source || null, utm_medium: utm_medium || null, utm_campaign: utm_campaign || null, country, device: device || parser.getDevice().type || 'desktop', browser: browser || serverBrowser, os: req.body.os || serverOS, session_id: session_id || null, duration_seconds: 0, ai_source, entry_page: sanitizedEntryPage || sanitizedUrl, exit_page: sanitizedExitPage || null, timestamp: new Date().toISOString() })
    // Stamp last_seen_at — used by inactive-account auto-archive (free tier)
    supabase.from('sites').update({ last_seen_at: new Date().toISOString() }).eq('id', site.id).then(() => {}, () => {})
    res.json({ ok: true })
  } catch (err) { console.error('[analytics/collect]', err.message); res.status(500).json({ error: 'Collection failed' }) }
})

router.get('/summary', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = Math.min(parseInt(req.query.days) || 30, 90)
    const fromParam = req.query.from || null
    const toParam = req.query.to || null
    const granularity = ['daily','weekly','monthly'].includes(req.query.granularity) ? req.query.granularity : 'daily'
    const supabase = getSupabase()
    const from = fromParam && toParam
      ? new Date(fromParam).toISOString()
      : new Date(Date.now() - days * 86400000).toISOString()
    const to = fromParam && toParam ? new Date(toParam).toISOString() : null
    const filters = parseFilters(req)

    let query = supabase.from('pageviews')
      .select('url,referrer,utm_source,utm_medium,utm_campaign,country,device,browser,os,session_id,duration_seconds,ai_source,timestamp')
      .eq('site_id', siteId).gte('timestamp', from)
      .order('timestamp', { ascending: false }).limit(10000)
    if (to) query = query.lte('timestamp', to)
    query = applyPageviewFilters(query, filters)

    const { data: rows, error } = await query
    if (error) throw error
    const pv = rows || []
    const uniqueSessions = new Set(pv.map(r => r.session_id).filter(Boolean)).size
    const sessionCounts = {}
    pv.forEach(r => { if (r.session_id) sessionCounts[r.session_id] = (sessionCounts[r.session_id] || 0) + 1 })
    const sessionArr = Object.values(sessionCounts)
    const bounceRate = sessionArr.length > 0 ? (sessionArr.filter(c => c === 1).length / sessionArr.length) * 100 : 0
    const durations = pv.map(r => r.duration_seconds).filter(d => d > 0)
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
    const pageCounts = {}
    pv.forEach(r => { try { const path = new URL(r.url).pathname; pageCounts[path] = (pageCounts[path] || 0) + 1 } catch (_e) {} })
    const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([page, views]) => ({ page, views }))
    function classifySource(row) {
      if (row.ai_source) return `AI: ${row.ai_source}`
      if (row.utm_source) { const m = (row.utm_medium || '').toLowerCase(); if (['cpc','ppc','paid','paid_search'].includes(m)) return 'Paid Search'; if (['email','newsletter'].includes(m)) return 'Email'; return row.utm_source }
      if (row.referrer) { try { const host = new URL(row.referrer).hostname.replace('www.', ''); if (['google.','bing.','yahoo.','duckduckgo.'].some(s => host.includes(s))) return 'Organic Search'; if (['facebook.com','instagram.com','linkedin.com','twitter.com','x.com','tiktok.com'].some(s => host.includes(s))) return 'Organic Social'; return host } catch (_e) {} }
      return 'Direct'
    }
    const sourceCounts = {}
    pv.forEach(r => { const src = classifySource(r); sourceCounts[src] = (sourceCounts[src] || 0) + 1 })
    const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([source, visits]) => ({ source, visits }))
    const aiCounts = {}
    pv.filter(r => r.ai_source).forEach(r => { aiCounts[r.ai_source] = (aiCounts[r.ai_source] || 0) + 1 })
    const aiSources = Object.entries(aiCounts).sort((a, b) => b[1] - a[1]).map(([source, visits]) => ({ source, visits }))
    const deviceCounts = {}
    pv.forEach(r => { if (r.device) deviceCounts[r.device] = (deviceCounts[r.device] || 0) + 1 })
    const countryCounts = {}
    pv.filter(r => r.country).forEach(r => { countryCounts[r.country] = (countryCounts[r.country] || 0) + 1 })
    const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([country, visits]) => ({ country, visits }))

    // ─── Time series — visitors by date (uses session_id first-seen, not pv count)
    const sessionFirstSeen = {}
    pv.forEach(r => {
      if (!r.session_id) return
      const ts = new Date(r.timestamp).getTime()
      if (!sessionFirstSeen[r.session_id] || ts < sessionFirstSeen[r.session_id]) {
        sessionFirstSeen[r.session_id] = ts
      }
    })

    // Bucket helper based on granularity (daily/weekly/monthly).
    function bucket(iso) {
      const d = new Date(iso)
      if (granularity === 'monthly') return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`
      if (granularity === 'weekly') {
        // ISO week: Monday-anchored. Cheap approximation — go back to Monday.
        const day = d.getUTCDay() || 7
        const monday = new Date(d)
        monday.setUTCDate(d.getUTCDate() - (day - 1))
        return monday.toISOString().slice(0, 10)
      }
      return d.toISOString().slice(0, 10)
    }

    const dayVisitorBuckets = {}
    Object.entries(sessionFirstSeen).forEach(([sid, ts]) => {
      const b = bucket(new Date(ts).toISOString())
      dayVisitorBuckets[b] = (dayVisitorBuckets[b] || 0) + 1
    })

    // Page-view count by bucket (kept for backward-compat "trend" field).
    const dayCounts = {}
    pv.forEach(r => {
      if (!r.timestamp) return
      const b = bucket(r.timestamp)
      dayCounts[b] = (dayCounts[b] || 0) + 1
    })
    const trend = Object.entries(dayCounts).sort((a, b) => a[0].localeCompare(b[0])).slice(-90).map(([date, views]) => ({ date, views }))

    // New vs returning
    const fromMs = new Date(from).getTime()
    let newVisitors = 0, returningVisitors = 0
    Object.values(sessionFirstSeen).forEach(firstTs => {
      if (firstTs >= fromMs) newVisitors++
      else returningVisitors++
    })

    // ─── Revenue join from attributed_conversions ────────────────────────────
    const toDate = (to ? to.slice(0,10) : new Date().toISOString().slice(0,10))
    const fromDate = from.slice(0,10)
    let conversions = []
    try {
      const { data: convRows } = await supabase
        .from('attributed_conversions')
        .select('conversion_date, conversion_value, first_touch_source, first_touch_channel')
        .eq('site_id', siteId)
        .gte('conversion_date', fromDate)
        .lte('conversion_date', toDate)
      conversions = convRows || []
    } catch (_e) {
      // attributed_conversions table may be empty for very new sites — fail silently.
    }

    const totalRevenue = conversions.reduce((s, r) => s + (Number(r.conversion_value) || 0), 0)
    const conversionCount = conversions.length
    const conversionRate = uniqueSessions > 0 ? (conversionCount / uniqueSessions) * 100 : 0
    const revenuePerVisitor = uniqueSessions > 0 ? totalRevenue / uniqueSessions : 0

    // Revenue time series — bucketed the same way as visitor time series
    const revenueBuckets = {}
    conversions.forEach(r => {
      if (!r.conversion_date) return
      const b = bucket(new Date(r.conversion_date).toISOString())
      revenueBuckets[b] = (revenueBuckets[b] || 0) + (Number(r.conversion_value) || 0)
    })

    // Build aligned time-series labels covering both visitors and revenue buckets.
    const allBuckets = new Set([...Object.keys(dayVisitorBuckets), ...Object.keys(revenueBuckets), ...Object.keys(dayCounts)])
    const labels = [...allBuckets].sort()
    const visitors_timeseries = labels.map(l => dayVisitorBuckets[l] || 0)
    const revenue_timeseries = labels.map(l => revenueBuckets[l] || 0)

    // Per-source revenue map
    const revenueBySource = {}
    conversions.forEach(r => {
      const src = r.first_touch_source || 'Direct'
      revenueBySource[src] = (revenueBySource[src] || 0) + (Number(r.conversion_value) || 0)
    })

    res.json({
      success: true,
      data: {
        period: { days, from: fromDate, to: toDate, granularity },
        kpis: {
          pageviews: pv.length,
          unique_visitors: uniqueSessions,
          new_visitors: newVisitors,
          returning_visitors: returningVisitors,
          bounce_rate: bounceRate,
          avg_duration_seconds: avgDuration,
          total_revenue: totalRevenue,
          conversion_count: conversionCount,
          conversion_rate: conversionRate,
          revenue_per_visitor: revenuePerVisitor
        },
        top_pages: topPages,
        top_sources: topSources.map(s => ({ ...s, revenue: revenueBySource[s.source] || 0 })),
        ai_sources: aiSources,
        devices: deviceCounts,
        top_countries: topCountries,
        trend,
        timeseries: { labels, visitors: visitors_timeseries, revenue: revenue_timeseries },
        revenue_by_source: revenueBySource,
        applied_filters: filters
      }
    })
  } catch (err) { console.error('[analytics/summary]', err.message); res.status(500).json({ success: false, error: 'Summary failed' }) }
})

// ─── Sources tab: channel / referrer / campaign / medium ────────────────────
// channel + campaign come from attributed_conversions (revenue-aware).
// referrer + medium come from pageviews (no revenue join — too sparse otherwise).
router.get('/sources', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = Math.min(parseInt(req.query.days) || 30, 90)
    const tab = ['channel','referrer','campaign','medium','ai_source'].includes(req.query.tab) ? req.query.tab : 'referrer'
    const supabase = getSupabase()
    const from = new Date(Date.now() - days * 86400000).toISOString()
    const fromDate = from.slice(0,10)
    const toDate = new Date().toISOString().slice(0,10)
    const filters = parseFilters(req)

    function normalizeAISourceName(source) {
      if (!source) return null
      const s = source.toLowerCase().trim()
      if (s.includes('chatgpt') || s.includes('openai')) return 'ChatGPT'
      if (s.includes('claude') || s.includes('anthropic')) return 'Claude'
      if (s.includes('perplexity')) return 'Perplexity'
      if (s.includes('gemini') || s.includes('bard')) return 'Gemini'
      if (s.includes('grok')) return 'Grok'
      if (s.includes('copilot')) return 'Copilot'
      if (s.includes('deepseek')) return 'DeepSeek'
      if (s.includes('meta.ai') || s.includes('meta-ai')) return 'Meta AI'
      if (s.includes('you.com')) return 'You.com'
      if (s.includes('phind')) return 'Phind'
      if (s.includes('kagi')) return 'Kagi'
      if (s.includes('mistral')) return 'Mistral'
      if (s.includes('poe.com') || s === 'poe') return 'Poe'
      return source.charAt(0).toUpperCase() + source.slice(1)
    }

    if (tab === 'ai_source') {
      let query = supabase.from('pageviews')
        .select('session_id, ai_source')
        .eq('site_id', siteId)
        .gte('timestamp', from)
        .not('ai_source', 'is', null)
        .neq('ai_source', '')
        .limit(50000)
      query = applyPageviewFilters(query, filters)
      const { data: rows } = await query

      const groups = {}
      ;(rows || []).forEach(r => {
        const normName = normalizeAISourceName(r.ai_source)
        if (!normName) return
        groups[normName] = groups[normName] || { name: normName, visitors_set: new Set() }
        if (r.session_id) groups[normName].visitors_set.add(r.session_id)
      })

      let revenueByKey = {}
      try {
        const { data: convRows } = await supabase
          .from('attributed_conversions')
          .select('first_touch_source, conversion_value')
          .eq('site_id', siteId)
          .gte('conversion_date', fromDate)
          .lte('conversion_date', toDate)
        ;(convRows || []).forEach(r => {
          const normName = normalizeAISourceName(r.first_touch_source)
          if (normName) {
            revenueByKey[normName] = (revenueByKey[normName] || 0) + (Number(r.conversion_value) || 0)
          }
        })
      } catch (_e) { /* table may be empty */ }

      const out = Object.values(groups)
        .map(g => ({
          name: g.name,
          visitors: g.visitors_set.size,
          revenue: revenueByKey[g.name] || 0
        }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 100)
      return res.json({ success: true, data: { tab, rows: out } })
    }

    if (tab === 'channel' || tab === 'campaign') {
      // Pull from attributed_conversions
      const col = tab === 'channel' ? 'first_touch_channel' : 'first_touch_source'
      const campaignCol = 'first_touch_campaign'
      const selectCols = tab === 'campaign'
        ? `${campaignCol}, conversion_value`
        : `${col}, conversion_value`
      const { data: rows } = await supabase
        .from('attributed_conversions')
        .select(selectCols)
        .eq('site_id', siteId)
        .gte('conversion_date', fromDate)
        .lte('conversion_date', toDate)

      const groupCol = tab === 'campaign' ? campaignCol : col
      const groups = {}
      ;(rows || []).forEach(r => {
        const key = r[groupCol] || (tab === 'channel' ? 'Direct' : 'untagged')
        groups[key] = groups[key] || { name: key, conversions: 0, revenue: 0 }
        groups[key].conversions++
        groups[key].revenue += Number(r.conversion_value) || 0
      })
      // Visitors-by-channel is not available without join — return conversions count
      // as the "visitors" proxy so the row bar still has something to render.
      const out = Object.values(groups)
        .map(g => ({ ...g, visitors: g.conversions }))
        .sort((a, b) => b.revenue - a.revenue || b.conversions - a.conversions)
      return res.json({ success: true, data: { tab, rows: out } })
    }

    // referrer / medium — group by pageviews
    let query = supabase.from('pageviews')
      .select('referrer, utm_source, utm_medium, session_id, ai_source')
      .eq('site_id', siteId)
      .gte('timestamp', from)
      .limit(50000)
    query = applyPageviewFilters(query, filters)
    const { data: rows } = await query

    const groups = {}
    ;(rows || []).forEach(r => {
      let key
      if (tab === 'medium') {
        key = (r.utm_medium || 'none').toLowerCase()
      } else {
        // referrer tab — fall through classification (matches /summary classifySource)
        if (r.ai_source) key = `AI: ${r.ai_source}`
        else if (r.utm_source && isGoogleSource(r.utm_source)) {
          key = 'google'
        }
        else if (r.utm_source) key = r.utm_source.toLowerCase()
        else if (r.referrer) {
          try {
            const host = new URL(r.referrer).hostname.replace('www.','')
            if (isGoogleSource(host)) {
              key = 'google'
            } else {
              key = host
            }
          } catch {
            key = 'Direct'
          }
        } else {
          key = 'Direct'
        }
      }
      groups[key] = groups[key] || { name: key, visitors_set: new Set() }
      if (r.session_id) groups[key].visitors_set.add(r.session_id)
    })

    // Optional revenue overlay for referrer tab via attributed_conversions
    let revenueByKey = {}
    if (tab === 'referrer') {
      try {
        const { data: convRows } = await supabase
          .from('attributed_conversions')
          .select('first_touch_source, conversion_value')
          .eq('site_id', siteId)
          .gte('conversion_date', fromDate)
          .lte('conversion_date', toDate)
        ;(convRows || []).forEach(r => {
          let key = (r.first_touch_source || 'Direct').toLowerCase()
          if (isGoogleSource(key)) {
            key = 'google'
          }
          revenueByKey[key] = (revenueByKey[key] || 0) + (Number(r.conversion_value) || 0)
        })
      } catch (_e) { /* table may be empty */ }
    }

    const out = Object.values(groups)
      .map(g => ({
        name: g.name,
        visitors: g.visitors_set.size,
        revenue: revenueByKey[g.name.toLowerCase()] || 0
      }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 100)
    return res.json({ success: true, data: { tab, rows: out } })
  } catch (err) {
    console.error('[analytics/sources]', err.message)
    res.status(500).json({ success: false, error: 'Sources failed' })
  }
})

// ─── Recent conversions (privacy-friendly) ───────────────────────────────────
// Anonymized: distinct_id is never exposed. We surface only the first 3 chars + ****.
router.get('/recent-conversions', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = Math.min(parseInt(req.query.days) || 30, 90)
    const supabase = getSupabase()
    const fromDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const toDate = new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('attributed_conversions')
      .select('distinct_id, conversion_date, conversion_value, conversion_type, first_touch_source, first_touch_channel, touchpoint_count, attribution_confidence')
      .eq('site_id', siteId)
      .gte('conversion_date', fromDate)
      .lte('conversion_date', toDate)
      .order('conversion_date', { ascending: false })
      .limit(20)
    if (error) throw error

    const out = (data || []).map(r => ({
      display_id: r.distinct_id
        ? String(r.distinct_id).slice(0, 3).toUpperCase() + '****'
        : 'Anon',
      conversion_date: r.conversion_date,
      conversion_value: Number(r.conversion_value) || 0,
      conversion_type: r.conversion_type,
      first_touch_source: r.first_touch_source,
      first_touch_channel: r.first_touch_channel,
      touchpoint_count: r.touchpoint_count,
      attribution_confidence: r.attribution_confidence
    }))
    res.json({ success: true, data: out })
  } catch (err) {
    console.error('[analytics/recent-conversions]', err.message)
    res.status(500).json({ success: false, error: 'Recent conversions failed' })
  }
})

// ─── Latest data quality report ──────────────────────────────────────────────
// Returns the most recent row per check_name for this site. Used by the
// Integrations page to surface the duplicate_conversion_rate warning above
// the pixel setup (over-reporting detection).
router.get('/data-quality/latest', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const block = requireFeature(req.site?.plan, 'over_reporting_detection', 'Over-reporting detection')
    if (block) return res.status(402).json(block)
    const siteId = String(req.site.id)
    const supabase = getSupabase()
    // Pull the last 100 rows and reduce to one row per check_name client-side —
    // keeps the query simple without needing a window function.
    const { data, error } = await supabase
      .from('data_quality_reports')
      .select('check_name, status, value, threshold, message, checked_at')
      .eq('site_id', siteId)
      .order('checked_at', { ascending: false })
      .limit(100)
    if (error) throw error

    const seen = new Set()
    const checks = []
    for (const row of (data || [])) {
      if (seen.has(row.check_name)) continue
      seen.add(row.check_name)
      checks.push(row)
    }
    res.json({ success: true, data: { checks, latest_at: checks[0]?.checked_at || null } })
  } catch (err) {
    console.error('[analytics/data-quality/latest]', err.message)
    res.status(500).json({ success: false, error: 'Data quality fetch failed' })
  }
})

router.get('/entry-exit', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = parseInt(req.query.days) || 30
    const from = new Date(Date.now() - days * 86400000).toISOString()
    const filters = parseFilters(req)
    const supabase = getSupabase()
    let q = supabase.from('pageviews')
      .select('entry_page, exit_page, session_id')
      .eq('site_id', siteId).gte('timestamp', from).limit(20000)
    q = applyPageviewFilters(q, filters)
    const { data: rows } = await q
    if (!rows) return res.json({ success: true, data: { entry_pages: [], exit_pages: [] } })
    const entryCount = {}, exitCount = {}, totalSessions = new Set()
    rows.forEach(r => {
      if (r.session_id) totalSessions.add(r.session_id)
      if (r.entry_page) entryCount[r.entry_page] = (entryCount[r.entry_page] || 0) + 1
      if (r.exit_page) exitCount[r.exit_page] = (exitCount[r.exit_page] || 0) + 1
    })
    const total = totalSessions.size || 1
    const entry_pages = Object.entries(entryCount).sort((a,b)=>b[1]-a[1]).slice(0,50).map(([page,count])=>({page,count,pct:Math.round(count/total*100)}))
    const exit_pages = Object.entries(exitCount).sort((a,b)=>b[1]-a[1]).slice(0,50).map(([page,count])=>({page,count,pct:Math.round(count/total*100)}))
    res.json({ success: true, data: { entry_pages, exit_pages } })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/outbound', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = parseInt(req.query.days) || 30
    const from = new Date(Date.now() - days * 86400000).toISOString()
    const supabase = getSupabase()
    const { data: rows } = await supabase.from('custom_events')
      .select('properties, url').eq('site_id', siteId).eq('event_type', 'outbound_click').gte('timestamp', from).limit(5000)
    if (!rows) return res.json({ success: true, data: [] })
    const destCount = {}
    rows.forEach(r => {
      const dest = r.properties?.destination || 'unknown'
      if (!destCount[dest]) destCount[dest] = { destination: dest, count: 0 }
      destCount[dest].count++
    })
    res.json({ success: true, data: Object.values(destCount).sort((a,b)=>b.count-a.count).slice(0,20) })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/custom-events', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = parseInt(req.query.days) || 30
    const from = new Date(Date.now() - days * 86400000).toISOString()
    const supabase = getSupabase()
    const { data: rows } = await supabase.from('custom_events')
      .select('event_name, properties, url, timestamp').eq('site_id', siteId).eq('event_type', 'custom')
      .gte('timestamp', from).order('timestamp', { ascending: false }).limit(5000)
    if (!rows) return res.json({ success: true, data: { events: [], recent: [] } })
    const eventCount = {}
    rows.forEach(r => { const n = r.event_name || 'unnamed'; eventCount[n] = (eventCount[n]||0)+1 })
    const events = Object.entries(eventCount).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))
    const recent = rows.slice(0,50).map(r=>({ name: r.event_name, url: r.url, properties: r.properties, timestamp: r.timestamp }))
    res.json({ success: true, data: { events, recent } })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/browsers', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = Math.min(parseInt(req.query.days) || 30, 90)
    const from = new Date(Date.now() - days * 86400000).toISOString()
    const filters = parseFilters(req)
    const supabase = getSupabase()

    let query = supabase
      .from('pageviews')
      .select('browser, session_id')
      .eq('site_id', siteId)
      .gte('timestamp', from)
      .not('browser', 'is', null)
      .limit(50000)
    query = applyPageviewFilters(query, filters)

    const { data: rows } = await query
    if (!rows) return res.json({ success: true, data: [] })

    const counts = {}
    for (const r of rows) {
      const b = r.browser || 'other'
      counts[b] = counts[b] || { browser: b, sessions: new Set() }
      if (r.session_id) counts[b].sessions.add(r.session_id)
    }

    const total = Object.values(counts).reduce((s, c) => s + c.sessions.size, 0) || 1
    const results = Object.values(counts)
      .map(c => ({ browser: c.browser, visitors: c.sessions.size, percentage: parseFloat((c.sessions.size / total * 100).toFixed(1)) }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 50)

    res.json({ success: true, data: results })
  } catch (err) {
    console.error('[analytics/browsers]', err.message)
    res.status(500).json({ success: false, error: 'Browser breakdown failed' })
  }
})

router.get('/os', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = Math.min(parseInt(req.query.days) || 30, 90)
    const from = new Date(Date.now() - days * 86400000).toISOString()
    const filters = parseFilters(req)
    const supabase = getSupabase()

    let query = supabase
      .from('pageviews')
      .select('os, session_id')
      .eq('site_id', siteId)
      .gte('timestamp', from)
      .not('os', 'is', null)
      .limit(50000)
    query = applyPageviewFilters(query, filters)

    const { data: rows } = await query
    if (!rows) return res.json({ success: true, data: [] })

    const counts = {}
    for (const r of rows) {
      const o = r.os || 'unknown'
      counts[o] = counts[o] || { os: o, sessions: new Set() }
      if (r.session_id) counts[o].sessions.add(r.session_id)
    }

    const total = Object.values(counts).reduce((s, c) => s + c.sessions.size, 0) || 1
    const results = Object.values(counts)
      .map(c => ({ os: c.os, visitors: c.sessions.size, percentage: parseFloat((c.sessions.size / total * 100).toFixed(1)) }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 50)

    res.json({ success: true, data: results })
  } catch (err) {
    console.error('[analytics/os]', err.message)
    res.status(500).json({ success: false, error: 'OS breakdown failed' })
  }
})

router.get('/funnel', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  const block = requireFeature(req.site?.plan, 'funnels_cohorts', 'Funnels')
  if (block) return res.status(402).json(block)

  try {
    const siteId = String(req.site.id)
    const stepsRaw = req.query.steps || ''
    const days = Math.min(parseInt(req.query.days) || 30, 90)
    const from = new Date(Date.now() - days * 86400000).toISOString()

    const steps = stepsRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8)
    if (steps.length < 2) {
      return res.status(400).json({ success: false, error: 'At least 2 comma-separated step keywords required' })
    }

    const supabase = getSupabase()
    const result = []
    let prevIds = null

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const likePattern = `%${step}%`

      if (i === 0) {
        const { data: rows } = await supabase
          .from('pageviews')
          .select('session_id')
          .eq('site_id', siteId)
          .like('url', likePattern)
          .gte('timestamp', from)
          .not('session_id', 'is', null)

        prevIds = [...new Set((rows || []).map(r => r.session_id))]
        result.push({ step, visitors: prevIds.length, dropoff_rate: 0 })
      } else {
        if (prevIds.length === 0) {
          result.push({ step, visitors: 0, dropoff_rate: 100 })
          prevIds = []
          continue
        }
        const nextIds = []
        const batchSize = 300
        for (let j = 0; j < prevIds.length; j += batchSize) {
          const batch = prevIds.slice(j, j + batchSize)
          const { data: rows } = await supabase
            .from('pageviews')
            .select('session_id')
            .eq('site_id', siteId)
            .like('url', likePattern)
            .in('session_id', batch)
            .gte('timestamp', from)
          for (const r of (rows || [])) {
            if (r.session_id) nextIds.push(r.session_id)
          }
        }
        const uniqueNext = [...new Set(nextIds)]
        const dropoff = prevIds.length > 0
          ? parseFloat(((1 - uniqueNext.length / prevIds.length) * 100).toFixed(1))
          : 100
        result.push({ step, visitors: uniqueNext.length, dropoff_rate: dropoff })
        prevIds = uniqueNext
      }
    }

    res.json({ success: true, data: result })
  } catch (err) {
    console.error('[analytics/funnel]', err.message)
    res.status(500).json({ success: false, error: 'Funnel analysis failed' })
  }
})

export default router
