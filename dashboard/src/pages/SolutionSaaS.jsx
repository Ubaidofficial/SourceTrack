import SolutionPage from './SolutionPage'

const DATA = {
  slug: 'saas-attribution',
  title: 'SaaS Attribution Software — Trial-to-Paid Attribution & MRR Tracking | SourceTrack',
  description: 'Track which marketing channels convert free trials into paying customers. SourceTrack gives SaaS companies full multi-touch attribution including AI research traffic — server-side CAPI sync to Meta, Google, LinkedIn. From $49/mo.',
  canonical: 'https://sourcetrack.ai/saas-attribution',
  ogTitle: 'SaaS Attribution — See Which Channels Drive Trial-to-Paid Conversions | SourceTrack',
  ogDescription: 'Multi-touch attribution for SaaS. Connect every trial signup and upgrade to the exact touchpoints that drove it — including the ChatGPT recommendation that started the journey.',

  badge: 'SaaS Attribution — Trial-to-paid, MRR, and AI research tracking',
  headline: 'See which channels drive trial starts.',
  headlineAccent: 'And which ones actually convert to paid.',
  subheadline: "Your analytics show plenty of signups. But which sources produce paying customers — not just free-tier churn? SourceTrack traces every subscription back to its original touchpoint, including the AI product comparison that started the buyer's journey.",

  stats: [
    { value: '7+', label: 'Touchpoints before SaaS purchase', sub: "B2B SaaS buyers consult multiple sources before signing up — last-click attribution misses all but the final one" },
    { value: '40%', label: 'Lower CAC with multi-touch data', sub: 'Teams that attribute correctly can reallocate budget from channels that drive signups to channels that drive paid conversions' },
    { value: '18%', label: 'Average AI referral share', sub: 'Of SaaS trial signups now starting from a ChatGPT, Perplexity, or Claude product recommendation — invisible in GA4' },
  ],

  features: {
    heading: 'Attribution built for the SaaS buying cycle',
    subheading: 'SaaS buyers research, compare, and evaluate across weeks before signing up. SourceTrack tracks the full journey — from the first AI search to the upgrade.',
    items: [
      {
        icon: '🚀',
        title: 'Trial-to-paid attribution',
        body: "Fire a 'trial_start' conversion when someone signs up free, then a 'subscription' conversion when they upgrade. SourceTrack attributes both events to their original touchpoints — showing you which channels produce paying customers, not just signups.",
      },
      {
        icon: '🤖',
        title: 'AI product research attribution',
        body: "When a buyer asks ChatGPT 'what's the best attribution tool' and clicks through to your site, GA4 logs that as direct. SourceTrack identifies it as a ChatGPT referral — so the trial and eventual subscription are attributed to AI, not to whatever ad they saw later.",
      },
      {
        icon: '📊',
        title: 'MRR by acquisition channel',
        body: "Pass your monthly recurring revenue value to sourcetrack.conversion() on subscription events. See which channels produce high-MRR customers vs. low-LTV churners — and reallocate budget accordingly.",
      },
      {
        icon: '🔷',
        title: 'LinkedIn & Google CAPI for B2B',
        body: "B2B SaaS buyers are on LinkedIn. SourceTrack syncs subscription conversions server-side to LinkedIn Ads and Google Ads CAPI — giving your campaigns accurate signal even when cookies are blocked in corporate browsers.",
      },
      {
        icon: '🛤️',
        title: 'Long sales cycle journey maps',
        body: "SaaS deals take weeks. SourceTrack stores up to 90 days of touchpoint history per visitor. See the full journey from first blog post visit to paid signup — even when there are 12 touchpoints across 3 devices.",
      },
      {
        icon: '🔒',
        title: 'No consent banner in EU markets',
        body: "Enterprise SaaS buyers in Germany, France, and the UK expect privacy compliance. Cookieless mode gives you the same attribution accuracy without cookies, localStorage, or a consent popup interrupting your signup flow.",
      },
    ],
  },

  steps: {
    heading: 'Set up SaaS attribution in under 5 minutes',
    subheading: 'Paste one script tag, fire two conversion events, and see your trial-to-paid funnel attributed by source.',
    items: [
      {
        number: '01',
        title: 'Add the snippet to your marketing site and app',
        body: "Add the 1.7 KB tracker to both your marketing site and your in-app pages. This tracks the full journey — from first visit on your landing page to signup inside your product.",
        code: `<script async\n  src="https://app.sourcetrack.ai/tracker/tracker.min.js"\n  data-site-key="YOUR_KEY">\n</script>`,
      },
      {
        number: '02',
        title: 'Fire conversions on trial start and upgrade',
        body: "Call sourcetrack.conversion() when someone starts a trial and again when they upgrade. Pass the MRR value on the upgrade event so you can see revenue by source.",
        code: `// On trial signup\nsourcetrack.conversion({ type: 'trial_start' })\n\n// On paid upgrade (pass MRR)\nsourcetrack.conversion({\n  type: 'subscription',\n  value: 99,\n  order_id: user.subscription_id\n})`,
      },
      {
        number: '03',
        title: 'See which channels drive paying customers',
        body: "Open your attribution dashboard and switch the metric from 'trial starts' to 'subscription revenue'. The channel ranking will shift — revealing which sources produce MRR and which ones just drive free-tier signups.",
        code: null,
      },
    ],
  },

  faqs: {
    heading: 'SaaS attribution questions',
    items: [
      {
        q: 'How do I attribute trial starts and paid upgrades separately?',
        a: "Fire sourcetrack.conversion({ type: 'trial_start' }) when a user creates a free account, and sourcetrack.conversion({ type: 'subscription', value: mrr, order_id: subscriptionId }) when they upgrade. Your dashboard will show both events attributed to their original source — so you can see the conversion rate from trial to paid by channel.",
      },
      {
        q: 'Can I track MRR by acquisition channel?',
        a: "Yes. Pass your monthly recurring revenue as the value parameter on subscription conversion events. SourceTrack will attribute MRR to the channel that drove the original signup — across 8 attribution models. Use U-Shaped or W-Shaped attribution to give credit to both the first-touch that brought the trial and the last-touch that closed the upgrade.",
      },
      {
        q: 'How does SourceTrack handle long SaaS sales cycles?',
        a: "SourceTrack stores visitor touchpoint history for up to 90 days (configurable per plan). For enterprise deals that take weeks, this captures the full journey — from the first whitepaper download to the demo request to the procurement approval. The attribution window is configurable per workspace.",
      },
      {
        q: 'Does this work for product-led growth (PLG) SaaS?',
        a: "Yes. PLG SaaS often has a free-to-paid conversion path that happens entirely in-product. Add the tracker to your app and fire conversion events at key PLG milestones (feature activated, team member invited, payment triggered). SourceTrack will attribute each milestone to the original acquisition source.",
      },
      {
        q: 'Which attribution model should SaaS companies use?',
        a: "For SaaS, U-Shaped (40% first touch, 40% last touch, 20% middle) is often the most meaningful — it gives credit to both the channel that created awareness and the one that closed the signup. For long enterprise cycles, W-Shaped (30/30/30/10) captures the key opportunity-creation milestone as well. SourceTrack pre-computes all 8 models so you can compare them instantly.",
      },
    ],
  },

  ctaHeadline: 'Know which channels produce paying customers — not just signups.',
  ctaBody: "Stop optimizing for trial volume. Start optimizing for MRR by source. Fix your attribution in 3 minutes.",

  jsonLd: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "How do I attribute trial starts and paid upgrades separately?", "acceptedAnswer": { "@type": "Answer", "text": "Fire sourcetrack.conversion({ type: 'trial_start' }) on free signup and sourcetrack.conversion({ type: 'subscription', value: mrr }) on upgrade. Your dashboard will show both attributed to their original source." } },
      { "@type": "Question", "name": "Can I track MRR by acquisition channel?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Pass monthly recurring revenue as the value parameter on subscription conversion events. SourceTrack attributes MRR to the channel that drove the original signup." } },
      { "@type": "Question", "name": "Which attribution model should SaaS companies use?", "acceptedAnswer": { "@type": "Answer", "text": "U-Shaped (40/20/40) is often best for SaaS — credits both the first-touch channel that created awareness and the last-touch that closed the signup. SourceTrack pre-computes all 8 models." } },
    ]
  },
}

export default function SolutionSaaS() {
  return <SolutionPage data={DATA} />
}
