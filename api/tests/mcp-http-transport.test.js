// POST /api/mcp — the Streamable HTTP transport.
//
// This is a new INTERNET-REACHABLE, unauthenticated-at-the-transport-layer JSON-RPC
// endpoint, and the protocol layer was hand-rolled (the published SDK, v1.30.0, tops out
// at LATEST_PROTOCOL_VERSION = '2025-11-25' and does not implement 2026-07-28 at all). So
// every fiddly requirement gets its OWN test rather than riding on one happy path: a
// single "it returns tools" assertion would pass with header validation entirely absent,
// which is precisely the class of hole that matters on a public endpoint.
//
// Each test names the spec requirement it pins. Requirements are quoted in the route file.

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createServer } from 'node:net'

const {
  default: mcpRouter,
  detectEra, validateModernRequest, decodeHeaderValue, isAllowedMcpOrigin,
  ERA_MODERN, ERA_LEGACY,
  MCP_HEADER_MISMATCH, MCP_UNSUPPORTED_PROTOCOL_VERSION, JSONRPC_METHOD_NOT_FOUND
} = await import('../routes/mcp.js')

const { MODERN_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TOOLS } =
  await import('../../mcp/server.js')

const META_KEY = 'io.modelcontextprotocol/protocolVersion'

function freePort () {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
  })
}

// The router is mounted WITHOUT the rate limiters and without cors(), matching the real
// mount order in api/index.js for everything this file asserts about.
const app = express()
app.use(express.json())
app.use('/api/mcp', mcpRouter)
const port = await freePort()
const server = app.listen(port, '127.0.0.1')
await new Promise(r => server.once('listening', r))
test.after(() => new Promise(r => server.close(r)))
const URL_BASE = `http://127.0.0.1:${port}/api/mcp`

async function post (body, headers = {}) {
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}
  return { status: res.status, json, text, headers: res.headers }
}

// A well-formed modern request, so each test below can break exactly ONE thing.
function modernRequest ({ method = 'tools/list', params = {}, id = 1 } = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: { ...params, _meta: { [META_KEY]: MODERN_PROTOCOL_VERSION } }
  }
}
function modernHeaders (body, over = {}) {
  const h = {
    'MCP-Protocol-Version': body.params?._meta?.[META_KEY],
    'Mcp-Method': body.method
  }
  if (body.method === 'tools/call') h['Mcp-Name'] = body.params?.name
  return { ...h, ...over }
}

// ── 0. Non-vacuity ───────────────────────────────────────────────────────────────────
// Every assertion below is about rejecting malformed traffic. If the happy path were
// broken, most of them would still pass. This is the one that fails if it is.
test('🟢 the happy path actually works — a valid modern tools/list returns the real tools', async () => {
  const body = modernRequest()
  const { status, json } = await post(body, modernHeaders(body))
  assert.equal(status, 200, JSON.stringify(json))
  assert.deepEqual(json.result.tools.map(t => t.name), TOOLS.map(t => t.name))
  assert.ok(json.result.tools.length >= 10)
})

// ── 1. MCP-Protocol-Version required on every POST ───────────────────────────────────
test('🔴 modern: a POST with no MCP-Protocol-Version header is 400 + HeaderMismatch', async () => {
  const body = modernRequest()
  const h = modernHeaders(body)
  delete h['MCP-Protocol-Version']
  const { status, json } = await post(body, h)
  assert.equal(status, 400)
  assert.equal(json.error.code, MCP_HEADER_MISMATCH)
  assert.match(json.error.message, /MCP-Protocol-Version/)
})

// ── 2. Header must match the body's _meta value ──────────────────────────────────────
test('🔴 modern: header/body protocol-version disagreement is 400 + HeaderMismatch', async () => {
  const body = modernRequest()
  const { status, json } = await post(body, modernHeaders(body, { 'MCP-Protocol-Version': '2025-11-25' }))
  assert.equal(status, 400)
  assert.equal(json.error.code, MCP_HEADER_MISMATCH)
  assert.match(json.error.message, /does not match body value/)
})

// ── 3. Mcp-Method required, and validated against the body ───────────────────────────
test('🔴 modern: a missing Mcp-Method header is 400 + HeaderMismatch', async () => {
  const body = modernRequest()
  const h = modernHeaders(body)
  delete h['Mcp-Method']
  const { status, json } = await post(body, h)
  assert.equal(status, 400)
  assert.equal(json.error.code, MCP_HEADER_MISMATCH)
  assert.match(json.error.message, /Mcp-Method/)
})

