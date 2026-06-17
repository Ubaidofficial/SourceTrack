import SolutionPage from './SolutionPage'

const DATA = {
  slug: 'use-cases/lead-generation',
  title: 'B2B Lead Generation Attribution | SourceTrack',
  description: 'Stop reporting on leads that never close. SourceTrack shows which channels produce sales-qualified leads and closed revenue — not just form submissions. Multi-touch attribution with offline integration support. From $49/mo.',
  canonical: 'https://sourcetrack.ai/use-cases/lead-generation',
  ogTitle: 'Lead Gen Attribution — Track Which Channels Drive Leads That Actually Close | SourceTrack',
  ogDescription: 'Multi-touch attribution for lead generation. See which channels produce SQLs and closed revenue — not just raw lead volume. Supports custom offline conversion ingestion.',

  badge: 'Lead Generation Attribution — From form submission to closed-won',
  headline: 'Your CPC reports look great.',
  headlineAccent: 'But which leads are actually closing?',
  subheadline: "Lead volume is a vanity metric, and ad platforms love to take credit for easy form fills. SourceTrack connects every lead to the entire journey and closed revenue — so you can stop wasting ad spend on raw MQLs that never convert.",

  stats: [
    { value: '8', label: 'Attribution models', sub: 'From first touch to W-shaped — multi-touch models reveal top-of-funnel channels that last-click misses entirely' },
    { value: '5', label: 'Conversion stages tracked', sub: 'Track leads, MQLs, SQLs, demos, and closed revenue — each stage attributed to its original acquisition source' },
    { value: '22', label: 'AI referrer domains tracked', sub: 'Buyers researching your service on ChatGPT or Perplexity before submitting a form — now attributed correctly instead of logged as direct' },
  ],

  features: {
    heading: 'Attribution built for the full B2B and lead gen funnel',
    subheading: 'Lead gen funnels span weeks and multiple channels. SourceTrack tracks the full path from first impression to closed deal.',
    items: [
      {
        icon: '🎯',
        title: 'Form submission attribution',
        body: "Fire a conversion event on every contact form, demo request, quote form, and callback request. SourceTrack attributes each submission to its original source — organic, paid, referral, or AI — using the full multi-touch journey, not just the last page they visited.",
      },
      {
        icon: '📞',
        title: 'Offline conversion import',
        body: "When a lead closes in your CRM, fire a server-side offline conversion via the REST API. SourceTrack will attribute the closed revenue to the original acquisition source — connecting marketing spend to actual deals, not just pipeline.",
      },
      {
        icon: '🤖',
        title: 'AI research attribution',
        body: "High-value B2B buyers often research vendors on ChatGPT or Perplexity before reaching your site. GA4 logs that visit as direct. SourceTrack attributes it to the correct AI platform — so content that appears in AI answers gets credit for the lead it generated.",
      },
      {
        icon: '🔷',
        title: 'Offline conversions via REST API',
        body: "Integrate conversions from custom marketing databases or offline touchpoints. Send structured payloads to the ingestion pipeline to attribute B2B sales cycles to acquisition sources.",
      },
      {
        icon: '📊',
        title: 'SQL vs MQL attribution breakdown',
        body: "Pass a 'sql_qualified' conversion event when sales qualifies a lead. Compare the channel attribution of MQLs vs SQLs — and you'll often find that the channels driving the most form fills are not the ones driving the most qualified pipeline.",
      },
      {
        icon: '🛤️',
        title: 'Multi-touch lead journey maps',
        body: "See every touchpoint in a lead's journey — from the first blog post they read to the webinar they attended to the demo form they submitted. Understand which content types influence pipeline at each stage.",
      },
    ],
  },

  steps: {
    heading: 'Connect form submissions to closed revenue in minutes',
    subheading: "Paste one script, fire conversion events at each funnel stage, and use the offline API to import closed deals from your CRM.",
    items: [
      {
        number: '01',
        title: 'Add the tracker to your site',
        body: "Paste the lightweight tracking snippet into your site's <head>. Captures all pageviews, UTM parameters, and AI referrer signals automatically.",
        code: `<script async\n  src="https://api.srctk.com/tracker.min.js"\n  data-site-key="YOUR_KEY">\n</script>`,
      },
      {
        number: '02',
        title: 'Fire events at each funnel stage',
        body: "Call sourcetrack.conversion() on each key action — form submission, demo booked, SQL qualified. Pass a custom property to distinguish stages.",
        code: `// On form submit\nsourcetrack.conversion({\n  type: 'lead',\n  properties: { form: 'demo-request' }\n})\n\n// On SQL qualification (server-side)\nPOST /api/conversion/offline\n{ type: 'sql_qualified', lead_id: '...' }`,
      },
      {
        number: '03',
        title: 'Import closed revenue via REST API',
        body: "When a deal closes in your CRM, fire a server-side offline conversion via the REST API with the deal value. SourceTrack will attribute the closed revenue to the original acquisition source — connecting marketing spend to actual deals via a structured conversion payload.",
        code: null,
      },
    ],
  },

  faqs: {
    heading: 'Lead gen attribution questions',
    items: [
      {
        q: 'How do I connect closed-won CRM deals back to the original lead source?',
        a: "When a deal closes in your CRM, fire a POST to /api/conversion/offline with the deal value, lead ID, and any UTM parameters you stored at lead creation. SourceTrack will match the closed revenue to the original lead source using the stored attribution data — connecting marketing spend to actual revenue.",
      },
      {
        q: 'Can I track multiple funnel stages — MQL, SQL, closed?',
        a: "Yes. Fire a different conversion type at each stage: 'lead' on form submission, 'sql_qualified' on sales qualification, and 'purchase' (or a custom type) on close. Your attribution dashboard will show each stage attributed by source — revealing which channels produce MQLs vs. which ones produce revenue.",
      },
      {
        q: 'Which channels are most under-credited in lead gen attribution?',
        a: "With last-click attribution, paid retargeting almost always gets over-credited because it catches buyers near the end of their journey. Top-of-funnel channels — organic search, content, thought leadership, and AI platforms like ChatGPT — are systematically under-credited. Multi-touch models like U-Shaped or Linear reveal the full picture.",
      },
      {
        q: 'How does AI referral tracking help lead gen campaigns?',
        a: "If your content appears in ChatGPT or Perplexity answers, users click through to your site and often convert later. GA4 attributes that conversion to whatever ad they saw last. SourceTrack attributes it correctly to the AI platform — letting you measure and optimize the ROI of your AI citation strategy.",
      },
      {
        q: "Does SourceTrack integrate with HubSpot or Salesforce?",
        a: "Not natively. SourceTrack provides a REST API for offline conversions. When a deal closes in your CRM, your backend sends a POST request with the deal value and any identifiers to /api/conversion/offline. SourceTrack will match it to the original attribution session. There is no native CRM connector — integration is via your backend code or a webhook handler.",
      },
      {
        q: "Which form tools are automatically detected? What about booking tools?",
        a: "Browser form submit detection works automatically for native HTML forms, Webflow-style forms, and WordPress/CF7-style forms. Typeform, Tally, HubSpot Forms, Jotform, and Google Forms are not auto-detected — for those, pass attribution context as hidden fields or URL parameters using window.sourcetrack.getContext(), then forward it via your backend or a webhook. For booking tools, UTM parameters are passed through automatically when visitors click links to Calendly, Cal.com, TidyCal, and SavvyCal. Additional host allowlist entries such as zcal.co, OnceHub, and YouCanBookMe exist in the tracker, but they were not individually browser-verified in 140M. Confirmed booking detection (firing a booking_scheduled event after the visitor completes a booking) is supported for Calendly and Cal.com embeds only. TidyCal and SavvyCal are passthrough-only — use their webhook to POST a server-side conversion event for booking confirmation.",
      },
    ],
  },

  ctaHeadline: 'Stop optimizing for form fills. Optimize for closed revenue.',
  ctaBody: "Connect every closed deal to the channel that started the journey. Set up in 3 minutes. No credit card.",

  jsonLd: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "How do I connect closed-won CRM deals back to the original lead source?", "acceptedAnswer": { "@type": "Answer", "text": "When a deal closes, fire a POST to /api/conversion/offline with the deal value and lead ID. SourceTrack matches closed revenue to the original lead source using stored attribution data." } },
      { "@type": "Question", "name": "Can I track multiple funnel stages — MQL, SQL, closed?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Fire 'lead' on form submission, 'sql_qualified' on qualification, and 'purchase' on close. Your dashboard will show each stage attributed by source." } },
      { "@type": "Question", "name": "Which attribution model should lead gen teams use?", "acceptedAnswer": { "@type": "Answer", "text": "U-Shaped (40% first, 40% last, 20% middle) gives credit to both the channel that created awareness and the one that closed the form submission. W-Shaped adds credit to the key pipeline-creation touchpoint." } },
    ]
  },
}

export default function SolutionLeadGen() {
  return <SolutionPage data={DATA} />
}
