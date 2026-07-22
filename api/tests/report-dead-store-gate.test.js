// Wave-4 dead-store gate — /api/attribution denies report shapes that would reach a DEAD
// PostHog read, WITHOUT touching the live KEEP set. TOKEN-FREE, NO network.
//
// The gate rule is pure (gatedReportReason), so the shape matrix is asserted directly.
// The two contract tests that matter:
//   (a) KEEP: source × revenue × matching window -> NOT gated (falls through to the
//       Supabase pre-agg short-circuit; the gate must never intercept it).
//   (b) GATE: keyword / ltv_revenue / non-matching window -> gated, so the route returns
//       422 BEFORE any queryHogQL call.
//
// WHY window-awareness is dim-aware: the Class-A pipes (provider/attribution_status/
// stitching_method/conversion_type) are window-TOLERANT and work at any window — a blanket
// "non-default window is gated" would deny four shapes that work today.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

// UNAVAILABLE_SUFFIX is CONSUMED here, never re-typed. These tests used to match a hardcoded
// fragment of the gate sentence, which silently encoded product copy in a file whose subject is the
// GATE, not its wording. Asserting against the exported constant makes them wording-independent: a
// reviewed copy change can no longer redden them, while a message that stops using the shared
// sentence still will (KI-57).
const { gatedReportReason, ALLOWED_GROUPS, ALLOWED_METRICS, GATED_GROUPS, GATED_METRICS, CLASS_A_DIMS, SESSION_REPORT_DIMS, SESSION_PIPE_METRICS, UNAVAILABLE_SUFFIX } =
  await import('../lib/report-config-validation.js')

// ── (a) KEEP set: must NOT be gated ─────────────────────────────────────────────────
const KEEP_DIMS = ['source', 'campaign', 'channel', 'medium', 'landing_page', 'country', 'device', 'browser', 'date', 'ai_source']

for (const dim of KEEP_DIMS) {
  for (const metric of ['revenue', 'conversions']) {
    test(`KEEP: ${dim} × ${metric} × matching window -> NOT gated (pre-agg serves it)`, () => {
      assert.equal(gatedReportReason({ group_by: dim, metric, preAggWindowMatches: true }), null)
    })
  }
}

test('KEEP: avg_conversion_value is pre-agg-served (PREAGG_CONVERSION_METRICS) -> NOT gated', () => {
  // Regression: the gate brief listed avg_conversion_value as an "exotic/broken" metric.
  // It is in PREAGG_CONVERSION_METRICS -> gating it would break the shipped ecom_aov template.
  assert.equal(gatedReportReason({ group_by: 'campaign', metric: 'avg_conversion_value', preAggWindowMatches: true }), null)
})

test('KEEP: leads + customers are pre-agg-served -> NOT gated', () => {
  assert.equal(gatedReportReason({ group_by: 'source', metric: 'leads', preAggWindowMatches: true }), null)
  assert.equal(gatedReportReason({ group_by: 'source', metric: 'customers', preAggWindowMatches: true }), null)
})

test('KEEP: days_to_convert + touchpoints_per_conversion have dedicated pipes -> NOT gated', () => {
  assert.equal(gatedReportReason({ group_by: 'source', metric: 'days_to_convert', preAggWindowMatches: true }), null)
  assert.equal(gatedReportReason({ group_by: 'source', metric: 'touchpoints_per_conversion', preAggWindowMatches: true }), null)
})

test('KEEP: the 4 session metrics on a SUPPORTED dim -> NOT gated (route to the session pipes)', () => {
  for (const m of SESSION_PIPE_METRICS) {
    for (const dim of SESSION_REPORT_DIMS) {
      assert.equal(gatedReportReason({ group_by: dim, metric: m, preAggWindowMatches: true }), null, `${m} x ${dim}`)
    }
  }
})

// Option A: session metrics are limited to the 7 pageview-derivable dims; anything else would
// FABRICATE a bucket, so it denies with the session-specific code.
test('GATE: a session metric on an UNSUPPORTED dim -> unsupported_session_dim (not a fabricated bucket)', () => {
  for (const dim of ['channel', 'keyword', 'referrer_domain', 'browser', 'provider', 'attribution_status', 'stitching_method', 'conversion_type']) {
    const r = gatedReportReason({ group_by: dim, metric: 'session_count', preAggWindowMatches: true })
    assert.ok(r, `${dim} must be gated for session metrics`)
    assert.equal(r.error_code, 'unsupported_session_dim', dim)
  }
})

