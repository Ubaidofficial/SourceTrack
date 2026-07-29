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

  // Microsoft + LinkedIn have senders in the fan-out but NO config columns here,
  // so they must stay out of status — surfacing them would offer a card that can
  // never store a token (KNOWN_ISSUES "Dead CAPI senders"). Not fixed by this PR.
  assert.ok(!('microsoft' in status), 'microsoft has no config surface yet')
  assert.ok(!('linkedin' in status), 'linkedin has no config surface yet')
})

test('buildCapiUpdate/Status: ga4 + tiktok round-trip their own columns', () => {
  const ga4 = buildCapiUpdate('ga4', { token: 'secret-api-key', measurement_id: 'G-ABC123' })
  assert.strictEqual(ga4.update.ga4_measurement_id, 'G-ABC123')
  assert.notStrictEqual(ga4.update.ga4_api_secret, 'secret-api-key')            // not plaintext
  assert.strictEqual(decryptSecret(ga4.update.ga4_api_secret), 'secret-api-key') // round-trips

  const tt = buildCapiUpdate('tiktok', { token: 'tt-access-token', pixel_code: 'CXXXXXXX' })
  assert.strictEqual(tt.update.tiktok_pixel_code, 'CXXXXXXX')
  assert.strictEqual(decryptSecret(tt.update.tiktok_capi_token), 'tt-access-token')

  // Both require their id field, same as google's two-id contract.
  assert.ok(buildCapiUpdate('ga4', { token: 't' }).error)
  assert.ok(buildCapiUpdate('tiktok', { token: 't' }).error)

  // Status must never leak either secret.
  const json = JSON.stringify(buildCapiStatus({
    ga4_api_secret: 'ENC1', ga4_measurement_id: 'G-ABC123',
    tiktok_capi_token: 'ENC2', tiktok_pixel_code: 'CXXXXXXX'
  }, []))
  assert.ok(!json.includes('ENC1') && !json.includes('ENC2'), 'secrets must never appear in status')
})

test('plan-gate: free is rejected, starter+ allowed for capi_server_side', () => {
  assert.ok(requireFeature('free', 'capi_server_side', 'x'))      // returns a 402 block
  assert.strictEqual(requireFeature('starter', 'capi_server_side', 'x'), null)
  assert.strictEqual(requireFeature('growth', 'capi_server_side', 'x'), null)
})

// Was ['google','meta'] while TikTok was deferred. That deferral is reversed by
// this PR: GA4 + TikTok now have columns, config cards AND forwarding wiring, so
// they belong here. Microsoft/LinkedIn deliberately still do NOT — they remain
// stillborn senders until separately finished.
test('CAPI_PLATFORMS: exactly the 4 live platforms (microsoft/linkedin still unwired)', () => {
  assert.deepStrictEqual(Object.keys(CAPI_PLATFORMS).sort(), ['ga4', 'google', 'meta', 'tiktok'])
})
