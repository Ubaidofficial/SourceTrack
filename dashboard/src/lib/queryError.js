// Single source of truth for turning a React Query failure into an HONEST, user-facing descriptor.
// PRODUCT RULE (design spec §5.1 — no fake zeros): an error must NEVER render as "no data" / a zero.
// An error rendered as empty is a fake zero on the customer's own business data. Every data surface
// renders <QueryError> whenever isError is true — BEFORE any empty/zero state. Pure + unit-tested so
// the rule holds identically everywhere.

// Server-side GATES — not failures, and NOT retryable. The requested report shape has no live
// backend, so the server DENIES it (422) instead
// of querying a dead store and returning zeros. Retrying or narrowing the range cannot help, so
// these render a calm "temporarily unavailable" state with NO retry affordance (offering Retry on a
// permanent gate is its own small lie).
//   gated_dead_store        — this dim/metric/window shape has no pre-agg and no pipe
//   unsupported_session_dim — session metrics can only bucket by pageview-derivable dims
const GATED_CODES = new Set(['gated_dead_store', 'unsupported_session_dim'])

export function isGatedError (error) {
  return GATED_CODES.has(error?.error_code)
}

export function describeQueryError (error) {
  if (isGatedError(error)) {
    return {
      isTimeout: false,
      isGated: true,
      title: 'Temporarily unavailable',
      // Prefer the server's specific reason (it names the dim/metric); fall back to the generic line.
      // Was '…while reporting moves to the new analytics store.' until 2026-07-21 — that migration
      // completed 2026-07-19, so the clause described a finished transition.
      message: error?.message ||
        'This view is not available yet.'
    }
  }

  const isTimeout = error?.error_code === 'query_timeout'
  return {
    isTimeout,
    isGated: false,
    title: isTimeout ? 'Query timed out' : "Couldn't load this data",
    message: isTimeout
      ? 'This query timed out for the selected range. Try a narrower date range or a different dimension.'
      : "We couldn't fetch this data — this is a fetch error, not an empty result. Please try again, or pick a narrower range."
  }
}
