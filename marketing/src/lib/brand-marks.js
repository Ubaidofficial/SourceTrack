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

/**
 * @typedef {Object} Mark
 * @property {string} name          Accessible name AND the text-label fallback.
 * @property {'sourced'|'label'} status
 * @property {string} [file]        Filename under public/brand. Extension VARIES —
 *   svg/png/ico/jpg/webp — because each vendor serves what it serves. Assuming .svg
 *   is what broke the provenance guard on 86 correctly-sourced marks.
 * @property {string} [brandPage]   Exact URL the asset came from.
 * @property {string} [terms]       One line on what the vendor permits.
 */

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
  'hubspot-forms': { name: 'HubSpot Forms', status: 'sourced',
    file: 'hubspot-forms.png',
    brandPage: 'https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'webflow': { name: 'Webflow', status: 'sourced',
    file: 'webflow.png',
    brandPage: 'https://cdn.prod.website-files.com/686294e263eb7e215bd232f7/686d53d0446d4237b2f38c5f_webclip.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'typeform': { name: 'Typeform', status: 'sourced',
    file: 'typeform.png',
    brandPage: 'https://cdn.prod.website-files.com/66ffe2174aa8e8d5661c2708/68b6f00951eb33cd19b77288_Frame%201867174.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'jotform': { name: 'Jotform', status: 'sourced',
    file: 'jotform.png',
    brandPage: 'https://cdn.jotfor.ms/assets/img/favicons/apple-touch-icon-180x180.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'tally': { name: 'Tally', status: 'sourced',
    file: 'tally.svg',
    brandPage: 'https://tally.so/favicon.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'paperform': { name: 'Paperform', status: 'sourced',
    file: 'paperform.png',
    brandPage: 'https://paperform.co/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'gravity-forms': { name: 'Gravity Forms', status: 'sourced',
    file: 'gravity-forms.png',
    brandPage: 'https://gravityforms.com/apple-touch-icon-precomposed.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'wpforms': { name: 'WPForms', status: 'sourced',
    file: 'wpforms.png',
    brandPage: 'https://wpforms.com/wp-content/uploads/2016/02/cropped-sullie-favicon-180x180.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'ninja-forms': { name: 'Ninja Forms', status: 'sourced',
    file: 'ninja-forms.png',
    brandPage: 'https://ninjaforms.com/wp-content/uploads/2020/02/cropped-nf-social-vertical-img-180x180.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'contact-form-7': { name: 'Contact Form 7', status: 'label' },
  'formidable': { name: 'Formidable', status: 'sourced',
    file: 'formidable.png',
    brandPage: 'https://formidableforms.com/wp-content/uploads/2020/10/cropped-Favicon-2-180x180.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'fluent-forms': { name: 'Fluent Forms', status: 'sourced',
    file: 'fluent-forms.png',
    brandPage: 'https://fluentforms.com/wp-content/uploads/2025/06/cropped-favicon-180x180.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'forminator': { name: 'Forminator', status: 'sourced',
    file: 'forminator.png',
    brandPage: 'https://wpmudev.com/wp-content/themes/wpmudev-2015-1/assets/img/favicon/apple-touch-icon-152x152.png?v=1',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'formstack': { name: 'Formstack', status: 'sourced',
    file: 'formstack.png',
    brandPage: 'https://cdn.prod.website-files.com/5ebb0930dd82631397ddca92/5f490035d3afaf299acf7d59_FS_256x256.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'wufoo': { name: 'Wufoo', status: 'sourced',
    file: 'wufoo.svg',
    brandPage: 'https://www.wufoo.com/wp-content/themes/wufoo-site/img/favicons/safari-pinned-tab.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'google-forms': { name: 'Google Forms', status: 'sourced',
    file: 'google-forms.ico',
    brandPage: 'https://google.com/favicon.ico',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'cognito-forms': { name: 'Cognito Forms', status: 'sourced',
    file: 'cognito-forms.png',
    brandPage: 'https://static.cognitoforms.com/website/assets/favicons/apple-touch-icon-1024x1024.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'unbounce': { name: 'Unbounce', status: 'sourced',
    file: 'unbounce.png',
    brandPage: 'https://unbounce.com/photos/cropped-unbounce-favicon-2-180x180.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'leadpages': { name: 'Leadpages', status: 'sourced',
    file: 'leadpages.png',
    brandPage: 'https://leadpages.com/apple-icon.png?apple-icon.0f2xvoyua9t7k.png?dpl=5d2dc0e',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'clickfunnels': { name: 'ClickFunnels', status: 'sourced',
    file: 'clickfunnels.png',
    brandPage: 'https://clickfunnels.com/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'mailchimp': { name: 'Mailchimp', status: 'sourced',
    file: 'mailchimp.svg',
    brandPage: 'https://mailchimp.com/release/plums/a9c5b58dea3269f6.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'kit':            { name: 'Kit', status: 'label' },
  'klaviyo': { name: 'Klaviyo', status: 'sourced',
    file: 'klaviyo.png',
    brandPage: 'https://www.klaviyo.com/icons/icon-512x512.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'activecampaign': { name: 'ActiveCampaign', status: 'sourced',
    file: 'activecampaign.webp',
    brandPage: 'https://activecampaign.com/dist/favicon-180x180.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'marketo': { name: 'Marketo', status: 'label' },
  'pardot': { name: 'Pardot', status: 'sourced',
    file: 'pardot.ico',
    brandPage: 'https://salesforce.com/c2/public/app/favicon.ico',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'squarespace': { name: 'Squarespace', status: 'sourced',
    file: 'squarespace.png',
    brandPage: 'https://media-www.sqspcdn.com/logos/apple-touch-icon-1024.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'wix-forms': { name: 'Wix Forms', status: 'label' },
  'wordpress': { name: 'WordPress', status: 'sourced',
    file: 'wordpress.png',
    brandPage: 'https://s.w.org/images/wmark.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'carrd': { name: 'Carrd', status: 'sourced',
    file: 'carrd.png',
    brandPage: 'https://carrd.co/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },

  // ── Chat (tab 2) ──────────────────────────────────────────────────────────
  'intercom': { name: 'Intercom', status: 'sourced',
    file: 'intercom.png',
    brandPage: 'https://intercom.com/intercom-marketing-site/favicons/favicon-32x32.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'drift':          { name: 'Drift', status: 'label' },
  'crisp': { name: 'Crisp', status: 'sourced',
    file: 'crisp.png',
    brandPage: 'https://crisp.chat/favicons/apple-touch-icon-144x144.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'tidio': { name: 'Tidio', status: 'sourced',
    file: 'tidio.svg',
    brandPage: 'https://tidio.com/images/favicon/icon.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'hubspot-chat': { name: 'HubSpot Chat', status: 'sourced',
    file: 'hubspot-chat.png',
    brandPage: 'https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'zendesk': { name: 'Zendesk', status: 'sourced',
    file: 'zendesk.svg',
    brandPage: 'https://d1eipm3vz40hy0.cloudfront.net/images/logos/favicons/zendesk-icon.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'livechat':       { name: 'LiveChat', status: 'label' },
  'tawk-to':        { name: 'Tawk.to', status: 'label' },
  'freshchat':      { name: 'Freshchat', status: 'label' },
  'chatwoot': { name: 'Chatwoot', status: 'sourced',
    file: 'chatwoot.png',
    brandPage: 'https://chatwoot.com/favicon/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'olark': { name: 'Olark', status: 'sourced',
    file: 'olark.png',
    brandPage: 'https://www.olark.com/favicon-180.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'front': { name: 'Front', status: 'sourced',
    file: 'front.png',
    brandPage: 'https://front.com/apple-icon.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'help-scout': { name: 'Help Scout', status: 'sourced',
    file: 'help-scout.svg',
    brandPage: 'https://helpscout.com/images/favicon/favicon.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'gorgias': { name: 'Gorgias', status: 'sourced',
    file: 'gorgias.png',
    brandPage: 'https://cdn.prod.website-files.com/5e4ff204e7b6f80e402d407a/655f0a311c75248c5ff9756b_Social%20Avatar.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'smartsupp': { name: 'Smartsupp', status: 'sourced',
    file: 'smartsupp.ico',
    brandPage: 'https://smartsupp.com/favicon.ico',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },

  // ── Meetings (tab 3) ──────────────────────────────────────────────────────
  'calendly': { name: 'Calendly', status: 'sourced',
    file: 'calendly.ico',
    brandPage: 'https://calendly.com/media/favicon/favicon.ico',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'cal-com': { name: 'Cal.com', status: 'sourced',
    file: 'cal-com.png',
    brandPage: 'https://framerusercontent.com/images/63tSo3fa0ylcjt88Er8WTEPS6Dw.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'hubspot-meetings': { name: 'HubSpot Meetings', status: 'sourced',
    file: 'hubspot-meetings.png',
    brandPage: 'https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'savvycal': { name: 'SavvyCal', status: 'sourced',
    file: 'savvycal.png',
    brandPage: 'https://savvycal.com/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'chili-piper': { name: 'Chili Piper', status: 'sourced',
    file: 'chili-piper.png',
    brandPage: 'https://cdn.prod.website-files.com/61c9fe00acd90d7271f7014e/63d786892fb10995dd9b5fc6_webclip.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'tidycal': { name: 'TidyCal', status: 'sourced',
    file: 'tidycal.svg',
    brandPage: 'https://tidycal.com/safari-pinned-tab.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'zcal':              { name: 'Zcal', status: 'label' },
  'acuity': { name: 'Acuity', status: 'sourced',
    file: 'acuity.png',
    brandPage: 'https://media-www.sqspcdn.com/logos/apple-touch-icon-1024.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'youcanbookme': { name: 'YouCanBook.me', status: 'sourced',
    file: 'youcanbookme.png',
    brandPage: 'https://youcanbook.me/hubfs/ycbm-social-avatar.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'google-calendar': { name: 'Google Calendar', status: 'sourced',
    file: 'google-calendar.ico',
    brandPage: 'https://google.com/favicon.ico',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'microsoft-bookings': { name: 'Microsoft Bookings', status: 'sourced',
    file: 'microsoft-bookings.jpg',
    brandPage: 'https://microsoft.com/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },

  // ── Payments & stores (tab 4) ─────────────────────────────────────────────
  'stripe': { name: 'Stripe', status: 'sourced',
    file: 'stripe.svg',
    brandPage: 'https://images.stripeassets.com/fzn2n1nzq965/1hgcBNd12BfT9VLgbId7By/01d91920114b124fb4cf6d448f9f06eb/favicon.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'paddle': { name: 'Paddle', status: 'sourced',
    file: 'paddle.png',
    brandPage: 'https://paddle.com/icon4.png?icon4.2505fc7ib2tqc.png?dpl=211494ef525db95b9fab6e9726544eb460322dae2e365fae2d06c0f00de3a866366137356664633136303938363930303038353164623231',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'chargebee': { name: 'Chargebee', status: 'sourced',
    file: 'chargebee.png',
    brandPage: 'https://chargebee.com/static/resources/brand/apple-touch-icon.png?v=1',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'lemon-squeezy': { name: 'Lemon Squeezy', status: 'sourced',
    file: 'lemon-squeezy.jpg',
    brandPage: 'https://cdn.prod.website-files.com/6347244ba8d63489ba51c08e/6358e75cbf1bca262b2b2edc_webclip.jpg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'shopify': { name: 'Shopify', status: 'sourced',
    file: 'shopify.png',
    brandPage: 'https://cdn.shopify.com/b/shopify-brochure2-assets/c97c60ca19c64a8b5378d9f9e971f7bd.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'woocommerce': { name: 'WooCommerce', status: 'sourced',
    file: 'woocommerce.png',
    brandPage: 'https://woocommerce.com/wp-content/uploads/2024/12/cropped-logo-w-favicon.png?w=180',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'bigcommerce': { name: 'BigCommerce', status: 'sourced',
    file: 'bigcommerce.svg',
    brandPage: 'https://storage.googleapis.com/s.mkswft.com/RmlsZTozYTVlNmQwZi00OWUzLTRlY2YtOTVhZC0zZTVmNTAwMDJkNmY=/BigCommerce-logomark-whitebg.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'magento': { name: 'Magento', status: 'sourced',
    file: 'magento.png',
    brandPage: 'https://adobe.com/apple-touch-icon-precomposed.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'ecwid': { name: 'Ecwid', status: 'sourced',
    file: 'ecwid.ico',
    brandPage: 'https://ecwid.com/favicon.ico',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'prestashop': { name: 'PrestaShop', status: 'sourced',
    file: 'prestashop.ico',
    brandPage: 'https://prestashop.com/favicon.ico',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'wix-stores': { name: 'Wix Stores', status: 'label' },

  // ── CRM & ad platforms (tab 5) + hero orbit destinations ──────────────────
  'google-ads': { name: 'Google Ads', status: 'sourced',
    file: 'google-ads.ico',
    brandPage: 'https://google.com/favicon.ico',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'meta-capi': { name: 'Meta CAPI', status: 'sourced',
    file: 'meta-capi.svg',
    brandPage: 'https://static.xx.fbcdn.net/rsrc.php/yf/r/-7pQO6hUGK_.svg',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'linkedin-capi':  { name: 'LinkedIn CAPI', status: 'label' },
  'tiktok-events': { name: 'TikTok Events', status: 'sourced',
    file: 'tiktok-events.png',
    brandPage: 'https://tiktok.com/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'snap-capi': { name: 'Snap CAPI', status: 'sourced',
    file: 'snap-capi.png',
    brandPage: 'https://images.ctfassets.net/dwtpq5hdcqjg/5S0EwGbv1lNk3uVF25ocBe/bfddb3bbc878432eabc4a2a8b6282e8e/Snap_Inc_Favicon.png?fm=png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'pinterest': { name: 'Pinterest', status: 'sourced',
    file: 'pinterest.svg',
    brandPage: 'https://s.pinimg.com/webapp/pinterest_favicon-70db4fa7.svg',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'microsoft-ads': { name: 'Microsoft Ads', status: 'sourced',
    file: 'microsoft-ads.jpg',
    brandPage: 'https://microsoft.com/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'reddit-ads': { name: 'Reddit Ads', status: 'sourced',
    file: 'reddit-ads.png',
    brandPage: 'https://reddit.com/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'x-ads': { name: 'X Ads', status: 'sourced',
    file: 'x-ads.png',
    brandPage: 'https://abs.twimg.com/favicons/twitter.3.ico',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'hubspot': { name: 'HubSpot', status: 'sourced',
    file: 'hubspot.png',
    brandPage: 'https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'salesforce': { name: 'Salesforce', status: 'sourced',
    file: 'salesforce.ico',
    brandPage: 'https://salesforce.com/c2/public/app/favicon.ico',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'pipedrive': { name: 'Pipedrive', status: 'sourced',
    file: 'pipedrive.png',
    brandPage: 'https://cdn.dub-1.pipedriveassets.com/www-main-renderer/_next/static/media/apple-touch-icon-152x152.8af4bcfd.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'attio': { name: 'Attio', status: 'sourced',
    file: 'attio.ico',
    brandPage: 'https://attio.com/favicon.ico?favicon.17i4ytxwoisgb.ico?dpl=dpl_3Jjo1HQgWwcGZReM15FfFeFxHjyn',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'zapier': { name: 'Zapier', status: 'sourced',
    file: 'zapier.ico',
    brandPage: 'https://zapier.com/favicon.ico',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'slack': { name: 'Slack', status: 'sourced',
    file: 'slack.png',
    brandPage: 'https://slack.com/apple-touch-icon-precomposed.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'webhooks':       { name: 'Webhooks', status: 'label' },

  // ── Channels / AI assistants (marquee, tour, journey) ─────────────────────
  'chatgpt':        { name: 'ChatGPT', status: 'label' },
  'claude': { name: 'Claude', status: 'sourced',
    file: 'claude.png',
    brandPage: 'https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/67d31dd7aa394792257596c5_webclip.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'gemini': { name: 'Gemini', status: 'sourced',
    file: 'gemini.ico',
    brandPage: 'https://google.com/favicon.ico',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'copilot': { name: 'Copilot', status: 'sourced',
    file: 'copilot.jpg',
    brandPage: 'https://microsoft.com/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  // No official brand page exists — confirmed via search during issue #577, resolved
  // to a plain text label in PR #583. This one is SETTLED as 'label', not pending.
  'perplexity':     { name: 'Perplexity', status: 'label' },
  'google-organic': { name: 'Google', status: 'sourced',
    file: 'google-organic.ico',
    brandPage: 'https://google.com/favicon.ico',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'search-console': { name: 'Search Console', status: 'sourced',
    file: 'search-console.ico',
    brandPage: 'https://google.com/favicon.ico',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'linkedin':       { name: 'LinkedIn', status: 'label' },
  'meta-ads': { name: 'Meta Ads', status: 'sourced',
    file: 'meta-ads.svg',
    brandPage: 'https://static.xx.fbcdn.net/rsrc.php/yf/r/-7pQO6hUGK_.svg',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },

  // ── Comparison table (§35.3 as amended in v1.6 — identification only) ─────
  'ga4': { name: 'GA4', status: 'sourced',
    file: 'ga4.ico',
    brandPage: 'https://google.com/favicon.ico',
    terms: "Nominative use — identifies an integration. Parent-company mark, shared with sibling products; the adjacent text label names the exact product." },
  'plausible': { name: 'Plausible', status: 'sourced',
    file: 'plausible.png',
    brandPage: 'https://plausible.io/assets/images/icon/apple-touch-icon.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'attributer': { name: 'Attributer', status: 'sourced',
    file: 'attributer.png',
    brandPage: 'https://attributer.io/wp-content/uploads/2022/09/cropped-Favicon-300x300.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'leadsource-io':  { name: 'Leadsource.io', status: 'label' },
  'ruler': { name: 'Ruler', status: 'sourced',
    file: 'ruler.png',
    brandPage: 'https://www.ruleranalytics.com/wp-content/uploads/rulerfavicon-ruleranalytics.com_-300x300.png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'cometly': { name: 'Cometly', status: 'sourced',
    file: 'cometly.svg',
    brandPage: 'https://cometly.com/icon.svg?icon.00fp.k1k5fd7e.svg?dpl=dpl_77PSvCNyfc3FFTQc3qsDzPgpBZsa',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." },
  'triple-whale':   { name: 'Triple Whale', status: 'label' },
  'northbeam': { name: 'Northbeam', status: 'sourced',
    file: 'northbeam.png',
    brandPage: 'https://cdn.prod.website-files.com/63ce823acf939e1e64f927c4/63ce8880c8b33a63342faa54_Group%202072747819%20(1).png',
    terms: "Nominative use — identifies an integration by name. Fetched from the vendor's own site, unaltered, no partnership implied." }
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
