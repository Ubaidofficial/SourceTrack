import express from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { requireUserAuth } from '../middleware/user-auth.js'
import { validateSiteKey } from '../middleware/auth.js'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'

const router = express.Router()
function getSupabase() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { global: { fetch }, realtime: { transport: WebSocket } }) }

router.post('/collect', async (req, res) => {
  try {
    const { site_key, url, referrer, utm_source, utm_medium, utm_campaign, device, browser, session_id, duration_seconds } = req.body
    if (!site_key || !url) return res.status(400).json({ error: 'site_key and url required' })
    const supabase = getSupabase()
    const { data: site } = await supabase.from('sites').select('id').eq('site_key', site_key).single()
    if (!site) return res.status(404).json({ error: 'Site not found' })
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || ''
    const ua = req.headers['user-agent'] || ''
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
    await supabase.from('pageviews').insert({ site_id: site.id, url, referrer: referrer || null, utm_source: utm_source || null, utm_medium: utm_medium || null, utm_campaign: utm_campaign || null, country, device: device || parser.getDevice().type || 'desktop', browser: browser || serverBrowser, session_id: session_id || null, duration_seconds: 0, ai_source, timestamp: new Date().toISOString() })
    res.json({ ok: true })
  } catch (err) { console.error('[analytics/collect]', err.message); res.status(500).json({ error: 'Collection failed' }) }
})

router.get('/summary', requireUserAuth, validateSiteKey, async (req, res) => {
  try {
    const siteId = String(req.site.id)
    const days = Math.min(parseInt(req.query.days) || 30, 90)
    const supabase = getSupabase()
    const from = new Date(Date.now() - days * 86400000).toISOString()
    const { data: rows, error } = await supabase.from('pageviews').select('url,referrer,utm_source,utm_medium,utm_campaign,country,device,browser,session_id,duration_seconds,ai_source,timestamp').eq('site_id', siteId).gte('timestamp', from).order('timestamp', { ascending: false }).limit(10000)
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
    res.json({ success: true, data: { period: { days, from: from.slice(0, 10), to: new Date().toISOString().slice(0, 10) }, kpis: { pageviews: pv.length, unique_visitors: uniqueSessions, bounce_rate: bounceRate, avg_duration_seconds: avgDuration }, top_pages: topPages, top_sources: topSources, ai_sources: aiSources, devices: deviceCounts, top_countries: topCountries, trend } })
  } catch (err) { console.error('[analytics/summary]', err.message); res.status(500).json({ error: 'Summary failed' }) }
})

export default router
