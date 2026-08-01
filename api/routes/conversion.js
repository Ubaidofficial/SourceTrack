import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import NodeCache from 'node-cache'
import { dispatchWebhook } from '../lib/webhook.js'
import { dispatchCapi, attachGoogleAdsConnection } from '../lib/conversion-sync.js'
import { resolveCapiEventId } from '../lib/capi-event-id.js'
import { getSupabase } from '../lib/supabase.js'
import { normalizeUtm, getFirstTouchFields, redactPiiFromObject, isPathExcluded, extractCustomParams, sanitizeClientTimestamp, sanitizeValueTrack, sanitizeVerificationToken, normalizeClickIds } from '../lib/utils.js'
import { hasFeature } from '../lib/plan-features.js'
import { resolveClientIp } from '../lib/ip-resolver.js'
import { claimIdempotencyKeys, rollbackIdempotencyKeys } from '../lib/idempotency.js'
import { storeIdentityLink } from '../lib/identity-links.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { normalizeCurrencyCode } from '../lib/currency.js'
import { checkIsDuplicate, registerConversion } from '../lib/shared-dedupe-cache.js'
import { dualWriteEvent } from '../../tinybird/adapter/dual-write.js'
import { logWouldDropBot } from '../lib/bot-filter.js'


// In-memory dedup cache — 24h TTL. Fast path that catches the common case
// (double-click, beacon retry) without a DB round-trip.
// Keys: external_event_id (site_id:order_id:type) → true
// The in-memory cache resets on process restart, so we ALSO consult the
// persistent `revenue_idempotency_keys` table (via claimIdempotencyKeys)
// whenever a stable order_id is present — that catches duplicates that
// straddle a Railway redeploy or container restart.
const dedupCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 })
const BROWSER_CONVERSION_PROVIDER = 'browser_conversion'

// Durable idempotency key for a conversion, or null when it can't be durably keyed.
// Fires for ANY non-null external_event_id (client-supplied event_id OR order-derived) — NOT
// only when order_id exists (the fixed bug: a client event_id with no order_id was guarded by
// the per-replica in-memory cache alone, so duplicates crossed replicas/redeploys). Distinct
// key_type namespaces the no-order_id case so a client event_id can never COLLIDE with an
// order-derived key_value — the unique constraint is (site_key, provider, key_type, key_value).
export function buildConversionDedupeKey (externalEventId, orderId) {
  if (!externalEventId) return null
  return { key_type: orderId ? 'order_event' : 'capi_event_id', key_value: externalEventId }
}

