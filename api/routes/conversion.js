import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import NodeCache from 'node-cache'
import { ph } from '../lib/posthog.js'
import { dispatchWebhook } from '../lib/webhook.js'
import { dispatchCapi } from '../lib/conversion-sync.js'
import { resolveCapiEventId } from '../lib/capi-event-id.js'
import { getSupabase } from '../lib/supabase.js'
import { normalizeUtm, getFirstTouchFields, redactPiiFromObject, isPathExcluded, extractCustomParams, sanitizeClientTimestamp, sanitizeValueTrack, sanitizeVerificationToken, normalizeClickIds } from '../lib/utils.js'
import { hasFeature } from '../lib/plan-features.js'
import { resolveClientIp } from '../lib/ip-resolver.js'
import { claimIdempotencyKeys, rollbackIdempotencyKeys } from '../lib/idempotency.js'
import { storeIdentityLink } from '../lib/identity-links.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { checkIsDuplicate, registerConversion } from '../lib/shared-dedupe-cache.js'
import { dualWriteEvent } from '../../tinybird/adapter/dual-write.js'


// In-memory dedup cache — 24h TTL. Fast path that catches the common case
// (double-click, beacon retry) without a DB round-trip.
// Keys: external_event_id (site_id:order_id:type) → true
// The in-memory cache resets on process restart, so we ALSO consult the
// persistent `revenue_idempotency_keys` table (via claimIdempotencyKeys)
// whenever a stable order_id is present — that catches duplicates that
// straddle a Railway redeploy or container restart.
const dedupCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 })
const BROWSER_CONVERSION_PROVIDER = 'browser_conversion'

// In-memory per-site dedupe log/map. Stores Timestamp + Key Type per site ID.
// Structure: siteId (Number) -> Array of { timestamp: Number, keyType: String }
const dedupeEventsLog = new Map()

export function getDedupeSummary(siteId) {
  if (!siteId) {
    return {
      duplicates_blocked_24h: null,
      last_duplicate_at: null,
      last_duplicate_key_type: null,
      dedupe_window_hours: 24,
      status: 'unknown',
      message: 'Deduplication status is unavailable right now.'
    }
  }

  const log = dedupeEventsLog.get(siteId) || []
  const now = Date.now()
  const oneDayAgo = now - 24 * 60 * 60 * 1000
  const recentLog = log.filter(e => e.timestamp > oneDayAgo)

  // Prune old entries to keep memory usage low
  if (log.length !== recentLog.length) {
    dedupeEventsLog.set(siteId, recentLog)
  }

  const count = recentLog.length
  if (count === 0) {
    return {
      duplicates_blocked_24h: 0,
      last_duplicate_at: null,
      last_duplicate_key_type: null,
      dedupe_window_hours: 24,
      status: 'quiet',
      message: 'No duplicate conversions detected in the last 24 hours.'
    }
  }

  const lastEvent = recentLog[recentLog.length - 1]
  return {
    duplicates_blocked_24h: count,
    last_duplicate_at: new Date(lastEvent.timestamp).toISOString(),
    last_duplicate_key_type: lastEvent.keyType,
    dedupe_window_hours: 24,
    status: 'active',
    message: `SourceTrack blocked ${count} duplicate conversion${count === 1 ? '' : 's'} in the last 24 hours.`
  }
}

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
      last_event_name: body.event || '$conversion',
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

