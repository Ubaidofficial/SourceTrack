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
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
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
            { icon: '01', title: 'Choose the question.', body: 'Start from revenue by channel, AI traffic quality, campaign ROAS, landing page performance, lead source quality, or any custom metric.' },
            { icon: '02', title: 'Choose the dimension.', body: 'Group results by source, channel, campaign, landing page, referrer, device, country, or conversion event type.' },
            { icon: '03', title: 'Pin what matters.', body: 'Save the widget. Pin it to your dashboard. Change it when your questions change. No clutter, no irrelevant metrics.' },
          ]} />
        </div>
      </section>

      {/* Report templates */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Report templates" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Start with high-intent reports attribution teams already build.
          </h2>

          <div className="mt-[54px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col p-6 rounded-[26px] bg-[#F7FAFA] border border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Revenue by channel</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Show which channels create paid customers across all attribution models.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">AI traffic quality</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Compare AI referral conversion rates and revenue against all channels.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Landing page revenue</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Find entry pages that produce pipeline — attribute revenue back to the pages that start journeys.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Campaign ROAS</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Measure campaign performance beyond platform-reported last-click conversions.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Lead source quality</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">See which sources produce qualified leads vs. raw form fills. Measure CPL by channel.</p>
            </div>
            <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[138px]">
              <strong className="text-lg tracking-[-0.04em]">Trial to paid</strong>
              <p className="mt-1.5 text-[#586464] text-[15px]">Track trial conversion by acquisition channel — see which sources produce paying customers.</p>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
