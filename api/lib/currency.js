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
 *   'ok'      — every amount carried the same currency; `currency` is it, the sum is meaningful
 *   'mixed'   — amounts carried DIFFERENT currencies; the sum is not meaningful
 *   'partial' — one currency, but at least one amount carried NO usable unit
 *   'unknown' — nothing carried a usable unit (including: there were no amounts)
 *
 * CALLER CONTRACT: pass exactly ONE entry per amount that needs denominating, INCLUDING the
 * null/absent ones. A missing entry and a null entry mean opposite things here — null is
 * "this amount exists and we do not know its unit", which is the whole point of 'partial'.
 * Filter out $0 rows BEFORE calling: a zero has no unit to be missing, and letting it through
 * would report 'partial' for a site that is perfectly healthy.
 *
 * WHY 'partial' EXISTS. It previously dropped nulls before checking agreement, so [USD, USD,
 * null] reported 'ok'/'USD' — a confident label over a sum containing an amount nobody can
 * denominate. Found on prod: www.techrupt.pk carries a 753.06 USD Shopify order alongside a
 * 777.77 row whose conversion_event_id is a UUID (it never passed through
 * revenue_ingestion_events.order_id, so there was nothing to backfill a unit from).
 *
 * 'partial' rather than folding into 'unknown', deliberately: 'unknown' asserts that no unit is
 * known, when in fact we know most of the rows and exactly which ones we do not. The two states
 * also need different fixes — 'unknown' means an integration never sends currency at all,
 * 'partial' means ONE ingestion path is dropping it while the others carry it. Collapsing them
 * would hide the more diagnosable of the two. It costs callers nothing: the rule is, and stays,
 * "only 'ok' may render a currency symbol".
 *
 * PRECEDENCE: 'mixed' outranks 'partial'. If the known codes already disagree the sum is
 * unsummable regardless of what is missing, and that is the more actionable fact. Both suppress
 * rendering, so the order only decides which message the client shows.
 *
 * INVARIANT: `currency` is non-null ONLY for 'ok'. A client that checks `if (currency)` before
 * rendering must never be handed a code it is not allowed to print.
 *
 * @param {Iterable<unknown>} raw one currency value per amount, in any case, nulls included
 * @returns {{ currency: string|null, currency_status: 'ok'|'mixed'|'partial'|'unknown' }}
 */
export function collapseCurrencies (raw) {
  const codes = new Set()
  let undenominated = 0
  for (const value of raw) {
    const code = normalizeCurrencyCode(value)
    if (code) codes.add(code)
    else undenominated++
  }
  if (codes.size === 0) return { currency: null, currency_status: 'unknown' }
  if (codes.size > 1) return { currency: null, currency_status: 'mixed' }
  if (undenominated > 0) return { currency: null, currency_status: 'partial' }
  return { currency: [...codes][0], currency_status: 'ok' }
}

/**
 * The currency a site's revenue figures are denominated in, derived from its recent successful
 * ingestions. revenue_ingestion_events is the ONLY store that has carried the unit end to end,
 * which is why the site-level answer comes from here rather than from the revenue figures
 * themselves: the Tinybird reporting pipes that produce dashboard/leads revenue do not select
 * `currency` today, so a per-row unit is not available to those readers.
 *
 * Returns a status alongside the code so callers can tell the cases apart instead of collapsing
 * them into a symbol — see collapseCurrencies() for the full vocabulary ('ok' | 'mixed' |
 * 'partial' | 'unknown'). Vocabulary matches summarizeCurrencyStatus() in ad-cost-imports.js so
 * the dashboard has one currency-status language. Nothing here is ever reported as 'ok' with a
 * USD fallback — that fallback is what let a EUR site render as dollars.
 *
 * `value` is selected purely to drop $0 rows before the collapse. It is not otherwise used.
 * Since collapseCurrencies() began treating a null unit on a real amount as 'partial', passing
 * zero-value rows through would report 'partial' for a perfectly healthy site: a $0 lead or
 * trial event has no unit to be missing, and on prod every currency-less ingestion event is
 * exactly $0. Without this filter those six rows alone would suppress the site's revenue label.
 *
 * @param {object} supabase
 * @param {string} siteKey
 * @returns {Promise<{ currency: string|null, currency_status: 'ok'|'mixed'|'partial'|'unknown' }>}
 */
export async function resolveSiteRevenueCurrency (supabase, siteKey) {
  const { data, error } = await supabase
    .from('revenue_ingestion_events')
    .select('currency, value')
    .eq('site_key', siteKey)
    .eq('status', 'success')
    .limit(100)

  // A failed read is UNKNOWN, not USD. Guessing here would mislabel money on a read error.
  if (error) return { currency: null, currency_status: 'unknown' }

  return collapseCurrencies(
    (data || []).filter(e => (Number(e.value) || 0) !== 0).map(e => e.currency)
  )
}
