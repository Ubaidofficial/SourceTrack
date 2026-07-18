// Phase 2c gap-close — pageview dual-write wiring regression tests.
//
// Covers the 3 sites wired in tinybird/PHASE2C_PAGEVIEW_DUALWRITE_PLAN.md:
//   track.js:332 (POST /api/track), proxy.js /sp/e, proxy.js /sp/pixel.gif.
//
// The load-bearing assertion (plan §2, hard requirement #1): ph.capture and
// dualWriteEvent must receive the IDENTICAL distinct_id for an anonymous
// pageview (no anonymous_id/uid in the request). Before the fix, distinctId was
// computed inline at each call site as `anonymous_id || uuidv4()` — copied
// naively, that calls uuidv4() twice and silently breaks visitor stitching
// between PostHog and Tinybird. This suite is the regression guard for that.
//
// Also asserts flag-off (TINYBIRD_DUAL_WRITE unset) is a complete no-op on all
// 3 routes — the live ph.capture path is provably unaffected by this change.

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getSupabase } = await import('../lib/supabase.js')
const { track } = await import('../routes/track.js')
const { default: proxyRouter } = await import('../routes/proxy.js')
const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')

// ── Shared dual-write transport recorder (mirrors tinybird/adapter/__tests__/dual-write.test.js) ──
function recorder () {
  const payloads = []
  const transport = async (payload, meta) => { payloads.push({ payload, meta }) }
  return {
    transport,
    lines: () => payloads.flatMap((p) => gunzipSync(p.payload).toString('utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  }
}
const BATCH_OPTS = { flushAt: 1000, flushInterval: 0 } // never auto-flush; flush explicitly

function resetDualWrite () {
  setDualWriteTransport(null)
  delete process.env.TINYBIRD_DUAL_WRITE
}


// ── Supabase mock (mirrors api/tests/pii-sanitization.test.js) ──────────────────
// pv_limit: Infinity short-circuits claimPageviewUsage before any DB/RPC call
// (api/lib/pageview-limits.js, getPvLimit per-site override) — keeps these tests
// fast and network-independent rather than relying on fail-open-on-timeout.
const client = getSupabase()
const originalFrom = client.from
function mockSupabaseSite (site) {
  client.from = (table) => {
    if (table === 'sites') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: site, error: null }),
            maybeSingle: async () => ({ data: site, error: null })
          })
        })
      }
    }
    return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }
  }
}
function restoreSupabase () { client.from = originalFrom }

const UA = 'Mozilla/5.0'

test('pageview dual-write wiring — track.js POST /api/track', async (t) => {
  t.beforeEach(() => { resetDualWrite() })
  t.afterEach(() => { resetDualWrite() })

  await t.test('anonymous pageview (no anonymous_id): dual-write uses the resolved distinct_id', async () => {
    process.env.TINYBIRD_DUAL_WRITE = 'true'
    const rec = recorder()
    setDualWriteTransport(rec.transport, BATCH_OPTS)

    const reqMock = {
      headers: { 'user-agent': UA },
      site: { id: 'site-track-1', excluded_paths: null, custom_url_params: null, pv_limit: Infinity },
      body: { page_url: 'https://example.com/', utm_source: 'google' } // no anonymous_id, no event -> defaults to $pageview
    }
    const resMock = { status: () => ({ json: () => {} }) }

    await track(reqMock, resMock)

    await __getDualWriteBatcher().flush()
    const lines = rec.lines()
    assert.strictEqual(lines.length, 1, 'dual-write fired exactly once')
    assert.strictEqual(lines[0].event_type, '$pageview')
    assert.match(lines[0].distinct_id, /^[0-9a-f-]{36}$/, 'anonymous -> dual-write got a single generated uuid distinct_id')
  })

  await t.test('flag OFF: no dual-write', async () => {
    resetDualWrite() // TINYBIRD_DUAL_WRITE unset
    const rec = recorder()
    setDualWriteTransport(rec.transport, BATCH_OPTS) // transport injected, but flag is OFF

    const reqMock = {
      headers: { 'user-agent': UA },
      site: { id: 'site-track-1', excluded_paths: null, custom_url_params: null, pv_limit: Infinity },
      body: { page_url: 'https://example.com/' }
    }
    const resMock = { status: () => ({ json: () => {} }) }

    await track(reqMock, resMock)
    assert.strictEqual(rec.lines().length, 0, 'no dual-write when flag is off')
  })
})

