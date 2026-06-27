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
              ['Monthly pageviews', '50,000', '150,000', '150,000'],
            ]} />
          </div>
          <p className="mt-5 text-[#8A9B9B] text-xs font-bold">
            Monthly pageview caps are from the live entitlement config (plan-features.js). The feature split reflects
            intended packaging — confirm any edge cases against the gate before launch.
          </p>
        </div>
      </section>

      {/* Privacy & data — mechanism-true privacy claims only; no over-claimed compliance badge */}
      <section className="py-[96px] bg-white border-t border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="Privacy & data" />
            <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
              Private by design, EU-built.
            </h2>
            <p className="mt-4 max-w-[640px] mx-auto text-[#586464] text-lg leading-[1.55]">
              Privacy is the architecture, not a setting. Core customer data is stored in the EU (Supabase + Railway).
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-[1080px] mx-auto">
            {[
              ['Cookieless & first-party', 'No cookies, no fingerprinting, no third-party trackers — so you often won’t need a cookie banner for SourceTrack.'],
              ['No data selling or sharing', 'We never sell or share personal data. Revenue comes from subscriptions, not from your data.'],
              ['Core data stored in the EU', 'Database and hosting run in the EU (Supabase + Railway). Some sub-processors operate elsewhere — see the list.'],
              ['No raw IP stored', 'The tracker enriches without storing raw IP addresses, and never de-anonymizes individuals.'],
              ['EU-built', 'Built in the EU with a privacy-first model from day one — not bolted on later.'],
              ['Your rights, documented', 'Privacy Policy, DPA (on request), Sub-processors, and a CCPA “Do Not Sell or Share” page — all linked in the footer.'],
            ].map(([title, body]) => (
              <div key={title} className="lift p-6 rounded-[26px] bg-[#F7FAFA] border border-[rgba(31,35,35,.08)] text-left">
                <strong className="block text-st-black text-base tracking-[-0.03em]">{title}</strong>
                <p className="mt-2 text-[#586464] text-sm leading-[1.55]">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[#8A9B9B] text-xs font-bold max-w-[680px] mx-auto">
            We say “stored in the EU” precisely — it describes core data storage, not a claim that all processing happens
            in the EU. We don’t claim a formal “GDPR/CCPA compliant” certification during the private beta.
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
              { q: 'Is there a free trial?', a: 'Yes — you can start free, no credit card required.' },
              { q: 'What counts toward my plan?', a: 'Tracked pageviews per month: 50,000 on Starter, and 150,000 on Growth and Founder.' },
              { q: 'Can I change plans later?', a: 'Yes, anytime.' },
              { q: 'What’s the catch with the $99 Founder plan?', a: 'None — it’s an early-bird thank-you. 25 seats, one per customer, Growth-level features, and the price is locked while you keep the seat.' },
              { q: 'Do you offer a money-back guarantee?', a: 'Yes — a 28-day money-back guarantee. If SourceTrack isn’t the right fit, email us within 28 days of your first payment and we’ll refund it.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
