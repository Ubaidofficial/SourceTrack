// Volume-only guard for the MCP volume tools.
//
// The volume tools were scoped safe-by-construction: counts only, no revenue, no
// cost, no attribution model. The risk is not that someone deliberately adds a
// revenue field — it is that a WRAPPED READ ALREADY CARRIES ONE and gets passed
// through unfiltered. That is not hypothetical here:
//
//   · the `first_touch_by_site` pipe selects `SUM(...) AS revenue` alongside its
//     conversion count, and
//   · the `leads_list` read behind /api/leads selects `total_revenue`.
//
// So a handler that forwarded a pipe row verbatim would ship revenue out of a
// tool that promises it contains none. This module is the backstop against that.
//
// TWO LAYERS, and it is worth being precise about which one actually defends:
//   1. Handlers PROJECT explicitly — they build their response from named fields
//      rather than spreading a pipe row. An allowlist beats a denylist, and this
//      is what keeps revenue out TODAY.
//   2. volumeOnly() re-checks the finished payload, because layer 1 is a
//      CONVENTION that a future edit can break in one careless line
//      (`...row` instead of naming three fields).
//
// MEASURED, not assumed: with layer 2 removed, every route-level test still
// passes — because layer 1 already excludes revenue, so there is nothing left
// for layer 2 to strip. That makes layer 2 a REGRESSION DETECTOR, not a filter
// that does daily work, and it is documented as such rather than described as
// load-bearing when it is not. What makes it non-decorative is that it does not
// clean silently: a leak is logged as a BUG, so the day someone spreads a raw
// pipe row the strip does not quietly paper over it forever. Its own tests feed
// it a real revenue-carrying pipe row and assert it fires.
//
// NOT a §26 ruling of its own: it enforces the decision that these tools are
// volume-only. Building revenue tools is a separate, deferred decision, and if
// that ever lands it belongs in its own surface — not by loosening this list.

// Every field name that would turn a volume answer into a financial or
// causal-attribution one. Matched case-insensitively, at any depth.
export const FORBIDDEN_FIELDS = [
  // revenue / money
  'revenue', 'total_revenue', 'conversion_value', 'value', 'amount', 'mrr', 'arr',
  'currency',
  // cost-derived
  'cost', 'spend', 'ad_spend', 'cpl', 'cac', 'roas', 'cpa', 'cpc', 'net_profit', 'profit',
  // attribution-model selection — the tools state a FIXED touch convention in
  // their own output; a model field would reintroduce the choice they exclude.
  'attribution_model', 'model'
]

const FORBIDDEN = new Set(FORBIDDEN_FIELDS.map(f => f.toLowerCase()))

/**
 * Deep-remove every forbidden field from a response payload. Pure: returns a new
 * structure, never mutates the input (a caller may still hold the raw pipe row).
 *
 * Arrays and nested objects are walked, so a forbidden field cannot survive by
 * sitting one level down inside a breakdown row.
 */
export function stripFinancialFields (value) {
  if (Array.isArray(value)) return value.map(stripFinancialFields)
  if (value === null || typeof value !== 'object') return value

  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN.has(String(k).toLowerCase())) continue
    out[k] = stripFinancialFields(v)
  }
  return out
}

/**
 * The guard the handlers actually call. Returns the payload unchanged when clean.
 *
 * When it is NOT clean, it strips — the customer must never receive a financial
 * field from a tool that promises none — but it also logs the leak as a BUG, with
 * the offending paths. That noise is the point: a silent clean would let a
 * handler that started spreading raw pipe rows keep shipping the wrong shape
 * indefinitely, with the guard quietly covering for it. Same behaviour in every
 * environment, so what CI exercises is what production runs.
 *
 * @param {object} payload the finished response body
 * @param {string} context handler name, for the log line
 */
export function volumeOnly (payload, context = 'volume tool') {
  const leaked = findFinancialFields(payload)
  if (leaked.length === 0) return payload

  console.error(
    `[volume-only] BUG: ${context} tried to emit forbidden field(s): ${leaked.join(', ')} — stripped before sending. ` +
    'Volume tools must PROJECT named fields, never spread a pipe row: first_touch_by_site returns a revenue column.'
  )
  return stripFinancialFields(payload)
}

/**
 * Find every forbidden field remaining in a payload, as dotted paths. Used by
 * volumeOnly() and by the tests to assert structural absence.
 * @returns {string[]} empty when the payload is clean
 */
export function findFinancialFields (value, path = '') {
  const hits = []
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findFinancialFields(v, `${path}[${i}]`)))
    return hits
  }
  if (value === null || typeof value !== 'object') return hits

  for (const [k, v] of Object.entries(value)) {
    const here = path ? `${path}.${k}` : k
    if (FORBIDDEN.has(String(k).toLowerCase())) hits.push(here)
    else hits.push(...findFinancialFields(v, here))
  }
  return hits
}
