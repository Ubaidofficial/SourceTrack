// PR-A: the pre-aggregated attribution readers (getPreAggregatedAttribution + the four multi-touch
// readers) serve the SINGLE window the nightly job materialized into attributed_conversions (the
// site's attribution_window_days, clamped [1,90] — nightly-attribution.js:557). They take no window
// param and cannot re-window. Before this fix, the route short-circuited to them for EVERY window,
// so a user picking a non-default lookback (e.g. 7d on a 30d site) got the site-window numbers
// LABELED as the requested window — a fake-window lie on the money rail (§6), fast but wrong, no error.
//
// The fix: short-circuit ONLY when the window being served equals the materialized window; otherwise
// fall through to the live re-attributing flexible path (correct; #180 honest-timeout is the backstop).
//
// Two layers, mirroring how this repo proves route dispatch without a live DB (route-args-matrix /
// flexible-report-window-bound): (1) BEHAVIOURAL — the pure predicate returns the right verdict both
// directions + edges; (2) STRUCTURAL — the predicate gates ALL FIVE pre-agg short-circuits in the
// route (no runtime Supabase mock exists, and in test getPreAggregatedAttribution throws and falls
// through, so a seam-level route test cannot distinguish match from mismatch — the source is asserted
// instead, exactly like flexible-report-window-bound.test.js asserts SQL structure).

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { preAggregatedWindowMatches } = await import('../lib/attribution-engine.js')

// ── Layer 1: behavioural — the rule ─────────────────────────────────────────
test('serves the pre-agg ONLY when the resolved window equals the materialized site window', () => {
  // Match: default site (30) with the route's default/preset resolution → true (the common fast path)
  assert.strictEqual(preAggregatedWindowMatches('30', 30), true, 'window 30 on a 30d site matches')
  assert.strictEqual(preAggregatedWindowMatches('7', 7), true, 'window 7 on a 7d site matches')
  assert.strictEqual(preAggregatedWindowMatches('90', 90), true, 'window 90 on a 90d site matches')

  // Mismatch: the bug case — a non-default lookback must NOT be served from the site-window pre-agg
  assert.strictEqual(preAggregatedWindowMatches('7', 30), false, '7d requested on a 30d site → falls through')
  assert.strictEqual(preAggregatedWindowMatches('60', 30), false, '60d requested on a 30d site → falls through')
  assert.strictEqual(preAggregatedWindowMatches('30', 7), false, '30d requested on a 7d site → falls through')

  // 'ltv' is not a materialized numeric window → falls through (correctly handled by the flexible path)
  assert.strictEqual(preAggregatedWindowMatches('ltv', 30), false, 'ltv is not the materialized window')
})

test('mirrors the nightly clamp [1,90] and the DEFAULT 30 exactly', () => {
  // attribution_window_days is NOT NULL DEFAULT 30 — null/0 coerce to the same default nightly uses
  assert.strictEqual(preAggregatedWindowMatches('30', null), true, 'null site window → default 30')
  assert.strictEqual(preAggregatedWindowMatches('30', 0), true, '0 site window → default 30 (|| 30)')
  // Clamp: a site value above 90 materializes at 90 (min), below 1 at 1 (max)
  assert.strictEqual(preAggregatedWindowMatches('90', 200), true, 'site 200 clamps to 90')
  assert.strictEqual(preAggregatedWindowMatches('1', -5), true, 'site -5 clamps to 1')
  // A numeric (non-string) resolvedWindow still compares correctly
  assert.strictEqual(preAggregatedWindowMatches(30, 30), true, 'numeric resolvedWindow coerces to string')
})

// ── Layer 2: structural — the wiring gates all five short-circuits ──────────
test('the predicate gates all five pre-agg short-circuits in the route, before the pre-agg call', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(__dirname, '../routes/attribution.js'), 'utf8')

  // The guard const is derived from the exported predicate and the site's configured window
  assert.match(
    src,
    /const preAggWindowMatches = preAggregatedWindowMatches\(resolvedWindow, req\.site\?\.attribution_window_days\)/,
    'route computes preAggWindowMatches from preAggregatedWindowMatches(resolvedWindow, site window)'
  )

  // Each of the five model short-circuits must AND-in the guard. Assert per model so a future edit
  // that drops it from any one branch fails loudly ("no fourth one found later").
  for (const model of ['first_touch', 'linear', 'u_shaped', 'time_decay', 'w_shaped']) {
    const re = new RegExp(`model === "${model}"[^\\n]*&& preAggWindowMatches &&`)
    assert.match(src, re, `${model} short-circuit is gated by preAggWindowMatches`)
  }

  // The guard must be computed BEFORE the first pre-aggregated read, or it can't gate it.
  const guardAt = src.indexOf('const preAggWindowMatches =')
  const firstPreAggCall = src.indexOf('await getPreAggregatedAttribution(')
  assert.ok(guardAt > 0 && firstPreAggCall > 0 && guardAt < firstPreAggCall,
    'preAggWindowMatches is computed before the first getPreAggregatedAttribution call')
})
