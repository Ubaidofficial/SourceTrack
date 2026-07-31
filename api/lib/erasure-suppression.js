// Erasure suppression — the durable record that an Art. 17 request was honoured, so the same
// subject's PII cannot be silently written back afterwards.
//
// ⚠️ PENDING LEGAL REVIEW. The decision to BUILD this is made; the retention question behind it
// is NOT settled and this module does not treat it as settled. The argument is that a record
// kept SPECIFICALLY to enforce an erasure request is a different retention question from
// ordinary data retention — the same logic that underpins marketing-suppression / unsubscribe
// lists — with a GDPR accountability-principle (Art. 5(2)) case behind it. That is a genuine
// argument, not a confirmed conclusion, and confirming it is a lawyer's call. The migration
// 20260731130000_create_erasure_suppression.sql carries the same caveat at the schema layer.
//
// ── WHY NOT erasure_log ──────────────────────────────────────────────────────
// erasure_log records ATTEMPTS: nullable executed_at plus a status enum, so it holds dry-runs
// and failures alongside successes (verified on prod). Suppressing off it would suppress people
// who were never actually erased. This table records only the moment PII was genuinely removed.
//
// ── WHY TWO KEY TYPES ────────────────────────────────────────────────────────
// distinct_id alone misses the case this mechanism most needs to catch. An erased person who
// returns on a new device — cleared storage, different browser — arrives with a BRAND NEW
// anonymous_id and calls identify() with the same email. No id matches; only the email does.
// So each record carries both: every id the subject was known by, AND hashes of their emails.
//
// Emails are HASHED, never stored plaintext. A record whose purpose is minimising what is
// retained about an erased person must not itself become a store of their address. The hash is
// computed over normalizeVolunteeredEmail()'s output — the SAME normalisation identify() applies
// before writing volunteered_identity — so an incoming identify() hashes to the same value, or
// the check silently never matches.
//
// PR 1 of the sequence: this module WRITES records. Nothing reads them yet — enforcement lands
// in PR 2 (ingest + cache) and PR 3 (batcher flush boundary). Landing the write side first means
// suppression records already exist when enforcement switches on, instead of enforcement going
// live against an empty table.

import { createHash } from 'crypto'
import NodeCache from 'node-cache'
import { normalizeVolunteeredEmail } from './volunteered-identity.js'

// 5-minute TTL, matching siteCache / proxyCache / trackerSiteCache — the established figure for
// "tenant state that changes rarely" in this codebase. Suppression only ever grows within a TTL
// window (a record is added by an erasure, never removed except by site deletion), so the worst
// a stale negative can do is let PII through for up to 5 minutes after an erasure. A stale
// POSITIVE is harmless: it suppresses someone who is genuinely suppressed.
const suppressionCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

// Test seam. Not exported into the hot path — callers use isErasureSuppressed().
export function __resetSuppressionCache () { suppressionCache.flushAll() }

/**
 * Hash an email for the suppression record.
 *
 * Returns null for anything that is not a well-formed email, deliberately: an unnormalizable
 * value must not be hashed into a key that can never match. Callers treat null as "no email key
 * for this subject" — the id keys still apply.
 *
 * @param {unknown} rawEmail
 * @returns {string|null} lowercase hex sha256, or null
 */
