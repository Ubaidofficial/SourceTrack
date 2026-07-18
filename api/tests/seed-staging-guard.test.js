// Guards the STAGING-ONLY seed scripts against writing fixtures into a PROD Tinybird workspace.
// The old assertStaging() gated on POSTHOG_PROJECT_ID===469905 (DEAD post-D3) and a hardcoded
// SITE_ID.startsWith('de200000') that is always true — neither checked the real write target
// (TINYBIRD_HOST/token, where dualWriteEvent sends). These tests pin the replacement. TOKEN-FREE.

import test from 'node:test'
import assert from 'node:assert/strict'

const { assertStagingSeedTarget, assertStagingWorkspaceLive, STAGING_TINYBIRD_HOSTS } = await import('../../scripts/lib/staging-seed-guard.mjs')

const STAGING_HOST = STAGING_TINYBIRD_HOSTS[0]
const STAGING_SITE = 'de200000-babe-41d4-a716-446655441111'

// ── GATE 1: the pure host+flag+site guard ────────────────────────────────────

test('accepts a staging host + de200000 site + explicit staging flag', () => {
  const r = assertStagingSeedTarget({ host: STAGING_HOST, siteId: STAGING_SITE, targetingStaging: true })
  assert.equal(r.ok, true)
})

test('🔴 NEGATIVE PROOF: a PROD-shaped TINYBIRD_HOST is REJECTED even when every other condition passes', () => {
  // Flag set, de200000 fixture site — the ONLY thing wrong is a prod-shaped (non-staging) host.
  const r = assertStagingSeedTarget({
    host: 'https://api.us-east.aws.tinybird.co', // different region == prod-shaped, not the ST_Staging host
    siteId: STAGING_SITE,
    targetingStaging: true
  })
  assert.equal(r.ok, false, 'a host off the ST_Staging allowlist must be refused')
  assert.match(r.reason, /prod-shaped host is rejected/)
})

test('rejects when --i-am-targeting-staging is absent (no implicit staging assumption)', () => {
  const r = assertStagingSeedTarget({ host: STAGING_HOST, siteId: STAGING_SITE, targetingStaging: false })
  assert.equal(r.ok, false)
  assert.match(r.reason, /--i-am-targeting-staging/)
})

test('rejects a non-de200000 site even with the flag + staging host', () => {
  const r = assertStagingSeedTarget({ host: STAGING_HOST, siteId: 'techrupt-prod-site', targetingStaging: true })
  assert.equal(r.ok, false)
  assert.match(r.reason, /de200000/)
})

test('rejects an unset host', () => {
  const r = assertStagingSeedTarget({ host: '', siteId: STAGING_SITE, targetingStaging: true })
  assert.equal(r.ok, false)
  assert.match(r.reason, /TINYBIRD_HOST is not set/)
})

test('host match is trailing-slash / case tolerant', () => {
  const r = assertStagingSeedTarget({ host: STAGING_HOST.toUpperCase() + '/', siteId: STAGING_SITE, targetingStaging: true })
  assert.equal(r.ok, true)
})

// ── GATE 2: the live fixture-presence probe (the real workspace-identity check) ───────────────

const mockFetch = (payload, okStatus = true, status = 200) => async () => ({
  ok: okStatus, status, json: async () => payload
})

test('LIVE: a workspace HOLDING the de200000 fixture is accepted (staging)', async () => {
  const r = await assertStagingWorkspaceLive({
    host: STAGING_HOST, readToken: 'tok', siteId: STAGING_SITE, fetchImpl: mockFetch({ data: [{ c: 117 }] })
  })
  assert.equal(r.ok, true)
  assert.equal(r.count, 117)
})

test('🔴 LIVE: a workspace with 0 de200000 events is REJECTED (prod SourceTrack has no such site)', async () => {
  const r = await assertStagingWorkspaceLive({
    host: STAGING_HOST, readToken: 'tok', siteId: STAGING_SITE, fetchImpl: mockFetch({ data: [{ c: 0 }] })
  })
  assert.equal(r.ok, false)
  assert.match(r.reason, /NOT ST_Staging/)
})

test('LIVE: fails closed when the probe cannot verify (missing token)', async () => {
  const r = await assertStagingWorkspaceLive({ host: STAGING_HOST, readToken: '', siteId: STAGING_SITE })
  assert.equal(r.ok, false)
  assert.match(r.reason, /fail-closed/)
})

test('LIVE: fails closed on a non-2xx probe response', async () => {
  const r = await assertStagingWorkspaceLive({
    host: STAGING_HOST, readToken: 'tok', siteId: STAGING_SITE, fetchImpl: mockFetch({}, false, 403)
  })
  assert.equal(r.ok, false)
  assert.match(r.reason, /HTTP 403/)
})
