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
  // landing_page: FIXED — the live pvObj now carries it (parsePathname, the nightly's normalizer)
  // and the reader reads that key, so it is SERVED again and the broken-branch list is empty.
  assert.ok(g.MULTITOUCH_LIVE_DIMS.has('landing_page'), 'landing_page is served again')
  assert.equal(g.MULTITOUCH_BROKEN_BRANCH_DIMS.size, 0, 'no known-broken branch remains')
})

test('🔴 the landing_page fabrication is FIXED and cannot regress', () => {
  // This guard previously asserted the fabrication was still present ("un-gate only when this
  // flips"). It flipped — so it now pins the FIX instead.
  assert.doesNotMatch(ENGINE_SRC, /dimVal = share\.page_url \?/, 'the reader must not read share.page_url again')
  assert.match(ENGINE_SRC, /dimVal = share\.landing_page \|\| 'unknown'/, 'it reads the key tpBase emits')
  // and the live pvObj must actually populate that key, or the read is 'unknown' for every row
  assert.match(ENGINE_SRC, /landing_page: parsePathname\(pageUrl\)/, 'live pvObj carries a normalized landing_page')
})

test('🔴 SINGLE SOURCE: parsePathname is defined exactly once in the repo', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const walk = (d) => readdirSync(d).flatMap(f => {
    if (f === 'node_modules' || f === 'dist' || f === '.git') return []
    const p = `${d}/${f}`
    return statSync(p).isDirectory() ? walk(p) : (/\.(js|mjs)$/.test(f) ? [p] : [])
  })
  const defs = walk(new URL('../..', import.meta.url).pathname.replace(/\/$/, ''))
    .filter(p => !/\/tests?\//.test(p))
    .filter(p => /function parsePathname/.test(readFileSync(p, 'utf8')))
  assert.deepEqual(defs.map(p => p.split('/api/')[1]), ['lib/url-normalize.js'],
    'a second copy of the normalizer is the duplicate-source bug #248 — both callers must import the one module')
})

test('🔴 AIPLATFORM_LIVE_DIMS == the ai_platforms reader\'s real chain', () => {
  const chain = chainDims("let dimVal = 'unknown'", 'Apply attribution')
  for (const d of g.AIPLATFORM_LIVE_DIMS) {
    if (d === 'source') continue // shares the ai_source branch (`groupBy === 'source' || 'ai_source'`)
    assert.ok(chain.has(d), `allowlist claims ai_platforms serves "${d}" but the chain has no branch`)
  }
})

