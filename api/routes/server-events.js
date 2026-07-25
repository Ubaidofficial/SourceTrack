import { Router } from 'express'
import { createHash } from 'crypto'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { getSupabase } from '../lib/supabase.js'
import { requireFeature } from '../lib/plan-features.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { storeIdentityLink, resolveAnonymousId } from '../lib/identity-links.js'
import { trackGlobalIpLimit } from '../middleware/rate-limit.js'
import { dualWriteEvent } from '../../tinybird/adapter/dual-write.js'
import { resolveClientIp } from '../lib/ip-resolver.js'
import { hasScope, SCOPE_WRITE_EVENTS } from '../lib/api-key-scopes.js'

const router = Router()

router.post('/event', trackGlobalIpLimit, async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, data: null, error: 'Missing API key' })
    }

    const rawKey = authHeader.split(' ')[1]
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const { data: apiKey, error: keyErr } = await getSupabase()
      .from('api_keys')
      .select('id, site_id, scopes')
      .eq('key_hash', keyHash)
      .maybeSingle()

    if (keyErr || !apiKey) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid API key' })
    }

    // KI-43: scope check belongs with auth (a property of the credential), so it runs before
    // plan entitlement. Fail-closed — a key whose scopes are '{}' (the DB default, i.e. any
    // non-app INSERT), null, or missing this scope is denied, never allowed through.
    if (!hasScope(apiKey.scopes, SCOPE_WRITE_EVENTS)) {
      return res.status(403).json({
        success: false,
        data: null,
        error: `API key is not authorized for this endpoint (requires the '${SCOPE_WRITE_EVENTS}' scope)`
      })
    }

    const siteId = apiKey.site_id
    const { data: site, error: siteErr } = await getSupabase()
      .from('sites')
      .select('plan')
      .eq('id', siteId)
      .maybeSingle()

    if (siteErr || !site) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid site associated with API key' })
    }

    const block = requireFeature(site.plan, 'api_access', 'API access')
    if (block) {
      return res.status(402).json(block)
    }

    // Monthly conversion-cap gate, mirroring the seven sibling ingestion routes (track,
    // conversion, conversion-offline, proxy, webhook-incoming, stripe-webhook,
    // shopify-webhook). This route was the one unmetered ingestion path: its only
    // middleware is trackGlobalIpLimit, which is an IP rate limit, not a plan cap.
    //
    // Runs BEFORE any side effect (storeIdentityLink below writes on a non-blocking path),
    // so a rejected conversion leaves nothing behind.
    //
    // WHAT MAKES AN EVENT A CONVERSION HERE IS THE PAYLOAD, NOT THE EVENT NAME. The public
    // contract (dashboard/src/pages/developers/DevelopersApi.jsx) documents `event` as a
    // free-form label — "Event label. Defaults to $pageview" — and its own worked example
    // posts "purchase_completed" with conversion_value. Keying on event === '$conversion'
    // would let the documented example through unmetered. `!= null` rather than truthiness
    // so an explicit conversion_value of 0 (a real $0 lead conversion) still meters.
    //
    // Self-asserted refunds are deliberately NOT exempt here, unlike stripe-webhook.js:295
    // and shopify-webhook.js:303 where refund-ness is derived from the PROVIDER's event.
    // conversion_type is caller-supplied on this route, so exempting it would make
    // `conversion_type: 'refund'` a one-line cap bypass on the monetization rail.
    const isConversion = req.body.event === '$conversion' ||
      req.body.conversion_value != null ||
      req.body.conversion_type != null

    if (isConversion) {
      // Fail-open on a limit-check DB error, matching every sibling: a limit-check outage
      // must not become an ingestion outage.
      let allowed = true
      try {
        // The `sites` select above returns ONLY `plan`. claimConversionUsage throws when
        // site.id is missing, and that throw would be swallowed by the fail-open catch —
        // yielding a gate that silently never blocks. Pass the API key's site id explicitly.
        const limitCheck = await claimConversionUsage({ id: siteId, plan: site.plan })
        if (!limitCheck.allowed) allowed = false
      } catch (limitErr) {
        console.error('[server-events] Conversion limit check failed, failing open:', limitErr.message || limitErr)
      }

      if (!allowed) {
        // DELIBERATE DIVERGENCE from the stripe/shopify siblings' 200 {ignored:true}
        // (founder-decided 2026-07-25): that shape is right for a third-party webhook
        // sender, which retries on 4xx, and wrong for a first-party API client, which can
        // read and act on a 402. Returning 200 {received:true} while dropping the event
        // would also be the #413 fake-success violation. Do not "fix" this to match the
        // webhooks in a consistency pass.
        return res.status(402).json({
          success: false,
          data: null,
          error: 'Conversion limit reached for your plan',
          error_code: 'conversion_limit_reached'
        })
      }
    }

    const customerIp = req.body.user_ip || resolveClientIp(req) || ''
    const customerUa = req.body.user_agent || req.headers['user-agent'] || ''
    const parser = new UAParser(customerUa)

    let country = null
    if (customerIp) {
      const geo = geoip.lookup(customerIp)
      country = geo?.country || null
    }

    const userId = typeof req.body.user_id === 'string' ? req.body.user_id.trim() : null
    const anonymousId = typeof req.body.anonymous_id === 'string' ? req.body.anonymous_id.trim() : null

    let distinctId
    let resolvedAnonymousId = null
    let stitchingMethod = 'none'

    if (anonymousId) {
      distinctId = anonymousId
      stitchingMethod = 'anonymous_id'
      if (userId && userId !== anonymousId) {
        // Non-blocking storage
        storeIdentityLink(siteId, userId, anonymousId, 'server_event')
      }
    } else if (userId) {
      resolvedAnonymousId = await resolveAnonymousId(siteId, userId)
      if (resolvedAnonymousId) {
        distinctId = resolvedAnonymousId
        stitchingMethod = 'user_id_resolved'
      } else {
        distinctId = userId
        stitchingMethod = 'user_id'
      }
    } else {
      distinctId = uuidv4()
      stitchingMethod = 'none'
    }

    const eventTimeStr = req.body.timestamp || new Date().toISOString()

    // Properties hoisted to a const (behavior-identical) so the additive Tinybird
    // dual-write below reuses the exact same object the existing ph.capture sends.
    const properties = {
      site_id: siteId,
      anonymous_id: anonymousId || resolvedAnonymousId || null,
      user_id: userId || null,
      has_resolved_anonymous_id: !!resolvedAnonymousId,
      stitching_method: stitchingMethod,
      page_url: req.body.page_url || null,
      referrer: req.body.referrer || null,
      utm_source: req.body.utm_source || null,
      utm_medium: req.body.utm_medium || null,
      utm_campaign: req.body.utm_campaign || null,
      utm_content: req.body.utm_content || null,
      utm_term: req.body.utm_term || null,
      conversion_value: req.body.conversion_value || null,
      conversion_type: req.body.conversion_type || null,
      device_type: parser.getDevice().type || 'desktop',
      country,
      server_timestamp: eventTimeStr,
      ingestion_method: 'server_sdk',
      ...(req.body.properties || {})
    }

    // Wave-2b cutover: Tinybird is the SOLE writer here (ph.capture removed;
    // flag-gated OFF -> no-op + no network when off).
    // No natural id on the server-events path -> deriveEventId falls to a uuid.
    dualWriteEvent({ distinctId, event: req.body.event || '$pageview', timestamp: eventTimeStr, properties })

    await getSupabase()
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id)

    return res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, data: null, error: 'Server event failed' })
  }
})

export { router as serverEventsRouter }
