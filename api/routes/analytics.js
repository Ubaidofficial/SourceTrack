import express from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey } from '../middleware/auth.js'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'

const router = express.Router()
function getSupabase() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { global: { fetch }, realtime: { transport: WebSocket } }) }

// Known bot/crawler UA patterns — silent drop (return 200 so bots don't retry)
const BOT_UA_PATTERN = /bot|crawl|spider|slurp|mediapartners|adsbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|bingpreview|googleweblight|lighthouse|pagespeed|headlesschrome|phantomjs|selenium|puppeteer|playwright|wget|curl\/|python-requests|axios\/|go-http|java\/|ruby\/|php\//i

router.post('/collect', async (req, res) => {
  try {
    const { site_key, url, referrer, utm_source, utm_medium, utm_campaign, device, browser, session_id, duration_seconds, entry_page, exit_page, event_type, event_name, properties } = req.body
    if (!site_key || !url) return res.status(400).json({ error: 'site_key and url required' })

    // Bot filter — silent drop, 200 so crawlers don't retry
    const ua = req.headers['user-agent'] || ''
    if (!ua || BOT_UA_PATTERN.test(ua)) return res.json({ ok: true })


    const supabase = getSupabase()
    const { data: site } = await supabase.from('sites').select('id').eq('site_key', site_key).single()
    if (!site) return res.status(404).json({ error: 'Site not found' })

    // Handle outbound clicks and custom events
    if (event_type === 'outbound_click' || event_type === 'custom') {
      await supabase.from('custom_events').insert({
        site_id: site.id, event_type, event_name: event_name || event_type,
        url: url || null, session_id: session_id || null,
        properties: properties || {}, timestamp: new Date().toISOString()
      })
      return res.json({ ok: true })
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || ''
    const parser = new UAParser(ua)
    let country = null
    if (ip) { const geo = geoip.lookup(ip); country = geo?.country || null }
    const serverBrowser = (() => { const n = (parser.getBrowser().name || '').toLowerCase(); if (n.includes('edge')) return 'edge'; if (n.includes('chrome')) return 'chrome'; if (n.includes('firefox')) return 'firefox'; if (n.includes('safari')) return 'safari'; return 'other' })()
    const AI_DOMAINS = { 'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'claude.ai': 'Claude', 'perplexity.ai': 'Perplexity', 'gemini.google.com': 'Gemini', 'grok.com': 'Grok', 'copilot.microsoft.com': 'Copilot', 'deepseek.com': 'DeepSeek' }
    let ai_source = null
    if (referrer) { try { const h = new URL(referrer).hostname.replace('www.', ''); ai_source = AI_DOMAINS[h] || null } catch (_e) {} }
    if (duration_seconds > 0 && session_id) {
      await supabase.from('pageviews').update({ duration_seconds }).eq('site_id', site.id).eq('session_id', session_id).eq('url', url)
      return res.json({ ok: true })
    }
    await supabase.from('pageviews').insert({ site_id: site.id, url, referrer: referrer || null, utm_source: utm_source || null, utm_medium: utm_medium || null, utm_campaign: utm_campaign || null, country, device: device || parser.getDevice().type || 'desktop', browser: browser || serverBrowser, session_id: session_id || null, duration_seconds: 0, ai_source, entry_page: entry_page || url, exit_page: exit_page || null, timestamp: new Date().toISOString() })
    res.json({ ok: true })
  } catch (err) { console.error('[analytics/collect]', err.message); res.status(500).json({ error: 'Collection failed' }) }
})

router.get('/summary', requireUserAuth, validateSiteKey, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = Math.min(parseInt(req.query.days) || 30, 90)
    const fromParam = req.query.from || null
    const toParam = req.query.to || null
    const supabase = getSupabase()
    const from = fromParam && toParam
      ? new Date(fromParam).toISOString()
      : new Date(Date.now() - days * 86400000).toISOString()
    const to = fromParam && toParam ? new Date(toParam).toISOString() : null
    let query = supabase.from('pageviews').select('url,referrer,utm_source,utm_medium,utm_campaign,country,device,browser,session_id,duration_seconds,ai_source,timestamp').eq('site_id', siteId).gte('timestamp', from).order('timestamp', { ascending: false }).limit(10000)
    if (to) query = query.lte('timestamp', to)
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
    const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([page, views]) => ({ page, views }))
    function classifySource(row) {
      if (row.ai_source) return `AI: ${row.ai_source}`
      if (row.utm_source) { const m = (row.utm_medium || '').toLowerCase(); if (['cpc','ppc','paid','paid_search'].includes(m)) return 'Paid Search'; if (['email','newsletter'].includes(m)) return 'Email'; return row.utm_source }
      if (row.referrer) { try { const host = new URL(row.referrer).hostname.replace('www.', ''); if (['google.','bing.','yahoo.','duckduckgo.'].some(s => host.includes(s))) return 'Organic Search'; if (['facebook.com','instagram.com','linkedin.com','twitter.com','x.com','tiktok.com'].some(s => host.includes(s))) return 'Organic Social'; return host } catch (_e) {} }
      return 'Direct'
    }
    const sourceCounts = {}
    pv.forEach(r => { const src = classifySource(r); sourceCounts[src] = (sourceCounts[src] || 0) + 1 })
    const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([source, visits]) => ({ source, visits }))
    const aiCounts = {}
    pv.filter(r => r.ai_source).forEach(r => { aiCounts[r.ai_source] = (aiCounts[r.ai_source] || 0) + 1 })
    const aiSources = Object.entries(aiCounts).sort((a, b) => b[1] - a[1]).map(([source, visits]) => ({ source, visits }))
    const deviceCounts = {}
    pv.forEach(r => { if (r.device) deviceCounts[r.device] = (deviceCounts[r.device] || 0) + 1 })
    const countryCounts = {}
    pv.filter(r => r.country).forEach(r => { countryCounts[r.country] = (countryCounts[r.country] || 0) + 1 })
    const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([country, visits]) => ({ country, visits }))
    const dayCounts = {}
    pv.forEach(r => { const day = r.timestamp?.slice(0, 10); if (day) dayCounts[day] = (dayCounts[day] || 0) + 1 })
    const trend = Object.entries(dayCounts).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([date, views]) => ({ date, views }))

    // New vs returning visitors
    // A visitor is "new" if their session_id appears for the first time in this period
    // We detect this by checking if the session's first pageview is within the period
    const sessionFirstSeen = {}
    pv.forEach(r => {
      if (!r.session_id) return
      const ts = new Date(r.timestamp).getTime()
      if (!sessionFirstSeen[r.session_id] || ts < sessionFirstSeen[r.session_id]) {
        sessionFirstSeen[r.session_id] = ts
      }
    })
    const fromMs = new Date(from).getTime()
    let newVisitors = 0, returningVisitors = 0
    Object.values(sessionFirstSeen).forEach(firstTs => {
      if (firstTs >= fromMs) newVisitors++
      else returningVisitors++
    })

            res.json({ success: true, data: { period: { days, from: from.slice(0, 10), to: new Date().toISOString().slice(0, 10) }, kpis: { pageviews: pv.length, unique_visitors: uniqueSessions, new_visitors: newVisitors, returning_visitors: returningVisitors, bounce_rate: bounceRate, avg_duration_seconds: avgDuration }, top_pages: topPages, top_sources: topSources, ai_sources: aiSources, devices: deviceCounts, top_countries: topCountries, trend } })
  } catch (err) { console.error('[analytics/summary]', err.message); res.status(500).json({ error: 'Summary failed' }) }
})


