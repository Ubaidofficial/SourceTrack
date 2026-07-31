// END-TO-END: a key minted from the DASHBOARD'S OWN scope list authenticates against the
// real MCP tools.
//
// ── What this proves that the sync test does not ─────────────────────────────────────
// api/tests/api-token-scopes-sync.test.js proves two arrays match. Matching arrays are not
// a working credential — the thing that was silently broken is the whole chain, so this
// file walks the whole chain with nothing mocked between the ends:
//
//   dashboard/src/lib/apiTokenScopes.js  (the checkbox list — the scope literally comes
//                                         from the array the modal renders)
//        -> POST /api/integrations/api-keys   (the REAL mint route: real crypto.randomBytes
//                                              token, real sha256, real scope validation)
//        -> the raw token, recovered the way a customer copies it out of the modal
//        -> mcp/lib/tools.js handleGetWorkspaceContext / handleGetLeadsVolume  (the REAL
//           MCP tool handlers, which build the URL and set the Authorization header)
//        -> a REAL HTTP request over a real socket
//        -> the REAL /api/diagnostics router + requireApiKeyScope guard
//        -> 200, and the MCP tool's own { ok: true } contract
//
// Only Supabase and Tinybird are stubbed, and Supabase is stubbed as a genuine key STORE:
// the mint route's insert is what populates it and the guard's lookup is by sha256 of the
// returned token. Nothing hands the guard a key it did not have to hash. If the mint route
// and the guard ever disagreed about hashing, prefixing, or the shape of `scopes`, every
// test below would 401 rather than pass.
//
// ── The failure it exists to catch ───────────────────────────────────────────────────
// Before this fix the modal could not offer read:diagnostics or read:volume at all, so a
// customer could not mint a credential for ANY of the seven key-authed MCP tools. The
// server was fine and the tools were fine; the credential was unissuable. That is invisible
// to every server-side test in the repo, because they all construct their fixture key by
// hand. These tests take the scope from the UI array on purpose — mint the scope the
// dashboard actually offers, or prove nothing.

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
// Literal all-zeros: that exact form is on the secret scanner's mock-key allowlist,
// whereas a computed '0'.repeat(64) is not (same note as mcp-volume-tools.test.js).
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'
process.env.TINYBIRD_READ_ENABLED = 'true'

import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'

import { API_TOKEN_SCOPES } from '../../dashboard/src/lib/apiTokenScopes.js'

const { getSupabase } = await import('../lib/supabase.js')
const { integrationsRouter } = await import('../routes/integrations.js')
const { default: diagnosticsRouter } = await import('../routes/diagnostics.js')
const {
  handleGetWorkspaceContext,
  handleGetSiteHealth,
  handleGetLeadsVolume,
  handleGetCampaignVolume
} = await import('../../mcp/lib/tools.js')

// The scope values are READ OUT OF THE UI ARRAY rather than typed as literals. If the modal
// stops offering one, these tests fail with "the modal does not offer …" instead of quietly
// testing a scope no customer can select.
const scopeFromUi = (value) => {
  const entry = API_TOKEN_SCOPES.find(s => s.value === value)
  assert.ok(entry, `the modal does not offer '${value}' — a customer cannot mint this key at all`)
  return entry.value
}

const SITE = {
  id: 'site-e2e-1',
  plan: 'growth',
  domain: 'shop.example.com',
  name: 'E2E Shop',
  timezone: 'UTC',
  attribution_window_days: 30,
  onboarding_completed: true,
  last_seen_at: '2026-07-30T12:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  trial_ends_at: null
}

// ── Supabase stubbed as a real key store, keyed by hash ──────────────────────────────
const keyStore = new Map() // key_hash -> row
let keySeq = 0

const _client = getSupabase()
_client.from = (table) => {
  if (table === 'api_keys') {
    const filters = {}
    const chain = {
      select: () => chain,
      eq: (col, val) => { filters[col] = val; return chain },
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
      // The guard's lookup. Resolves ONLY through the store the mint route populated.
      maybeSingle: async () => ({ data: keyStore.get(filters.key_hash) || null, error: null }),
      insert: (row) => {
        const stored = { id: `key-${++keySeq}`, ...row, last_used_at: null, created_at: '2026-07-31T00:00:00Z' }
        keyStore.set(row.key_hash, stored)
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: stored.id,
                key_prefix: stored.key_prefix,
                name: stored.name,
                scopes: stored.scopes,
                last_used_at: null,
                created_at: stored.created_at
              },
              error: null
            })
          })
        }
      }
    }
    return chain
  }
  if (table === 'sites') {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: SITE, error: null })
    }
    return chain
  }
  const chain = {
    select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
    range: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: null, error: null })
  }
  return chain
}

