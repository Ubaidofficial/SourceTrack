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
 * Currency code guard, shared with MetricTile.jsx so the two do not fork.
 * Returns an upper-cased 3-letter code, or 'USD' for anything else (null, '', 'dollars').
 * A malformed code passed to Intl.NumberFormat throws RangeError mid-render — a white screen —
 * so every currency reaching an Intl call goes through here first. A well-formed but unknown
 * code (e.g. 'XYZ') does NOT throw; Intl renders it as a literal prefix, which is the honest
 * result and is left alone.
 */
export function normalizeCurrency(currency) {
  const code = typeof currency === 'string' ? currency.toUpperCase() : ''
  return /^[A-Z]{3}$/.test(code) ? code : 'USD'
}

/**
 * USD keeps the pre-existing string-concat path VERBATIM; only non-USD goes through Intl.
 *
 * Why the branch exists: Intl.NumberFormat cannot reproduce what these functions render today.
 * It groups thousands ($1,235 vs $1235) and moves the sign (-$1235 vs $-1235). Routing USD
 * through Intl would therefore change every existing call site's output — which this change is
 * explicitly not allowed to do. Gating on the CODE (not on "was an argument passed") is what
 * makes the guarantee survive the follow-up wiring work: once real currencies flow through,
 * a USD site still renders byte-identically to today.
 *
 * Consequence, deliberately accepted: USD renders ungrouped and non-USD renders grouped.
 * That is the pre-existing formatCurrency wart, now visible rather than new. Reconciling it is
 * a behavior change and belongs in its own pass.
 */
function isUsd(currency) {
  return normalizeCurrency(currency) === 'USD'
}

function intlCurrency(num, currency, digits) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalizeCurrency(currency),
    ...digits
  }).format(num)
}

/**
 * Safely format currency, no decimals. Defaults to USD, which renders exactly as before.
 */
export function formatCurrency(value, fallback = 0, currency = 'USD') {
  const num = safeNumber(value, fallback)
  if (isUsd(currency)) return `$${num.toFixed(0)}`
  return intlCurrency(num, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/**
 * Safely format currency with decimals. Defaults to USD, which renders exactly as before.
 * `currency` is the FOURTH parameter because call sites already pass `decimals`/`fallback`
 * positionally (e.g. SEORevenue.jsx's `formatCurrency(x, 0)`); inserting it earlier would
 * silently reinterpret those arguments.
 */
export function formatCurrencyDecimal(value, decimals = 2, fallback = 0, currency = 'USD') {
  const num = safeNumber(value, fallback)
  if (isUsd(currency)) return `$${num.toFixed(decimals)}`
  return intlCurrency(num, currency, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/**
 * Money is EXACT — always 2 decimals, never rounded (§5.2: $999.99 is not "$1,000").
 * Moved here VERBATIM from Analytics.jsx so the shared DataRow can format money the same way
 * that page already does. Distinct from formatCurrency (0 decimals) and formatCurrencyDecimal
 * (2 decimals, no thousands separator) — neither of which matches, which is why it is its own
 * export rather than a call into one of them.
 *
 * The exactness rule is currency-independent: min = max = 2 on BOTH paths, so €999.99 is not
 * "€1,000" either — including for currencies whose own convention is 0 decimals (JPY).
 */
export function fmtMoney(n, currency = 'USD') {
  const num = safeNumber(n, 0)
  if (isUsd(currency)) return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return intlCurrency(num, currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