router.get('/entry-exit', requireUserAuth, validateSiteKey, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = parseInt(req.query.days) || 30
    const from = new Date(Date.now() - days * 86400000).toISOString()
    const supabase = getSupabase()
    const { data: rows } = await supabase.from('pageviews')
      .select('entry_page, exit_page, session_id')
      .eq('site_id', siteId).gte('timestamp', from).limit(20000)
    if (!rows) return res.json({ success: true, data: { entry_pages: [], exit_pages: [] } })
    const entryCount = {}, exitCount = {}, totalSessions = new Set()
    rows.forEach(r => {
      if (r.session_id) totalSessions.add(r.session_id)
      if (r.entry_page) entryCount[r.entry_page] = (entryCount[r.entry_page] || 0) + 1
      if (r.exit_page) exitCount[r.exit_page] = (exitCount[r.exit_page] || 0) + 1
    })
    const total = totalSessions.size || 1
    const entry_pages = Object.entries(entryCount).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([page,count])=>({page,count,pct:Math.round(count/total*100)}))
    const exit_pages = Object.entries(exitCount).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([page,count])=>({page,count,pct:Math.round(count/total*100)}))
    res.json({ success: true, data: { entry_pages, exit_pages } })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/outbound', requireUserAuth, validateSiteKey, async (req, res) => {
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

router.get('/custom-events', requireUserAuth, validateSiteKey, async (req, res) => {
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

router.get('/funnel', requireUserAuth, validateSiteKey, async (req, res) => {
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
        // Query in batches to avoid large IN clauses
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
