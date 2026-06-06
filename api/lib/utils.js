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
 * Doubles single quotes (ClickHouse/HogQL escape rule).
 * Defensive `String()` wrap avoids `null.replace` crashes on bad inputs.
 *
 * @param {*} value — any value; coerced to string before escaping
 * @returns {string}
 */
export function esc(value = '') {
  return String(value).replace(/'/g, "''")
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
 * Read first-touch fields from a conversion body, supporting all the
 * naming variants the tracker has shipped over time:
 *   - body.first_touch_source              (current canonical)
 *   - body.firstTouchSource                (camelCase variant)
 *   - body.properties.first_touch_source   (nested under properties)
 *   - body.properties.firstTouchSource     (nested + camelCase)
 *
 * @param {object} body — req.body
 * @returns {{first_touch_source: string, first_touch_medium: string, first_touch_campaign: string}}
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
      props.first_touch_campaign || props.firstTouchCampaign || ''
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
      'email', 'e', 'user_email', 'customer_email',
      'phone', 'tel', 'mobile',
      'first_name', 'last_name', 'full_name', 'name',
      'password', 'pass',
      'token', 'access_token', 'refresh_token', 'auth',
      'key', 'api_key', 'secret',
      'checkout_id', 'session_id',
      'invite', 'invite_code', 'auth_code', 'reset_code', 'verification_code', 'code_verifier'
    ])

    let modified = false
    urlObj.searchParams.forEach((value, key) => {
      if (piiKeys.has(key.toLowerCase())) {
        urlObj.searchParams.set(key, 'REDACTED')
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
      const keysRegex = /([?&])(email|e|user_email|customer_email|phone|tel|mobile|first_name|last_name|full_name|name|password|pass|token|access_token|refresh_token|auth|key|api_key|secret|checkout_id|session_id|invite|invite_code|auth_code|reset_code|verification_code|code_verifier)=([^&#]*)/ig
      return redactedUrl.replace(keysRegex, '$1$2=REDACTED')
    } catch (fallbackErr) {
      return url
    }
  }
}

/**
 * Scans an object shallowly for URL/referrer keys and redacts them.
 * Does not touch standard identity identifiers like user_id, customer_id, etc.
 *
 * @param {object} obj - Object containing properties or traits.
 * @returns {object} A sanitized copy of the object.
 */
export function redactPiiFromObject(obj) {
  if (!obj || typeof obj !== 'object') return obj

  const newObj = { ...obj }
  const urlFields = new Set(['page_url', 'referrer', 'landing_page', 'current_url', 'last_event_url', 'url', 'href', 'destination_url'])

  for (const key of Object.keys(newObj)) {
    if (urlFields.has(key.toLowerCase()) && typeof newObj[key] === 'string') {
      newObj[key] = redactPiiFromUrl(newObj[key])
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
