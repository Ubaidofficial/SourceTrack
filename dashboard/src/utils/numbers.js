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
 * Money is EXACT — always 2 decimals, never rounded (§5.2: $999.99 is not "$1,000").
 * Moved here VERBATIM from Analytics.jsx so the shared DataRow can format money the same way
 * that page already does. Distinct from formatCurrency (0 decimals) and formatCurrencyDecimal
 * (2 decimals, no thousands separator) — neither of which matches, which is why it is its own
 * export rather than a call into one of them.
 */
export function fmtMoney(n) {
  return '$' + safeNumber(n, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
