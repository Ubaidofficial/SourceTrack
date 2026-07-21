// #100 — nightly write-path reconciliation + time-decay NaN guard.
// Deterministic, no DB: calculateAttribution is pure. Verifies the two safeguards
// the READ path already has (penny reconciliation on the LAST share; NaN-safe
// time_decay on invalid timestamps) are now present in the nightly WRITE path.

import test from 'node:test'
import assert from 'node:assert'

// HARNESS REPAIR (KI-49, 2026-07-21) — setup only, no assertion touched.
// `nightly-attribution.js:61` calls getSupabase() at MODULE TOP LEVEL, which throws
// '[supabase] SUPABASE_URL and SUPABASE_SERVICE_KEY must be set' without env. This file
// never set the mock env, so it aborted at import and all 3 tests were lost — the file
// has simply never run (it is unregistered in package.json; see KI-49).
//
// A static `import` is hoisted and evaluated BEFORE any assignment in this module, so the
// env must be set first and the module pulled in via dynamic import — the convention
// already used by the registered sibling api/tests/nightly-touchpoints-fail-closed.js.
// calculateAttribution itself is pure; nothing about the code under test changed.
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { calculateAttribution } = await import('../jobs/nightly-attribution.js')

// Minimal-but-valid touchpoint: the fields calculateAttribution/tpBase read.
const tp = (timestamp, utm_source = 'google') => ({
  timestamp,
  utm_source,
  utm_medium: 'cpc',
  utm_campaign: 'spring',
  referrer: null,
  page_url: 'https://example.com/'
})

const MULTI_MODELS = ['linear', 'u_shaped', 'time_decay', 'w_shaped']
const cents = (n) => Math.round(n * 100)
const sumValue = (shares) => shares.reduce((s, x) => s + x.attributed_value, 0)
const sumFraction = (shares) => shares.reduce((s, x) => s + x.fraction, 0)

// ── Case A — 5 touchpoints, a value that forces rounding drift ────────────────
test('Case A: every multi-touch model reconciles to conversionValue exactly (5 tps, 100.03)', () => {
  const conversionValue = 100.03
  const touchpoints = [
    tp('2026-06-01T00:00:00Z'),
    tp('2026-06-03T00:00:00Z'),
    tp('2026-06-05T00:00:00Z'),
    tp('2026-06-08T00:00:00Z'),
    tp('2026-06-10T00:00:00Z') // last = conversion time
  ]
  const r = calculateAttribution(touchpoints, conversionValue)
  for (const model of MULTI_MODELS) {
    const shares = r[model]
    assert.strictEqual(shares.length, 5, `${model}: expected 5 shares`)
    // sum of attributed_value === 100.03 exactly (cents-integer comparison)
    assert.strictEqual(cents(sumValue(shares)), 10003, `${model}: attributed_value sum must be 100.03`)
    // sum of fraction rounds to 1.0000
    assert.strictEqual(sumFraction(shares).toFixed(4), '1.0000', `${model}: fraction sum must be 1.0000`)
  }
})

// ── Case B — invalid timestamp must not produce NaN time_decay ────────────────
test('Case B: time_decay is finite (not NaN) when a touchpoint timestamp is invalid, and still reconciles', () => {
  const conversionValue = 100.03
  const touchpoints = [
    tp('2026-06-01T00:00:00Z'),
    tp('not-a-date'),           // invalid → triggers the hasInvalid equal-weight fallback
    tp('2026-06-10T00:00:00Z')
  ]
  const r = calculateAttribution(touchpoints, conversionValue)
  assert.strictEqual(r.time_decay.length, 3)
  for (const share of r.time_decay) {
    assert.ok(Number.isFinite(share.attributed_value), `attributed_value must be finite, got ${share.attributed_value}`)
    assert.ok(Number.isFinite(share.fraction), `fraction must be finite, got ${share.fraction}`)
  }
  assert.strictEqual(cents(sumValue(r.time_decay)), 10003, 'time_decay must still reconcile to 100.03')
})

// ── Case C — single touchpoint gets the full value in every model ─────────────
test('Case C: single touchpoint → each multi-touch model is one share worth the full conversionValue', () => {
  const conversionValue = 100.03
  const r = calculateAttribution([tp('2026-06-10T00:00:00Z')], conversionValue)
  for (const model of MULTI_MODELS) {
    const shares = r[model]
    assert.strictEqual(shares.length, 1, `${model}: expected 1 share`)
    assert.strictEqual(shares[0].attributed_value, conversionValue, `${model}: single share must equal conversionValue`)
  }
})
