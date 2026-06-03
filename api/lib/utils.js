/**
 * Shared utility functions used across multiple routes/jobs.
 *
 * Before this module existed, the same trivial functions (`esc`, `toHogDate`,
 * `normalizeUtm`, `getFirstTouchFields`) were copy-pasted across 12+ files.
 * That made HogQL escaping (a security-critical helper) inconsistent — most
 * files used the plain version, one (`events.js`) defensively wrapped with
 * `String()`. The consolidated version uses the safer pattern.
 */

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
  const urlFields = new Set(['page_url', 'referrer', 'landing_page', 'current_url', 'last_event_url', 'url', 'href'])

  for (const key of Object.keys(newObj)) {
    if (urlFields.has(key.toLowerCase()) && typeof newObj[key] === 'string') {
      newObj[key] = redactPiiFromUrl(newObj[key])
    }
  }
  return newObj
}
