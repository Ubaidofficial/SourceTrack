// #520 shipped this module with a 4-entry object-shaped SHOPIFY_STEPS (3 coarse required
// phases + 1 optional section) that NOTHING imported — its only consumer was this test.
// Meanwhile the wizard and api/lib/platform-guides.js each carried their own list, and
// both omitted the st_aid cart attribute this file was the only place to describe. The
// required steps are now the single shared list (asserted against every consumer in
// api/tests/onboarding-shopify-guided-install.test.js), so the assertions below cover what
// is genuinely unique to this file: the OPTIONAL storefront event snippets, and the
// cart-attribute snippet the required list points at.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SHOPIFY_STEPS,
  SHOPIFY_OPTIONAL_SNIPPETS,
  SHOPIFY_CART_ATTRIBUTE_SNIPPET,
  SHOPIFY_CART_ATTRIBUTE_STEP_INDEX
} from '../../dashboard/src/lib/shopifyWalkthrough.js'

test('SHOPIFY_STEPS: the required list is plain ordered strings, and is actually consumed', () => {
  assert.ok(Array.isArray(SHOPIFY_STEPS) && SHOPIFY_STEPS.length >= 7)
  for (const step of SHOPIFY_STEPS) {
    assert.equal(typeof step, 'string', 'steps are rendered inside an <ol> by three consumers')
    assert.ok(!/^\d+\.\s/.test(step), 'steps must be UNNUMBERED here or the <ol> double-numbers')
  }
  // The optional snippets are deliberately NOT in the required list: a merchant who skips
  // them still has complete visitor -> order -> revenue attribution.
  assert.ok(
    !SHOPIFY_STEPS.some(s => /product_viewed|add_to_cart|checkout_initiated/.test(s)),
    'optional storefront events must not be presented as required install steps'
  )
})

test('SHOPIFY_CART_ATTRIBUTE_SNIPPET: the code behind the step that makes revenue attributable', () => {
  assert.match(SHOPIFY_STEPS[SHOPIFY_CART_ATTRIBUTE_STEP_INDEX], /st_aid/,
    'the index must point at the cart-attribute step, not drift off it')
  assert.match(SHOPIFY_CART_ATTRIBUTE_SNIPPET, /localStorage\.getItem\('st_aid'\)/,
    'it reads the visitor id the tracker actually stores')
  assert.match(SHOPIFY_CART_ATTRIBUTE_SNIPPET, /cart\/update\.js/, 'it writes to the Shopify cart')
  assert.match(SHOPIFY_CART_ATTRIBUTE_SNIPPET, /attributes/, 'it writes a cart ATTRIBUTE, which is what reaches the order')
  // The webhook reads note_attributes looking for st_aid; a different key silently breaks
  // stitching, so the key is pinned.
  assert.match(SHOPIFY_CART_ATTRIBUTE_SNIPPET, /'st_aid':\s*visitorId/, "the attribute key must be exactly 'st_aid'")
})

test('SHOPIFY_OPTIONAL_SNIPPETS: 3 pre-checkout storefront events with valid API usage', () => {
  assert.equal(SHOPIFY_OPTIONAL_SNIPPETS.length, 3)

  const events = SHOPIFY_OPTIONAL_SNIPPETS.map(s => s.event)
  assert.deepEqual(events, ['product_viewed', 'add_to_cart', 'checkout_initiated'])

  for (const snippet of SHOPIFY_OPTIONAL_SNIPPETS) {
    assert.ok(snippet.id, 'Snippet has id')
    assert.ok(snippet.name, 'Snippet has name')
    assert.ok(snippet.targetFile, 'Snippet has targetFile recommendation')
    assert.ok(snippet.description, 'Snippet has description')
    assert.ok(snippet.codeSnippet, 'Snippet has codeSnippet')

    // Must use window.sourcetrack.track(event, properties)
    assert.ok(
      snippet.codeSnippet.includes(`window.sourcetrack.track('${snippet.event}',`),
      `Snippet ${snippet.id} correctly invokes window.sourcetrack.track('${snippet.event}', ...)`
    )

    // Must check window.sourcetrack guard
    assert.ok(
      snippet.codeSnippet.includes('if (window.sourcetrack)'),
      `Snippet ${snippet.id} guards against missing tracker`
    )
  }
})

test('Liquid field mapping: snippets match native Shopify theme object model', () => {
  const [productView, addToCart, checkoutInitiated] = SHOPIFY_OPTIONAL_SNIPPETS

  // Product View checks
  assert.ok(productView.codeSnippet.includes("product_id: '{{ product.id }}'"))
  assert.ok(productView.codeSnippet.includes('product_name: {{ product.title | json }}'))
  assert.ok(productView.codeSnippet.includes('price: {{ product.price | divided_by: 100.0 }}'))
  assert.ok(productView.codeSnippet.includes('currency: {{ cart.currency.iso_code | json }}'))
  assert.ok(productView.codeSnippet.includes('vendor: {{ product.vendor | json }}'))
  assert.ok(productView.codeSnippet.includes('category: {{ product.type | json }}'))

  // Add to Cart checks
  assert.ok(addToCart.codeSnippet.includes("form[action*=\"/cart/add\"]"))
  assert.ok(addToCart.codeSnippet.includes("product_id: '{{ product.id }}'"))
  assert.ok(addToCart.codeSnippet.includes('price: {{ product.price | divided_by: 100.0 }}'))

  // Checkout Initiated checks
  assert.ok(checkoutInitiated.codeSnippet.includes("form[action*=\"/checkout\"] [name=\"checkout\"], a[href*=\"/checkout\"]"))
  assert.ok(checkoutInitiated.codeSnippet.includes('cart_total: {{ cart.total_price | divided_by: 100.0 }}'))
  assert.ok(checkoutInitiated.codeSnippet.includes('item_count: {{ cart.item_count }}'))
  assert.ok(checkoutInitiated.codeSnippet.includes('currency: {{ cart.currency.iso_code | json }}'))
})
