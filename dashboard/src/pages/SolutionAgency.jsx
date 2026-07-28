import SolutionPage from './SolutionPage'

const DATA = {
  slug: 'use-cases/agencies',
  title: 'Multi-Site Agency Attribution Reporting | SourceTrack',
  description: "Stop building attribution reports in spreadsheets. SourceTrack gives agencies multi-client attribution dashboards, unbranded CSV exports, and a clean server-side conversion pipeline.",
  canonical: 'https://www.sourcetrack.ai/use-cases/agencies',
  ogTitle: 'Agency Attribution — Multi-Client Attribution & Unbranded Reporting | SourceTrack',
  ogDescription: "Attribution reporting your clients will actually believe. Multi-site dashboards, unbranded exports, and client-level attribution — without the spreadsheet grind.",

  badge: 'Agency Attribution — Multi-client dashboards, unbranded CSV exports, multi-site analytics',
  headline: 'Attribution reporting your clients',
  headlineAccent: 'will actually believe.',
  subheadline: "Your clients pay for revenue, not spreadsheet reports. SourceTrack gives you independent, multi-client attribution data to prove your agency's true ROI, eliminate ad platform duplicate reporting, and justify retainers with numbers clients trust.",

  stats: [
    { value: '100%', label: 'Data isolation per client', sub: "Each client's tracking key, database records, and attribution dashboard are completely isolated and secure" },
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
        title: 'Unbranded report export',
        body: "Export client attribution reports to CSV for any date range and attribution model. Raw CSV data exports contain no formatting, styling, or SourceTrack branding markers, allowing you to load them into custom client templates.",
      },
      {
        icon: '🔁',
        title: 'Structured conversion pipelines',
        body: "Capture conversions with order IDs, value, and client site scoping. Payloads are designed for clean database storage, custom exports, and downstream webhooks per site.",
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
        title: 'Cookieless mode for EU sites',
        body: "For clients in EU markets, enable cookieless mode per site. Cookieless mode avoids browser cookies and localStorage, making it suitable for privacy-conscious client deployments without a consent banner disrupting the user experience.",
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
        body: "Share the tracking snippet with your client's developer or paste it directly if you have CMS access. Works with Shopify, WooCommerce, Webflow, WordPress, and any site that accepts a script tag.",
        code: `<script async\n  src="https://api.srctk.com/tracker.min.js"\n  data-site-key="CLIENT_SITE_KEY">\n</script>`,
      },
      {
        number: '03',
        title: 'Analyze and export reports',
        body: "Monitor client performance in the dashboard. Use flexible attribution models to see how touchpoints connect to revenue. Export client attribution reports as raw CSV data without SourceTrack styling or formatting.",
        code: null,
      },
    ],
  },

  faqs: {
    heading: 'Agency attribution questions',
    items: [
      {
        q: 'How does multi-site management work for agencies?',
        a: "Each client site has its own isolated workspace — separate tracking key, database records, and attribution settings. You manage all sites from one SourceTrack account. Switching between client dashboards takes one click. Client data is completely isolated and can never be cross-contaminated.",
      },
      {
        q: 'Can I white-label the attribution reports?',
        a: "All CSV data exports contain no formatting, styling, or SourceTrack branding markers, letting you load the raw data directly into your own client-facing presentation templates.",
      },
      {
        q: "How do I explain AI attribution as a value-add to clients?",
        a: "Show clients their GA4 direct traffic percentage (usually 15-30% for content-forward sites), then show them the same period in SourceTrack where a portion of that direct traffic is identified as ChatGPT, Perplexity, and Claude referrals. The AI-attributed revenue that was being credited to 'direct' becomes a new insight — one that most agencies can't show with GA4.",
      },
      {
        q: 'Can I route conversions to different clients?',
        a: "Yes. Every event is strictly scoped to the client's specific site key and database record. If you forward events via downstream endpoints or webhooks, they remain isolated and unique to each client's environment.",
      },
      {
        q: "What's the best pricing plan for agencies?",
        a: "The Growth plan ($79/mo) covers most agencies — multi-site management, the advanced report builder, and Stripe revenue tracking across client sites. For higher traffic volumes or more client sites, contact sales for custom pricing.",
      },
    ],
  },

  ctaHeadline: "Show clients the revenue their current analytics can't see.",
  ctaBody: "AI attribution, multi-model reporting, and client switcher — for every client, from one dashboard. Start free.",

  jsonLd: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "How does multi-site management work for agencies?", "acceptedAnswer": { "@type": "Answer", "text": "Each client site has its own isolated workspace — separate tracking key, database records, and attribution settings. All managed from one SourceTrack account." } },
      { "@type": "Question", "name": "Can I white-label the attribution reports?", "acceptedAnswer": { "@type": "Answer", "text": "CSV exports contain no SourceTrack branding — raw data only. Load them into your own client templates." } },
      { "@type": "Question", "name": "How do I explain AI attribution as a value-add to clients?", "acceptedAnswer": { "@type": "Answer", "text": "Show clients their GA4 direct traffic, then show the same period in SourceTrack where a portion is identified as ChatGPT, Perplexity, and other AI referrals. The AI-attributed revenue that was called 'direct' becomes a new insight most agencies can't provide." } },
    ]
  },
}

export default function SolutionAgency() {
  return <SolutionPage data={DATA} />
}
