import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import ComparisonTable from '../components/ComparisonTable'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack vs GA4 — A simpler attribution alternative',
  description: 'Compare SourceTrack and GA4 for marketing attribution, AI referral tracking, customer journeys, revenue reporting, and report building.',
  canonical: 'https://sourcetrack.ai/compare-ga4',
}

const HERO = {
  kicker: 'GA4 alternative',
  h1: 'A simpler way to understand where revenue comes from.',
  sub: 'GA4 is powerful broad analytics. SourceTrack is focused on leads, journeys, campaigns, AI referrals, and revenue attribution.',
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
            GA4 is broad web analytics. SourceTrack is focused attribution for faster revenue answers.
          </p>

          <div className="mt-[54px]">
            <ComparisonTable rows={[
              ['Feature', 'SourceTrack', 'GA4', 'Ad platforms'],
              ['Simple install', 'Yes', 'Partial', 'Partial'],
              ['Lead journey tracking', 'Yes', 'Hard', 'No'],
              ['AI referral tracking', 'Yes', 'Limited', 'No'],
              ['Custom report builder', 'Yes', 'Complex', 'No'],
              ['Revenue attribution', 'Yes', 'Complex', 'Platform-biased'],
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
                Built for attribution decisions, not every analytics use case.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              SourceTrack works best when the team needs a clean answer to "which source created this lead, customer, or revenue?"
            </p>
          </div>

          <FeatureCards compact items={[
            { icon: '①', title: 'You need channel ROI clarity.', body: 'Track channels, campaigns, landing pages, and conversions in a workflow built for revenue attribution.' },
            { icon: '②', title: 'You want faster setup.', body: 'Install one script, choose conversions, and build reports without a heavy analytics project.' },
            { icon: '③', title: 'You care about AI referrals.', body: 'Reveal emerging AI discovery sources that often disappear inside generic analytics reports.' },
          ]} />
        </div>
      </section>
    </MarketingPage>
  )
}
