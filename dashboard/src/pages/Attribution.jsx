import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import SectionKicker from '../components/SectionKicker'
import HeroPreviewCard from '../components/HeroPreviewCard'

const SEO = {
  title: 'Marketing Attribution Software — Track Which Sources Create Revenue | SourceTrack',
  description: 'Track first touch, last touch, multi-touch journeys, campaign performance, landing pages, AI referrals, and revenue attribution across 9 models. Independent, neutral attribution for founders and marketers.',
  canonical: 'https://www.sourcetrack.ai/attribution',
  ogTitle: 'Marketing Attribution Software — SourceTrack',
}

const HERO = {
  kicker: 'Marketing attribution software',
  h1: 'Know the source behind every lead, trial, and purchase.',
  sub: 'Track the complete path from first click to paying customer. Compare channels across 9 attribution models, prove the real ROI of your campaigns, and stop relying on biased ad-platform self-reporting.',
  primaryCta: 'Start tracking free',
  secondaryCta: 'Compare with GA4',
  secondaryHref: '/compare/ga4',
}

export default function Attribution() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<HeroPreviewCard />}>

      {/* Attribution problems */}
      <section className="py-[96px] bg-[#F7F4ED]">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="The attribution problem" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                Every platform claims credit. SourceTrack gives you an independent source of truth.
              </h2>
            </div>
            <p className="self-end text-[#6E675C] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              Ad platforms self-report conversion data to justify your spend. GA4 over-credits the last click. SourceTrack tracks every touchpoint in the journey, giving you a neutral source of truth to reduce wasted budget and scale what converts.
            </p>
          </div>

          <FeatureCards items={[
            { icon: 'FT', title: 'First touch attribution.', body: 'Find the channel, campaign, or page that first introduced a visitor who later became a customer. Give credit to the sources that start the journey.' },
            { icon: 'LT', title: 'Multi-touch attribution.', body: 'Go beyond first and last touch. Use linear, U-shaped, W-shaped, time decay, and position-based models to see the full influence picture.' },
            { icon: '$', title: 'Revenue attribution.', body: 'Connect purchases, demos, trials, signups, and forms back to the channels that influenced them. Attribute revenue, not just events.' },
          ]} />
        </div>
      </section>

      {/* Neutral Positioning Notice Callout */}
      <section className="py-12 bg-white">
        <div className="max-w-[960px] mx-auto px-8 text-center">
          <div className="p-8 rounded-3xl bg-[#F7F4ED] border border-[rgba(18,16,12,.08)]">
            <span className="block text-2xl mb-3">🛡️</span>
            <p className="text-[#12100C] text-lg font-bold leading-relaxed max-w-[720px] mx-auto">
              “SourceTrack gives you an independent attribution view from your own visitor and conversion data, not only ad-platform self-reporting.”
            </p>
          </div>
        </div>
      </section>

      {/* Attribution Models Section */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="Models & Signals" />
            <h2 className="text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
              Attribution models available in SourceTrack
            </h2>
            <p className="mt-4 max-w-[620px] mx-auto text-[#6E675C] text-lg leading-[1.55]">
              Compare acquisition touchpoints across standard modeling rules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'First Touch', desc: 'Attributes 100% of the conversion value to the very first touchpoint in the visitor history stream.' },
              { name: 'Last Touch', desc: 'Attributes 100% of the conversion value to the last active touchpoint before the conversion occurred.' },
              { name: 'Linear', desc: 'Distributes conversion credit equally across all touchpoints identified in the visitor timeline.' },
              { name: 'U-Shaped', desc: 'Assigns 40% of credit to the first touch, 40% to the last touch, and splits 20% among intermediate page views.' },
              { name: 'UTM Parameters', desc: 'Stitches utm_source, utm_medium, utm_campaign, utm_content, and utm_term campaign tags.' },
              { name: 'Click ID Tracking', desc: 'Captures and stores click identifiers like GCLID, FBCLID, and MSCLKID directly from conversion parameters.' },
              { name: 'Referring Domains', desc: 'Extracts domain referrers from document.referrer directly to classify organic, search, and social platforms.' },
              { name: 'AI Search Capture', desc: 'Resolves referrals from Claude, Perplexity, and ChatGPT automatically instead of marking them as direct traffic.' },
            ].map((m, i) => (
              <div key={i} className="p-5 rounded-2xl bg-[#F7F4ED] border border-[rgba(18,16,12,.06)]">
                <strong className="text-[#12100C] text-base tracking-tight block mb-2">{m.name}</strong>
                <p className="text-[#6E675C] text-sm leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Attribution data captured */}
      <section className="py-[96px] bg-st-black text-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="What SourceTrack attributes" dark />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black">
            Every signal that explains why a conversion happened.
          </h2>
          <p className="mt-5 max-w-[620px] mx-auto text-[#D6CDBB] text-lg leading-[1.55]">
            SourceTrack captures the small details that most analytics tools ignore — AI platform referrers, campaign params across sessions, and the full journey path.
          </p>

          <div className="mt-[54px]">
            <HowItWorksSteps steps={[
              { title: 'UTMs and source params', body: 'Preserve campaign data across landing pages, sessions, and days. GCLID, FBCLID, MSCLKID all captured.' },
              { title: 'Referrers and AI traffic', body: '15 AI platforms detected — ChatGPT, Claude, Gemini, Perplexity, and more. No more AI traffic in direct.' },
              { title: 'Landing page paths', body: 'See which entry pages create leads and which assist the journey toward conversion.' },
              { title: 'Conversion events', body: 'Attribute purchases, trials, demos, forms, and custom events — not just pageviews.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
