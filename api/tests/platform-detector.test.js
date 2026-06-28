import test from 'node:test'
import assert from 'node:assert'

import { classifyHtml, detectPlatform } from '../lib/platform-detector.js'

// classifyHtml is the pure, network-free core: HTML/header haystack -> verdict.

test('shopify: two signals -> high confidence', () => {
  const html = '<script src="https://cdn.shopify.com/x.js"></script> powered by Shopify'
  const r = classifyHtml(html)
  assert.equal(r.platform, 'shopify')
  assert.equal(r.confidence, 'high')
  assert.deepEqual(r.signals, ['cdn.shopify.com', 'Shopify'])
})

test('shopify: header-only signal counts (case-sensitive token)', () => {
  const r = classifyHtml('<html></html>', 'link: <https://cdn.shopify.com>; rel=preconnect')
  assert.equal(r.platform, 'shopify')
  assert.equal(r.confidence, 'medium')
  assert.deepEqual(r.signals, ['cdn.shopify.com'])
})

test('wordpress: single signal -> medium', () => {
  const r = classifyHtml('<link href="/wp-content/themes/x/style.css">')
  assert.equal(r.platform, 'wordpress')
  assert.equal(r.confidence, 'medium')
  assert.deepEqual(r.signals, ['/wp-content/'])
})

test('priority order: shopify wins over wordpress when both present', () => {
  const r = classifyHtml('cdn.shopify.com and /wp-content/ both here')
  assert.equal(r.platform, 'shopify')
})

test('wix detection', () => {
  const r = classifyHtml('<img src="https://static.wixstatic.com/media/x.png">')
  assert.equal(r.platform, 'wix')
  assert.equal(r.confidence, 'medium')
})

test('squarespace via SQUARESPACE_CONTEXT', () => {
  const r = classifyHtml('<script>window.SQUARESPACE_CONTEXT = {};</script>')
  assert.equal(r.platform, 'squarespace')
})

test('webflow via data-wf-site attribute', () => {
  const r = classifyHtml('<html data-wf-site="abc123">')
  assert.equal(r.platform, 'webflow')
})

test('custom fallback -> low confidence, no signals', () => {
  const r = classifyHtml('<html><body>just a plain site</body></html>')
  assert.equal(r.platform, 'custom')
  assert.equal(r.confidence, 'low')
  assert.deepEqual(r.signals, [])
})

test('gtm_present is independent of platform', () => {
  const a = classifyHtml('cdn.shopify.com <script src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script>')
  assert.equal(a.gtm_present, true)
  const b = classifyHtml('<html>plain</html>')
  assert.equal(b.gtm_present, false)
  assert.equal(b.platform, 'custom')
})

// detectPlatform must never throw and must fail closed on bad input.

test('detectPlatform: rejects non-hostnames without fetching', async () => {
  for (const bad of ['', null, 'localhost', '127.0.0.1', 'no-dot', 'has space.com', 'http://x']) {
    const r = await detectPlatform(bad)
    assert.equal(r.error, true)
    assert.equal(r.platform, 'unknown')
    assert.equal(r.confidence, 'low')
    assert.deepEqual(r.signals, [])
  }
})
