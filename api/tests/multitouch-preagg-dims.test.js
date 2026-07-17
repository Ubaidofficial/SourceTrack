// Multi-touch pre-agg dim contract — the "confident wrong bucket" fix.
// TOKEN-FREE, NO network, no DB.
//
// THE BUG: the 4 multi-touch pre-agg readers bucketed by `touch[groupBy] || touch.source || 'direct'`.
// The stored touch (nightly-attribution's tpBase) gained country/device/browser/landing_page only in
// 87ee5e7 (2026-06-24), and NEVER carries ai_source/conversion_type/date. So for those dims
// `touch[groupBy]` was undefined and the reader silently substituted the SOURCE — returning "google"
// labelled as a country, 200 OK, blended into the same table as correctly-bucketed rows. §6: a
// fabricated bucket is worse than a zero. Two independent fixes, both asserted here:
//   PART 1  the route DENIES (422) the dims the stored touch can never carry.
//   PART 2  an ABSENT key buckets as 'unknown', never as touch.source.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')

// nightly-attribution resolves getSupabase() at module load, so importing it needs these set.
// MOCK values — no network, no real project (CI has no .env; locally dotenv would mask this).
// Same preamble as api/tests/nightly-honest-reporting.test.js, which imports the same module.
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL ||= 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY ||= 'mock-service-role-key-value'
process.env.POSTHOG_HOST ||= 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID ||= '000000'
process.env.POSTHOG_PERSONAL_API_KEY ||= 'mock-personal-key'
process.env.POSTHOG_API_KEY ||= 'mock-project-key'

const gate = await import('../lib/report-config-validation.js')
const { calculateAttribution } = await import('../jobs/nightly-attribution.js')

// ── ANTI-DRIFT: the constant IS tpBase's real emitted shape ─────────────────────────────
// Derived by CALLING the real nightly builder, not by re-typing its keys. Add a dim to tpBase and
// this fails until PREAGG_DIMS grows — i.e. the dim un-gates itself, and drift can never
// silently resurrect the substitution. (The duplicate-allowlist bug #248, prevented by execution.)
const NON_DIM_TOUCH_KEYS = new Set(['timestamp', 'fraction', 'attributed_value'])
const emittedDimKeys = () => {
  const tp = {
    utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'q3',
    timestamp: '2026-07-01T00:00:00Z', country: 'US', device: 'mobile',
    browser: 'chrome', landing_page: '/pricing', referrer: '', page_url: '/pricing'
  }
  const touch = calculateAttribution([tp], 100).linear[0]
  return Object.keys(touch).filter(k => !NON_DIM_TOUCH_KEYS.has(k)).sort()
}

test('🔴 ANTI-DRIFT (source 1/2): PREAGG_DIMS == tpBase\'s ACTUALLY-emitted dim keys', () => {
  assert.deepEqual([...gate.PREAGG_DIMS].sort(), emittedDimKeys())
})

// PREAGG_DIMS is now BOTH reader families' contract, so it is bound to BOTH sources. The
// first/last-touch reader maps groupBy -> a real column via an if/else chain; anything it does not
// map fell through to `else { selectField = sourceField }` (engine:3197-3199) — the lie this gate
// closes. The dims it DOES map must be exactly PREAGG_DIMS.
const ENGINE_SRC_FOR_MAP = readFileSync(join(ROOT, 'api/lib/attribution-engine.js'), 'utf8')
const preAggMappedDims = () => {
  const i = ENGINE_SRC_FOR_MAP.indexOf('let selectField, groupField')
  const j = ENGINE_SRC_FOR_MAP.indexOf(".from('attributed_conversions')", i)
  assert.ok(i > 0 && j > i, 'located getPreAggregatedAttribution\'s dim->column chain')
  return [...new Set([...ENGINE_SRC_FOR_MAP.slice(i, j).matchAll(/groupBy === '([a-z_]+)'/g)].map(m => m[1]))].sort()
}

test('🔴 ANTI-DRIFT (source 2/2): PREAGG_DIMS == getPreAggregatedAttribution\'s MAPPED columns', () => {
  assert.deepEqual(preAggMappedDims(), [...gate.PREAGG_DIMS].sort(),
    'the first/last-touch reader must map exactly the contract dims — map one more and it un-gates itself')
})

