import test from 'node:test'
import assert from 'node:assert/strict'
import { SHOPIFY_STEPS, SHOPIFY_OPTIONAL_SNIPPETS } from '../../dashboard/src/lib/shopifyWalkthrough.js'

test('SHOPIFY_STEPS: structural completeness and standalone base steps', () => {
  assert.equal(SHOPIFY_STEPS.length, 4, 'SHOPIFY_STEPS contains 3 required steps + 1 optional section')

  // Steps 1-3 must be required base steps
  assert.equal(SHOPIFY_STEPS[0].stepNumber, '1')
  assert.equal(SHOPIFY_STEPS[0].required, true)
  assert.equal(SHOPIFY_STEPS[1].stepNumber, '2')
  assert.equal(SHOPIFY_STEPS[1].required, true)
  assert.equal(SHOPIFY_STEPS[2].stepNumber, '3')
  assert.equal(SHOPIFY_STEPS[2].required, true)

  // Step 4 is the optional storefront events section
  assert.equal(SHOPIFY_STEPS[3].stepNumber, 'Optional')
  assert.equal(SHOPIFY_STEPS[3].required, false)
  assert.equal(SHOPIFY_STEPS[3].collapsed, true)
  assert.ok(Array.isArray(SHOPIFY_STEPS[3].optionalSnippets))
  assert.equal(SHOPIFY_STEPS[3].optionalSnippets.length, 3)
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
