// POST /api/mcp — Streamable HTTP transport for the MCP server.
//
// mcp/server.js has only ever run as a local stdio process. Claude Desktop/Code can spawn
// that; ChatGPT's Developer Mode cannot — it requires an HTTPS-reachable endpoint. This is
// that endpoint. The tool-dispatch core is NOT reimplemented here: every message that
// survives transport validation goes to processRpcMessage() unchanged, so stdio and HTTP
// cannot answer the same request differently.
//
// ═══ DUAL-ERA, AND HOW ONE ENDPOINT DECIDES WHICH ERA A REQUEST IS SPEAKING ═══════════
//
// The spec splits protocol revisions into two eras that share no handshake:
//   · LEGACY (2025-11-25 and earlier) — opens with an `initialize` handshake.
//   · MODERN (2026-07-28)             — stateless; every request carries its version in
//                                       `params._meta`; `initialize` does not exist.
// It permits serving both: "A dual-era server MAY serve both eras concurrently on the same
// endpoint or process."
//
// The signal is NOT the presence of the MCP-Protocol-Version header. That is the obvious
// guess and it is wrong: the header was introduced in 2025-06-18, which is a LEGACY
// revision, so legacy clients from 2025-06-18 through 2025-11-25 send it too. Keying on it
// would route those clients into modern validation and reject them with HeaderMismatch for
// not sending a `_meta` block their revision never defined.
//
// The spec states the real rule: "A dual-era server selects its behavior from how the
// client opens: A request carrying modern per-request `_meta` is served statelessly
// according to this revision. An `initialize` request selects legacy semantics."
//
// So, in precedence order:
//   1. method === 'initialize'                    -> LEGACY. Unconditional: `initialize`
//      does not exist in the modern era, so its presence is decisive whatever else the
//      request carries.
//   2. params._meta['io.modelcontextprotocol/protocolVersion'] present -> MODERN.
//   3. otherwise                                  -> LEGACY.
// Case 3 is the safe default: it is what every pre-2026 client sends, and treating an
// unrecognised shape as legacy degrades to "the transport that already worked" rather than
// to a 400.
//
// ═══ WHAT THIS LAYER DELIBERATELY DOES NOT DO ════════════════════════════════════════
// It adds NO authentication. That is not an oversight and not a regression: tools/list,
// server/discover and initialize expose tool metadata only — no customer data — and every
// AUTH_API_KEY tool still resolves its site server-side from the api_key argument inside
// tools/call, through the same api/middleware/api-key-scope.js guard that a stdio caller
// hits. §6.5 tenant isolation is untouched by this file: nothing here reads, forwards or
// synthesises a site_id, a site_key, or a scope. The transport moves bytes.
//
// CORS: none, on purpose. MCP over HTTP is server-to-server — the AI platform's backend
// calls this, not a browser — so there is no preflight to satisfy. What the spec requires
// instead is close to the opposite: "Servers MUST validate the Origin header on all
// incoming connections to prevent DNS rebinding attacks... MUST respond with HTTP 403
// Forbidden." This router is therefore mounted in api/index.js BEFORE the global cors()
// middleware, so exactly one origin policy applies to this path and it is this one.

import express from 'express'
import {
  processRpcMessage,
  MODERN_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS
} from '../../mcp/server.js'

const router = express.Router()

// JSON-RPC error codes. -32601/-32700/-32600 are JSON-RPC's own; the -320xx pair is
// allocated from the sub-range the MCP spec reserves for protocol-defined errors.
export const JSONRPC_METHOD_NOT_FOUND = -32601
export const JSONRPC_INVALID_REQUEST = -32600
export const JSONRPC_PARSE_ERROR = -32700
export const MCP_HEADER_MISMATCH = -32020
export const MCP_UNSUPPORTED_PROTOCOL_VERSION = -32022

const META_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion'

// Methods that carry an `Mcp-Name` header, and where its value comes from in the body.
// Per spec: "`Mcp-Name` | `params.name` or `params.uri` | tools/call, resources/read,
// prompts/get requests".
const MCP_NAME_SOURCE = {
  'tools/call': p => p?.name,
  'resources/read': p => p?.uri,
  'prompts/get': p => p?.name
}

// Methods the dispatcher actually implements. Anything else is a 404 + -32601 per spec,
// NOT a 200 with an error body — the status code is what lets a client tell "this server
// does not do that" from "this is not an MCP endpoint".
const MODERN_METHODS = new Set(['server/discover', 'tools/list', 'tools/call'])