test('🔴 the 3 unmapped dims are exactly what the first/last-touch gate denies', () => {
  const mapped = preAggMappedDims()
  const reaches = [...gate.ALLOWED_GROUPS].filter(d => !gate.PREAGG_EXCLUDED_DIMS.has(d))
  assert.deepEqual(reaches.filter(d => !mapped.includes(d)).sort(), ['ai_source', 'conversion_type', 'date'])
})

test('the 3 always-broken dims are genuinely absent from the stored touch', () => {
  const keys = emittedDimKeys()
  for (const dim of ['ai_source', 'conversion_type', 'date']) {
    assert.ok(!keys.includes(dim), `${dim} must NOT be a touch key — that is why it is gated`)
    assert.ok(!gate.PREAGG_DIMS.has(dim), dim)
  }
})

// ── PART 1: the gate denies exactly the shapes that reach the readers ───────────────────
const G = (over = {}) => gate.gatedReportReason({
  group_by: 'source', group_by2: null, metric: 'revenue',
  preAggWindowMatches: true, model: 'linear', preAggMultiTouchMetric: true, ...over
})

test('🔴 LIE KILLED: multi-touch × {ai_source, conversion_type, date} -> 422 gated_dead_store', () => {
  for (const model of gate.MULTI_TOUCH_MODELS) {
    for (const dim of ['ai_source', 'conversion_type', 'date']) {
      for (const metric of ['revenue', 'conversions']) {
        const r = G({ model, group_by: dim, metric })
        assert.ok(r, `${model} × ${dim} × ${metric} must be denied`)
        assert.equal(r.error_code, 'gated_dead_store', 'reuses the code the frontend already renders calmly')
        assert.doesNotMatch(r.message, /try again|retry/i, 'a deny is not retryable')
      }
    }
  }
})

test('🔴 KEEP SET: multi-touch × {source, medium, campaign, channel} stays OPEN', () => {
  for (const model of gate.MULTI_TOUCH_MODELS) {
    for (const dim of ['source', 'medium', 'campaign', 'channel']) {
      for (const metric of ['revenue', 'conversions']) {
        assert.equal(G({ model, group_by: dim, metric }), null, `${model} × ${dim} × ${metric}`)
      }
    }
  }
})

test('the new-vintage dims stay OPEN (real for rows written since 87ee5e7)', () => {
  for (const model of gate.MULTI_TOUCH_MODELS) {
    for (const dim of ['country', 'device', 'browser', 'landing_page']) {
      assert.equal(G({ model, group_by: dim }), null, `${model} × ${dim}`)
    }
  }
})

test('group_by2 is gated on the same contract', () => {
  assert.ok(G({ group_by: 'source', group_by2: 'date' }), 'a gated dim in group_by2 must deny too')
  assert.equal(G({ group_by: 'source', group_by2: 'medium' }), null)
})

// ── the gate fires ONLY on the route's real pre-agg ENTRY condition ─────────────────────
test('NOT gated when the route would not take the pre-agg branch (served correctly elsewhere)', () => {
  // a non-pre-agg metric -> getFlexibleReport -> getMultiTouchAttributionLive (buckets by groupBy)
  assert.equal(G({ group_by: 'date', metric: 'leads', preAggMultiTouchMetric: false }), null, 'linear × date × leads is served by the live path')
  // PREAGG_EXCLUDED_DIMS -> the route skips the pre-agg for these -> live path
  for (const dim of gate.PREAGG_EXCLUDED_DIMS) {
    if (gate.GATED_GROUPS.has(dim)) continue // keyword/referrer_domain are denied earlier, by their own rule
    assert.equal(G({ group_by: dim }), null, `${dim} is skipped by the pre-agg short-circuit -> must NOT be gated here`)
  }
  // Window mismatch -> the pre-agg is not taken, so the new rule must add NOTHING. (It does not
  // return null: the PRE-EXISTING dim-aware window rule already owns that case and denies a
  // non-Class-A dim. Assert the verdict is byte-identical to the pre-change one instead.)
  for (const dim of ['device', 'country', 'date', 'source']) {
    const withRule = G({ group_by: dim, preAggWindowMatches: false })
    const preChange = gate.gatedReportReason({ group_by: dim, metric: 'revenue', preAggWindowMatches: false })
    assert.deepEqual(withRule, preChange, `${dim} @ window-mismatch must be unchanged by this PR`)
  }
})

