// SERVED ALLOWLIST — the PR#4 unblocker.
// TOKEN-FREE, NO network, NO DB. getFlexibleReport never touches Supabase (verified), so the real
// engine dispatch is exercised through the __setAttributionReadDeps seam alone.
//
// WHY A POSITIVE ALLOWLIST: the gate was a DENYLIST, and a denylist only denies what someone
// remembered — which is how five fabrication families reached prod (#256/#257/#258/#259 + the
// landing_page one logged below). Before PR#4 deletes the bare queryHogQL sites, nothing may fall
// through to them: every shape is either SERVED by a live backend or DENIED.
//
// ⚠️ PROD-PIPE-DEPENDENT: PROD_DEPLOYED_PIPES must be RE-VERIFIED AGAINST PROD (not staging, not a
// remembered table) before PR#4 deletes anything. A wrong entry is what the deletion makes fatal.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.POSTHOG_API_KEY ||= 'mock'
process.env.POSTHOG_HOST ||= 'https://ph.invalid'
process.env.POSTHOG_PROJECT_ID ||= '0'
process.env.POSTHOG_PERSONAL_API_KEY ||= 'mock'
delete process.env.TINYBIRD_FORCE_READ
delete process.env.TINYBIRD_READ_ENABLED

const g = await import('../lib/report-config-validation.js')
const e = await import('../lib/attribution-engine.js')

const MODELS = [...g.ALLOWED_MODELS]
const DIMS = [...g.ALLOWED_GROUPS]

// ── ANTI-DRIFT: the allowlist IS the engine's real dispatch ──────────────────────────────
// Re-typing the dispatch map here would be the duplicate-allowlist bug #248 killed, one level up.
// So we RUN getFlexibleReport for every (model × dim × metric) with recording deps and compare the
// pipe it actually reaches against what servedReportShape() claims. Add a pipe case to the engine
// and this fails until the allowlist agrees.
async function realDispatch (model, dim, metric) {
  const seen = { pipes: [], hog: false }
  e.__setAttributionReadDeps({
    queryTinybird: async (p) => { seen.pipes.push(p); return null },   // null -> reveal the fallback too
    queryHog: async () => { seen.hog = true; return [] }
  })
  try {
    await e.getFlexibleReport('s1', model, '2026-06-17', '2026-07-17', dim, metric, {}, null, 'day', null, 'conversion_date')
  } catch { /* shape-level throws are not dispatch facts */ }
  e.__resetAttributionReadDeps()
  return seen
}

test('🔴 ANTI-DRIFT: every shape the allowlist calls pipe-SERVED really dispatches that pipe', async () => {
  let checked = 0
  for (const model of MODELS) for (const dim of DIMS) for (const metric of ['revenue', 'conversions']) {
    const backing = g.servedReportShape({
      model, group_by: dim, metric, preAggWindowMatches: true, hasAttributionWindow: false,
      preAggConversionMetric: true, preAggMultiTouchMetric: true, viaRoutePreAgg: false
    })
    if (!backing || backing === 'supabase_preagg' || backing === 'session_report_pipes') continue
    const seen = await realDispatch(model, dim, metric)
    assert.ok(seen.pipes.includes(backing),
      `${model} × ${dim} × ${metric}: allowlist claims "${backing}" but the engine dispatched [${seen.pipes.join(', ')}]`)
    checked++
  }
  assert.ok(checked > 20, `exercised ${checked} pipe-backed shapes`)
})

test('🔴 ANTI-DRIFT: every pipe the allowlist names is in PROD_DEPLOYED_PIPES', () => {
  const named = new Set()
  for (const model of MODELS) for (const dim of DIMS) for (const metric of ['revenue', 'conversions', 'leads', 'sessions']) {
    for (const win of [true, false]) {
      const b = g.servedReportShape({
        model, group_by: dim, metric, preAggWindowMatches: true, hasAttributionWindow: win,
        preAggConversionMetric: true, preAggMultiTouchMetric: true, viaRoutePreAgg: false
      })
      if (b && b !== 'supabase_preagg' && b !== 'session_report_pipes') named.add(b)
    }
  }
  assert.ok(named.size > 0)
  for (const p of named) assert.ok(g.PROD_DEPLOYED_PIPES.has(p), `${p} must be a deployed prod pipe`)
})

// ── the JS-bucketing dim contracts are bound to the engine's real chains ─────────────────
const ENGINE_SRC = (await import('node:fs')).readFileSync(new URL('../lib/attribution-engine.js', import.meta.url), 'utf8')
const chainDims = (startMarker, endMarker) => {
  const i = ENGINE_SRC.indexOf(startMarker), j = ENGINE_SRC.indexOf(endMarker, i)
  assert.ok(i > 0 && j > i, `located ${startMarker}`)
  return new Set([...ENGINE_SRC.slice(i, j).matchAll(/groupBy === '([a-z_]+)'/g)].map(m => m[1]))
}

test('🔴 ANTI-DRIFT: MULTITOUCH_LIVE_DIMS + the broken-branch list == the engine\'s real chain', () => {
  const chain = chainDims("let dimVal = 'direct'", '// Apply UTM filters')
  // every dim the chain branches on is either SERVED or explicitly known-broken — never assumed
  for (const d of chain) {
    const known = g.MULTITOUCH_LIVE_DIMS.has(d) || g.MULTITOUCH_BROKEN_BRANCH_DIMS.has(d)
    assert.ok(known, `chain branches on "${d}" but the allowlist neither serves nor documents it`)
  }
  for (const d of g.MULTITOUCH_LIVE_DIMS) {
    if (d === 'keyword' || d === 'referrer_domain') continue // denied earlier by GATED_GROUPS
    assert.ok(chain.has(d), `allowlist claims multi-touch serves "${d}" but the chain has no branch`)
  }
  // landing_page: branch exists but reads share.page_url, which tpBase never emits -> constant '/'
  assert.ok(g.MULTITOUCH_BROKEN_BRANCH_DIMS.has('landing_page'))
  assert.ok(!g.MULTITOUCH_LIVE_DIMS.has('landing_page'), 'landing_page must stay gated until the reader is fixed')
})

