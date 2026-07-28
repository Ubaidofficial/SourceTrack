import test from 'node:test'
import assert from 'node:assert'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { processRpcMessage } from '../../mcp/server.js'
import { handleDetectPlatform, handleGetInstallSnippet, handleVerifyInstallation } from '../../mcp/lib/tools.js'
import { SHOPIFY_STEPS, WORDPRESS_STEPS, WEBFLOW_STEPS } from '../../api/lib/platform-guides.js'

test('MCP Server — initialize handshake', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { clientInfo: { name: 'test-agent', version: '1.0.0' } }
  }
  const res = processRpcMessage(req)
  assert.strictEqual(res.jsonrpc, '2.0')
  assert.strictEqual(res.id, 1)
  assert.strictEqual(res.result.serverInfo.name, 'sourcetrack-mcp')
  assert.ok(res.result.capabilities.tools)
})

test('MCP Server — tools/list exposes Phase 1 MVP tool surface', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  }
  const res = processRpcMessage(req)
  assert.strictEqual(res.id, 2)
  const toolNames = res.result.tools.map(t => t.name)
  assert.deepStrictEqual(toolNames, ['detect_platform', 'get_install_snippet', 'verify_installation'])
})

test('MCP Server — tools/call detect_platform', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'detect_platform',
      arguments: { domain: 's141smoke2-store.com' }
    }
  }
  const res = await processRpcMessage(req)
  assert.strictEqual(res.id, 3)
  assert.ok(res.result.content[0].text)
  const parsed = JSON.parse(res.result.content[0].text)
  assert.ok('platform' in parsed)
})

test('MCP Server — tools/call get_install_snippet for Shopify (sourced directly from SHOPIFY_STEPS)', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'get_install_snippet',
      arguments: { platform: 'shopify', site_key: 'test-site-key-123' }
    }
  }
  const res = await processRpcMessage(req)
  assert.strictEqual(res.id, 4)
  const parsed = JSON.parse(res.result.content[0].text)
  assert.strictEqual(parsed.platform, 'shopify')
  assert.strictEqual(parsed.site_key, 'test-site-key-123')
  assert.strictEqual(parsed.doc_url, '/docs/platforms/shopify')
  assert.ok(parsed.snippet.includes('data-site-key="test-site-key-123"'))
  // Confirm steps array is byte-identical to SHOPIFY_STEPS single source of truth
  assert.deepStrictEqual(parsed.steps, SHOPIFY_STEPS)
})

test('MCP Server — tools/call get_install_snippet with site_id fetches real server route', async () => {
  let routeCalled = false
  const server = http.createServer((req, res) => {
    if (req.url === '/api/install/snippet?site_id=site-12345') {
      routeCalled = true
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        data: {
          snippet: '<script async src="https://custom.srctk.com/tracker.min.js" data-site-key="server-site-key-888"></script>',
          site_key: 'server-site-key-888'
        }
      }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const req = {
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: {
        name: 'get_install_snippet',
        arguments: { platform: 'shopify', site_id: 'site-12345' }
      }
    }
    const res = await processRpcMessage(req, { apiBaseUrl: `http://127.0.0.1:${port}` })
    assert.strictEqual(res.id, 41)
    const parsed = JSON.parse(res.result.content[0].text)
    assert.strictEqual(routeCalled, true, 'GET /api/install/snippet?site_id=site-12345 must be fetched')
    assert.strictEqual(parsed.site_key, 'server-site-key-888')
    assert.strictEqual(parsed.snippet, '<script async src="https://custom.srctk.com/tracker.min.js" data-site-key="server-site-key-888"></script>')
    assert.deepStrictEqual(parsed.steps, SHOPIFY_STEPS)
  } finally {
    server.close()
  }
})

test('MCP Handlers — handleGetInstallSnippet platform fallbacks', async () => {
  const wp = await handleGetInstallSnippet({ platform: 'wordpress', siteKey: 'wp-123' })
  assert.strictEqual(wp.platform, 'wordpress')
  assert.strictEqual(wp.doc_url, '/docs/platforms/wordpress')
  assert.deepStrictEqual(wp.steps, WORDPRESS_STEPS)

  const wf = await handleGetInstallSnippet({ platform: 'webflow', siteKey: 'wf-123' })
  assert.strictEqual(wf.platform, 'webflow')
  assert.strictEqual(wf.doc_url, '/docs/platforms/webflow')
  assert.deepStrictEqual(wf.steps, WEBFLOW_STEPS)
})

test('🔴 SYNC GUARD: SHOPIFY_STEPS is derived and verified directly from DocsShopify.jsx <ol><li> text', () => {
  const docsPath = path.resolve('dashboard/src/pages/docs/DocsShopify.jsx')
  assert.ok(fs.existsSync(docsPath), 'DocsShopify.jsx must exist')
  const docsText = fs.readFileSync(docsPath, 'utf8')

  const olMatch = docsText.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i)
  assert.ok(olMatch, 'Must find <ol> section in DocsShopify.jsx')

  const liMatches = [...olMatch[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)]
  assert.ok(liMatches.length >= 4, 'Must extract at least 4 step items from DocsShopify.jsx')

  const extractedSteps = liMatches.map((m) => {
    return m[1]
      .replace(/<[^>]+>/g, '') // strip JSX elements first
      .replace(/&rarr;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/Replace YOUR_SITE_KEY:?/gi, '')
      .trim()
  })

  extractedSteps.forEach((extractedText, i) => {
    const guideStep = SHOPIFY_STEPS[i] || ''
    const normalizedGuide = guideStep.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim()
    const normalizedExtracted = extractedText.replace(/\s+/g, ' ').trim()

    assert.strictEqual(
      normalizedGuide,
      normalizedExtracted,
      `Step ${i + 1} text mismatch:\n  JSX Docs: "${normalizedExtracted}"\n  Guide:    "${normalizedGuide}"`
    )
  })
})

