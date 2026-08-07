// Guards the STAGING-ONLY seed scripts against writing fixtures into a PROD Tinybird workspace. Both
// staging and prod are reachable at https://api.tinybird.co (Tinybird routes by TOKEN, not host), so the
// guard decodes the append token's workspace UUID and refuses anything but ST_Staging. TOKEN-FREE: the
// tokens below are SYNTHETIC (structurally valid, no secrets) — `p.<base64url {"u": <workspace>}>`.

import test from 'node:test'
import assert from 'node:assert/strict'

const { assertStagingSeedTarget, assertStagingWorkspaceLive, decodeTinybirdWorkspaceId, STAGING_WORKSPACE_ID, isAllowedStagingSiteId, STAGING_SITE_IDS } = await import('../../scripts/lib/staging-seed-guard.mjs')

const STAGING_SITE = 'de200000-babe-41d4-a716-446655441111'
const DEMO_ECOM_SITE = '40ae22f2-1ec4-4653-a6cd-c1e116848a60' // allowlisted staging site, NOT de200000
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

test('rejects a site that is neither an allowlisted id nor an allowed prefix', () => {
  const r = assertStagingSeedTarget({ appendToken: STAGING_TOKEN, siteId: 'techrupt-prod-site', targetingStaging: true })
  assert.equal(r.ok, false)
  assert.match(r.reason, /not an allowed staging seed target/)
})

// ── allowlist: the widened case, and the boundary that must NOT widen with it ───────────────────────
// The guard used to hardcode `startsWith('de200000')`, so a legitimate staging site was refused and the
// practical response was to route around the guard entirely (ingest_ndjson_to_tinybird.mjs had none).
// These pin that the widening is exactly one site, not a loosening.
test('an allowlisted NON-de200000 staging site passes with a staging token + flag', () => {
  const r = assertStagingSeedTarget({ appendToken: STAGING_TOKEN, siteId: DEMO_ECOM_SITE, targetingStaging: true })
  assert.equal(r.ok, true, 'Demo Ecommerce must be an allowed staging seed target')
  assert.equal(r.workspaceId, STAGING_WORKSPACE_ID)
})

test('🔴 the allowlisted site is STILL refused with a PROD token — widening sites must not widen workspaces', () => {
  const r = assertStagingSeedTarget({ appendToken: PROD_TOKEN, siteId: DEMO_ECOM_SITE, targetingStaging: true })
  assert.equal(r.ok, false, 'the workspace check is what prevents a prod write and must be unaffected')
  assert.match(r.reason, /not ST_Staging/)
})

test('🔴 the allowlisted site is STILL refused without the explicit staging flag', () => {
  const r = assertStagingSeedTarget({ appendToken: STAGING_TOKEN, siteId: DEMO_ECOM_SITE, targetingStaging: false })
  assert.equal(r.ok, false)
  assert.match(r.reason, /--i-am-targeting-staging/)
})

test('🔴 the allowlist is exact — near-miss ids and empty values are refused', () => {
  for (const bad of [
    '40ae22f2-1ec4-4653-a6cd-c1e116848a61', // one character off
    '40ae22f2',                             // prefix of an allowlisted id is NOT enough
    'de20000',                              // one char short of the allowed prefix
    '',
    undefined
  ]) {
    assert.equal(isAllowedStagingSiteId(bad), false, `must refuse ${JSON.stringify(bad)}`)
  }
  assert.equal(STAGING_SITE_IDS.size, 1, 'allowlist grew — every addition needs its own review')
})

test('the reason never leaks the token value', () => {
  const r = assertStagingSeedTarget({ appendToken: PROD_TOKEN, siteId: STAGING_SITE, targetingStaging: true })
  assert.equal(r.reason.includes(PROD_TOKEN), false, 'refusal reason must reference the workspace id, never the token')
})

// ── GATE 2: the live fixture-presence probe (belt on the read token) ─────────────────────────────────
const mockFetch = (payload, okStatus = true, status = 200) => async () => ({ ok: okStatus, status, json: async () => payload })

test('LIVE: a workspace HOLDING the de200000 fixture is accepted (staging)', async () => {
  const r = await assertStagingWorkspaceLive({ host: HOST, readToken: 'tok', fetchImpl: mockFetch({ data: [{ c: 159 }] }) })
  assert.equal(r.ok, true)
  assert.equal(r.count, 159)
})

test('🔴 LIVE: a workspace with 0 de200000 events is REJECTED (prod SourceTrack has no such site)', async () => {
  const r = await assertStagingWorkspaceLive({ host: HOST, readToken: 'tok', fetchImpl: mockFetch({ data: [{ c: 0 }] }) })
  assert.equal(r.ok, false)
  assert.match(r.reason, /NOT ST_Staging/)
})

test('LIVE: fails closed when the probe cannot verify (missing token) / on a non-2xx', async () => {
  assert.equal((await assertStagingWorkspaceLive({ host: HOST, readToken: '' })).ok, false)
  assert.equal((await assertStagingWorkspaceLive({ host: HOST, readToken: 'tok', fetchImpl: mockFetch({}, false, 403) })).ok, false)
})

// ── THE PROPERTY THAT ACTUALLY UNBLOCKS AN EMPTY SITE ───────────────────────────────────────────────
// The probe used to take the seed target and require IT to already have rows — which conflated "is this
// the staging workspace" with "does this site have data". Seeding an empty site is exactly the case
// where those diverge, so the guard refused a correct target. These pin that the probe now asks the
// workspace question only, and never looks at the site being seeded.
test('LIVE: the probe queries the de200000 fixture family, NOT the site being seeded', async () => {
  let capturedUrl = null
  const spy = async (url) => { capturedUrl = url; return { ok: true, status: 200, json: async () => ({ data: [{ c: 159 }] }) } }
  const r = await assertStagingWorkspaceLive({ host: HOST, readToken: 'tok', fetchImpl: spy })
  assert.equal(r.ok, true)
  const decoded = decodeURIComponent(capturedUrl)
  assert.match(decoded, /LIKE 'de200000%'/, 'probe must ask the workspace-identifying question')
  assert.equal(decoded.includes(DEMO_ECOM_SITE), false, 'probe must not reference the seed target at all')
})

test('LIVE: an EMPTY seed target does not affect the verdict — staging is still staging', async () => {
  // The workspace holds the fixture (staging), while Demo Ecommerce itself has zero rows. Under the old
  // site-coupled probe this combination was a refusal; it must now pass.
  const r = await assertStagingWorkspaceLive({ host: HOST, readToken: 'tok', fetchImpl: mockFetch({ data: [{ c: 159 }] }) })
  assert.equal(r.ok, true, 'an empty seed target must not make a staging workspace look like prod')
})
