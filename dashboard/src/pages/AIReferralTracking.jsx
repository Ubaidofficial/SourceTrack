import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import HeroPreviewCard from '../components/HeroPreviewCard'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'AI Referral Tracking — Track ChatGPT, Claude, Gemini & Perplexity Traffic | SourceTrack',
  description: 'Track traffic, leads, and revenue from ChatGPT, Claude, Gemini, Perplexity, and 15 AI platforms. Stop losing AI referrals to direct traffic in your analytics and attribution reports.',
  canonical: 'https://sourcetrack.ai/ai-referral-tracking',
  ogTitle: 'AI Referral Tracking — SourceTrack',
}

const HERO = {
  kicker: 'AI referral tracking',
  h1: 'Your GA4 calls it direct. SourceTrack calls it a customer from ChatGPT.',
  sub: "When someone discovers your product through an AI answer engine, GA4 logs that visit as direct traffic — invisible to attribution. SourceTrack identifies the AI platform, tracks the journey, and attributes the conversion so you can see the revenue AI creates.",
  primaryCta: 'Start tracking AI referrals',
  secondaryCta: 'See attribution engine',
  secondaryHref: '/attribution',
}

export default function AIReferralTracking() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<HeroPreviewCard />}>

      {/* The problem */}
      <section className="py-[96px] bg-[#F7FAFA]">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="The problem" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                AI answer engines strip referrer headers. GA4 logs the visit as direct.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              ChatGPT, Perplexity, and other AI platforms send visitors without standard referrer headers. GA4 can't identify them — so the leads, trials, and purchases they create get attributed to direct traffic or the last ad someone clicked. SourceTrack detects 15 AI platforms and 22 domains so that revenue doesn't disappear.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: 'C', title: 'ChatGPT.', body: 'Detect visitors from ChatGPT links and measure conversion quality. See how much revenue each AI conversation generates.' },
              { icon: 'Cl', title: 'Claude.', body: 'Track research-assisted visitors from Claude who become leads, trials, demos, or customers.' },
              { icon: 'G', title: 'Gemini.', body: "Identify traffic from Google's AI surfaces and answer-driven discovery — the visitors GA4 can't distinguish." },
              { icon: 'P', title: 'Perplexity.', body: 'Reveal answer-engine referrals that assist pipeline and purchases. Compare AI-driven quality against all channels.' },
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

      {/* AI referring domain classification */}
      <section className="py-[96px] bg-[#F7FAFA] border-b border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="Classification Logic" />
            <h2 className="text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
              How SourceTrack detects AI referrers
            </h2>
            <p className="mt-4 max-w-[620px] mx-auto text-[#586464] text-lg leading-[1.55]">
              First-party referring domain analysis mapped against verified AI platforms.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-[rgba(31,35,35,.06)]">
              <strong className="text-st-black text-lg tracking-tight block mb-2">Referring Domain Lists</strong>
              <p className="text-[#586464] text-sm leading-relaxed">
                SourceTrack cross-references the HTTP referrer domain against a compiled index of known AI chatbot and search environments (such as chatgpt.com, claude.ai, perplexity.ai, deepseek.com, and grok.com).
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-[rgba(31,35,35,.06)]">
              <strong className="text-st-black text-lg tracking-tight block mb-2">Parameter-Based Fallbacks</strong>
              <p className="text-[#586464] text-sm leading-relaxed">
                If the referring header is stripped by the browser or engine, SourceTrack parses custom parameters (e.g. `ai_source` URL tags) to preserve attribution signal continuity across sessions.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-[rgba(31,35,35,.06)]">
              <strong className="text-st-black text-lg tracking-tight block mb-2">Assisted Conversion Timeline</strong>
              <p className="text-[#586464] text-sm leading-relaxed">
                When an AI discovery click initiates a journey, the touchpoint is recorded on the customer timeline. The final webhook transaction is stitched to verify exact AI-referred pipeline influence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What SourceTrack shows */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7">
            <div className="rounded-[36px] p-[48px] bg-st-black text-white border border-white/10 shadow-[0_24px_80px_rgba(31,35,35,.12)]">
              <SectionKicker label="What you get" dark />
              <h2 className="mt-5 text-[clamp(26px,3.5vw,44px)] leading-[0.94] tracking-[-0.06em] font-black">
                Not just AI visit counts. AI-assisted revenue, attributed by platform.
              </h2>
              <p className="mt-4 text-[#B9C2C2] text-base leading-[1.55]">
                Separate curiosity traffic from visitors that become qualified leads, trials, and customers. SourceTrack shows you the full journey and conversion path from each AI source — measured in revenue, not just clicks.
              </p>
              <Link to="/report-builder" className="mt-6 inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64] transition-all hover:-translate-y-px">
                Build an AI tracking report
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col p-6 rounded-[26px] bg-[#F7FAFA] border border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">15 AI platforms</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">ChatGPT, Claude, Gemini, Perplexity, and 11 more — each tracked as a distinct referral source.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Full journey tracking</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">See which pages AI-referred visitors land on and every touchpoint before they convert.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Conversion & revenue attribution</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Attribute leads, trials, purchases, and revenue to the AI platform that started the journey.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">Channel comparison</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Compare AI-driven conversion quality against paid, organic, social, email, and partner channels.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">AI trend reporting</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Track AI referral growth over time. See which platforms are gaining share as an acquisition channel.</p>
              </div>
              <div className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] min-h-[140px]">
                <strong className="text-lg tracking-[-0.04em]">One snippet — no extra setup</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">The same lightweight tracker detects AI platforms automatically. No extra script, no extra config.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
