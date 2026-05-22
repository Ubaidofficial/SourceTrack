import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'Marketing Attribution Software — SourceTrack',
  description: 'Track first touch, last touch, campaign journeys, landing pages, AI referrals, and revenue attribution with SourceTrack.',
  canonical: 'https://sourcetrack.ai/attribution',
}

const HERO = {
  kicker: 'Marketing attribution software',
  h1: 'Know the source behind every lead and customer.',
  sub: 'Track first touch, last touch, campaign journeys, landing pages, and conversion events so you can see what actually creates revenue.',
  primaryCta: 'Start tracking free',
  secondaryCta: 'Compare with GA4',
  secondaryHref: '/compare-ga4',
}

export default function Attribution() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<DashboardPreviewMock />}>

      {/* Attribution problems */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="Attribution problems" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                When every platform claims credit, you need an independent source of truth.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              SourceTrack helps teams compare paid, organic, social, email, partner, and AI channels using the same source and conversion logic.
            </p>
          </div>

          <FeatureCards items={[
            { icon: 'FT', title: 'First touch attribution.', body: 'Find the source that originally introduced a future customer to your business.' },
            { icon: 'LT', title: 'Last touch attribution.', body: 'Identify the final campaign, channel, page, or referral before conversion.' },
            { icon: '$', title: 'Revenue attribution.', body: 'Connect purchases, demos, trials, signups, and forms back to the channels that influenced them.' },
          ]} />
        </div>
      </section>

      {/* Attribution data captured */}
      <section className="py-[96px] bg-st-black text-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Attribution data captured" dark />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black">
            Designed for modern customer journeys.
          </h2>
          <p className="mt-5 max-w-[620px] mx-auto text-[#B9C2C2] text-lg leading-[1.55]">
            SourceTrack captures the small details that explain why a conversion happened.
          </p>

          <div className="mt-[54px]">
            <HowItWorksSteps steps={[
              { title: 'UTMs and source params', body: 'Preserve campaign data across landing pages and sessions.' },
              { title: 'Referrers and AI traffic', body: 'Capture traditional referrers and emerging AI discovery sources.' },
              { title: 'Landing page paths', body: 'See which pages created or assisted conversion intent.' },
              { title: 'Conversion events', body: 'Measure business outcomes, not only pageviews.' },
            ]} />
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Use cases" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Answer the attribution questions teams ask every week.
          </h2>

          <div className="mt-[54px]">
            <FeatureCards compact items={[
              { icon: '①', title: 'Which campaigns deserve more spend?', body: 'Compare performance by channel, landing page, and conversion event.' },
              { icon: '②', title: 'Which pages create qualified leads?', body: 'Attribute conversions back to entry pages and assisted journeys.' },
              { icon: '③', title: 'Is AI search creating pipeline?', body: 'Track ChatGPT, Claude, Gemini, Perplexity, and other AI-assisted visits.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
