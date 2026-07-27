// getAttribution — the /api/attribution dispatcher. TOKEN-FREE, NO network.
//
// getAttribution (attribution-engine.js:553) is what attribution.js:317 calls for all 9
// models, and NO test file referenced it (repo-wide grep). Its per-model callees
// (firstTouchAttribution etc.) already have their own direct coverage, so this file
// deliberately does NOT re-test their row mapping. It covers only what is unique to this
// integration point and untested anywhere else:
//   1. the model -> function switch actually routes where it claims to
//   2. the module-level cache is consulted and populated
//   3. the >=50000 truncation wrapper
//   4. the default case, and that ALLOWED_MODELS cannot drift away from the switch
//
// Everything is driven through the existing __setAttributionReadDeps({ queryTinybird })
// seam, observing WHICH pipe each model asks for — that is the only externally visible
// signal of which branch the switch took, since the callees are module-internal references
// that an ESM import cannot monkey-patch.
//
// EXPECTED STDERR, not a failure: the ai_platforms case logs
//   [aiPlatformAttribution] failed to fetch site window: Error: [supabase] SUPABASE_URL ...
// SUPABASE_URL is deliberately left UNSET so getSupabase() throws immediately instead of the
// client attempting a real fetch — that keeps this file genuinely network-free. The engine's
// own try/catch (attribution-engine.js:533-535) swallows it and falls back to a 30-day
// window, which is the behaviour under test's precondition, not a broken test.
//
// Mock env before the dynamic import so the module's client init doesn't throw.
process.env.POSTHOG_API_KEY = 'mock-posthog-api-key-for-tests'
process.env.POSTHOG_HOST = 'https://mock.posthog.com'
process.env.POSTHOG_PROJECT_ID = '123456'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-posthog-personal-key-for-tests'

import test from 'node:test'
import assert from 'node:assert/strict'

const {
  getAttribution,
  __setAttributionReadDeps,
  __resetAttributionReadDeps
} = await import('../lib/attribution-engine.js')

const { ALLOWED_MODELS } = await import('../lib/report-config-validation.js')

const FROM = '2026-06-01'
const TO = '2026-06-30'

// The cache is a module-level NodeCache (attribution-engine.js:79, stdTTL 60s) with NO evict
// seam of its own — unlike getSessionReport/getFlexibleReport, which export one. So every
// test MUST use a site id no other test uses, or it reads a neighbour's cached result and
// passes for the wrong reason. Counter, not a constant.
let siteSeq = 0
const nextSite = (label) => `site-getattr-${label}-${++siteSeq}`

// Records every pipe name requested, in order, and returns `rows` for each.
function stubPipes (rows = []) {
  const calls = []
  __setAttributionReadDeps({
    queryTinybird: async (pipeName) => {
      calls.push(pipeName)
      return rows
    }
  })
  return calls
}

// ── 1. the switch routes to the right underlying read ────────────────────────
// Asserted on the FIRST pipe requested: multi-touch and ai_platforms fan out to further
// reads downstream, and only the first one identifies the branch taken.
const ROUTES = [
  ['first_touch', 'first_touch_by_site'],
  ['last_touch', 'last_touch_by_site_agg'],
  ['first_touch_non_direct', 'first_touch_non_direct_by_site'],
  ['last_touch_non_direct', 'last_touch_non_direct_by_site'],
  ['linear', 'multitouch_conversions_by_site'],
  ['u_shaped', 'multitouch_conversions_by_site'],
  ['time_decay', 'multitouch_conversions_by_site'],
  ['w_shaped', 'multitouch_conversions_by_site'],
  ['ai_platforms', 'aiplatform_conversions_by_site']
]

for (const [model, expectedPipe] of ROUTES) {
  test(`dispatch: model '${model}' reads pipe '${expectedPipe}'`, async () => {
    const calls = stubPipes([])
    try {
      await getAttribution(nextSite(model), model, FROM, TO)
      assert.ok(calls.length > 0, `${model}: no pipe was read at all`)
      assert.equal(calls[0], expectedPipe,
        `${model} dispatched to '${calls[0]}' — the switch sent it down the wrong branch`)
    } finally {
      __resetAttributionReadDeps()
    }
  })
}

// ── 2. cache ─────────────────────────────────────────────────────────────────

test('cache HIT: identical (model, siteId, dateFrom, dateTo) does not re-read the pipe', async () => {
  const calls = stubPipes([])
  const siteId = nextSite('cache-hit')
  try {
    const first = await getAttribution(siteId, 'first_touch', FROM, TO)
    const readsAfterFirst = calls.length
    assert.equal(readsAfterFirst, 1, 'a cold call should read the pipe exactly once')

    const second = await getAttribution(siteId, 'first_touch', FROM, TO)
    assert.equal(calls.length, readsAfterFirst,
      'the second identical call re-read the pipe — the cache was not consulted')
    assert.deepEqual(second, first, 'the cached value should be the value the first call returned')
  } finally {
    __resetAttributionReadDeps()
  }
})

