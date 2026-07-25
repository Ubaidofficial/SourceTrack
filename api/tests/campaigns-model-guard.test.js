// Campaigns route model guard — rejects every model this route cannot answer honestly.
// TOKEN-FREE, no network, no DB: every request below is decided BEFORE getCampaignsData reaches
// Supabase or a pipe (model guard, then the per-metric allowlist gate), so nothing touches a data layer.
//
// THE HOLE THIS CLOSES: campaigns.js validates `model` against ALLOWED_MODELS (all 9), then asks
// servedByDeployedBackend() per metric over ['revenue','conversions','sessions','leads']. For
// metric='sessions' on the 4 multi-touch models and ai_platforms that gate answers **YES** — a real,
// deployed, allowlisted pipe does back the shape — while the VALUE is invented: the live readers emit
// `item[metric] = conversions` for any metric that is not revenue/conversions, so the Visitors column
// renders a CONVERSION count (or a fractional sum of one) as visitors. §6 confident-wrong number.
//
// The allowlist structurally CANNOT catch this: it answers "is there a backend?", never "does that
// backend compute this metric correctly?" (asserted in PART 3). So the route must fail closed itself —
// a route-scoped set narrower than the shared ALLOWED_MODELS, which stays correct for the Report
// Builder, where gatedReportReason + GATED_METRICS deny these shapes instead.
//
// PRE-GUARD REACHABILITY (measured against the real gate, per (model, dimension) — ALLOWED_DIMS is
// campaign/source/medium/ai_source, so `campaign` is not the only reachable dimension):
//   linear/u_shaped/time_decay/w_shaped -> reached 200 at campaign, source AND medium
//   ai_platforms                        -> reached 200 at source and ai_source (422 at campaign)
//   first_touch_non_direct/last_touch_non_direct -> already 422 everywhere
// So each model in PART 1 is tested at a dimension where it PREVIOUSLY served a fabricated number.
//
// Hardening, not a live-bug fix: the UI hardcodes model=last_touch and narrows the tab bar to
// `campaign`. But ?model= is caller-supplied and API-key auth would make that a real surface.

import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { campaignsRouter } = await import('../routes/campaigns.js')
const { ALLOWED_MODELS, servedByDeployedBackend } = await import('../lib/report-config-validation.js')
const { PREAGG_CONVERSION_METRICS, PREAGG_MULTITOUCH_METRICS } = await import('../lib/attribution-engine.js')

// Mount the REAL router. A stub middleware supplies req.site (the auth middleware's contract) so the
// shipped handler runs its own validation — the test binds to the route, not to a re-typed copy.
const app = express()
app.use((req, _res, next) => {
  req.site = { id: 'site-guard', site_key: 'sk_test_guard', timezone: 'UTC' }
  next()
})
app.use('/campaigns', campaignsRouter)

const server = app.listen(0)
await new Promise(r => server.once('listening', r))
const BASE = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

async function get (path, qs) {
  const res = await fetch(`${BASE}/campaigns/${path}?${qs}`)
  let body = null
  try { body = await res.json() } catch { /* non-JSON — status is still asserted */ }
  return { status: res.status, body }
}

// model -> a dimension at which it PREVIOUSLY reached 200 and rendered a fabricated `sessions`.
const FABRICATED_AT = {
  linear: 'campaign', u_shaped: 'campaign', time_decay: 'campaign', w_shaped: 'campaign',
  ai_platforms: 'source'
}
// Rejected by the same guard, but these were ALREADY 422 (no backend at any dimension). The guard
// changes their status 422 -> 400 with an earlier, clearer reason. Intentional, recorded here.
const ALREADY_UNSERVED = ['first_touch_non_direct', 'last_touch_non_direct']
const ROUTE_OK = ['first_touch', 'last_touch']

test('🔴 PART 1: every fabrication-risk model is REJECTED 400, at a dimension where it used to serve', async () => {
  for (const [model, dimension] of Object.entries(FABRICATED_AT)) {
    const { status, body } = await get('overview', `site_key=sk_test_guard&model=${model}&dimension=${dimension}`)
    assert.equal(status, 400, `${model} @ ${dimension} must be rejected, not served a fabricated Visitors column`)
    assert.match(body.error, new RegExp(`"${model}" attribution model isn't supported on this page`),
      `${model}: the reason must name the model and be route-scoped`)
    assert.match(body.error, /first_touch, last_touch/, `${model}: the reason must state what IS allowed`)
    assert.equal(body.success, false)
  }
})

