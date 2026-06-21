import NodeCache from 'node-cache'

// Shared cache to prevent duplicate conversions between explicit /api/conversion and automated form submissions.
// TTL: 5 seconds (5000ms) to handle near-simultaneous triggers
export const shortWindowCache = new NodeCache({ stdTTL: 5, checkperiod: 2 })

/**
 * Constructs a normalized deduplication key based on site, visitor (anonymous_id), and normalized page URL.
 * URL parameters and hashes are stripped to ensure cross-deduplication matches.
 *
 * @param {string|number} siteId
 * @param {string} anonymousId
 * @param {string} pageUrl
 * @returns {string}
 */
export function getDedupeKey(siteId, anonymousId, pageUrl) {
  if (!siteId || !anonymousId) return ''
  let cleanPage = String(pageUrl || '').trim()
  const qIdx = cleanPage.indexOf('?')
  if (qIdx > -1) cleanPage = cleanPage.substring(0, qIdx)
  const hIdx = cleanPage.indexOf('#')
  if (hIdx > -1) cleanPage = cleanPage.substring(0, hIdx)
  return `${siteId}:${anonymousId}:${cleanPage}`
}

/**
 * Registers a conversion (either explicit or auto-promoted) in the deduplication cache.
 *
 * @param {string|number} siteId
 * @param {string} anonymousId
 * @param {string} pageUrl
 * @param {boolean} isExplicit
 * @param {string} conversionType
 * @param {number} conversionValue
 * @param {boolean} hasOrderId
 */
export function registerConversion(siteId, anonymousId, pageUrl, isExplicit, conversionType, conversionValue, hasOrderId) {
  const key = getDedupeKey(siteId, anonymousId, pageUrl)
  if (!key) return

  const record = {
    timestamp: Date.now(),
    isExplicit: !!isExplicit,
    conversionType: conversionType || 'form',
    conversionValue: Number(conversionValue) || 0,
    hasOrderId: !!hasOrderId
  }

  shortWindowCache.set(key, record)
}

/**
 * Checks whether an incoming conversion event (explicit or auto-promoted) is a duplicate
 * of a recently processed conversion within the lookback window.
 *
 * Rules:
 * 1. For incoming auto-promoted form conversions: ALWAYS skip if ANY conversion was recently processed.
 * 2. For incoming explicit conversions: Only skip if it is a generic form conversion (type 'form' or empty)
 *    AND a generic conversion/form conversion was recently processed. Rich explicit conversions (having
 *    an order ID, positive revenue, or specific non-form conversion type like 'purchase') are NEVER discarded.
 *
 * @param {string|number} siteId
 * @param {string} anonymousId
 * @param {string} pageUrl
 * @param {boolean} incomingIsExplicit
 * @param {string} incomingType
 * @param {number} incomingValue
 * @param {boolean} incomingHasOrderId
 * @returns {boolean} True if duplicate/should be skipped
 */
export function checkIsDuplicate(siteId, anonymousId, pageUrl, incomingIsExplicit, incomingType, incomingValue, incomingHasOrderId) {
  const key = getDedupeKey(siteId, anonymousId, pageUrl)
  if (!key) return false

  const existing = shortWindowCache.get(key)
  if (!existing) return false

  // Rule 1: Incoming is auto-promoted form conversion (implicit)
  if (!incomingIsExplicit) {
    return true // Always skip auto-promotion if any conversion recently happened for this visitor on this page
  }

  // Rule 2: Incoming is explicit conversion
  // Rich explicit conversions (having order_id, revenue value, or non-form type) are never discarded
  const isIncomingRich = !!incomingHasOrderId || (Number(incomingValue) > 0) || (incomingType && incomingType !== 'form')
  if (isIncomingRich) {
    return false
  }

  // If the incoming is generic form conversion, check if existing was also a generic/form conversion
  if (existing.conversionType === 'form' || !existing.conversionType) {
    return true
  }

  return false
}
