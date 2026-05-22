import SolutionPage from './SolutionPage'

const DATA = {
  slug: 'agency-attribution',
  title: 'Marketing Agency Attribution Software — Multi-Client Attribution & White-Label Reports | SourceTrack',
  description: "Stop building attribution reports in spreadsheets. SourceTrack gives agencies multi-client attribution dashboards, white-label reports, and server-side CAPI sync across every client account. From $199/mo.",
  canonical: 'https://sourcetrack.ai/agency-attribution',
  ogTitle: 'Agency Attribution — Multi-Client Attribution & White-Label Reporting | SourceTrack',
  ogDescription: "Attribution reporting your clients will actually believe. Multi-site dashboards, white-label exports, and CAPI sync for every client — without the spreadsheet grind.",

  badge: 'Agency Attribution — Multi-client dashboards, white-label reports, CAPI sync',
  headline: 'Attribution reporting your clients',
  headlineAccent: 'will actually believe.',
  subheadline: "Your clients are paying for results, not reports. SourceTrack gives you multi-model attribution data for every account — including the AI-driven revenue GA4 is hiding — so your retainer justification is backed by numbers clients can't argue with.",

  stats: [
    { value: '40%', label: 'More conversions vs. pixel-only', sub: "Server-side CAPI tracking captures conversions that browser pixels miss due to iOS restrictions and ad-blockers — showing clients their true ad performance" },
    { value: '8', label: 'Attribution models per client', sub: "Switch any client between First Touch, Last Touch, Linear, U-Shaped, W-Shaped, Time Decay, and more — instantly, with no extra setup" },
    { value: '15', label: 'AI platforms tracked per site', sub: "Surface the ChatGPT and Perplexity revenue that GA4 is attributing to direct or last-click — a new insight on every client retainer" },
  ],

  features: {
    heading: 'Everything agencies need to manage attribution at scale',
    subheading: "One platform. Every client. Full attribution — including the AI traffic your reporting never captured before.",
    items: [
      {
        icon: '🏢',
        title: 'Multi-site management',
        body: "Manage attribution for every client from one dashboard. Each site has its own tracking key, attribution window, and data retention settings. Onboard a new client in under 5 minutes.",
      },
      {
        icon: '📋',
        title: 'White-label report export',
        body: "Export attribution reports to CSV for any client, date range, and attribution model. Add your agency branding before sending. No SourceTrack branding visible in exports — it looks like your own proprietary reporting.",
      },
      {
        icon: '🔁',
        title: 'CAPI sync for every client account',
        body: "Configure Meta CAPI, Google Ads, TikTok, LinkedIn, and Microsoft UET per site — each with its own credentials. Every client's conversions are synced server-side to their ad accounts, improving ROAS across the board.",
      },
      {
        icon: '🤖',
        title: 'Surface AI revenue for every client',
        body: "For each client account, show the revenue coming from ChatGPT, Perplexity, and 13 other AI platforms that GA4 is calling direct. This AI attribution insight alone justifies SourceTrack as a line item on every retainer.",
      },
      {
        icon: '📊',
        title: 'Per-client attribution models',
        body: "Different clients need different models. eCommerce clients often want U-Shaped. B2B SaaS clients want W-Shaped. Apply the right model per account and switch instantly — without re-configuring tracking.",
      },
      {
        icon: '🔒',
        title: 'GDPR compliance for EU client sites',
        body: "For clients in the EU, enable cookieless mode per site with one toggle. No consent banner required, no compliance risk for you or your client. The same data quality — without the legal exposure.",
      },
    ],
  },

  steps: {
    heading: 'Onboard a new client account in under 5 minutes',
    subheading: 'Create a site, get a key, paste a snippet. All client data is isolated and never mixed.',
    items: [
      {
        number: '01',
        title: 'Create a new site in your SourceTrack dashboard',
        body: "Each client gets their own site workspace with a unique tracking key. All data is isolated per site — clients never see each other's data. Set the attribution window and data retention per client.",
        code: null,
      },
      {
        number: '02',
        title: 'Paste the snippet into the client site',
        body: "Send the 1.7 KB script tag to your client's developer or paste it directly if you have CMS access. Shopify, WooCommerce, Webflow, WordPress — all work with the same tag.",
        code: `<script async\n  src="https://app.sourcetrack.ai/tracker/tracker.min.js"\n  data-site-key="CLIENT_SITE_KEY">\n</script>`,
      },
      {
        number: '03',
        title: 'Configure CAPI integrations and pull reports',
        body: "In the client's site settings, connect their Meta, Google, TikTok, and LinkedIn ad accounts. All conversions will start syncing server-side immediately. Export white-label attribution reports monthly.",
        code: null,
      },
    ],
  },

  faqs: {
    heading: 'Agency attribution questions',
    items: [
      {
        q: 'How does multi-site management work for agencies?',
        a: "Each client site has its own isolated workspace — separate tracking key, data, attribution settings, and CAPI credentials. You manage all sites from one SourceTrack account. Switching between client dashboards takes one click. Client data is completely isolated and can never be cross-contaminated.",
      },
      {
        q: 'Can I white-label the attribution reports?',
        a: "Yes. All CSV and report exports contain no SourceTrack branding. Export any date range, attribution model, and channel breakdown for any client site, and present it as your own proprietary reporting. The Scale plan includes white-label report generation.",
      },
      {
        q: "How do I explain AI attribution as a value-add to clients?",
        a: "Show clients their GA4 direct traffic percentage (usually 15-30% for content-forward sites), then show them the same period in SourceTrack where a portion of that direct traffic is identified as ChatGPT, Perplexity, and Claude referrals. The AI-attributed revenue that was being credited to 'direct' becomes a new insight — one that most agencies can't show with GA4.",
      },
      {
        q: 'Does CAPI sync work per client ad account?',
        a: "Yes. Each client site has its own CAPI credentials configured separately — their Meta pixel ID, Google Ads customer ID, TikTok ad account, etc. Conversion events fire to each client's own ad accounts. One SourceTrack account manages all of them from a single interface.",
      },
      {
        q: "What's the best pricing plan for agencies?",
        a: "The Scale plan ($199/mo) includes multi-site management, white-label report exports, and up to 1,000,000 monthly visits across all client sites. For agencies with higher traffic volumes across their client portfolio, the Enterprise plan offers custom pricing with unlimited visits.",
      },
    ],
  },

  ctaHeadline: 'Show clients the revenue their current analytics can\'t see.',
  ctaBody: "AI attribution, CAPI sync, and multi-model reporting — for every client, from one dashboard. Start free.",

  jsonLd: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "How does multi-site management work for agencies?", "acceptedAnswer": { "@type": "Answer", "text": "Each client site has its own isolated workspace — separate tracking key, data, attribution settings, and CAPI credentials. All managed from one SourceTrack account." } },
      { "@type": "Question", "name": "Can I white-label the attribution reports?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. All CSV and report exports contain no SourceTrack branding. Export any date range and attribution model and present it as your own proprietary reporting." } },
      { "@type": "Question", "name": "How do I explain AI attribution as a value-add to clients?", "acceptedAnswer": { "@type": "Answer", "text": "Show clients their GA4 direct traffic, then show the same period in SourceTrack where a portion is identified as ChatGPT, Perplexity, and other AI referrals. The AI-attributed revenue that was called 'direct' becomes a new insight most agencies can't provide." } },
    ]
  },
}

export default function SolutionAgency() {
  return <SolutionPage data={DATA} />
}