export function hashSuppressedEmail (rawEmail) {
  const normalized = normalizeVolunteeredEmail(rawEmail)
  if (!normalized) return null
  return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Read the emails this subject volunteered, BEFORE they are deleted.
 *
 * ORDERING IS LOAD-BEARING. Erasure is keyed on anonymous_id/distinct_id and never on email; the
 * email exists only in volunteered_identity, which the erasure then DELETES. Called after that
 * delete, this returns nothing and the identify()-replay key is gone for good — the one key that
 * catches a returning subject on a new device.
 *
 * @param {object} supabase
 * @param {string} siteId
 * @param {string[]} subjectIds
 * @returns {Promise<string[]>} distinct sha256 hashes (may be empty)
 */
export async function collectSuppressionEmailHashes (supabase, siteId, subjectIds) {
  if (!siteId || !Array.isArray(subjectIds) || subjectIds.length === 0) return []
  const { data, error } = await supabase
    .from('volunteered_identity')
    .select('email')
    .eq('site_id', siteId)
    .in('distinct_id', subjectIds)
  // A failed read must not block the erasure — the subject's Art. 17 request outranks our
  // ability to record a suppression key. Surfaced, never swallowed silently.
  if (error) {
    console.error(`[erasure-suppression] email pre-read FAILED reason=${error.message} site=${siteId} — suppression will carry id keys only`)
    return []
  }
  const hashes = new Set()
  for (const row of (data || [])) {
    const h = hashSuppressedEmail(row?.email)
    if (h) hashes.add(h)
  }
  return [...hashes]
}

/**
 * Record that this subject's PII was genuinely removed.
 *
 * ONLY call this when something was actually erased. The caller decides that — see gdpr.js,
 * where the no-match branch (nothing deleted in either store) deliberately does NOT reach here.
 * That is the whole distinction from erasure_log.
 *
 * ONE ROW PER ERASURE, carrying both key sets as arrays. Rejected alternative: one row per email
 * hash with a UNIQUE(site_id, email_sha256). Postgres treats NULL as distinct in a unique
 * constraint, so every subject who volunteered no email would insert an unconstrained NULL row
 * and the upsert would never dedupe them. Arrays + GIN sidestep that entirely and keep the
 * lookup a single-row read for either key.
 *
 * Never throws into the response path, matching logErasure(): a suppression-write failure must
 * not turn a completed erasure into a 500 for the operator. It IS logged loudly, because a
 * silent failure here means the subject is erased but unprotected.
 *
 * @param {object} supabase service-role client
 * @param {object} args
 * @param {string} args.siteId
 * @param {string[]} args.subjectIds every id the subject was known by (resolveSubjectIds output)
 * @param {string[]} args.emailHashes from collectSuppressionEmailHashes, captured pre-delete
 * @param {string} [args.source] 'visitor'
 * @returns {Promise<{written: boolean}>}
 */
export async function recordErasureSuppression (supabase, { siteId, subjectIds, emailHashes = [], source = 'visitor' }) {
  const ids = [...new Set((subjectIds || []).filter(id => typeof id === 'string' && id.length > 0))]
  if (!siteId || ids.length === 0) return { written: false }

  try {
    const { error } = await supabase
      .from('erasure_suppression')
      .insert({
        site_id: siteId,
        subject_ids: ids,
        email_hashes: [...new Set(emailHashes.filter(Boolean))],
        source
      })
    if (error) {
      console.error(`[erasure-suppression] write FAILED reason=${error.message} site=${siteId} ids=${ids.length} — subject erased but NOT protected from re-entry`)
      return { written: false }
    }
  } catch (e) {
    console.error(`[erasure-suppression] write THREW reason=${e?.message || e} site=${siteId} ids=${ids.length} — subject erased but NOT protected from re-entry`)
    return { written: false }
  }
  console.log(`[erasure-suppression] recorded site=${siteId} ids=${ids.length} email_keys=${emailHashes.length} source=${source}`)
  return { written: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENFORCEMENT (PR 2). Everything above writes records; this reads them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is this subject suppressed on this site?
 *
 * Matches on EITHER key: the id the write is keyed on, or the hash of the email it carries.
 * Either alone is insufficient — an erased person returning on a new device has a new
 * anonymous_id (only the email matches), and one who never volunteered an email has no email
 * key at all (only the id matches).
 *
 * ── FAILS CLOSED ────────────────────────────────────────────────────────────
 * If the lookup errors we return TRUE (suppressed). The alternative — assuming "not suppressed"
 * when we cannot tell — silently rewrites PII into an erased subject on exactly the read that
 * was supposed to prevent it, and leaves no trace that anything was skipped. The cost of failing
 * closed is bounded and cheap here: every caller in PR 2 is a non-blocking identity ENRICHMENT
 * write (volunteered_identity, site_identity_links) or an operator action that surfaces an
 * error. None of them is on the visitor-facing critical path, so a Supabase outage degrades
 * identity enrichment rather than breaking ingestion.
 *
 * ── A FAIL-CLOSED RESULT IS NEVER CACHED ────────────────────────────────────
 * Caching it would let one transient error suppress a whole site for a full TTL. Only real
 * answers — from a successful query — are cached.
 *
 * ── A CACHE MISS IS NOT AN ANSWER ───────────────────────────────────────────
 * A miss falls through to the database. A cold start therefore behaves exactly like a warm one,
 * just slower; it must never read as "not suppressed", which would make every deploy a window
 * where erased subjects are unprotected.
 *
 * @param {object} supabase service-role client
 * @param {object} args
 * @param {string} args.siteId
 * @param {string|null} [args.subjectId] distinct_id / anonymous_id the write is keyed on
 * @param {string|null} [args.email] raw email the write carries; hashed here
 * @returns {Promise<boolean>} true = suppressed (do not write PII)
 */
export async function isErasureSuppressed (supabase, { siteId, subjectId = null, email = null }) {
  if (!siteId) return false
  const emailHash = hashSuppressedEmail(email)
  const id = typeof subjectId === 'string' && subjectId.length > 0 ? subjectId : null
  // No key to check against — nothing to match, so nothing to suppress. This is NOT a
  // fail-closed case: a write with neither an id nor a usable email carries no subject.
  if (!id && !emailHash) return false

  const keys = []
  if (id) keys.push({ column: 'subject_ids', value: id, cacheKey: `sup:${siteId}:id:${id}` })
  if (emailHash) keys.push({ column: 'email_hashes', value: emailHash, cacheKey: `sup:${siteId}:em:${emailHash}` })

  // Any cached positive short-circuits: suppression is a logical OR across keys.
  const uncached = []
  for (const k of keys) {
    const hit = suppressionCache.get(k.cacheKey)
    if (hit === true) return true
    if (hit === undefined) uncached.push(k)
  }
  if (uncached.length === 0) return false   // every key answered false from cache

  const results = await Promise.all(uncached.map(async (k) => {
    // try/catch, not just an `error` check. A client can THROW rather than return an error —
    // a broken/partial client, a network layer that rejects, an unexpected shape. Without this
    // the exception escapes isErasureSuppressed entirely and the fail-closed branch below never
    // runs, so the guard would be bypassed by exactly the failures it exists to survive.
    try {
      const { data, error } = await supabase
        .from('erasure_suppression')
        .select('id')
        .eq('site_id', siteId)
        .contains(k.column, [k.value])
        .limit(1)
      if (error) return { k, error }
      return { k, suppressed: Array.isArray(data) && data.length > 0 }
    } catch (e) {
      return { k, error: { message: e?.message || String(e) } }
    }
  }))

  let degraded = false
  let suppressed = false
  for (const r of results) {
    if (r.error) { degraded = true; continue }   // deliberately NOT cached
    suppressionCache.set(r.k.cacheKey, r.suppressed)
    if (r.suppressed) suppressed = true
  }

  if (suppressed) return true
  if (degraded) {
    console.error(`[erasure-suppression] check DEGRADED site=${siteId} — failing CLOSED (write skipped); suppression state unknown`)
    return true
  }
  return false
}

/**
 * Log that suppression stopped a write. Matches the `[module] action reason=value` shape used by
 * privacy-suppression.js, so an operator can grep one convention across both guards.
 *
 * Guards that fire invisibly cannot be distinguished from guards that never fire — which is how
 * a broken guard survives.
 */
export function logSuppressionBlocked (surface, { siteId, subjectId = null, reason = 'erased_subject' }) {
  console.warn(`[erasure-suppression] blocked surface=${surface} reason=${reason} site=${siteId}${subjectId ? ` subject=${subjectId}` : ''}`)
}
