import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import SectionKicker from '../components/SectionKicker'
import HeroPreviewCard from '../components/HeroPreviewCard'

const SEO = {
  title: 'SourceTrack Product — Revenue Attribution Without the Analytics Maze',
  description: 'Explore how SourceTrack captures visitor sources, connects multi-touch customer journeys, tracks conversions and AI referrals, and attributes revenue back to the channels that created it.',
  canonical: 'https://www.sourcetrack.ai/product',
  ogTitle: 'SourceTrack Product — Revenue attribution without the analytics maze',
}

const HERO = {
  kicker: 'Product overview',
  h1: 'Revenue attribution without the analytics maze.',
  sub: 'Stop navigating complex analytics dashboards. SourceTrack gives founders and marketers clean customer journey timelines and revenue attribution — so you know exactly which campaigns drive sales.',
  primaryCta: 'Start free',
  secondaryCta: 'See report builder',
  secondaryHref: '/report-builder',
}

export default function Product() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<HeroPreviewCard />}>

      {/* Core platform */}
      <section className="py-[96px] bg-[#F7F4ED]">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="Core platform" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                Capture the visit. Connect the journey. Attribute the revenue.
              </h2>
            </div>
            <p className="self-end text-[#6E675C] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              SourceTrack captures every source signal, connects touchpoints into a full customer journey, and attributes conversions using 9 models — so you know which channels create revenue, not just traffic.
            </p>
          </div>

          <FeatureCards items={[
            { icon: '01', title: 'Capture visitor source.', body: 'Track campaign URL parameters, referring domain sources, search queries, and AI chatbot referrals in a single first-party pipeline.' },
            { icon: '02', title: 'Connect the journey.', body: 'See the full path each visitor takes — every page view, session, and touchpoint before a lead form submit or paid order conversion.' },
            { icon: '03', title: 'Attribute the revenue.', body: 'Compare channels across 9 attribution models. Switch between first touch, last touch, linear, U-shaped, and W-shaped to see how credit shifts.' },
          ]} />
        </div>
      </section>

      {/* What is inside SourceTrack? */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="Features List" />
            <h2 className="text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
              What is inside SourceTrack?
            </h2>
            <p className="mt-4 max-w-[620px] mx-auto text-[#6E675C] text-lg leading-[1.55]">
              Everything you need for clean revenue attribution, built without enterprise bloat.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Lightweight Tracker', desc: 'A tiny snippet that loads in milliseconds. Collects pageviews and handles UTM parameters without slowing down your site load speed.' },
              { title: 'Source Capture', desc: 'Automatically preserves UTM parameters, referring domains, organic search signals, and ad platform click ID properties.' },
              { title: 'Journey Timeline', desc: 'Traces the chronological touchpoints of converting customers, showing every referral entry and pricing visit.' },
              { title: 'Conversion Tracking', desc: 'Trigger event tracking on form submissions, checkout page hits, trial starts, or custom conversion outcomes.' },
              { title: 'Revenue Attribution', desc: 'Distribute order values across channels using first-touch, last-touch, linear, or position-based attribution rules.' },
              { title: 'AI Referral Tracking', desc: 'Categorize referring traffic from AI chat engines like ChatGPT and Claude that standard analytics label as direct.' },
              { title: 'Report Builder', desc: 'Create custom widgets using flexible metrics and filter rules, then pin them directly to your dashboard.' },
              { title: 'Developer API', desc: 'Use our HTTP ingestion endpoints to report offline conversions, backend trial updates, and database actions.' },
              { title: 'Spreadsheet Export', desc: 'Download clean, unbranded CSV reports of campaigns, referrers, and conversion parameters for client reports.' },
            ].map((f, i) => (
              <div key={i} className="p-6 rounded-2xl bg-[#F7F4ED] border border-[rgba(18,16,12,.08)] shadow-[0_12px_38px_rgba(18,16,12,.01)]">
                <strong className="text-lg tracking-[-0.04em] text-st-black block mb-2">{f.title}</strong>
                <p className="text-[#6E675C] text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
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
          <p className="mt-5 max-w-[620px] mx-auto text-[#D6CDBB] text-lg leading-[1.55]">
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
