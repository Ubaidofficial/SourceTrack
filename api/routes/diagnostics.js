// GET /api/diagnostics/* — the read surface behind MCP v1's five diagnostic tools.
//
// ── Why a dedicated router instead of key-auth on /api/analytics ─────────────────────
// docs/post_verdict_roadmap.md §1.3 frames the read REST API as "adding key-auth as an
// ALTERNATIVE auth mode" to the existing analytics endpoints. That is the more invasive
// half of the same idea, and it is deferred deliberately:
//
//   · A route that accepts EITHER a Supabase user JWT OR an API key has to disambiguate
//     two credentials that arrive in the same `Authorization: Bearer` slot. Every
//     dual-auth chain is a place an auth bypass hides, and the failure mode (falling
//     through to the weaker path when the stronger one rejects) is silent.
//   · Here, NO route accepts both. /api/diagnostics/* takes API keys only;
//     /api/analytics/* keeps taking user JWTs only. The two auth models are separated by
//     ROUTE, so nothing ever inspects a token to decide how to verify it.
//
// Consequence worth stating: this mount has NO app-level `requireUserAuth`, unlike
// /api/install, /api/sites, /api/hygiene and /api/dashboard which are guarded at the
// mount in api/index.js. Every route below therefore carries its own
// requireApiKeyScope(...) guard, and a route added without one is unauthenticated. The
// test suite asserts that every registered route on this router denies an unscoped key.
//
// ── TWO read scopes, split by what a leaked key would expose ─────────────────────────
// This router is the only enforcement point for both read scopes. It originally enforced a
// single `read:analytics` across all seven routes; docs/mcp_tool_policy.md §5 split that
// into read:diagnostics (the five pipeline-state routes) and read:volume (the two that
// report real business counts), and `read:analytics` was removed from the vocabulary
// outright rather than deprecated — prod api_keys is 0 rows, so nothing held it.
//
// The split is a route-level trust boundary, not a label: a read:diagnostics key gets 403
// on /leads-volume and /campaign-volume, and a read:volume key gets 403 on the five
// diagnostic routes. Adding a route to the wrong group silently widens whichever scope it
// lands under, which is exactly what the per-scope route-list assertions in
// api/tests/mcp-diagnostics-scope.test.js exist to catch.
//
// ── Truth rules (§6, CLAUDE.md) ─────────────────────────────────────────────────────
// Diagnostics report OBSERVABLE PIPELINE STATE, never narrated attribution. That is the
// whole reason roadmap §1.5 chose diagnostics for v1: they cannot be confidently wrong the
// way an unverified revenue number can, which keeps MCP v1 inside design.md §26 by
// construction rather than by discipline. Concretely, in here:
//   · no revenue, ROAS, CAC or attribution-model output;
//   · "no data" is reported as has_data:false, never as 0 / $0 / '—';
//   · a Tinybird read returning null fails CLOSED (503 + an explicit reason). A dead read
//     store must never be rendered as "no events".

import express from 'express'
import { getSupabase } from '../lib/supabase.js'
import { requireApiKeyScope } from '../middleware/api-key-scope.js'
import { SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME } from '../lib/api-key-scopes.js'
import { queryTinybirdPipe, isTinybirdReadEnabled } from '../lib/tinybird-read.js'
import { volumeOnly } from '../lib/volume-only-guard.js'

const router = express.Router()

// Two guard instances, each applied per-route below. Applying either with router.use()
// would work today but would silently un-guard nothing while making a future unguarded
// route look guarded — per-route is explicit and is what the test asserts against. With
// two scopes on one router that reasoning gets stronger, not weaker: a mount-level guard
// would have to be the LOOSER of the two, and every route it covered would inherit it.
const requireReadDiagnostics = requireApiKeyScope(SCOPE_READ_DIAGNOSTICS)
const requireReadVolume = requireApiKeyScope(SCOPE_READ_VOLUME)

const ok = (res, data) => res.json({ success: true, data, error: null })

