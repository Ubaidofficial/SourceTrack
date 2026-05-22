import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'AI Referral Tracking — Track ChatGPT, Claude, Gemini & Perplexity Traffic',
  description: 'Track traffic, leads, and revenue from ChatGPT, Claude, Gemini, Perplexity, and other AI answer engines.',
  canonical: 'https://sourcetrack.ai/ai-referral-tracking',
}

const HERO = {
  kicker: 'AI referral tracking',
  h1: 'Track visitors and revenue from AI search.',
  sub: 'See when customers discover you through ChatGPT, Claude, Gemini, Perplexity, and other AI answer engines — then connect that traffic to conversions and revenue.',
  primaryCta: 'Start tracking AI referrals',
  secondaryCta: 'See attribution engine',
  secondaryHref: '/attribution',
}

export default function AIReferralTracking() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<DashboardPreviewMock />}>

      {/* New acquisition channel */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="New acquisition channel" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                AI referrals should not disappear into direct traffic.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              AI answer engines can influence discovery before a visitor searches your brand, clicks an ad, or converts. SourceTrack helps you measure the full path.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: 'C', title: 'ChatGPT traffic.', body: 'Detect visitors from ChatGPT links and measure their conversion quality.' },
              { icon: 'Cl', title: 'Claude research.', body: 'See when research-assisted visitors become leads, trials, demos, or customers.' },
              { icon: 'G', title: 'Gemini and AI search.', body: "Track visitors from Google's AI surfaces and answer-driven discovery." },
              { icon: 'P', title: 'Perplexity answers.', body: 'Reveal answer-engine traffic that assists pipeline and purchases.' },
            ].map((f, i) => (
              <article key={i} className="relative overflow-hidden p-7 rounded-[28px] bg-white border border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[220px]">
                <div className="absolute right-[-48px] bottom-[-48px] w-[158px] h-[158px] rounded-full bg-[rgba(204,240,63,.18)]" />
                <div className="relative z-10 w-[52px] h-[52px] rounded-[18px] grid place-items-center text-st-black bg-st-lime font-black tracking-[-0.04em]">
                  {f.icon}
                </div>
                <h3 className="relative z-10 mt-[64px] max-w-[350px] text-2xl leading-[1.04] tracking-[-0.055em] text-st-black font-bold">{f.title}</h3>
                <p className="relative z-10 mt-3 text-[#667272] text-base leading-[1.55]">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* What SourceTrack shows */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7">
            <div className="rounded-[36px] p-[48px] bg-st-black text-white border border-white/10 shadow-[0_24px_80px_rgba(31,35,35,.12)]">
              <SectionKicker label="What SourceTrack shows" dark />
              <h2 className="mt-5 text-[clamp(26px,3.5vw,44px)] leading-[0.94] tracking-[-0.06em] font-black">
                Not just AI visits. AI-assisted revenue.
              </h2>
              <p className="mt-4 text-[#B9C2C2] text-base leading-[1.55]">
                Separate curiosity traffic from visitors that become qualified leads, trials, customers, and pipeline.
              </p>
              <Link to="/report-builder" className="mt-6 inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64] transition-all hover:-translate-y-px">
                Build an AI report
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col p-6 rounded-[26px] bg-[#F7FAFA] border border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">AI source</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Identify the AI platform or answer engine that sent the visitor.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Landing page</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">See which pages AI-referred visitors land on first.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Journey path</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Track the pages they visit before conversion.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Conversion rate</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Compare AI traffic quality against ads, search, social, and email.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Revenue</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Connect purchases and pipeline back to AI discovery.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Reports</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Create dashboards focused on AI traffic growth and quality.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
