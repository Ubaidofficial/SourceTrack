import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import ComparisonTable from '../components/ComparisonTable'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack vs GA4 — A Simpler Attribution Alternative | SourceTrack',
  description: 'Compare SourceTrack and GA4 for marketing attribution, AI referral tracking, customer journeys, revenue reporting, and custom dashboards. Independent, neutral, focused attribution.',
  canonical: 'https://sourcetrack.ai/compare-ga4',
  ogTitle: 'SourceTrack vs GA4',
}

const HERO = {
  kicker: 'GA4 alternative',
  h1: "GA4 tells you what happened. SourceTrack tells you which source made it happen.",
  sub: 'GA4 is built to measure pageviews, not customer journeys. SourceTrack is focused revenue attribution — built to answer one question without data overload: which campaign, keyword, page, or AI search actually produced the customer?',
  primaryCta: 'Start free',
  secondaryCta: 'View attribution',
  secondaryHref: '/attribution',
}

export default function CompareGA4() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<DashboardPreviewMock />}>

      {/* Comparison table */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Compare" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            SourceTrack vs GA4 for attribution-focused teams.
          </h2>
          <p className="mt-5 max-w-[620px] mx-auto text-[#586464] text-lg leading-[1.55]">
            GA4 leaves you drowning in data overload, while ad platforms claim duplicate credit for the same sale. SourceTrack strips away the noise, tracking the full customer journey to show you exactly where your revenue comes from.
          </p>

          <div className="mt-[54px]">
            <ComparisonTable rows={[
              ['Feature', 'SourceTrack', 'GA4', 'Ad platforms'],
              ['Multi-touch attribution', '8 models built in', 'Partial — last-click dominant', 'Platform-specific only'],
              ['AI referral tracking', '15 platforms detected', 'Limited — often labeled direct', 'Not available'],
              ['Full journey timeline', 'Every touchpoint per visitor', 'Hard to reconstruct', 'Not available'],
              ['Custom report builder', 'Blank canvas + save + pin', 'Complex — Explore only', 'Not available'],
              ['Install & setup speed', 'One script, minutes', 'Config-heavy, tag setup', 'Platform-specific'],
              ['Revenue attribution', 'Independent, per channel', 'Partial, last-click biased', 'Platform-biased'],
            ]} />
          </div>
        </div>
      </section>

      {/* When SourceTrack fits better */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="When SourceTrack fits better" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                Built for teams that need attribution answers, not all-encompassing analytics.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              SourceTrack isn't trying to be GA4. It's focused on one thing: attributing leads, trials, purchases, and revenue to the sources, campaigns, and pages that actually created them — including the AI platforms GA4 can't identify.
            </p>
          </div>

          <FeatureCards compact items={[
            { icon: '①', title: 'You care about which channels produce revenue.', body: 'Track every campaign, channel, landing page, and AI source. Compare them across 8 attribution models in one workspace.' },
            { icon: '②', title: 'You want attribution that works in minutes.', body: 'Paste one script. Define your conversions. Start seeing attributed revenue on day one — no analytics implementation project required.' },
            { icon: '③', title: 'You need AI referral tracking that actually works.', body: '15 AI platforms detected automatically. No more AI-driven leads and purchases lost to the "direct" traffic bucket.' },
          ]} />
        </div>
      </section>
    </MarketingPage>
  )
}