function freePort () {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
  })
}

// ── Tinybird stubbed at the HTTP boundary (the volume routes read it) ────────────────
// Same approach as mcp-volume-tools.test.js: stubbing the socket rather than the module
// keeps the REAL queryTinybirdPipe in the path — its allowlist, parsing and null contract.
let pipeResponses = {}
const tbStub = express()
tbStub.get('/v0/pipes/:pipe.json', (req, res) => {
  const rows = req.params.pipe in pipeResponses ? pipeResponses[req.params.pipe] : []
  return res.json({ data: rows })
})
const tbPort = await freePort()
const tbServer = tbStub.listen(tbPort, '127.0.0.1')
await new Promise(r => tbServer.once('listening', r))
process.env.TINYBIRD_HOST = `http://127.0.0.1:${tbPort}`
process.env.TINYBIRD_READ_TOKEN = 'stub-token-not-a-credential'
test.after(() => new Promise(r => tbServer.close(r)))

pipeResponses = {
  leads_count: [{ leads_count: 19 }],
  first_touch_by_site: [
    { source: 'google', medium: 'organic', campaign: 'spring', conversions: 12, revenue: 4200.5 },
    { source: 'direct', medium: 'none', campaign: '', conversions: 8, revenue: 0 }
  ],
  flexible_report_campaign_sessions_by_site: [{ dim_value: 'spring', metric_value: 300 }],
  flexible_report_campaign_leads_by_site: [{ dim_value: 'spring', metric_value: 12 }]
}

// ── The real API, on a real socket ───────────────────────────────────────────────────
const app = express()
app.use('/api/diagnostics', diagnosticsRouter)
const apiPort = await freePort()
const apiServer = app.listen(apiPort, '127.0.0.1')
await new Promise(r => apiServer.once('listening', r))
const API_BASE = `http://127.0.0.1:${apiPort}`
test.after(() => new Promise(r => apiServer.close(r)))

// ── The real mint route ──────────────────────────────────────────────────────────────
const mintHandler = (() => {
  const layer = integrationsRouter.stack.find(l => l.route?.path === '/api-keys' && l.route?.methods?.post)
  return layer.route.stack[layer.route.stack.length - 1].handle
})()

// Mints through the REAL handler and returns exactly what the modal would show the
// customer: the raw token, once.
async function mintKey (scopes, name = 'e2e token') {
  const req = { site: SITE, user: { id: 'user-1' }, body: { name, scopes } }
  const res = {
    statusCode: 200,
    body: null,
    status (c) { res.statusCode = c; return res },
    json (b) { res.body = b; return res }
  }
  await mintHandler(req, res)
  return res
}

// ── 0. The mint route accepts the modal's scopes (this is what used to 400) ──────────

test('🟢 the mint route accepts EVERY scope the modal offers', async () => {
  for (const { value } of API_TOKEN_SCOPES) {
    const res = await mintKey([value], `token for ${value}`)
    assert.strictEqual(
      res.statusCode, 200,
      `minting '${value}' returned ${res.statusCode}: ${JSON.stringify(res.body)} — the modal offers a scope the server rejects`
    )
    assert.deepStrictEqual(res.body.data.scopes, [value])
    assert.match(res.body.data.token, /^st_live_[0-9a-f]{64}$/, 'the customer must get a usable raw token back')
  }
})

// Non-vacuity for the whole file: the removed scope must still be rejected, so the test
// above is passing because the values are RIGHT, not because validation is inert.
test('🔴 the removed read:analytics scope is still rejected by the mint route (400)', async () => {
  const res = await mintKey(['read:analytics'])
  assert.strictEqual(res.statusCode, 400, 'read:analytics must not be mintable')
  assert.match(res.body.error, /read:analytics/)
})

// ── 1. read:diagnostics — minted in the modal, used by the real MCP tools ────────────

test('🟢 E2E: a read:diagnostics key minted from the modal authenticates get_workspace_context', async () => {
  const minted = await mintKey([scopeFromUi('read:diagnostics')], 'mcp diagnostics')
  assert.strictEqual(minted.statusCode, 200)
  const token = minted.body.data.token

  // The guard will look this up by sha256 — assert the store really was populated by the
  // mint route, so a passing test cannot be an artifact of a pre-seeded fixture.
  assert.ok(keyStore.has(createHash('sha256').update(token).digest('hex')), 'the mint route must have stored the hash')

  const out = await handleGetWorkspaceContext({ apiKey: token, apiBaseUrl: API_BASE })

  assert.strictEqual(out.ok, true, `the MCP tool failed: ${out.error} — ${out.message}`)
  assert.strictEqual(out.data.site_id, SITE.id, 'the site is resolved from the KEY, not from any argument')
  assert.strictEqual(out.data.domain, SITE.domain)
  // §6.5 — the raw site_key must never cross this boundary.
  assert.ok(!('site_key' in out.data), 'a raw site_key must never reach an MCP client')
})

