import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import ComparisonTable from '../components/ComparisonTable'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack — See which channels actually create revenue',
  description: 'SourceTrack tracks visitors, leads, AI referrals, campaigns, and conversions so marketers can see what creates revenue.',
  canonical: 'https://sourcetrack.ai/',
}

const HERO = {
  kicker: 'Revenue attribution for modern marketing teams',
  h1: 'See which channels actually',
  h1Gradient: 'create revenue.',
  sub: 'SourceTrack tracks visitors, leads, trials, demos, purchases, AI referrals, campaigns, and conversions so teams can stop guessing where customers come from.',
  primaryCta: 'Start tracking free',
  secondaryCta: 'View product',
  secondaryHref: '/product',
}

export default function Landing() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<DashboardPreviewMock />}>

      {/* Platform section */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="The platform" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                One workspace for source, journey, conversion, and revenue clarity.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              The v2 design keeps the strong IA, removes planning language, tightens the copy, and makes the product feel closer to the Figma dashboard direction.
            </p>
          </div>

          <FeatureCards items={[
            { icon: '①', title: 'Attribution engine.', body: 'Capture first touch, last touch, UTMs, referrers, campaigns, landing pages, and conversion events.' },
            { icon: '②', title: 'AI referral tracking.', body: 'Reveal leads and revenue from ChatGPT, Claude, Gemini, Perplexity, and AI answer engines.' },
            { icon: '③', title: 'Report builder.', body: 'Start blank, choose your metrics, save widgets, and build dashboards around your business model.' },
          ]} />
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

      {/* Use cases */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7">
            <div className="rounded-[36px] p-[48px] bg-st-black text-white border border-white/10 shadow-[0_24px_80px_rgba(31,35,35,.12)]">
              <SectionKicker label="Business-specific dashboards" dark />
              <h2 className="mt-5 text-[clamp(26px,3.5vw,44px)] leading-[0.94] tracking-[-0.06em] font-black">
                Use attribution data the way your business actually works.
              </h2>
              <p className="mt-4 text-[#B9C2C2] text-base leading-[1.55]">
                Onboarding captures business type, then the dashboard can emphasize the right conversions and metrics.
              </p>
              <Link to="/signup" className="mt-6 inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64] transition-all hover:-translate-y-px">
                Start with your business type
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link to="/use-cases/saas" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">SaaS</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Trials, demos, signups, paid conversions, MRR, and trial-to-paid quality.</p>
              </Link>
              <Link to="/use-cases/ecommerce" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">Ecommerce</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Orders, purchase revenue, landing-page ROI, campaign ROAS, and AI-assisted sales.</p>
              </Link>
              <Link to="/use-cases/lead-generation" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">Lead generation</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Forms, meetings, qualified leads, CPL, and source quality by campaign.</p>
              </Link>
              <Link to="/report-builder" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">Agencies</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Client-ready reports, source truth, and dashboards built from real conversion events.</p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* AI section */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="Why now" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                AI discovery is becoming a measurable acquisition channel.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              Generic analytics often buries AI answer-engine traffic inside referral or direct buckets. SourceTrack turns those visits into source, journey, conversion, and revenue reporting.
            </p>
          </div>

          <FeatureCards compact items={[
            { icon: 'C', title: 'ChatGPT and Claude.', body: 'Detect AI-assisted visits and measure the journeys that become leads or customers.' },
            { icon: 'G', title: 'Gemini and AI search.', body: 'Understand which pages and queries AI-assisted visitors land on first.' },
            { icon: 'P', title: 'Perplexity and answer engines.', body: 'Compare AI traffic quality against paid, organic, social, email, and partner sources.' },
          ]} />
        </div>
      </section>

      {/* Comparison */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Focused comparison" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Built for attribution decisions, not every analytics use case.
          </h2>
          <p className="mt-5 max-w-[620px] mx-auto text-[#586464] text-lg leading-[1.55]">
            GA4 is broad web analytics. Ad platforms are optimized for their own reporting. SourceTrack is focused on source-to-revenue visibility.
          </p>

          <div className="mt-[54px]">
            <ComparisonTable rows={[
              ['Capability', 'SourceTrack', 'GA4', 'Ad platforms'],
              ['Simple attribution setup', 'Yes', 'Config-heavy', 'Platform-specific'],
              ['Lead/customer journey timeline', 'Yes', 'Hard', 'No'],
              ['AI referral tracking', 'Built in', 'Limited', 'No'],
              ['Custom attribution reports', 'Yes', 'Complex', 'Biased'],
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
