// CAPI Phase 1 foundation: encryption-at-rest (fail-safe decrypt), delivery log,
// and retry/backoff. ENCRYPTION_KEY must be set before importing conversion-sync
// (utils reads it at call time, but set early to be safe).
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64)

import test from 'node:test'
import assert from 'node:assert'
import {
  sendMetaCAPI, sendMicrosoftConversion, dispatchCapi, encryptCapiToken
} from '../lib/conversion-sync.js'
import { logCapiDelivery, CAPI_DELIVERY_COLUMNS } from '../lib/capi-deliveries.js'

function withFetch(stub, fn) {
  const orig = global.fetch
  global.fetch = stub
  return Promise.resolve(fn()).finally(() => { global.fetch = orig })
}
const resp = (status, body = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => JSON.stringify(body),
  headers: { get: () => null }
})
function mockSupabase() {
  const inserts = []
  return { inserts, from: () => ({ insert: (row) => { inserts.push(row); return Promise.resolve({ error: null }) } }) }
}

// ── Encryption fail-safe ────────────────────────────────────────────────────
test('decrypt fail-safe: an undecryptable token → platform no-ops, no HTTP call', async () => {
  let calls = 0
  await withFetch(async () => { calls++; return resp(200) }, async () => {
    // meta_capi_token is not iv:ct:tag → decryptSecret throws → safeDecrypt null → skip
    const res = await sendMetaCAPI({ meta_pixel_id: 'px', meta_capi_token: 'not-encrypted-garbage' },
      { conversion_type: 'purchase', conversion_value: 5 })
    assert.strictEqual(res, null)
  })
  assert.strictEqual(calls, 0, 'must NOT call the ad platform with a bad token')
})

test('decrypt success: a properly-encrypted token is used (HTTP call made)', async () => {
  let calls = 0
  await withFetch(async () => { calls++; return resp(200, {}) }, async () => {
    const res = await sendMetaCAPI(
      { meta_pixel_id: 'px', meta_capi_token: encryptCapiToken('real-token') },
      { conversion_type: 'purchase', conversion_value: 5, email: 'a@b.com' })
    assert.deepStrictEqual(res, { ok: true, http_status: 200, error_message: null })
  })
  assert.strictEqual(calls, 1)
})

// ── Click-ID / match-quality forwarding (Meta fbp/fbc) ──────────────────────
test('sendMetaCAPI: forwards real _fbp/_fbc when present (real fbc wins over derived)', async () => {
  let body
  await withFetch(async (_url, opts) => { body = JSON.parse(opts.body); return resp(200, {}) }, async () => {
    await sendMetaCAPI(
      { meta_pixel_id: 'px', meta_capi_token: encryptCapiToken('tok') },
      { conversion_type: 'purchase', conversion_value: 5, fbp: 'fb.1.111.AAA', fbc: 'fb.1.222.BBB', fbclid: 'CL' })
  })
  assert.strictEqual(body.data[0].user_data.fbp, 'fb.1.111.AAA')
  assert.strictEqual(body.data[0].user_data.fbc, 'fb.1.222.BBB')
})

test('sendMetaCAPI: derives fbc from fbclid when no real _fbc cookie', async () => {
  let body
  await withFetch(async (_url, opts) => { body = JSON.parse(opts.body); return resp(200, {}) }, async () => {
    await sendMetaCAPI(
      { meta_pixel_id: 'px', meta_capi_token: encryptCapiToken('tok') },
      { conversion_type: 'purchase', conversion_value: 5, fbclid: 'CLICKID' })
  })
  assert.match(body.data[0].user_data.fbc, /^fb\.1\.\d+\.CLICKID$/)
  assert.strictEqual(body.data[0].user_data.fbp, undefined)
})

// ── Delivery log ────────────────────────────────────────────────────────────
test('logCapiDelivery: only real columns, rejects unknown, surfaces errors', async () => {
  const sb = mockSupabase()
  await logCapiDelivery(sb, { site_id: 's1', platform: 'meta', status: 'success', http_status: 200, attempt: 1 })
  assert.strictEqual(sb.inserts.length, 1)
  await assert.rejects(() => logCapiDelivery(sb, { site_id: 's1', platform: 'meta', status: 'success', details: 'x' }),
    /unknown capi_deliveries column\(s\): details/)
  // surfaces (returns) a DB error rather than throwing/swallowing
  const failing = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'denied' } }) }) }
  const r = await logCapiDelivery(failing, { site_id: 's1', platform: 'meta', status: 'failed' })
  assert.strictEqual(r.error.message, 'denied')
  assert.ok(CAPI_DELIVERY_COLUMNS.includes('http_status') && !CAPI_DELIVERY_COLUMNS.includes('details'))
})

test('dispatchCapi: writes one success row for the configured platform, skips no-token platforms', async () => {
  const sb = mockSupabase()
  await withFetch(async () => resp(200, {}), async () => {
    await dispatchCapi(sb, { id: 's1', meta_pixel_id: 'px', meta_capi_token: encryptCapiToken('tok') },
      { conversion_type: 'purchase', conversion_value: 10, email: 'a@b.com', external_event_id: 'evt1' })
  })
  // meta configured → 1 row; google/microsoft/linkedin have no tokens → skipped, not logged
  assert.strictEqual(sb.inserts.length, 1)
  assert.deepStrictEqual(sb.inserts[0], {
    site_id: 's1', platform: 'meta', event_ref: 'evt1',
    status: 'success', http_status: 200, error_message: null, attempt: 1
  })
})

test('dispatchCapi: a failed send is logged as failed with http_status', async () => {
  const sb = mockSupabase()
  await withFetch(async () => resp(400, { error: 'bad' }), async () => {
    await dispatchCapi(sb, { id: 's1', meta_pixel_id: 'px', meta_capi_token: encryptCapiToken('tok') },
      { conversion_type: 'purchase', conversion_value: 10 })
  })
  assert.strictEqual(sb.inserts.length, 1)
  assert.strictEqual(sb.inserts[0].status, 'failed')
  assert.strictEqual(sb.inserts[0].http_status, 400)
})

// ── Retry / backoff ─────────────────────────────────────────────────────────
test('retry: 5xx is retried then succeeds; 4xx is NOT retried', async () => {
  // 503 then 200 → two fetch calls
  let n = 0
  await withFetch(async () => { n++; return n === 1 ? resp(503) : resp(200) }, async () => {
    const res = await sendMicrosoftConversion(
      { microsoft_tag_id: 'tag', microsoft_capi_token: encryptCapiToken('tok') }, { conversion_value: 1 })
    assert.strictEqual(res.ok, true)
  })
  assert.strictEqual(n, 2, '5xx should be retried once')

  // 400 → single fetch call (no retry on non-429 4xx)
  let m = 0
  await withFetch(async () => { m++; return resp(400) }, async () => {
    const res = await sendMicrosoftConversion(
      { microsoft_tag_id: 'tag', microsoft_capi_token: encryptCapiToken('tok') }, { conversion_value: 1 })
    assert.strictEqual(res.ok, false)
  })
  assert.strictEqual(m, 1, '4xx must NOT be retried')
})
