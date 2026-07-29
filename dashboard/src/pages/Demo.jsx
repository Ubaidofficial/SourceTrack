import React from 'react'
import MarketingPage from '../components/MarketingPage'
import MarketingInteractiveDemo from '../components/MarketingInteractiveDemo'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'Interactive Marketing Attribution Demo | SourceTrack',
  description: 'Explore SourceTrack attribution and visitor analytics with preloaded SaaS, ecommerce, and agency sample journeys. See how we trace conversions to acquisition sources.',
  canonical: 'https://www.sourcetrack.ai/demo',
  ogTitle: 'Interactive Attribution & Journey Demo | SourceTrack',
}

const HERO = {
  kicker: 'Interactive Product Demo',
  h1: 'Explore attribution',
  h1Gradient: 'with sample data.',
  sub: 'Switch between SaaS, eCommerce, Lead Gen, and Agency examples to see how SourceTrack connects sources, journeys, conversions, and revenue. No account or installation needed.',
  primaryCta: 'Start tracking free',
  primaryHref: '/signup',
  secondaryCta: 'View pricing',
  secondaryHref: '/pricing',
  proofs: ['Preloaded sample data', 'Explore SaaS, eCommerce, and Lead Gen scenarios', 'Full multi-touch attribution journeys'],
}

export default function Demo() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={null}>
      {/* Full-Width Interactive Demo Container */}
      <section className="py-[72px] border-b border-[rgba(31,35,35,.06)] bg-[#F7FAFA]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
          <MarketingInteractiveDemo />
        </div>
      </section>

      {/* Explanation Grid: What you are seeing */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="How it works" />
            <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
              What you are seeing in the demo
            </h2>
            <p className="mt-4 max-w-[620px] mx-auto text-[#586464] text-lg leading-[1.55]">
              Here is how SourceTrack processes visitor data to build these attribution dashboard reports.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="flex flex-col">
              <strong className="text-xl font-black text-st-black tracking-tight">1. Source Capture</strong>
              <p className="mt-3 text-[#586464] text-sm leading-relaxed">
                When a visitor arrives, the tracking script records their campaign referrers, click ID parameters (like gclid or fbclid), and derived AI platform referrers.
              </p>
            </div>
            <div className="flex flex-col">
              <strong className="text-xl font-black text-st-black tracking-tight">2. Journey Tracking</strong>
              <p className="mt-3 text-[#586464] text-sm leading-relaxed">
                As the visitor navigates, we map their pageviews, content engagements, and pricing table checks on a unified chronological timeline stored in their session context.
              </p>
            </div>
            <div className="flex flex-col">
              <strong className="text-xl font-black text-st-black tracking-tight">3. Conversion Ingestion</strong>
              <p className="mt-3 text-[#586464] text-sm leading-relaxed">
                When a transaction is made, a webhook (from Stripe or Shopify) or a custom conversion script triggers, reporting the event value and deduplication keys.
              </p>
            </div>
            <div className="flex flex-col">
              <strong className="text-xl font-black text-st-black tracking-tight">4. Attribution Modeling</strong>
              <p className="mt-3 text-[#586464] text-sm leading-relaxed">
                Our database connects the conversion back to the journey using anonymous identifiers, instantly calculating revenue credits across 9 attribution models.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
