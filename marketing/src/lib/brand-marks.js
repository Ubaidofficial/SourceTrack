/**
 * BRAND MARK REGISTRY — design.md §3.4 + §35.4.
 *
 * ── WHY A REGISTRY AND NOT AN ICON IMPORT ───────────────────────────────────
 * §35.4: "Never reconstruct, approximate, or extract-and-repurpose a brand asset or
 * logo… Use a plain text label instead. When sourcing IS available, confirm the URL is
 * the company's own domain — not an aggregator, icon library, or resale site."
 *
 * Founder ruling 2026-08-08: official sourcing only, for all ~90 marks the v4 design
 * needs. No icon library, including CC0 ones.
 *
 * That is weeks of per-vendor work, and it must not block the sections that use these
 * marks. So provenance lives in DATA rather than in whoever remembers: a mark renders
 * its official SVG only when this file records where that SVG came from, and renders a
 * PLAIN TEXT LABEL otherwise. The Coverage grid, the marquee and the orbit are all
 * shippable today and improve mark-by-mark as sourcing lands. Nothing is ever
 * approximated to fill a gap — that is the exact failure §35.4 was written for
 * (issue #577's fabricated Perplexity hexagon, resolved to a text label in #583).
 *
 * ── HOW TO SOURCE ONE ───────────────────────────────────────────────────────
 *  1. Find the vendor's OWN brand/press page. Not a CDN, not an aggregator, not
 *     Wikipedia, not an icon set.
 *  2. Read their brand terms. Many permit identifying use in a comparison or an
 *     integrations list; some do not. If they do not, or there is no brand page at
 *     all, leave status 'label' — that is a correct outcome, not a failure.
 *  3. Save the SVG to marketing/public/brand/<slug>.svg.
 *  4. Set status:'sourced' and fill `brandPage` with the exact URL you took it from,
 *     plus `terms` with a one-line note on what it permits.
 *
 * api/tests/brand-mark-provenance.test.js enforces the invariants:
 *   · every 'sourced' mark HAS a file, a brandPage on the vendor's own domain, and terms
 *   · no 'sourced' mark points at a known aggregator or icon library
 *   · every mark any component references EXISTS here
 * A mark cannot become 'sourced' without its provenance, which is what stops this
 * decaying into an undocumented icon dump six months from now.
 *
 * `name` is the accessible name AND the text-label fallback, so it is never optional.
 */

/** @typedef {{ name: string, status: 'sourced'|'label', brandPage?: string, terms?: string }} Mark */

/** Hosts a 'sourced' mark may never come from. Enforced in CI. */
export const FORBIDDEN_SOURCES = [
  'simpleicons.org', 'cdn.simpleicons.org', 'iconify.design', 'icons8.com',
  'flaticon.com', 'fontawesome.com', 'worldvectorlogo.com', 'seeklogo.com',
  'vectorlogo.zone', 'logo.clearbit.com', 'wikipedia.org', 'wikimedia.org',
  'github.com/simple-icons'
]

/**
 * @type {Record<string, Mark>}
 *
 * Enumerated from the v4 design bundle: five Coverage tabs, the marquee, the hero
 * orbit, the product tour, the journey and the comparison table. Every entry starts
 * 'label' — a mark is promoted only when someone does step 1-4 above for it.
 */