test('🔴 PART 1b: /export is guarded too (both handlers share getCampaignsData)', async () => {
  const { status } = await get('export', 'site_key=sk_test_guard&model=linear&dimension=campaign')
  assert.equal(status, 400, 'the CSV export path must not bypass the guard')
})

test('PART 1c: the two non_direct models are rejected too (was 422 — now an earlier, clearer 400)', async () => {
  for (const model of ALREADY_UNSERVED) {
    const { status, body } = await get('overview', `site_key=sk_test_guard&model=${model}&dimension=campaign`)
    assert.equal(status, 400, `${model} is not servable here either`)
    assert.match(body.error, /isn't supported on this page/)
  }
})

// PART 2 — the permitted models must NOT be stopped by THIS guard. Using dimension=medium, which the
// per-metric allowlist gate (the NEXT check, still before any DB call) denies — so reaching a
// gated_dead_store 422 proves the model guard let the request through.
test('🔴 PART 2: first_touch / last_touch pass the model guard and reach the NEXT gate', async () => {
  for (const model of ROUTE_OK) {
    const { status, body } = await get('overview', `site_key=sk_test_guard&model=${model}&dimension=medium`)
    assert.doesNotMatch(body?.error || '', /isn't supported on this page/,
      `${model} must pass the model guard`)
    assert.equal(status, 422, `${model} @ medium is denied by the per-metric gate, not the model guard`)
    assert.equal(body.error_code, 'gated_dead_store', 'the later gate is the one that answered')
  }
})

test('🔴 PART 2b: omitting model defaults to last_touch and passes the guard', async () => {
  const { body } = await get('overview', 'site_key=sk_test_guard&dimension=medium')
  assert.doesNotMatch(body?.error || '', /isn't supported on this page/,
    'the default must stay servable — every real caller omits model')
})

test('🔴 PART 2c: an unknown model still answers "Invalid model" (ALLOWED_MODELS checked FIRST)', async () => {
  const { status, body } = await get('overview', 'site_key=sk_test_guard&model=not_a_model&dimension=campaign')
  assert.equal(status, 400)
  assert.match(body.error, /^Invalid model\. Must be one of:/,
    'unknown vocabulary keeps its original message; only KNOWN-but-unsupported gets the new one')
})

// PART 3 — the justification, asserted rather than only claimed in prose.
test('🔴 PART 3: the allowlist CANNOT catch this — it reports a backend for sessions on all 5', () => {
  for (const [model, dimension] of Object.entries(FABRICATED_AT)) {
    const backing = servedByDeployedBackend({
      model, group_by: dimension, group_by2: null, metric: 'sessions',
      preAggConversionMetric: PREAGG_CONVERSION_METRICS.has('sessions'),
      preAggMultiTouchMetric: PREAGG_MULTITOUCH_METRICS.has('sessions'),
      viaRoutePreAgg: false, hasAttributionWindow: false, tz: 'UTC'
    })
    assert.ok(backing,
      `${model} @ ${dimension}: the allowlist reports a backend for sessions, which is exactly why the ` +
      'route must reject explicitly — a real pipe backs the shape; the VALUE is what is wrong')
  }
})

test('🔴 PART 3b: the three lists partition ALLOWED_MODELS — a new model cannot slip through unclassified', () => {
  const classified = [...ROUTE_OK, ...Object.keys(FABRICATED_AT), ...ALREADY_UNSERVED]
  for (const m of classified) assert.ok(ALLOWED_MODELS.has(m), `${m} must be in the shared vocabulary`)
  assert.equal(new Set(classified).size, classified.length, 'no model may appear in two lists')
  assert.deepEqual(classified.slice().sort(), [...ALLOWED_MODELS].sort(),
    'a NEW model in ALLOWED_MODELS is unaccounted for here — decide explicitly whether this route can ' +
    'serve its sessions value honestly, then add it to ROUTE_OK, FABRICATED_AT, or ALREADY_UNSERVED')
})
