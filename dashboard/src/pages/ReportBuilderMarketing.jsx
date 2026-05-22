import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import ReportBuilderMock from '../components/ReportBuilderMock'
import FeatureCards from '../components/FeatureCards'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'Attribution Report Builder — SourceTrack',
  description: 'Build custom attribution dashboards from source, journey, conversion, AI referral, and revenue data.',
  canonical: 'https://sourcetrack.ai/report-builder',
}

const HERO = {
  kicker: 'Report builder',
  h1: 'Build dashboards from the metrics you actually need.',
  sub: 'SourceTrack starts blank by default. Create, save, and pin reports from your attribution data instead of looking at generic default widgets.',
  primaryCta: 'Start building reports',
  secondaryCta: 'View product',
  secondaryHref: '/product',
}

export default function ReportBuilderMarketing() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<ReportBuilderMock />}>

      {/* Why report builder matters */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="Why report builder matters" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                Your dashboard should match your business model.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              Analytics products often overwhelm users with default dashboards. SourceTrack is stronger when the dashboard is built from saved reports that match the user's business.
            </p>
          </div>

          <FeatureCards items={[
            { icon: '01', title: 'Choose the question.', body: 'Start from revenue, leads, trial conversion, AI traffic, campaign ROI, or landing page performance.' },
            { icon: '02', title: 'Choose the dimension.', body: 'Group results by source, channel, campaign, landing page, referrer, device, or event.' },
            { icon: '03', title: 'Pin the widget.', body: 'Save the report and add it to your dashboard only when it helps the team make decisions.' },
          ]} />
        </div>
      </section>

      {/* Report templates */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Report templates" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Start with high-intent reports teams already need.
          </h2>

          <div className="mt-[54px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col p-6 rounded-[26px] bg-[#F7FAFA] border border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Revenue by channel</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Show which channels create paid customers.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">AI traffic quality</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Compare AI referrals by leads, trials, and revenue.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Landing page performance</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Find entry pages that produce pipeline.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Campaign ROAS</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Measure performance beyond platform-reported conversions.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Lead source quality</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">See which sources create qualified leads.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Trial to paid</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Track trial conversion by channel and campaign.</p>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