export const MARKS = {
  // ── Forms (Coverage tab 1) ────────────────────────────────────────────────
  'hubspot-forms':  { name: 'HubSpot Forms', status: 'label' },
  'webflow':        { name: 'Webflow', status: 'label' },
  'typeform':       { name: 'Typeform', status: 'label' },
  'jotform':        { name: 'Jotform', status: 'label' },
  'tally':          { name: 'Tally', status: 'label' },
  'paperform':      { name: 'Paperform', status: 'label' },
  'gravity-forms':  { name: 'Gravity Forms', status: 'label' },
  'wpforms':        { name: 'WPForms', status: 'label' },
  'ninja-forms':    { name: 'Ninja Forms', status: 'label' },
  'contact-form-7': { name: 'Contact Form 7', status: 'label' },
  'formidable':     { name: 'Formidable', status: 'label' },
  'fluent-forms':   { name: 'Fluent Forms', status: 'label' },
  'forminator':     { name: 'Forminator', status: 'label' },
  'formstack':      { name: 'Formstack', status: 'label' },
  'wufoo':          { name: 'Wufoo', status: 'label' },
  'google-forms':   { name: 'Google Forms', status: 'label' },
  'cognito-forms':  { name: 'Cognito Forms', status: 'label' },
  'unbounce':       { name: 'Unbounce', status: 'label' },
  'leadpages':      { name: 'Leadpages', status: 'label' },
  'clickfunnels':   { name: 'ClickFunnels', status: 'label' },
  'mailchimp':      { name: 'Mailchimp', status: 'label' },
  'kit':            { name: 'Kit', status: 'label' },
  'klaviyo':        { name: 'Klaviyo', status: 'label' },
  'activecampaign': { name: 'ActiveCampaign', status: 'label' },
  'marketo':        { name: 'Marketo', status: 'label' },
  'pardot':         { name: 'Pardot', status: 'label' },
  'squarespace':    { name: 'Squarespace', status: 'label' },
  'wix-forms':      { name: 'Wix Forms', status: 'label' },
  'wordpress':      { name: 'WordPress', status: 'label' },
  'carrd':          { name: 'Carrd', status: 'label' },

  // ── Chat (tab 2) ──────────────────────────────────────────────────────────
  'intercom':       { name: 'Intercom', status: 'label' },
  'drift':          { name: 'Drift', status: 'label' },
  'crisp':          { name: 'Crisp', status: 'label' },
  'tidio':          { name: 'Tidio', status: 'label' },
  'hubspot-chat':   { name: 'HubSpot Chat', status: 'label' },
  'zendesk':        { name: 'Zendesk', status: 'label' },
  'livechat':       { name: 'LiveChat', status: 'label' },
  'tawk-to':        { name: 'Tawk.to', status: 'label' },
  'freshchat':      { name: 'Freshchat', status: 'label' },
  'chatwoot':       { name: 'Chatwoot', status: 'label' },
  'olark':          { name: 'Olark', status: 'label' },
  'front':          { name: 'Front', status: 'label' },
  'help-scout':     { name: 'Help Scout', status: 'label' },
  'gorgias':        { name: 'Gorgias', status: 'label' },
  'smartsupp':      { name: 'Smartsupp', status: 'label' },

  // ── Meetings (tab 3) ──────────────────────────────────────────────────────
  'calendly':          { name: 'Calendly', status: 'label' },
  'cal-com':           { name: 'Cal.com', status: 'label' },
  'hubspot-meetings':  { name: 'HubSpot Meetings', status: 'label' },
  'savvycal':          { name: 'SavvyCal', status: 'label' },
  'chili-piper':       { name: 'Chili Piper', status: 'label' },
  'tidycal':           { name: 'TidyCal', status: 'label' },
  'zcal':              { name: 'Zcal', status: 'label' },
  'acuity':            { name: 'Acuity', status: 'label' },
  'youcanbookme':      { name: 'YouCanBook.me', status: 'label' },
  'google-calendar':   { name: 'Google Calendar', status: 'label' },
  'microsoft-bookings':{ name: 'Microsoft Bookings', status: 'label' },

  // ── Payments & stores (tab 4) ─────────────────────────────────────────────
  'stripe':         { name: 'Stripe', status: 'label' },
  'paddle':         { name: 'Paddle', status: 'label' },
  'chargebee':      { name: 'Chargebee', status: 'label' },
  'lemon-squeezy':  { name: 'Lemon Squeezy', status: 'label' },
  'shopify':        { name: 'Shopify', status: 'label' },
  'woocommerce':    { name: 'WooCommerce', status: 'label' },
  'bigcommerce':    { name: 'BigCommerce', status: 'label' },
  'magento':        { name: 'Magento', status: 'label' },
  'ecwid':          { name: 'Ecwid', status: 'label' },
  'prestashop':     { name: 'PrestaShop', status: 'label' },
  'wix-stores':     { name: 'Wix Stores', status: 'label' },

  // ── CRM & ad platforms (tab 5) + hero orbit destinations ──────────────────
  'google-ads':     { name: 'Google Ads', status: 'label' },
  'meta-capi':      { name: 'Meta CAPI', status: 'label' },
  'linkedin-capi':  { name: 'LinkedIn CAPI', status: 'label' },
  'tiktok-events':  { name: 'TikTok Events', status: 'label' },
  'snap-capi':      { name: 'Snap CAPI', status: 'label' },
  'pinterest':      { name: 'Pinterest', status: 'label' },
  'microsoft-ads':  { name: 'Microsoft Ads', status: 'label' },
  'reddit-ads':     { name: 'Reddit Ads', status: 'label' },
  'x-ads':          { name: 'X Ads', status: 'label' },
  'hubspot':        { name: 'HubSpot', status: 'label' },
  'salesforce':     { name: 'Salesforce', status: 'label' },
  'pipedrive':      { name: 'Pipedrive', status: 'label' },
  'attio':          { name: 'Attio', status: 'label' },
  'zapier':         { name: 'Zapier', status: 'label' },
  'slack':          { name: 'Slack', status: 'label' },
  'webhooks':       { name: 'Webhooks', status: 'label' },

  // ── Channels / AI assistants (marquee, tour, journey) ─────────────────────
  'chatgpt':        { name: 'ChatGPT', status: 'label' },
  'claude':         { name: 'Claude', status: 'label' },
  'gemini':         { name: 'Gemini', status: 'label' },
  'copilot':        { name: 'Copilot', status: 'label' },
  // No official brand page exists — confirmed via search during issue #577, resolved
  // to a plain text label in PR #583. This one is SETTLED as 'label', not pending.
  'perplexity':     { name: 'Perplexity', status: 'label' },
  'google-organic': { name: 'Google', status: 'label' },
  'search-console': { name: 'Search Console', status: 'label' },
  'linkedin':       { name: 'LinkedIn', status: 'label' },
  'meta-ads':       { name: 'Meta Ads', status: 'label' },

  // ── Comparison table (§35.3 as amended in v1.6 — identification only) ─────
  'ga4':            { name: 'GA4', status: 'label' },
  'plausible':      { name: 'Plausible', status: 'label' },
  'attributer':     { name: 'Attributer', status: 'label' },
  'leadsource-io':  { name: 'Leadsource.io', status: 'label' },
  'ruler':          { name: 'Ruler', status: 'label' },
  'cometly':        { name: 'Cometly', status: 'label' },
  'triple-whale':   { name: 'Triple Whale', status: 'label' },
  'northbeam':      { name: 'Northbeam', status: 'label' }
}

/** Resolve a slug. Unknown slugs throw at build time rather than rendering blank. */
export function getMark (slug) {
  const m = MARKS[slug]
  if (!m) {
    throw new Error(
      `Unknown brand mark "${slug}". Add it to marketing/src/lib/brand-marks.js ` +
      `(status:'label' is fine) — a silent blank is how a missing mark ships unnoticed.`
    )
  }
  return m
}

export const sourcedCount = () => Object.values(MARKS).filter(m => m.status === 'sourced').length
export const totalCount = () => Object.keys(MARKS).length
