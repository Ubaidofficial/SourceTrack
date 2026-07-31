/**
 * GDPR / Privacy endpoints
 *
 * DELETE /api/gdpr/visitor   — erase all data for one visitor (by visitor id; see SUBJECT KEY)
 * DELETE /api/gdpr/account   — full account purge (all sites + auth user)
 * PUT    /api/gdpr/retention — set data_retention_days for a site
 * GET    /api/gdpr/export    — DSAR export of one site's data as a JSON bundle
 *
 * All endpoints require a logged-in user (requireUserAuth) and verify that the
 * caller owns (or is a member of) the site they are operating on.
 */

import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { getStructuralLimits } from '../lib/plan-features.js'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'
import { eraseSubjectFromTinybird, eraseSiteFromTinybird } from '../../tinybird/adapter/erase.js'
import { fetchSubjectEventsFromTinybird } from '../../tinybird/adapter/export.js'
import { collectSuppressionEmailHashes, recordErasureSuppression } from '../lib/erasure-suppression.js'

export const gdprRouter = Router()

// Helper: resolve site record for calling user (membership-aware)
async function getSiteForUser(supabase, userId, siteKey) {
  const { data: member } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle()

  const query = supabase
    .from('sites')
    .select('id, site_key, owner_id, company_id, plan')
    .eq('site_key', siteKey)
    .limit(1)

  if (member?.company_id) {
    query.eq('company_id', member.company_id)
  } else {
    query.eq('owner_id', userId)
  }

  // A DB error MUST NOT be swallowed into a null result — that made a query failure
  // (e.g. a dropped column) surface as a 403 "access denied", masking outages as
  // permissions bugs. Surface it so the route returns 500; a DB failure and an
  // authorization failure must stay distinguishable.
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`getSiteForUser query failed: ${error.message}`)
  return data
}

// Tinybird is the SOLE event store (PostHog is a dead store — no live ph.capture in
// api/). The old best-effort PostHog-person delete erased nothing real and made this
// endpoint LOOK like it deleted events; it is removed. Event erasure now goes through
// the Tinybird eraser, whose result MUST NOT be swallowed (that swallow is how the LIE
// survived).

// Test-only injection seam (production uses the real eraser).
let _eraseSubject = eraseSubjectFromTinybird
let _eraseSite = eraseSiteFromTinybird
export function __setGdprEraseDeps ({ eraseSubject, eraseSite } = {}) {
  if (eraseSubject) _eraseSubject = eraseSubject
  if (eraseSite) _eraseSite = eraseSite
}
export function __resetGdprEraseDeps () { _eraseSubject = eraseSubjectFromTinybird; _eraseSite = eraseSiteFromTinybird }

// Test-only injection seam for the SUBJECT ACCESS reader (production uses the real
// READ-token Tinybird reader). Mirrors the erase seam above.
let _fetchSubjectEvents = fetchSubjectEventsFromTinybird
export function __setGdprExportDeps ({ fetchSubjectEvents } = {}) {
  if (fetchSubjectEvents) _fetchSubjectEvents = fetchSubjectEvents
}
export function __resetGdprExportDeps () { _fetchSubjectEvents = fetchSubjectEventsFromTinybird }

// Tinybird connection from env — NEVER hardcode, NEVER log a token value.
const tinybirdEnv = () => ({
  host: process.env.TINYBIRD_HOST,
  adminToken: process.env.TINYBIRD_ADMIN_TOKEN,
  readToken: process.env.TINYBIRD_READ_TOKEN
})

// { events: N, events_by_visitor: M } from the per-datasource matched counts.
function rowCountsOf (result) {
  const rc = {}
  for (const d of (result?.perDatasource || [])) rc[d.datasource] = d.matched
  return rc
}

// A real, confirmed delete happened ONLY when status === 'executed'. Every other status
// (skipped_not_configured | skipped_no_admin_token | dry_run | failed) means the event
// data was NOT erased — the response must not claim otherwise.
// NOTE: 'executed' means "the delete job ran", NOT "rows were found". A zero-match delete
// is still 'executed', so the ROW COUNTS — never the status alone — decide whether the
// response may claim anything was erased.
const eraseExecuted = (status) => status === 'executed'

// Total Tinybird rows the erase condition matched across datasources, or null when the
// eraser could not count (skipped/failed) — null must never be read as zero.
function tinybirdMatchedTotal (result) {
  const ds = result?.perDatasource || []
  if (!ds.length || ds.some(d => d.matched == null)) return null
  return ds.reduce((n, d) => n + Number(d.matched || 0), 0)
}

