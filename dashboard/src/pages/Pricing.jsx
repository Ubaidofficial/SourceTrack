import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import PricingCards from '../components/PricingCards'
import FAQSection from '../components/FAQSection'
import SectionKicker from '../components/SectionKicker'

function FoundingEarlyBirdCard() {
  return (
    <section className="py-[96px] bg-[#F7FAFA] border-b border-[rgba(31,35,35,.06)]">
      <div className="max-w-[1320px] mx-auto px-8">
        <div className="text-center mb-[54px]">
          <span className="inline-flex items-center gap-2 rounded-full py-2 px-3 text-[13px] font-extrabold tracking-[-0.015em] text-st-black bg-[rgba(31,35,35,.055)] border border-[rgba(31,35,35,.07)]">
            <span className="w-2 h-2 rounded-full bg-[#00AA57] shadow-[0_0_0_6px_rgba(0,170,87,.12)]" />
            Founding member offer
          </span>
          <h2 className="mt-5 text-[clamp(28px,4vw,44px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Lock in the lowest price we'll ever offer.
          </h2>
          <p className="mt-4 max-w-[480px] mx-auto text-[#586464] text-lg leading-[1.55]">
            Only 10 public early-bird seats available.
          </p>
        </div>

        <div className="max-w-[420px] mx-auto rounded-[36px] bg-st-black text-white p-[48px] border border-white/10 shadow-[0_24px_80px_rgba(31,35,35,.18)]">
          <span className="inline-flex items-center gap-2 rounded-full py-2 px-3 text-[13px] font-extrabold tracking-[-0.015em] text-white bg-white/10 border border-white/15">
            <span className="w-2 h-2 rounded-full bg-[#00AA57] shadow-[0_0_0_6px_rgba(0,170,87,.12)]" />
            Early Bird
          </span>

          <h3 className="text-[28px] font-bold tracking-[-0.055em] mt-[18px]">Early Bird Price</h3>
          <p className="text-[#8A9B9B] text-[13px] font-semibold tracking-[-0.01em] mt-1 mb-5">Founder annual access</p>

          <div className="text-[22px] font-black tracking-[-0.04em] text-st-lime leading-none">First Month Free</div>
          <p className="text-[#CBD4D4] text-[15px] mt-1 mb-5">Then $99/year.</p>

          <div className="mb-1 text-[52px] leading-none font-black tracking-[-0.07em]">
            $99<span className="text-[15px] tracking-[-0.02em] text-[#CBD4D4]">/year</span>
          </div>
          <p className="text-[13px] font-bold text-[#CBD4D4] -mt-1 mb-3">Early bird annual price · first 10 public seats</p>

          <p className="text-[#CBD4D4] text-[15px] leading-[1.55]">Lock your first year for $99 before standard Starter pricing applies.</p>

          <ul className="mt-6 mb-6 grid gap-3 list-none p-0">
            {[
              'Everything in Starter',
              '1 site',
              '25,000 tracked visits/mo',
              'Leads + journey timeline',
              'Revenue attribution',
              'CSV export + saved reports',
              'Future updates included',
            ].map((f, i) => (
              <li key={i} className="font-bold text-sm before:content-[\'✓\'] before:mr-[9px] before:text-[#00AA57] before:font-black text-[#CBD4D4]">{f}</li>
            ))}
          </ul>

          <p className="text-[13px] font-extrabold text-st-lime mb-2">Only 10 public early-bird seats available.</p>
          <p className="text-[11px] text-[#8A9B9B] mb-5">Annual billing configured during checkout. Standard price is $29/mo after this offer closes.</p>

          <Link
            to="/signup"
            className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64] transition-all hover:-translate-y-px w-full"
          >
            Claim early bird price
          </Link>
        </div>
      </div>
    </section>
  )
}

const SEO = {
  title: 'SourceTrack Pricing — Early Bird $99/year | SourceTrack',
  description: 'SourceTrack founding annual pricing: first month free, then $99/year — only 10 public founding seats. Multi-touch attribution for campaigns, AI referrals, search queries, and revenue.',
  canonical: 'https://sourcetrack.ai/pricing',
  ogTitle: 'SourceTrack Pricing',
}

const HERO = {
  kicker: 'Pricing',
  h1: 'Simple attribution pricing.',
  sub: 'First month free. Early bird annual pricing is $99/year — only 10 public early-bird seats available. Cancel anytime.',
  primaryCta: 'Get started',
  secondaryCta: 'Talk to sales',
  secondaryHref: 'mailto:sales@sourcetrack.ai',
  proofs: ['First month free — no card required', 'Only 10 early-bird seats', 'Cancel anytime'],
}


export default function Pricing() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>

      <FoundingEarlyBirdCard />

      {/* Pricing cards */}
      <section className="py-[96px] bg-[#F7FAFA]">
        <div className="max-w-[1320px] mx-auto px-8">
          <PricingCards />
        </div>
      </section>

      {/* FAQ */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="FAQ" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Questions teams ask before starting with SourceTrack.
          </h2>

          <div className="mt-[54px]">
            <FAQSection faqs={[
              { q: 'How do I install SourceTrack?', a: 'Paste one lightweight script tag into your site or add it through Google Tag Manager. Works on any website, Shopify store, Webflow site, or WordPress site. No developer required.' },
              { q: 'Does SourceTrack track AI referrals like ChatGPT traffic?', a: 'Yes — it is one of the core product features. SourceTrack detects 15 AI platforms and 22 domains, including ChatGPT, Claude, Gemini, and Perplexity, and attributes leads and revenue to the correct AI source instead of labeling them as direct traffic.' },
              { q: 'Do I need a data analyst to use SourceTrack?', a: 'No. The report builder is built for founders and marketers. Start from common attribution questions, choose the dimension, and pin widgets to your dashboard. No SQL, no Explore reports, no analytics team required.' },
              { q: 'How does the first month free work?', a: 'Your first month is free — no card required to start. You get basic analytics and lead source tracking: traffic sources, referrers, AI referral detection, and basic conversions. Journey timeline, CSV export, saved reports, revenue attribution, and alerts unlock on paid plans.' },
              { q: 'What attribution models does SourceTrack support?', a: 'All plans include last-touch. Paid plans add first touch, linear, time decay, U-shaped, W-shaped, and position-based models. Compare channels across all 9 models from a single dashboard.' },
              { q: 'Can I cancel anytime?', a: 'Yes. No annual contracts. Upgrade or downgrade as your traffic and attribution needs change.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
