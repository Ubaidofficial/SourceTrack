// Currency-code normalization for the money rails.
//
// WHY THIS MODULE EXISTS: three call sites needed the same primitive and each was about to
// grow its own copy — nightly-attribution.js (persisting attributed_conversions.currency),
// conversion-sync.js (six ad-platform senders deciding whether an upload may proceed), and
// the CHECK constraint attributed_conversions_currency_format, which this must agree with
// or the nightly write throws on the money rail.
//
// The single rule: a currency is either a well-formed ISO 4217 alpha code, or it is UNKNOWN.
// There is no third state, and unknown NEVER becomes 'USD'. Defaulting a missing unit is how
// a real EUR sale gets rendered — and uploaded to an ad platform's ledger — as dollars.

// ISO 4217 alpha codes are exactly three letters. Deliberately the same expression as the
// attributed_conversions_currency_format / campaign_costs_currency_format CHECK constraints:
// if these ever disagree, Postgres rejects a row this module called valid.
const ISO_4217_ALPHA = /^[A-Z]{3}$/

/**
 * Normalize a currency code to its canonical uppercase form.
 * Returns null for anything that is not a well-formed ISO 4217 alpha code — including
 * null, undefined, '', whitespace, and non-strings. Callers treat null as "unit unknown".
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeCurrencyCode (raw) {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  return ISO_4217_ALPHA.test(code) ? code : null
}

/**
 * True when `raw` names a currency we are willing to attach to a monetary amount.
 * Used by the outbound senders to fail closed: no unit, no upload.
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
export function hasKnownCurrency (raw) {
  return normalizeCurrencyCode(raw) !== null
}

/**
 * Collapse the currencies observed across a set of amounts into ONE unit plus a status.
 *
 * This is the shared decision for "what unit is this total in?", used by every reader that sums
 * money across rows. Statuses, matching summarizeCurrencyStatus()'s vocabulary:
 *   'ok'      — exactly one currency; `currency` is it and the sum is meaningful
 *   'mixed'   — more than one; `currency` is null, and the sum is NOT meaningful
 *   'unknown' — none of the rows carried a usable unit; `currency` is null
 *
 * 'unknown' is deliberately not folded into 'ok': a total whose unit nobody knows must be
 * suppressed or labelled by the client, never stamped with a default symbol.
 *
 * @param {Iterable<unknown>} raw currency values, in any case, including nulls
 * @returns {{ currency: string|null, currency_status: 'ok'|'mixed'|'unknown' }}
 */
export function collapseCurrencies (raw) {
  const codes = new Set()
  for (const value of raw) {
    const code = normalizeCurrencyCode(value)
    if (code) codes.add(code)
  }
  if (codes.size === 0) return { currency: null, currency_status: 'unknown' }
  if (codes.size > 1) return { currency: null, currency_status: 'mixed' }
  return { currency: [...codes][0], currency_status: 'ok' }
}

/**
 * The currency a site's revenue figures are denominated in, derived from its recent successful
 * ingestions. revenue_ingestion_events is the ONLY store that has carried the unit end to end,
 * which is why the site-level answer comes from here rather than from the revenue figures
 * themselves: the Tinybird reporting pipes that produce dashboard/leads revenue do not select
 * `currency` today, so a per-row unit is not available to those readers.
 *
 * Returns a status alongside the code so callers can tell the three cases apart instead of
 * collapsing them into a symbol:
 *   'ok'      — exactly one currency observed; `currency` is it
 *   'mixed'   — more than one; `currency` is null, and summing across them is not meaningful
 *   'unknown' — no revenue ingestion carries a unit; `currency` is null
 *
 * Vocabulary matches summarizeCurrencyStatus() in ad-cost-imports.js so the dashboard has one
 * currency-status language. 'unknown' is deliberately NOT reported as 'ok' with a USD fallback —
 * that fallback is what let a EUR site render as dollars.
 *
 * @param {object} supabase
 * @param {string} siteKey
 * @returns {Promise<{ currency: string|null, currency_status: 'ok'|'mixed'|'unknown' }>}
 */
export async function resolveSiteRevenueCurrency (supabase, siteKey) {
  const { data, error } = await supabase
    .from('revenue_ingestion_events')
    .select('currency')
    .eq('site_key', siteKey)
    .eq('status', 'success')
    .limit(100)

  // A failed read is UNKNOWN, not USD. Guessing here would mislabel money on a read error.
  if (error) return { currency: null, currency_status: 'unknown' }

  return collapseCurrencies((data || []).map(e => e.currency))
}
