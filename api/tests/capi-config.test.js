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

// GOOGLE IS AN OAUTH PLATFORM, NOT A TOKEN PLATFORM.
// It previously took a pasted "developer token" into sites.google_ads_developer_token —
// a credential Google issues once to the software provider, never to an advertiser, so no
// customer could ever supply a working value. Its credential is now the OAuth grant in
// ad_platform_connections, and this surface only chooses the conversion action.
test('buildCapiUpdate: google takes conversion_action_id, writes ad_platform_connections, and REFUSES a token', () => {
  const ok = buildCapiUpdate('google', { conversion_action_id: '987654321' })
  assert.strictEqual(ok.error, undefined)
  assert.strictEqual(ok.external.externalPlatformValue, 'google_ads')
  assert.deepStrictEqual(ok.connectionUpdate, { conversion_action_id: '987654321' })
  // It must NOT produce a `sites` update — that is what would resurrect the dead columns.
  assert.strictEqual(ok.update, undefined)

  assert.strictEqual(buildCapiUpdate('google', {}).error, 'conversion_action_id is required')
  assert.strictEqual(buildCapiUpdate('google', { conversion_action_id: 'abc' }).error, 'conversion_action_id must be numeric')
  // A pasted token is rejected outright rather than quietly ignored — otherwise the old
  // "paste your developer token" habit would appear to succeed and store nothing.
  assert.ok(buildCapiUpdate('google', { conversion_action_id: '1', token: 't' }).error)
})

test('CAPI_PLATFORMS.google is external and declares NO sites columns', () => {
  assert.strictEqual(CAPI_PLATFORMS.google.external, 'ad_platform_connections')
  assert.strictEqual(CAPI_PLATFORMS.google.externalPlatformValue, 'google_ads')
  assert.strictEqual(CAPI_PLATFORMS.google.tokenCol, undefined)
  assert.strictEqual(CAPI_PLATFORMS.google.idCols, undefined)
})

test('buildCapiUpdate: rejects unknown platform and missing token', () => {
  assert.ok(buildCapiUpdate('snapchat', { token: 't' }).error)
  assert.ok(buildCapiUpdate('meta', { pixel_id: 'x' }).error) // no token
})

// Disconnecting CAPI for Google clears ONLY the conversion action. It must never delete
// the connection row or revoke the grant: that same row powers ad-cost import, a separate
// feature the operator did not ask to turn off.
test('buildCapiDisconnect: google clears only conversion_action_id, never the connection', () => {
  const res = buildCapiDisconnect('google')
  assert.strictEqual(res.external.externalPlatformValue, 'google_ads')
  assert.deepStrictEqual(res.connectionUpdate, { conversion_action_id: null })
  assert.strictEqual(res.update, undefined)
  const keys = Object.keys(res.connectionUpdate)
  assert.ok(!keys.includes('encrypted_refresh_token'), 'must not touch the OAuth credential')
  assert.ok(!keys.includes('status'), 'must not change connection status')
})