const rpcError = (id, code, message, data) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: data === undefined ? { code, message } : { code, message, data }
})

// ── Base64 sentinel decoding ─────────────────────────────────────────────────────────
// Header values are ASCII-only, so the spec defines an escape hatch for names that are
// not: `=?base64?{Base64EncodedValue}?=`. Servers "MUST decode an encoded Mcp-Name or
// Mcp-Param-{Name} value before comparing it to the corresponding request body value" —
// comparing the raw header instead would reject every correctly-encoded client.
// The markers are case-sensitive and must appear exactly as shown (lowercase).
export function decodeHeaderValue (raw) {
  if (typeof raw !== 'string') return raw
  if (!raw.startsWith('=?base64?') || !raw.endsWith('?=')) return raw
  const encoded = raw.slice('=?base64?'.length, -'?='.length)
  try {
    return Buffer.from(encoded, 'base64').toString('utf8')
  } catch {
    return raw
  }
}

// ── Origin validation (spec §Security & Endpoint, DNS-rebinding defence) ─────────────
// "If the Origin header is present and invalid, servers MUST respond with HTTP 403."
// Absent Origin is NOT a failure: a server-to-server caller sends none, and that is the
// normal case for this endpoint. Only a browser sends Origin, and a browser reaching an
// MCP endpoint is the rebinding scenario this exists to stop.
const ALLOWED_MCP_ORIGINS = new Set([
  'https://app.sourcetrack.ai',
  'https://www.sourcetrack.ai',
  'https://sourcetrack.ai'
])

export function isAllowedMcpOrigin (origin) {
  if (!origin) return true
  return ALLOWED_MCP_ORIGINS.has(origin)
}

// ── Era detection ────────────────────────────────────────────────────────────────────
// See the header note for why this keys on the body and not on MCP-Protocol-Version.
export const ERA_MODERN = 'modern'
export const ERA_LEGACY = 'legacy'

export function detectEra (body) {
  if (!body || typeof body !== 'object') return ERA_LEGACY
  if (body.method === 'initialize') return ERA_LEGACY
  const declared = body?.params?._meta?.[META_VERSION_KEY]
  return typeof declared === 'string' && declared ? ERA_MODERN : ERA_LEGACY
}

// ── Modern-era header validation ─────────────────────────────────────────────────────
// Returns null when the request is valid, or { status, body } to send back.
// Every branch here is a distinct spec requirement and has its own test.
export function validateModernRequest (headers, body) {
  const id = body?.id ?? null
  const get = (name) => headers[name.toLowerCase()]

  // 1. MCP-Protocol-Version: "Every POST request to the MCP endpoint MUST include an
  //    MCP-Protocol-Version header." A missing required standard header is itself a
  //    HeaderMismatch per the Server Validation list.
  const headerVersion = get('MCP-Protocol-Version')
  if (!headerVersion) {
    return {
      status: 400,
      body: rpcError(id, MCP_HEADER_MISMATCH, 'Missing required header: MCP-Protocol-Version')
    }
  }

  // 2. "The header value MUST match the io.modelcontextprotocol/protocolVersion field
  //    carried in the request body's _meta. If the values do not match, the server MUST
  //    reject the request with 400 Bad Request and a HeaderMismatch error."
  const bodyVersion = body?.params?._meta?.[META_VERSION_KEY]
  if (headerVersion !== bodyVersion) {
    return {
      status: 400,
      body: rpcError(
        id, MCP_HEADER_MISMATCH,
        `Header mismatch: MCP-Protocol-Version header value '${headerVersion}' does not match body value '${bodyVersion}'`
      )
    }
  }

  // 3. Unsupported version -> its own error code, carrying what we DO support so the
  //    client can retry rather than guess. Checked after the mismatch check because a
  //    disagreeing header/body pair has no single "requested" version to report.
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(headerVersion)) {
    return {
      status: 400,
      body: rpcError(id, MCP_UNSUPPORTED_PROTOCOL_VERSION, 'Unsupported protocol version', {
        supported: [...SUPPORTED_PROTOCOL_VERSIONS],
        requested: headerVersion
      })
    }
  }

  // 4. Mcp-Method: "REQUIRED for compliance", and validated against the body so an
  //    intermediary routing on the header and a server executing on the body cannot be
  //    made to disagree — which is the stated reason the validation exists at all.
  const headerMethod = get('Mcp-Method')
  if (!headerMethod) {
    return { status: 400, body: rpcError(id, MCP_HEADER_MISMATCH, 'Missing required header: Mcp-Method') }
  }
  if (headerMethod !== body?.method) {
    return {
      status: 400,
      body: rpcError(
        id, MCP_HEADER_MISMATCH,
        `Header mismatch: Mcp-Method header value '${headerMethod}' does not match body value '${body?.method}'`
      )
    }
  }

  // 5. Mcp-Name, for the methods that carry one. Decoded before comparison.
  const nameSource = MCP_NAME_SOURCE[body?.method]
  if (nameSource) {
    const expected = nameSource(body?.params)
    const rawHeaderName = get('Mcp-Name')
    if (!rawHeaderName) {
      return { status: 400, body: rpcError(id, MCP_HEADER_MISMATCH, 'Missing required header: Mcp-Name') }
    }
    if (decodeHeaderValue(rawHeaderName) !== expected) {
      return {
        status: 400,
        body: rpcError(
          id, MCP_HEADER_MISMATCH,
          `Header mismatch: Mcp-Name header value '${decodeHeaderValue(rawHeaderName)}' does not match body value '${expected}'`
        )
      }
    }
  }

  return null
}

