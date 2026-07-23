import { storeIdentityLink } from '../lib/identity-links.js'
import { persistVolunteeredIdentity } from '../lib/volunteered-identity.js'

/**
 * Validate and normalize email string for hashing.
 * Rejects empty values, values > 254 characters, and strings not matching email regex.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function normalizeEmailForHash(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().toLowerCase()
  if (cleaned.length === 0 || cleaned.length > 254) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null
  return cleaned
}

/**
 * Validate and normalize a SHA-256 hex string.
 * Dropped if it does not match exactly a 64-character lowercase hexadecimal format.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function normalizeSha256Hex(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(cleaned) ? cleaned : null
}

/**
 * Validate and sanitize tracking IDs (anonymous_id and visitor_id).
 * Rejects empty values, overlong IDs, emails, obvious phone numbers, JWTs,
 * and sensitive token-like prefixes.
 *
 * @param {*} id
 * @returns {string|null}
 */
export function validateAndSanitizeTrackingId(id) {
  if (typeof id !== 'string') return null
  const trimmed = id.trim()
  if (trimmed.length === 0 || trimmed.length > 256) return null

  // 1. Email check: must not contain '@'
  if (trimmed.includes('@')) return null

  // 2. Phone check: starts with optional + and consists of digits/separators, with at least 7 digits
  const digitsOnly = trimmed.replace(/[^0-9]/g, '')
  if (/^\+?[0-9\s\-()]+$/.test(trimmed) && digitsOnly.length >= 7) {
    return null
  }

  // 3. JWT token check (split on '.' has 3 parts matching jwt character set)
  if (trimmed.split('.').length === 3 && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return null
  }

  // 4. Sensitive token prefixes/patterns check
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('sk_') ||
    lower.startsWith('pk_') ||
    lower.startsWith('rk_') ||
    lower.startsWith('key_') ||
    lower.startsWith('api_') ||
    lower.startsWith('ghp_') ||
    lower.startsWith('xoxb-') ||
    lower.startsWith('xoxp-') ||
    lower.startsWith('whsec_') ||
    lower.startsWith('secret_') ||
    lower.startsWith('token_') ||
    lower.startsWith('session_') ||
    lower.startsWith('auth_') ||
    lower.startsWith('jwt_')
  ) {
    return null
  }

  // 5. Long hex / high-entropy token check (>= 32 chars)
  if (trimmed.length >= 32 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return null
  }
  if (trimmed.length >= 32 && /^[a-zA-Z0-9\-_]+={0,2}$/.test(trimmed) && /[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed) && /[0-9]/.test(trimmed)) {
    return null
  }

  return trimmed
}

/**
 * Validate and sanitize user_id.
 * Extends the tracking ID check by also rejecting unsafe PII keywords like password.
 *
 * @param {*} userId
 * @returns {string|null}
 */
export function validateAndSanitizeUserId(userId) {
  const clean = validateAndSanitizeTrackingId(userId)
  if (!clean) return null

  const lower = clean.toLowerCase()
  if (
    lower.includes('password') ||
    lower.includes('[redacted]') ||
    lower.includes('stripe_session_id') ||
    lower.includes('checkout_id')
  ) {
    return null
  }

  return clean
}

export async function identify(req, res) {
  try {
    const rawBody = req.body || {}
    const rawTraits = rawBody.traits || {}

    // 1. Extract allowed identity fields, with fallback to traits if not at top-level
    // We strictly validate user_id using the safety gate.
    const user_id = validateAndSanitizeUserId(
      typeof rawBody.user_id === 'string' ? rawBody.user_id : rawTraits.user_id
    )

    // anonymous_id and visitor_id are validated using validateAndSanitizeTrackingId
    const anonymous_id = validateAndSanitizeTrackingId(
      typeof rawBody.anonymous_id === 'string' ? rawBody.anonymous_id : rawTraits.anonymous_id
    )

    const visitor_id = validateAndSanitizeTrackingId(
      typeof rawBody.visitor_id === 'string' ? rawBody.visitor_id : rawTraits.visitor_id
    )

    // Identity resolution is 100% Supabase-backed (site_identity_links, read by
    // resolveWebhookAnonymousId); no read consumes PostHog person data. So the
    // $identify PostHog writes (ph.capture $set + ph.alias person-merge) are
    // decommissioned — only the durable Supabase link is written, tenant-scoped
    // by req.site.id. $identify is NOT an analytics event, so NO Tinybird dual-write.
    if (user_id && anonymous_id && user_id !== anonymous_id) {
      // Non-blocking storage
      storeIdentityLink(req.site.id, user_id, anonymous_id, 'identify')
    }

    // Persist VOLUNTEERED identity (V1 Named Contacts). email/name are taken ONLY
    // from the identify body — a narrow two-field allowlist, validated in the
    // helper — never the traits blob or arbitrary props. distinct_id == the
    // anonymous_id the tracker sends, which is the SAME value track.js:352 /
    // conversion.js:425 store as distinct_id, so this row joins to the visitor's
    // conversions/leads. Non-blocking, fire-and-forget like the link write above.
    if (anonymous_id && (typeof rawBody.email === 'string' || typeof rawBody.name === 'string')) {
      persistVolunteeredIdentity({
        siteId: req.site.id,
        distinctId: anonymous_id,
        email: rawBody.email,
        name: rawBody.name,
        source: 'identify'
      }).catch(err => console.error('[identify] volunteered-identity persist failed:', err?.message || err))
    }

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (_err) {
    console.error(_err)
    res.status(500).json({ success: false, data: null, error: 'Identify failed' })
  }
}
