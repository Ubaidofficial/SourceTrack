// #623 — /api/integrations/ad-platforms/status reported `connected: true` for ANY row that
// existed, ignoring the row's own status. The OAuth callback deliberately creates the row
// half-finished (status 'needs_account', account_id still null), so row-presence and
// usability are different facts and collapsing them was a live dead-end:
//
//   needs_account row -> connected:true -> Campaigns.jsx anyConnected -> "Sync connected
//   accounts" button renders -> POST /google/sync 400s on `!conn.account_id`.
//
// The only reachable path into 'needs_account' today is the CAPI card's Connect Google Ads
// button, itself gated on Google OAuth env being set. That env is about to be configured, so
// this test pins the fix BEFORE the state becomes commonly reachable rather than after.
//
// capi.js:buildCapiStatus already gets this right for the same table
// (`const oauthConnected = row?.status === 'connected'`); these assertions hold
// ad-platforms.js to the same rule so the two cannot drift apart again.

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdPlatformStatusMap } from '../routes/ad-platforms.js'

const ROW = (over = {}) => ({
  platform: 'google_ads',
  status: 'connected',
  account_id: '1234567890',
  account_name: 'Acme Ads',
  last_synced_at: '2026-08-04T00:00:00.000Z',
  last_error_message: null,
  ...over
})

test('no connections: both platforms not_configured and not connected', () => {
  const m = buildAdPlatformStatusMap([], true)
  assert.equal(m.google_ads.connected, false)
  assert.equal(m.google_ads.status, 'not_configured')
  assert.equal(m.meta_ads.connected, false)
  assert.equal(m.meta_ads.status, 'not_configured')
})

test('null connections (no rows returned) does not throw', () => {
  const m = buildAdPlatformStatusMap(null, false)
  assert.equal(m.google_ads.connected, false)
  assert.equal(m.meta_ads.connected, false)
})

// THE REGRESSION. This is the exact row the OAuth callback writes.
test('#623: a needs_account row is NOT reported as connected', () => {
  const m = buildAdPlatformStatusMap([ROW({ status: 'needs_account', account_id: null })], true)
  assert.equal(m.google_ads.connected, false, 'needs_account must never report connected:true')
  assert.equal(m.google_ads.status, 'needs_account', 'the real status is still surfaced')
  assert.equal(m.google_ads.account_id, null)
})

// Campaigns.jsx:319 reads `connected === true || status === 'connected'`. Both halves must
// agree, or the || silently resurrects the dead-end through the second operand.
test('#623: neither operand of the Campaigns.jsx check passes for a half-finished row', () => {
  const g = buildAdPlatformStatusMap([ROW({ status: 'needs_account', account_id: null })], true).google_ads
  assert.equal(g.connected === true || g.status === 'connected', false)
})

test('a genuinely connected row still reports connected:true', () => {
  const m = buildAdPlatformStatusMap([ROW()], true)
  assert.equal(m.google_ads.connected, true)
  assert.equal(m.google_ads.status, 'connected')
  assert.equal(m.google_ads.account_id, '1234567890')
  assert.equal(m.google_ads.last_synced_at, '2026-08-04T00:00:00.000Z')
})

// error / needs_reconnect are both post-sync failure states. They are UNREACHABLE today
// (reaching them requires account_id, which requires POST /google/save-account, which has
// zero dashboard callers — see #624), so hiding the Sync button for them changes nothing a
// customer can currently observe. Pinned deliberately: when the connect UI ships, whoever
// builds it should decide consciously whether a retry affordance belongs in these states
// rather than inheriting the answer from a flag that never modelled them.
for (const status of ['error', 'needs_reconnect']) {
  test(`a ${status} row is not reported as connected`, () => {
    const m = buildAdPlatformStatusMap([ROW({ status, last_error_message: 'revoked_token' })], true)
    assert.equal(m.google_ads.connected, false)
    assert.equal(m.google_ads.status, status)
    assert.equal(m.google_ads.last_error_message, 'revoked_token')
  })
}

test('meta_ads is evaluated independently of google_ads', () => {
  const m = buildAdPlatformStatusMap([
    ROW({ platform: 'google_ads', status: 'needs_account', account_id: null }),
    ROW({ platform: 'meta_ads', status: 'connected', account_name: 'Meta Ad Account' })
  ], true)
  assert.equal(m.google_ads.connected, false)
  assert.equal(m.meta_ads.connected, true)
  assert.equal(m.meta_ads.account_name, 'Meta Ad Account')
})

test('env_configured is reported for google_ads only, and tracks the flag', () => {
  assert.equal(buildAdPlatformStatusMap([], false).google_ads.env_configured, false)
  assert.equal(buildAdPlatformStatusMap([], true).google_ads.env_configured, true)
  assert.equal(buildAdPlatformStatusMap([ROW()], true).google_ads.env_configured, true)
  assert.equal(buildAdPlatformStatusMap([ROW({ platform: 'meta_ads' })], true).meta_ads.env_configured, undefined)
})

// An unknown platform value must not add a key. Campaigns.jsx and ReportBuilder.jsx both
// read fixed keys, so a stray row should be ignored rather than shaping the response.
test('an unrecognized platform row is ignored, not added to the map', () => {
  const m = buildAdPlatformStatusMap([ROW({ platform: 'linkedin_ads' })], true)
  assert.deepEqual(Object.keys(m).sort(), ['google_ads', 'meta_ads'])
})

// §6.5 — site_key is the customer-facing tracking key and must never reach a response body.
test('no site_key is ever placed on the status map', () => {
  const m = buildAdPlatformStatusMap([{ ...ROW(), site_key: 'st_live_SHOULD_NOT_LEAK' }], true)
  assert.equal(JSON.stringify(m).includes('SHOULD_NOT_LEAK'), false)
  assert.equal('site_key' in m.google_ads, false)
})