// ── SUBJECT KEY ─────────────────────────────────────────────────────────────
// The caller supplies ONE visitor identifier. Every id surfaced anywhere in the product
// is a distinct_id — the Leads table (leads-server.js:71,101), the journey modal
// (journey.js:100,160) and /analytics/recent-conversions.visitor_id all emit distinct_id,
// and there is no UI that can produce an anonymous_id. But three tables store that same
// value under an anonymous_id-shaped name:
//   attributed_conversions.distinct_id   — the real key (anonymous_id is NULL in practice)
//   lead_qualifications.visitor_id       — a distinct_id (leads-server.js:186,321,420)
//   subscription_identity.anonymous_id   — assigned conversion.distinct_id
//                                          (stripe-subscription.js:112)
// So the subject is matched across BOTH id columns wherever a table has two, mirroring
// what the Tinybird condition already does (`distinct_id = X OR visitor_id = X`,
// erase.js:51). Matching both cannot over-delete: every match is ALSO scoped by site_id,
// which is server-resolved from the caller's membership and never user input.
//
// Previously every Supabase leg matched on anonymous_id alone, so a real erasure request
// matched ZERO rows while the endpoint answered "has been erased".
const subjectOrFilter = (id) => `distinct_id.eq.${id},anonymous_id.eq.${id}`

// site_identity_links is the ONE table whose anonymous_id genuinely holds an anonymous_id
// (identify.js:139 writes it). Resolve the subject through it so a linked user_id is
// erased too, and so an anonymous_id-shaped subject still reaches distinct_id-keyed rows.
async function resolveSubjectIds (supabase, siteId, subjectId) {
  const { data, error } = await supabase
    .from('site_identity_links')
    .select('user_id, anonymous_id')
    .eq('site_id', siteId)
    .or(`anonymous_id.eq.${subjectId},user_id.eq.${subjectId}`)
  if (error) throw error
  const ids = new Set([subjectId])
  for (const r of (data || [])) {
    if (r.user_id) ids.add(r.user_id)
    if (r.anonymous_id) ids.add(r.anonymous_id)
  }
  return [...ids]
}

