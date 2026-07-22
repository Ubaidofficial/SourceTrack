// Picker gating — derived from the canonical gate constants, never re-typed here.
//
// ── WHY THE CONSTANTS ARE LOCAL, AND THE API REACHES IN ─────────────────────────────────
// The picker must offer exactly what the server's gate allows. A hand-maintained copy here is
// EXACTLY the bug #248 was created to kill: `attribution.js` and `report-config-validation.js`
// held byte-identical duplicate allowlists, and trimming one silently leaked the gated shape
// through the other. This repo already has a live example of that failure mode —
// `api/lib/plan-features.js` and `dashboard/src/lib/planFeatures.js` must be edited in lockstep.
//
// So there is ONE source: ./gate-constants.js. api/lib/report-config-validation.js imports it
// and re-exports it, which is why the anti-drift test can assert Set IDENTITY across the two.
//
// The direction matters. Railway builds the Dashboard service with rootDirectory=/dashboard, so
// /api is NOT in that build context: importing from ../../../api/ resolves at the repo root (CI,
// local dev) and then FAILS the real Railway dashboard build — that is how #252 shipped a green
// CI and a broken prod deploy. The API service builds from the repo ROOT, so api->dashboard
// resolves everywhere. Precedent: api/lib/source-normalizer.js re-exports from dashboard/src/lib
// and is imported by live routes (dashboard.js, journey.js, leads-server.js).
//
// ⚠️ COUPLING TO PRESERVE: keep gate-constants.js PURE (zero imports, zero node APIs) — the API
// reaches into it, so anything client-only there would break the server, and anything node-only
// would break this bundle. NEVER import from api/ in this directory.
import {
  GATED_GROUPS,
  GATED_METRICS,
  SESSION_REPORT_DIMS,
  SESSION_PIPE_METRICS
} from './gate-constants.js'

// The tone matches the server's gate copy + describeQueryError's gated state, so the tooltip
// and the locked state a user hits say the same thing.
// Was '…while reporting moves to the new analytics store.' until 2026-07-21 — that migration
// COMPLETED 2026-07-19 (PostHog 416017 deleted), so the clause described a finished transition.
// Kept in lockstep with the server's UNAVAILABLE_SUFFIX; report-picker-gating.test.js pins it.
export const GATED_TOOLTIP =
  'Not available yet.'

export const SESSION_DIM_TOOLTIP =
  'Session metrics can only be broken down by source, medium, campaign, landing page, country, device, or date.'

// A custom_param:* dim has no pre-agg and no pipe -> always gated (prefix-matched server-side).
const isCustomParamDim = (key) => typeof key === 'string' && key.startsWith('custom_param:')

/** Is this dimension ALWAYS gated, regardless of the selected metric? */
export function isGatedDimension (key) {
  return GATED_GROUPS.has(key) || isCustomParamDim(key)
}

/** Is this metric ALWAYS gated, regardless of the selected dimension? */
export function isGatedMetric (key) {
  return GATED_METRICS.has(key)
}

/**
 * Reason to grey a DIMENSION for the currently-selected metric, or null if selectable.
 * Two layers:
 *  1. always-gated dims (no pre-agg + no pipe at any shape)
 *  2. CONDITIONAL: when a session_* metric is selected, only the 7 SESSION_REPORT_DIMS can
 *     bucket honestly — every other dim would have fabricated an 'unknown' bucket, so the
 *     server denies it (unsupported_session_dim).
 * The attribution-WINDOW gate is deliberately NOT expressed here: it is dim-aware (Class-A
 * dims are window-tolerant), so greying window options would be wrong. The runtime gate
 * handles it and denies cleanly.
 */
export function dimensionGateReason (key, selectedMetric) {
  if (isGatedDimension(key)) return GATED_TOOLTIP
  if (selectedMetric && SESSION_PIPE_METRICS.has(selectedMetric) && !SESSION_REPORT_DIMS.has(key)) {
    return SESSION_DIM_TOOLTIP
  }
  return null
}

/** Reason to grey a METRIC, or null if selectable. */
export function metricGateReason (key) {
  return isGatedMetric(key) ? GATED_TOOLTIP : null
}

export { SESSION_REPORT_DIMS, SESSION_PIPE_METRICS }
