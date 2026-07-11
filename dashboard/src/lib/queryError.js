// Single source of truth for turning a React Query failure into an HONEST, user-facing descriptor.
// PRODUCT RULE (design spec §5.1 — no fake zeros): an error must NEVER render as "no data" / a zero.
// An error rendered as empty is a fake zero on the customer's own business data. Every data surface
// renders <QueryError> whenever isError is true — BEFORE any empty/zero state. Pure + unit-tested so
// the rule holds identically everywhere.
export function describeQueryError (error) {
  const isTimeout = error?.error_code === 'query_timeout'
  return {
    isTimeout,
    title: isTimeout ? 'Query timed out' : "Couldn't load this data",
    message: isTimeout
      ? 'This query timed out for the selected range. Try a narrower date range or a different dimension.'
      : "We couldn't fetch this data — this is a fetch error, not an empty result. Please try again, or pick a narrower range."
  }
}
