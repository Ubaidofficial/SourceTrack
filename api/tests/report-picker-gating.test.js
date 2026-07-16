// Report Builder picker gating — the picker must offer EXACTLY what the server's gate allows.
// TOKEN-FREE, NO network, no React runner needed (the gating helpers are pure).
//
// THE POINT OF THIS FILE IS ANTI-DRIFT. dashboard/src/lib/reportGating.js IMPORTS
// api/lib/report-config-validation.js rather than re-typing GATED_GROUPS/GATED_METRICS,
// because a hand-maintained copy is exactly the bug #248 killed (attribution.js held a
// byte-identical duplicate allowlist; trimming one leaked the gated shape through the other),
// and the repo already has a live example of that failure mode (api/lib/plan-features.js vs
// dashboard/src/lib/planFeatures.js). These tests assert the picker's view IS the server's
// view — by identity, not by a copied list — so adding a gate server-side greys the picker
// with no frontend edit.

import test from 'node:test'
import assert from 'node:assert/strict'

const gate = await import('../lib/report-config-validation.js')
const picker = await import('../../dashboard/src/lib/reportGating.js')

// ── ANTI-DRIFT: the picker reads the SERVER's sets, it does not fork them ────────────
test('🔴 ANTI-DRIFT: every server-GATED dim is greyed by the picker (derived, not copied)', () => {
  for (const dim of gate.GATED_GROUPS) {
    assert.equal(picker.isGatedDimension(dim), true, `${dim} is gated server-side -> must be greyed`)
    assert.equal(picker.dimensionGateReason(dim, 'revenue'), picker.GATED_TOOLTIP, dim)
  }
})

test('🔴 ANTI-DRIFT: every server-GATED metric is greyed by the picker', () => {
  for (const m of gate.GATED_METRICS) {
    assert.equal(picker.isGatedMetric(m), true, `${m} is gated server-side -> must be greyed`)
    assert.equal(picker.metricGateReason(m), picker.GATED_TOOLTIP, m)
  }
})

test('🔴 ANTI-DRIFT: the picker re-exports the SAME Set objects (a fork is impossible)', () => {
  assert.equal(picker.SESSION_REPORT_DIMS, gate.SESSION_REPORT_DIMS, 'same object identity')
  assert.equal(picker.SESSION_PIPE_METRICS, gate.SESSION_PIPE_METRICS, 'same object identity')
})

// ── the KEEP set stays selectable (greying it would hide working features) ──────────
test('KEEP dims are selectable for revenue/conversions', () => {
  for (const dim of ['source', 'campaign', 'channel', 'medium', 'landing_page', 'country', 'device', 'browser', 'date', 'provider', 'attribution_status', 'stitching_method', 'conversion_type']) {
    assert.equal(picker.dimensionGateReason(dim, 'revenue'), null, dim)
    assert.equal(picker.dimensionGateReason(dim, 'conversions'), null, dim)
  }
})

test('KEEP metrics are selectable — incl. avg_conversion_value/leads/customers (pre-agg-served)', () => {
  for (const m of ['revenue', 'conversions', 'leads', 'customers', 'avg_conversion_value', 'days_to_convert', 'touchpoints_per_conversion']) {
    assert.equal(picker.metricGateReason(m), null, m)
  }
})

// ── always-gated, per the brief ─────────────────────────────────────────────────────
test('always-gated dims: keyword, referrer_domain, custom_param:*', () => {
  for (const dim of ['keyword', 'referrer_domain', 'custom_param:plan', 'custom_param:tier']) {
    assert.equal(picker.isGatedDimension(dim), true, dim)
  }
})

test('always-gated metrics: ltv_revenue, the 4 AI metrics, sessions, conversion_rate', () => {
  for (const m of ['ltv_revenue', 'ai_conversion_share', 'ai_revenue_share', 'ai_conversions', 'ai_revenue', 'sessions', 'conversion_rate']) {
    assert.equal(picker.isGatedMetric(m), true, m)
  }
})

// ── CONDITIONAL: session_* metrics x the 7 SESSION_REPORT_DIMS ──────────────────────
test('session_* metric + a SUPPORTED dim -> selectable', () => {
  for (const m of gate.SESSION_PIPE_METRICS) {
    for (const dim of gate.SESSION_REPORT_DIMS) {
      assert.equal(picker.dimensionGateReason(dim, m), null, `${m} x ${dim}`)
    }
  }
})

test('session_* metric + an UNSUPPORTED dim -> greyed with the session-specific reason', () => {
  for (const dim of ['channel', 'browser', 'provider', 'attribution_status', 'stitching_method', 'conversion_type']) {
    assert.equal(picker.dimensionGateReason(dim, 'session_count'), picker.SESSION_DIM_TOOLTIP, dim)
  }
})

test('the session-dim rule applies ONLY to session_* metrics (channel stays open for revenue)', () => {
  assert.equal(picker.dimensionGateReason('channel', 'revenue'), null, 'channel x revenue is pre-agg-served')
  assert.equal(picker.dimensionGateReason('channel', 'session_count'), picker.SESSION_DIM_TOOLTIP)
})

// ── the window gate is deliberately NOT expressed in the picker ─────────────────────
test('window options are NOT gated here — that gate is DIM-AWARE (Class-A dims are window-tolerant)', () => {
  // Greying windows globally would wrongly deny Class-A dims, which serve any window.
  // The runtime gate handles it and denies cleanly; the picker must not guess.
  assert.equal(typeof picker.dimensionGateReason, 'function')
  assert.ok(!Object.keys(picker).some(k => /window/i.test(k)), 'reportGating exposes no window gating')
})

// ── tone matches the server + describeQueryError's gated state ──────────────────────
test('tooltip copy matches the gate tone (same sentence the locked state shows)', () => {
  assert.match(picker.GATED_TOOLTIP, /Temporarily unavailable while reporting moves to the new analytics store\./)
  assert.doesNotMatch(picker.GATED_TOOLTIP, /try again|retry|narrower/i, 'a gate is not retryable')
})
