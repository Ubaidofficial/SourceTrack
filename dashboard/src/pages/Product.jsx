import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack Product — Revenue attribution without the analytics maze',
  description: "Explore SourceTrack's attribution platform for source tracking, customer journeys, conversions, AI referrals, and custom reports.",
  canonical: 'https://sourcetrack.ai/product',
}

const HERO = {
  kicker: 'Product overview',
  h1: 'Revenue attribution without the analytics maze.',
  sub: 'SourceTrack gives founders and marketers one place to understand channels, campaigns, AI referrals, customer journeys, conversions, and reporting.',
  primaryCta: 'Start free',
  secondaryCta: 'See report builder',
  secondaryHref: '/report-builder',
}

export default function Product() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<DashboardPreviewMock />}>

      {/* Core platform */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="Core platform" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                Everything you need to answer where customers came from.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              SourceTrack keeps the product story simple: capture the visit, connect the journey, track the conversion, and build the report.
            </p>
          </div>

          <FeatureCards items={[
            { icon: '01', title: 'Capture visitor source.', body: 'Track UTMs, referrers, landing pages, campaign params, AI sources, click IDs, and direct traffic.' },
            { icon: '02', title: 'Connect the journey.', body: 'See the pages and touchpoints that happened before a lead, demo, trial, purchase, or custom event.' },
            { icon: '03', title: 'Build revenue reports.', body: 'Create custom dashboards instead of forcing every business into the same default analytics template.' },
          ]} />
        </div>
      </section>

      {/* Why it matters */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7">
            <div className="rounded-[36px] p-[48px] bg-st-black text-white border border-white/10 shadow-[0_24px_80px_rgba(31,35,35,.12)]">
              <SectionKicker label="Why it matters" dark />
              <h2 className="mt-5 text-[clamp(26px,3.5vw,44px)] leading-[0.94] tracking-[-0.06em] font-black">
                Ad platforms are biased. Analytics tools are noisy.
              </h2>
              <p className="mt-4 text-[#B9C2C2] text-base leading-[1.55]">
                SourceTrack sits closer to your customer journey so you can compare channels with a clearer view of outcomes.
              </p>
              <Link to="/attribution" className="mt-6 inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64] transition-all hover:-translate-y-px">
                View attribution engine
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Source capture</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">UTMs, referrers, landing pages, source params, and campaign metadata.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Customer journeys</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Follow each visitor from first touch to conversion.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Conversion tracking</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Purchases, demos, trials, forms, signups, meetings, and custom events.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">AI search visibility</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Track emerging discovery channels that traditional reports miss.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Report builder</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Create custom metrics and save them to the dashboard.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-[#F7FAFA] border border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Founder-friendly setup</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Get live faster without a long analytics implementation project.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-[96px] bg-st-black text-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="How it works" dark />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black">
            From one script to source-to-revenue clarity.
          </h2>
          <p className="mt-5 max-w-[620px] mx-auto text-[#B9C2C2] text-lg leading-[1.55]">
            SourceTrack is designed for teams that need attribution answers without a long analytics implementation project.
          </p>

          <div className="mt-[54px]">
            <HowItWorksSteps steps={[
              { title: 'Install the tracker', body: 'Add one script directly or through Google Tag Manager.' },
              { title: 'Capture the source', body: 'Preserve UTMs, referrers, AI sources, landing pages, and click IDs.' },
              { title: 'Track conversions', body: 'Measure forms, demos, signups, trials, purchases, and custom events.' },
              { title: 'Build reports', body: 'Pin only the dashboards your team actually uses to make decisions.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