// ── 1. get_workspace_context ─────────────────────────────────────────────────────────
// What the agent is looking at. No metrics — identity and configuration only, so an agent
// can state which site/timezone/window its later answers refer to instead of guessing.
router.get('/workspace-context', requireReadDiagnostics, (req, res) => {
  const s = req.apiKeySite
  return ok(res, {
    site_id: s.id,
    // `domain` and `name` are the customer's own labels and are safe to return to the
    // holder of that site's key. `site_key` is deliberately ABSENT (§6.5: never expose a
    // raw site_key), and so is anything about other sites in the workspace — one key is
    // one site.
    domain: s.domain || null,
    name: s.name || null,
    timezone: s.timezone || 'UTC',
    attribution_window_days: s.attribution_window_days ?? null,
    onboarding_completed: s.onboarding_completed === true,
    created_at: s.created_at || null
  })
})

// ── 2. get_site_health ───────────────────────────────────────────────────────────────
// Is this site plumbed in at all? Deliberately answerable without the read store, so it
// still works when Tinybird is the thing that is broken.
router.get('/site-health', requireReadDiagnostics, (req, res) => {
  const s = req.apiKeySite
  const lastSeen = s.last_seen_at ? new Date(s.last_seen_at) : null
  const validLastSeen = lastSeen && !Number.isNaN(lastSeen.getTime()) ? lastSeen : null

  return ok(res, {
    // The tracker has been seen iff we have a timestamp. No timestamp is reported as
    // script_detected:false WITH last_seen_at:null — never as an invented "0 days ago".
    script_detected: validLastSeen !== null,
    last_seen_at: validLastSeen ? validLastSeen.toISOString() : null,
    hours_since_last_seen: validLastSeen
      ? Math.floor((Date.now() - validLastSeen.getTime()) / 3600000)
      : null,
    onboarding_completed: s.onboarding_completed === true,
    plan: s.plan || null,
    // Trial state is a fact about the workspace, not a billing action. Reported as the
    // raw boundary so the agent does no arithmetic of its own.
    trial_ends_at: s.trial_ends_at || null
  })
})

// ── 3. get_data_quality ──────────────────────────────────────────────────────────────
// The latest row per check_name from the nightly data-quality job. Same reduction as
// GET /api/analytics/data-quality/latest, which is the user-authed twin of this read.
router.get('/data-quality', requireReadDiagnostics, async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('data_quality_reports')
      .select('check_name, status, value, threshold, message, checked_at')
      .eq('site_id', String(req.apiKeySite.id))
      .order('checked_at', { ascending: false })
      .limit(100)
    if (error) throw error

    const seen = new Set()
    const checks = []
    for (const row of (data || [])) {
      if (seen.has(row.check_name)) continue
      seen.add(row.check_name)
      checks.push(row)
    }

    // The job having never run for this site is NOT "all checks passing". Say so.
    if (checks.length === 0) {
      return ok(res, { has_data: false, reason: 'no data-quality report has been generated for this site yet' })
    }

    return ok(res, { has_data: true, checks, latest_at: checks[0].checked_at })
  } catch (err) {
    console.error('[diagnostics/data-quality]', err?.message || err)
    return res.status(500).json({ success: false, data: null, error: 'Data quality fetch failed' })
  }
})

