/**
 * Shared utility functions used across multiple routes/jobs.
 *
 * Before this module existed, the same trivial functions (`esc`, `toHogDate`,
 * `normalizeUtm`, `getFirstTouchFields`) were copy-pasted across 12+ files.
 * That made HogQL escaping (a security-critical helper) inconsistent — most
 * files used the plain version, one (`events.js`) defensively wrapped with
 * `String()`. The consolidated version uses the safer pattern.
 */

import crypto from 'crypto'

/**
 * Escape a value for safe inclusion in HogQL string literals.
 * HogQL/ClickHouse string literals honor C-style backslash escapes, so a value
 * ending in a backslash could otherwise escape the closing quote and break out
 * (confirmed injection). Escape backslashes FIRST, then double single quotes.
 * Defensive `String()` wrap avoids `null.replace` crashes on bad inputs.
 *
 * @param {*} value — any value; coerced to string before escaping
 * @returns {string}
 */
export function esc(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")
}

/**
 * Convert an ISO 8601 timestamp to ClickHouse / HogQL toDateTime format.
 * Strips milliseconds and the trailing Z so the result is `YYYY-MM-DD HH:MM:SS`.
 *
 * @param {string} iso — ISO 8601 timestamp
 * @returns {string}
 */
export function toHogDate(iso) {
  return iso.replace('T', ' ').replace(/\.\d+Z?$/, '').replace('Z', '')
}

/**
 * Normalize a UTM-like value: trim + lowercase. Returns the original on
 * non-string inputs so it's safe to pipe through with `null`/`undefined`.
 *
 * @param {*} value
 * @returns {string|*}
 */
export function normalizeUtm(value) {
  if (!value || typeof value !== 'string') return value
  return value.trim().toLowerCase()
}

/**
 * Checks if a string is a general Google variant (e.g. google, google.com, google.co.uk).
 * Tightly matches google.<tld> or www.google.<tld> where TLD is country/generic.
 *
 * @param {*} val
 * @returns {boolean}
 */
export function isGoogleSource(val) {
  if (!val || typeof val !== 'string') return false
  const lower = val.trim().toLowerCase()
  if (lower === 'google') return true
  const parts = lower.split('.')
  const cleanParts = parts[0] === 'www' ? parts.slice(1) : parts
  if (cleanParts[0] !== 'google') return false
  if (cleanParts.length === 2) {
    return /^[a-z]{2,6}$/.test(cleanParts[1])
  }
  if (cleanParts.length === 3) {
    return cleanParts[1] === 'co' || cleanParts[1] === 'com' || cleanParts[1] === 'org' || cleanParts[1] === 'net'
  }
  return false
}


/**
 * Sanitize Google ValueTrack parameters safely:
 * - Stringify, trim, and remove control characters.
 * - Cap length to 100 characters.
 * - Return null for empty/whitespace-only values.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function sanitizeValueTrack(value) {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  if (!str) return null
  const clean = str.replace(/[\x00-\x1F\x7F]/g, '')
  if (!clean) return null
  return clean.slice(0, 100)
}

/**
 * Coerce a client-provided ISO timestamp into a canonical form, or null if
 * unparseable. We accept this as attribution METADATA only — never use it for
 * billing, security, or rate-limiting decisions where a malicious client
 * could backdate or forward-date events. Bounded length keeps unbounded input
 * from feeding `new Date()`.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function sanitizeClientTimestamp(value) {
  if (!value || typeof value !== 'string') return null
  if (value.length > 40) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null

  // Security/Abuse Protection: Block timestamp spoofing that pollutes reports.
  // Must be within 90 days in the past and no more than 1 hour in the future (clock skew).
  const time = d.getTime()
  const now = Date.now()
  if (time > now + 3600 * 1000) return null
  if (time < now - 90 * 24 * 3600 * 1000) return null

  return d.toISOString()
}

/**
 * Read first-touch fields from a conversion body, supporting all the
 * naming variants the tracker has shipped over time:
 *   - body.first_touch_source              (current canonical)
 *   - body.firstTouchSource                (camelCase variant)
 *   - body.properties.first_touch_source   (nested under properties)
 *   - body.properties.firstTouchSource     (nested + camelCase)
 *
 * @param {object} body — req.body
 * @returns {{first_touch_source: string, first_touch_medium: string, first_touch_campaign: string, first_touch_timestamp: string|null}}
 */
