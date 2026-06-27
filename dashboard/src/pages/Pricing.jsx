import MarketingPage from '../components/MarketingPage'
import PricingCards from '../components/PricingCards'
import FAQSection from '../components/FAQSection'
import ComparisonTable from '../components/ComparisonTable'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack Pricing — Start free, no card required',
  description: 'Founder-simple attribution pricing: Starter $49/mo, Growth $79/mo, or a Founder annual seat at $99/yr. Start free, no credit card.',
  canonical: 'https://sourcetrack.ai/pricing',
  ogTitle: 'SourceTrack Pricing — Start free, no card required',
}

const HERO = {
  kicker: 'Pricing',
  h1: 'Pricing that stays out of your way.',
  sub: 'One product. Three plans. No per-seat math, no “contact sales,” no surprise overage. Start free — no card — and upgrade when the data’s paying for itself.',
  primaryCta: 'Start free',
  secondaryCta: 'Read the docs',
  secondaryHref: '/docs',
  proofs: ['No credit card required', 'Cancel anytime', 'Founder early-bird: 25 seats'],
}

export default function Pricing() {
  return (
    <MarketingPage
      seo={SEO}
      hero={HERO}
      finalCta={{
        h2: 'Start free. Upgrade when it pays for itself.',
        sub: 'No card required. See your first attributed journey today.',
        primaryCta: 'Start free',
        secondaryCta: 'Read the docs',
        secondaryHref: '/docs',
      }}
    >

      {/* Pricing cards — Starter / Growth / Founder */}
      <section className="py-[96px] bg-[#F7FAFA] border-b border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8">
          <PricingCards />
        </div>
      </section>

      {/* What's included — per-plan ([VERIFY] tier split vs plan-features.js) */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="What's included" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            What each plan includes.
          </h2>

          <div className="mt-[54px]">
            <ComparisonTable rows={[
              ['', 'Starter', 'Growth', 'Founder'],
              ['Source / UTM / referrer attribution', '✓', '✓', '✓'],
              ['AI-referral detection', '✓', '✓', '✓'],
              ['First / last / multi-touch', '✓', '✓', '✓'],
              ['Cookieless analytics', '✓', '✓', '✓'],
              ['Lead qualification (no CRM)', '✓', '✓', '✓'],
              ['Report Builder + saved/pinned', '—', '✓', '✓'],
              ['Search Console SEO attribution (beta)', '—', '✓', '✓'],
              ['Stripe revenue (beta / test-mode)', '—', '✓', '✓'],
              ['Manual Shopify / webhook revenue', '—', '✓', '✓'],
              ['CSV export', '✓', '✓', '✓'],
            ]} />
          </div>
          <p className="mt-5 text-[#8A9B9B] text-xs font-bold">
            [VERIFY] Confirm this tier split + monthly volume/retention limits against the real entitlement gate
            (plan-features.js) before publishing — reflects intended packaging, not a confirmed map.
          </p>
        </div>
      </section>

      {/* Pricing FAQ */}
      <section className="py-[96px] bg-[#F7FAFA] border-t border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Pricing FAQ" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Pricing questions, answered.
          </h2>

          <div className="mt-[54px]">
            <FAQSection faqs={[
              { q: 'Is there a free trial?', a: 'Yes — no credit card required.' },
              { q: 'What counts toward my plan?', a: 'Tracked events/pageviews per month. [VERIFY exact limits + overage behavior against plan-features.js before publishing.]' },
              { q: 'Can I change plans later?', a: 'Yes, anytime.' },
              { q: 'What’s the catch with the $99 Founder plan?', a: 'None — it’s an early-bird thank-you. 25 seats, one per customer, Growth-level features, and the price is locked while you keep the seat.' },
              { q: 'Do you offer refunds?', a: '[VERIFY — state your real refund policy here before publishing.]' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
