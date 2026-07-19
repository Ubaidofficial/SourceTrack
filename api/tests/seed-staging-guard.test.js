// Guards the STAGING-ONLY seed scripts against writing fixtures into a PROD Tinybird workspace. Both
// staging and prod are reachable at https://api.tinybird.co (Tinybird routes by TOKEN, not host), so the
// guard decodes the append token's workspace UUID and refuses anything but ST_Staging. TOKEN-FREE: the
// tokens below are SYNTHETIC (structurally valid, no secrets) — `p.<base64url {"u": <workspace>}>`.

import test from 'node:test'
import assert from 'node:assert/strict'

const { assertStagingSeedTarget, assertStagingWorkspaceLive, decodeTinybirdWorkspaceId, STAGING_WORKSPACE_ID } = await import('../../scripts/lib/staging-seed-guard.mjs')

const STAGING_SITE = 'de200000-babe-41d4-a716-446655441111'
const PROD_WORKSPACE_ID = '3c371bb9-2021-429c-b0d7-0758bff75f9d' // SourceTrack (prod) — must be REFUSED
const HOST = 'https://api.tinybird.co'

// Build a synthetic Tinybird token: p.<base64url payload>. Not a secret — a structural fixture.
const makeToken = (payload) => 'p.' + Buffer.from(JSON.stringify(payload)).toString('base64url')
const STAGING_TOKEN = makeToken({ u: STAGING_WORKSPACE_ID, scope: 'DATASOURCE:APPEND', name: 'append' })
const PROD_TOKEN = makeToken({ u: PROD_WORKSPACE_ID, scope: 'DATASOURCE:APPEND' })

// ── decode ────────────────────────────────────────────────────────────────────────────────────────
test('decodeTinybirdWorkspaceId extracts "u" from p.<payload>; JWT-shaped too', () => {
  assert.equal(decodeTinybirdWorkspaceId(STAGING_TOKEN), STAGING_WORKSPACE_ID)
  assert.equal(decodeTinybirdWorkspaceId('h.' + Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ u: STAGING_WORKSPACE_ID })).toString('base64url')), STAGING_WORKSPACE_ID)
})

test('decodeTinybirdWorkspaceId fails closed (null) on garbage / no-"u" / empty', () => {
  assert.equal(decodeTinybirdWorkspaceId('not-a-token'), null)
  assert.equal(decodeTinybirdWorkspaceId('p.' + Buffer.from(JSON.stringify({ name: 'x' })).toString('base64url')), null)
  assert.equal(decodeTinybirdWorkspaceId(''), null)
  assert.equal(decodeTinybirdWorkspaceId(undefined), null)
})

// ── GATE 1: the pure workspace + flag + site guard ──────────────────────────────────────────────────
test('a staging-workspace token + de200000 site + explicit flag → proceeds', () => {
  const r = assertStagingSeedTarget({ appendToken: STAGING_TOKEN, siteId: STAGING_SITE, targetingStaging: true })
  assert.equal(r.ok, true)
  assert.equal(r.workspaceId, STAGING_WORKSPACE_ID)
})

test('🔴 a PROD-workspace token is REFUSED even when every other condition passes', () => {
  const r = assertStagingSeedTarget({ appendToken: PROD_TOKEN, siteId: STAGING_SITE, targetingStaging: true })
  assert.equal(r.ok, false, 'a prod-workspace token must be refused')
  assert.match(r.reason, new RegExp(PROD_WORKSPACE_ID))
  assert.match(r.reason, /not ST_Staging/)
})

test('🔴 a MALFORMED / undecodable token is REFUSED (fail-closed) with the flag + site valid', () => {
  for (const tok of ['garbage-token', 'p.' + Buffer.from('{not json}').toString('base64url'), 'p.' + Buffer.from(JSON.stringify({ name: 'no-u' })).toString('base64url'), '']) {
    const r = assertStagingSeedTarget({ appendToken: tok, siteId: STAGING_SITE, targetingStaging: true })
    assert.equal(r.ok, false, `undecodable token must be refused: ${JSON.stringify(tok)}`)
    assert.match(r.reason, /fail-closed|could not decode/)
  }
})

test('rejects when --i-am-targeting-staging is absent (no implicit staging assumption)', () => {
  const r = assertStagingSeedTarget({ appendToken: STAGING_TOKEN, siteId: STAGING_SITE, targetingStaging: false })
  assert.equal(r.ok, false)
  assert.match(r.reason, /--i-am-targeting-staging/)
})

test('rejects a non-de200000 site even with a staging token + flag', () => {
  const r = assertStagingSeedTarget({ appendToken: STAGING_TOKEN, siteId: 'techrupt-prod-site', targetingStaging: true })
  assert.equal(r.ok, false)
  assert.match(r.reason, /de200000/)
})

test('the reason never leaks the token value', () => {
  const r = assertStagingSeedTarget({ appendToken: PROD_TOKEN, siteId: STAGING_SITE, targetingStaging: true })
  assert.equal(r.reason.includes(PROD_TOKEN), false, 'refusal reason must reference the workspace id, never the token')
})

// ── GATE 2: the live fixture-presence probe (belt on the read token) ─────────────────────────────────
const mockFetch = (payload, okStatus = true, status = 200) => async () => ({ ok: okStatus, status, json: async () => payload })

test('LIVE: a workspace HOLDING the de200000 fixture is accepted (staging)', async () => {
  const r = await assertStagingWorkspaceLive({ host: HOST, readToken: 'tok', siteId: STAGING_SITE, fetchImpl: mockFetch({ data: [{ c: 159 }] }) })
  assert.equal(r.ok, true)
  assert.equal(r.count, 159)
})

test('🔴 LIVE: a workspace with 0 de200000 events is REJECTED (prod SourceTrack has no such site)', async () => {
  const r = await assertStagingWorkspaceLive({ host: HOST, readToken: 'tok', siteId: STAGING_SITE, fetchImpl: mockFetch({ data: [{ c: 0 }] }) })
  assert.equal(r.ok, false)
  assert.match(r.reason, /NOT ST_Staging/)
})

test('LIVE: fails closed when the probe cannot verify (missing token) / on a non-2xx', async () => {
  assert.equal((await assertStagingWorkspaceLive({ host: HOST, readToken: '', siteId: STAGING_SITE })).ok, false)
  assert.equal((await assertStagingWorkspaceLive({ host: HOST, readToken: 'tok', siteId: STAGING_SITE, fetchImpl: mockFetch({}, false, 403) })).ok, false)
})
