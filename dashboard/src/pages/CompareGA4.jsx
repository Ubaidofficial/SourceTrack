import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import ComparisonTable from '../components/ComparisonTable'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack vs the alternatives — founder-simple attribution',
  description: 'How SourceTrack compares: privacy-first attribution with AI-referral and SEO-revenue tracking, no CRM and no heavy stack. The simple middle option.',
  canonical: 'https://sourcetrack.ai/compare/ga4',
  ogTitle: 'SourceTrack vs the alternatives',
}

const HERO = {
  kicker: 'Compare',
  h1: 'Four ways to answer',
  h1Gradient: '“where do my customers come from?”',
  sub: 'Free analytics measure traffic, not revenue. Form-trackers need a CRM. Enterprise platforms are powerful but heavy and demo-gated. SourceTrack is the simple, private middle — built for founders, not ad-ops teams.',
  primaryCta: 'Start free',
  secondaryCta: 'Read the docs',
  secondaryHref: '/docs',
}

export default function CompareGA4() {
  return (
    <MarketingPage
      seo={SEO}
      hero={HERO}
      heroChildren={<DashboardPreviewMock />}
      finalCta={{
        h2: 'See it on your own traffic.',
        sub: 'Start free — no card — and have your first attributed journey today.',
        primaryCta: 'Start free',
        secondaryCta: 'Read the docs',
        secondaryHref: '/docs',
      }}
    >

      {/* Four ways */}
      <section className="py-[96px] bg-[#F7FAFA] border-b border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="The four options" />
            <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
              Four ways to answer the same question.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['Free analytics', 'GA4, Plausible', 'Great for pageviews, weak on which source makes money. Built to measure traffic, not revenue.'],
              ['Form-trackers', 'Attributer, LeadSources', 'Clear and simple, but they exist to pipe attribution into your CRM. No CRM, less point.'],
              ['Enterprise attribution', 'Cometly, SourceLoop, Ruler, Triple Whale', 'Powerful: ad-cost ROAS, two-way CRM sync, CAPI to ad platforms. Also heavier, pricier, usually demo-gated. Built for ad-ops / RevOps.'],
              ['SourceTrack', 'The simple, private middle', 'The source behind every lead and sale, AI and SEO included, with no CRM and no stack to run. Built for founders.'],
            ].map(([name, who, desc], i) => (
              <div key={name} className={`p-6 rounded-[26px] border ${i === 3 ? 'bg-st-black text-white border-white/10 shadow-[0_24px_80px_rgba(31,35,35,.12)]' : 'bg-white border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)]'}`}>
                <strong className={`block text-lg tracking-[-0.04em] ${i === 3 ? 'text-white' : 'text-st-black'}`}>{name}</strong>
                <span className={`block mt-1 text-xs font-bold ${i === 3 ? 'text-[#9FE870]' : 'text-[#8A9B9B]'}`}>{who}</span>
                <p className={`mt-3 text-sm leading-[1.55] ${i === 3 ? 'text-[#CBD4D4]' : 'text-[#586464]'}`}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Honest 4-way comparison table (competitor cells [verify]) */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Side by side" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            An honest side-by-side.
          </h2>
          <p className="mt-5 max-w-[640px] mx-auto text-[#586464] text-lg leading-[1.55]">
            SourceTrack’s column is written truthfully against the shipped product. Competitor cells are unverified until
            checked on their live sites — don’t publish them as fact before then.
          </p>
          <div className="mt-[54px]">
            <ComparisonTable rows={[
              ['', 'SourceTrack', 'Free analytics (GA4)', 'Form-trackers', 'Enterprise'],
              ['Source behind every lead', '✓', 'Partial', '✓', '✓'],
              ['AI-referral detection', '✓', '—', '[verify]', '[verify]'],
              ['Search Console revenue signal', '✓ (beta)', '—', '[verify]', '[verify]'],
              ['Works without a CRM', '✓', '✓', '✗ (CRM required)', '[verify]'],
              ['Cookieless / privacy-first', '✓', '[verify]', '[verify]', '[verify]'],
              ['Set up in minutes, no demo call', '✓', '✓', '✓', 'Often demo-gated'],
              ['Starting price', '$49/mo · $99/yr Founder', 'Free', '[verify]', '$$$ [verify]'],
            ]} />
          </div>
          <p className="mt-5 text-[#8A9B9B] text-xs font-bold">
            Last verified: [DATE]. Competitor features and prices change — re-check each cell on their live site and date this page before publishing.
          </p>
        </div>
      </section>

      {/* Where SourceTrack wins */}
      <section className="py-[96px] bg-[#F7FAFA] border-y border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="Where SourceTrack wins" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                Lighter, private, and all in one place.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              Built for founders, not ad-ops teams: the source behind every lead and sale, AI and SEO included, with no CRM
              and no stack to run.
            </p>
          </div>
          <FeatureCards items={[
            { icon: '1', title: 'Lighter than the enterprise tools.', body: 'Readable in five seconds, set up in five minutes, no demo call.' },
            { icon: '2', title: 'No CRM required.', body: 'Unlike form-trackers, qualification lives in the app; push one-way only if you want.' },
            { icon: '3', title: 'AI + SEO + leads in one place.', body: 'AI-referral detection, a Search Console revenue signal, and lead qualification — without extra tools.' },
            { icon: '4', title: 'Privacy-first.', body: 'Cookieless, first-party, no fingerprinting.' },
          ]} />
        </div>
      </section>

      {/* Where it's honestly not the answer */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[900px] mx-auto px-8 text-center">
          <SectionKicker label="Where it's honestly not the answer" />
          <h2 className="mt-5 text-[clamp(28px,4vw,48px)] leading-[0.96] tracking-[-0.06em] font-black text-st-black">
            We’d rather tell you up front.
          </h2>
          <ul className="mt-[40px] grid gap-3 list-none p-0 text-left max-w-[680px] mx-auto">
            {[
              'You need ad-cost ROAS, CAC modeling, or media-mix modeling → use an enterprise tool.',
              'You need two-way CRM sync or CAPI back to Meta/Google → not us (yet).',
              'You want a full SEO suite — rank tracking, keyword research, audits, backlinks → that’s a different category.',
              'You need a warehouse-grade BI canvas for a data team → also not us.',
            ].map((line, i) => (
              <li key={i} className="px-5 py-3.5 rounded-2xl bg-[#F7FAFA] border border-[rgba(31,35,35,.08)] text-[#586464] text-base font-semibold tracking-[-0.01em]">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingPage>
  )
}
