/**
 * Shopify integration walkthrough steps and ready-made Liquid/JS event snippets.
 *
 * Base installation steps (Steps 1–3) are required for base Shopify order attribution via webhooks.
 * Pre-checkout storefront event snippets (Product View, Add to Cart, Checkout Initiated)
 * are optional extensions using window.sourcetrack.track(event, properties).
 */

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

export const SHOPIFY_STEPS = [
  {
    stepNumber: '1',
    title: 'Storefront Pixel Tracking',
    required: true,
    description: 'Add the standard SourceTrack pixel script to your storefront theme to log UTMs and referrers.',
    codeSnippet: `<script async src="https://api.srctk.com/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`
  },
  {
    stepNumber: '2',
    title: 'Capture Visitor ID in Shopify Cart',
    required: true,
    description: 'To link checkout purchases with marketing sessions, store the anonymous visitor ID (st_aid) as a cart attribute.',
    codeSnippet: `const visitorId = localStorage.getItem('st_aid');
if (visitorId) {
  fetch(window.Shopify.routes.root + 'cart/update.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes: { 'st_aid': visitorId } })
  });
}`
  },
  {
    stepNumber: '3',
    title: 'Connect Order Webhooks',
    required: true,
    description: 'Configure a webhook inside Shopify to forward order details to your SourceTrack endpoint on purchase confirmation.'
  },
  {
    stepNumber: 'Optional',
    title: 'Optional: Pre-Checkout Storefront Event Snippets',
    required: false,
    collapsed: true,
    description: 'Track pre-checkout storefront interactions (Product View, Add to Cart, Checkout Initiated) using ready-made Liquid/JS snippets.',
    optionalSnippets: SHOPIFY_OPTIONAL_SNIPPETS
  }
]