// Option A: sessions + conversion_rate never reach the session pipes (the metric switch `break`s;
// they fall to the main sql where only revenue/conversions have a pipe) -> dead on EVERY dim.
test('GATE: sessions + conversion_rate are gated on every dim (they never route to a live backend)', () => {
  for (const m of ['sessions', 'conversion_rate']) {
    for (const dim of ['source', 'campaign', 'channel', 'provider', 'country']) {
      const r = gatedReportReason({ group_by: dim, metric: m, preAggWindowMatches: true })
      assert.ok(r, `${m} x ${dim} must be gated`)
      assert.equal(r.error_code, 'gated_dead_store', `${m} x ${dim}`)
    }
  }
})

test('KEEP: Class-A dims survive a NON-matching window (their pipes are window-tolerant)', () => {
  for (const dim of CLASS_A_DIMS) {
    assert.equal(
      gatedReportReason({ group_by: dim, metric: 'revenue', preAggWindowMatches: false }),
      null,
      `${dim} must NOT be gated at a non-default window — its pipe is window-tolerant`
    )
  }
})

// ── (b) GATE set: must be denied BEFORE any queryHogQL ───────────────────────────────
for (const dim of ['keyword', 'referrer_domain']) {
  test(`GATE: ${dim} -> gated (no pre-agg, no pipe, at any window)`, () => {
    const r = gatedReportReason({ group_by: dim, metric: 'revenue', preAggWindowMatches: true })
    assert.ok(r, `${dim} must be gated`)
    assert.equal(r.error_code, 'gated_dead_store'); assert.ok(r.message.endsWith(UNAVAILABLE_SUFFIX), r.message)
  })
}

test('GATE: custom_param:* -> gated (no pre-agg, no pipe)', () => {
  const r = gatedReportReason({ group_by: 'custom_param:plan', metric: 'revenue', preAggWindowMatches: true })
  assert.ok(r)
  assert.equal(r.error_code, 'gated_dead_store'); assert.match(r.message, /Custom-parameter/)
})

for (const metric of ['ltv_revenue', 'ai_conversion_share', 'ai_revenue_share', 'ai_conversions', 'ai_revenue']) {
  test(`GATE: ${metric} -> gated (bare queryHogQL / no pipe)`, () => {
    const r = gatedReportReason({ group_by: 'source', metric, preAggWindowMatches: true })
    assert.ok(r, `${metric} must be gated`)
    assert.equal(r.error_code, 'gated_dead_store'); assert.ok(r.message.endsWith(UNAVAILABLE_SUFFIX), r.message)
  })
}

test('GATE: non-matching window on a NON-Class-A dim -> gated (pre-agg holds only the materialized window)', () => {
  const r = gatedReportReason({ group_by: 'source', metric: 'revenue', preAggWindowMatches: false })
  assert.ok(r)
  assert.equal(r.error_code, 'gated_dead_store'); assert.match(r.message, /custom attribution window/)
})

test('GATE: a gated SECONDARY dim (group_by2) is caught too', () => {
  const r = gatedReportReason({ group_by: 'source', group_by2: 'keyword', metric: 'revenue', preAggWindowMatches: true })
  assert.ok(r, 'group_by2=keyword must be gated')
})

// ── known-vs-servable: two separate axes (400 "invalid" vs 422 "gated") ──────────────
// A gated dim/metric stays in ALLOWED_* (it is a KNOWN param — answering "Invalid
// group_by: keyword" would read as a client bug) and is denied via GATED_* with a 422.
test('gated shapes stay in ALLOWED_* (known vocabulary) but are listed in GATED_*', () => {
  for (const dim of ['keyword', 'referrer_domain']) {
    assert.ok(ALLOWED_GROUPS.has(dim), `${dim} is a KNOWN param -> stays allowed (400 is wrong)`)
    assert.ok(GATED_GROUPS.has(dim), `${dim} must be gated (422)`)
  }
  for (const m of ['ltv_revenue', 'ai_conversion_share', 'ai_revenue_share', 'ai_conversions', 'ai_revenue']) {
    assert.ok(ALLOWED_METRICS.has(m), `${m} is a KNOWN param -> stays allowed`)
    assert.ok(GATED_METRICS.has(m), `${m} must be gated (422)`)
  }
})

test('the LIVE set is neither removed nor gated', () => {
  for (const dim of ['source', 'campaign', 'channel', 'provider', 'conversion_type']) {
    assert.ok(ALLOWED_GROUPS.has(dim) && !GATED_GROUPS.has(dim), dim)
  }
  for (const m of ['revenue', 'conversions', 'leads', 'customers', 'avg_conversion_value', 'days_to_convert', 'touchpoints_per_conversion']) {
    assert.ok(ALLOWED_METRICS.has(m) && !GATED_METRICS.has(m), m)
  }
  // Option A
  for (const m of ['sessions', 'conversion_rate']) assert.ok(GATED_METRICS.has(m), `${m} gated entirely`)
})