// ── first/last-touch: the SAME contract (the #256 rule covered multi-touch only) ─────────
// This test previously asserted "first_touch/last_touch × every dim are untouched". That was true,
// and it was PINNING THE BUG OPEN: the else->sourceField fallback in getPreAggregatedAttribution
// kept returning the SOURCE under ai_source/conversion_type/date labels, 200 OK, on the DEFAULT
// model. The contract below is what that assertion should always have been.
const T = (over = {}) => gate.gatedReportReason({
  group_by: 'source', group_by2: null, metric: 'revenue',
  preAggWindowMatches: true, model: 'first_touch', preAggConversionMetric: true, ...over
})

test('🔴 LIE KILLED: first/last-touch × {ai_source, conversion_type, date} -> 422 gated_dead_store', () => {
  for (const model of gate.PREAGG_TOUCH_MODELS) {
    for (const dim of ['ai_source', 'conversion_type', 'date']) {
      for (const metric of ['revenue', 'conversions', 'leads']) {
        const r = T({ model, group_by: dim, metric })
        assert.ok(r, `${model} × ${dim} × ${metric} must be denied, not served as the SOURCE`)
        assert.equal(r.error_code, 'gated_dead_store')
      }
    }
  }
})

test('🔴 KEEP SET: first/last-touch × the 8 mapped dims stay OPEN', () => {
  for (const model of gate.PREAGG_TOUCH_MODELS) {
    for (const dim of gate.PREAGG_DIMS) {
      for (const metric of ['revenue', 'conversions', 'leads']) {
        assert.equal(T({ model, group_by: dim, metric }), null, `${model} × ${dim} × ${metric}`)
      }
    }
  }
})

test('the non-direct + ai_platforms models have NO pre-agg short-circuit -> rule must not fire', () => {
  for (const model of ['first_touch_non_direct', 'last_touch_non_direct', 'ai_platforms']) {
    for (const dim of gate.ALLOWED_GROUPS) {
      const withModel = gate.gatedReportReason({ group_by: dim, metric: 'revenue', preAggWindowMatches: true, model, preAggMultiTouchMetric: true, preAggConversionMetric: true })
      const without = gate.gatedReportReason({ group_by: dim, metric: 'revenue', preAggWindowMatches: true })
      assert.deepEqual(withModel, without, `${model} × ${dim} must be byte-identical to the pre-change verdict`)
    }
  }
})

test('first/last-touch: NOT gated when the route would not take the pre-agg', () => {
  // Class-A dims are skipped by the short-circuit -> served by their pipes
  for (const dim of gate.PREAGG_EXCLUDED_DIMS) {
    if (gate.GATED_GROUPS.has(dim)) continue
    assert.equal(T({ group_by: dim }), null, `${dim} is pre-agg-excluded -> must NOT be gated here`)
  }
  // a metric the conversion reader cannot emit -> no short-circuit -> live path
  // deepEqual: these are objects — assert.equal would compare identity, not value
  assert.deepEqual(T({ group_by: 'date', metric: 'sessions', preAggConversionMetric: false }), gate.gatedReportReason({ group_by: 'date', metric: 'sessions' }), 'unchanged verdict')
})

test('BACKWARD-COMPAT: callers that omit model/preAggMultiTouchMetric (export.js) are unchanged', () => {
  for (const dim of gate.ALLOWED_GROUPS) {
    for (const metric of ['revenue', 'conversions', 'leads']) {
      const legacy = gate.gatedReportReason({ group_by: dim, group_by2: null, metric })
      const explicitInert = gate.gatedReportReason({ group_by: dim, group_by2: null, metric, model: null, preAggMultiTouchMetric: false })
      assert.deepEqual(legacy, explicitInert, `${dim} × ${metric}`)
    }
  }
})