export function getFirstTouchFields(body = {}) {
  const props = body.properties || {}
  return {
    first_touch_source:
      body.first_touch_source || body.firstTouchSource ||
      props.first_touch_source || props.firstTouchSource || 'direct',
    first_touch_medium:
      body.first_touch_medium || body.firstTouchMedium ||
      props.first_touch_medium || props.firstTouchMedium || 'none',
    first_touch_campaign:
      body.first_touch_campaign || body.firstTouchCampaign ||
      props.first_touch_campaign || props.firstTouchCampaign || '',
    // first_touch_timestamp is forwarded as attribution metadata only. The
    // tracker writes it to localStorage on the first visit and sends it on
    // every pageview/conversion thereafter so reports can preserve the
    // original first-touch moment even when prior pageview events have
    // rolled out of the attribution window. We never trust it for
    // billing/security — sanitize and accept ISO-only.
    first_touch_timestamp: sanitizeClientTimestamp(
      body.first_touch_timestamp || body.firstTouchTimestamp ||
      props.first_touch_timestamp || props.firstTouchTimestamp
    )
  }
}

/**
 * Redact risky PII query parameters from a URL or referrer string,
 * while preserving marketing/attribution parameter keys intact.
 * Uses a safe URL-safe 'REDACTED' placeholder consistent with guidelines.
 *
 * @param {string} url - The URL or referrer string to redact.
 * @returns {string} The sanitized URL.
 */