// ── 4. debug_data_flow ───────────────────────────────────────────────────────────────
// Attribution COVERAGE, not attribution results: of the conversions recorded in the
// window, how many carry a usable source, and how many arrived with UTM/click-id tagging.
// These are pipeline-completeness percentages — they say nothing about which channel
// deserves credit, which is what keeps this on the §26-safe side of the line.
router.get('/data-flow', requireReadDiagnostics, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90)
    const fromDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const toDate = new Date().toISOString().slice(0, 10)

    const DENY = new Set(['direct', 'unknown', ''])
    const isKnown = (v) => v != null && !DENY.has(String(v).trim().toLowerCase())

    // Paged for the same reason /api/analytics/coverage pages: the implicit 1000-row cap
    // would silently truncate the denominator and inflate every percentage below.
    const PAGE = 1000
    let offset = 0
    let total = 0
    let covered = 0
    let tagged = 0
    for (;;) {
      const { data, error } = await getSupabase()
        .from('attributed_conversions')
        .select('first_touch_channel, last_touch_channel, confidence_signals')
        .eq('site_id', String(req.apiKeySite.id))
        .gte('conversion_date', fromDate)
        .lte('conversion_date', toDate)
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const rows = data || []
      for (const r of rows) {
        total++
        if (isKnown(r.first_touch_channel) || isKnown(r.last_touch_channel)) covered++
        let sig = r.confidence_signals || {}
        if (typeof sig === 'string') { try { sig = JSON.parse(sig) } catch { sig = {} } }
        if (sig.has_utm === true || sig.has_click_id === true) tagged++
      }
      if (rows.length < PAGE) break
      offset += PAGE
    }

    // Zero conversions in the window is "nothing to measure", not "0% coverage".
    if (total === 0) {
      return ok(res, { has_data: false, window_days: days, reason: 'no conversions recorded in this window' })
    }

    return ok(res, {
      has_data: true,
      window_days: days,
      conversions: total,
      source_attributed: covered,
      source_attributed_pct: Math.round((covered / total) * 1000) / 10,
      utm_or_clickid_tagged_pct: Math.round((tagged / total) * 1000) / 10
    })
  } catch (err) {
    console.error('[diagnostics/data-flow]', err?.message || err)
    return res.status(500).json({ success: false, data: null, error: 'Data flow check failed' })
  }
})