// ── PART 2: the substitution is gone from the readers ───────────────────────────────────
const ENGINE_SRC = readFileSync(join(ROOT, 'api/lib/attribution-engine.js'), 'utf8')

test('🔴 no reader substitutes touch.source under another dim label (all 4 use the helper)', () => {
  const code = ENGINE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const substitutions = code.split('\n').filter(l => /touch\[groupBy\]\s*\|\|\s*touch\.source/.test(l))
  // ZERO remain anywhere: the absent-key route (#256) and the present-null route (this PR) are both
  // closed, so no code path can borrow touch.source under another dim's label.
  assert.equal(substitutions.length, 0, 'the touch.source substitution must not exist anywhere')
  // the 4 reader call sites (the test seam's own delegation is not a reader)
  assert.equal((code.match(/const dimValue = multiTouchDimValue\(touch, groupBy\)/g) || []).length, 4, 'all 4 readers route through the helper')
})

// Bind to the REAL helper via its test seam. A re-typed copy here silently drifted once already
// (it kept passing against the pre-fix expression after the real one changed) — that false green is
// exactly what this money-rail test exists to prevent.
const { __multiTouchDimValue: multiTouchDimValue } = await import('../lib/attribution-engine.js')
const OLD = (touch, groupBy) => touch[groupBy] || touch.source || 'direct' // the pre-fix expression

test('🔴 ABSENT key -> "unknown", NEVER touch.source (the old-vintage lie)', () => {
  const oldTouch = { source: 'google', medium: 'cpc', campaign: 'q3', channel: 'Paid Search', timestamp: 't' } // pre-87ee5e7
  for (const dim of ['country', 'device', 'browser', 'landing_page', 'ai_source', 'conversion_type', 'date']) {
    assert.equal(OLD(oldTouch, dim), 'google', 'pre-fix: returned the SOURCE under this dim label')
    assert.equal(multiTouchDimValue(oldTouch, dim), 'unknown', `${dim} must bucket as unknown, not "google"`)
  }
})

test('🔴 KEEP SET byte-identical: every NON-EMPTY value resolves exactly as before', () => {
  const touches = [
    { source: 'google', medium: 'cpc', campaign: 'q3', channel: 'Paid Search', timestamp: 't', country: 'US', device: 'mobile', browser: 'chrome', landing_page: '/pricing' },
    { source: 'direct', medium: 'none', campaign: 'brand', channel: 'Direct', timestamp: 't' },
    { source: 'chatgpt.com', medium: 'referral', campaign: 'x', channel: 'AI Search', timestamp: 't' }
  ]
  for (const touch of touches) {
    for (const dim of Object.keys(touch)) {
      if (dim === 'timestamp') continue
      assert.equal(multiTouchDimValue(touch, dim), OLD(touch, dim), `non-empty "${dim}" must be byte-identical to the pre-fix result`)
      assert.equal(multiTouchDimValue(touch, dim), touch[dim], 'and it is simply the stored value')
    }
  }
})

test('🔴 SOURCE + CHANNEL byte-identical even when empty (source: null utm_source IS direct)', () => {
  const t = { source: null, medium: null, campaign: null, channel: 'Direct', timestamp: 't' }
  assert.equal(multiTouchDimValue(t, 'source'), 'direct', 'the established label for direct traffic')
  assert.equal(multiTouchDimValue(t, 'source'), OLD(t, 'source'), 'byte-identical to pre-fix')
  assert.equal(multiTouchDimValue(t, 'channel'), 'Direct')
  assert.equal(multiTouchDimValue(t, 'channel'), OLD(t, 'channel'), 'byte-identical to pre-fix')
})

