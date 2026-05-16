/**
 * Server-side event proxy for adblocker bypass
 * Users CNAME: analytics.theirdomain.com → api.sourcetrack.ai
 * Tracker sends to: https://analytics.theirdomain.com/sp/e
 * Bypasses uBlock/Brave/Firefox ETP which block known tracker domains
 */
import express from 'express'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const router = express.Router()
function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { global: { fetch }, realtime: { transport: WebSocket } })
}

const AI_DOMAINS = {
  'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT',
  'claude.ai': 'Claude', 'perplexity.ai': 'Perplexity',
  'gemini.google.com': 'Gemini', 'grok.com': 'Grok',
  'copilot.microsoft.com': 'Copilot', 'deepseek.com': 'DeepSeek'
}

function getAiSource(referrer) {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.replace('www.', '')
    return AI_DOMAINS[host] || null
  } catch { return null }
}

function enrichFromRequest(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip'] || ''
  const ua = req.headers['user-agent'] || ''
  const parser = new UAParser(ua)
  const geo = ip ? geoip.lookup(ip) : null
  return {
    country: geo?.country || null,
    device_type: parser.getDevice().type || 'desktop',
    browser: (parser.getBrowser().name || 'other').toLowerCase(),
    server_timestamp: new Date().toISOString(),
  }
}

// POST /sp/e — proxied pageview / custom event
router.post('/e', async (req, res) => {
  res.json({ ok: true })
  try {
    const { site_key, event, anonymous_id, properties = {} } = req.body || {}
    if (!site_key || !event) return
    const supabase = getSupabase()
    const { data: site } = await supabase.from('sites').select('id').eq('site_key', site_key).single()
    if (!site) return
    const enriched = enrichFromRequest(req)
    const referrer = properties.referrer || req.headers.referer || ''
    await ph.capture({
      distinctId: anonymous_id || uuidv4(),
      event,
      properties: {
        ...properties,
        site_id: site.id,
        site_key,
        country: enriched.country,
        device_type: enriched.device_type,
        browser: enriched.browser,
        server_timestamp: enriched.server_timestamp,
        ai_source: getAiSource(referrer) || properties.ai_source || null,
        proxy: true,
      }
    })
  } catch (err) { console.error('[proxy/e]', err.message) }
})

// POST /sp/c — proxied conversion
router.post('/c', async (req, res) => {
  res.json({ ok: true })
  try {
    const { site_key, anonymous_id, conversion_value, conversion_type, order_id, properties = {} } = req.body || {}
    if (!site_key) return
    const supabase = getSupabase()
    const { data: site } = await supabase.from('sites').select('id').eq('site_key', site_key).single()
    if (!site) return
    const enriched = enrichFromRequest(req)
    await ph.capture({
      distinctId: anonymous_id || uuidv4(),
      event: '$conversion',
      properties: {
        ...properties,
        site_id: site.id,
        site_key,
        conversion_value: conversion_value || 0,
        conversion_type: conversion_type || null,
        conversion_event_id: order_id || uuidv4(),
        country: enriched.country,
        device_type: enriched.device_type,
        server_timestamp: enriched.server_timestamp,
        proxy: true,
      }
    })
  } catch (err) { console.error('[proxy/c]', err.message) }
})

// GET /sp/pixel.gif — 1x1 pixel
router.get('/pixel.gif', async (req, res) => {
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' })
  res.end(gif)
  try {
    const { site_key, uid } = req.query
    if (!site_key) return
    const supabase = getSupabase()
    const { data: site } = await supabase.from('sites').select('id').eq('site_key', site_key).single()
    if (!site) return
    const enriched = enrichFromRequest(req)
    await ph.capture({
      distinctId: uid || uuidv4(),
      event: '$pageview',
      properties: { site_id: site.id, site_key, event_type: 'pixel', country: enriched.country, device_type: enriched.device_type, server_timestamp: enriched.server_timestamp, proxy: true }
    })
  } catch (err) { console.error('[proxy/pixel]', err.message) }
})

export default router
