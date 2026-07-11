// /api/conversion durable dedup — the fix for the no-order_id gap: a client-supplied event_id
// (external_event_id non-null) with NO order_id must get a DURABLE claim, not just the per-replica
// in-memory cache. Two identical POSTs across replicas/redeploys must dedupe to ONE dual-write.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  conversion, buildConversionDedupeKey,
  __setConversionDedupeDeps, __resetConversionDedupeDeps, __flushConversionDedupeCache
} = await import('../routes/conversion.js')

// ── pure key-builder (the load-bearing new logic: fires whenever external_event_id is non-null,
//    namespaced so a client event_id can't collide with an order-derived key_value) ──
test('buildConversionDedupeKey: client event_id with NO order_id -> durable key (capi_event_id namespace)', () => {
  assert.deepStrictEqual(buildConversionDedupeKey('evt-123', null), { key_type: 'capi_event_id', key_value: 'evt-123' })
})
test('buildConversionDedupeKey: order-derived id WITH order_id -> order_event namespace (unchanged)', () => {
  assert.deepStrictEqual(buildConversionDedupeKey('site1:o9:purchase', 'o9'), { key_type: 'order_event', key_value: 'site1:o9:purchase' })
})
test('buildConversionDedupeKey: stable + no cross-namespace collision', () => {
  // same client event_id twice, no order_id -> identical key => a durable claim can dedupe it
  assert.deepStrictEqual(buildConversionDedupeKey('E', null), buildConversionDedupeKey('E', null))
  // a client event_id that HAPPENS to equal an order-derived string still lands in a DIFFERENT
  // key_type namespace than the real order key -> no false dedup (unique key includes key_type).
  const spoof = buildConversionDedupeKey('s:o:t', null)   // capi_event_id
  const real = buildConversionDedupeKey('s:o:t', 'o')     // order_event
  assert.notStrictEqual(spoof.key_type, real.key_type)
})
test('buildConversionDedupeKey: null external_event_id -> null (no durable dedup)', () => {
  assert.strictEqual(buildConversionDedupeKey(null, null), null)
  assert.strictEqual(buildConversionDedupeKey('', 'o1'), null)
})

// ── integration: drive the real conversion() handler with injected deps ──
function mockRes () {
  return { statusCode: 200, body: null, status (c) { this.statusCode = c; return this }, json (b) { this.body = b; return this } }
}
function mockReq ({ event_id, order_id, value = 10 } = {}) {
  return {
    headers: {}, socket: { remoteAddress: '127.0.0.1' },
    body: { conversion_value: value, conversion_type: 'purchase', page_url: 'https://x.example.com/checkout', ...(event_id ? { event_id } : {}), ...(order_id ? { order_id } : {}) },
    site: { id: 'site-1', site_key: 'sk_test', plan: 'free', excluded_paths: [], custom_url_params: null }
  }
}
// Stateful claim store mirroring the DB's UNIQUE(site_key, provider, key_type, key_value).
function makeDeps () {
  const claimed = new Set(); const keysSeen = []; let writes = 0
  const id = (sk, p, k) => `${sk}|${p}|${k.key_type}|${k.key_value}`
  return {
    keysSeen, writes: () => writes, claimedSize: () => claimed.size,
    deps: {
      claim: async (sk, p, keys) => { const k = keys[0]; keysSeen.push(k); if (claimed.has(id(sk, p, k))) return { success: false, duplicate: true }; claimed.add(id(sk, p, k)); return { success: true, duplicate: false } },
      rollback: async (sk, p, keys) => { claimed.delete(id(sk, p, keys[0])) },
      usage: async () => ({ allowed: true }),
      dualWrite: () => { writes += 1; return true }
    }
  }
}
async function drive (deps, reqOpts) { const res = mockRes(); await conversion(mockReq(reqOpts), res); return res }

test('(a) same external_event_id twice, NO order_id -> 2nd deduped, dualWrite called ONCE', async () => {
  const h = makeDeps(); __flushConversionDedupeCache(); __setConversionDedupeDeps(h.deps)
  try {
    const r1 = await drive(h.deps, { event_id: 'E-nodup' })
    const r2 = await drive(h.deps, { event_id: 'E-nodup' })
    assert.strictEqual(h.writes(), 1, 'exactly one dual-write for two identical POSTs')
    assert.ok(r1.body?.data?.received, 'first accepted')
    assert.ok(r2.body?.data?.dedup_skipped, 'second reported as duplicate')
  } finally { __resetConversionDedupeDeps() }
})

test('(b) DURABLE: cold in-memory cache (fresh replica) -> 2nd still deduped via the DB claim', async () => {
  const h = makeDeps(); __flushConversionDedupeCache(); __setConversionDedupeDeps(h.deps)
  try {
    await drive(h.deps, { event_id: 'E-durable' })
    __flushConversionDedupeCache() // simulate a different replica / a redeploy: in-memory cache is empty
    const r2 = await drive(h.deps, { event_id: 'E-durable' })
    assert.strictEqual(h.writes(), 1, 'still ONE dual-write — the durable DB claim caught it, not the cache')
    assert.ok(r2.body?.data?.persistent, 'second deduped via the persistent claim')
    assert.strictEqual(h.keysSeen[0].key_type, 'capi_event_id', 'no-order_id path used the capi_event_id namespace')
  } finally { __resetConversionDedupeDeps() }
})

test('(c) order_id path unchanged: still deduped durably, order_event namespace (regression)', async () => {
  const h = makeDeps(); __flushConversionDedupeCache(); __setConversionDedupeDeps(h.deps)
  try {
    await drive(h.deps, { order_id: 'o-123' })
    __flushConversionDedupeCache()
    const r2 = await drive(h.deps, { order_id: 'o-123' })
    assert.strictEqual(h.writes(), 1, 'order_id path still dedupes to one write')
    assert.ok(r2.body?.data?.persistent, 'order_id duplicate caught by the durable claim')
    assert.ok(h.keysSeen.every(k => k.key_type === 'order_event'), 'order_id path uses order_event namespace')
  } finally { __resetConversionDedupeDeps() }
})

test('(d) null external_event_id (no event_id, no order_id) -> NOT deduped, both ingest', async () => {
  const h = makeDeps(); __flushConversionDedupeCache(); __setConversionDedupeDeps(h.deps)
  try {
    await drive(h.deps, {})
    await drive(h.deps, {})
    assert.strictEqual(h.writes(), 2, 'keyless conversions are not merged — two writes')
    assert.strictEqual(h.claimedSize(), 0, 'no durable claim attempted for a null key')
  } finally { __resetConversionDedupeDeps() }
})