// ── the PROD case: present-but-null campaign/medium (2026-07-14) ────────────────────────
test('🔴 PROD LIE KILLED: campaign=null with source=google/chatgpt.com -> "unknown", not a campaign', () => {
  // the two prod touchpoints Antigravity confirmed on 2026-07-14
  for (const source of ['google', 'chatgpt.com']) {
    const t = { source, medium: null, campaign: null, channel: 'Paid Search', timestamp: '2026-07-14T00:00:00Z' }
    assert.equal(OLD(t, 'campaign'), source, `pre-fix: rendered "${source}" as a CAMPAIGN`)
    assert.equal(multiTouchDimValue(t, 'campaign'), 'unknown', 'must never borrow the source')
    assert.equal(OLD(t, 'medium'), source, `pre-fix: rendered "${source}" as a MEDIUM`)
    assert.equal(multiTouchDimValue(t, 'medium'), 'unknown', 'medium is nullable too — same fix')
    // and the source dim itself is untouched
    assert.equal(multiTouchDimValue(t, 'source'), source)
  }
})

test('empty-string values are treated as empty, not as a real bucket', () => {
  const t = { source: 'google', medium: '', campaign: '', channel: 'Paid Search', timestamp: 't' }
  assert.equal(multiTouchDimValue(t, 'medium'), 'unknown')
  assert.equal(multiTouchDimValue(t, 'campaign'), 'unknown')
})

test('new-vintage rows bucket by their REAL value (the fix does not blunt them)', () => {
  const newTouch = { source: 'google', medium: 'cpc', campaign: 'q3', channel: 'Paid Search', timestamp: 't', country: 'US', device: 'mobile', browser: 'chrome', landing_page: '/pricing' }
  assert.equal(multiTouchDimValue(newTouch, 'country'), 'US')
  assert.equal(multiTouchDimValue(newTouch, 'device'), 'mobile')
  assert.equal(multiTouchDimValue(newTouch, 'landing_page'), '/pricing')
})

test('🔴 TOTALS UNCHANGED: only the bucket LABEL moves, never the summed value', () => {
  // Mixed-vintage set, exactly what staging holds (83% old / 17% new).
  const touches = [
    { source: 'google', channel: 'Paid Search', timestamp: 't', attributed_value: 40, fraction: 0.5 },                    // old vintage
    { source: 'bing', channel: 'Paid Search', timestamp: 't', attributed_value: 60, fraction: 0.5 },                      // old vintage
    { source: 'google', channel: 'Paid Search', timestamp: 't', country: 'US', attributed_value: 100, fraction: 1 }       // new vintage
  ]
  const sum = (fn) => {
    const agg = {}
    for (const t of touches) {
      const d = fn(t, 'country')
      agg[d] = (agg[d] || 0) + t.attributed_value
    }
    return agg
  }
  const before = sum(OLD), after = sum(multiTouchDimValue)
  const total = (a) => Object.values(a).reduce((x, y) => x + y, 0)
  assert.equal(total(after), total(before), 'revenue total must be identical')
  assert.equal(total(after), 200)
  // and the LIE is gone: pre-fix put $100 of old-vintage revenue under country "google"/"bing"
  assert.deepEqual(before, { google: 40, bing: 60, US: 100 })
  assert.deepEqual(after, { unknown: 100, US: 100 })
})

// ── the route's pre-agg entry condition stays in lockstep with PREAGG_EXCLUDED_DIMS ─────
test('PREAGG_EXCLUDED_DIMS matches the route\'s real short-circuit condition', () => {
  const src = readFileSync(join(ROOT, 'api/routes/attribution.js'), 'utf8')
  for (const model of gate.MULTI_TOUCH_MODELS) {
    const line = src.split('\n').find(l => l.includes(`model === "${model}"`) && l.includes('PREAGG_MULTITOUCH_METRICS.has(metric)'))
    assert.ok(line, `${model} short-circuit found`)
    for (const dim of gate.PREAGG_EXCLUDED_DIMS) {
      assert.ok(line.includes(`group_by !== "${dim}"`), `${model} short-circuit must still skip ${dim}`)
    }
    // conversion_type must NOT be skipped — that is precisely why it reaches the readers and is gated
    assert.ok(!line.includes('group_by !== "conversion_type"'), 'conversion_type is NOT pre-agg-excluded')
  }
})

test('the route passes model + preAggMultiTouchMetric into the gate', () => {
  const src = readFileSync(join(ROOT, 'api/routes/attribution.js'), 'utf8')
  assert.match(src, /preAggMultiTouchMetric: PREAGG_MULTITOUCH_METRICS\.has\(metric\)/)
})
