import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import PricingCards from '../components/PricingCards'
import FAQSection from '../components/FAQSection'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack Pricing — Simple Attribution Pricing, Free Forever Tier | SourceTrack',
  description: 'Simple pricing for marketing attribution, AI referral tracking, customer journeys, conversion tracking, and custom report builder dashboards. Start free for 5,000 pageviews/mo.',
  canonical: 'https://sourcetrack.ai/pricing',
  ogTitle: 'SourceTrack Pricing',
}

const HERO = {
  kicker: 'Pricing',
  h1: 'Simple attribution pricing that grows with you.',
  sub: 'Start free with 5,000 pageviews per month. Validate your tracking setup and attribution data. Upgrade when attribution becomes part of your growth workflow.',
  primaryCta: 'Start free',
  secondaryCta: 'Talk to sales',
  secondaryHref: 'mailto:sales@sourcetrack.ai',
}

export default function Pricing() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>

      {/* Pricing cards */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
        <div className="max-w-[1320px] mx-auto px-8">
          <PricingCards />
        </div>
      </section>

      {/* FAQ */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="FAQ" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Questions teams ask before starting with SourceTrack.
          </h2>

          <div className="mt-[54px]">
            <FAQSection faqs={[
              { q: 'How do I install SourceTrack?', a: 'Paste one 1.7 KB script tag into your site or add it through Google Tag Manager. Works on any website, Shopify store, Webflow site, or WordPress site. No developer required.' },
              { q: 'Does SourceTrack track AI referrals like ChatGPT traffic?', a: 'Yes — it is one of the core product features. SourceTrack detects 15 AI platforms and 22 domains, including ChatGPT, Claude, Gemini, and Perplexity, and attributes leads and revenue to the correct AI source instead of labeling them as direct traffic.' },
              { q: 'Do I need a data analyst to use SourceTrack?', a: 'No. The report builder is built for founders and marketers. Start from common attribution questions, choose the dimension, and pin widgets to your dashboard. No SQL, no Explore reports, no analytics team required.' },
              { q: 'How does the free plan work?', a: 'Free forever for up to 5,000 pageviews per month. Includes one website, live analytics, and last-touch attribution. Perfect for validating your setup before upgrading for multi-touch models, cookieless mode, and higher limits.' },
              { q: 'What attribution models does SourceTrack support?', a: 'All plans include last-touch. Paid plans add first touch, linear, time decay, U-shaped, W-shaped, and position-based models. Compare channels across all 8 models from a single dashboard.' },
              { q: 'Can I cancel anytime?', a: 'Yes. No annual contracts. Upgrade or downgrade as your traffic and attribution needs change.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
