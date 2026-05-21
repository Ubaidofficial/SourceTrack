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