export function redactPiiFromUrl(url) {
  if (!url || typeof url !== 'string') return url

  try {
    let isRelative = false
    let urlObj
    try {
      urlObj = new URL(url)
    } catch (_) {
      // Try as relative URL
      urlObj = new URL(url, 'https://relative-base.local')
      isRelative = true
    }

    const piiKeys = new Set([
      'email', 'e-mail', 'e', 'user_email', 'customer_email', 'contact_email', 'billing_email', 'shipping_email',
      'phone', 'tel', 'mobile', 'billing_phone', 'shipping_phone',
      'first_name', 'last_name', 'full_name', 'name', 'customer_name', 'billing_name', 'shipping_name',
      'password', 'pass',
      'token', 'access_token', 'refresh_token', 'auth', 'authorization', 'secret',
      'api_key', 'apikey', 'secret_key', 'private_key', 'key',
      'ssn', 'dob', 'date_of_birth', 'address', 'street', 'zip', 'postal_code', 'postcode', 'street_address', 'address1', 'address2',
      'invite', 'invite_code', 'auth_code', 'reset_code', 'verification_code', 'code_verifier',
      'checkout_id', 'checkout_session_id', 'stripe_session_id', 'payment_session_id', 'session_id'
    ])

    let modified = false
    urlObj.searchParams.forEach((value, key) => {
      if (piiKeys.has(key.toLowerCase())) {
        urlObj.searchParams.set(key, '[REDACTED]')
        modified = true
      }
    })

    if (!modified) return url

    let result = isRelative
      ? urlObj.pathname + urlObj.search + urlObj.hash
      : urlObj.toString()

    if (isRelative && !url.startsWith('/')) {
      if (result.startsWith('/')) {
        result = result.substring(1)
      }
    }
    return result
  } catch (_) {
    // Conservative fallback regex redaction if parsing fails completely
    try {
      let redactedUrl = url
      const keysRegex = /([?&])(email|e-mail|e|user_email|customer_email|contact_email|billing_email|shipping_email|phone|tel|mobile|billing_phone|shipping_phone|first_name|last_name|full_name|name|customer_name|billing_name|shipping_name|password|pass|token|access_token|refresh_token|auth|authorization|secret|api_key|apikey|secret_key|private_key|key|ssn|dob|date_of_birth|address|street|zip|postal_code|postcode|street_address|address1|address2|invite|invite_code|auth_code|reset_code|verification_code|code_verifier|checkout_id|checkout_session_id|stripe_session_id|payment_session_id|session_id)=([^&#]*)/ig
      return redactedUrl.replace(keysRegex, '$1$2=[REDACTED]')
    } catch (fallbackErr) {
      return url
    }
  }
}

function isCustomContactKey(lowerKey) {
  return /(^|[_-])(email|phone)$/.test(lowerKey)
}

/**
 * Scans an object recursively up to depth 5 for PII keys and redacts them.
 * Does not touch standard identity identifiers like user_id, customer_id, etc.
 *
 * @param {object} obj - Object containing properties or traits.
 * @returns {object} A sanitized copy of the object.
 */
export function redactPiiFromObject(obj, depth = 0) {
  if (depth > 5) return '[REDACTED]'
  if (!obj || typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => redactPiiFromObject(item, depth + 1))
  }

  const newObj = {}

  const bypassedKeys = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid', 'li_fat_id', 'twclid', 'rdt_cid', 'epik', 'sccid', 'ko_click_id',
    'anonymous_id', 'distinct_id', 'site_id', 'site_key', 'event', 'session_id', 'key',
    'source', 'referrer', 'page_url', 'current_url', 'url',
    'conversion_type', 'value', 'currency', 'order_id', 'product_id', 'product_name', 'category'
  ])

  const exactPiiKeys = new Set([
    'email', 'e-mail', 'user_email', 'customer_email', 'contact_email', 'billing_email', 'shipping_email',
    'phone', 'tel', 'mobile', 'billing_phone', 'shipping_phone',
    'name', 'first_name', 'last_name', 'full_name', 'customer_name', 'billing_name', 'shipping_name',
    'password', 'pass',
    'token', 'access_token', 'refresh_token', 'auth', 'authorization', 'secret',
    'api_key', 'apikey', 'secret_key', 'private_key',
    'ssn', 'dob', 'date_of_birth', 'address', 'street', 'zip', 'postal_code', 'postcode', 'street_address', 'address1', 'address2',
    'invite', 'invite_code', 'auth_code', 'reset_code', 'verification_code', 'code_verifier',
    'checkout_id', 'checkout_session_id', 'stripe_session_id', 'payment_session_id'
  ])

  const urlFields = new Set([
    'page_url', 'referrer', 'landing_page', 'current_url',
    'last_event_url', 'url', 'href', 'destination_url'
  ])

  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const lowerKey = key.toLowerCase()

    if (bypassedKeys.has(lowerKey)) {
      if (urlFields.has(lowerKey) && typeof value === 'string') {
        newObj[key] = redactPiiFromUrl(value)
      } else {
        newObj[key] = value
      }
    } else if (exactPiiKeys.has(lowerKey) || isCustomContactKey(lowerKey)) {
      newObj[key] = '[REDACTED]'
    } else if (urlFields.has(lowerKey) && typeof value === 'string') {
      newObj[key] = redactPiiFromUrl(value)
    } else if (value && typeof value === 'object') {
      newObj[key] = redactPiiFromObject(value, depth + 1)
    } else {
      newObj[key] = value
    }
  }

  return newObj
}

/**
 * Checks if a pathname or page URL matches any pattern in the excluded paths.
 * Supports wildcard patterns like `/admin/*` which matches `/admin`, `/admin/settings`, etc.
 *
 * @param {string} pageUrl - The URL or pathname to check.
 * @param {string[]} excludedPaths - Array of exclusion patterns.
 * @returns {boolean}
 */
export function isPathExcluded(pageUrl, excludedPaths) {
  if (!pageUrl || typeof pageUrl !== 'string' || !Array.isArray(excludedPaths) || excludedPaths.length === 0) return false

  let pathname = ''
  try {
    if (pageUrl.startsWith('http://') || pageUrl.startsWith('https://')) {
      pathname = new URL(pageUrl).pathname
    } else {
      pathname = pageUrl.split('?')[0].split('#')[0]
    }
  } catch (_) {
    pathname = pageUrl.split('?')[0].split('#')[0]
  }

  // Normalize path leading slash
  if (!pathname.startsWith('/')) {
    pathname = '/' + pathname
  }

  for (const pat of excludedPaths) {
    if (typeof pat !== 'string') continue
    const pattern = pat.trim()
    if (!pattern) continue

    // Normalize pattern leading slash
    let normalizedPattern = pattern
    if (!normalizedPattern.startsWith('/')) {
      normalizedPattern = '/' + normalizedPattern
    }

    if (normalizedPattern.includes('*')) {
      const prefix = normalizedPattern.replace(/\*/g, '')
      if (pathname.startsWith(prefix) || pathname === prefix.replace(/\/$/, '')) {
        return true
      }
    } else if (pathname === normalizedPattern) {
      return true
    }
  }

  return false
}

