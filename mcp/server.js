#!/usr/bin/env node
import { handleDetectPlatform, handleGetInstallSnippet, handleVerifyInstallation } from './lib/tools.js'

const TOOLS = [
  {
    name: 'detect_platform',
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
    description: 'Verify if the tracking script has successfully sent events and is active on a site',
    inputSchema: {
      type: 'object',
      properties: {
        site_key: { type: 'string', description: 'Optional site_key to verify' },
        auth_token: { type: 'string', description: 'Optional Supabase Bearer auth token for authenticated site status check' }
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
      result: { tools: TOOLS }
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
          resData = await handleVerifyInstallation({
            siteKey: args?.site_key,
            authToken: args?.auth_token,
            apiBaseUrl
          })
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
