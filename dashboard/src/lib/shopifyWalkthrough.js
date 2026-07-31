/**
 * Shopify install walkthrough — the SINGLE SOURCE for what steps exist and in what order.
 *
 * ── Why this file, and not api/lib/platform-guides.js ────────────────────────────────
 * The obvious home for shared install copy is api/lib/, which is where the other platform
 * guides live. It cannot be, and the reason is a deploy boundary rather than a preference:
 * Railway builds the Dashboard service with rootDirectory=/dashboard, so nothing under
 * dashboard/src may import from api/ — that is #252, which passed CI (built from the repo
 * root) and broke the prod deploy. api/tests/dashboard-build-root.test.js enforces it.
 *
 * The inverse direction IS safe and is the proven precedent (api/lib/source-normalizer.js
 * re-exports from dashboard/src/lib): the API service builds from the repo root, so
 * api/ -> dashboard/ resolves everywhere. So the shared constant lives here, under
 * dashboard/, and api/lib/platform-guides.js reaches in for it.
 *
 * Consumers, all reading THIS array:
 *   · dashboard/src/pages/Onboarding.jsx      — the in-wizard guided flow
 *   · api/lib/platform-guides.js              — re-exports, numbered, for PLATFORM_GUIDES
 *   · mcp/lib/tools.js -> get_install_snippet — what an AI agent is told to do
 *   · dashboard/src/pages/docs/DocsShopify.jsx — pinned by the sync guard in
 *     api/tests/mcp-server.test.js, so the public page cannot drift from this list
 *
 * ── Why step 6 is its own required step ──────────────────────────────────────────────
 * It was previously absent here and folded into a coverage note that named only the order
 * webhook, "for order revenue attribution". That reads as sufficient and is not: the
 * webhook delivers the order's REVENUE, and the cart attribute is what makes that revenue
 * ATTRIBUTABLE. A merchant — or an agent reading get_install_snippet — who followed the
 * old list shipped a store that recorded purchases against no visitor at all, and nothing
 * in the product would have said so. Steps 6 and 7 are therefore separate and both
 * required, and step 7's wording states which of the two does which job.
 */

// OPTIONAL, and deliberately not part of SHOPIFY_STEPS. Core attribution — visitor to
// order to revenue — is complete after step 7; these three add pre-checkout storefront
// events on top of it. They are the one piece of #520 that nothing else in the repo
// duplicates, so they stay. They are kept OUT of the required list because folding them in
// would make a merchant who skipped them think their attribution was incomplete when it is
// not, which is the inverse of the failure step 6 exists to prevent.
export const SHOPIFY_OPTIONAL_SNIPPETS = [
  {
    id: 'product_viewed',
    name: 'Product View Event',
    event: 'product_viewed',
    targetFile: 'sections/main-product.liquid or templates/product.liquid',
    description: 'Track when a customer views a product page on your storefront.',
    codeLang: 'html',
    codeSnippet: `{% if template contains 'product' %}
<script>
  if (window.sourcetrack) {
    window.sourcetrack.track('product_viewed', {
      product_id: '{{ product.id }}',
      product_name: {{ product.title | json }},
      price: {{ product.price | divided_by: 100.0 }},
      currency: {{ cart.currency.iso_code | json }},
      vendor: {{ product.vendor | json }},
      category: {{ product.type | json }}
    });
  }
</script>
{% endif %}`
  },
  {
    id: 'add_to_cart',
    name: 'Add-to-Cart Event',
    event: 'add_to_cart',
    targetFile: 'sections/main-product.liquid or theme.liquid',
    description: 'Track when a customer submits the Add to Cart form on a product page.',
    codeLang: 'html',
    codeSnippet: `<script>
  document.addEventListener('DOMContentLoaded', function() {
    var atcForm = document.querySelector('form[action*="/cart/add"]');
    if (atcForm) {
      atcForm.addEventListener('submit', function() {
        if (window.sourcetrack) {
          window.sourcetrack.track('add_to_cart', {
            product_id: '{{ product.id }}',
            product_name: {{ product.title | json }},
            price: {{ product.price | divided_by: 100.0 }},
            currency: {{ cart.currency.iso_code | json }}
          });
        }
      });
    }
  });
</script>`
  },
  {
    id: 'checkout_initiated',
    name: 'Checkout Initiated Event',
    event: 'checkout_initiated',
    targetFile: 'templates/cart.liquid or theme.liquid',
    description: 'Track when a customer clicks the Checkout button on the cart page or drawer.',
    codeLang: 'html',
    codeSnippet: `<script>
  document.addEventListener('DOMContentLoaded', function() {
    var checkoutBtns = document.querySelectorAll('form[action*="/checkout"] [name="checkout"], a[href*="/checkout"]');
    checkoutBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (window.sourcetrack) {
          window.sourcetrack.track('checkout_initiated', {
            cart_total: {{ cart.total_price | divided_by: 100.0 }},
            item_count: {{ cart.item_count }},
            currency: {{ cart.currency.iso_code | json }}
          });
        }
      });
    });
  });
</script>`
  }
]

// The st_aid cart attribute (step 6). Kept as a named export because it is the one piece
// of code a merchant needs that is NOT the tracker snippet, and both the docs page and any
// future in-wizard code block have to show the identical thing.
export const SHOPIFY_CART_ATTRIBUTE_SNIPPET = `// Read st_aid from localStorage and forward it as a Shopify cart attribute
const visitorId = localStorage.getItem('st_aid');
if (visitorId) {
  fetch(window.Shopify.routes.root + 'cart/update.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes: { 'st_aid': visitorId } })
  });
}`

// UNNUMBERED on purpose: the wizard and the docs page both render these inside an ordered
// list, so a leading "1." in the string would double-number. api/lib/platform-guides.js
// adds the numbers for its own consumers, which is the shape MCP has always returned.
export const SHOPIFY_STEPS = [
  'In your Shopify Admin, go to Online Store > Themes.',
  'On your current theme, click the action dropdown (the three dots) and select Edit Code.',
  'Open the layout/theme.liquid file.',
  'Paste the tracking script directly before the closing </head> tag.',
  'Save theme.liquid. Shopify publishes the change to your live theme straight away.',
  'Still in your theme, add the cart-attribute snippet so the anonymous visitor ID (st_aid) is saved onto the Shopify cart and travels with the order.',
  'In Shopify Admin > Settings > Notifications, create an orders/paid webhook pointing at /api/webhooks/shopify/YOUR_SITE_KEY. The webhook delivers the order revenue; step 6 is what makes that revenue attributable, so a store with the webhook alone records purchases against no visitor.'
]

// The index of the cart-attribute step, so a consumer can pair it with the snippet above
// without matching on copy. Asserted in api/tests/shopify-snippets.test.js.
export const SHOPIFY_CART_ATTRIBUTE_STEP_INDEX = 5
