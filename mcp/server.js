#!/usr/bin/env node
import {
  handleDetectPlatform, handleGetInstallSnippet, handleVerifyInstallation,
  handleGetWorkspaceContext, handleGetSiteHealth, handleGetDataQuality,
  handleDebugDataFlow, handleVerifyEvents,
  handleGetLeadsVolume, handleGetCampaignVolume,
  AUTH_NONE, AUTH_USER_JWT, AUTH_API_KEY
} from './lib/tools.js'
import { SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME } from '../api/lib/api-key-scopes.js'
import { MCP_TOOL_CATALOG, MCP_TOOL_CATALOG_BY_NAME } from '../dashboard/src/lib/mcpTools.js'

// Every tool declares its auth model. The DECLARATION decides which credential the
// dispatcher hands it — the token is never inspected to guess. See the long note in
// lib/tools.js: install-support tools use a Supabase user JWT (a person, many sites),
// key-authed tools use a SourceTrack API key (exactly one site), and the two never share
// an argument name or an env var.
//
// Every AUTH_API_KEY tool ALSO declares the exact scope its key must hold — read:diagnostics
// for pipeline state, read:volume for lead/campaign counts (docs/mcp_tool_policy.md §5).
// The values are imported from api/lib/api-key-scopes.js rather than written as literals
// here: that file is the single source of truth and says "do not fork this list", and a
// forked copy would let this array drift out of agreement with the routes that actually
// enforce it — the declaration would then describe a scope no endpoint checks.
//
// `auth` and `scope` are both stripped from tools/list output: they are server-side
// routing metadata, not part of the MCP tool contract a client consumes. The scope a
// caller needs is stated in the api_key argument description, which IS part of the
// contract.
// Exported so api/tests/mcp-tool-policy-guard.test.js can assert against the REAL array
// rather than a copy — the same shape api/routes/capi.js exports CAPI_PLATFORMS for.
// tools/list is not a substitute: it strips the very fields that guard checks.
const TOOL_PROTOCOL = [
  {
    name: 'detect_platform',
    auth: AUTH_NONE,
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'The website domain name to scan (e.g. example.com)' },
        site_key: { type: 'string', description: 'Optional site_key' }
      },
      required: ['domain']
    }
  },
  {
    name: 'get_install_snippet',
    auth: AUTH_NONE,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Target platform: html, shopify, wordpress, webflow, gtm' },
        site_id: { type: 'string', description: 'Optional site_id to fetch snippet from backend server' },
        site_key: { type: 'string', description: 'Optional site_key to bake into snippet' }
      },
      required: []
    }
  },
  {
    name: 'verify_installation',
    auth: AUTH_USER_JWT,
    inputSchema: {
      type: 'object',
      properties: {
        site_key: { type: 'string', description: 'Target site_key to verify' },
        auth_token: { type: 'string', description: 'Supabase Bearer JWT auth token (required by backend /api/install/status)' }
      },
      required: []
    }
  },
  {
    name: 'get_workspace_context',
    auth: AUTH_API_KEY,
    scope: SCOPE_READ_DIAGNOSTICS,
    inputSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', description: 'SourceTrack API key with the read:diagnostics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'get_site_health',
    auth: AUTH_API_KEY,
    scope: SCOPE_READ_DIAGNOSTICS,
    inputSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', description: 'SourceTrack API key with the read:diagnostics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'get_data_quality',
    auth: AUTH_API_KEY,
    scope: SCOPE_READ_DIAGNOSTICS,
    inputSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', description: 'SourceTrack API key with the read:diagnostics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'debug_data_flow',
    auth: AUTH_API_KEY,
    scope: SCOPE_READ_DIAGNOSTICS,
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Window in days, 1-90 (default 30)' },
        api_key: { type: 'string', description: 'SourceTrack API key with the read:diagnostics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'verify_events',
    auth: AUTH_API_KEY,
    scope: SCOPE_READ_DIAGNOSTICS,
    inputSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', description: 'SourceTrack API key with the read:diagnostics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'get_leads_volume',
    auth: AUTH_API_KEY,
    scope: SCOPE_READ_VOLUME,
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Window in days, 1-90 (default 30)' },
        dimension: { type: 'string', description: 'Breakdown dimension: source (default), medium, or campaign' },
        api_key: { type: 'string', description: 'SourceTrack API key with the read:volume scope (or set SOURCETRACK_API_KEY). A read:diagnostics key is NOT accepted here — the two are siblings, not a hierarchy. The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'get_campaign_volume',
    auth: AUTH_API_KEY,
    scope: SCOPE_READ_VOLUME,
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Window in days, 1-90 (default 30)' },
        api_key: { type: 'string', description: 'SourceTrack API key with the read:volume scope (or set SOURCETRACK_API_KEY). A read:diagnostics key is NOT accepted here — the two are siblings, not a hierarchy. The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  }
]

// The tool contract = protocol fields (above) + human-readable copy, which lives in
// dashboard/src/lib/mcpTools.js because the customer docs page at /docs/mcp needs the same
// strings and dashboard/src cannot import from here (#252 build-root boundary — see the
// note in that file). Merging by name rather than duplicating means the docs page and what
// an MCP client is told are the SAME string, not two that agree today.
//
// The two assertions below are the whole point of doing it as an import: a name in one
// list and not the other throws at MODULE LOAD, so the server refuses to start rather than
// serving a tool with no description or documenting a tool that does not exist. A sync
// test could only report the drift afterwards.
export const TOOLS = TOOL_PROTOCOL.map((tool) => {
  const copy = MCP_TOOL_CATALOG_BY_NAME[tool.name]
  if (!copy) {
    throw new Error(
      `mcp/server.js: tool '${tool.name}' has no entry in dashboard/src/lib/mcpTools.js. ` +
      'Add its description there — it is what /docs/mcp renders.'
    )
  }
  return { ...tool, description: copy.description }
})

for (const { name } of MCP_TOOL_CATALOG) {
  if (!TOOL_PROTOCOL.some(t => t.name === name)) {
    throw new Error(
      `dashboard/src/lib/mcpTools.js documents '${name}', which mcp/server.js does not serve. ` +
      'Remove it there, or add its protocol entry here.'
    )
  }
}

// ── Protocol versions this server speaks ─────────────────────────────────────────────
// MODERN is revision 2026-07-28: stateless, per-request `_meta`, no initialize handshake,
// no sessions, no GET stream. LEGACY are the initialize-handshake revisions; 2024-11-05 is
// what `initialize` below has always answered with and is what Claude Desktop/Code use
// today, so it stays exactly as it is.
export const MODERN_PROTOCOL_VERSION = '2026-07-28'
export const LEGACY_PROTOCOL_VERSIONS = Object.freeze([
  '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'
])
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  MODERN_PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS
])

export const SERVER_INFO = Object.freeze({ name: 'sourcetrack-mcp', version: '1.0.0' })

export function processRpcMessage(msg, config = {}) {
  const { id, method, params } = msg
  const apiBaseUrl = config.apiBaseUrl || process.env.SOURCETRACK_API_URL || 'https://api.srctk.com'

  // Modern-era discovery. The spec is unambiguous — "Servers MUST implement it" — and it
  // is the only way a modern client learns which versions we speak without guessing. It
  // lives here rather than in the HTTP route so stdio gets it too: a modern stdio client
  // probes with server/discover and falls back to initialize on any non-modern error, so a
  // server that answers it on one transport and not the other would be detected as two
  // different eras depending on how it was reached.
  if (method === 'server/discover') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        resultType: 'complete',
        supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        capabilities: { tools: {} },
        _meta: { 'io.modelcontextprotocol/serverInfo': { ...SERVER_INFO } },
        instructions:
          'SourceTrack attribution diagnostics. Tools report installation and pipeline ' +
          'state, plus lead and campaign COUNTS. No revenue, cost, ROAS or attribution-' +
          'model figures are available through this server by design. Key-authed tools ' +
          'read exactly one site — the site is resolved from the API key, never from a ' +
          'caller-supplied id.'
      }
    }
  }

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'sourcetrack-mcp', version: '1.0.0' }
      }
    }
  }

  if (method === 'notifications/initialized') {
    return null
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      // `auth` and `scope` are internal routing metadata, not part of the tool contract —
      // strip both so clients see the same shape they always have.
      result: { tools: TOOLS.map(({ auth, scope, ...tool }) => tool) }
    }
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {}
    return (async () => {
      try {
        let resData = null
        if (name === 'detect_platform') {
          resData = await handleDetectPlatform({
            domain: args?.domain,
            siteKey: args?.site_key,
            apiBaseUrl
          })
        } else if (name === 'get_install_snippet') {
          resData = await handleGetInstallSnippet({
            platform: args?.platform,
            siteId: args?.site_id,
            siteKey: args?.site_key,
            apiBaseUrl
          })
        } else if (name === 'verify_installation') {
          // AUTH_USER_JWT: reads auth_token / SOURCETRACK_AUTH_TOKEN only.
          resData = await handleVerifyInstallation({
            siteKey: args?.site_key,
            authToken: args?.auth_token,
            apiBaseUrl
          })

        // ── AUTH_API_KEY tools ───────────────────────────────────────────────────────
        // Each reads args.api_key / SOURCETRACK_API_KEY only. None accepts a site_id or
        // site_key: the key IS the tenant, resolved server-side from the api_keys row, so
        // a caller-supplied id could only ever be a cross-tenant read attempt.
        } else if (name === 'get_workspace_context') {
          resData = await handleGetWorkspaceContext({ apiKey: args?.api_key, apiBaseUrl })
        } else if (name === 'get_site_health') {
          resData = await handleGetSiteHealth({ apiKey: args?.api_key, apiBaseUrl })
        } else if (name === 'get_data_quality') {
          resData = await handleGetDataQuality({ apiKey: args?.api_key, apiBaseUrl })
        } else if (name === 'debug_data_flow') {
          resData = await handleDebugDataFlow({ apiKey: args?.api_key, days: args?.days, apiBaseUrl })
        } else if (name === 'verify_events') {
          resData = await handleVerifyEvents({ apiKey: args?.api_key, apiBaseUrl })

        // Volume tools. Note what is NOT forwarded: no attribution_model / model
        // argument is read from args at all, so a caller cannot reintroduce the model
        // choice these tools deliberately fix server-side.
        } else if (name === 'get_leads_volume') {
          resData = await handleGetLeadsVolume({
            apiKey: args?.api_key, days: args?.days, dimension: args?.dimension, apiBaseUrl
          })
        } else if (name === 'get_campaign_volume') {
          resData = await handleGetCampaignVolume({ apiKey: args?.api_key, days: args?.days, apiBaseUrl })
        } else {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Unknown tool: ${name}` }
          }
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(resData, null, 2)
              }
            ]
          }
        }
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: err?.message || 'Tool execution failed' }
        }
      }
    })()
  }

  if (id !== undefined) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    }
  }

  return null
}

// Stdio runner
if (process.argv[1] && process.argv[1].includes('mcp/server.js')) {
  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', async (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed)
        const res = processRpcMessage(msg)
        const resolvedRes = res instanceof Promise ? await res : res
        if (resolvedRes) {
          process.stdout.write(JSON.stringify(resolvedRes) + '\n')
        }
      } catch (err) {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' }
        }) + '\n')
      }
    }
  })
}
