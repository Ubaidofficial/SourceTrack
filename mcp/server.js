#!/usr/bin/env node
import {
  handleDetectPlatform, handleGetInstallSnippet, handleVerifyInstallation,
  handleGetWorkspaceContext, handleGetSiteHealth, handleGetDataQuality,
  handleDebugDataFlow, handleVerifyEvents,
  AUTH_NONE, AUTH_USER_JWT, AUTH_API_KEY
} from './lib/tools.js'

// Every tool declares its auth model. The DECLARATION decides which credential the
// dispatcher hands it — the token is never inspected to guess. See the long note in
// lib/tools.js: install-support tools use a Supabase user JWT (a person, many sites),
// diagnostic tools use a SourceTrack API key (exactly one site, read:analytics scope),
// and the two never share an argument name or an env var.
//
// `auth` is stripped from tools/list output: it is server-side routing metadata, not part
// of the MCP tool contract a client consumes.
const TOOLS = [
  {
    name: 'detect_platform',
    auth: AUTH_NONE,
    description: 'Detect the CMS or platform (Shopify, WordPress, Webflow, GTM) of a website domain',
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
    description: 'Get the tracking script snippet and step-by-step install instructions for a target platform',
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
    description: 'Verify if tracking script events are active on a site. Note: Live backend status API requires an authenticated user session Bearer token (auth_token or SOURCETRACK_AUTH_TOKEN env var)',
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
    description: 'Identify the site this API key reads: site_id, domain, timezone, attribution window, onboarding state. Configuration only, no metrics — call this first so later answers can name which site and timezone they refer to.',
    inputSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', description: 'SourceTrack API key with the read:analytics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'get_site_health',
    auth: AUTH_API_KEY,
    description: 'Is the tracker plumbed in? Reports script_detected, last_seen_at, hours since last seen, onboarding state and plan. Answerable without the analytics read store, so it still works when that store is the thing that is broken.',
    inputSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', description: 'SourceTrack API key with the read:analytics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'get_data_quality',
    auth: AUTH_API_KEY,
    description: 'Latest result per check from the nightly data-quality job (status, value, threshold, message). Returns has_data:false when the job has never run for this site — never an all-clear it cannot substantiate.',
    inputSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', description: 'SourceTrack API key with the read:analytics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'debug_data_flow',
    auth: AUTH_API_KEY,
    description: 'Attribution COVERAGE over a window: how many recorded conversions carry a usable source, and what share arrived UTM/click-id tagged. Pipeline completeness only — it does not say which channel deserves credit and returns no revenue.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Window in days, 1-90 (default 30)' },
        api_key: { type: 'string', description: 'SourceTrack API key with the read:analytics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  },
  {
    name: 'verify_events',
    auth: AUTH_API_KEY,
    description: 'Is the ingest rail receiving events? Returns the most recent event timestamp and minutes since. If the analytics read store is unreachable this fails explicitly (READ_STORE_UNAVAILABLE) rather than reporting zero events — a SourceTrack read failure must never be read as broken customer tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        api_key: { type: 'string', description: 'SourceTrack API key with the read:analytics scope (or set SOURCETRACK_API_KEY). The key determines which site is read — no site_id/site_key is accepted.' }
      },
      required: []
    }
  }
]

export function processRpcMessage(msg, config = {}) {
  const { id, method, params } = msg
  const apiBaseUrl = config.apiBaseUrl || process.env.SOURCETRACK_API_URL || 'https://api.srctk.com'

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
      // `auth` is internal routing metadata, not part of the tool contract — strip it so
      // clients see the same shape they always have.
      result: { tools: TOOLS.map(({ auth, ...tool }) => tool) }
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