// Test seam (mirrors attribution-engine's __setAttributionReadDeps): inject the durable claim /
// rollback / usage-limit / dual-write deps so the two-layer dedupe can be driven deterministically
// without a live DB. Defaults to the real implementations — inert in production.
let _claimIdempotencyKeys = claimIdempotencyKeys
let _rollbackIdempotencyKeys = rollbackIdempotencyKeys
let _claimConversionUsage = claimConversionUsage
let _dualWriteEvent = dualWriteEvent
export function __setConversionDedupeDeps ({ claim, rollback, usage, dualWrite } = {}) {
  if (claim) _claimIdempotencyKeys = claim
  if (rollback) _rollbackIdempotencyKeys = rollback
  if (usage) _claimConversionUsage = usage
  if (dualWrite) _dualWriteEvent = dualWrite
}
export function __resetConversionDedupeDeps () {
  _claimIdempotencyKeys = claimIdempotencyKeys
  _rollbackIdempotencyKeys = rollbackIdempotencyKeys
  _claimConversionUsage = claimConversionUsage
  _dualWriteEvent = dualWriteEvent
}
export function __flushConversionDedupeCache () { dedupCache.flushAll() }

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

    // LOG-ONLY bot measurement (log-only): this route has no UA drop today.
    // Measure what the EXPANDED heuristic (ua_extra / header_shape) WOULD catch
    // before we ever enable dropping — do NOT drop. Logs a coarse UA hash only.
    logWouldDropBot('conversion', req)

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
      // OPTIONAL unit for conversion_value. Purely additive: this rail has never offered a
      // currency, so every existing caller omits it and must keep working byte-for-byte.
      //
      // Deliberately NOT validated the way /api/conversion/offline validates it. That rail
      // REJECTS with 400 when value > 0 and currency is missing; applying the same rule here
      // would start 400-ing every customer already calling sourcetrack.conversion({ value: X }),
      // which is a breaking change on a live ingestion endpoint. Here a missing OR malformed
      // code simply omits the key, exactly as today.
      //
      // Absent → NULL on the event → NULL in attributed_conversions → collapseCurrencies()
      // reports 'partial' rather than a false 'ok'/USD (#532). That is the intended honest
      // outcome for a caller who sends no unit, not a regression.
      ...(normalizeCurrencyCode(req.body.currency)
        ? { currency: normalizeCurrencyCode(req.body.currency) }
        : {}),
      ...getFirstTouchFields(req.body),
      // Real ad-click instant, forwarded by the cookie tracker as `st_click_ts` (last-write-wins).
      // Sanitized through the SAME helper as req.body.timestamp — no second timestamp sanitizer.
      // sanitizeClientTimestamp bounds it to <=1h future / <=90d past and returns null otherwise,
      // so a malformed or spoofed value is DROPPED here rather than reaching Meta.
      //
      // Conditional spread (the `currency` precedent above), so an absent/rejected value omits the
      // key entirely instead of writing `click_timestamp: null`. sendMetaCAPI branches on presence,
      // and a null would be a positive claim of "no click" rather than "not reported".
      //
      // Lands in BOTH consumers from this one addition: `props` is dual-written to Tinybird (as an
      // untyped bag field — no schema change) and `capiEvt` is spread from `props` (:444), which is
      // built in-memory and passed synchronously to dispatchCapi with no Tinybird read-back.
      ...(sanitizeClientTimestamp(req.body?.click_timestamp)
        ? { click_timestamp: sanitizeClientTimestamp(req.body.click_timestamp) }
        : {}),
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

    // Deduplication — two layers, keyed on external_event_id (client event_id OR order-derived):
    //   1. In-memory NodeCache — fast path for the common double-click case (per-replica only).
    //   2. Persistent revenue_idempotency_keys table — survives restarts/redeploys AND works
    //      across replicas; the correctness backstop. Now fires whenever external_event_id is
    //      non-null (not only when order_id exists — that gap let duplicates through).
    //
    // Truly keyless conversions (no client event_id AND no order_id -> external_event_id null)
    // are NOT deduped — no stable key, and merging them would silently drop real events.
    const durableKey = buildConversionDedupeKey(externalEventId, orderId)
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

      // Persistent (durable) claim — the correctness backstop the per-replica in-memory cache
      // cannot provide. Fires whenever external_event_id is non-null (client event_id OR
      // order-derived) via durableKey — closing the no-order_id gap.
      const siteKey = req.site?.site_key
      if (siteKey && durableKey) {
        try {
          const claim = await _claimIdempotencyKeys(siteKey, BROWSER_CONVERSION_PROVIDER, [durableKey])
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
          // FAIL-OPEN, LOUD (deliberate): a claim-RPC failure means "duplicate status unknown".
          // Proceeding risks a rare, RECOVERABLE duplicate (read-side dedup + the CHECK 7 monitor);
          // failing closed would DROP real revenue on a transient Supabase outage — unrecoverable
          // and worse. Logged so the fail-open is observable, not silent. Mirrors the prior contract.
          console.error('[conversion-dedupe] persistent claim failed (failing OPEN, possible duplicate):', err?.message)
        }
      }

    }

    // Monthly conversion METER (fail-open on DB errors). Metering only — it never
    // refuses the write. This used to 402 at the cap and roll the durable claim back,
    // permanently destroying a real conversion; a dropped conversion is a permanently
    // wrong revenue number, which is worse than an over-quota one.
    try {
      await _claimConversionUsage(req.site)
    } catch (limitErr) {
      console.error('[conversion] Conversion meter failed, continuing (metering must never block revenue):', limitErr.message || limitErr)
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
    // fallback is computed ONCE and the Tinybird dual-write uses a single, stable
    // distinct_id (Wave-1: Tinybird is now the sole writer for $conversion here).
    const distinctId = req.body.anonymous_id || uuidv4()

    // Wave-1 revenue cutover: Tinybird is the SOLE writer for $conversion (ph.capture removed).
    // Flag-gated OFF -> no-op + no network when off.
    // Reached ONLY after every guard returned: short-window dedup (:261), in-memory
    // dedupCache (:304), the PERSISTENT claimIdempotencyKeys duplicate skip (:321),
    // and the plan-limit block (:349) — so a conversion the existing claim SKIPS
    // never dual-writes. props.external_event_id (:239, resolveCapiEventId) lets
    // deriveEventId branch-2 resolve the SAME id offline computes -> cross-dedup.
    _dualWriteEvent({ distinctId, event: '$conversion', timestamp: clientTimestamp, properties: props })

    // CAPI sync — fire async, never block response. Gated by plan; free tier
    // skips the outbound fan-out entirely to keep costs down.
    if (hasFeature(req.site?.plan, 'capi_server_side')) try {
      getCapiSupabase()
        .from('sites')
        .select('id,meta_pixel_id,meta_capi_token,google_ads_customer_id,google_ads_conversion_action_id,google_ads_developer_token,microsoft_tag_id,microsoft_capi_token,linkedin_partner_id,linkedin_capi_token,ga4_measurement_id,ga4_api_secret,tiktok_pixel_code,tiktok_capi_token')
        .eq('id', req.site.id)
        .single()
        .then(async ({ data: capiSite }) => {
          if (!capiSite) return
          const capiEvt = { ...props, ip_address: clientIp }
          // Google's credential lives in ad_platform_connections, not on `sites`.
          // Pre-loaded here so senders stay pure (site, evt); no-ops without a click ID.
          await attachGoogleAdsConnection(getCapiSupabase(), req.site.site_key, capiSite, capiEvt)
          // Fan-out + per-platform delivery log (writes capi_deliveries rows).
          dispatchCapi(getCapiSupabase(), capiSite, capiEvt)
            .catch(err => console.error('[CAPI dispatch]', err?.message))
        })
        .catch(err => console.error('[CAPI preload]', err?.message))
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
