// POST /api/server/crawler-hit — the ingest route for AI/search crawler fetches.
//
// The producer is a customer-installed server/edge hook (integrations/express-crawler-
// middleware.js today). Rows land in the `crawler_hits` Tinybird datasource and nowhere
// else.
//
// ── Why this is NOT POST /api/server/event ───────────────────────────────────────────
// Three independent reasons, each sufficient on its own:
//   1. /event calls dualWriteEvent(), which writes `events` / `events_by_visitor`. Bot
//      rows there would sit inside every visitor, session, top-page and attribution
//      aggregate that reads `events` — the exact pollution api/lib/bot-filter.js drops
//      JS-rendering bots at ingestion to prevent (incident 2026-07-14), and the reason
//      crawler_hits.datasource exists as a separate table at all.
//   2. /event meters. Its complement-of-conversion rule (server-events.js:110-158) means
//      every non-conversion event consumes the site's pageview allowance. A crawler fetch
//      is not a billable customer event, and billing a customer for GPTBot would be a
//      real charge for someone else's robot.
//   3. Its scope is write:events. See api/lib/api-key-scopes.js on why a credential
//      deployed across a customer's edge should not carry the revenue rail's write.
//
// THERE IS NO METER ON THIS PATH — neither claimPageviewUsage nor claimConversionUsage is
// imported here, and neither may ever be. If you find yourself adding one, the answer is
// that this endpoint was the wrong place for whatever you are doing.
//
// ── Privacy (§6, §6.5) ───────────────────────────────────────────────────────────────
// No raw IP is accepted, stored, or logged — the request IP is an input to verification
// at the COLLECTION point and is discarded there; it never reaches the wire. No
// User-Agent, no query string, no visitor/distinct id. `site_id` comes from the
// authenticated API key, never from the payload; `site_key` is never touched. Because no
// column here is subject-linkable, `crawler_hits` stays outside the three GDPR paths —
// a single subject-linkable field added here would move it into all three.
//
// ── Auth block is duplicated from server-events.js on purpose ────────────────────────
// The two routes share ~20 lines of key lookup but diverge on scope, metering and write
// target. Extracting a shared helper would mean editing the heavily-annotated metering
// path in server-events.js to serve a route that deliberately has no metering (§3:
// don't refactor what isn't broken). Duplicated, and noted here so it stays visible.

import { Router } from 'express'
import { createHash } from 'crypto'
import { getSupabase } from '../lib/supabase.js'
import { requireFeature } from '../lib/plan-features.js'
import { trackGlobalIpLimit } from '../middleware/rate-limit.js'
import { hasScope, SCOPE_WRITE_CRAWLER_HITS } from '../lib/api-key-scopes.js'
import { AI_CRAWLERS, VERIFICATION } from '../lib/ai-crawler-detect.js'

const router = Router()

// Bot identity is looked up in the registry by name and the operator/category are taken
// FROM the registry — never from the payload. A caller could otherwise write arbitrary
// strings into three LowCardinality columns and split one vendor across several report
// rows. The caller names the bot; the registry says what it is.
const BOTS_BY_NAME = new Map(AI_CRAWLERS.map((bot) => [bot.name, bot]))

const VALID_VERIFICATIONS = new Set(Object.values(VERIFICATION))

// crawler_hits.collection_source — kept in sync with the datasource comment.
const VALID_COLLECTION_SOURCES = new Set(['edge_middleware', 'cdn_log', 'origin_log', 'server_api'])

const MAX_PATH_LENGTH = 512

// Mirrors safePath() in integrations/express-crawler-middleware.js. Applied AGAIN here
// rather than trusted: the producer runs on the customer's infrastructure and can be
// modified, and a query string routinely carries UTMs, session tokens and email
// addresses. Defence in depth on the one field that could carry PII.
function safePath (value) {
  const raw = typeof value === 'string' && value.length > 0 ? value : '/'
  const cut = raw.split('?')[0].split('#')[0]
  return (cut || '/').slice(0, MAX_PATH_LENGTH)
}

/**
 * Validate a reported hit and build the exact row `crawler_hits` accepts.
 *
 * Returns { ok: true, row } or { ok: false, reason }. A `reason` is surfaced to the
 * caller verbatim so a producer that drifts from the registry finds out WHY nothing was
 * recorded, instead of reading a 200 as "stored".
 */