test('buildCapiDisconnect: token platforms still null token + ids', () => {
  const { update } = buildCapiDisconnect('meta')
  assert.strictEqual(update.meta_capi_token, null)
  assert.strictEqual(update.meta_pixel_id, null)
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

  // LinkedIn is now configurable, so it MUST appear in status — and, having no token in
  // this fixture, must appear as not-connected rather than be omitted. An absent platform
  // and a disconnected one are different states, and only one of them is honest here.
  assert.ok('linkedin' in status, 'linkedin is configurable and must be reported in status')
  assert.strictEqual(status.linkedin.connected, false)

  // Microsoft still has no config surface: its sender is in the fan-out but never
  // transmits its token, so it can never be connected. Surfacing it would offer a card
  // that saves a credential which does nothing.
  assert.ok(!('microsoft' in status), 'microsoft has no config surface yet')
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

// Google's THREE states, pinned. Collapsing "OAuth grant exists" and "forwarding is
// configured" into one boolean is the specific failure this guards: sendGoogleConversion
// no-ops without a conversion action, so a card reading "Connected" on an action-less
// connection would advertise a forwarding path that does not exist.
test('buildCapiStatus: google separates oauth_connected from connected', () => {
  const none = buildCapiStatus({}, [], [])
  assert.strictEqual(none.google.connected, false)
  assert.strictEqual(none.google.oauth_connected, false)
  assert.strictEqual(none.google.connection_status, null)

  const oauthOnly = buildCapiStatus({}, [], [
    { platform: 'google_ads', status: 'connected', account_id: '123-456-7890', conversion_action_id: null }
  ])
  assert.strictEqual(oauthOnly.google.oauth_connected, true, 'grant exists')
  assert.strictEqual(oauthOnly.google.connected, false, 'but NOT forwarding without an action id')
  assert.strictEqual(oauthOnly.google.customer_id, '123-456-7890')

  const forwarding = buildCapiStatus({}, [], [
    { platform: 'google_ads', status: 'connected', account_id: '123', conversion_action_id: '987' }
  ])
  assert.strictEqual(forwarding.google.connected, true)
  assert.strictEqual(forwarding.google.conversion_action_id, '987')

  // A non-connected grant (revoked / errored / awaiting account) is never forwarding.
  for (const st of ['needs_account', 'needs_reconnect', 'error']) {
    const row = buildCapiStatus({}, [], [
      { platform: 'google_ads', status: st, account_id: '123', conversion_action_id: '987' }
    ])
    assert.strictEqual(row.google.connected, false, `status=${st} must not be connected`)
    assert.strictEqual(row.google.oauth_connected, false, `status=${st} must not be oauth_connected`)
  }
})

// The connection row carries the encrypted OAuth refresh token and is keyed by site_key.
// Neither may reach the response (§6.5) — status is rendered in the browser.
test('buildCapiStatus: never leaks the refresh token or site_key from a connection row', () => {
  const status = buildCapiStatus({}, [], [{
    platform: 'google_ads', status: 'connected', account_id: '123', conversion_action_id: '9',
    encrypted_refresh_token: 'ENCRYPTED_REFRESH', site_key: 'st_live_secret', login_customer_id: '555'
  }])
  const json = JSON.stringify(status)
  assert.ok(!json.includes('ENCRYPTED_REFRESH'), 'refresh token must never appear in status')
  assert.ok(!json.includes('st_live_secret'), 'site_key must never appear in status')
})

test('plan-gate: free is rejected, starter+ allowed for capi_server_side', () => {
  assert.ok(requireFeature('free', 'capi_server_side', 'x'))      // returns a 402 block
  assert.strictEqual(requireFeature('starter', 'capi_server_side', 'x'), null)
  assert.strictEqual(requireFeature('growth', 'capi_server_side', 'x'), null)
})

// History of this list: ['google','meta'] -> +ga4,+tiktok (#498) -> +linkedin (here).
// A platform belongs in CAPI_PLATFORMS only once its columns, config card AND
// forwarding wiring all exist. This assertion is the gate that enforces it, and it is
// exact (deepStrictEqual on the sorted keys) rather than a contains-check, so adding a
// platform anywhere without deciding it here fails loudly instead of silently.
test('CAPI_PLATFORMS: exactly the 5 live platforms (linkedin added, microsoft still out)', () => {
  assert.deepStrictEqual(Object.keys(CAPI_PLATFORMS).sort(), ['ga4', 'google', 'linkedin', 'meta', 'tiktok'])
})

// LinkedIn's credential SHAPE, pinned. Its sender reads exactly these two columns, so a
// rename on either side silently reverts LinkedIn to a permanent no-op (the sender
// returns null when either is falsy) — with no error and no delivery row to notice.
test('CAPI_PLATFORMS.linkedin maps to the two columns sendLinkedInConversion actually reads', () => {
  assert.strictEqual(CAPI_PLATFORMS.linkedin.tokenCol, 'linkedin_capi_token')
  assert.deepStrictEqual(CAPI_PLATFORMS.linkedin.idCols, { partner_id: 'linkedin_partner_id' })
})

test('buildCapiUpdate: linkedin encrypts the token and requires partner_id', () => {
  const ok = buildCapiUpdate('linkedin', { token: 'li-tok', partner_id: '123456' })
  assert.strictEqual(ok.error, undefined)
  assert.strictEqual(ok.update.linkedin_partner_id, '123456')
  // Never stored raw — the whole point of encrypt-on-write.
  assert.notStrictEqual(ok.update.linkedin_capi_token, 'li-tok')
  assert.ok(ok.update.linkedin_capi_token.length > 0)

  assert.strictEqual(buildCapiUpdate('linkedin', { token: 'li-tok' }).error, 'partner_id is required')
  assert.strictEqual(buildCapiUpdate('linkedin', { partner_id: '1' }).error, 'token is required')
})

test('buildCapiDisconnect: linkedin nulls BOTH columns, not just the token', () => {
  // Clearing only the token would leave partner_id set, which reads as "half connected"
  // in status and leaves a stale identifier behind after an explicit disconnect.
  assert.deepStrictEqual(buildCapiDisconnect('linkedin').update, {
    linkedin_capi_token: null,
    linkedin_partner_id: null
  })
})

// Microsoft stays OUT, and this asserts the reason rather than just the absence:
// sendMicrosoftConversion posts to the UET tracking endpoint with Content-Type as its
// only header and never transmits microsoft_capi_token. A config card would save a
// credential that does nothing. If someone finishes that sender (OAuth2 against the
// Microsoft Advertising API, which needs a different column shape), this test is the
// thing that should be updated deliberately — not quietly deleted to make a card work.
test('microsoft is NOT configurable while its sender never transmits the token', () => {
  assert.strictEqual(CAPI_PLATFORMS.microsoft, undefined)
  assert.strictEqual(buildCapiUpdate('microsoft', { token: 't', tag_id: 'x' }).error, 'Unknown platform')
})

// ── UI/config drift guard ─────────────────────────────────────────────────────────────
// The #498 lesson, made mechanical. GA4 and TikTok were added to CAPI_PLATFORMS and to the
// fan-out but NOT to CapiDeliveryStatus.jsx's chips, so two live platforms silently had no
// filter and rendered their raw key as a label for a whole release. Nothing failed, because
// the label lookup has a `|| r.platform` fallback — the drift was invisible by construction.
//
// These read the real JSX as source (node --test cannot import JSX) and assert every
// configurable platform is represented in both customer-facing surfaces. Adding a platform
// to CAPI_PLATFORMS without touching the UI now fails here.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __capiDir = dirname(fileURLToPath(import.meta.url))
const readDash = (f) => readFileSync(join(__capiDir, '..', '..', 'dashboard', 'src', 'components', f), 'utf8')

test('every configurable platform has a CapiSettings card', () => {
  const src = readDash('CapiSettings.jsx')
  for (const key of Object.keys(CAPI_PLATFORMS)) {
    assert.ok(
      new RegExp(`key:\\s*'${key}'`).test(src),
      `CAPI_PLATFORMS has '${key}' but CapiSettings.jsx has no card for it — a customer cannot supply its credentials`
    )
  }
})

test('every configurable platform has a CapiDeliveryStatus chip AND a label', () => {
  const src = readDash('CapiDeliveryStatus.jsx')
  for (const key of Object.keys(CAPI_PLATFORMS)) {
    assert.ok(
      new RegExp(`key:\\s*'${key}'`).test(src),
      `CAPI_PLATFORMS has '${key}' but CapiDeliveryStatus.jsx has no filter chip for it`
    )
    assert.ok(
      new RegExp(`\\b${key}:\\s*'`).test(src),
      `'${key}' has no PLATFORM_LABEL entry — it would render as the raw key in the delivery table`
    )
  }
})

test('the delivery UI does NOT advertise microsoft, which can never produce a row', () => {
  // A chip for a platform no site can configure filters to permanently empty, which reads
  // as "connected, quiet" instead of "not available".
  const src = readDash('CapiDeliveryStatus.jsx')
  assert.ok(!/key:\s*'microsoft'/.test(src), 'microsoft must not have a filter chip while it is unconfigurable')
})