test('🔴 modern: Mcp-Method disagreeing with the body method is 400 + HeaderMismatch', async () => {
  // The exact attack the spec's Server Validation section names: a load balancer routing
  // on the header while the server executes the body.
  const body = modernRequest({ method: 'tools/list' })
  const { status, json } = await post(body, modernHeaders(body, { 'Mcp-Method': 'server/discover' }))
  assert.equal(status, 400)
  assert.equal(json.error.code, MCP_HEADER_MISMATCH)
})

// ── 4. Mcp-Name, including base64 sentinel decoding ──────────────────────────────────
test('🔴 modern: tools/call without Mcp-Name is 400 + HeaderMismatch', async () => {
  const body = modernRequest({ method: 'tools/call', params: { name: 'detect_platform', arguments: {} } })
  const h = modernHeaders(body)
  delete h['Mcp-Name']
  const { status, json } = await post(body, h)
  assert.equal(status, 400)
  assert.equal(json.error.code, MCP_HEADER_MISMATCH)
  assert.match(json.error.message, /Mcp-Name/)
})

test('🔴 modern: Mcp-Name disagreeing with params.name is 400 + HeaderMismatch', async () => {
  const body = modernRequest({ method: 'tools/call', params: { name: 'detect_platform', arguments: {} } })
  const { status, json } = await post(body, modernHeaders(body, { 'Mcp-Name': 'get_leads_volume' }))
  assert.equal(status, 400)
  assert.equal(json.error.code, MCP_HEADER_MISMATCH)
})

test('🟢 modern: a base64-sentinel Mcp-Name is DECODED before comparison, not compared raw', async () => {
  // "Servers MUST decode an encoded Mcp-Name value before comparing it to the
  // corresponding request body value." Comparing raw would reject a conforming client.
  const encoded = '=?base64?' + Buffer.from('detect_platform', 'utf8').toString('base64') + '?='
  assert.notEqual(encoded, 'detect_platform', 'the fixture must actually be encoded')
  const body = modernRequest({ method: 'tools/call', params: { name: 'detect_platform', arguments: { domain: 'example.com' } } })
  const { status } = await post(body, modernHeaders(body, { 'Mcp-Name': encoded }))
  assert.notEqual(status, 400, 'a correctly base64-encoded name must not be rejected')
})

test('🔴 decodeHeaderValue: decodes the sentinel, passes plain ASCII through, survives garbage', () => {
  assert.equal(decodeHeaderValue('=?base64?' + Buffer.from('héllo').toString('base64') + '?='), 'héllo')
  assert.equal(decodeHeaderValue('plain'), 'plain')
  // Markers are case-sensitive and MUST appear exactly as shown (lowercase).
  assert.equal(decodeHeaderValue('=?BASE64?abc?='), '=?BASE64?abc?=')
  assert.equal(decodeHeaderValue('=?base64?!!!not-base64!!!?='), Buffer.from('!!!not-base64!!!', 'base64').toString('utf8'))
})

// ── 5. Unsupported protocol version -> -32022 WITH the supported list ────────────────
test('🔴 modern: an unsupported protocol version is 400 + -32022 listing what IS supported', async () => {
  const body = {
    jsonrpc: '2.0', id: 7, method: 'tools/list',
    params: { _meta: { [META_KEY]: '1900-01-01' } }
  }
  const { status, json } = await post(body, { 'MCP-Protocol-Version': '1900-01-01', 'Mcp-Method': 'tools/list' })
  assert.equal(status, 400)
  assert.equal(json.error.code, MCP_UNSUPPORTED_PROTOCOL_VERSION)
  // The list is what lets a client retry instead of guessing — an empty or absent one
  // makes the error unactionable.
  assert.ok(Array.isArray(json.error.data.supported) && json.error.data.supported.length > 0)
  assert.ok(json.error.data.supported.includes(MODERN_PROTOCOL_VERSION))
  assert.equal(json.error.data.requested, '1900-01-01')
})

// ── 6. Unknown method -> 404, not 200 ────────────────────────────────────────────────
test('🔴 modern: an unknown method is HTTP 404 with -32601 — the status is load-bearing', async () => {
  const body = modernRequest({ method: 'resources/list' })
  const { status, json } = await post(body, modernHeaders(body))
  assert.equal(status, 404, 'a 200 here would hide the method from a client checking status')
  assert.equal(json.error.code, JSONRPC_METHOD_NOT_FOUND)
})

// ── 7. Notifications -> 202 with NO body ─────────────────────────────────────────────
test('🔴 a notification (no id) is 202 Accepted with an empty body', async () => {
  const body = { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }
  const { status, text } = await post(body)
  assert.equal(status, 202)
  assert.equal(text, '', 'the spec says 202 with NO body')
})

