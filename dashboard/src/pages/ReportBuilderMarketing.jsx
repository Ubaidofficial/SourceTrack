import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import ReportBuilderMock from '../components/ReportBuilderMock'
import FeatureCards from '../components/FeatureCards'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'Attribution Report Builder — Build Custom Dashboards from Your Data | SourceTrack',
  description: 'Build custom attribution dashboards from source, journey, conversion, AI referral, and revenue data. Start blank, pin only the metrics your team needs for budget and channel decisions.',
  canonical: 'https://sourcetrack.ai/report-builder',
  ogTitle: 'Report Builder — SourceTrack',
}

const HERO = {
  kicker: 'Report builder',
  h1: 'Build dashboards from the metrics your team actually cares about.',
  sub: 'SourceTrack starts blank by default. No pre-built dashboards cluttered with irrelevant widgets. Choose the metric, choose the dimension, save it, and pin it — your dashboard should match your business model, not a template.',
  primaryCta: 'Start building reports',
  secondaryCta: 'View product',
  secondaryHref: '/product',
}

export default function ReportBuilderMarketing() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<ReportBuilderMock />}>

      {/* Why report builder matters */}
      <section className="py-[96px] style={{ background: '#F7FAFA' }}">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="Why report builder matters" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                Your dashboard should answer the questions you actually ask — not the ones a template chose.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              Most analytics tools overwhelm you with 30 widgets you don't need. SourceTrack starts blank. You build, save, and pin only the attribution reports that help your team make budget and channel decisions.
            </p>
          </div>

          <FeatureCards items={[
            { icon: '01', title: 'Choose the question.', body: 'Start from attributed revenue, AI traffic conversion rates, landing page performance, lead source quality, or custom milestones.' },
            { icon: '02', title: 'Choose the dimension.', body: 'Group results by source, channel, campaign, landing page, referring domain, browser, or conversion type.' },
            { icon: '03', title: 'Pin what matters.', body: 'Save the widget. Pin it to your dashboard. Change it when your questions change. No clutter, no irrelevant metrics.' },
          ]} />
        </div>
      </section>

      {/* Report templates */}
      <section className="py-[96px] bg-[#F7FAFA]">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Report templates" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Start with high-intent reports attribution teams already build.
          </h2>

          <div className="mt-[54px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Attributed purchase revenue</strong>
              <p className="mt-1.5 text-[#586464] text-[15px] font-semibold">Show which channels create paid customers across all attribution models.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">AI traffic quality</strong>
              <p className="mt-1.5 text-[#586464] text-[15px] font-semibold">Compare AI referral conversion rates and revenue against traditional search and social paths.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Landing page revenue</strong>
              <p className="mt-1.5 text-[#586464] text-[15px] font-semibold">Find entry pages that produce pipeline — attribute revenue back to the pages that start journeys.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Imported cost vs attributed revenue</strong>
              <p className="mt-1.5 text-[#586464] text-[15px] font-semibold">Measure campaign cost performance by mapping spreadsheet ad spend against attributed revenue outcomes.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Lead source quality</strong>
              <p className="mt-1.5 text-[#586464] text-[15px] font-semibold">See which sources produce qualified leads vs. raw form fills. Measure average quality scores by channel.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Stripe/API trial-to-paid</strong>
              <p className="mt-1.5 text-[#586464] text-[15px] font-semibold">Track trial conversion events by acquisition channel using webhook integration recipes.</p>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
