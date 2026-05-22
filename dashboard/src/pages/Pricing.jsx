import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import PricingCards from '../components/PricingCards'
import FAQSection from '../components/FAQSection'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack Pricing — Simple attribution pricing',
  description: 'Simple pricing for marketing attribution, AI referral tracking, customer journeys, conversion tracking, and report builder dashboards.',
  canonical: 'https://sourcetrack.ai/pricing',
}

const HERO = {
  kicker: 'Pricing',
  h1: 'Simple attribution pricing that grows with you.',
  sub: 'Start free, validate your tracking setup, then upgrade when attribution becomes part of your growth workflow.',
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
            Pricing questions buyers ask before starting.
          </h2>

          <div className="mt-[54px]">
            <FAQSection faqs={[
              { q: 'Can I install with Google Tag Manager?', a: 'Yes. SourceTrack supports GTM or a direct script installation.' },
              { q: 'Does SourceTrack track AI referrals?', a: 'Yes. It is designed to reveal AI discovery traffic and conversion impact.' },
              { q: 'Do I need a data analyst?', a: 'No. The report builder is built for founders and marketers.' },
              { q: 'Can I start with a blank dashboard?', a: 'Yes. Users build and pin the reports they actually need.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