// Persist the erase result to erasure_log (service-role write) — the POSITIVE, provable
// signal that the attempt happened, so a failed/skipped delete is retryable rather than
// silently swallowed. Never throws into the response path.
async function logErasure (supabase, { subjectId, siteId, result }) {
  try {
    const { error } = await supabase.from('erasure_log').insert({
      subject_id: subjectId,
      site_id: siteId,
      datasources: result?.datasources || [],
      status: result?.status,
      row_counts: rowCountsOf(result),
      detail: { reason: result?.reason ?? null, perDatasource: result?.perDatasource ?? [] },
      executed_at: eraseExecuted(result?.status) ? new Date().toISOString() : null
    })
    if (error) console.error('[GDPR] erasure_log write failed:', error.message)
  } catch (e) {
    console.error('[GDPR] erasure_log write threw:', e.message)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/gdpr/visitor
// Body: { site_key, anonymous_id }
// Erases: attributed_conversions + site_identity_links (Supabase) for this visitor,
//         AND the subject's event data from Tinybird (events + events_by_visitor).
// ────────────────────────────────────────────────────────────────────────────
gdprRouter.delete('/visitor', async (req, res) => {
  try {
    const userId     = req.user?.id
    const { site_key, anonymous_id } = req.body

    if (!site_key || !anonymous_id) {
      return res.status(400).json({ success: false, error: 'site_key and anonymous_id are required' })
    }

    const supabase = getSupabase()
    const site = await getSiteForUser(supabase, userId, site_key)
    if (!site) {
      return res.status(403).json({ success: false, error: 'Site not found or access denied' })
    }

    // Resolve every identifier this subject is known by on THIS site, so a subject
    // supplied as either id shape reaches all of their rows.
    const subjectIds = await resolveSubjectIds(supabase, site.id, anonymous_id)

    // 1. Supabase legs. Every delete is site-scoped and asks for an EXACT count — the
    // count is what the response is allowed to claim. A delete matching zero rows is not
    // a Postgres error, so without counting, "erased" was unfalsifiable.
    const supabaseCounts = {}

    // attributed_conversions — distinct_id is the real key; anonymous_id is matched too
    // so an anonymous_id-shaped subject cannot silently miss.
    const { count: convCount, error: dbErr } = await supabase
      .from('attributed_conversions')
      .delete({ count: 'exact' })
      .eq('site_id', site.id)
      .or(subjectIds.map(id => subjectOrFilter(id)).join(','))
    if (dbErr) throw dbErr
    supabaseCounts.attributed_conversions = convCount ?? 0

    // lead_qualifications — visitor_id IS a distinct_id (leads-server.js:186,321,420).
    // Previously EXCLUDED as an "unverified anonymous_id↔visitor_id match": that was
    // sound while the subject key was wrongly anonymous_id, and is not once it is
    // distinct_id. Leaving it out retained visitor PII through a "completed" erasure.
    const { count: lqCount, error: lqErr } = await supabase
      .from('lead_qualifications')
      .delete({ count: 'exact' })
      .eq('site_id', site.id)
      .in('visitor_id', subjectIds)
    if (lqErr) throw lqErr
    supabaseCounts.lead_qualifications = lqCount ?? 0

    // subscription_identity — its anonymous_id column is assigned conversion.distinct_id
    // (stripe-subscription.js:112). Never erased before.
    const { count: siCount, error: siErr } = await supabase
      .from('subscription_identity')
      .delete({ count: 'exact' })
      .eq('site_id', site.id)
      .in('anonymous_id', subjectIds)
    if (siErr) throw siErr
    supabaseCounts.subscription_identity = siCount ?? 0

    // site_identity_links — the one table whose anonymous_id is genuinely an
    // anonymous_id. Delete by either side of the link across every resolved id.
    const { count: linkCount, error: linkErr } = await supabase
      .from('site_identity_links')
      .delete({ count: 'exact' })
      .eq('site_id', site.id)
      .or(`anonymous_id.in.(${subjectIds.join(',')}),user_id.in.(${subjectIds.join(',')})`)
    if (linkErr) throw linkErr
    supabaseCounts.site_identity_links = linkCount ?? 0

    // volunteered_identity — name/email a visitor VOLUNTARILY submitted via
    // identify(). Keyed by distinct_id (the subject key). This is the PII store
    // Named Contacts adds; per CLAUDE.md §6.5 it MUST be erased here in the same
    // PR that creates it.
    // Capture the email keys for the suppression record BEFORE the delete below removes them.
    // Erasure is keyed on anonymous_id/distinct_id and NEVER on email; the email exists only in
    // volunteered_identity. Read after the delete, this returns nothing and the identify()-replay
    // key is gone for good — the one key that catches a returning subject on a new device (new
    // anonymous_id, same email). Ordering here is load-bearing, not stylistic.
    const suppressionEmailHashes = await collectSuppressionEmailHashes(supabase, site.id, subjectIds)

    const { count: viCount, error: viErr } = await supabase
      .from('volunteered_identity')
      .delete({ count: 'exact' })
      .eq('site_id', site.id)
      .in('distinct_id', subjectIds)
    if (viErr) throw viErr
    supabaseCounts.volunteered_identity = viCount ?? 0

    const supabaseTotal = Object.values(supabaseCounts).reduce((a, b) => a + b, 0)

    // 2. Erase the subject's EVENT data from Tinybird (the sole event store). The
    // result is NEVER swallowed: it drives an erasure_log audit row AND an honest
    // response. eraseSubjectFromTinybird never throws — it returns a status enum.
    const { host, adminToken, readToken } = tinybirdEnv()
    const erase = await _eraseSubject({ host, adminToken, readToken, siteId: site.id, subjectId: anonymous_id, confirm: true })
    await logErasure(supabase, { subjectId: anonymous_id, siteId: site.id, result: erase })

    // Suppression record — written ONLY when PII was genuinely removed. This is the distinction
    // from erasure_log, which records attempts (dry-runs and failures) and would therefore
    // suppress people who were never erased.
    //
    // The gate is "did anything actually get deleted", NOT "did the Tinybird job report
    // executed". Both branches below that can legitimately claim a deletion reach here:
    //   * full success — Supabase rows and/or Tinybird events matched
    //   * PARTIAL (Tinybird did not erase, Supabase rows did) — the volunteered_identity row IS
    //     gone, so the subject's PII can be re-entered in the gap before the retry. Not
    //     suppressing here would leave exactly the hole this mechanism exists to close.
    // The no-match branch (nothing deleted in either store) deliberately does NOT reach here.
    const tbMatchedForSuppression = tinybirdMatchedTotal(erase) ?? 0
    if (supabaseTotal > 0 || tbMatchedForSuppression > 0) {
      await recordErasureSuppression(supabase, {
        siteId: site.id,
        subjectIds,
        emailHashes: suppressionEmailHashes,
        source: 'visitor'
      })
    }

    if (eraseExecuted(erase.status)) {
      const tbMatched = tinybirdMatchedTotal(erase)
      // 'executed' only means the delete job ran. If NOTHING matched in either store,
      // there was no data for this subject — say so. Claiming erasure here is a false
      // confirmation on an Art. 17 request, which is the defect this endpoint had.
      if (supabaseTotal === 0 && tbMatched === 0) {
        return res.status(404).json({
          success: false,
          erased: false,
          // `error` (not just `message`) because the dashboard surfaces data.error —
          // api.js:61. Without it the operator sees a bare "Request failed with status
          // 404" and cannot tell a no-match from an outage.
          error: `No data found for visitor "${anonymous_id}" on this site. Nothing was erased.`,
          message: `No data found for visitor "${anonymous_id}" on this site. Nothing was erased.`,
          tinybird_status: erase.status,
          rows_affected: { supabase: supabaseCounts, supabase_total: 0, tinybird: rowCountsOf(erase), tinybird_total: 0 }
        })
      }
      return res.json({
        success: true,
        erased: true,
        message: `Visitor data for "${anonymous_id}" has been erased (${supabaseTotal} database row(s), ${tbMatched == null ? 'unknown' : tbMatched} event row(s)).`,
        tinybird_status: erase.status,
        rows_affected: {
          supabase: supabaseCounts,
          supabase_total: supabaseTotal,
          tinybird: rowCountsOf(erase),
          tinybird_total: tbMatched
        },
        row_counts: rowCountsOf(erase)
      })
    }
    // Tinybird did NOT erase the event data — DO NOT claim erasure. Honest partial:
    // report the Supabase rows actually deleted (which may be zero), and be explicit
    // that the event data was not touched. Logged for retry.
    return res.status(200).json({
      success: false,
      partial: true,
      // Same reason as the no-match branch: without `error` this warning never reaches
      // the operator, who would be left believing the erasure completed.
      error: `${supabaseTotal} database row(s) for visitor "${anonymous_id}" were deleted, but event data in Tinybird was NOT erased (status: ${erase.status}). This has been recorded for retry.`,
      message: `${supabaseTotal} database row(s) for visitor "${anonymous_id}" were deleted, but event data in Tinybird was NOT erased (status: ${erase.status}). This has been recorded for retry.`,
      erased: { supabase: supabaseTotal > 0, tinybird_events: false },
      tinybird_status: erase.status,
      rows_affected: { supabase: supabaseCounts, supabase_total: supabaseTotal, tinybird: null, tinybird_total: null },
      detail: erase.reason ?? null
    })
  } catch (err) {
    console.error('[GDPR] visitor delete error:', err)
    return res.status(500).json({ success: false, error: 'Failed to delete visitor data' })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /api/gdpr/subject?site_key=<key>&anonymous_id=<subject>
// The Art. 15 (right of access) counterpart to DELETE /visitor: returns ONE
// data subject's data so a controller can answer a subject access request.
// Auth path is identical to /visitor (getSiteForUser — a DB error now surfaces as
// 500, a real access failure as 403). Reads the SAME rows the eraser would delete
// (buildDeleteCondition, reused) using the READ token only.
// ────────────────────────────────────────────────────────────────────────────
// TODO(art-15-suppression, opened 2026-07-31 — DO NOT resolve silently either way):
// Should this endpoint disclose an erasure_suppression record?
//
// #538 established the invariant that Art. 15 access must disclose EXACTLY what Art. 17
// erasure removes. erasure_suppression breaks the symmetry that rule assumed: it is new
// persistent state about an identifiable subject that deliberately SURVIVES their erasure,
// and this handler does not currently know it exists.
//
// For disclosure: it is retained data about the person, and the accountability argument
// (Art. 5(2)) used to justify keeping it argues equally for disclosing it.
// Against, or at least complicating: the record exists solely to enforce the subject's OWN
// request, which may sit differently under Art. 15 than ordinary processing; and confirming
// "we hold a suppression record matching this email hash" is itself information about an
// erased person, even though this endpoint is operator-authenticated and per-site.
//
// This is unresolved on purpose and is entangled with the PENDING LEGAL REVIEW recorded in
// api/lib/erasure-suppression.js and migration 20260731130000. Adding — or omitting — a
// select here without that review would be silently answering a legal question.
gdprRouter.get('/subject', async (req, res) => {
  try {
    const userId = req.user?.id
    const { site_key, anonymous_id } = req.query

    if (!site_key || !anonymous_id) {
      return res.status(400).json({ success: false, error: 'site_key and anonymous_id are required' })
    }

    const supabase = getSupabase()
    const site = await getSiteForUser(supabase, userId, site_key)
    if (!site) {
      return res.status(403).json({ success: false, error: 'Site not found or access denied' })
    }

    // 1. Event data from Tinybird — READ token ONLY (an access path must not hold
    // delete capability). Never swallowed: a store that is unavailable or errors is
    // reported loudly below, never returned as a complete-looking empty bundle.
    const { host, readToken } = tinybirdEnv()
    const events = await _fetchSubjectEvents({ host, readToken, siteId: site.id, subjectId: anonymous_id })

    if (events.status === 'failed') {
      return res.status(502).json({
        success: false,
        error: 'Event store read failed — subject export is incomplete and was NOT returned',
        tinybird_status: events.status,
        tinybird_events: events
      })
    }
    if (events.status === 'skipped_not_configured') {
      return res.status(503).json({
        success: false,
        error: 'Event store not configured — subject export cannot be produced',
        tinybird_status: events.status,
        tinybird_events: events
      })
    }

    // 2. Supabase subject-scoped rows — explicit allowlist selects (never select('*')),
    // scoped by the SAME subject key the eraser deletes on, so access and erasure can
    // never disagree about what is held. The error is NEVER swallowed: a query error
    // throws → 500, so a DB failure can never masquerade as an empty subject.
    // Previously this matched anonymous_id alone, which is NULL on every row — so a real
    // subject access request answered "we hold no data about you" while holding it.
    const subjectIds = await resolveSubjectIds(supabase, site.id, anonymous_id)

    const { data: conversions, error: convErr } = await supabase
      .from('attributed_conversions')
      .select('conversion_event_id, distinct_id, anonymous_id, conversion_date, conversion_timestamp, conversion_type, conversion_value, channel, status, first_touch_source, first_touch_medium, first_touch_campaign, first_touch_timestamp, last_touch_source, last_touch_medium, last_touch_campaign, last_touch_timestamp, touchpoint_count, processed_at')
      .eq('site_id', site.id)
      .or(subjectIds.map(id => subjectOrFilter(id)).join(','))
    if (convErr) throw convErr

    const { data: links, error: linkErr } = await supabase
      .from('site_identity_links')
      .select('anonymous_id, user_id, source, first_seen_at, last_seen_at, created_at')
      .eq('site_id', site.id)
      .or(`anonymous_id.in.(${subjectIds.join(',')}),user_id.in.(${subjectIds.join(',')})`)
    if (linkErr) throw linkErr

    // lead_qualifications + subscription_identity — now INCLUDED. Both were outside the
    // Art. 15 answer because the subject key was wrong; with distinct_id as the key the
    // mapping is verified, and the eraser deletes them, so access must disclose them.
    const { data: quals, error: qualErr } = await supabase
      .from('lead_qualifications')
      .select('visitor_id, status, qualified, created_at')
      .eq('site_id', site.id)
      .in('visitor_id', subjectIds)
    if (qualErr) throw qualErr

    const { data: subs, error: subErr } = await supabase
      .from('subscription_identity')
      .select('anonymous_id, stripe_customer_id, first_subscription_id, first_touch_source, first_touch_channel, captured_at')
      .eq('site_id', site.id)
      .in('anonymous_id', subjectIds)
    if (subErr) throw subErr

    // volunteered_identity — the name/email the subject volunteered. Art. 15
    // access MUST disclose exactly what /visitor erases (CLAUDE.md §6.5).
    const { data: volunteered, error: viErr } = await supabase
      .from('volunteered_identity')
      .select('distinct_id, email, name, source, first_seen_at, last_seen_at')
      .eq('site_id', site.id)
      .in('distinct_id', subjectIds)
    if (viErr) throw viErr

    return res.json({
      success: true,
      subject: { site_key: site.site_key, visitor_id: anonymous_id, resolved_ids: subjectIds },
      generated_at: new Date().toISOString(),
      // Zero rows across every store is a real answer ("we hold no data") — but it must be
      // stated, not inferred from empty arrays by the reader.
      has_data: (conversions.length + links.length + quals.length + subs.length + volunteered.length) > 0 ||
                Number(events?.count ?? 0) > 0,
      sources: {
        tinybird_events: events,
        attributed_conversions: { count: conversions.length, rows: conversions },
        site_identity_links: { count: links.length, rows: links },
        lead_qualifications: { count: quals.length, rows: quals },
        subscription_identity: { count: subs.length, rows: subs },
        volunteered_identity: { count: volunteered.length, rows: volunteered }
      }
    })
  } catch (err) {
    console.error('[GDPR] subject export error:', err)
    return res.status(500).json({ success: false, error: 'Failed to export subject data' })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/gdpr/account
// No body needed — deletes everything owned by req.user
// Erases: attributed_conversions for all sites, sites, company_members,
//         companies (if sole member), then the Supabase auth user
// ────────────────────────────────────────────────────────────────────────────
gdprRouter.delete('/account', async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorised' })

    const supabase = getSupabase()

    // 1. Find all sites owned by (or associated with) this user
    const { data: memberRow } = await supabase
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', userId)
      .maybeSingle()

    let shouldDeleteSites = true
    let isSoleMember = true
    const accountErase = [] // per-site Tinybird erase outcomes → drives the honest response

    if (memberRow?.company_id) {
      // Look up all members in the company
      const { data: members, error: memErr } = await supabase
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', memberRow.company_id)

      if (memErr) throw memErr

      if (members && members.length > 1) {
        isSoleMember = false
        shouldDeleteSites = false

        // Check if the deleting user is the sole owner/admin
        const isAdmin = memberRow.role === 'admin'
        const otherAdmins = members.filter(m => m.role === 'admin' && m.user_id !== userId)

        if (isAdmin && otherAdmins.length === 0) {
          return res.status(409).json({
            success: false,
            error: 'Conflict',
            message: 'You are the sole administrator of a shared workspace. Please transfer ownership or contact support before deleting your account.'
          })
        }
      }
    }

    if (shouldDeleteSites) {
      const sitesQuery = supabase.from('sites').select('id')
      if (memberRow?.company_id) sitesQuery.eq('company_id', memberRow.company_id)
      else sitesQuery.eq('owner_id', userId)

      const { data: sites } = await sitesQuery

      if (sites?.length) {
        const siteIds = sites.map(s => s.id)

        // 2. Erase each site's EVENT data from Tinybird (the sole event store) FIRST — before
        // ANY Supabase delete. Two reasons it has to be first: after the sites row is gone we
        // no longer have site.id to build the erase condition, and — the point of this ordering —
        // a Tinybird erasure that did not complete must be able to abort the whole request while
        // everything is still intact. Result is never swallowed: one erasure_log row per site.
        const { host, adminToken, readToken } = tinybirdEnv()
        for (const s of sites) {
          const erase = await _eraseSite({ host, adminToken, readToken, siteId: s.id, confirm: true })
          accountErase.push({ site_id: s.id, status: erase.status })
          await logErasure(supabase, { subjectId: `account:${userId}`, siteId: s.id, result: erase })
        }

        // 2b. THE GATE. Nothing is deleted anywhere unless EVERY site's event data is confirmed
        // erased. The previous behaviour deleted the Supabase records regardless and answered
        // `partial: true` — which left the account unrecoverable while its events lived on in
        // Tinybird, and, worse, destroyed the site rows that are the only way to identify those
        // events for a retry. An erasure that cannot be completed must leave the account exactly
        // as it was, so the user can try again and the operator can fix the cause.
        //
        // Statuses that block: 'failed', 'skipped_not_configured', 'skipped_no_admin_token'
        // (tinybird/adapter/erase.js). Only 'executed' proceeds.
        //
        // 503, not 4xx: nothing about the caller's request is wrong — a dependency did not
        // complete. Retryable, and it must never read as success (§6).
        const blocked = accountErase.filter(e => e.status !== 'executed')
        if (blocked.length > 0) {
          console.error(`[GDPR] account delete BLOCKED for ${userId}: ${blocked.length}/${accountErase.length} site erasure(s) not executed —`, blocked)
          return res.status(503).json({
            success: false,
            error: 'Erasure incomplete',
            message: 'Your event data could not be fully erased from our analytics store, so nothing has been deleted. Your account is unchanged. Please retry — if this keeps happening, contact support.',
            deleted: false,
            tinybird: accountErase
          })
        }

        // 3. Delete attributed_conversions for all sites. Reached only once every site's event
        // erasure is confirmed executed.
        await supabase
          .from('attributed_conversions')
          .delete()
          .in('site_id', siteIds)

        // 4. Delete sites. This CASCADE-deletes all site-scoped GSC data via the
        // FK `... REFERENCES sites(site_key) ON DELETE CASCADE` on each table:
        //   - gsc_connections      (incl. encrypted_refresh_token + google_account_email)
        //   - gsc_performance_daily
        //   - gsc_sync_runs
        // (see supabase/migrations/20260607212000_add_google_search_console.sql).
        // If that cascade is ever dropped, these tables must be deleted explicitly here.
        await supabase.from('sites').delete().in('id', siteIds)
      }
    }

    // 4. Remove company membership
    if (memberRow?.company_id) {
      await supabase
        .from('company_members')
        .delete()
        .eq('user_id', userId)

      // If no members left (and we are sole member), delete the company too
      if (isSoleMember) {
        const { count } = await supabase
          .from('company_members')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', memberRow.company_id)

        if (count === 0) {
          await supabase.from('companies').delete().eq('id', memberRow.company_id)
        }
      }
    }

    // 5. Delete the Supabase auth user (uses service role key)
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId)
    if (authErr) throw authErr

    // Reaching here means either every site's event data was confirmed erased, or there were
    // no sites to erase — the gate above returns 503 in every other case. The old
    // `partial: true` branch that used to live here is GONE, not merely unreachable: a
    // response claiming the account was deleted while its events survived was the defect.
    return res.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted.',
      tinybird: accountErase
    })
  } catch (err) {
    console.error('[GDPR] account delete error:', err)
    return res.status(500).json({ success: false, error: 'Failed to delete account' })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/gdpr/retention
// Body: { site_key, retention_days }  (retention_days: 30 | 90 | 180 | 365 | 0=forever)
// ────────────────────────────────────────────────────────────────────────────
gdprRouter.put('/retention', async (req, res) => {
  try {
    const userId = req.user?.id
    const { site_key, retention_days } = req.body

    const days = parseInt(retention_days, 10)
    const ALLOWED = [30, 60, 90, 180, 365, 0]
    if (!site_key || !ALLOWED.includes(days)) {
      return res.status(400).json({
        success: false,
        error: `retention_days must be one of: ${ALLOWED.join(', ')} (0 = keep forever)`
      })
    }

    const supabase = getSupabase()
    const site = await getSiteForUser(supabase, userId, site_key)
    if (!site) {
      return res.status(403).json({ success: false, error: 'Site not found or access denied' })
    }

    const limits = getStructuralLimits(site.plan)
    if (days === 0 && limits.retention_days < 1825) {
      return res.status(402).json({
        success: false,
        data: null,
        error: 'Feature not available on your plan',
        upgrade: {
          current_plan: site.plan,
          required_feature: 'keep_forever_retention',
          message: `Keep forever data retention is not available on the ${site.plan} plan. Upgrade to Scale to unlock.`,
          upgrade_url: '/billing',
        }
      })
    }
    if (days > limits.retention_days) {
      return res.status(402).json({
        success: false,
        data: null,
        error: 'Feature not available on your plan',
        upgrade: {
          current_plan: site.plan,
          required_feature: 'extended_retention',
          message: `Retention period of ${days} days exceeds the ${limits.retention_days}-day limit for the ${site.plan} plan. Upgrade to unlock.`,
          upgrade_url: '/billing',
        }
      })
    }

    const { error } = await supabase
      .from('sites')
      .update({ data_retention_days: days === 0 ? null : days })
      .eq('id', site.id)

    if (error) throw error

    return res.json({
      success: true,
      message: days === 0
        ? 'Data will be kept indefinitely.'
        : `Data older than ${days} days will be auto-purged nightly.`
    })
  } catch (err) {
    console.error('[GDPR] retention update error:', err)
    return res.status(500).json({ success: false, error: 'Failed to update retention policy' })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /api/gdpr/export?site_key=<key>
// DSAR export of ONE site's data as a single JSON bundle. Auth chain mirrors
// /api/webhooks (requireUserAuth at mount + validateSiteKey + requireSiteMembership
// here) so cross-tenant access is rejected by middleware. Every query is ALSO
// filtered by the resolved site_id/site_key in code — this runs as service-role
// and must not trust RLS alone.
// ────────────────────────────────────────────────────────────────────────────

// Mask a webhook signing secret — never serialize the raw value.
function maskSecret(secret) {
  if (!secret || typeof secret !== 'string' || secret.length < 15) return ''
  return secret.slice(0, 10) + '••••••••' + secret.slice(-4)
}

// Build the DSAR bundle for one site. `supabase` is injected so this is
// unit-testable; `site` is the membership-verified req.site ({ id, site_key,
// company_id, ... }). EXCLUDES every secret column by using explicit allowlist
// selects (never select('*') on tables that carry secrets).
export async function buildGdprExport(supabase, site, { now = () => new Date() } = {}) {
  const siteId = site.id
  const siteKey = site.site_key

  const pull = async (table, columns, column, value) => {
    const { data, error } = await supabase.from(table).select(columns).eq(column, value)
    if (error) throw new Error(`${table}: ${error.message}`)
    return data || []
  }

  const tables = {}

  // attributed_conversions — all columns (no secrets on this table), by site_id.
  tables.attributed_conversions = await pull('attributed_conversions', '*', 'site_id', siteId)

  // lead_qualifications — status trail. NOTE: schema has no created_at/updated_at;
  // qualified_at is the real timestamp column, so it stands in for them.
  tables.lead_qualifications = await pull('lead_qualifications', 'status, qualified_by, qualified_at', 'site_id', siteId)

  // site_identity_links — the tenant's own identity graph.
  tables.site_identity_links = await pull('site_identity_links', 'anonymous_id, user_id, created_at', 'site_id', siteId)

  // gsc_performance_daily — aggregates only, by site_key.
  tables.gsc_performance_daily = await pull('gsc_performance_daily', 'query, page_path, clicks, impressions, ctr, position, date', 'site_key', siteKey)

  // capi_deliveries — the site's server-side conversion-forward history (no secrets).
  tables.capi_deliveries = await pull('capi_deliveries', 'platform, event_ref, status, http_status, error_message, attempt, created_at', 'site_id', siteId)

  // gsc_connections — NON-SECRET columns only (encrypted_refresh_token excluded).
  tables.gsc_connections = await pull('gsc_connections', 'property_url, google_account_email, status, last_synced_at, created_at', 'site_key', siteKey)

  // webhook_destinations — config + MASKED secret (raw secret never serialized).
  const dests = await pull('webhook_destinations', 'url, active, created_at, secret', 'site_key', siteKey)
  tables.webhook_destinations = dests.map(d => ({ url: d.url, active: d.active, created_at: d.created_at, secret: maskSecret(d.secret) }))

  // sites — explicit safe allowlist (excludes api_key/api_key_hash, all *_capi_token,
  // google_ads_developer_token, encrypted_* secrets, public_share_token, stripe ids).
  tables.sites = await pull('sites', 'id, site_key, name, domain, plan, created_at, onboarding_completed, business_type, timezone, data_retention_days', 'id', siteId)

  // companies + company_members — account context, scoped to this site's company.
  if (site.company_id) {
    tables.companies = await pull('companies', 'id, name, created_at', 'id', site.company_id)
    tables.company_members = await pull('company_members', 'company_id, user_id, role, created_at', 'company_id', site.company_id)
  } else {
    tables.companies = []
    tables.company_members = []
  }

  // Event-level data (pageviews, conversions) lives in Tinybird, the sole event
  // store — PostHog is a dead store that holds none of it. This bundle does NOT
  // include event data, and there is no self-serve retrieval path for it yet, so
  // we say exactly that instead of pointing the caller at a store that holds
  // nothing (the old `posthog_events: 'available on request'` did the latter).
  tables.events = {
    included: false,
    store: 'tinybird',
    note: 'Event-level data (pageviews, conversions) is not part of this export. No self-serve retrieval path for it exists yet.'
  }

  return { generated_at: now().toISOString(), site_key: siteKey, tables }
}

gdprRouter.get('/export', validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const supabase = getSupabase()
    const bundle = await buildGdprExport(supabase, req.site)
    return res.json(bundle)
  } catch (err) {
    console.error('[GDPR] export error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to export data' })
  }
})