// ── 5. verify_events ─────────────────────────────────────────────────────────────────
// Is the ingest rail actually receiving events? This is the one read that must reach
// Tinybird, and therefore the one that has to fail closed.
router.get('/verify-events', requireReadDiagnostics, async (req, res) => {
  // Flag off is a KNOWN state, not a failure: say which it is rather than returning a
  // shape that reads like "no events".
  if (!isTinybirdReadEnabled()) {
    return res.status(503).json({
      success: false,
      data: null,
      error: 'Event verification is unavailable: the analytics read store is not enabled for this deployment'
    })
  }

  const rows = await queryTinybirdPipe('events_health_last', { site_id: String(req.apiKeySite.id) })

  // null = the read store is unreachable after retries. It is NOT "zero events".
  // Returning has_data:false here would tell an agent the customer's tracking is broken
  // when in fact OUR read path is — the single most damaging thing this tool could say.
  if (rows === null) {
    return res.status(503).json({
      success: false,
      data: null,
      error: 'Event verification is unavailable: the analytics read store did not respond. This is a SourceTrack-side read failure and says nothing about whether your events are arriving.'
    })
  }

  // [] is a real, served answer: the pipe ran and this site has no events.
  const lastTs = rows.length > 0 ? rows[0].timestamp : null
  if (!lastTs) {
    return ok(res, { has_data: false, reason: 'the read store returned no events for this site' })
  }

  const last = new Date(lastTs)
  const validLast = Number.isNaN(last.getTime()) ? null : last
  return ok(res, {
    has_data: validLast !== null,
    last_event_at: validLast ? validLast.toISOString() : null,
    minutes_since_last_event: validLast
      ? Math.floor((Date.now() - validLast.getTime()) / 60000)
      : null
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// VOLUME TOOLS (6 + 7) — counts only.
//
// ── The touch convention, stated rather than defaulted ───────────────────────────────
// A "source" or "campaign" for a lead is meaningless until you say WHICH touch you
// mean, and that choice exists whether or not a caller can see it. These tools take no
// attribution_model parameter, so the convention is FIXED — and because a fixed
// convention that is never stated is just an invisible default, every row below carries
// `touch: "first"` in its own output.
//
// FIRST-touch, for three reasons:
//   1. /api/leads — the user-facing leads surface — defaults to first_touch. An agent
//      answering "how many leads from google" must not contradict the dashboard a human
//      is reading beside it. Divergence between the two is worse than either choice.
//   2. `first_touch_by_site` coalesces to 'direct'/'none' in the pipe itself, so the
//      partition is COMPLETE by construction: untagged traffic is a named bucket, not a
//      silently dropped row. A last-touch read would hand back NULLs to bucket by hand.
//   3. Both reads are already-deployed pipes; last-touch source would need pipe work,
//      and Tinybird deploys are founder-gated.
// Neither touch is "computed" here — first_touch_source and utm_campaign are both stored
// columns. So this is a labelling choice about which stored column to report, NOT this
// tool running an attribution model.
//
// ── What is deliberately absent ──────────────────────────────────────────────────────
// No revenue, conversion_value, cost, ROAS, CPL, CAC — and no attribution_model
// parameter. `first_touch_by_site` DOES return a revenue column; these handlers project
// named fields explicitly and then run stripFinancialFields over the finished payload.
// Building attribution/revenue tools is a separate, deferred decision.

const TOUCH = 'first'

// ClickHouse DateTime bounds for the pipes, derived the same way attribution-engine.js
// derives them (space separator, no trailing Z).
function windowBounds (days) {
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400000)
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
  return { from: fmt(from), to: fmt(to) }
}

function clampDays (raw) {
  return Math.min(Math.max(parseInt(raw, 10) || 30, 1), 90)
}

// Shared fail-closed preamble. A dead read store must never be rendered as "no leads" —
// that would tell a customer their pipeline is empty when in fact OUR read path is down.
function readStoreUnavailable (res, what) {
  return res.status(503).json({
    success: false,
    data: null,
    error: `${what} is unavailable: the analytics read store did not respond. This is a SourceTrack-side read failure and says nothing about your actual volumes.`
  })
}

// ── 6. get_leads_volume ──────────────────────────────────────────────────────────────
// How many leads, and how they split by one dimension. Counts only.
router.get('/leads-volume', requireReadVolume, async (req, res) => {
  if (!isTinybirdReadEnabled()) {
    return res.status(503).json({
      success: false, data: null,
      error: 'Leads volume is unavailable: the analytics read store is not enabled for this deployment'
    })
  }

  const ALLOWED_DIMENSIONS = ['source', 'medium', 'campaign']
  const dimension = ALLOWED_DIMENSIONS.includes(String(req.query.dimension || '').toLowerCase())
    ? String(req.query.dimension).toLowerCase()
    : 'source'
  const days = clampDays(req.query.days)
  const { from, to } = windowBounds(days)
  const siteId = String(req.apiKeySite.id)

  try {
    // Two reads with DIFFERENT UNITS — see the note in the response. Both must succeed;
    // either returning null is a read-store failure, not an empty result.
    const [countRows, breakdownRows] = await Promise.all([
      queryTinybirdPipe('leads_count', { site_id: siteId, date_from_ts: from, date_to_ts: to }),
      queryTinybirdPipe('first_touch_by_site', { site_id: siteId, date_from: from, date_to: to })
    ])
    if (countRows === null || breakdownRows === null) return readStoreUnavailable(res, 'Leads volume')

    const distinctLeads = Number(countRows[0]?.leads_count) || 0

    // Aggregate the pipe's (source, medium, campaign) grouping down to the requested
    // dimension. `revenue` on these rows is NEVER read — only `conversions`.
    const buckets = new Map()
    let breakdownTotal = 0
    for (const row of breakdownRows) {
      // The pipe coalesces source→'direct' and medium→'none'; campaign has no coalesce,
      // so an untagged campaign becomes an explicit '(untagged)' bucket rather than a
      // dropped row. A partition that omits the untagged remainder implies a whole the
      // named rows are not.
      const raw = row[dimension]
      const key = (raw === null || raw === undefined || String(raw).trim() === '')
        ? '(untagged)'
        : String(raw)
      const n = Number(row.conversions) || 0
      buckets.set(key, (buckets.get(key) || 0) + n)
      breakdownTotal += n
    }

    if (distinctLeads === 0 && breakdownTotal === 0) {
      return ok(res, volumeOnly({
        has_data: false, window_days: days, touch: TOUCH,
        reason: 'the read store returned no conversions for this site in this window'
      }, 'leads-volume'))
    }

    const rows = [...buckets.entries()]
      .map(([dimension_value, conversions]) => ({ dimension_value, conversions, touch: TOUCH }))
      .sort((a, b) => b.conversions - a.conversions)

    return ok(res, volumeOnly({
      has_data: true,
      window_days: days,
      touch: TOUCH,
      distinct_leads: distinctLeads,
      breakdown: {
        dimension,
        unit: 'conversions',
        total: breakdownTotal,
        complete: true, // every conversion lands in a bucket, incl. '(untagged)'
        rows
      },
      note: 'distinct_leads counts unique converting visitors; breakdown.total counts conversion events. Different units — they are not expected to be equal, and breakdown rows sum to breakdown.total, not to distinct_leads. Dimension values reflect the FIRST touch.'
    }, 'leads-volume'))
  } catch (err) {
    console.error('[diagnostics/leads-volume]', err?.message || err)
    return res.status(500).json({ success: false, data: null, error: 'Leads volume fetch failed' })
  }
})

// ── 7. get_campaign_volume ───────────────────────────────────────────────────────────
// Visitors and leads per campaign. No revenue column exists on either read.
router.get('/campaign-volume', requireReadVolume, async (req, res) => {
  if (!isTinybirdReadEnabled()) {
    return res.status(503).json({
      success: false, data: null,
      error: 'Campaign volume is unavailable: the analytics read store is not enabled for this deployment'
    })
  }

  const days = clampDays(req.query.days)
  const { from, to } = windowBounds(days)
  const siteId = String(req.apiKeySite.id)
  // model is pinned to the router's stated convention and is NOT caller-controllable.
  const params = { site_id: siteId, date_from: from, date_to: to, model: 'first_touch' }

  try {
    const [sessionRows, leadRows] = await Promise.all([
      queryTinybirdPipe('flexible_report_campaign_sessions_by_site', params),
      queryTinybirdPipe('flexible_report_campaign_leads_by_site', params)
    ])
    if (sessionRows === null || leadRows === null) return readStoreUnavailable(res, 'Campaign volume')

    // Both pipes emit nullIf(campaign,'') → a NULL dim_value for untagged traffic. That
    // row is KEPT and named, never filtered: untagged is usually the largest bucket, and
    // dropping it would make every named campaign look like a larger share of the whole.
    const UNTAGGED = '(untagged)'
    const norm = (v) => (v === null || v === undefined || String(v).trim() === '') ? UNTAGGED : String(v)

    const merged = new Map()
    const bump = (rowsIn, field) => {
      for (const r of rowsIn || []) {
        const key = norm(r.dim_value)
        const entry = merged.get(key) || { campaign: key, visitors: 0, leads: 0, touch: TOUCH }
        entry[field] += Number(r.metric_value) || 0
        merged.set(key, entry)
      }
    }
    bump(sessionRows, 'visitors')
    bump(leadRows, 'leads')

    if (merged.size === 0) {
      return ok(res, volumeOnly({
        has_data: false, window_days: days, touch: TOUCH,
        reason: 'the read store returned no campaign activity for this site in this window'
      }, 'campaign-volume'))
    }

    const campaigns = [...merged.values()].sort((a, b) => b.visitors - a.visitors || b.leads - a.leads)

    return ok(res, volumeOnly({
      has_data: true,
      window_days: days,
      touch: TOUCH,
      campaigns,
      totals: {
        visitors: campaigns.reduce((s, c) => s + c.visitors, 0),
        leads: campaigns.reduce((s, c) => s + c.leads, 0)
      },
      complete: true, // untagged traffic is included as its own campaign bucket
      note: 'visitors counts distinct visitors with a pageview in the window; leads counts lead-type conversion events. Untagged traffic is reported as the "(untagged)" campaign rather than omitted. Campaign values reflect the FIRST touch. No revenue or cost is reported by this tool.'
    }, 'campaign-volume'))
  } catch (err) {
    console.error('[diagnostics/campaign-volume]', err?.message || err)
    return res.status(500).json({ success: false, data: null, error: 'Campaign volume fetch failed' })
  }
})

export default router
