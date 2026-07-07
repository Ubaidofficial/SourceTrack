/**
 * GET /api/pixel — 1×1 transparent GIF tracking pixel
 *
 * Use cases:
 *   • Email open attribution: <img src="https://api.srctk.com/api/pixel?site_key=xxx&event=email_open&uid=user123&campaign=welcome">
 *   • Server-to-server tracking (curl, webhooks, IoT) — no JS required
 *   • No-JS environments (AMP pages, HTML emails, server-rendered pages)
 *
 * Query params:
 *   site_key  — required
 *   event     — event name (default: email_open)
 *   uid       — user_id
 *   aid       — anonymous_id
 *   url       — page / email URL being tracked
 *   ref       — referrer
 *   utm_source, utm_medium, utm_campaign, utm_content, utm_term
 *   campaign  — shorthand for utm_campaign
 *   val       — numeric value (e.g. order value for conversion pixels)
 *   type      — conversion type (purchase, lead, signup…)
 */

import { Router } from 'express'
import { createHash } from 'crypto'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { getSupabase } from '../lib/supabase.js'
import { normalizeUtm } from '../lib/utils.js'
import { dualWriteEvent } from '../../tinybird/adapter/dual-write.js'
import { resolveClientIp } from '../lib/ip-resolver.js'
import { logWouldDropBot } from '../lib/bot-filter.js'

const router = Router()

// 1×1 transparent GIF (43 bytes)
const GIF_1X1 = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

function sendPixel(res) {
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': GIF_1X1.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
  res.status(200).end(GIF_1X1)
}

router.get('/', async (req, res) => {
  // Always return the pixel immediately — tracking is best-effort
  sendPixel(res)

  try {
    // LOG-ONLY bot measurement (log-only): this route has no UA drop today.
    // Measure what the EXPANDED heuristic (ua_extra / header_shape) WOULD catch
    // before we ever enable dropping — do NOT drop. Logs a coarse UA hash only.
    logWouldDropBot('pixel', req)

    const q = req.query
    const siteKey = q.site_key || q.siteKey || q.sk

    if (!siteKey) return // no site key — pixel still fired, nothing to record

    // Resolve site
    const supabase = getSupabase()
    const { data: site } = await supabase
      .from('sites')
      .select('id, site_key, plan')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (!site) return

    // Ensure inactive/archived sites remain blocked. We do NOT check monthly pageview
    // limits here (fail-open for email/telemetry data), but explicitly suspended sites are blocked.
    if (site.plan === 'inactive' || site.plan === 'archived') {
      return
    }

    // Enrich
    const ip = resolveClientIp(req)
    const ua = q.ua || req.headers['user-agent'] || ''
    const parser = new UAParser(ua)
    const geo = ip ? geoip.lookup(ip) : null

    const eventName = q.event || 'email_open'
    const anonymousId = q.aid || q.anonymous_id || createHash('sha256').update(ip + ua + siteKey).digest('hex').slice(0, 16)
    const userId = q.uid || q.user_id || null
    const campaign = normalizeUtm(q.utm_campaign || q.campaign)
    const source   = normalizeUtm(q.utm_source   || q.source)
    const medium   = normalizeUtm(q.utm_medium   || q.medium)

    const properties = {
      // Core
      site_id:        site.id,
      anonymous_id:   anonymousId,
      user_id:        userId,
      tracking_method: 'pixel',

      // Attribution
      page_url:       q.url || q.page_url || null,
      referrer:       normalizeUtm(q.ref || q.referrer) || null,
      utm_source:     source,
      utm_medium:     medium,
      utm_campaign:   campaign,
      utm_content:    normalizeUtm(q.utm_content) || null,
      utm_term:       normalizeUtm(q.utm_term) || null,

      // Enriched
      device_type:    parser.getDevice().type || 'unknown',
      browser:        parser.getBrowser().name || null,
      os:             parser.getOS().name || null,
      country:        geo?.country || null,
      city:           geo?.city || null,
      server_timestamp: new Date().toISOString(),

      // Optional conversion fields
      ...(q.val  ? { value: parseFloat(q.val) || 0 }  : {}),
      ...(q.type ? { conversion_type: q.type }         : {}),

      // Pass-through extras (any q.x_ prefix)
      ...Object.fromEntries(
        Object.entries(q)
          .filter(([k]) => k.startsWith('x_'))
          .map(([k, v]) => [k, v])
      ),
    }

    ph.capture({
      distinctId: userId || anonymousId,
      event: eventName,
      properties,
    })

    // Additive Tinybird dual-write (flag-gated OFF; no-op + no network when off).
    // No natural id on the pixel path -> deriveEventId falls to a uuid (append-only).
    dualWriteEvent({ distinctId: userId || anonymousId, event: eventName, properties })

  } catch (err) {
    // Swallow — pixel already sent, never error back to the caller
    console.error('[pixel] tracking error:', err?.message)
  }
})

export { router as pixelRouter }