// ── GET / DELETE ─────────────────────────────────────────────────────────────────────
// The modern revision removed the standalone GET SSE stream and protocol-level sessions.
// The spec's instruction for a server that receives that older traffic is explicit:
// "HTTP GET or DELETE to the MCP endpoint: respond with 405 Method Not Allowed." This is a
// real rejection, not an unhandled path falling through to the 404 handler — a 404 would
// tell a downgrading client this is not an MCP endpoint at all and send it looking for the
// deprecated 2024-11-05 HTTP+SSE transport.
router.get('/', (req, res) => {
  res.set('Allow', 'POST')
  return res.status(405).json(
    rpcError(null, JSONRPC_INVALID_REQUEST, 'Method Not Allowed: the MCP endpoint accepts POST only. The GET stream was removed in protocol revision 2026-07-28.')
  )
})

router.delete('/', (req, res) => {
  res.set('Allow', 'POST')
  return res.status(405).json(
    rpcError(null, JSONRPC_INVALID_REQUEST, 'Method Not Allowed: the MCP endpoint accepts POST only. Protocol-level sessions were removed in revision 2026-07-28, so there is no session to terminate.')
  )
})

router.post('/', async (req, res) => {
  // Origin first — a rebinding attempt should be refused before anything parses its body.
  if (!isAllowedMcpOrigin(req.headers.origin)) {
    return res.status(403).json(
      rpcError(null, JSONRPC_INVALID_REQUEST, 'Forbidden: Origin not allowed')
    )
  }

  const body = req.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json(rpcError(null, JSONRPC_PARSE_ERROR, 'Parse error: body must be a single JSON-RPC object'))
  }
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return res.status(400).json(rpcError(body.id ?? null, JSONRPC_INVALID_REQUEST, 'Invalid Request: expected a JSON-RPC 2.0 request with a method'))
  }

  const era = detectEra(body)

  if (era === ERA_MODERN) {
    const invalid = validateModernRequest(req.headers, body)
    if (invalid) return res.status(invalid.status).json(invalid.body)

    // "If the server does not implement the requested RPC method, it MUST respond with
    // 404 Not Found and a JSON-RPC error with code -32601." The status is load-bearing:
    // "The JSON-RPC error body distinguishes this case from a 404 returned by a legacy
    // HTTP+SSE server that does not host the modern MCP endpoint."
    if (!MODERN_METHODS.has(body.method)) {
      return res.status(404).json(rpcError(body.id ?? null, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${body.method}`))
    }
  }

  // A notification is a message with no `id`. "If the server accepts it, the server MUST
  // return HTTP status code 202 Accepted with no body." Handled for both eras: the legacy
  // dispatcher already returns null for notifications/initialized, and 202-no-body is a
  // correct answer for that too.
  const isNotification = body.id === undefined

  try {
    const result = await processRpcMessage(body, { apiBaseUrl: process.env.SOURCETRACK_API_URL })

    if (isNotification || result === null) {
      return res.status(202).end()
    }

    // Legacy era reaching an unknown method: processRpcMessage answers -32601 in a 200
    // envelope, which is correct for stdio and for pre-2026 HTTP clients. Modern unknown
    // methods never get here — they are 404'd above.
    return res.status(200).json(result)
  } catch (err) {
    console.error('[mcp-http] dispatch failed:', err?.message || err)
    // §3.7 of the tool policy: never leak internal detail. A named, closed-form message.
    return res.status(500).json(rpcError(body.id ?? null, -32603, 'Internal error'))
  }
})

export default router
