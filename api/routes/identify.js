import crypto from 'crypto'
import { ph } from '../lib/posthog.js'
import { redactPiiFromObject } from '../lib/utils.js'
import { storeIdentityLink } from '../lib/identity-links.js'

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

    // Email extraction (contact_email or email, top-level or traits)
    let contact_email = null
    const possibleEmails = [
      rawBody.contact_email,
      rawTraits.contact_email,
      rawBody.email,
      rawTraits.email
    ]
    for (const val of possibleEmails) {
      if (typeof val === 'string') {
        const normalizedEmail = normalizeEmailForHash(val)
        if (normalizedEmail) {
          contact_email = normalizedEmail
          break
        }
      }
    }

    // Email hash extraction (email_hash, top-level or traits)
    let email_hash = null
    const possibleEmailHashes = [
      rawBody.email_hash,
      rawTraits.email_hash
    ]
    for (const val of possibleEmailHashes) {
      if (typeof val === 'string') {
        const validated = normalizeSha256Hex(val)
        if (validated) {
          email_hash = validated
          break
        }
      }
    }

    // If contact_email is provided, we derive email_hash internally if not explicitly provided (or if provided was invalid)
    if (contact_email && !email_hash) {
      email_hash = crypto.createHash('sha256').update(contact_email).digest('hex')
    }

    // 2. Redact/sanitize custom traits (excluding allowed fields to avoid leaking raw values)
    const traitsCopy = { ...rawTraits }
    delete traitsCopy.user_id
    delete traitsCopy.anonymous_id
    delete traitsCopy.visitor_id
    delete traitsCopy.contact_email
    delete traitsCopy.email
    delete traitsCopy.email_hash

    const setProps = redactPiiFromObject(traitsCopy)

    // 3. Inject validated identity/metadata fields (excluding raw contact_email to prevent leak to PostHog)
    if (email_hash) {
      setProps.email_hash = email_hash
    }
    if (user_id) {
      setProps.user_id = user_id
    }
    if (anonymous_id) {
      setProps.anonymous_id = anonymous_id
    }
    if (visitor_id) {
      setProps.visitor_id = visitor_id
    }

    if (typeof rawBody.source_system === 'string') {
      const ss = rawBody.source_system.trim()
      if (ss.length > 0) setProps.source_system = ss
    }

    // Validate external_id using validateAndSanitizeUserId before passthrough to prevent leakage
    if (typeof rawBody.external_id === 'string') {
      const ext = validateAndSanitizeUserId(rawBody.external_id)
      if (ext && ext.length > 0) setProps.external_id = ext
    }

    const setOnceProps = {}
    if (rawBody.first_touch_source) {
      setOnceProps.first_touch_source = rawBody.first_touch_source
    }
    if (rawBody.first_touch_medium) {
      setOnceProps.first_touch_medium = rawBody.first_touch_medium
    }
    if (rawBody.first_touch_campaign) {
      setOnceProps.first_touch_campaign = rawBody.first_touch_campaign
    }

    // 4. Forward to PostHog
    const distinctId = anonymous_id || visitor_id || user_id

    ph.capture({
      distinctId,
      event: '$identify',
      properties: {
        site_id: req.site.id,
        $set: setProps,
        ...(Object.keys(setOnceProps).length > 0 ? { $set_once: setOnceProps } : {})
      }
    })

    // 5. Database lead/contact storage & Identity resolution
    // Storing identity link (user_id ↔ anonymous_id) is tenant-scoped by req.site.id.
    if (user_id && anonymous_id && user_id !== anonymous_id) {
      ph.alias({
        distinctId: user_id,
        alias: anonymous_id
      })
      // Non-blocking storage
      storeIdentityLink(req.site.id, user_id, anonymous_id, 'identify')
    }

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (_err) {
    console.error(_err)
    res.status(500).json({ success: false, data: null, error: 'Identify failed' })
  }
}
