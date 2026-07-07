import express from 'express'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { getSupabase } from '../lib/supabase.js'
import { fetchPageviews } from '../lib/posthog.js'
import { sourceFromEvent, topSourcesByVisitor } from '../lib/channel-classifier.js'
import { redactPiiFromUrl, redactPiiFromObject, isGoogleSource, isValidTimezone, getLocalDateString, getLocalMonthString, getLocalWeekString, getPaddedUtcDateRange, getNow, bucketUniqueVisitors, countDistinctConverters, cappedRate } from '../lib/utils.js'
import { requireFeature, isSiteStatusBlocked } from '../lib/plan-features.js'
import { claimPageviewUsage } from '../lib/pageview-limits.js'
import {
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit
} from '../middleware/rate-limit.js'
import { resolveClientIp } from '../lib/ip-resolver.js'
import { isBotUserAgent } from '../lib/bot-filter.js'

const router = express.Router()

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

// ─── Self-referral (own-domain) exclusion ────────────────────────────────────
// Internal page→page navigations record document.referrer = the site's own domain,
// which referrer-based source classification would otherwise count as a distinct
// traffic source (e.g. "techrupt.pk"). Build a matcher from the site's own domain
// (and any cross-domain domains) so those referrers collapse into Direct.
// Subdomain-aware: a referrer host matches an own-domain D when host === D or
// host endsWith '.'+D (covers apex, www., and any *.<domain>).
function normalizeDomainHost(d) {
  if (!d || typeof d !== 'string') return null
  let h = d.trim().toLowerCase()
  if (!h) return null
  h = h.replace(/^https?:\/\//, '') // strip scheme
  h = h.replace(/\/.*$/, '')        // strip path
  h = h.replace(/:\d+$/, '')        // strip port
  h = h.replace(/^www\./, '')       // strip leading www.
  return h || null
}

function buildOwnDomainMatcher(site) {
  const own = new Set()
  const primary = normalizeDomainHost(site?.domain)
  if (primary) own.add(primary)
  if (Array.isArray(site?.cross_domain_domains)) {
    for (const d of site.cross_domain_domains) {
      const n = normalizeDomainHost(d)
      if (n) own.add(n)
    }
  }
  return (host) => {
    if (!host || own.size === 0) return false
    const h = String(host).toLowerCase().replace(/^www\./, '')
    for (const d of own) {
      if (h === d || h.endsWith('.' + d)) return true
    }
    return false
  }
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
      if (isBotUserAgent(ua)) return res.json({ ok: true })

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

    const ip = resolveClientIp(req)
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

    const tz = isValidTimezone(req.site?.timezone) ? req.site.timezone : 'UTC'
    const now = getNow(req)
    const localDateTo = toParam || getLocalDateString(now, tz)
    const localDateFrom = fromParam || getLocalDateString(new Date(now.getTime() - days * 86400000), tz)

    const currentPadded = getPaddedUtcDateRange(localDateFrom, localDateTo)

    const filters = parseFilters(req)

    // Pageviews come from PostHog ($pageview), not the legacy Supabase table.
    const rows = await fetchPageviews(siteId, currentPadded.from, currentPadded.to, { filters, limit: 10000, queryName: 'summary' })

    const pv = rows.filter(r => {
      const localDate = getLocalDateString(new Date(r.timestamp), tz)
      return localDate >= localDateFrom && localDate <= localDateTo
    })

    // Visitor-dedup uses anonymous_id (server-routed PostHog events carry no session_id).
    const uniqueVisitors = new Set(pv.map(r => r.anonymous_id).filter(Boolean)).size
    // bounce_rate & avg_duration_seconds need per-session pageview counts / durations
    // that PostHog server-routed events don't provide — suppressed in the response below.
    const pageCounts = {}
    pv.forEach(r => { try { const path = new URL(r.url).pathname; pageCounts[path] = (pageCounts[path] || 0) + 1 } catch (_e) {} })
    const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([page, views]) => ({ page, views }))
    const isOwnDomain = buildOwnDomainMatcher(req.site)
    // Top Sources = SOURCE/ENGINE dimension, visitor-denominated (unique
    // anonymous_id per source), via the shared classifier so this surface
    // matches /analytics/sources?tab=referrer exactly. Previously counted
    // pageviews and bucketed engines into channels ("Organic Search").
    const topSources = topSourcesByVisitor(pv, { isOwnDomain })
    const aiCounts = {}
    pv.filter(r => r.ai_source).forEach(r => { aiCounts[r.ai_source] = (aiCounts[r.ai_source] || 0) + 1 })
    const aiSources = Object.entries(aiCounts).sort((a, b) => b[1] - a[1]).map(([source, visits]) => ({ source, visits }))
    const deviceCounts = {}
    pv.forEach(r => { if (r.device) deviceCounts[r.device] = (deviceCounts[r.device] || 0) + 1 })
    const countryCounts = {}
    pv.filter(r => r.country).forEach(r => { countryCounts[r.country] = (countryCounts[r.country] || 0) + 1 })
    const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([country, visits]) => ({ country, visits }))

    // Bucket helper based on granularity (daily/weekly/monthly).
    function bucket(isoOrDate) {
      if (granularity === 'monthly') return getLocalMonthString(isoOrDate, tz)
      if (granularity === 'weekly') return getLocalWeekString(isoOrDate, tz)
      return getLocalDateString(isoOrDate, tz)
    }

    // ─── Time series — unique visitors per bucket (distinct anonymous_id active in each bucket)
    const dayVisitorBuckets = bucketUniqueVisitors(pv, bucket)

    // Page-view count by bucket (kept for backward-compat "trend" field).
    const dayCounts = {}
    pv.forEach(r => {
      if (!r.timestamp) return
      const b = bucket(r.timestamp)
      dayCounts[b] = (dayCounts[b] || 0) + 1
    })
    const trend = Object.entries(dayCounts).sort((a, b) => a[0].localeCompare(b[0])).slice(-90).map(([date, views]) => ({ date, views }))

    // new_visitors / returning_visitors require session-window classification that
    // PostHog server-routed events can't support reliably — suppressed (response below).

    // ─── Revenue join from attributed_conversions ────────────────────────────
    let conversions = []
    try {
      const { data: convRows } = await supabase
        .from('attributed_conversions')
        .select('conversion_date, conversion_value, first_touch_source, first_touch_channel, conversion_timestamp, distinct_id, anonymous_id')
        .eq('site_id', siteId)
        .gte('conversion_date', currentPadded.from)
        .lte('conversion_date', currentPadded.to)
      conversions = (convRows || []).filter(r => {
        const localDate = getLocalDateString(new Date(r.conversion_timestamp || r.conversion_date), tz)
        return localDate >= localDateFrom && localDate <= localDateTo
      })
    } catch (_e) {
      // attributed_conversions table may be empty for very new sites — fail silently.
    }

    const totalRevenue = conversions.reduce((s, r) => s + (Number(r.conversion_value) || 0), 0)
    const conversionCount = conversions.length
    // Rate numerator = DISTINCT converters (same canonical visitor identity the
    // denominator uses — distinct_id/anonymous_id), NOT raw conversion rows. A
    // visitor converting N times is one converter. cappedRate also guards >100%.
    const distinctConverters = countDistinctConverters(conversions)
    const conversionRate = cappedRate(distinctConverters, uniqueVisitors)
    const revenuePerVisitor = uniqueVisitors > 0 ? totalRevenue / uniqueVisitors : 0

    // Revenue time series — bucketed the same way as visitor time series
    const revenueBuckets = {}
    conversions.forEach(r => {
      const b = bucket(r.conversion_timestamp || r.conversion_date)
      revenueBuckets[b] = (revenueBuckets[b] || 0) + (Number(r.conversion_value) || 0)
    })

    // Pad the X-axis to the full selected window so a sparse dataset doesn't
    // visually compress (e.g. 30d selected but data on only 2 days). Enumerate
    // every local day in [localDateFrom, localDateTo], bucket at the active
    // granularity, and zero-fill below. Values are unchanged — only previously
    // absent labels are added.
    const fullBuckets = []
    const seenBuckets = new Set()
    let cursor = localDateFrom
    for (let i = 0; cursor <= localDateTo && i < 400; i++) {
      const b = bucket(`${cursor}T12:00:00Z`)
      if (!seenBuckets.has(b)) { seenBuckets.add(b); fullBuckets.push(b) }
      const d = new Date(`${cursor}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + 1)
      cursor = d.toISOString().slice(0, 10)
    }

    // Build aligned time-series labels covering the full window plus any data buckets.
    const allBuckets = new Set([...fullBuckets, ...Object.keys(dayVisitorBuckets), ...Object.keys(revenueBuckets), ...Object.keys(dayCounts)])
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
        period: { days, from: localDateFrom, to: localDateTo, granularity },
        kpis: {
          pageviews: pv.length,
          unique_visitors: uniqueVisitors,
          new_visitors: null,
          returning_visitors: null,
          bounce_rate: null,
          avg_duration_seconds: null,
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

    const tz = isValidTimezone(req.site?.timezone) ? req.site.timezone : 'UTC'
    const now = getNow(req)
    const localDateTo = getLocalDateString(now, tz)
    const localDateFrom = getLocalDateString(new Date(now.getTime() - days * 86400000), tz)
    const padded = getPaddedUtcDateRange(localDateFrom, localDateTo)

    const filters = parseFilters(req)

    function findMatchingPageview(firstTouchTimestamp, firstTouchSource, firstTouchChannel, rowsList) {
      if (!firstTouchTimestamp) return null
      const targetTime = new Date(firstTouchTimestamp).getTime()
      let bestMatch = null
      let bestScore = -1
      let minDiff = Infinity
      const tolerance = 5000 // 5 seconds clock skew/ingestion latency tolerance

      const normSource = firstTouchSource ? firstTouchSource.toLowerCase().trim() : ''
      const normChannel = firstTouchChannel ? firstTouchChannel.trim() : ''

      for (const pv of rowsList) {
        if (!pv.timestamp) continue
        const pvTime = new Date(pv.timestamp).getTime()
        const diff = Math.abs(pvTime - targetTime)
        if (diff > tolerance) continue

        let score = 0
        if (normChannel === 'AI Search') {
          if (pv.ai_source && normSource) {
            const pvAiNorm = normalizeAISourceName(pv.ai_source).toLowerCase()
            const convAiNorm = normalizeAISourceName(normSource).toLowerCase()
            if (pvAiNorm === convAiNorm || pvAiNorm.includes(convAiNorm) || convAiNorm.includes(pvAiNorm)) {
              score = 3
            }
          }
        } else {
          if (pv.utm_source && normSource && pv.utm_source.toLowerCase().trim() === normSource) {
            score = 3
          } else if (pv.referrer && normSource) {
            try {
              const host = new URL(pv.referrer).hostname.replace('www.', '').toLowerCase().trim()
              if (host === normSource || host.includes(normSource) || normSource.includes(host)) {
                score = 2
              }
            } catch {
              // Ignore invalid referrer
            }
          } else if (!pv.utm_source && !pv.referrer && (normSource === 'direct' || normSource === 'none' || !normSource)) {
            score = 1
          }
        }

        if (score > bestScore) {
          bestScore = score
          minDiff = diff
          bestMatch = pv
        } else if (score === bestScore && diff < minDiff) {
          minDiff = diff
          bestMatch = pv
        }
      }
      return bestScore > 0 ? bestMatch : null
    }

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
      const rawRows = await fetchPageviews(siteId, padded.from, padded.to, { filters, limit: 50000, queryName: 'sources_ai' })

      const rows = rawRows.filter(r => {
        if (!r.ai_source) return false
        const localDate = getLocalDateString(new Date(r.timestamp), tz)
        return localDate >= localDateFrom && localDate <= localDateTo
      })

      const groups = {}
      rows.forEach(r => {
        const normName = normalizeAISourceName(r.ai_source)
        if (!normName) return
        groups[normName] = groups[normName] || { name: normName, visitors_set: new Set() }
        if (r.anonymous_id) groups[normName].visitors_set.add(r.anonymous_id)
      })

      let revenueByKey = {}
      try {
        const { data: rawConvRows } = await supabase
          .from('attributed_conversions')
          .select('distinct_id, conversion_value, first_touch_timestamp, first_touch_channel, first_touch_source, conversion_date, conversion_timestamp')
          .eq('site_id', siteId)
          .gte('conversion_date', padded.from)
          .lte('conversion_date', padded.to)

        const convRows = (rawConvRows || []).filter(r => {
          const localDate = getLocalDateString(new Date(r.conversion_timestamp || r.conversion_date), tz)
          return localDate >= localDateFrom && localDate <= localDateTo
        })

        convRows.forEach(r => {
          let platform = null
          if (r.first_touch_channel === 'AI Search') {
            const matchPv = findMatchingPageview(r.first_touch_timestamp, r.first_touch_source, r.first_touch_channel, rows)
            if (matchPv && matchPv.ai_source) {
              platform = matchPv.ai_source
            }
          }
          const normName = normalizeAISourceName(platform || r.first_touch_source)
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
        ? `${campaignCol}, conversion_value, conversion_timestamp, conversion_date`
        : `${col}, conversion_value, conversion_timestamp, conversion_date`
      const { data: rawRows } = await supabase
        .from('attributed_conversions')
        .select(selectCols)
        .eq('site_id', siteId)
        .gte('conversion_date', padded.from)
        .lte('conversion_date', padded.to)

      const rows = (rawRows || []).filter(r => {
        const localDate = getLocalDateString(new Date(r.conversion_timestamp || r.conversion_date), tz)
        return localDate >= localDateFrom && localDate <= localDateTo
      })

      const groupCol = tab === 'campaign' ? campaignCol : col
      const groups = {}
      rows.forEach(r => {
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
    const rawRows = await fetchPageviews(siteId, padded.from, padded.to, { filters, limit: 50000, queryName: 'sources_ref' })

    const rows = rawRows.filter(r => {
      const localDate = getLocalDateString(new Date(r.timestamp), tz)
      return localDate >= localDateFrom && localDate <= localDateTo
    })

    const isOwnDomain = buildOwnDomainMatcher(req.site)
    const groups = {}
    rows.forEach(r => {
      let key
      if (tab === 'medium') {
        key = (r.utm_medium || 'none').toLowerCase()
      } else {
        // referrer tab — shared SOURCE classifier (same impl as /summary top_sources)
        key = sourceFromEvent(r, { isOwnDomain })
      }
      groups[key] = groups[key] || { name: key, visitors_set: new Set() }
      if (r.anonymous_id) groups[key].visitors_set.add(r.anonymous_id)
    })

    // Optional revenue overlay for referrer tab via attributed_conversions
    let revenueByKey = {}
    if (tab === 'referrer') {
      try {
        const { data: rawConvRows } = await supabase
          .from('attributed_conversions')
          .select('distinct_id, conversion_value, first_touch_timestamp, first_touch_channel, first_touch_source, conversion_date, conversion_timestamp')
          .eq('site_id', siteId)
          .gte('conversion_date', padded.from)
          .lte('conversion_date', padded.to)

        const convRows = (rawConvRows || []).filter(r => {
          const localDate = getLocalDateString(new Date(r.conversion_timestamp || r.conversion_date), tz)
          return localDate >= localDateFrom && localDate <= localDateTo
        })

        convRows.forEach(r => {
          let key = 'Direct'
          const channel = r.first_touch_channel || 'Direct'

          if (channel === 'Paid Search' || channel === 'Organic Search') {
            key = 'google'
          } else if (channel === 'Direct') {
            key = 'Direct'
          } else if (channel === 'AI Search') {
            const matchPv = findMatchingPageview(r.first_touch_timestamp, r.first_touch_source, r.first_touch_channel, rows)
            if (matchPv && matchPv.ai_source) {
              key = `AI: ${matchPv.ai_source}`
            } else {
              key = r.first_touch_source ? `AI: ${normalizeAISourceName(r.first_touch_source)}` : 'AI: ChatGPT'
            }
          } else {
            const matchPv = findMatchingPageview(r.first_touch_timestamp, r.first_touch_source, r.first_touch_channel, rows)
            if (matchPv) {
              if (matchPv.utm_source) key = matchPv.utm_source.toLowerCase()
              else if (matchPv.referrer) {
                try {
                  const host = new URL(matchPv.referrer).hostname.replace('www.','')
                  key = host
                } catch {
                  key = 'Direct'
                }
              }
            } else {
              key = r.first_touch_source || 'Direct'
            }
          }

          let lowerKey = key.toLowerCase()
          if (isGoogleSource(lowerKey)) {
            lowerKey = 'google'
          }
          revenueByKey[lowerKey] = (revenueByKey[lowerKey] || 0) + (Number(r.conversion_value) || 0)
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

// ─── Attribution coverage (Setup & Health) ───────────────────────────────────
// Deterministic, read-only health stat. Coverage = % of conversions in
// {site, window} that we can trace to a known acquisition source — first- OR
// last-touch channel that is not direct/unknown/blank (denylist applied after
// lower(trim)). This is a coverage/health number, NOT the credited-channel mix
// shown on the attribution dashboard. No change to attribution computation;
// purely a derived read over existing columns. Tenant-scoped by site_id.
router.get('/coverage', requireUserAuth, validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90)
    const supabase = getSupabase()
    const fromDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const toDate = new Date().toISOString().slice(0, 10)

    const DENY = new Set(['direct', 'unknown', ''])
    const isKnown = (v) => v != null && !DENY.has(String(v).trim().toLowerCase())

    // Page through conversions in the window. Conversions are low-volume, so this
    // stays cheap while avoiding the implicit 1000-row cap — the count is exact,
    // never silently truncated.
    const PAGE = 1000
    let offset = 0
    let total = 0
    let covered = 0
    let tagged = 0
    for (;;) {
      const { data, error } = await supabase
        .from('attributed_conversions')
        .select('first_touch_channel, last_touch_channel, confidence_signals')
        .eq('site_id', siteId)
        .gte('conversion_date', fromDate)
        .lte('conversion_date', toDate)
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const rows = data || []
      for (const r of rows) {
        total++
        if (isKnown(r.first_touch_channel) || isKnown(r.last_touch_channel)) covered++
        let sig = r.confidence_signals || {}
        if (typeof sig === 'string') { try { sig = JSON.parse(sig) } catch { sig = {} } }
        if (sig.has_utm === true || sig.has_click_id === true) tagged++
      }
      if (rows.length < PAGE) break
      offset += PAGE
    }

    // Truth-gate: no conversions in the window → no number (caller shows a calm
    // empty state). Never emit 0% as a stand-in for "no data".
    if (total === 0) {
      return res.json({ success: true, data: { has_data: false, window_days: days } })
    }

    res.json({
      success: true,
      data: {
        has_data: true,
        window_days: days,
        total,
        covered,
        coverage_pct: Math.round((covered / total) * 1000) / 10,
        tagged_pct: Math.round((tagged / total) * 1000) / 10
      }
    })
  } catch (err) {
    console.error('[analytics/coverage]', err.message)
    res.status(500).json({ success: false, error: 'Coverage failed' })
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
  // Entry/exit pages are session-boundary metrics — the first and last pageview of each
  // visit. PostHog server-routed events carry no usable session_id, so these can't be
  // derived honestly (deriving over anonymous_id would merge weeks of visits into one).
  // Suppressed to empty; the dashboard renders its "No entry/exit data yet" state.
  res.json({ success: true, data: { entry_pages: [], exit_pages: [] } })
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
    const to = new Date().toISOString()
    const filters = parseFilters(req)

    const rows = await fetchPageviews(siteId, from, to, { filters, limit: 50000, queryName: 'browsers' })

    const counts = {}
    for (const r of rows) {
      if (!r.browser) continue
      const b = r.browser
      counts[b] = counts[b] || { browser: b, visitors: new Set() }
      if (r.anonymous_id) counts[b].visitors.add(r.anonymous_id)
    }

    const total = Object.values(counts).reduce((s, c) => s + c.visitors.size, 0) || 1
    const results = Object.values(counts)
      .map(c => ({ browser: c.browser, visitors: c.visitors.size, percentage: parseFloat((c.visitors.size / total * 100).toFixed(1)) }))
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
    const to = new Date().toISOString()
    const filters = parseFilters(req)

    const rows = await fetchPageviews(siteId, from, to, { filters, limit: 50000, queryName: 'os' })

    const counts = {}
    for (const r of rows) {
      if (!r.os) continue
      const o = r.os
      counts[o] = counts[o] || { os: o, visitors: new Set() }
      if (r.anonymous_id) counts[o].visitors.add(r.anonymous_id)
    }

    const total = Object.values(counts).reduce((s, c) => s + c.visitors.size, 0) || 1
    const results = Object.values(counts)
      .map(c => ({ os: c.os, visitors: c.visitors.size, percentage: parseFloat((c.visitors.size / total * 100).toFixed(1)) }))
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
