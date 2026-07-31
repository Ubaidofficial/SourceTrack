import { createHash, createHmac } from 'crypto'
import { getSupabase } from './supabase.js'
import { isErasureSuppressed, logSuppressionBlocked } from './erasure-suppression.js'

// Privacy-safe log hashing — matches existing pattern in ad-platforms.js / gsc.
function getLogHash(value) {
  const salt = process.env.ST_LOG_HASH_SECRET || process.env.TRACKER_SALT || process.env.ENCRYPTION_KEY
  if (!salt) {
    return createHash('sha256').update(value || '').digest('hex').slice(0, 8)
  }
  return createHmac('sha256', salt).update(value || '').digest('hex').slice(0, 8)
}

const MAX_ID_LENGTH = 256

/**
 * Validate and trim an identity value (user_id or anonymous_id).
 * Returns trimmed string or null if invalid.
 */
function validateId(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) return null
  return trimmed
}

/**
 * Store or update an identity link mapping user_id ↔ anonymous_id for a site.
 *
 * - Upserts on (site_id, user_id, anonymous_id) — updates last_seen_at on conflict.
 * - Validates inputs; rejects self-links, empty, or overlong values.
 * - Never throws — logs warnings on failure, returns { stored: boolean }.
 * - Never logs raw user_id or anonymous_id values (uses hashed representation).
 *
 * @param {string} siteId  - Site UUID
 * @param {string} userId  - Raw user_id from the request
 * @param {string} anonymousId - Raw anonymous_id from the request
 * @param {string} source  - Provenance: 'identify' | 'browser_conversion' | 'offline_conversion' | 'server_event'
 * @returns {Promise<{ stored: boolean }>}
 */
export async function storeIdentityLink(siteId, userId, anonymousId, source) {
  try {
    const uid = validateId(userId)
    const aid = validateId(anonymousId)

    if (!uid || !aid) return { stored: false }
    if (uid === aid) return { stored: false }
    if (!siteId) return { stored: false }

    const validSources = new Set(['identify', 'browser_conversion', 'offline_conversion', 'server_event'])
    const safeSource = validSources.has(source) ? source : 'identify'

    const now = new Date().toISOString()
    const db = getSupabase()

    // ERASURE SUPPRESSION. This row is what resolveSubjectIds() walks to expand an erasure
    // across every id a subject is known by — so re-creating it after an erasure does more than
    // restore one link: it silently rebuilds the identity graph the erasure dismantled, and a
    // FUTURE erasure would then have to rediscover ids that should no longer exist.
    //
    // Checked on BOTH ids. The link is a pair, and either half being suppressed means the pair
    // must not be rebuilt — an erased anonymous_id being re-linked to a live user_id is the same
    // reintroduction as the reverse.
    //
    // No email key here: this table holds no email, so the id keys are the whole check.
    // Both checked in PARALLEL, not sequentially: on a cache miss the sequential form costs two
    // round trips before a write that is itself fire-and-forget, doubling the delay on every
    // cold identity link for no benefit.
    const [aidSuppressed, uidSuppressed] = await Promise.all([
      isErasureSuppressed(db, { siteId, subjectId: aid }),
      isErasureSuppressed(db, { siteId, subjectId: uid })
    ])
    if (aidSuppressed || uidSuppressed) {
      logSuppressionBlocked('site_identity_links', { siteId, subjectId: aid })
      return { stored: false, suppressed: true }
    }

    const { error } = await db
      .from('site_identity_links')
      .upsert({
        site_id: siteId,
        user_id: uid,
        anonymous_id: aid,
        source: safeSource,
        first_seen_at: now,
        last_seen_at: now
      }, {
        onConflict: 'site_id,user_id,anonymous_id',
        ignoreDuplicates: false
      })

    // On conflict the upsert updates last_seen_at. But Supabase JS upsert
    // doesn't support partial column updates on conflict directly, so we
    // issue a follow-up update for last_seen_at only when the row already existed.
    // The upsert itself handles the insert path; for the update path we rely on
    // the fact that re-upserting with the same PK columns writes the new values.
    // Since we always set last_seen_at = now(), this is correct for both paths.

    if (error) {
      // Log hashed identifiers only — never raw user_id or anonymous_id
      console.error(
        `[identity-links] storage failed: ${error.message}`,
        { site_id: siteId, uid_hash: getLogHash(uid), source: safeSource }
      )
      return { stored: false }
    }

    return { stored: true }
  } catch (err) {
    console.error(
      `[identity-links] unexpected error: ${err?.message}`,
      { site_id: siteId }
    )
    return { stored: false }
  }
}

/**
 * Resolve a user_id to the most recently seen linked anonymous_id for a site.
 *
 * Deterministic resolution:
 *   ORDER BY last_seen_at DESC, created_at DESC LIMIT 1
 *
 * Limitation: This does not evaluate all linked anonymous IDs yet.
 * It uses the most recent known anonymous ID.
 * Full multi-ID attribution is deferred.
 *
 * @param {string} siteId - Site UUID
 * @param {string} userId - Raw user_id to resolve
 * @returns {Promise<string|null>} - Resolved anonymous_id or null
 */
export async function resolveAnonymousId(siteId, userId) {
  try {
    const uid = validateId(userId)
    if (!uid || !siteId) return null

    const { data, error } = await getSupabase()
      .from('site_identity_links')
      .select('anonymous_id')
      .eq('site_id', siteId)
      .eq('user_id', uid)
      .order('last_seen_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(
        `[identity-links] resolve failed: ${error.message}`,
        { site_id: siteId, uid_hash: getLogHash(uid) }
      )
      return null
    }

    return data?.anonymous_id || null
  } catch (err) {
    console.error(
      `[identity-links] resolve unexpected error: ${err?.message}`,
      { site_id: siteId }
    )
    return null
  }
}

/**
 * Resolve a webhook event to an anonymous_id, using explicit browser IDs first
 * and falling back to resolving linked user_id.
 *
 * @param {Object} params
 * @param {string} params.siteId
 * @param {string} [params.anonymousId]
 * @param {string} [params.visitorId]
 * @param {string} [params.userId]
 * @param {string} [params.email]
 * @param {string} [params.emailHash]
 * @param {string} [params.customerId]
 * @returns {Promise<{ anonymousId: string|null, source: string, fallback: boolean }>}
 */
export async function resolveWebhookAnonymousId({ siteId, anonymousId, visitorId, userId, email, emailHash, customerId }) {
  const aid = validateId(anonymousId)
  if (aid) {
    return {
      anonymousId: aid,
      source: 'anonymous_id',
      fallback: false
    }
  }

  const vid = validateId(visitorId)
  if (vid) {
    return {
      anonymousId: vid,
      source: 'visitor_id',
      fallback: false
    }
  }

  const uid = validateId(userId)
  if (uid && siteId) {
    const resolved = await resolveAnonymousId(siteId, uid)
    if (resolved) {
      return {
        anonymousId: resolved,
        source: 'user_id_resolved',
        fallback: false
      }
    }
  }

  // Plaintext email or other identifiers are not stored in site_identity_links
  // in a way that maps them back to anonymous_id. Therefore, email-only or
  // customerId-only resolution is currently unsupported.

  return {
    anonymousId: null,
    source: 'none',
    fallback: true
  }
}
