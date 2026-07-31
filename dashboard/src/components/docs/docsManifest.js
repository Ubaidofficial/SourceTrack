// Single source of truth for every /docs/* and /developers/* page.
// The sidebar, home cards, breadcrumbs, AND search all derive from THIS — never
// duplicate the list. To add a doc page: add its route in App.jsx and one entry here.
//
// Shape: { to, title, description, keywords[], section, icon?, logoDomain? }
//  - `section` groups entries for the sidebar + home (see SECTIONS below).
//  - `icon` is a lucide-react component (concept/action cards + sidebar).
//  - `logoDomain` renders a brand LogoChip instead of an icon (platform recipes).
//  - `description` is the ONE-LINE card/search copy — keep it to a single line.
import {
  BookOpen, Rocket, Code2, LifeBuoy, Terminal, Braces, MousePointerClick,
  Upload, UserCheck, Webhook, DollarSign, ShieldCheck, Bot
} from 'lucide-react'

export const DOCS_MANIFEST = [
  // ── Start here ──────────────────────────────────────────────────────────────
  { to: '/docs', title: 'Overview', description: 'Where to begin — install, verify, and connect revenue.', section: 'start', icon: BookOpen, keywords: ['docs', 'home', 'overview', 'getting started', 'introduction'] },
  { to: '/docs/quickstart', title: 'Quickstart', description: 'Set up tracking in under five minutes with a guided checklist.', section: 'start', icon: Rocket, keywords: ['quickstart', 'setup', 'getting started', 'checklist', '5 minutes'] },
  { to: '/docs/install', title: 'Install the script', description: 'Where and how to add the SourceTrack pixel to your site.', section: 'start', icon: Code2, keywords: ['install', 'script', 'pixel', 'snippet', 'tracker', 'head', 'tag'] },

  // ── Platform recipes ────────────────────────────────────────────────────────
  { to: '/docs/platforms/google-ads', title: 'Google Ads', description: 'Import conversions and stitch paid clicks (gclid) to revenue.', section: 'platforms', logoDomain: 'google.com', keywords: ['google ads', 'gclid', 'ppc', 'paid search', 'conversions', 'adwords'] },
  { to: '/docs/platforms/google-tag-manager', title: 'Google Tag Manager', description: 'Deploy the script via a GTM Custom HTML tag.', section: 'platforms', logoDomain: 'tagmanager.google.com', keywords: ['gtm', 'google tag manager', 'tag', 'container', 'custom html'] },
  { to: '/docs/platforms/webflow', title: 'Webflow', description: 'Add tracking to Webflow sites via page-header custom code.', section: 'platforms', logoDomain: 'webflow.com', keywords: ['webflow', 'no-code', 'custom code', 'header'] },
  { to: '/docs/platforms/wordpress', title: 'WordPress', description: 'Install the code manually or via a header template.', section: 'platforms', logoDomain: 'wordpress.org', keywords: ['wordpress', 'wp', 'plugin', 'header', 'theme', 'php'] },
  { to: '/docs/platforms/framer', title: 'Framer', description: 'Add first-party tracking to Framer landing pages.', section: 'platforms', logoDomain: 'framer.com', keywords: ['framer', 'no-code', 'landing page', 'custom code'] },
  { to: '/docs/platforms/shopify', title: 'Shopify (Manual)', description: 'Cart-attribute and order-webhook setup for Shopify.', section: 'platforms', logoDomain: 'shopify.com', keywords: ['shopify', 'ecommerce', 'cart', 'order', 'webhook', 'checkout'] },
  { to: '/docs/platforms/stripe', title: 'Stripe (Manual)', description: 'Stitch Stripe checkouts, subscriptions, and refunds to sources.', section: 'platforms', logoDomain: 'stripe.com', keywords: ['stripe', 'checkout', 'subscription', 'refund', 'webhook', 'billing', 'payments'] },

  // ── Help & Security ─────────────────────────────────────────────────────────
  { to: '/docs/mcp', title: 'AI assistants (MCP)', description: 'Connect Claude or ChatGPT to your setup diagnostics, read-only.', section: 'help', icon: Bot, keywords: ['mcp', 'model context protocol', 'ai', 'claude', 'chatgpt', 'assistant', 'agent', 'tools', 'remote server'] },
  { to: '/docs/troubleshooting', title: 'Troubleshooting', description: 'Fix missing conversions, pageviews, or domain mismatches.', section: 'help', icon: LifeBuoy, keywords: ['troubleshooting', 'debug', 'help', 'not working', 'missing', 'no data', 'fix'] },
  { to: '/developers', title: 'Developer Portal', description: 'REST API specs, tracker config, and payload references.', section: 'help', icon: Terminal, keywords: ['developer', 'api', 'portal', 'reference', 'sdk'] },

  // ── Developer reference ─────────────────────────────────────────────────────
  { to: '/developers/api', title: 'API Reference', description: 'Endpoints, auth, and request/response payloads.', section: 'reference', icon: Braces, keywords: ['api', 'rest', 'endpoint', 'auth', 'token', 'reference', 'payload'] },
  { to: '/developers/tracker', title: 'Tracker SDK', description: 'Configure and call the browser tracker programmatically.', section: 'reference', icon: Code2, keywords: ['tracker', 'sdk', 'javascript', 'browser', 'client', 'config'] },
  { to: '/developers/conversions', title: 'Browser conversions', description: 'Record conversion events from client-side actions.', section: 'reference', icon: MousePointerClick, keywords: ['conversion', 'browser', 'client', 'event', 'track'] },
  { to: '/developers/offline-conversions', title: 'Offline conversions', description: 'Send server-side and backend conversions via the API.', section: 'reference', icon: Upload, keywords: ['offline', 'conversion', 'server', 'backend', 'crm', 'api', 'refund'] },
  { to: '/developers/identify', title: 'User stitching (Identify)', description: 'Link anonymous visitors to known users with Identify.', section: 'reference', icon: UserCheck, keywords: ['identify', 'stitch', 'user', 'anonymous', 'identity', 'merge', 'email'] },
  { to: '/developers/webhooks', title: 'Outbound & webhooks', description: 'Receive and send signed conversion/revenue webhooks.', section: 'reference', icon: Webhook, keywords: ['webhook', 'outbound', 'hmac', 'signature', 'event', 'notify'] },
  { to: '/developers/campaign-costs', title: 'Campaign costs API/CSV', description: 'Upload ad-spend by campaign for ROAS and CAC.', section: 'reference', icon: DollarSign, keywords: ['campaign', 'cost', 'ad spend', 'roas', 'cac', 'csv', 'budget'] },
  { to: '/developers/security', title: 'Security specs', description: 'Data handling, PII scope, tokens, and privacy model.', section: 'reference', icon: ShieldCheck, keywords: ['security', 'privacy', 'pii', 'token', 'gdpr', 'data', 'encryption'] }
]

// Section metadata — label + which sidebar (user docs vs developer portal) shows it,
// and the home-grid column density. Order here is the render order.
export const SECTIONS = [
  { id: 'start', label: 'Get started', homeLabel: 'Start here', cols: 2, sidebar: 'user' },
  { id: 'platforms', label: 'Platform guides', homeLabel: 'Platform recipes', cols: 3, sidebar: 'user' },
  { id: 'help', label: 'Help & Security', homeLabel: 'Help & Developer Portal', cols: 2, sidebar: 'user' },
  { id: 'reference', label: 'Reference', homeLabel: 'Developer reference', cols: 2, sidebar: 'dev' }
]

export const bySection = (id) => DOCS_MANIFEST.filter((e) => e.section === id)

// Longest-prefix match so nested routes still resolve to their manifest entry.
export const entryForPath = (pathname) => {
  const exact = DOCS_MANIFEST.find((e) => e.to === pathname)
  if (exact) return exact
  return DOCS_MANIFEST
    .filter((e) => e.to !== '/docs' && e.to !== '/developers' && pathname.startsWith(e.to))
    .sort((a, b) => b.to.length - a.to.length)[0] || null
}

export const sectionLabel = (id) => SECTIONS.find((s) => s.id === id)?.label || ''
