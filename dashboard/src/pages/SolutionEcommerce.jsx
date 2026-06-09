import SolutionPage from './SolutionPage'

const DATA = {
  slug: 'use-cases/ecommerce',
  title: 'E-commerce Order Attribution Software | SourceTrack',
  description: 'Stop over-crediting paid ads. SourceTrack gives Shopify and WooCommerce stores full multi-touch attribution — including ChatGPT and AI traffic GA4 marks as direct. Conversion-based pricing from $19/mo.',
  canonical: 'https://sourcetrack.ai/use-cases/ecommerce',
  ogTitle: 'eCommerce Attribution — Track Every Sale Back to Its Source | SourceTrack',
  ogDescription: 'Multi-touch attribution for Shopify and WooCommerce. See which channels drive buyers — including AI referrals GA4 misses. Designed for privacy-conscious conversion tracking.',

  badge: 'eCommerce Attribution — Built for Shopify, WooCommerce & DTC brands',
  headline: 'Stop over-crediting your last ad.',
  headlineAccent: 'See every touchpoint that drove the sale.',
  subheadline: "Your ROAS reports look great, but last-click attribution and ad-platform self-reporting are lying to you. SourceTrack shows the full buyer journey from first click to purchase — eliminating duplicate conversion reports so you know which campaigns actually drive revenue.",

  stats: [
    { value: '15+', label: 'AI platforms tracked', sub: 'ChatGPT, Claude, Gemini, Perplexity, and more — visitors that GA4 marks as direct traffic, now attributed correctly' },
    { value: '8', label: 'Attribution models', sub: 'Compare first touch, last touch, linear, time decay, U-shaped, and W-shaped — all from one dashboard' },
    { value: '3 min', label: 'Time to live data', sub: 'Paste one lightweight snippet into your Shopify theme or WooCommerce header — no plugin, no GTM, no developer needed' },
  ],

  features: {
    heading: 'Attribution built for how eCommerce buyers actually shop',
    subheading: 'Shoppers compare products across AI tools, paid ads, email, and organic search before buying. SourceTrack tracks the full path — not just the last click.',
    items: [
      {
        icon: '🛍️',
        title: 'Shopify & WooCommerce — quick setup',
        body: 'Paste one lightweight script tag into your theme <head>. Captures every pageview, add-to-cart, and purchase with UTM parameters and AI referrer detection built in. No app or plugins required.',
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
        title: 'Conversion-ready structure',
        body: 'Every purchase event is structured to feed into server-side destinations. Our clean webhook payloads are designed to support future ad platform conversion sync integrations.',
      },
      {
        icon: '🛤️',
        title: 'Order-level journey timelines',
        body: "See every touchpoint for every order — from the first visit to checkout. Filter by channel, device, country, or landing page. Identify which ad campaigns start the buying journey vs. which ones close it.",
      },
      {
        icon: '🔒',
        title: 'Privacy-conscious by default',
        body: "Enable cookieless mode with one attribute on the script tag. Cookieless mode avoids browser cookies and localStorage — suitable for privacy-conscious deployments and privacy-first EU markets.",
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
        body: "Paste the lightweight tracking snippet into your theme's <head>. On Shopify, use Online Store → Themes → Edit code → theme.liquid. On WooCommerce, use the header snippet option.",
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
        a: "Yes. Paste the lightweight tracking snippet into your Shopify theme's theme.liquid inside <head>. Add the conversion call to your checkout.liquid thank-you page with your order total and order ID. You'll be tracking within minutes — no app, no GTM, no plugin required.",
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
        q: 'How does conversion tracking work for purchases?',
        a: "When you fire sourcetrack.conversion() with type: 'purchase', SourceTrack records the conversion event alongside the visitor's UTM parameters, click IDs, and referral history. This provides a unified history of what drove the sale, ready for export or webhook forwarding to downstream platforms.",
      },
      {
        q: 'How does pricing work for eCommerce stores?',
        a: "You pay based on your conversion volume and tracked pageviews. A store with 150,000 tracked pageviews and up to 750 conversion source profiles fits on Growth.",
      },
    ],
  },

  ctaHeadline: 'See where your buyers really come from.',
  ctaBody: "Your last-click reports are hiding the content, AI referrals, and organic visits that start every sale. Fix your attribution in 3 minutes. No credit card.",

  jsonLd: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "Does SourceTrack work with Shopify?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Paste the tracking snippet into your Shopify theme's theme.liquid inside <head>. Add the conversion call to your checkout.liquid thank-you page with your order total and order ID." } },
      { "@type": "Question", "name": "How do I track abandoned cart attribution?", "acceptedAnswer": { "@type": "Answer", "text": "Fire a sourcetrack.conversion() call with type: 'add_to_cart' when a visitor adds to cart. This lets you attribute cart additions to their source." } },
      { "@type": "Question", "name": "Why is my GA4 showing too much direct traffic from AI platforms?", "acceptedAnswer": { "@type": "Answer", "text": "ChatGPT and other AI platforms often strip referrer headers — so visits look like direct traffic in GA4. SourceTrack identifies these visitors across 15 AI platforms and 22 domains." } },
    ]
  },
}

export default function SolutionEcommerce() {
  return <SolutionPage data={DATA} />
}