test('🟢 E2E: the same key also authenticates get_site_health', async () => {
  const { body } = await mintKey([scopeFromUi('read:diagnostics')], 'mcp diagnostics 2')
  const out = await handleGetSiteHealth({ apiKey: body.data.token, apiBaseUrl: API_BASE })

  assert.strictEqual(out.ok, true, `the MCP tool failed: ${out.error} — ${out.message}`)
  assert.strictEqual(out.data.script_detected, true)
  assert.strictEqual(out.data.plan, 'growth')
})

// ── 2. read:volume — the other half of the split ─────────────────────────────────────

test('🟢 E2E: a read:volume key minted from the modal authenticates get_leads_volume', async () => {
  const { body } = await mintKey([scopeFromUi('read:volume')], 'mcp volume')
  const out = await handleGetLeadsVolume({ apiKey: body.data.token, apiBaseUrl: API_BASE, days: 30, dimension: 'source' })

  assert.strictEqual(out.ok, true, `the MCP tool failed: ${out.error} — ${out.message}`)
  assert.strictEqual(out.data.distinct_leads, 19)
  // The volume-only contract still holds when reached through a real minted key: the
  // fixture carries revenue (4200.5) and none of it may survive.
  assert.ok(!JSON.stringify(out.data).includes('4200.5'), 'a revenue value must not reach the MCP client')
})

test('🟢 E2E: a read:volume key authenticates get_campaign_volume', async () => {
  const { body } = await mintKey([scopeFromUi('read:volume')], 'mcp volume 2')
  const out = await handleGetCampaignVolume({ apiKey: body.data.token, apiBaseUrl: API_BASE, days: 30 })

  assert.strictEqual(out.ok, true, `the MCP tool failed: ${out.error} — ${out.message}`)
})

// ── 3. The scopes are SIBLINGS, proven through the real chain ────────────────────────
// Asserted at the guard level in mcp-diagnostics-scope.test.js; asserted here through a
// genuinely minted key and a real socket, because "the modal can mint it" must not be
// mistaken for "the modal can mint one key that does everything".

test('🔴 E2E: a read:diagnostics key is MISSING_SCOPE on a volume tool', async () => {
  const { body } = await mintKey([scopeFromUi('read:diagnostics')], 'cross 1')
  const out = await handleGetLeadsVolume({ apiKey: body.data.token, apiBaseUrl: API_BASE })

  assert.strictEqual(out.ok, false)
  assert.strictEqual(out.error, 'MISSING_SCOPE', 'a diagnostics key must not read lead counts')
})

test('🔴 E2E: a read:volume key is MISSING_SCOPE on a diagnostics tool', async () => {
  const { body } = await mintKey([scopeFromUi('read:volume')], 'cross 2')
  const out = await handleGetWorkspaceContext({ apiKey: body.data.token, apiBaseUrl: API_BASE })

  assert.strictEqual(out.ok, false)
  assert.strictEqual(out.error, 'MISSING_SCOPE', 'the split is symmetric — neither scope is a superset')
})

test('🔴 E2E: the default (write:events) key reaches no MCP read tool', async () => {
  const { body } = await mintKey([scopeFromUi('write:events')], 'writer')
  for (const [label, call] of [
    ['get_workspace_context', () => handleGetWorkspaceContext({ apiKey: body.data.token, apiBaseUrl: API_BASE })],
    ['get_leads_volume', () => handleGetLeadsVolume({ apiKey: body.data.token, apiBaseUrl: API_BASE })]
  ]) {
    const out = await call()
    assert.strictEqual(out.ok, false, `write:events must not admit ${label}`)
    assert.strictEqual(out.error, 'MISSING_SCOPE', label)
  }
})

// ── 4. An unminted token is rejected — the store is not admitting everything ─────────

test('🔴 E2E: a well-formed token that was never minted is INVALID_API_KEY', async () => {
  const out = await handleGetWorkspaceContext({ apiKey: `st_live_${'f'.repeat(64)}`, apiBaseUrl: API_BASE })
  assert.strictEqual(out.ok, false)
  assert.strictEqual(out.error, 'INVALID_API_KEY')
})