function enrich(req, ip) {
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

// Alias kept for the CAPI block readability — same singleton underneath.
const getCapiSupabase = getSupabase

export async function conversion(req, res) {
  try {
    const clientIp = resolveClientIp(req)

    // Check path exclusions
    if (req.body?.page_url && isPathExcluded(req.body.page_url, req.site?.excluded_paths)) {
      return res.status(200).json({ success: true, data: { received: true, filtered: 'excluded_path' }, error: null })
    }

    const customParams = extractCustomParams(req.body?.page_url, req.site?.custom_url_params)

    // Ingest-side query parameter redaction to prevent PII leaks
    if (req.body) {
      req.body = redactPiiFromObject(req.body)
      if (req.body.properties && typeof req.body.properties === 'object' && !Array.isArray(req.body.properties)) {
        req.body.properties = redactPiiFromObject(req.body.properties)
      }
    }

    const enriched = enrich(req, clientIp)

    const userId = typeof req.body.user_id === 'string' ? req.body.user_id.trim() : null
    const anonymousId = typeof req.body.anonymous_id === 'string' ? req.body.anonymous_id.trim() : null

    if (userId && anonymousId && userId !== anonymousId) {
      // Non-blocking storage
      storeIdentityLink(req.site.id, userId, anonymousId, 'browser_conversion')
    }

    const props = {
      site_id: req.site.id,
      site_key: req.site.site_key,
      anonymous_id: anonymousId || null,
      user_id: userId || null,
      is_conversion: true,
      conversion_value: req.body.conversion_value,
      ...getFirstTouchFields(req.body),
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
      // Feature: custom event properties — any object passed as `properties` is merged in
      ...(req.body.properties && typeof req.body.properties === 'object' && !Array.isArray(req.body.properties)
        ? { custom_properties: req.body.properties }
        : {}),
      ...customParams
    }

    if (typeof req.body.conversion_type === 'string') {
      const ct = req.body.conversion_type.trim()
      if (ct.length > 0) props.conversion_type = ct
    }
    if (typeof req.body.form_name === 'string') {
      const fn = req.body.form_name.trim().slice(0, 120).replace(/[^a-zA-Z0-9 _-]/g, '')
      if (fn.length > 0) props.form_name = fn
    }

    const orderId = req.body.order_id || req.body.orderId || null
    // Dedup id: client-supplied event_id > deterministic order-based id > null.
    const externalEventId = resolveCapiEventId(req.body, req.site.id, props.conversion_type)
    props.external_event_id = externalEventId
    if (orderId) {
      props.order_id = orderId
    }
    // Meta match-quality cookies (read-only — the merchant's own _fbp/_fbc set by
    // their Meta Pixel) forwarded only to Meta CAPI. Structured ids, not PII.
    if (typeof req.body.fbp === 'string' && /^[\w.\-]{1,128}$/.test(req.body.fbp)) props.fbp = req.body.fbp
    if (typeof req.body.fbc === 'string' && /^[\w.\-]{1,256}$/.test(req.body.fbc)) props.fbc = req.body.fbc
    // Short-window process-local cross-deduplication check
    const incomingType = props.conversion_type || 'form'
    const incomingValue = Number(props.conversion_value) || 0
    const incomingHasOrderId = !!orderId
    const isShortWindowDup = anonymousId ? checkIsDuplicate(
      req.site.id,
      anonymousId,
      req.body.page_url,
      true, // isExplicit
      incomingType,
      incomingValue,
      incomingHasOrderId
    ) : false

    if (isShortWindowDup) {
      try {
        const siteId = req.site?.id
        if (siteId) {
          const log = dedupeEventsLog.get(siteId) || []
          const now = Date.now()
          const oneDayAgo = now - 24 * 60 * 60 * 1000
          const recentLog = log.filter(e => e.timestamp > oneDayAgo)
          recentLog.push({ timestamp: now, keyType: 'short_window' })
          dedupeEventsLog.set(siteId, recentLog)
        }
      } catch (err) {
        console.error('[dedupe-stats] failed to log short-window duplicate event:', err?.message)
      }
      return res.status(200).json({ success: true, data: { received: true, dedup_skipped: true, short_window: true }, error: null })
    }

    // Deduplication — two layers, both keyed on (site, order_id, type):
    //   1. In-memory NodeCache — fast path for the common double-click case.
    //   2. Persistent revenue_idempotency_keys table — survives restarts and
    //      catches duplicates whose first event predates the current process.
    //
    // Anonymous, no-order_id "button click" conversions are NOT deduped here
    // — they have no stable key and merging them would silently drop real
    // events. We only dedupe when the client gave us an order_id.
    if (externalEventId) {
      const recordDuplicate = () => {
        try {
          const siteId = req.site?.id
          if (siteId) {
            const log = dedupeEventsLog.get(siteId) || []
            const now = Date.now()
            const oneDayAgo = now - 24 * 60 * 60 * 1000
            const recentLog = log.filter(e => e.timestamp > oneDayAgo)
            const keyType = (req.body.order_id || req.body.orderId) ? 'order_id' : 'derived'
            recentLog.push({ timestamp: now, keyType })
            dedupeEventsLog.set(siteId, recentLog)
          }
        } catch (err) {
          console.error('[dedupe-stats] failed to log duplicate event:', err?.message)
        }
      }

      if (dedupCache.get(externalEventId)) {
        recordDuplicate()
        return res.status(200).json({ success: true, data: { received: true, dedup_skipped: true }, error: null })
      }

      // Persistent claim — fail-open on DB error: a Supabase/RPC failure
      // falls through to "not a duplicate" so we never drop legitimate
      // revenue on an outage. The fast cache is set only AFTER a successful
      // claim so a duplicate can't poison the cache on a transient DB
      // failure.
      const siteKey = req.site?.site_key
      if (siteKey && (req.body.order_id || req.body.orderId)) {
        try {
          const claim = await claimIdempotencyKeys(siteKey, BROWSER_CONVERSION_PROVIDER, [{
            key_type: 'order_event',
            key_value: externalEventId
          }])
          if (claim.duplicate) {
            dedupCache.set(externalEventId, true)
            recordDuplicate()
            return res.status(200).json({
              success: true,
              data: { received: true, dedup_skipped: true, persistent: true },
              error: null
            })
          }
        } catch (err) {
          console.error('[conversion-dedupe] persistent claim failed:', err?.message)
          // Fall through — better to risk a duplicate than drop revenue on a DB hiccup.
        }
      }

    }

    // Enforce monthly conversion limits (fail-open on DB errors)
    let limitCheckAllowed = true
    try {
      const limitCheck = await claimConversionUsage(req.site)
      if (!limitCheck.allowed) {
        limitCheckAllowed = false
      }
    } catch (limitErr) {
      console.error('[conversion] Conversion limit check failed, failing open:', limitErr.message || limitErr)
    }

    if (!limitCheckAllowed) {
      if (externalEventId && req.site?.site_key && (req.body.order_id || req.body.orderId)) {
        try {
          await rollbackIdempotencyKeys(req.site.site_key, BROWSER_CONVERSION_PROVIDER, [{
            key_type: 'order_event',
            key_value: externalEventId
          }])
        } catch (rollbackErr) {
          console.error('[conversion] Failed to rollback idempotency keys after conversion limit block:', rollbackErr.message || rollbackErr)
        }
      }
      return res.status(402).json({
        success: false,
        data: null,
        error: 'Conversion limit reached for your plan'
      })
    }

    if (externalEventId) {
      dedupCache.set(externalEventId, true)
    }

    // Register conversion in the shared deduplication cache
    if (anonymousId) {
      registerConversion(
        req.site.id,
        anonymousId,
        req.body.page_url,
        true, // isExplicit
        incomingType,
        incomingValue,
        incomingHasOrderId
      )
    }

    const clientTimestamp = req.body?.timestamp ? sanitizeClientTimestamp(req.body.timestamp) : null

    // distinctId hoisted to a const (behavior-identical) so the inline uuidv4()
    // fallback is computed ONCE and the additive Tinybird dual-write shares the
    // exact same distinct_id the existing ph.capture uses.
    const distinctId = req.body.anonymous_id || uuidv4()

    ph.capture({
      distinctId,
      event: '$conversion',
      timestamp: clientTimestamp ? new Date(clientTimestamp) : undefined,
      properties: props
    })

    // Additive Tinybird dual-write (flag-gated OFF; no-op + no network when off).
    // Reached ONLY after every guard returned: short-window dedup (:261), in-memory
    // dedupCache (:304), the PERSISTENT claimIdempotencyKeys duplicate skip (:321),
    // and the plan-limit block (:349) — so a conversion the existing claim SKIPS
    // never dual-writes. props.external_event_id (:239, resolveCapiEventId) lets
    // deriveEventId branch-2 resolve the SAME id offline computes -> cross-dedup.
    dualWriteEvent({ distinctId, event: '$conversion', timestamp: clientTimestamp, properties: props })

    // CAPI sync — fire async, never block response. Gated by plan; free tier
    // skips the outbound fan-out entirely to keep costs down.
    if (hasFeature(req.site?.plan, 'capi_server_side')) try {
      getCapiSupabase()
        .from('sites')
        .select('id,meta_pixel_id,meta_capi_token,google_ads_customer_id,google_ads_conversion_action_id,google_ads_developer_token,microsoft_tag_id,microsoft_capi_token,linkedin_partner_id,linkedin_capi_token')
        .eq('id', req.site.id)
        .single()
        .then(({ data: capiSite }) => {
          if (!capiSite) return
          // Fan-out + per-platform delivery log (writes capi_deliveries rows).
          dispatchCapi(getCapiSupabase(), capiSite, { ...props, ip_address: clientIp })
            .catch(err => console.error('[CAPI dispatch]', err?.message))
        })
    } catch (_capiErr) { /* never block conversion response */ }

    dispatchWebhook('conversion', props)

    // Update telemetry metadata asynchronously & throttled (non-blocking)
    try {
      const lastSeenAt = req.site.last_seen_at ? new Date(req.site.last_seen_at).getTime() : 0
      const lastSeenIsStale = !lastSeenAt || Number.isNaN(lastSeenAt) || Date.now() - lastSeenAt > 5 * 60 * 1000
      const shouldUpdate = lastSeenIsStale

      if (shouldUpdate) {
        updateTelemetryMetadata(req.site, req.body).catch(() => {});
      }
    } catch (_) {}

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (err) {
    console.error('[conversion] ingestion error:', err?.message, { site_id: req.site?.id, type: req.body?.conversion_type })
    res.status(500).json({ success: false, data: null, error: 'Conversion failed' })
  }
}
