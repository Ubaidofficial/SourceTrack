import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack Product — Revenue Attribution Without the Analytics Maze',
  description: 'Explore how SourceTrack captures visitor sources, connects multi-touch customer journeys, tracks conversions and AI referrals, and attributes revenue back to the channels that created it.',
  canonical: 'https://sourcetrack.ai/product',
  ogTitle: 'SourceTrack Product — Revenue attribution without the analytics maze',
}

const HERO = {
  kicker: 'Product overview',
  h1: 'Revenue attribution without the analytics maze.',
  sub: 'SourceTrack gives founders and marketers one place to see which channels, campaigns, landing pages, and AI referrals actually produce leads, trials, purchases, and revenue.',
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
                Capture the visit. Connect the journey. Attribute the revenue.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              SourceTrack captures every source signal, connects touchpoints into a full customer journey, and attributes conversions using 8 models — so you know which channels create revenue, not just traffic.
            </p>
          </div>

          <FeatureCards items={[
            { icon: '01', title: 'Capture visitor source.', body: 'Track every UTM, referrer, landing page, campaign param, AI platform, click ID, and direct visit. SourceTrack captures the data most analytics tools miss.' },
            { icon: '02', title: 'Connect the journey.', body: 'See the full path each visitor takes — every page, session, and touchpoint before a lead, demo, trial, purchase, or custom conversion event.' },
            { icon: '03', title: 'Attribute the revenue.', body: 'Compare channels across 8 attribution models. Switch between first touch, last touch, linear, U-shaped, and W-shaped to see how credit shifts.' },
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
                Ad platforms are biased toward their own clicks. SourceTrack isn't.
              </h2>
              <p className="mt-4 text-[#B9C2C2] text-base leading-[1.55]">
                Every ad platform credits its own impressions. GA4 buries AI referrals in direct traffic. SourceTrack sits closer to your customer journey so you can compare channels with a neutral, independent view of what creates outcomes.
              </p>
              <Link to="/attribution" className="mt-6 inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64] transition-all hover:-translate-y-px">
                See the attribution engine
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Source capture</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">UTMs, referrers, landing pages, AI platforms, campaign params, and click IDs.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Customer journeys</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Every touchpoint, page, and session — from first visit to conversion.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Conversion tracking</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Purchases, demos, trials, forms, signups, meetings, and custom events.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">AI referral tracking</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">15 AI platforms tracked — traffic that GA4 marks as direct gets attributed correctly.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Report builder</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Build custom dashboards from your attribution data — pin only what matters.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-[#F7FAFA] border border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">One-script install</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Paste one snippet. Works on any website, Shopify, Webflow, or WordPress.</p>
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
            No long implementation. Paste one script, define your conversion events, and see which channels produce customers — not just clicks.
          </p>

          <div className="mt-[54px]">
            <HowItWorksSteps steps={[
              { title: 'Install the tracker', body: 'Paste one script into your site or add via Google Tag Manager. Works on any platform.' },
              { title: 'Capture the source', body: 'Every UTM, referrer, AI platform, landing page, and click ID is preserved automatically.' },
              { title: 'Track conversions', body: 'Fire events for purchases, trials, demos, forms, and any business outcome you care about.' },
              { title: 'Build reports', body: 'Create custom dashboards around the attribution metrics your team actually uses.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