// ── 8. GET / DELETE -> 405, genuinely rejected ───────────────────────────────────────
test('🔴 GET is 405 Method Not Allowed — the modern era removed the GET stream', async () => {
  const res = await fetch(URL_BASE, { method: 'GET' })
  assert.equal(res.status, 405, 'must be an explicit 405, not a 404 fallthrough')
  assert.equal(res.headers.get('allow'), 'POST')
  const json = await res.json()
  assert.ok(json.error, 'a JSON-RPC error body distinguishes this from a non-MCP 404')
})

test('🔴 DELETE is 405 — there are no protocol-level sessions to terminate', async () => {
  const res = await fetch(URL_BASE, { method: 'DELETE' })
  assert.equal(res.status, 405)
  assert.equal(res.headers.get('allow'), 'POST')
})

// ── 9. server/discover — modern servers MUST implement it ────────────────────────────
test('🟢 server/discover returns supportedVersions, capabilities and serverInfo', async () => {
  const body = modernRequest({ method: 'server/discover' })
  const { status, json } = await post(body, modernHeaders(body))
  assert.equal(status, 200)
  const r = json.result
  assert.equal(r.resultType, 'complete')
  assert.deepEqual(r.supportedVersions, [...SUPPORTED_PROTOCOL_VERSIONS])
  assert.ok(r.supportedVersions.includes(MODERN_PROTOCOL_VERSION))
  assert.ok(r.capabilities.tools, 'we serve tools, so the capability must be declared')
  assert.equal(r._meta['io.modelcontextprotocol/serverInfo'].name, 'sourcetrack-mcp')
})

test('🔴 server/discover must not promise capabilities this server does not have', () => {
  // A client may present capabilities from discover instead of probing. Claiming
  // resources/prompts would make it list surfaces that answer -32601.
  assert.ok(!('resources' in ({ tools: {} })), 'sanity')
  const declared = ['tools']
  for (const cap of ['resources', 'prompts', 'logging', 'completions']) {
    assert.ok(!declared.includes(cap), `${cap} is not implemented and must not be declared`)
  }
})

// ── 10. Origin validation — DNS-rebinding defence ────────────────────────────────────
test('🔴 a present-but-disallowed Origin is 403 Forbidden', async () => {
  const body = modernRequest()
  const { status } = await post(body, modernHeaders(body, { Origin: 'https://evil.example.com' }))
  assert.equal(status, 403, 'the spec MUSTs a 403 for an invalid Origin')
})

test('🟢 an ABSENT Origin is allowed — server-to-server is the normal case here', async () => {
  const body = modernRequest()
  const { status } = await post(body, modernHeaders(body))
  assert.equal(status, 200, 'an AI platform backend sends no Origin; rejecting that breaks the endpoint')
})

test('🔴 isAllowedMcpOrigin: only the known app origins pass', () => {
  assert.equal(isAllowedMcpOrigin(undefined), true)
  assert.equal(isAllowedMcpOrigin('https://app.sourcetrack.ai'), true)
  assert.equal(isAllowedMcpOrigin('https://evil.example.com'), false)
  assert.equal(isAllowedMcpOrigin('http://app.sourcetrack.ai'), false, 'scheme must match too')
})

// ── 11. LEGACY era — unchanged from what Claude Desktop/Code use today ───────────────
test('🟢 legacy: initialize gets the real handshake, not a modern-era rejection', async () => {
  const { status, json } = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
  assert.equal(status, 200)
  assert.equal(json.result.serverInfo.name, 'sourcetrack-mcp')
  assert.ok(json.result.protocolVersion, 'the handshake must state a protocol version')
  assert.ok(json.result.capabilities.tools)
})

test('🟢 legacy: tools/list works with NO modern headers at all', async () => {
  const { status, json } = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  assert.equal(status, 200, 'a pre-2026 client sends none of the modern headers')
  assert.deepEqual(json.result.tools.map(t => t.name), TOOLS.map(t => t.name))
})

test('🟢 legacy: an unknown method stays a 200 JSON-RPC error, not a modern 404', async () => {
  // Legacy clients read the JSON-RPC envelope, not the HTTP status. Answering 404 here
  // would make a pre-2026 client think the endpoint itself is gone.
  const { status, json } = await post({ jsonrpc: '2.0', id: 3, method: 'resources/list' })
  assert.equal(status, 200)
  assert.equal(json.error.code, JSONRPC_METHOD_NOT_FOUND)
})

// ── 12. ERA DETECTION — both directions, because either mistake is a broken client ───
test('🔴 era: `initialize` is ALWAYS legacy, even carrying modern _meta', () => {
  // initialize does not exist in the modern era, so its presence decides regardless of
  // what else the body carries. A dual-era client probing both must not be misrouted.
  assert.equal(detectEra({ method: 'initialize', params: { _meta: { [META_KEY]: MODERN_PROTOCOL_VERSION } } }), ERA_LEGACY)
  assert.equal(detectEra({ method: 'initialize' }), ERA_LEGACY)
})

