process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64)

import test from 'node:test'
import assert from 'node:assert'
import { buildCapiUpdate, buildCapiDisconnect, buildCapiStatus, CAPI_PLATFORMS } from '../routes/capi.js'
import { requireFeature } from '../lib/plan-features.js'
import { decryptSecret } from '../lib/utils.js'

test('buildCapiUpdate: token is ENCRYPTED on write (never stored plaintext)', () => {
  const { update, error } = buildCapiUpdate('meta', { token: 'EAAreal-token', pixel_id: '12345' })
  assert.strictEqual(error, undefined)
  assert.strictEqual(update.meta_pixel_id, '12345')
  assert.notStrictEqual(update.meta_capi_token, 'EAAreal-token')          // not plaintext
  assert.strictEqual(decryptSecret(update.meta_capi_token), 'EAAreal-token') // round-trips
})

test('buildCapiUpdate: google requires customer_id + conversion_action_id', () => {
  assert.ok(buildCapiUpdate('google', { token: 't' }).error)
  const ok = buildCapiUpdate('google', { token: 't', customer_id: 'c1', conversion_action_id: 'a1' })
  assert.strictEqual(ok.update.google_ads_customer_id, 'c1')
  assert.strictEqual(ok.update.google_ads_conversion_action_id, 'a1')
  assert.strictEqual(decryptSecret(ok.update.google_ads_developer_token), 't')
})

test('buildCapiUpdate: rejects unknown platform and missing token', () => {
  assert.ok(buildCapiUpdate('snapchat', { token: 't' }).error)
  assert.ok(buildCapiUpdate('meta', { pixel_id: 'x' }).error) // no token
})

test('buildCapiDisconnect: nulls token + ids', () => {
  const { update } = buildCapiDisconnect('google')
  assert.strictEqual(update.google_ads_developer_token, null)
  assert.strictEqual(update.google_ads_customer_id, null)
  assert.strictEqual(update.google_ads_conversion_action_id, null)
})

test('buildCapiStatus: NEVER returns a token; reports connected + last delivery', () => {
  const siteRow = {
    meta_capi_token: 'ENCRYPTED', meta_pixel_id: 'px1',
    google_ads_developer_token: null, google_ads_customer_id: null, google_ads_conversion_action_id: null
  }
  const deliveries = [
    { platform: 'meta', status: 'success', created_at: '2026-06-28T10:00:00Z' }, // latest (desc)
    { platform: 'meta', status: 'failed', created_at: '2026-06-27T10:00:00Z' }
  ]
  const status = buildCapiStatus(siteRow, deliveries)
  const json = JSON.stringify(status)
  assert.ok(!json.includes('ENCRYPTED'), 'token must never appear in status')
  assert.ok(Object.values(status).every(p => !('token' in p) && !('meta_capi_token' in p)))

  assert.strictEqual(status.meta.connected, true)
  assert.strictEqual(status.meta.pixel_id, 'px1')
  assert.deepStrictEqual(status.meta.last_delivery, { status: 'success', at: '2026-06-28T10:00:00Z' })
  assert.strictEqual(status.google.connected, false)        // missing token + ids
  assert.strictEqual(status.google.last_delivery, null)     // no deliveries yet
  assert.ok(!('tiktok' in status), 'tiktok is not part of this release')
})

test('plan-gate: free is rejected, starter+ allowed for capi_server_side', () => {
  assert.ok(requireFeature('free', 'capi_server_side', 'x'))      // returns a 402 block
  assert.strictEqual(requireFeature('starter', 'capi_server_side', 'x'), null)
  assert.strictEqual(requireFeature('growth', 'capi_server_side', 'x'), null)
})

test('CAPI_PLATFORMS: exactly the 2 live platforms (TikTok deferred)', () => {
  assert.deepStrictEqual(Object.keys(CAPI_PLATFORMS).sort(), ['google', 'meta'])
})
