// route-args — the single source of truth for the args the flexible-report ROUTE injects.
// EXTRACTED VERBATIM from tinybird/tools/route_ab_diff.mjs (D3, PR#28x) when that A/B harness
// was retired — the harness could no longer A/B anything (all reads Tinybird-sole), but this
// pure, posthog-free helper is still the contract for api/tests/route-args-matrix.test.js (the
// CI gate that caught 3 prod arg-omission strikes). DO NOT edit the defaults/shape here without
// re-verifying against attribution.js's route injection — a subtle change is a silent regression.

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE-ARGS CONVENTION — the single source of truth for the args the ROUTE injects.
//
// Three prod false-GREENs came from `callFn` targets hand-supplying args the route actually
// varies: (1) the console.debug log channel, (2) the ALWAYS-injected attribution_window (→ the
// live 504), (3) session-report ignoring filter_* (→ wrong numbers). Root cause: targets tested
// ONE point of the route's arg space. attribution.js (:96-231) injects these on EVERY flexible
// request. Targets and the route-args MATRIX test build args THIS way so a target cannot silently
// omit a dimension. Pair with api/tests/route-args-matrix.test.js (the enforced CI gate).
export const ROUTE_ARG_DEFAULTS = { granularity: 'day', attributionWindow: '30', attributeBy: 'conversion_date', timezone: 'UTC' }

// Build the getFlexibleReport/getSessionReport arg tail exactly as the route does. Overrides:
//   { filters, groupBy2, granularity, attributionWindow (pass null to force no-window), attributeBy, timezone }.
// filters.timezone is ALWAYS present (the route injects it at attribution.js:227) — targets that
// omitted it never exercised the tz gate.
export function buildRouteArgs (over = {}) {
  const timezone = over.timezone ?? ROUTE_ARG_DEFAULTS.timezone
  return {
    filters: { timezone, ...(over.filters || {}) },
    groupBy2: over.groupBy2 ?? null,
    granularity: over.granularity ?? ROUTE_ARG_DEFAULTS.granularity,
    attributionWindow: ('attributionWindow' in over) ? over.attributionWindow : ROUTE_ARG_DEFAULTS.attributionWindow,
    attributeBy: over.attributeBy ?? ROUTE_ARG_DEFAULTS.attributeBy
  }
}