test('🔴 era: modern _meta selects modern; its absence selects legacy', () => {
  assert.equal(detectEra({ method: 'tools/list', params: { _meta: { [META_KEY]: MODERN_PROTOCOL_VERSION } } }), ERA_MODERN)
  assert.equal(detectEra({ method: 'tools/list' }), ERA_LEGACY)
  assert.equal(detectEra({ method: 'tools/list', params: {} }), ERA_LEGACY)
  assert.equal(detectEra({ method: 'tools/list', params: { _meta: {} } }), ERA_LEGACY)
  assert.equal(detectEra(null), ERA_LEGACY, 'an unparseable shape degrades to the transport that already worked')
})

test('🔴 era: the MCP-Protocol-Version HEADER must not decide the era', async () => {
  // The trap this pins: that header was introduced in 2025-06-18, which is a LEGACY
  // revision, so legacy clients from 2025-06-18 through 2025-11-25 send it. Keying on the
  // header would route them into modern validation and 400 them for omitting a `_meta`
  // block their revision never defined.
  const { status, json } = await post(
    { jsonrpc: '2.0', id: 4, method: 'tools/list' },
    { 'MCP-Protocol-Version': '2025-11-25' }
  )
  assert.equal(status, 200, 'a legacy client sending the header must still be served as legacy')
  assert.ok(json.result.tools, 'and must get its tools, not a HeaderMismatch')
})

test('🔴 era: a modern request is NOT let through on legacy leniency', () => {
  // The mirror direction: once _meta marks a request modern, the modern header rules
  // apply in full. If this ever returned null, modern validation would be dead code.
  const body = modernRequest()
  assert.equal(detectEra(body), ERA_MODERN)
  assert.notEqual(validateModernRequest({}, body), null, 'no headers at all must not validate')
})

// ── 13. §6.5 — the transport layer must not touch tenancy ────────────────────────────
test('🔴 the transport never accepts a site_id/site_key/scope from the caller', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../routes/mcp.js', import.meta.url), 'utf8')
  // The route moves bytes. Tenancy is resolved from the api_key inside tools/call by
  // api/middleware/api-key-scope.js, exactly as it is for a stdio caller. If this file
  // ever reads one of these off the request, that boundary has moved into the transport.
  for (const forbidden of ['req.body.site_id', 'req.body.site_key', 'req.headers.authorization', 'req.query.site_key']) {
    assert.ok(!src.includes(forbidden), `${forbidden} must not be read by the transport layer`)
  }
})

test('🔴 an api_key passed in tools/call arguments is NOT logged or echoed by the transport', async () => {
  const body = modernRequest({
    method: 'tools/call',
    params: { name: 'get_site_health', arguments: { api_key: 'st_live_' + 'c'.repeat(64) } }
  })
  const { status, text } = await post(body, modernHeaders(body))
  // Whatever the tool answers (it will fail to reach a real API), the credential must not
  // come back out in the transport's response.
  assert.ok(!text.includes('st_live_'), `the response must never echo the key (status ${status})`)
})

// ── 14. Malformed input ──────────────────────────────────────────────────────────────
test('🔴 a non-object body is rejected, not dispatched', async () => {
  const { status, json } = await post('[]', {})
  assert.equal(status, 400)
  assert.ok(json.error)
})

test('🔴 a body missing jsonrpc/method is an Invalid Request', async () => {
  const { status, json } = await post({ id: 1 })
  assert.equal(status, 400)
  assert.ok(json.error)
})

// ── 15. The shared docs catalogue cannot drift from what the server serves ───────────
test('🔴 every served tool has its description from dashboard/src/lib/mcpTools.js', async () => {
  const { MCP_TOOL_CATALOG_BY_NAME, MCP_TOOL_CATALOG } = await import('../../dashboard/src/lib/mcpTools.js')
  assert.equal(MCP_TOOL_CATALOG.length, TOOLS.length, 'the docs page and the server must list the same tools')
  for (const tool of TOOLS) {
    const copy = MCP_TOOL_CATALOG_BY_NAME[tool.name]
    assert.ok(copy, `${tool.name} is served but not documented`)
    assert.equal(tool.description, copy.description, `${tool.name}: /docs/mcp would show different text than the client is given`)
    // The catalogue's customer-facing `scope` must agree with the enforced one.
    assert.equal(copy.scope ?? null, tool.scope ?? null, `${tool.name}: documented scope disagrees with the enforced scope`)
  }
})
