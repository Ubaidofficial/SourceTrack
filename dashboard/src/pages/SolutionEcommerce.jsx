import SolutionPage from './SolutionPage'

const DATA = {
  slug: 'ecommerce-attribution',
  title: 'eCommerce Attribution Software — Track Shopify, WooCommerce & AI Traffic | SourceTrack',
  description: 'Stop over-crediting paid ads. SourceTrack gives Shopify and WooCommerce stores full multi-touch attribution — including ChatGPT and AI traffic GA4 marks as direct. Traffic-based pricing from $49/mo.',
  canonical: 'https://sourcetrack.ai/ecommerce-attribution',
  ogTitle: 'eCommerce Attribution — Track Every Sale Back to Its Source | SourceTrack',
  ogDescription: 'Multi-touch attribution for Shopify and WooCommerce. See which channels drive buyers — including AI referrals GA4 misses. Server-side CAPI sync to Meta and Google.',

  badge: 'eCommerce Attribution — Built for Shopify, WooCommerce & DTC brands',
  headline: 'Stop over-crediting your last ad.',
  headlineAccent: 'See every touchpoint that drove the sale.',
  subheadline: "Your ROAS reports look great, but last-click attribution is lying to you. SourceTrack shows the full buyer journey — from the ChatGPT recommendation to the Google retargeting click that closed the deal — for every order in your store.",

  stats: [
    { value: '30%+', label: 'Revenue from AI referrals', sub: 'Average share of eCommerce revenue that originates from AI platforms like ChatGPT and Perplexity — invisible in GA4' },
    { value: '54×', label: 'Lighter than GA4', sub: "1.7 KB script that loads instantly and doesn't slow your Core Web Vitals or conversion rate" },
    { value: '3 min', label: 'Time to live data', sub: 'Paste one snippet into your Shopify theme or WooCommerce header — no plugin, no GTM, no developer needed' },
  ],

  features: {
    heading: 'Attribution built for how eCommerce buyers actually shop',
    subheading: 'Shoppers compare products across AI tools, paid ads, email, and organic search before buying. SourceTrack tracks the full path — not just the last click.',
    items: [
      {
        icon: '🛍️',
        title: 'Shopify & WooCommerce — 2-minute setup',
        body: 'Paste one 1.7 KB script tag into your theme <head>. Captures every pageview, add-to-cart, and purchase with UTM parameters and AI referrer detection built in. No Shopify app required.',
      },
      {
        icon: '🤖',
        title: 'AI shopping referral attribution',
        body: "When a buyer searches 'best running shoes' on ChatGPT and clicks through to your store, GA4 logs that visit as direct traffic. SourceTrack identifies it correctly across 15 AI platforms — so the revenue doesn't get misattributed to retargeting.",
      },
      {
        icon: '📊',
        title: 'True ROAS by channel',
        body: "See revenue attributed to each source using 8 models — not just last-click. When U-Shaped attribution shows that 40% of a sale's credit goes to the ChatGPT session that started the journey, you can defend content investment with data.",
      },
      {
        icon: '🔁',
        title: 'Meta & Google CAPI sync',
        body: "Every purchase automatically fires a server-side event to Meta CAPI and Google Ads Conversions API — bypassing iOS ad-blockers and Safari tracking restrictions. Your ad platforms get accurate conversion data for smarter bidding.",
      },
      {
        icon: '🛤️',
        title: 'Order-level journey timelines',
        body: "See every touchpoint for every order — from the first visit to checkout. Filter by channel, device, country, or landing page. Identify which ad campaigns start the buying journey vs. which ones close it.",
      },
      {
        icon: '🔒',
        title: 'GDPR-compliant by default',
        body: "Enable cookieless mode with one attribute on the script tag. No consent banner required. Works in EU markets, UK (PECR), and California — without sacrificing conversion accuracy.",
      },
    ],
  },

  steps: {
    heading: 'From zero to accurate attribution in 3 minutes',
    subheading: 'No developer, no GTM, no plugin. Just paste and go.',
    items: [
      {
        number: '01',
        title: 'Add to your Shopify theme or WooCommerce header',
        body: "Paste the 1.7 KB script tag into your theme's <head>. On Shopify, use Online Store → Themes → Edit code → theme.liquid. On WooCommerce, use the header snippet option.",
        code: `<script async\n  src="https://api.srctk.com/tracker/tracker.min.js"\n  data-site-key="YOUR_KEY">\n</script>`,
      },
      {
        number: '02',
        title: 'Fire a purchase conversion on order confirmation',
        body: "On your order confirmation page, call sourcetrack.conversion() with the order total and ID. On Shopify, add this to your checkout.liquid thank-you page. WooCommerce: add to the order-received template.",
        code: `sourcetrack.conversion({\n  value: {{ order.total_price | divided_by: 100.0 }},\n  type: 'purchase',\n  order_id: '{{ order.name }}'\n})`,
      },
      {
        number: '03',
        title: 'See true ROAS and AI-driven revenue in your dashboard',
        body: "Open your SourceTrack dashboard to see every order attributed to its real source — including the AI platform visits that GA4 was logging as direct. Switch between 8 attribution models to see how credit shifts when you look beyond last-click.",
        code: null,
      },
    ],
  },

  faqs: {
    heading: 'eCommerce attribution questions',
    items: [
      {
        q: 'Does SourceTrack work with Shopify?',
        a: "Yes. Paste the 1.7 KB snippet into your Shopify theme's theme.liquid inside <head>. Add the conversion call to your checkout.liquid thank-you page with your order total and order ID. You'll be tracking within minutes — no Shopify app, no GTM, no plugin required.",
      },
      {
        q: 'How do I track abandoned cart attribution?',
        a: "Fire a sourcetrack.conversion() call with type: 'add_to_cart' when a visitor adds to cart. This lets you attribute cart additions to their source — so you can see which channels bring high-intent shoppers and which bring browsers. Combine with your email/SMS abandon flow data to see full funnel attribution.",
      },
      {
        q: 'Why is my GA4 showing too much direct traffic from AI platforms?',
        a: "ChatGPT, Perplexity, and other AI platforms often strip referrer headers before clicking through to your store — so the visit looks like direct traffic in GA4. SourceTrack identifies these visitors using server-side referrer analysis and UTM pattern matching across 15 AI platforms and 22 domains. The revenue they drove is now attributed correctly.",
      },
      {
        q: 'Does CAPI sync work for Shopify purchases?',
        a: "Yes. When you fire sourcetrack.conversion() with type: 'purchase', SourceTrack simultaneously sends a server-side Purchase event to Meta CAPI and a Conversion to Google Ads via their API. This bypasses iOS 14+ tracking restrictions and browser ad-blockers — giving your ad platforms more complete conversion data for ROAS optimization.",
      },
      {
        q: 'How does traffic-based pricing work for eCommerce stores?',
        a: "You pay based on your monthly website visits — not per conversion. All plans include unlimited conversion and purchase tracking. A store with 40,000 monthly visits fits on the Starter plan at $49/mo. Unlimited conversions means you never pay more as your conversion rate improves.",
      },
    ],
  },

  ctaHeadline: 'See where your buyers really come from.',
  ctaBody: "Your last-click reports are hiding the content, AI referrals, and organic visits that start every sale. Fix your attribution in 3 minutes. No credit card.",

  jsonLd: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "Does SourceTrack work with Shopify?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Paste the 1.7 KB snippet into your Shopify theme's theme.liquid inside <head>. Add the conversion call to your checkout.liquid thank-you page with your order total and order ID." } },
      { "@type": "Question", "name": "How do I track abandoned cart attribution?", "acceptedAnswer": { "@type": "Answer", "text": "Fire a sourcetrack.conversion() call with type: 'add_to_cart' when a visitor adds to cart. This lets you attribute cart additions to their source." } },
      { "@type": "Question", "name": "Why is my GA4 showing too much direct traffic from AI platforms?", "acceptedAnswer": { "@type": "Answer", "text": "ChatGPT and other AI platforms often strip referrer headers — so visits look like direct traffic in GA4. SourceTrack identifies these visitors across 15 AI platforms and 22 domains." } },
    ]
  },
}

export default function SolutionEcommerce() {
  return <SolutionPage data={DATA} />
}