test('🔴 the landing_page fabrication is REAL and still present (un-gate only when this flips)', () => {
  assert.match(ENGINE_SRC, /dimVal = share\.page_url \?/, 'engine:1953 still reads share.page_url')
  // the shares come from calculateAttribution -> tpBase, which emits landing_page, never page_url
  assert.doesNotMatch(ENGINE_SRC.slice(ENGINE_SRC.indexOf('const tpBase')), /page_url:/, 'tpBase emits no page_url')
})

test('🔴 AIPLATFORM_LIVE_DIMS == the ai_platforms reader\'s real chain', () => {
  const chain = chainDims("let dimVal = 'unknown'", 'Apply attribution')
  for (const d of g.AIPLATFORM_LIVE_DIMS) {
    if (d === 'source') continue // shares the ai_source branch (`groupBy === 'source' || 'ai_source'`)
    assert.ok(chain.has(d), `allowlist claims ai_platforms serves "${d}" but the chain has no branch`)
  }
})

// ── the fabrication families stay gated ─────────────────────────────────────────────────
test('🔴 the 3 gated fabrication families are NOT served', () => {
  const s = (model, dim, metric) => g.servedByDeployedBackend({
    model, group_by: dim, metric, preAggWindowMatches: true, hasAttributionWindow: false,
    preAggConversionMetric: true, preAggMultiTouchMetric: metric !== 'leads', viaRoutePreAgg: false
  })
  for (const m of g.MULTI_TOUCH_MODELS) {
    for (const d of ['ai_source', 'browser']) assert.equal(s(m, d, 'leads'), null, `${m} × ${d} ('direct' default)`)
    assert.equal(s(m, 'landing_page', 'leads'), null, `${m} × landing_page (share.page_url mismatch)`)
  }
  for (const d of ['medium', 'campaign', 'landing_page']) {
    assert.equal(s('ai_platforms', d, 'revenue'), null, `ai_platforms × ${d} ('unknown' default)`)
  }
})

test('🔴 the two non-direct models are served ONLY on Class-A dims (no backend for the rest)', () => {
  const s = (model, dim) => g.servedByDeployedBackend({
    model, group_by: dim, metric: 'revenue', preAggWindowMatches: true, hasAttributionWindow: true,
    preAggConversionMetric: true, viaRoutePreAgg: true
  })
  for (const m of ['first_touch_non_direct', 'last_touch_non_direct']) {
    for (const d of ['source', 'medium', 'campaign', 'channel', 'country', 'device', 'browser', 'landing_page', 'date', 'ai_source']) {
      assert.equal(s(m, d), null, `${m} × ${d} has no pre-agg and no pipe`)
    }
    for (const d of ['provider', 'attribution_status', 'stitching_method', 'conversion_type']) {
      assert.equal(s(m, d), `flexible_report_${d}_by_site`, `${m} × ${d} IS served by its Class-A pipe`)
    }
  }
})

test('KEEP: the genuinely-served core stays served', () => {
  const s = (o) => g.servedByDeployedBackend({ preAggWindowMatches: true, hasAttributionWindow: true, viaRoutePreAgg: true, preAggConversionMetric: true, preAggMultiTouchMetric: true, ...o })
  for (const d of g.PREAGG_DIMS) {
    assert.equal(s({ model: 'first_touch', group_by: d, metric: 'revenue' }), 'supabase_preagg', `first_touch × ${d}`)
    assert.equal(s({ model: 'linear', group_by: d, metric: 'revenue' }), 'supabase_preagg', `linear × ${d}`)
  }
  for (const d of g.CLASS_A_DIMS) {
    assert.equal(s({ model: 'first_touch', group_by: d, metric: 'revenue' }), `flexible_report_${d}_by_site`)
  }
})

test('campaigns.js columns stay served (the page its own denylist would have killed)', () => {
  const s = (metric) => g.servedByDeployedBackend({
    model: 'last_touch', group_by: 'campaign', metric, preAggWindowMatches: true,
    hasAttributionWindow: false, viaRoutePreAgg: false,
    preAggConversionMetric: true, preAggMultiTouchMetric: metric === 'revenue' || metric === 'conversions'
  })
  assert.equal(s('revenue'), 'flexible_report_campaign_by_site')
  assert.equal(s('sessions'), 'flexible_report_campaign_sessions_by_site', 'sessions is in GATED_METRICS but this pipe serves it')
  assert.equal(s('leads'), 'flexible_report_campaign_leads_by_site')
})

test('all 3 callers wire the allowlist (attribution.js / export.js / campaigns.js)', async () => {
  const fs = await import('node:fs')
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
  assert.match(read('../routes/attribution.js'), /hasAttributionWindow:/, 'attribution.js passes the window axis')
  const exp = read('../routes/export.js')
  assert.match(exp, /model,/, 'export.js now passes model (its model-aware gates were inert)')
  assert.match(exp, /viaRoutePreAgg: false/, 'export.js calls the engine directly — no route pre-agg')
  const camp = read('../routes/campaigns.js')
  assert.match(camp, /servedByDeployedBackend/, 'campaigns.js gates via the allowlist (was UNGATED)')
  assert.match(camp, /ALLOWED_MODELS\.has\(model\)/, 'campaigns.js validates model (was free-form)')
  assert.match(camp, /err\.statusCode/, 'campaigns.js propagates gate status (was a 500 retry)')
})
