import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'Marketing Attribution Software — Track Which Sources Create Revenue | SourceTrack',
  description: 'Track first touch, last touch, multi-touch journeys, campaign performance, landing pages, AI referrals, and revenue attribution across 8 models. Independent, neutral attribution for founders and marketers.',
  canonical: 'https://sourcetrack.ai/attribution',
  ogTitle: 'Marketing Attribution Software — SourceTrack',
}

const HERO = {
  kicker: 'Marketing attribution software',
  h1: 'Know the source behind every lead, trial, and purchase.',
  sub: 'Track the complete path from first click to paying customer. Compare channels across 8 attribution models, prove the real ROI of your campaigns, and stop relying on biased ad-platform self-reporting.',
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
              <SectionKicker label="The attribution problem" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                Every platform claims credit. SourceTrack gives you an independent source of truth.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              Ad platforms self-report conversion data to justify your spend. GA4 over-credits the last click. SourceTrack tracks every touchpoint in the journey, giving you a neutral source of truth to reduce wasted budget and scale what converts.
            </p>
          </div>

          <FeatureCards items={[
            { icon: 'FT', title: 'First touch attribution.', body: 'Find the channel, campaign, or page that first introduced a visitor who later became a customer. Give credit to the sources that start the journey.' },
            { icon: 'LT', title: 'Multi-touch attribution.', body: 'Go beyond first and last touch. Use linear, U-shaped, W-shaped, time decay, and position-based models to see the full influence picture.' },
            { icon: '$', title: 'Revenue attribution.', body: 'Connect purchases, demos, trials, signups, and forms back to the channels that influenced them. Attribute revenue, not just events.' },
          ]} />
        </div>
      </section>

      {/* Attribution data captured */}
      <section className="py-[96px] bg-st-black text-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="What SourceTrack attributes" dark />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black">
            Every signal that explains why a conversion happened.
          </h2>
          <p className="mt-5 max-w-[620px] mx-auto text-[#B9C2C2] text-lg leading-[1.55]">
            SourceTrack captures the small details that most analytics tools ignore — AI platform referrers, campaign params across sessions, and the full journey path.
          </p>

          <div className="mt-[54px]">
            <HowItWorksSteps steps={[
              { title: 'UTMs and source params', body: 'Preserve campaign data across landing pages, sessions, and days. GCLID, FBCLID, MSCLKID all captured.' },
              { title: 'Referrers and AI traffic', body: '15 AI platforms detected — ChatGPT, Claude, Gemini, Perplexity, and more. No more AI traffic in direct.' },
              { title: 'Landing page paths', body: 'See which entry pages create leads and which assist the journey toward conversion.' },
              { title: 'Conversion events', body: 'Attribute purchases, trials, demos, forms, and custom events — not just pageviews.' },
            ]} />
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Attribution use cases" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Answer the attribution questions teams ask every week.
          </h2>

          <div className="mt-[54px]">
            <FeatureCards compact items={[
              { icon: '①', title: 'Which campaigns deserve more spend?', body: 'Compare channels, campaigns, and landing pages by attributed revenue — not by last-click conversions or platform-reported metrics.' },
              { icon: '②', title: 'Which pages create qualified leads?', body: 'Attribute every form, demo, and trial back to the landing page and source that first brought the visitor.' },
              { icon: '③', title: 'Is AI search creating pipeline?', body: 'Track ChatGPT, Claude, Gemini, and Perplexity traffic. See conversion rates and revenue from each AI platform.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