/**
 * Checks if a timezone identifier is valid and conforms to safe patterns.
 *
 * @param {string} timeZone - The timezone string to validate.
 * @returns {boolean}
 */
export function isValidTimezone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false
  if (!/^[a-zA-Z0-9_\-\+\/]+$/.test(timeZone)) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone })
    return true
  } catch (_) {
    return false
  }
}

/**
 * Returns the local date string (YYYY-MM-DD) for a given date and timezone.
 *
 * @param {Date|number|string} date - The date to format.
 * @param {string} timeZone - The target timezone.
 * @returns {string}
 */
export function getLocalDateString(date, timeZone) {
  const tz = isValidTimezone(timeZone) ? timeZone : 'UTC'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d)

  let year = '', month = '', day = ''
  for (const p of parts) {
    if (p.type === 'year') year = p.value
    else if (p.type === 'month') month = p.value
    else if (p.type === 'day') day = p.value
  }
  return `${year}-${month}-${day}`
}

/**
 * Returns the local month string (YYYY-MM) for a given date and timezone.
 *
 * @param {Date|number|string} date - The date to format.
 * @param {string} timeZone - The target timezone.
 * @returns {string}
 */
export function getLocalMonthString(date, timeZone) {
  const tz = isValidTimezone(timeZone) ? timeZone : 'UTC'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(d)

  let year = '', month = ''
  for (const p of parts) {
    if (p.type === 'year') year = p.value
    else if (p.type === 'month') month = p.value
  }
  return `${year}-${month}`
}

/**
 * Returns the local week start date string (YYYY-MM-DD, Monday) for a given date and timezone.
 *
 * @param {Date|number|string} date - The date to format.
 * @param {string} timeZone - The target timezone.
 * @returns {string}
 */
export function getLocalWeekString(date, timeZone) {
  const tz = isValidTimezone(timeZone) ? timeZone : 'UTC'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''

  const weekdayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short'
  }).format(d)

  const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dayIndex = DAYS[weekdayStr] ?? 0
  const daysToSubtract = dayIndex === 0 ? 6 : dayIndex - 1

  const mondayDate = new Date(d.getTime() - daysToSubtract * 86400000)
  return getLocalDateString(mondayDate, tz)
}

/**
 * Return dates padded by 1 day on both sides to cover all timezone shifting variations.
 *
 * @param {string} localDateFrom - Local start date (YYYY-MM-DD).
 * @param {string} localDateTo - Local end date (YYYY-MM-DD).
 * @returns {{from: string, to: string}}
 */
export function getPaddedUtcDateRange(localDateFrom, localDateTo) {
  const from = new Date(localDateFrom)
  const to = new Date(localDateTo)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { from: localDateFrom, to: localDateTo }
  }

  from.setUTCDate(from.getUTCDate() - 1)
  to.setUTCDate(to.getUTCDate() + 1)

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  }
}

export function getNow(req) {
  const isTestMode = process.env.NODE_ENV !== 'production' && process.env.ALLOW_TEST_TIME_MOCK === 'true'
  if (isTestMode && req) {
    const override = req.headers['x-sourcetrack-now'] || req.query.now_override
    if (override) {
      const d = new Date(override)
      if (!isNaN(d.getTime())) return d
    }
  }
  return new Date()
}


let cachedKeyBuffer = null