test('cache MISS: each of model / siteId / dateFrom / dateTo is part of the key', async () => {
  const calls = stubPipes([])
  const siteId = nextSite('cache-miss')
  try {
    await getAttribution(siteId, 'first_touch', FROM, TO)
    assert.equal(calls.length, 1)

    // different model -> different key (and a different pipe, which also proves the branch)
    await getAttribution(siteId, 'last_touch', FROM, TO)
    assert.equal(calls.length, 2, 'a different model must miss the cache')

    // different siteId
    await getAttribution(nextSite('cache-miss-other'), 'first_touch', FROM, TO)
    assert.equal(calls.length, 3, 'a different siteId must miss the cache')

    // different dateFrom
    await getAttribution(siteId, 'first_touch', '2026-05-01', TO)
    assert.equal(calls.length, 4, 'a different dateFrom must miss the cache')

    // different dateTo
    await getAttribution(siteId, 'first_touch', FROM, '2026-07-31')
    assert.equal(calls.length, 5, 'a different dateTo must miss the cache')
  } finally {
    __resetAttributionReadDeps()
  }
})

// ── 3. truncation ────────────────────────────────────────────────────────────
// The threshold is `>= 50000` (attribution-engine.js:585), so 50000 truncates and 49999
// does not. Both sides are pinned: a `>` typo would still pass a one-sided test.

const row = (i) => ({ source: `s${i}`, medium: 'cpc', campaign: null, conversions: 1, revenue: 1 })

test('truncation: exactly 50000 results sets truncated:true and truncated_at:50000', async () => {
  const calls = stubPipes(Array.from({ length: 50000 }, (_, i) => row(i)))
  try {
    const out = await getAttribution(nextSite('trunc-at'), 'first_touch', FROM, TO)
    assert.equal(Array.isArray(out), false, 'a truncated result is wrapped, not a bare array')
    assert.equal(out.truncated, true)
    assert.equal(out.truncated_at, 50000)
    assert.equal(out.results.length, 50000, 'the rows themselves are still returned in full')
    assert.equal(calls.length, 1)
  } finally {
    __resetAttributionReadDeps()
  }
})

test('truncation: 49999 results is NOT wrapped — returned as a bare array', async () => {
  stubPipes(Array.from({ length: 49999 }, (_, i) => row(i)))
  try {
    const out = await getAttribution(nextSite('trunc-below'), 'first_touch', FROM, TO)
    assert.equal(Array.isArray(out), true, 'below the threshold the raw array is returned')
    assert.equal(out.length, 49999)
    assert.equal(out.truncated, undefined, 'no truncated flag may be attached below the threshold')
  } finally {
    __resetAttributionReadDeps()
  }
})

// ── 4. the default case, and the drift guard that makes it matter ────────────

test('default case: an unrecognized model throws Unknown attribution model', async () => {
  stubPipes([])
  try {
    await assert.rejects(
      () => getAttribution(nextSite('bad-model'), 'not_a_real_model', FROM, TO),
      /Unknown attribution model: not_a_real_model/
    )
  } finally {
    __resetAttributionReadDeps()
  }
})

test('a thrown model is NOT cached — the next call re-enters the switch', async () => {
  const calls = stubPipes([])
  const siteId = nextSite('throw-not-cached')
  try {
    await assert.rejects(() => getAttribution(siteId, 'nope', FROM, TO))
    assert.equal(calls.length, 0, 'the throw happens before any read')
    // A cached rejection would make the second call resolve to undefined instead of throwing.
    await assert.rejects(() => getAttribution(siteId, 'nope', FROM, TO))
  } finally {
    __resetAttributionReadDeps()
  }
})

// THE REGRESSION GUARD. The route validates `model` against ALLOWED_MODELS
// (attribution.js:20) and 400s before ever calling getAttribution, so today the default
// branch is unreachable over HTTP. That is only true while the two lists agree. If someone
// adds a 10th model to ALLOWED_MODELS without adding a switch case, the route would accept
// it (200-path) and getAttribution would throw -> an unhandled 500 for a request the API
// just told the customer was valid. This fails the moment that drift appears.
test('🔴 every ALLOWED_MODELS entry has a switch case — no 400-approved model may throw', async () => {
  stubPipes([])
  try {
    for (const model of ALLOWED_MODELS) {
      await assert.doesNotReject(
        () => getAttribution(nextSite(`allowed-${model}`), model, FROM, TO),
        `'${model}' is accepted by the route's ALLOWED_MODELS but has no case in getAttribution's switch — it would 500`
      )
    }
  } finally {
    __resetAttributionReadDeps()
  }
})