export function buildCrawlerHitRow (body, siteId) {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'missing_payload' }

  const bot = BOTS_BY_NAME.get(typeof body.bot_name === 'string' ? body.bot_name : '')
  // Not a crawler in the registry. Could be producer drift, could be junk. Either way we
  // cannot honestly say which crawler this was, so nothing is written — an unrecognised
  // name stored verbatim would appear in the report as a crawler we never verified.
  if (!bot) return { ok: false, reason: 'unknown_bot' }

  // Passed through verbatim, and this is a real trust boundary worth naming: verification
  // is determined at the COLLECTION point (that is where the IP is), so the API is taking
  // the reporting tenant's word for their own data. That is acceptable because the row is
  // only ever readable by the tenant that reported it — a customer can only mislead
  // themselves — but it is why `collection_source` is stored alongside it. What is NOT
  // acceptable is inventing a value: an unrecognised verification drops the row rather
  // than being coerced to `ua_only`, which would fabricate a verdict nobody reached.
  const verification = typeof body.verification === 'string' ? body.verification : ''
  if (!VALID_VERIFICATIONS.has(verification)) return { ok: false, reason: 'invalid_verification' }

  const collectionSource = typeof body.collection_source === 'string' ? body.collection_source : ''
  if (!VALID_COLLECTION_SOURCES.has(collectionSource)) return { ok: false, reason: 'invalid_collection_source' }

  // UInt16 in the datasource. Anything outside that range is a producer bug, not a status
  // code; 0 records "no status reported" rather than silently wrapping.
  const rawStatus = Number(body.status_code)
  const statusCode = Number.isInteger(rawStatus) && rawStatus >= 0 && rawStatus <= 65535 ? rawStatus : 0

  // The producer's clock, because that is when the fetch actually happened. An
  // unparseable/absent timestamp falls back to now — the row is still real, only its
  // timing is ours. ISO-8601 is what DateTime64(3, 'UTC') ingests (see
  // tinybird/adapter/normalize.js:255).
  const parsed = Date.parse(body.timestamp)
  const timestamp = Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString()

  return {
    ok: true,
    row: {
      site_id: siteId,
      timestamp,
      bot_name: bot.name,
      operator: bot.operator,
      category: bot.category,
      verification,
      path: safePath(body.path),
      status_code: statusCode,
      collection_source: collectionSource
    }
  }
}

// Direct POST to the Tinybird Events API — the same minimal, non-`events` write pattern
// api/lib/privacy-suppression.js:86 uses. Deliberately NOT the dual-write batcher: that
// is wired to the `events` datasource and gated by TINYBIRD_DUAL_WRITE.
//
// Throws on any failure. A failed write must never be reported to the caller as a
// success (§6 / #413) — the route maps a throw to a 5xx.
async function writeCrawlerHit (row) {
  const host = process.env.TINYBIRD_HOST
  const token = process.env.TINYBIRD_APPEND_TOKEN

  if (!host || !token) {
    // Loud, like tinybird/adapter/conversion-write.js:83. Silently 200-ing on a
    // misconfigured server would report a durable write that never happened.
    throw new Error('TINYBIRD_HOST/TINYBIRD_APPEND_TOKEN not configured — refusing to silently drop a crawler hit')
  }

  const url = `${host.replace(/\/$/, '')}/v0/events?name=crawler_hits`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(row) + '\n'
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Tinybird Events API responded ${res.status}: ${text}`)
  }
}

// trackGlobalIpLimit: the same limiter /api/server/event uses. Reused rather than sized
// separately because the traffic shape is the same — one customer origin reporting from
// a small set of egress IPs — and its 10k/min/IP default sits far above what any single
// origin's bot traffic reaches. A crawler-specific cap would be a number invented without
// data. Note the limiter keys on the reporting SERVER's IP, not a visitor's.
router.post('/crawler-hit', trackGlobalIpLimit, async (req, res) => {
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

    // Fail-closed, same as server-events.js:41. A key whose scopes are '{}' (the DB
    // default), null, or missing this scope is denied. write:events does NOT satisfy it —
    // see api/lib/api-key-scopes.js for why that is the intended answer and not an
    // oversight.
    if (!hasScope(apiKey.scopes, SCOPE_WRITE_CRAWLER_HITS)) {
      return res.status(403).json({
        success: false,
        data: null,
        error: `API key is not authorized for this endpoint (requires the '${SCOPE_WRITE_CRAWLER_HITS}' scope)`
      })
    }

    const siteId = apiKey.site_id
    const { data: site, error: siteErr } = await getSupabase()
      .from('sites')
      // `plan` only. server-events.js also needs pv_limit for its pageview meter; there
      // is no meter here, so there is nothing to size against.
      .select('plan')
      .eq('id', siteId)
      .maybeSingle()

    if (siteErr || !site) {
      return res.status(401).json({ success: false, data: null, error: 'Invalid site associated with API key' })
    }

    // API keys ARE the api_access feature, so the same gate that guards /api/server/event
    // guards this. Not a second, crawler-specific entitlement — this endpoint is reached
    // only by an API key, and a plan that cannot use API keys cannot reach it.
    const block = requireFeature(site.plan, 'api_access', 'API access')
    if (block) {
      return res.status(402).json(block)
    }

    const built = buildCrawlerHitRow(req.body, siteId)

    // FAIL-OPEN on a bad payload, matching the producer's own contract: the middleware
    // wraps every path so an internal error degrades to doing nothing, and it swallows
    // the response entirely. A 4xx storm from here would show up in the customer's logs
    // as an error they cannot act on, for a row we were never going to store anyway.
    //
    // But NOT a fake success (#413): the 200 says `recorded: false` and names the reason.
    // The status code is what keeps the producer quiet; the BODY is what stays honest.
    // Nothing in this response may ever claim a write that did not happen.
    if (!built.ok) {
      return res.status(200).json({
        success: true,
        data: { recorded: false, reason: built.reason },
        error: null
      })
    }

    // Awaited: a 200 here means the row is durably in Tinybird. Any failure throws to the
    // catch below and becomes a 502, never a silent drop behind a success.
    await writeCrawlerHit(built.row)

    await getSupabase()
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id)

    return res.status(200).json({ success: true, data: { recorded: true }, error: null })
  } catch (err) {
    console.error('[server-crawler-hits] write failed:', err?.message || err)
    // 502, not 200. The write is the entire point of the request; a caller (or its
    // onError hook) that sees a 2xx is entitled to believe the hit was recorded.
    return res.status(502).json({ success: false, data: null, error: 'Crawler hit write failed' })
  }
})

export { router as serverCrawlerHitsRouter }