// ── Explicit Failure & Success State Tests for verify_installation ───────────

test('MCP Server — verify_installation state: MISSING_SITE_KEY', async () => {
  const res = await handleVerifyInstallation({ siteKey: null, apiBaseUrl: null })
  assert.strictEqual(res.verified, false)
  assert.strictEqual(res.status, 'error')
  assert.strictEqual(res.error, 'MISSING_SITE_KEY')
  assert.ok(res.message.includes('site_key is required'))
})

test('MCP Server — verify_installation state: FETCH_FAILED (network down / unreachable port)', async () => {
  const res = await handleVerifyInstallation({
    siteKey: 'test-site-key-456',
    apiBaseUrl: 'http://127.0.0.1:59999' // closed port
  })
  assert.strictEqual(res.verified, false)
  assert.strictEqual(res.status, 'check_failed')
  assert.strictEqual(res.error, 'FETCH_FAILED')
  assert.ok(res.message.includes('Failed to connect to verification API'))
})

test('MCP Server — verify_installation state: HTTP_ERROR_500 (server returns 500)', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const res = await handleVerifyInstallation({
      siteKey: 'test-site-key-789',
      apiBaseUrl: `http://127.0.0.1:${port}`
    })
    assert.strictEqual(res.verified, false)
    assert.strictEqual(res.status, 'check_failed')
    assert.strictEqual(res.error, 'HTTP_ERROR_500')
    assert.ok(res.message.includes('HTTP status 500'))
  } finally {
    server.close()
  }
})

test('MCP Server — verify_installation state: CONFIRMED_PENDING (200 OK, not installed yet)', async () => {
  const server = http.createServer((req, res) => {
    assert.strictEqual(req.headers['x-site-key'], 'test-site-key-pending')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      data: {
        verified: false,
        status: 'pending',
        last_seen_at: null,
        last_event_name: null,
        message: 'No events received yet'
      }
    }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const res = await handleVerifyInstallation({
      siteKey: 'test-site-key-pending',
      apiBaseUrl: `http://127.0.0.1:${port}`
    })
    assert.strictEqual(res.verified, false)
    assert.strictEqual(res.status, 'pending')
    assert.strictEqual(res.last_seen_at, null)
    assert.strictEqual(res.message, 'No events received yet')
  } finally {
    server.close()
  }
})

test('MCP Server — verify_installation state: CONFIRMED_ACTIVE (200 OK, active events firing)', async () => {
  const server = http.createServer((req, res) => {
    assert.strictEqual(req.headers['x-site-key'], 'test-site-key-active')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      data: {
        verified: true,
        status: 'active',
        last_seen_at: '2026-07-28T10:00:00Z',
        last_event_name: '$pageview',
        message: 'Tracking active'
      }
    }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const res = await handleVerifyInstallation({
      siteKey: 'test-site-key-active',
      apiBaseUrl: `http://127.0.0.1:${port}`
    })
    assert.strictEqual(res.verified, true)
    assert.strictEqual(res.status, 'active')
    assert.strictEqual(res.last_event_name, '$pageview')
    assert.strictEqual(res.message, 'Tracking active')
  } finally {
    server.close()
  }
})
