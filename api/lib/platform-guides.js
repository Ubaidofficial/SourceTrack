// Single source of truth for platform install guides and step-by-step walkthroughs.
// Sourced from dashboard/src/pages/docs/DocsShopify.jsx and platform documentation pages.
// Kept in sync with frontend DocsShopify.jsx via automated sync guard test.

// Shopify's steps are NOT defined here. They are shared with the in-wizard flow
// (dashboard/src/pages/Onboarding.jsx), and dashboard/src may not import from api/ —
// Railway builds the Dashboard service with rootDirectory=/dashboard, so that direction
// does not resolve at deploy time (#252; guarded by api/tests/dashboard-build-root.test.js).
// api/ -> dashboard/ is the safe direction and the proven precedent
// (api/lib/source-normalizer.js does the same), so the constant lives under dashboard/ and
// this file reaches in. One list, one place to correct it.
import { SHOPIFY_STEPS as SHOPIFY_WALKTHROUGH_STEPS } from '../../dashboard/src/lib/shopifyWalkthrough.js'

// Numbered here rather than in the shared array: the wizard and docs page render these in
// an <ol> and would double-number, while MCP's get_install_snippet has always returned
// "1. …" strings and callers may rely on that shape.
export const SHOPIFY_STEPS = SHOPIFY_WALKTHROUGH_STEPS.map((step, i) => `${i + 1}. ${step}`)

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