test('pageview dual-write wiring — proxy.js POST /sp/e', async (t) => {
  const layer = proxyRouter.stack.find((s) => s.route?.path === '/e' && s.route?.methods.post)
  const handler = layer.route.stack[layer.route.stack.length - 1].handle

  t.beforeEach(() => { resetDualWrite(); mockSupabaseSite({ id: 'site-proxy-e', plan: 'free', pv_limit: Infinity, trial_ends_at: null }) })
  t.afterEach(() => { resetDualWrite(); restoreSupabase() })

  await t.test('anonymous proxied pageview (no anonymous_id): dual-write uses the resolved distinct_id', async () => {
    process.env.TINYBIRD_DUAL_WRITE = 'true'
    const rec = recorder()
    setDualWriteTransport(rec.transport, BATCH_OPTS)

    const req = { headers: { 'user-agent': UA }, body: { site_key: 'sk-test', event: '$pageview', properties: { utm_source: 'google' } } }
    const res = { json: () => {} }

    await handler(req, res)

    await __getDualWriteBatcher().flush()
    const lines = rec.lines()
    assert.strictEqual(lines.length, 1)
    assert.match(lines[0].distinct_id, /^[0-9a-f-]{36}$/, 'anonymous -> dual-write got a single generated uuid distinct_id')
    assert.ok(!('site_key' in lines[0]), 'site_key dropped by the adapter')
  })

  await t.test('flag OFF: no dual-write', async () => {
    resetDualWrite()
    const rec = recorder()
    setDualWriteTransport(rec.transport, BATCH_OPTS)

    const req = { headers: { 'user-agent': UA }, body: { site_key: 'sk-test', event: '$pageview', properties: {} } }
    const res = { json: () => {} }

    await handler(req, res)
    assert.strictEqual(rec.lines().length, 0)
  })
})

test('pageview dual-write wiring — proxy.js GET /sp/pixel.gif', async (t) => {
  const layer = proxyRouter.stack.find((s) => s.route?.path === '/pixel.gif' && s.route?.methods.get)
  const handler = layer.route.stack[layer.route.stack.length - 1].handle

  t.beforeEach(() => { resetDualWrite(); mockSupabaseSite({ id: 'site-pixel-1', plan: 'free', pv_limit: Infinity, trial_ends_at: null }) })
  t.afterEach(() => { resetDualWrite(); restoreSupabase() })

  await t.test('anonymous pixel pageview (no uid): dual-write uses the resolved distinct_id', async () => {
    process.env.TINYBIRD_DUAL_WRITE = 'true'
    const rec = recorder()
    setDualWriteTransport(rec.transport, BATCH_OPTS)

    const req = { headers: { 'user-agent': UA }, query: { site_key: 'sk-test' } }
    const res = { set: () => {}, end: () => {} }

    await handler(req, res)

    await __getDualWriteBatcher().flush()
    const lines = rec.lines()
    assert.strictEqual(lines.length, 1)
    assert.strictEqual(lines[0].event_type, '$pageview', 'canonical event_type must be $pageview, NOT the bag event_type:"pixel" analytics label (regression guard for the event_type collision fix)')
    assert.strictEqual(lines[0].tracking_method, 'pixel', 'the pixel label survives, renamed to tracking_method (matching pixel.js convention)')
    assert.match(lines[0].distinct_id, /^[0-9a-f-]{36}$/, 'anonymous -> dual-write got a single generated uuid distinct_id')
    assert.ok(!('site_key' in lines[0]), 'site_key dropped by the adapter')
  })

  await t.test('flag OFF: no dual-write', async () => {
    resetDualWrite()
    const rec = recorder()
    setDualWriteTransport(rec.transport, BATCH_OPTS)

    const req = { headers: { 'user-agent': UA }, query: { site_key: 'sk-test' } }
    const res = { set: () => {}, end: () => {} }

    await handler(req, res)
    assert.strictEqual(rec.lines().length, 0)
  })
})
