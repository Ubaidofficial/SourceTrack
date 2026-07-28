// Single source of truth for platform install guides and step-by-step walkthroughs.
// Sourced from dashboard/src/pages/docs/DocsShopify.jsx and platform documentation pages.
// Kept in sync with frontend DocsShopify.jsx via automated sync guard test.

export const SHOPIFY_STEPS = [
  '1. In your Shopify Admin, go to Online Store > Themes.',
  '2. Click the action dropdown (the three dots) and select Edit Code.',
  '3. Open the layout/theme.liquid file.',
  '4. Paste the tracking script directly before the closing </head> tag.',
  '5. Save theme.liquid.',
  '6. (Coverage Note) SourceTrack uses manual snippet placement. For order revenue attribution, set up an orders/paid webhook in Shopify Admin > Settings > Notifications pointing to /api/webhooks/shopify/:site_key.'
]

export const WORDPRESS_STEPS = [
  '1. Log into WordPress Admin.',
  '2. Install and activate "Insert Headers and Footers" plugin.',
  '3. Paste the snippet into the Header section.',
  '4. Save changes and clear any active caching plugins.'
]

export const WEBFLOW_STEPS = [
  '1. In Webflow Dashboard, open Project Settings > Custom Code.',
  '2. Paste the snippet into the Head Code section.',
  '3. Save changes and Publish your Webflow site.'
]

export const GTM_STEPS = [
  '1. Open Google Tag Manager container.',
  '2. Create a new Custom HTML Tag.',
  '3. Paste the snippet into the HTML field.',
  '4. Set Triggering to "All Pages".',
  '5. Save and Publish container.'
]

export const HTML_STEPS = [
  '1. Open your main HTML template file.',
  '2. Paste the snippet into the <head> section of every page.'
]

export const PLATFORM_GUIDES = {
  shopify: {
    doc_url: '/docs/platforms/shopify',
    steps: SHOPIFY_STEPS
  },
  wordpress: {
    doc_url: '/docs/platforms/wordpress',
    steps: WORDPRESS_STEPS
  },
  webflow: {
    doc_url: '/docs/platforms/webflow',
    steps: WEBFLOW_STEPS
  },
  gtm: {
    doc_url: '/docs/platforms/google-tag-manager',
    steps: GTM_STEPS
  },
  html: {
    doc_url: null,
    steps: HTML_STEPS
  }
}
