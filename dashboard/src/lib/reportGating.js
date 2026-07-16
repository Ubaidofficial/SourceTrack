// Picker gating — derived from the SERVER's gate, never re-typed here.
//
// ── WHY THIS IMPORTS ACROSS api/ ────────────────────────────────────────────────────────
// The server denies dead-store report shapes in `api/lib/report-config-validation.js`
// (GATED_GROUPS / GATED_METRICS). The picker must offer exactly what the gate allows. A
// hand-maintained copy here is EXACTLY the bug #248 was created to kill: `attribution.js`
// and that module held byte-identical duplicate allowlists, and trimming one silently leaked
// the gated shape through the other. This repo already has a live example of that failure
// mode — `api/lib/plan-features.js` and `dashboard/src/lib/planFeatures.js` are a duplicated
// pair that must be edited in lockstep.
//
// So we import the ONE source instead of forking it. This is safe because
// report-config-validation.js is PURE: zero imports, zero node-only APIs (no fs/path/process),
// just Sets + pure functions. It holds no secrets — the API already echoes these same lists to
// unauthenticated clients in its 400 "Must be one of: …" messages. Cross-boundary imports have
// precedent here (api/tests import dashboard/src/lib/*).
//
// ⚠️ COUPLING TO PRESERVE: if report-config-validation.js ever gains a node-only import, this
// client bundle breaks. Keep that module pure. `dashboard/vite.config.js` sets
// `server.fs.allow` so the dev server can read it from outside the Vite root.
import {
  GATED_GROUPS,
  GATED_METRICS,
  SESSION_REPORT_DIMS,
  SESSION_PIPE_METRICS
} from '../../../api/lib/report-config-validation.js'

// The tone matches the server's gate copy + describeQueryError's gated state, so the tooltip
// and the locked state a user hits say the same thing.
export const GATED_TOOLTIP =
  'Temporarily unavailable while reporting moves to the new analytics store.'

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
