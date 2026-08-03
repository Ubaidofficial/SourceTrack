import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { normalizeUtm, redactPiiFromObject, isPathExcluded, extractCustomParams, sanitizeClientTimestamp, sanitizeValueTrack, sanitizeVerificationToken, normalizeClickIds } from '../lib/utils.js'
import { resolveClientIp } from '../lib/ip-resolver.js'
import { claimPageviewUsage } from '../lib/pageview-limits.js'
import { checkIsDuplicate, registerConversion } from '../lib/shared-dedupe-cache.js'
import { dualWriteEvent, isDualWriteEnabled } from '../../tinybird/adapter/dual-write.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'


import { getSupabase } from '../lib/supabase.js'
import { isIngestionBotUserAgent, logWouldDropBot, coarseUaHash } from '../lib/bot-filter.js'

async function updateTelemetryMetadata(site, body) {
  try {
    const supabase = getSupabase()
    const now = new Date().toISOString()

    // Parse event domain
    const pageUrl = body.page_url || ''
    let eventDomain = null
    try {
      if (pageUrl) {
        eventDomain = new URL(pageUrl).hostname.replace(/^www\./i, '')
      }
    } catch (_) {}

    // First fetch the latest onboarding_state to prevent race conditions during onboarding
    // (stale cache won't overwrite fresh step-selections in DB)
    const { data } = await supabase
      .from('sites')
      .select('last_seen_at, onboarding_state')
      .eq('id', site.id)
      .single()

    // Authoritative throttle check against fresh DB data
    const freshLastSeenAt = data?.last_seen_at ? new Date(data.last_seen_at).getTime() : 0
    const isStale = !freshLastSeenAt || Number.isNaN(freshLastSeenAt) || Date.now() - freshLastSeenAt > 5 * 60 * 1000

    if (!isStale) return // Skip update, already processed recently

    const currentState = data?.onboarding_state || {}
    const mergedState = {
      ...currentState,
      last_event_at: now,
      last_event_name: body.event || '$pageview',
      last_event_url: pageUrl,
      last_event_domain: eventDomain
    }

    await supabase
      .from('sites')
      .update({
        last_seen_at: now,
        onboarding_state: mergedState
      })
      .eq('id', site.id)
  } catch (err) {
    console.error('[telemetry-update] failed:', err?.message)
  }
}

function enrich(req) {
  const ip = resolveClientIp(req)
  const ua = req.headers['user-agent'] || ''
  const parser = new UAParser(ua)
  const browser = parser.getBrowser()
  const os = parser.getOS()

  let country = null
  if (ip) {
    const geo = geoip.lookup(ip)
    country = geo?.country || null
  }

  return {
    device_type: parser.getDevice().type || 'desktop',
    browser_name: (browser.name || '').toLowerCase() || null,
    browser_version: browser.version || null,
    os_name: os.name || null,
    os_version: os.version || null,
    country,
    server_timestamp: new Date().toISOString(),
    ai_source: req.ai_source || null
  }
}

export function isLeadForm({ form_id, form_name, form_action_path, page_path }) {
  const id = (form_id || '').toLowerCase()
  const name = (form_name || '').toLowerCase()
  const action = (form_action_path || '').toLowerCase()
  const page = (page_path || '').toLowerCase()

  // 1. Exclude obvious non-lead / auth / search / filter / internal patterns
  const excludeKeywords = [
    'search',
    'login', 'signin', 'log-in', 'sign-in',
    'password', 'forgot', 'reset',
    'filter',
    'logout', 'signout', 'log-out', 'sign-out',
    'subscribe', 'newsletter',
    'search-form', 'searchform'
  ]

  for (const kw of excludeKeywords) {
    if (id.includes(kw) || name.includes(kw) || action.includes(kw) || page.includes(kw)) {
      return false
    }
  }

  // Exclude internal app paths
  const internalPaths = ['/app', '/dashboard', '/admin', '/console', '/portal', '/internal', '/auth', '/oauth']
  for (const path of internalPaths) {
    if (page === path || page.startsWith(path + '/')) {
      return false
    }
  }

  // 2. Positive lead-form signals
  const positiveKeywords = [
    'contact', 'demo', 'quote', 'sales', 'pricing', 'trial',
    'signup', 'sign-up', 'waitlist', 'lead', 'consultation',
    'book', 'register'
  ]

  for (const kw of positiveKeywords) {
    if (id.includes(kw) || name.includes(kw) || action.includes(kw) || page.includes(kw)) {
      return true
    }
  }

  // 3. Ambiguous public forms: if it's on a public page and not excluded, treat as lead form
  return true
}

