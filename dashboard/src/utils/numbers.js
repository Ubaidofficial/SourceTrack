/**
 * Safely format numbers to prevent NaN display
 */

/**
 * Convert any value to a safe number, returning fallback if invalid
 */
export function safeNumber(value, fallback = 0) {
  if (value == null) return fallback
  const num = Number(value)
  return isNaN(num) || !isFinite(num) ? fallback : num
}

/**
 * Safely format currency with $ prefix
 */
export function formatCurrency(value, fallback = 0) {
  const num = safeNumber(value, fallback)
  return `$${num.toFixed(0)}`
}

/**
 * Safely format currency with decimals
 */
export function formatCurrencyDecimal(value, decimals = 2, fallback = 0) {
  const num = safeNumber(value, fallback)
  return `$${num.toFixed(decimals)}`
}

/**
 * Safely format number with locale string
 */
export function formatNumber(value, fallback = 0) {
  const num = safeNumber(value, fallback)
  return num.toLocaleString()
}

/**
 * Safely format percentage
 */
export function formatPercent(value, decimals = 0, fallback = 0) {
  const num = safeNumber(value, fallback)
  return `${num.toFixed(decimals)}%`
}

/**
 * Safely format multiplier (e.g., ROAS)
 */
export function formatMultiplier(value, decimals = 2, fallback = 0) {
  const num = safeNumber(value, fallback)
  return `${num.toFixed(decimals)}x`
}
