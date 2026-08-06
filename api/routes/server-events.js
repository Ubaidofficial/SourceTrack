import { Router } from 'express'
import { createHash } from 'crypto'
import UAParser from 'ua-parser-js'
import geoip from 'geoip-lite'
import { v4 as uuidv4 } from 'uuid'
import { getSupabase } from '../lib/supabase.js'
import { requireFeature } from '../lib/plan-features.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { claimPageviewUsage } from '../lib/pageview-limits.js'
import { storeIdentityLink, resolveAnonymousId } from '../lib/identity-links.js'
import { trackGlobalIpLimit } from '../middleware/rate-limit.js'
import { dualWriteEvent, isDualWriteEnabled } from '../../tinybird/adapter/dual-write.js'
import { resolveClientIp } from '../lib/ip-resolver.js'
import { hasScope, SCOPE_WRITE_EVENTS } from '../lib/api-key-scopes.js'
import { normalizeCurrencyCode } from '../lib/currency.js'

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
      // pv_limit as well as plan: it is the PER-SITE override ("set by Stripe webhook from price
      // metadata"), so metering a Starter@50K site against the plan default would be a billing
      // error, not merely a metering one. Same shape as the site.id trap #419 documented below.
      .select('plan, pv_limit')
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

    // Set by the pageview cap below when the site is past its plan limit but still
    // collecting, so the success response can carry the marker. Conversions do not touch
    // the pageview meter, so it stays false on that branch.
    let overQuota = false

    if (isConversion) {
      // Monthly conversion METER (fail-open on DB error). Metering only — it never
      // refuses the write. The 402 that used to live here is gone: conversions are never
      // dropped on any tier, because a dropped conversion is a permanently wrong revenue
      // number. (The PAGEVIEW cap below still has a real hard-cap 402 — that one drops
      // only at the safety valve, see #429.)
      try {
        // The `sites` select above returns ONLY `plan`. claimConversionUsage throws when
        // site.id is missing, and that throw would be swallowed by the fail-open catch.
        // Pass the API key's site id explicitly so the meter counts the right site.
        await claimConversionUsage({ id: siteId, plan: site.plan })
      } catch (limitErr) {
        console.error('[server-events] Conversion meter failed, continuing (metering must never block revenue):', limitErr.message || limitErr)
      }
    } else {
      // ── PAGEVIEW CAP — the complement of the conversion test above ──────────────────────────
      // #419 closed the conversion hole here and left this one open. Pageviews are the PRIMARY
      // metering unit on every plan (5k/10k/50k/150k/500k), so this was the larger hole.
      //
      // WHY THE COMPLEMENT AND NOT A LITERAL `$pageview` CHECK (founder-decided 2026-07-25):
      // `event` is caller-supplied and documented as a free-form label, so {"event":"page_view"}
      // (no $) would evade a name gate — shipping a second unmetered path immediately after
      // closing the first. Pattern-matching pageview-ish names does not help either: {"event":"x"}
      // would still be free. Complement-of-conversion is the ONLY rule under which every event on
      // this route hits exactly one meter and nothing is unmetered. Note dualWriteEvent below
      // stores `req.body.event || '$pageview'`, so an unnamed event genuinely IS a pageview.
      //
      // DELIBERATE DIVERGENCE from the tracker paths, which meter only a literal `$pageview`
      // (track.js:329, proxy.js:72) — so the same custom event costs 0 there and 1 unit here.
      // pageview-limits.js:8 ("Only called for true $pageview events") is meaningful on the
      // tracker, where OUR code picks the event name, and meaningless here, where the caller does.
      // Closing the hole beats nominal cross-route consistency. Pinned by
      // api/tests/server-events-pageview-cap.test.js — do not "fix" this in a consistency pass.
      //
      // Runs BEFORE storeIdentityLink below, so a rejected event leaves nothing behind.
      let hardCapped = false
      // ⚠️ NO INGESTION BOT FILTER HERE, DELIBERATELY. DO NOT "COMPLETE THE SET".
      //
      // /api/track, /sp/e and /sp/pixel all drop bot UAs via isIngestionBotUserAgent.
      // This route does NOT, and the asymmetry is correct: those three are BROWSER-FACING,
      // this one is SERVER-TO-SERVER. It authenticates with `Authorization: Bearer <key>`
      // against api_keys + SCOPE_WRITE_EVENTS — the caller is the CUSTOMER'S BACKEND.
      //
      // So the User-Agent on a legitimate request here is an HTTP client library, and
      // INGESTION_BOT_UA_PATTERN contains exactly those: curl/ · python-requests · axios/ ·
      // go-http · java/ · ruby/ · php/ · okhttp · node-fetch · guzzlehttp ·
      // apache-httpclient. Wiring the filter here would silently drop essentially EVERY
      // legitimate server-side event, irreversibly — §6: an ingestion drop deletes the
      // event forever, and raw user_agent is never persisted, so the loss would be
      // unmeasurable as well as permanent.
      //
      // That is the 2026-07-14 incident's exact failure mode: tightening ingestion on the
      // wrong axis and deleting real data. The filter's own axis is "does the agent EXECUTE
      // JAVASCRIPT?" (bot-filter.js:48) — a server-to-server API call never executes JS and
      // is not a bot, so the question does not apply to this rail at all.
      //
      // Guarded by api/tests/proxy-bot-filter.test.js, which asserts an axios/1.6 UA is
      // still ingested here. If that test fails because someone added a filter, the filter
      // is the bug — not the test.
      try {
        // Explicit id for the same reason the conversion gate above needs it: the `sites` select
        // returns no id, claimPageviewUsage THROWS without one, and the fail-open catch would
        // swallow that throw — yielding a gate that silently never blocks.
        const limitCheck = await claimPageviewUsage({ id: siteId, plan: site.plan, pv_limit: site.pv_limit })
        // Only the HARD CAP drops. Past the soft (plan) limit the event is still ingested and
        // flagged — dropping it would destroy it permanently (§6).
        if (limitCheck.state === 'hard_cap') hardCapped = true
        overQuota = limitCheck.overQuota
      } catch (limitErr) {
        // Fail-open, matching every sibling and pageview-limits.js:12: a limit-check outage must
        // not become an ingestion outage.
        console.error('[server-events] Pageview limit check failed, failing open:', limitErr.message || limitErr)
      }

      if (hardCapped) {
        // Same first-party-API contract #419 pinned: a 402 a client can read and act on, never a
        // 200 {received:true} while dropping the event (the #413 fake-success violation).
        // Shape unchanged — callers branch on error_code.
        return res.status(402).json({
          success: false,
          data: null,
          error: 'Monthly pageview limit reached for your plan. Events sent to this API count toward that allowance.',
          error_code: 'pageview_limit_reached'
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
      // OPTIONAL unit for conversion_value — same contract as /api/conversion: additive, never
      // validated, never a new 400. A missing or malformed code omits the key, so every existing
      // SDK caller is unaffected. Absent → NULL → 'partial' (#532), not a false 'ok'/USD.
      ...(normalizeCurrencyCode(req.body.currency)
        ? { currency: normalizeCurrencyCode(req.body.currency) }
        : {}),
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
    const enqueued = dualWriteEvent({ distinctId, event: req.body.event || '$pageview', timestamp: eventTimeStr, properties })
    // Tinybird is the SOLE writer here — if dual-write is ON but the event did NOT enqueue (no
    // transport wired, or normalize rejected it), the 200 below persists NOTHING. Make it visible.
    // (Flag OFF is an intentional dev no-op, not logged. A normalize throw is already logged in
    // dual-write.js; this catches the no-transport case.) Mirrors track.js:424-426. KNOWN_ISSUES #74:
    // observability, not durability — the drop itself is the shared architecture, unchanged here.
    if (!enqueued && isDualWriteEnabled()) {
      console.error('[server-events] not-enqueued reason=dualwrite_returned_false — 200 returned but NOTHING persisted', { site_id: siteId })
    }

    await getSupabase()
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id)

    return res.status(200).json({ success: true, data: { received: true, ...(overQuota ? { over_quota: true } : {}) }, error: null })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, data: null, error: 'Server event failed' })
  }
})

export { router as serverEventsRouter }
