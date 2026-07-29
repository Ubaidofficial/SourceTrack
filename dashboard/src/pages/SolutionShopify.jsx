import SolutionPage from './SolutionPage'

const DATA = {
  slug: 'use-cases/shopify',
  title: 'Shopify Order Attribution | SourceTrack',
  description: 'Trace every Shopify order back to its source. A manual webhook recipe and one lightweight script — no app to install, no native integration to wait for. Works with any Shopify store today.',
  canonical: 'https://www.sourcetrack.ai/use-cases/shopify',
  ogTitle: 'Every Shopify order, traced to its source | SourceTrack',
  ogDescription: 'Order attribution for Shopify with a manual webhook recipe — no app required. See UTM campaigns and named AI referrals behind every sale.',

  badge: 'Shopify Attribution — manual webhook recipe, no app required',
  headline: 'Every Shopify order, traced to its source.',
  headlineAccent: 'No native app, no plugin.',
  subheadline: 'Add SourceTrack with one lightweight script and a manual webhook recipe. Works with any Shopify store today — see the campaigns, search, and AI referrals behind every order, without waiting for a native integration.',

  stats: [
    { value: '15+', label: 'AI sources detected', sub: 'ChatGPT, Claude, Gemini, Perplexity and more — visitors most analytics still log as "direct"' },
    { value: 'Multi-touch', label: 'First, last & multi-touch', sub: 'See how credit shifts across the whole journey, not just the last click before checkout' },
    { value: '~5 min', label: 'Setup time', sub: 'Paste one script into your theme — no app, no plugin, no developer needed' },
  ],

  features: {
    heading: 'Attribution for how Shopify shoppers actually buy',
    subheading: 'Buyers compare across search, AI tools, email, and ads before they check out. SourceTrack traces the full path — and ties each order to the source that started it.',
    items: [
      {
        icon: '🧾',
        title: 'Every order, traced to its source',
        body: 'Fire a conversion on your order-status page with the order total and ID. SourceTrack records it alongside the visitor’s UTM parameters and referral history, so each sale is tied to the source that actually drove it.',
      },
      {
        icon: '🏷️',
        title: 'UTM & campaign tracking',
        body: 'Every campaign, channel, and landing page is captured automatically from the first visit. See which campaigns bring buyers — not just clicks — down to the order.',
      },
      {
        icon: '🤖',
        title: 'Named AI referrals, not "direct"',
        body: 'When a shopper arrives from ChatGPT, Perplexity, Gemini, or Claude, SourceTrack names the source instead of burying it in direct traffic — and tracks what that visitor does next.',
      },
      {
        icon: '🪝',
        title: 'Manual webhook recipe — no native app',
        body: 'No app to install and no marketplace listing to wait on. Add the lightweight script to your theme and send order data with a documented manual webhook recipe. Connect Stripe (beta / test-mode) too if you use it.',
      },
      {
        icon: '🛤️',
        title: 'Order-level journey timelines',
        body: 'See every touchpoint for an order — first visit, the pages in between, the return that converted. Filter by channel, device, country, or landing page.',
      },
      {
        icon: '🔒',
        title: 'Cookieless by default',
        body: 'First-party, cookieless tracking with no fingerprinting. Privacy isn’t a toggle you flip — it’s how the tracker works. Core data is stored in the EU.',
      },
    ],
  },

  steps: {
    heading: 'From zero to attributed orders in minutes',
    subheading: 'No app, no plugin, no developer. Paste the script and send your orders.',
    items: [
      {
        number: '01',
        title: 'Add the script to your Shopify theme',
        body: 'In Online Store → Themes → Edit code, paste the lightweight tracking snippet into theme.liquid inside <head>. It captures pageviews, UTM parameters, and AI referrers automatically.',
        code: `<script async\n  src="https://api.srctk.com/tracker.min.js"\n  data-site-key="YOUR_KEY">\n</script>`,
      },
      {
        number: '02',
        title: 'Record the purchase on your order-status page',
        body: 'On the order-status (thank-you) page, call sourcetrack.conversion() with the order total and ID so the sale is attributed to its source.',
        code: `sourcetrack.conversion({\n  value: {{ order.total_price | divided_by: 100.0 }},\n  type: 'purchase',\n  order_id: '{{ order.name }}'\n})`,
      },
      {
        number: '03',
        title: 'See every order attributed in your dashboard',
        body: 'Open SourceTrack to see each order traced to its real source — including the AI referrals most analytics log as direct — with first-, last-, and multi-touch views.',
        code: null,
      },
    ],
  },

  faqs: {
    heading: 'Shopify attribution questions',
    items: [
      {
        q: 'Do I need to install an app?',
        a: 'No. SourceTrack works with a lightweight script in your theme plus a documented manual webhook recipe for order data. There’s no app to install and no native integration to wait for.',
      },
      {
        q: 'How does revenue attribution work?',
        a: 'Send order value through the conversion call on your order-status page, through a manual webhook, or via Stripe (beta / test-mode). SourceTrack ties that revenue to the source behind the order. Where no revenue is connected, it shows orders and conversions instead — and never invents a number.',
      },
      {
        q: 'Why does my analytics show AI traffic as "direct"?',
        a: 'ChatGPT, Perplexity, and other AI tools often strip the referrer before a shopper reaches your store, so the visit looks like direct traffic. SourceTrack identifies these visitors and names the source, so the orders they drive are attributed correctly.',
      },
      {
        q: 'Is it private?',
        a: 'Yes. The tracker is cookieless by default, first-party, with no fingerprinting. Core data is stored in the EU. Update your privacy policy before production use.',
      },
    ],
  },

  ctaHeadline: 'Trace every Shopify order to its source.',
  ctaBody: 'One script, a manual webhook recipe, and the campaigns, search, and AI referrals behind every sale. Start free, no card required.',

  jsonLd: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "Do I need to install an app?", "acceptedAnswer": { "@type": "Answer", "text": "No. SourceTrack works with a lightweight script in your theme plus a documented manual webhook recipe for order data. There is no app to install and no native integration to wait for." } },
      { "@type": "Question", "name": "How does revenue attribution work?", "acceptedAnswer": { "@type": "Answer", "text": "Send order value through the conversion call on your order-status page, through a manual webhook, or via Stripe (beta / test-mode). SourceTrack ties that revenue to the source behind the order." } },
      { "@type": "Question", "name": "Why does my analytics show AI traffic as direct?", "acceptedAnswer": { "@type": "Answer", "text": "AI tools often strip the referrer before a shopper reaches your store, so the visit looks like direct traffic. SourceTrack identifies these visitors and names the source." } },
    ]
  },
}

export default function SolutionShopify() {
  return <SolutionPage data={DATA} />
}
