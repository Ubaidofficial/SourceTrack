/**
 * Server-side event proxy for custom first-party subdomains
 * Users CNAME: analytics.theirdomain.com → api.srctk.com
 * Tracker sends to: https://analytics.theirdomain.com/sp/e
 * Routes events through a customer-owned custom subdomain while maintaining platform security and isolation
 */
import express from 'express'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { getSupabase } from '../lib/supabase.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { claimPageviewUsage } from '../lib/pageview-limits.js'
import { isSiteStatusBlocked } from '../lib/plan-features.js'
import { redactPiiFromObject, redactPiiFromUrl } from '../lib/utils.js'
import { dualWriteEvent } from '../../tinybird/adapter/dual-write.js'
import {
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit,
  conversionVisitorLimit,
  conversionIpLimit,
  conversionSiteLimit,
  conversionGlobalIpLimit
} from '../middleware/rate-limit.js'

const router = express.Router()

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
  const headers = req.headers || {}
  const ip = (headers['x-forwarded-for'] || '').split(',')[0].trim()
    || headers['x-real-ip'] || ''
  const ua = headers['user-agent'] || ''
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
router.post('/e',
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit,
  async (req, res) => {
  res.json({ ok: true })
  try {
    const { site_key, event, anonymous_id, properties = {} } = req.body || {}
    if (!site_key || !event) return
    const supabase = getSupabase()
    // Select plan + pv_limit so claimPageviewUsage can enforce quota
    const { data: site } = await supabase.from('sites').select('id, plan, pv_limit, trial_ends_at').eq('site_key', site_key).single()
    if (!site) return

    if (isSiteStatusBlocked(site)) {
      console.warn('[proxy/e] Site status blocked (trial expired/inactive/archived) for site_key:', site_key)
      return
    }

    // Pageview quota claim — 140G-4. Only $pageview events consume quota.
    // Non-pageview custom events (e.g. button_clicked) pass through uncounted.
    if (event === '$pageview') {
      try {
        const pvCheck = await claimPageviewUsage(site)
        if (!pvCheck.allowed) {
          console.warn('[proxy/e] Pageview limit reached for site', site_key, '— skipping capture')
          return
        }
      } catch (pvErr) {
        // Fail open — DB/RPC error must not block tracking
        console.error('[proxy/e] Pageview limit check failed, failing open:', pvErr?.message)
      }
    }

    const enriched = enrichFromRequest(req)
    const rawReferrer = properties.referrer || req.headers.referer || ''
    const sanitizedReferrer = rawReferrer ? redactPiiFromUrl(rawReferrer) : ''
    const sanitizedProperties = redactPiiFromObject(properties || {})
    sanitizedProperties.referrer = sanitizedReferrer

    await ph.capture({
      distinctId: anonymous_id || uuidv4(),
      event,
      properties: {
        ...sanitizedProperties,
        site_id: site.id,
        site_key,
        country: enriched.country,
        device_type: enriched.device_type,
        browser: enriched.browser,
        server_timestamp: enriched.server_timestamp,
        ai_source: getAiSource(sanitizedReferrer) || sanitizedProperties.ai_source || null,
        proxy: true,
      }
    })
  } catch (err) { console.error('[proxy/e]', err.message) }
})

// POST /sp/c — proxied conversion
router.post('/c',
  conversionVisitorLimit,
  conversionIpLimit,
  conversionSiteLimit,
  conversionGlobalIpLimit,
  async (req, res) => {
  res.json({ ok: true })
  try {
    const { site_key, anonymous_id, conversion_value, conversion_type, order_id, properties = {} } = req.body || {}
    if (!site_key) return
    const supabase = getSupabase()
    const { data: site } = await supabase.from('sites').select('id, plan, trial_ends_at').eq('site_key', site_key).single()
    if (!site) return

    if (isSiteStatusBlocked(site)) {
      console.warn('[proxy/c] Site status blocked (trial expired/inactive/archived) for site_key:', site_key)
      return
    }

    const enriched = enrichFromRequest(req)
    const rawReferrer = properties.referrer || req.headers.referer || ''
    const sanitizedReferrer = rawReferrer ? redactPiiFromUrl(rawReferrer) : ''
    const sanitizedProperties = redactPiiFromObject(properties || {})
    sanitizedProperties.referrer = sanitizedReferrer

    // Enforce monthly conversion limits (silently ignore if cap is reached; fail-open on DB error)
    try {
      const limitCheck = await claimConversionUsage(site)
      if (!limitCheck.allowed) {
        console.warn(`[proxy/c] Conversion limit reached for site ${site_key}, skipping capture`)
        return
      }
    } catch (limitErr) {
      console.error('[proxy/c] Conversion limit check failed, failing open:', limitErr.message || limitErr)
    }

    // distinctId + captureProperties hoisted to consts (behavior-identical) so the
    // inline uuidv4() fallbacks are computed ONCE and the additive Tinybird
    // dual-write below shares the exact same distinct_id / payload the existing
    // ph.capture uses. (Named captureProperties to avoid shadowing the `properties`
    // already destructured from req.body above.)
    const distinctId = anonymous_id || uuidv4()
    const captureProperties = {
      ...sanitizedProperties,
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

    await ph.capture({
      distinctId,
      event: '$conversion',
      properties: captureProperties
    })

    // Additive Tinybird dual-write (flag-gated OFF; no-op + no network when off).
    // order_id (when present) is exposed at the raw root so deriveEventId keys on
    // it (else a uuid). site_key in the payload is dropped by the adapter.
    dualWriteEvent({ distinctId, event: '$conversion', order_id, properties: captureProperties })
  } catch (err) { console.error('[proxy/c]', err.message) }
})

// GET /sp/pixel.gif — 1x1 pixel (always a $pageview; always consumes quota)
router.get('/pixel.gif',
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit,
  async (req, res) => {
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' })
  res.end(gif)
  try {
    const { site_key, uid } = req.query
    if (!site_key) return
    const supabase = getSupabase()
    // Select plan + pv_limit so claimPageviewUsage can enforce quota
    const { data: site } = await supabase.from('sites').select('id, plan, pv_limit, trial_ends_at').eq('site_key', site_key).single()
    if (!site) return

    if (isSiteStatusBlocked(site)) {
      console.warn('[proxy/pixel] Site status blocked (trial expired/inactive/archived) for site_key:', site_key)
      return
    }

    // Pageview quota claim — pixel always fires a $pageview, so always claim
    try {
      const pvCheck = await claimPageviewUsage(site)
      if (!pvCheck.allowed) {
        console.warn('[proxy/pixel] Pageview limit reached for site', site_key, '— skipping capture')
        return
      }
    } catch (pvErr) {
      // Fail open — DB/RPC error must not block tracking
      console.error('[proxy/pixel] Pageview limit check failed, failing open:', pvErr?.message)
    }

    const enriched = enrichFromRequest(req)
    await ph.capture({
      distinctId: uid || uuidv4(),
      event: '$pageview',
      properties: { site_id: site.id, site_key, event_type: 'pixel', country: enriched.country, device_type: enriched.device_type, server_timestamp: enriched.server_timestamp, proxy: true }
    })
  } catch (err) { console.error('[proxy/pixel]', err.message) }
})

export default router