function getEncryptionKeyBuffer() {
  if (cachedKeyBuffer) return cachedKeyBuffer

  const rawKey = process.env.ENCRYPTION_KEY
  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY environment variable is missing.')
  }

  // Check 64-character hex format
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    cachedKeyBuffer = Buffer.from(rawKey, 'hex')
    return cachedKeyBuffer
  }

  // Check 32-byte base64 format
  try {
    const buf = Buffer.from(rawKey, 'base64')
    if (buf.length === 32) {
      cachedKeyBuffer = buf
      return cachedKeyBuffer
    }
  } catch (_) {
    // Ignore and throw below
  }

  throw new Error('ENCRYPTION_KEY must be a 64-character hex string or a 32-byte base64-encoded string.')
}

/**
 * Encrypt a secret value using AES-256-GCM.
 * Returns the format `iv:ciphertext:tag` in hex.
 *
 * @param {string} text - The plaintext to encrypt.
 * @returns {string} The encrypted string.
 */
export function encryptSecret(text) {
  if (text === null || text === undefined) return text
  const key = getEncryptionKeyBuffer()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(String(text), 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${encrypted}:${tag}`
}

/**
 * Decrypt a secret value encrypted using AES-256-GCM.
 * Expects the format `iv:ciphertext:tag` in hex.
 *
 * @param {string} encryptedText - The encrypted string.
 * @returns {string} The decrypted plaintext.
 */
export function decryptSecret(encryptedText) {
  if (!encryptedText) return encryptedText
  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format. Must be iv:ciphertext:tag.')
  }
  const key = getEncryptionKeyBuffer()
  const iv = Buffer.from(parts[0], 'hex')
  const encrypted = parts[1]
  const tag = Buffer.from(parts[2], 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * Parses and extracts allowlisted custom parameters from a URL search string.
 * Enforces strict key allowlists, regex validation, max lengths, blocked words,
 * and value-level PII checks (emails, JWTs, phone numbers, credit card-like patterns).
 * Unsafe values are dropped entirely (not saved as REDACTED).
 *
 * @param {string} pageUrl - The URL or pathname to parse.
 * @param {string[]} allowlist - The site's allowed custom parameter keys.
 * @returns {object} Flat object mapping `custom_<key>` to sanitized value.
 */
export function extractCustomParams(pageUrl, allowlist) {
  if (!pageUrl || typeof pageUrl !== 'string' || !Array.isArray(allowlist) || allowlist.length === 0) {
    return {}
  }

  const customProps = {}
  try {
    let urlObj
    try {
      urlObj = new URL(pageUrl)
    } catch (_) {
      urlObj = new URL(pageUrl, 'https://relative-base.local')
    }

    const searchParams = urlObj.searchParams
    const blockedSubstrings = ['email', 'phone', 'name', 'address', 'token', 'secret', 'password', 'session', 'auth', 'cookie', 'card', 'ssn']

    for (const key of allowlist) {
      if (typeof key !== 'string' || key.length > 40 || !/^[a-z0-9_-]+$/.test(key)) {
        continue
      }

      let isBlocked = false
      for (const sub of blockedSubstrings) {
        if (key.toLowerCase().includes(sub)) {
          isBlocked = true
          break
        }
      }
      if (isBlocked) continue

      if (searchParams.has(key)) {
        const val = searchParams.get(key)
        if (typeof val === 'string' && val.length > 0) {
          const trimmed = val.trim()

          // Drop unsafe values completely (PII Gating)
          if (trimmed.length > 120) continue // too long

          // Stricter Email check: drop if it contains @ (and a general email signature check)
          if (trimmed.includes('@')) continue
          if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) continue

          // Phone number check (7+ digits)
          if (/^\+?[0-9\s\-()]{7,25}$/.test(trimmed) && trimmed.replace(/[^0-9]/g, '').length >= 7) continue

          // JWT token check
          if (trimmed.split('.').length === 3 && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(trimmed)) continue

          // Card pattern check (13 to 16 digits)
          if (/^\d{13,16}$/.test(trimmed.replace(/[-\s]/g, ''))) continue

          // Long hex string check (session IDs, MD5/SHA hashes, etc.)
          if (trimmed.length >= 32 && /^[0-9a-fA-F]+$/.test(trimmed)) continue

          // Long Base64 / Base64url-ish high entropy check (JWT-like or token-like)
          if (trimmed.length >= 32 && /^[a-zA-Z0-9\-_]+={0,2}$/.test(trimmed) && /[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed) && /[0-9]/.test(trimmed)) continue

          // Common token prefixes/patterns
          const lowerTrimmed = trimmed.toLowerCase()
          if (
            lowerTrimmed.startsWith('ghp_') ||
            lowerTrimmed.startsWith('xoxb-') ||
            lowerTrimmed.startsWith('xoxp-') ||
            lowerTrimmed.startsWith('sk_live') ||
            lowerTrimmed.startsWith('sk_test') ||
            lowerTrimmed.startsWith('pk_live') ||
            lowerTrimmed.startsWith('pk_test') ||
            lowerTrimmed.startsWith('whsec_') ||
            lowerTrimmed.startsWith('secret_') ||
            lowerTrimmed.startsWith('token_') ||
            lowerTrimmed.startsWith('session_') ||
            lowerTrimmed.startsWith('auth_') ||
            lowerTrimmed.startsWith('jwt_')
          ) {
            continue
          }

          // Token-like over 60 chars check
          if (trimmed.length > 60 && /^[a-zA-Z0-9\-_~.+%=/]+$/.test(trimmed)) continue

          customProps[`custom_${key}`] = trimmed
        }
      }
    }
  } catch (err) {
    console.error('[custom-params-extract] failed:', err.message)
  }

  return customProps
}

/**
 * Sanitizes a client-provided verification token:
 * - Stringify and trim inputs.
 * - Remove ASCII control characters ([\x00-\x1F\x7F]).
 * - Cap length to maximum 100 characters.
 * - Strip any characters except alphanumeric characters (a-zA-Z0-9), underscores (_), and hyphens (-).
 * - Return null for empty or invalid values.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function sanitizeVerificationToken(value) {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  if (!str) return null
  const clean = str.replace(/[\x00-\x1F\x7F]/g, '')
  if (!clean) return null
  const sliced = clean.slice(0, 100)
  const safe = sliced.replace(/[^a-zA-Z0-9_-]/g, '')
  return safe || null
}

/**
 * Sanitize and normalize the 12 click IDs.
 * Accepts both li_fat_id and li_fatid, storing preferred canonical li_fat_id.
 * Preserves raw li_fatid if present.
 *
 * @param {object} props - Input properties
 * @returns {object} Object with normalized click IDs
 */
export function normalizeClickIds(props = {}) {
  const gclid = (typeof props.gclid === 'string' && props.gclid.trim()) || null
  const gbraid = (typeof props.gbraid === 'string' && props.gbraid.trim()) || null
  const wbraid = (typeof props.wbraid === 'string' && props.wbraid.trim()) || null
  const fbclid = (typeof props.fbclid === 'string' && props.fbclid.trim()) || null
  const msclkid = (typeof props.msclkid === 'string' && props.msclkid.trim()) || null
  const ttclid = (typeof props.ttclid === 'string' && props.ttclid.trim()) || null
  const twclid = (typeof props.twclid === 'string' && props.twclid.trim()) || null
  const dclid = (typeof props.dclid === 'string' && props.dclid.trim()) || null
  const snapclid = (typeof props.snapclid === 'string' && props.snapclid.trim()) || null
  const pclid = (typeof props.pclid === 'string' && props.pclid.trim()) || null
  const sccid = (typeof props.sccid === 'string' && props.sccid.trim()) || null
  const ko_click_id = (typeof props.ko_click_id === 'string' && props.ko_click_id.trim()) || null

  const rawLiFatId = (typeof props.li_fat_id === 'string' && props.li_fat_id.trim()) || null
  const rawLiFatid = (typeof props.li_fatid === 'string' && props.li_fatid.trim()) || null

  const li_fat_id = rawLiFatId || rawLiFatid
  const li_fatid = rawLiFatid

  return {
    gclid,
    gbraid,
    wbraid,
    fbclid,
    msclkid,
    ttclid,
    li_fat_id,
    li_fatid,
    twclid,
    dclid,
    snapclid,
    pclid,
    sccid,
    ko_click_id
  }
}