export async function track(req, res) {
  // Ingest observability (incident 2026-07-14: /api/track returned 200 and persisted NOTHING, with
  // ZERO write-path log lines). Every request-level outcome that does NOT enqueue an event to the
  // batcher logs a reason here; the batcher logs the accepted→delivered|dropped lifecycle for events
  // that DO enqueue (tinybird/adapter/batch.js). Together: no 200 without a persist-or-reason line.
  // site_id (internal id) is safe to log; never the site_key or body (PII).
  const logOutcome = (outcome, extra = '') => {
    try { console.log(`[ingest-obs] ${outcome} site_id=${req.site?.id || 'unknown'} event=${req.body?.event || '$pageview'}${extra}`) } catch (_) {}
  }
  try {
    // Silent bot drop — return 200 so crawlers don't retry/spam. INGESTION filter (isIngestion-
    // BotUserAgent) gates on "does it execute JS?": it drops JS-rendering bots (googlebot/bingbot/
    // applebot render pages and DO land here — else they pollute events as fake visitors) plus
    // automation + HTTP libraries, but NOT the no-JS link-preview crawler tokens (whatsapp/telegram/…)
    // that collide with real in-app-WebView humans. An ingestion drop deletes the event forever.
    const ua = req.headers['user-agent'] || ''
    if (isIngestionBotUserAgent(ua)) {
      logOutcome('rejected', ' reason=bot')
      return res.status(200).json({ success: true, data: { received: true, filtered: 'bot' }, error: null })
    }

    // LOG-ONLY (log-only bot measurement): a request that survived the UA drop
    // above may still trip the EXPANDED heuristic (ua_extra / header_shape).
    // Measure what we WOULD catch — do NOT drop. Logs a coarse UA hash only.
    logWouldDropBot('track', req)

    // LOG-ONLY automation-score observation. PURELY ADDITIVE: nothing reads this value to
    // filter, drop, classify, or meter. It is logged AFTER the UA drop above on purpose, so the
    // sample is "requests that survived the existing filter" — the only population where a new
    // signal could tell us anything. Deciding what any score MEANS comes after there is real
    // observed data, not before; there is deliberately no threshold anywhere in this codebase.
    // Logs site_id (internal id), NEVER site_key (§6.5), and a coarse UA hash, never a raw UA
    // (§6 treats raw UA as fingerprinting-adjacent).
    const autoScore = Number(req.body?.auto_score)
    if (Number.isFinite(autoScore)) {
      console.log(`[bot-filter][automation-score] site_id=${req.site?.id} score=${autoScore} ua_hash=${coarseUaHash(ua)}`)
    }

    // Check path exclusions
    if (req.body?.page_url && isPathExcluded(req.body.page_url, req.site?.excluded_paths)) {
      logOutcome('rejected', ' reason=excluded_path')
      return res.status(200).json({ success: true, data: { received: true, filtered: 'excluded_path' }, error: null })
    }

    const customParams = extractCustomParams(req.body?.page_url, req.site?.custom_url_params)

    // Ingest-side query parameter redaction to prevent PII leaks
    if (req.body) {
      // Normalize destination_url if present to strip query strings and hash fragments (outbound link privacy)
      if (req.body.properties && typeof req.body.properties === 'object' && req.body.properties.destination_url) {
        try {
          const parsedDest = new URL(req.body.properties.destination_url)
          req.body.properties.destination_url = parsedDest.origin + parsedDest.pathname
        } catch (_) {
          let dest = String(req.body.properties.destination_url)
          const qIdx = dest.indexOf('?')
          if (qIdx > -1) dest = dest.substring(0, qIdx)
          const hIdx = dest.indexOf('#')
          if (hIdx > -1) dest = dest.substring(0, hIdx)
          req.body.properties.destination_url = dest
        }
      }

      req.body = redactPiiFromObject(req.body)
      if (req.body.properties && typeof req.body.properties === 'object' && !Array.isArray(req.body.properties)) {
        req.body.properties = redactPiiFromObject(req.body.properties)
      }
    }

    const enriched = enrich(req)
    const clientTimestamp = req.body?.timestamp ? sanitizeClientTimestamp(req.body.timestamp) : null

    // ── Shared field validators (used by form_submit and booking_scheduled) ──
    const validateFormMetadata = (val) => {
      if (typeof val !== 'string') return null
      const cleaned = val.trim()
      if (cleaned.length === 0 || cleaned.length > 120) return null
      const lower = cleaned.toLowerCase()
      if (lower.includes('@')) return null
      const digitCount = (lower.match(/\d/g) || []).length
      if (digitCount >= 6) return null
      if (
        lower.includes('sk_') ||
        lower.includes('pk_') ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('auth') ||
        lower.includes('key') ||
        lower.includes('pass') ||
        lower.includes('card') ||
        lower.includes('cc_')
      ) {
        return null
      }
      if (lower.includes('http://') || lower.includes('https://')) return null
      return cleaned
    }

    const validateFormActionHost = (val) => {
      if (typeof val !== 'string') return null
      const cleaned = val.trim().toLowerCase()
      if (cleaned.length === 0 || cleaned.length > 100) return null
      if (cleaned.includes('@')) return null
      if (cleaned.includes('/') || cleaned.includes('?') || cleaned.includes('#')) return null
      if (cleaned.startsWith('javascript:')) return null
      if (!/^[a-z0-9.-]+$/.test(cleaned)) return null
      return cleaned
    }

    const validatePathname = (val) => {
      if (typeof val !== 'string') return null
      let cleaned = val.trim()
      if (cleaned.length === 0 || cleaned.length > 200) return null

      // Strip query and hash first so we don't reject @ in query params
      const qIdx = cleaned.indexOf('?')
      if (qIdx > -1) cleaned = cleaned.substring(0, qIdx)
      const hIdx = cleaned.indexOf('#')
      if (hIdx > -1) cleaned = cleaned.substring(0, hIdx)

      const lower = cleaned.toLowerCase()
      if (lower.includes('@')) return null
      if (lower.startsWith('javascript:')) return null

      // Keep pathname only
      if (lower.indexOf('http://') !== -1 || lower.indexOf('https://') !== -1) {
        try {
          const u = new URL(cleaned)
          cleaned = u.pathname
        } catch (_) {
          return null
        }
      }

      // Ensure starts with '/'
      if (cleaned.length === 0) return null
      if (cleaned.charAt(0) !== '/') {
        cleaned = '/' + cleaned
      }

      // Final check on clean pathname
      if (cleaned.toLowerCase().includes('@')) return null
      return cleaned
    }

    // Ingest-side sanitization for form submit metadata
    let form_provider = null
    let form_id = null
    let form_name = null
    let form_action_host = null
    let form_action_path = null
    let page_path = null

    if (req.body?.event === 'form_submit') {
      const p = req.body.properties || {}

      if (typeof p.form_provider === 'string') {
        const fp = p.form_provider.trim().toLowerCase()
        if (['native', 'webflow', 'wordpress', 'unknown'].includes(fp)) {
          form_provider = fp
        }
      }
      if (!form_provider) form_provider = 'unknown'

      form_id = validateFormMetadata(p.form_id || req.body.form_id)
      form_name = validateFormMetadata(p.form_name || req.body.form_name)
      form_action_host = validateFormActionHost(p.form_action_host)
      form_action_path = validatePathname(p.form_action_path)
      page_path = validatePathname(p.page_path)
    }

    // Ingest-side sanitization for confirmed booking detection metadata
    let booking_provider = null
    let booking_detection_method = null
    let booking_event_type = null
    let booking_page_path = null

    if (req.body?.event === 'booking_scheduled') {
      const p = req.body.properties || {}

      if (typeof p.booking_provider === 'string') {
        const bp = p.booking_provider.trim().toLowerCase()
        if (['calendly', 'calcom'].includes(bp)) booking_provider = bp
      }

      if (typeof p.booking_detection_method === 'string') {
        const bdm = p.booking_detection_method.trim().toLowerCase()
        if (bdm === 'browser_embed_event') booking_detection_method = bdm
      }

      if (typeof p.booking_event_type === 'string') {
        const bet = p.booking_event_type.trim()
        if (['event_scheduled', 'bookingSuccessfulV2'].includes(bet)) booking_event_type = bet
      }

      booking_page_path = validatePathname(p.page_path)
    }

    // Ingest-side sanitization for chat lead capture detection metadata.
    // Mirrors the booking block above exactly. This is an ALLOWLIST: anything the
    // client sends that is not enumerated here is dropped, so a compromised or
    // modified tracker cannot widen the schema. Chat callbacks sit next to visitor
    // message content in the browser, so the server must not depend on the client
    // being well-behaved.
    let chat_provider = null
    let chat_detection_method = null
    let chat_event_type = null
    let chat_page_path = null

    if (req.body?.event === 'chat_lead_captured') {
      const p = req.body.properties || {}

      if (typeof p.chat_provider === 'string') {
        const cp = p.chat_provider.trim().toLowerCase()
        // Tawk.to deliberately absent — Phase 2. Adding it here without the
        // tracker-side work would accept a provider we never emit.
        if (['intercom', 'crisp'].includes(cp)) chat_provider = cp
      }

      if (typeof p.chat_detection_method === 'string') {
        const cdm = p.chat_detection_method.trim().toLowerCase()
        if (cdm === 'browser_embed_event') chat_detection_method = cdm
      }

      if (typeof p.chat_event_type === 'string') {
        const cet = p.chat_event_type.trim()
        if (['user_email_supplied', 'user_email_changed'].includes(cet)) chat_event_type = cet
      }

      chat_page_path = validatePathname(p.page_path)
    }

    // Pageview quota claim — 140G-4.
    // Only true $pageview events consume monthly quota. Custom events, conversions,
    // and outbound clicks are excluded. Claim happens here (after all filtering/validation)
    // to avoid burning quota for events that would have been dropped.
    // Fail-open on RPC/DB errors: a counter failure must never block tracking.
    const eventName = req.body?.event || '$pageview'
    let overQuota = false
    if (eventName === '$pageview') {
      try {
        const pvCheck = await claimPageviewUsage(req.site)
        // Only the HARD CAP drops. Past the soft (plan) limit we keep collecting and flag
        // it: dropping would destroy the event permanently, and a gap in an attribution
        // stream produces confidently WRONG numbers rather than missing ones (§6).
        if (pvCheck.state === 'hard_cap') {
          console.warn('[track] Pageview HARD CAP reached for site', req.site?.id, '— limit:', pvCheck.limit, '— skipping capture')
          logOutcome('limit-blocked', ` reason=pageview_hard_cap limit=${pvCheck.limit} hard_cap=${pvCheck.hardCap}`)
          // 402 shape unchanged — clients branch on limit_reached.
          return res.status(402).json({
            success: false,
            data: { received: false, limit_reached: true },
            error: 'Monthly pageview limit reached'
          })
        }
        overQuota = pvCheck.overQuota
      } catch (pvErr) {
        // Fail open — DB/RPC error must not block tracking. Log clearly per 140G-4 tradeoff.
        console.error('[track] Pageview limit check failed, failing open:', pvErr?.message, { site_id: req.site?.id })
      }
    }

    // distinctId hoisted to a const (behavior-identical) computed ONCE so the
    // additive Tinybird dual-write below carries the IDENTICAL anonymous
    // distinct_id ph.capture received — calling uuidv4() a second time here
    // would silently break visitor stitching between PostHog and Tinybird for
    // anonymous pageviews (tinybird/archive/PHASE2C_PAGEVIEW_DUALWRITE_PLAN.md §2.1).
    const distinctId = req.body.anonymous_id || uuidv4()
    // properties hoisted to a const (behavior-identical) so the dual-write call
    // reuses the exact same object the existing ph.capture sends.
    const pageviewProps = {
      site_id: req.site.id,
      anonymous_id: req.body.anonymous_id,
      page_url: req.body.page_url,
      referrer: req.body.referrer,
      utm_source: normalizeUtm(req.body.utm_source),
      utm_medium: normalizeUtm(req.body.utm_medium),
      utm_campaign: normalizeUtm(req.body.utm_campaign),
      utm_content: normalizeUtm(req.body.utm_content),
      utm_term: normalizeUtm(req.body.utm_term),
      ref_param: normalizeUtm(req.body.ref_param || req.body.ref),
      source_param: normalizeUtm(req.body.source_param || req.body.source),
      via_param: normalizeUtm(req.body.via_param || req.body.via),
      first_touch_source: normalizeUtm(req.body.first_touch_source),
      first_touch_medium: normalizeUtm(req.body.first_touch_medium),
      first_touch_campaign: normalizeUtm(req.body.first_touch_campaign),
      first_touch_timestamp: sanitizeClientTimestamp(req.body.first_touch_timestamp),
      ...normalizeClickIds(req.body),
      utm_id: normalizeUtm(req.body.utm_id),
      st_campaign_id: normalizeUtm(req.body.st_campaign_id),
      st_adgroup_id: normalizeUtm(req.body.st_adgroup_id),
      st_ad_id: normalizeUtm(req.body.st_ad_id),
      st_target_id: normalizeUtm(req.body.st_target_id),
      st_network: sanitizeValueTrack(req.body.st_network),
      st_device: sanitizeValueTrack(req.body.st_device),
      st_matchtype: sanitizeValueTrack(req.body.st_matchtype),
      st_verify: sanitizeVerificationToken(req.body.st_verify),
      ai_source: enriched.ai_source,
      device_type: enriched.device_type,
      browser_name: enriched.browser_name,
      browser_version: enriched.browser_version,
      os_name: enriched.os_name,
      os_version: enriched.os_version,
      country: enriched.country,
      server_timestamp: enriched.server_timestamp,
      ingestion_method: 'server_routed',
      ...(req.body?.event === 'form_submit' ? {
        event_type: 'form_submit',
        form_provider: form_provider,
        form_id: form_id,
        form_name: form_name,
        form_action_host: form_action_host,
        form_action_path: form_action_path,
        page_path: page_path
      } : {}),
      ...(req.body?.event === 'booking_scheduled' ? {
        event_type: 'booking_scheduled',
        booking_provider: booking_provider,
        booking_detection_method: booking_detection_method,
        booking_event_type: booking_event_type,
        page_path: booking_page_path
      } : {}),
      ...(req.body?.event === 'chat_lead_captured' ? {
        event_type: 'chat_lead_captured',
        chat_provider: chat_provider,
        chat_detection_method: chat_detection_method,
        chat_event_type: chat_event_type,
        page_path: chat_page_path
      } : {}),
      // Feature: custom event properties — any object passed as `properties` is spread
      // Excluded for form_submit, booking_scheduled and chat_lead_captured (fixed
      // schemas, no passthrough).
      //
      // ⚠️ chat_lead_captured MUST stay in this condition. Without it the entire raw
      // client `properties` object lands in custom_properties unfiltered — and for a
      // chat event that is the exact PII path the allowlist above exists to close
      // (email, name, message text). The allowlist alone does NOT protect this: it
      // only decides which TYPED columns are populated, it does not stop the bag.
      // Removing 'chat_lead_captured' here silently reopens the hole.
      ...((req.body?.event === 'form_submit' || req.body?.event === 'booking_scheduled' || req.body?.event === 'chat_lead_captured')
        ? {}
        : req.body.properties && typeof req.body.properties === 'object' && !Array.isArray(req.body.properties)
          ? { custom_properties: req.body.properties }
          : {}),
      ...customParams
    }

    // Wave-2 pageview cutover: Tinybird is the SOLE writer here (ph.capture removed;
    // flag-gated OFF -> no-op + no network when off).
    // No natural id on this path -> deriveEventId falls to a uuid.
    const enqueued = dualWriteEvent({ distinctId, event: req.body.event || '$pageview', timestamp: clientTimestamp, properties: pageviewProps })
    // Tinybird is the SOLE writer here — if dual-write is ON but the event did NOT enqueue (no
    // transport wired, or normalize rejected it), this 200 persists NOTHING. Make it visible.
    // (Flag OFF is an intentional dev no-op, not logged. A normalize throw is already logged in
    // dual-write.js; this catches the no-transport case and is a belt on the whole path.)
    if (!enqueued && isDualWriteEnabled()) {
      logOutcome('not-enqueued', ' reason=dualwrite_returned_false stage=pageview')
    }

    // Form conversion auto-promotion
    if (req.body?.event === 'form_submit') {
      const isIgnore = req.body.properties?.ignore_conversion === true
      if (!isIgnore && isLeadForm({ form_id, form_name, form_action_path, page_path })) {
        const anonId = req.body.anonymous_id || uuidv4()
        const isDup = checkIsDuplicate(req.site.id, anonId, req.body.page_url, false, 'form', 0, false)
        if (isDup) logOutcome('dedup-skipped', ' stage=form_conversion')
        if (!isDup) {
          // Monthly conversion METER (fail-open on DB errors). Metering only — it never
          // refuses the write. Unlike the other eight sites this one gated the write with
          // an `if (limitAllowed) { … }` wrapper rather than an early return, so the fix
          // is to drop the wrapper; the block below is now unconditional.
          try {
            await claimConversionUsage(req.site)
          } catch (limitErr) {
            console.error('[track] conversion meter failed, continuing (metering must never block revenue):', limitErr.message || limitErr)
          }

          {
            // Register conversion in the shared deduplication cache
            registerConversion(req.site.id, anonId, req.body.page_url, false, 'form', 0, false)

            // Construct standard conversion properties
            const conversionProps = {
              site_id: req.site.id,
              site_key: req.site.site_key,
              anonymous_id: anonId,
              user_id: typeof req.body.user_id === 'string' ? req.body.user_id.trim() : null,
              is_conversion: true,
              conversion_type: 'form',
              form_name: form_name || null,
              form_id: form_id || null,
              form_provider: form_provider || 'unknown',
              form_action_host: form_action_host || null,
              form_action_path: form_action_path || null,
              page_url: req.body.page_url,
              page_path: page_path || null,
              referrer: req.body.referrer,
              utm_source: normalizeUtm(req.body.utm_source),
              utm_medium: normalizeUtm(req.body.utm_medium),
              utm_campaign: normalizeUtm(req.body.utm_campaign),
              utm_content: normalizeUtm(req.body.utm_content),
              utm_term: normalizeUtm(req.body.utm_term),
              ref_param: normalizeUtm(req.body.ref_param || req.body.ref),
              source_param: normalizeUtm(req.body.source_param || req.body.source),
              via_param: normalizeUtm(req.body.via_param || req.body.via),
              first_touch_source: normalizeUtm(req.body.first_touch_source),
              first_touch_medium: normalizeUtm(req.body.first_touch_medium),
              first_touch_campaign: normalizeUtm(req.body.first_touch_campaign),
              first_touch_timestamp: sanitizeClientTimestamp(req.body.first_touch_timestamp),
              ...normalizeClickIds(req.body),
              utm_id: normalizeUtm(req.body.utm_id),
              st_campaign_id: normalizeUtm(req.body.st_campaign_id),
              st_adgroup_id: normalizeUtm(req.body.st_adgroup_id),
              st_ad_id: normalizeUtm(req.body.st_ad_id),
              st_target_id: normalizeUtm(req.body.st_target_id),
              st_network: sanitizeValueTrack(req.body.st_network),
              st_device: sanitizeValueTrack(req.body.st_device),
              st_matchtype: sanitizeValueTrack(req.body.st_matchtype),
              st_verify: sanitizeVerificationToken(req.body.st_verify),
              ai_source: enriched.ai_source,
              device_type: enriched.device_type,
              browser_name: enriched.browser_name,
              browser_version: enriched.browser_version,
              os_name: enriched.os_name,
              os_version: enriched.os_version,
              country: enriched.country,
              server_timestamp: enriched.server_timestamp,
              ingestion_method: 'server_routed',
              ...customParams
            }

            // Wave-2 cutover: Tinybird is the SOLE writer for this form $conversion
            // (ph.capture removed; flag-gated OFF -> no-op + no network when off).
            // Placed INSIDE the !isDup + limitAllowed guards, so a deduped/limited
            // form never dual-writes. No natural id on the form path -> uuid.
            dualWriteEvent({ distinctId: anonId, event: '$conversion', timestamp: clientTimestamp, properties: conversionProps })
          }
        }
      }
    }

    // Update telemetry metadata asynchronously & throttled (non-blocking)
    // We use req.site from auth middleware which caches basic details
    try {
      const lastSeenAt = req.site.last_seen_at ? new Date(req.site.last_seen_at).getTime() : 0
      const lastSeenIsStale = !lastSeenAt || Number.isNaN(lastSeenAt) || Date.now() - lastSeenAt > 5 * 60 * 1000
      const shouldUpdate = lastSeenIsStale

      if (shouldUpdate) {
        // Execute without awaiting to avoid blocking response
        updateTelemetryMetadata(req.site, req.body).catch(() => {});
      }
    } catch (_) {}

    // over_quota is present ONLY when the site is past its plan limit, so a client can
    // surface it without having to poll billing. Absent on the normal path by design.
    res.status(200).json({ success: true, data: { received: true, ...(overQuota ? { over_quota: true } : {}) }, error: null })
  } catch (err) {
    console.error('[track] ingestion error:', err?.message, { site_id: req.site?.id, event: req.body?.event })
    res.status(500).json({ success: false, data: null, error: 'Track failed' })
  }
}