// CAPI EGRESS SUPPRESSION (PR 4/5) — an erased subject's conversion must never leave the building.
//
// WHY THIS SUITE IS SEPARATE from the PR 2 suppression tests: every other suppression call site
// guards a Supabase write, where a miss is repairable — the row is ours and a later erasure or the
// PR 3 re-sweep still reaches it. An ad-platform send is not. Once Meta, Google, GA4, TikTok or
// LinkedIn has the conversion it is in a third party's ledger under their retention, and no sweep
// of ours can retract it. So the assertions here are about what does NOT go out, and the
// fail-closed direction matters more here than anywhere else in the codebase.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64)

import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatchCapi, encryptCapiToken } from '../lib/conversion-sync.js'
import { __resetSuppressionCache } from '../lib/erasure-suppression.js'

const resp = (status, body = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => JSON.stringify(body)
})

// A site with EVERY platform credentialed, so "nothing was sent" cannot pass vacuously because
// no sender was configured in the first place.
const FULLY_CONFIGURED_SITE = {
  id: 's1',
  meta_pixel_id: 'px', meta_capi_token: encryptCapiToken('tok'),
  ga4_measurement_id: 'G-1', ga4_api_secret: 'sec',
  tiktok_pixel_code: 'tt', tiktok_capi_token: encryptCapiToken('tok'),
  linkedin_partner_id: 'li', linkedin_capi_token: encryptCapiToken('tok')
}

const EVT = {
  conversion_type: 'purchase', conversion_value: 10, currency: 'USD',
  email: 'erased@example.com', distinct_id: 'd_erased', external_event_id: 'evt1'
}

// `mode` decides how the erasure_suppression select behaves: clean, suppressed, or broken.
function stubSupabase (mode) {
  const inserts = []
  const select = () => ({
    eq: () => ({
      contains: () => ({
        limit: () => {
          if (mode === 'throws') return Promise.reject(new Error('connection reset'))
          if (mode === 'error') return Promise.resolve({ data: null, error: { message: 'permission denied' } })
          return Promise.resolve({ data: mode === 'suppressed' ? [{ id: 'sup1' }] : [], error: null })
        }
      })
    })
  })
  return {
    inserts,
    from: (table) => table === 'erasure_suppression'
      ? { select }
      : { insert: (row) => { inserts.push(row); return Promise.resolve({ error: null }) } }
  }
}

async function withFetch (stub, fn) {
  const orig = global.fetch
  global.fetch = stub
  try { return await fn() } finally { global.fetch = orig }
}

test.beforeEach(() => __resetSuppressionCache())

test('🔴 a SUPPRESSED subject: not one HTTP call to any of the six platforms', async () => {
  let calls = 0
  const sb = stubSupabase('suppressed')
  await withFetch(async () => { calls++; return resp(200) }, async () => {
    await dispatchCapi(sb, FULLY_CONFIGURED_SITE, EVT)
  })
  assert.equal(calls, 0, 'an erased subject must produce ZERO ad-platform requests')
  assert.equal(sb.inserts.length, 0, 'a no-attempt suppression must not write capi_deliveries rows')
})

test('the guard is NOT vacuous — the same site+event DOES send when not suppressed', async () => {
  let calls = 0
  const sb = stubSupabase('clean')
  await withFetch(async () => { calls++; return resp(200, {}) }, async () => {
    await dispatchCapi(sb, FULLY_CONFIGURED_SITE, EVT)
  })
  assert.ok(calls > 0, 'without suppression this exact fixture must reach the platforms')
  assert.ok(sb.inserts.length > 0, 'and must log deliveries — otherwise the test above proves nothing')
})

test('🔴 FAIL CLOSED: a suppression lookup that ERRORS blocks the send', async () => {
  let calls = 0
  const sb = stubSupabase('error')
  await withFetch(async () => { calls++; return resp(200) }, async () => {
    await dispatchCapi(sb, FULLY_CONFIGURED_SITE, EVT)
  })
  assert.equal(calls, 0, 'unknown suppression state must never egress — an unrecallable send is worse than a missing one')
})

test('🔴 FAIL CLOSED: a suppression lookup that THROWS blocks the send', async () => {
  let calls = 0
  const sb = stubSupabase('throws')
  await withFetch(async () => { calls++; return resp(200) }, async () => {
    await dispatchCapi(sb, FULLY_CONFIGURED_SITE, EVT)
  })
  assert.equal(calls, 0, 'a rejected client promise must fail closed, not escape the guard')
})

test('suppression matches on EMAIL alone (no subject id on the event)', async () => {
  let calls = 0
  const sb = stubSupabase('suppressed')
  await withFetch(async () => { calls++; return resp(200) }, async () => {
    await dispatchCapi(sb, FULLY_CONFIGURED_SITE, { ...EVT, distinct_id: undefined, anonymous_id: undefined })
  })
  assert.equal(calls, 0, 'the email the senders hash into user_data is itself a suppression key')
})

test('suppression matches on anonymous_id when distinct_id is absent', async () => {
  let calls = 0
  const sb = stubSupabase('suppressed')
  await withFetch(async () => { calls++; return resp(200) }, async () => {
    await dispatchCapi(sb, FULLY_CONFIGURED_SITE, { ...EVT, distinct_id: undefined, email: undefined, anonymous_id: 'a_erased' })
  })
  assert.equal(calls, 0, 'the browser rail carries anonymous_id, not distinct_id — it must key too')
})

test('an event carrying NO subject key at all still sends (nothing to suppress on)', async () => {
  let calls = 0
  const sb = stubSupabase('clean')
  await withFetch(async () => { calls++; return resp(200, {}) }, async () => {
    await dispatchCapi(sb, FULLY_CONFIGURED_SITE, { ...EVT, distinct_id: undefined, anonymous_id: undefined, email: undefined })
  })
  // Deliberate: a conversion with neither an id nor an email carries no subject, so there is no
  // person to have been erased. Failing closed here would block every anonymous conversion on the
  // rail — a total CAPI outage dressed up as a privacy guard.
  assert.ok(calls > 0, 'a subject-less event is not a suppressed event')
})