// ── the fabrication families stay gated ─────────────────────────────────────────────────
test('🔴 the remaining gated fabrication families are NOT served (landing_page is FIXED)', () => {
  const s = (model, dim, metric) => g.servedByDeployedBackend({
    model, group_by: dim, metric, preAggWindowMatches: true, hasAttributionWindow: false,
    preAggConversionMetric: true, preAggMultiTouchMetric: metric !== 'leads', viaRoutePreAgg: false
  })
  for (const m of g.MULTI_TOUCH_MODELS) {
    for (const d of ['ai_source', 'browser']) assert.equal(s(m, d, 'leads'), null, `${m} × ${d} ('direct' default)`)
    // landing_page is now SERVED — the reader reads the key tpBase emits and the pvObj populates it
    assert.equal(s(m, 'landing_page', 'leads'), 'multitouch_conversions_by_site', `${m} × landing_page is fixed`)
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

// ── PR#4: the bare dead-store reads are deleted and must not come back ───────────────────
test('🔴 PR#4: NO bare (non-underscore) queryHogQL read remains in the engine', () => {
  const code = ENGINE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  // A BARE read is the non-underscore binding: it bypasses even the injectable seam, so it could not
  // be intercepted or observed. All three (flexible_report_linear / _ltv / flexible_ai_share) are
  // deleted. The pipe=NONE flexible_report read used the INJECTABLE _queryHogQL and is now DELETED by
  // D1 (see the [pr4/D1] guard below) — it was never bare, so this guard was never about it.
  const bare = code.split('\n').filter(l => /[^_.\w]queryHogQL\(/.test(l) && !/^import/.test(l.trim()))
  assert.deepEqual(bare, [], 'a bare queryHogQL read reappeared — it would silently return dead-store zeros')
})

test('🔴 PR#4: every surviving _queryHogQL is a pipe-FALLBACK (behind a pipe attempt)', () => {
  const lines = ENGINE_SRC.split('\n')
  const fns = []
  lines.forEach((l, i) => { const m = l.match(/^(?:export )?(?:async )?function ([A-Za-z0-9_]+)/); if (m) fns.push({ n: m[1], l: i + 1 }) })
  const fnAt = (ln) => { let c = fns[0]; for (const f of fns) { if (f.l <= ln) c = f; else break } return c }
  const unguarded = []
  lines.forEach((l, i) => {
    if (!/_queryHogQL\(/.test(l)) return
    if (/let _queryHogQL|_queryHogQL = queryHogQL|if \(queryHog\)/.test(l)) return
    const ln = i + 1, f = fnAt(ln)
    const body = lines.slice(f.l - 1, ln - 1).join('\n')
    if (!/_pipeRead\(|_queryTinybirdPipe\(/.test(body)) unguarded.push(`${f.n}():${ln}`)
  })
  // attribution_explain_journey is the ONE no-pipe read, and it lives in getAttributionExplanation —
  // outside getFlexibleReport's graph, so out of PR#4's scope (D1-D5 removes it with queryHogQL).
  assert.deepEqual(unguarded.filter(u => !u.startsWith('getAttributionExplanation')), [],
    'a no-pipe HogQL read appeared inside getFlexibleReport\'s graph')
})

test('🔴 PR#4: the 3 deleted sites throw a loud invariant (never a silent dead-store read)', () => {
  for (const marker of ['flexible_report_linear', 'flexible_report_ltv', 'flexible_ai_share']) {
    assert.match(ENGINE_SRC, new RegExp(`\\[pr4\\] ${marker}`), `${marker} must throw, not read`)
  }
  // the throws must tell the next reader to fix the ALLOWLIST, not restore the read
  assert.match(ENGINE_SRC, /FIX THE ALLOWLIST — do not restore the read/)
})

// ── D1: the flexible_report HogQL leg is now DELETED — the pipe is the SOLE read path ────────────
// Both reads are gone: the pipe-attempted fallback (:2983) and the pipe=NONE else (:2985). A null
// pipe read throws [pr4/D1] FIX THE PIPE; a no-pipe shape throws [pr4/D1] FIX THE ALLOWLIST. The
// allowlist guard below still pins the invariant that no served shape reaches pipe=NONE.
test('🔴 D1: the flexible_report pipe=NONE read is GONE, replaced by the [pr4/D1] loud invariant', () => {
  assert.doesNotMatch(ENGINE_SRC, /rows = await _queryHogQL\(sql, 'flexible_report'\)/,
    'D1 deleted the pipe=NONE HogQL read — it must not reappear')
  assert.doesNotMatch(ENGINE_SRC, /_fbTb \? _fbTb\.map\([^)]*\) : await _queryHogQL\(sql, 'flexible_report'\)/,
    'D1 deleted the pipe-attempted -> HogQL fallback too — the pipe is the sole read path')
  assert.match(ENGINE_SRC, /\[pr4\/D1\] flexible_report: unreachable pipe=NONE/,
    'the pipe=NONE branch now throws the [pr4/D1] FIX THE ALLOWLIST invariant')
  assert.match(ENGINE_SRC, /\[pr4\/D1\] flexible_report pipe .* returned null/,
    'a null pipe read now throws the [pr4/D1] FIX THE PIPE invariant')
})

test('🔴 :2975 is UNREACHABLE: the allowlist denies every no-pipe shape (422, never a dead read)', () => {
  // Exhaustive over the real vocabulary: any shape with no live backend MUST be denied, at the gate,
  // before the engine is entered. This is the invariant that keeps the deferred read harmless.
  let denied = 0, servedNoPipe = []
  for (const model of MODELS) for (const dim of DIMS) for (const metric of ['revenue', 'conversions', 'leads']) {
    for (const win of [true, false]) {
      const shape = {
        model, group_by: dim, metric, preAggWindowMatches: true, hasAttributionWindow: win,
        preAggConversionMetric: true, preAggMultiTouchMetric: true, viaRoutePreAgg: true
      }
      const backing = g.servedByDeployedBackend(shape)
      const gated = g.gatedReportReason(shape)
      if (!backing) {
        // no live backend -> the gate MUST deny it, or it reaches :2975 and reads a dead store
        assert.ok(gated, `${model} × ${dim} × ${metric} (window=${win}) has NO backing but is NOT gated -> would reach :2975`)
        assert.equal(gated.error_code, 'gated_dead_store')
        denied++
      } else servedNoPipe.push(backing)
    }
  }
  assert.ok(denied > 50, `exercised ${denied} no-backend shapes, all denied`)
})
