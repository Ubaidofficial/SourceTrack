import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import MarketingInteractiveDemo from '../components/MarketingInteractiveDemo'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import ComparisonTable from '../components/ComparisonTable'
import SectionKicker from '../components/SectionKicker'
import HeroPreviewCard from '../components/HeroPreviewCard'

const SEO = {
  title: 'SourceTrack — Simple Revenue Attribution Software',
  description: 'SourceTrack is simple revenue attribution software for founders, marketers, ecommerce stores, agencies, and lead-gen teams. See which campaigns, AI referrals, and customer journeys create revenue.',
  canonical: 'https://sourcetrack.ai/',
  ogTitle: 'SourceTrack — Simple Revenue Attribution Software',
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "SourceTrack",
      "url": "https://sourcetrack.ai",
      "logo": "https://sourcetrack.ai/og-image.png",
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "support@sourcetrack.ai",
        "contactType": "customer support"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "SourceTrack",
      "url": "https://sourcetrack.ai"
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "SourceTrack",
      "applicationCategory": "AnalyticsApplication",
      "operatingSystem": "Web",
      "description": "Revenue attribution analytics for SaaS, lead-gen, and agency teams. Track campaigns, AI referrals, customer journeys, and conversions. Multi-touch attribution with 9 models.",
      "url": "https://sourcetrack.ai",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
        "description": "Free plan available"
      }
    }
  ],
}

const HERO = {
  kicker: 'Simple revenue attribution software',
  h1: 'Know which sources actually',
  h1Gradient: 'create revenue.',
  sub: 'SourceTrack is simple revenue attribution software for founders, marketers, ecommerce stores, agencies, and lead-gen teams. See which campaigns, AI referrals, search terms, forms, bookings, and customer journeys turn into leads and revenue — without a heavy analytics stack.',
  primaryCta: 'Start tracking free',
  secondaryCta: 'View product',
  secondaryHref: '/product',
  proofs: ['Install with one script or GTM', 'Track 30 attributed conversions free', 'Built for founders and marketers'],
}

export default function Landing() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<HeroPreviewCard />}>

      {/* Interactive Demo Section */}
      <section className="py-[72px] border-b border-[rgba(31,35,35,.06)] bg-[#F7FAFA]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
          <MarketingInteractiveDemo />
        </div>
      </section>

      {/* Trust band — what SourceTrack tracks */}
      <section className="py-[56px] border-b border-[rgba(31,35,35,.06)] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              ['AI referral tracking', 'ChatGPT, Claude, & more'],
              ['Multi-touch journeys', '9 attribution models'],
              ['Revenue attribution', 'Campaign-to-cash visibility'],
              ['Report builder', 'Pin your own dashboards'],
              ['Event tracking', 'Low-latency capture'],
            ].map(([label, desc]) => (
              <div key={label} className="text-center px-2">
                <strong className="block text-st-black text-sm font-extrabold tracking-[-0.03em]">{label}</strong>
                <span className="block mt-1 text-[#586464] text-xs font-bold">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform section */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="The platform" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                Revenue clarity without the BI bloat.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              SourceTrack is founder-friendly attribution software that connects the entire visitor timeline. Get campaign-to-cash visibility and see which channels actually create revenue — not just clicks.
            </p>
          </div>

          <FeatureCards items={[
            { icon: '①', title: 'Attribution engine.', body: 'Track every campaign, UTM referrer, landing page, and conversion event. Compare channels across 9 attribution models to establish your source of truth for revenue.' },
            { icon: '②', title: 'AI-aware attribution.', body: 'Identify referring traffic from ChatGPT, Claude, Gemini, and Perplexity. Stop losing AI-driven conversions to direct traffic in your reports.' },
            { icon: '③', title: 'No BI bloat.', body: 'Create custom widgets and dashboards tailored to your business metrics. Focus on simple revenue attribution without complex analytics setups.' },
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
            No long implementation. Paste one script, define your conversion events, and see which channels produce customers — not just clicks.
          </p>

          <div className="mt-[54px]">
            <HowItWorksSteps steps={[
              { title: 'Install the tracker', body: 'Paste our lightweight JavaScript snippet directly or deploy via Google Tag Manager. Works on custom sites, Webflow, Framer, and Shopify themes when installed via snippet or Google Tag Manager.' },
              { title: 'Capture the source', body: 'Every UTM, referring domain, major AI referrer, and ad click ID signal is preserved — automatically.' },
              { title: 'Track conversions', body: 'Trigger events on form submits, trial signups, booked meetings, or custom pipeline events.' },
              { title: 'Build reports', body: 'Review multi-touch journeys and campaign performance on clean, pre-built or custom dashboard widgets.' },
            ]} />
          </div>
        </div>
      </section>

      {/* Measurement Flow (Setup-Confidence Section) */}
      <section className="py-[96px] bg-white border-b border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="Measurement Flow" />
            <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
              How SourceTrack connects revenue to source
            </h2>
            <p className="mt-4 max-w-[620px] mx-auto text-[#586464] text-lg leading-[1.55]">
              A direct, verifiable tracking model that maps visitor touchpoints to conversions without black-box estimation.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {[
              { num: '01', title: 'Capture First-Touch', desc: 'When a visitor lands, we register their campaign UTM parameters, referring domain, or AI source context.' },
              { num: '02', title: 'Preserve Signals', desc: 'Touchpoint metrics are preserved in browser storage or sessionStorage based on deployment preferences.' },
              { num: '03', title: 'Track the Journey', desc: 'We log subsequent pageviews, content interactions, and touchpoint entries on a unified timeline.' },
              { num: '04', title: 'Ingest Conversions', desc: 'When a transaction, form submission, or trial upgrade occurs, conversion parameters are recorded.' },
              { num: '05', title: 'Report Attributed Revenue', desc: 'Our engine applies first-touch, last-touch, linear, or position-based models to distribute credit.' },
            ].map((step) => (
              <div key={step.num} className="p-5 rounded-2xl bg-[#F7FAFA] border border-[rgba(31,35,35,.08)]">
                <span className="block text-2xl font-black text-st-lime">{step.num}</span>
                <strong className="block mt-3 text-st-black text-base tracking-tight">{step.title}</strong>
                <p className="mt-2 text-[#586464] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why SourceTrack — comparison positioning */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Why SourceTrack vs GA4 + ad platforms" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            GA4 gives you pageviews. Ad platforms claim credit.<br />
            <span className="text-st-black">SourceTrack shows the source that created the customer.</span>
          </h2>
          <p className="mt-5 max-w-[620px] mx-auto text-[#586464] text-lg leading-[1.55]">
            GA4 is complex and built for product event tracking, not marketing attribution. Ad platforms report in silos, leading to duplicate conversions and inflated ROI. SourceTrack provides a simple, founder-friendly attribution source of truth so you can see the true campaign-to-cash journey.
          </p>

          <div className="mt-[54px]">
            <ComparisonTable rows={[
              ['Capability', 'SourceTrack', 'GA4', 'Ad platforms'],
              ['Multi-touch attribution setup', 'Install and go', 'Config-heavy', 'Platform-specific only'],
              ['Full customer journey timeline', 'Yes — every touchpoint', 'Hard to reconstruct', 'Not available'],
              ['AI referral tracking (ChatGPT/Claude)', 'Built in', 'Limited — marked as direct', 'Not available'],
              ['Custom attribution reports', 'Drag and pin', 'Complex — Explore only', 'Biased toward their clicks'],
              ['Revenue attribution per channel', 'Yes — all 9 models', 'Partial — last-click biased', 'Platform-biased'],
              ['Install speed', 'One script, minutes', 'Tag setup + configuration', 'Platform pixel only'],
            ]} />
          </div>
        </div>
      </section>

      {/* Works with your stack (Integrations Section) */}
      <section className="py-[96px] bg-[#F7FAFA] border-b border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="Integrations" />
            <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
              Works with your stack
            </h2>
            <p className="mt-4 max-w-[620px] mx-auto text-[#586464] text-lg leading-[1.55]">
              Connect SourceTrack with your CMS, tag managers, and billing systems using simple setup recipes.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { title: 'Google Tag Manager', desc: 'Deploy via template tag or custom HTML' },
              { title: 'Webflow', desc: 'Paste the snippet in custom header settings' },
              { title: 'WordPress', desc: 'Insert script using headers/footers manager' },
              { title: 'Framer', desc: 'Add tracking code block to site settings' },
              { title: 'Custom Script', desc: 'Direct browser pixel placement' },
              { title: 'Stripe Webhook', desc: 'Connect billing events via webhook recipes (Developer Beta)' },
              { title: 'Shopify Webhook', desc: 'Ingest orders via webhook/custom script recipes' },
              { title: 'GSC Queries', desc: 'Query performance integration' },
              { title: 'CSV Cost Imports', desc: 'Upload spreadsheet campaign spend' },
              { title: 'Custom API', desc: 'Developer HTTP ingestion endpoints (Beta)' },
            ].map((item) => (
              <div key={item.title} className="p-4 rounded-xl bg-white border border-[rgba(31,35,35,.08)] shadow-[0_4px_12px_rgba(31,35,35,.015)]">
                <strong className="block text-st-black text-sm tracking-tight">{item.title}</strong>
                <p className="mt-1 text-[#586464] text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-[96px]" style={{ background: '#white' }}>
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7">
            <div className="rounded-[36px] p-[48px] bg-st-black text-white border border-white/10 shadow-[0_24px_80px_rgba(31,35,35,.12)]">
              <SectionKicker label="Built for your business model" dark />
              <h2 className="mt-5 text-[clamp(26px,3.5vw,44px)] leading-[0.94] tracking-[-0.06em] font-black">
                Attribution that matches how you measure success.
              </h2>
              <p className="mt-4 text-[#B9C2C2] text-base leading-[1.55]">
                SaaS teams care about trial-to-paid conversion. Ecommerce teams care about ROAS and AOV. Lead gen teams care about qualified pipeline. SourceTrack emphasizes the metrics that matter for your business type.
              </p>
              <Link to="/signup" className="mt-6 inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64] transition-all hover:-translate-y-px">
                Start with your business type
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link to="/use-cases/saas" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">SaaS</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Trials, demos, paid conversions, MRR influence, and trial-to-paid attribution by source.</p>
              </Link>
              <Link to="/use-cases/ecommerce" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">Ecommerce</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Purchases, revenue, AOV, ROAS per campaign, and custom script purchase attribution.</p>
              </Link>
              <Link to="/use-cases/lead-generation" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">Lead generation</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Qualified leads, forms, booked meetings, CPL by channel, and pipeline revenue attribution.</p>
              </Link>
              <Link to="/use-cases/agencies" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">Agencies</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Client reporting, source-of-truth attribution, campaign optimization, and dashboard templates.</p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* AI section */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="Product differentiator" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                AI discovery is now a measurable acquisition channel.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              ChatGPT, Claude, Gemini, and Perplexity send traffic that GA4 and most analytics tools call "direct." SourceTrack identifies it, attributes the full journey, and connects it to revenue — so your team sees the complete picture of AI-driven acquisition.
            </p>
          </div>

          <FeatureCards compact items={[
            { icon: 'C', title: 'ChatGPT and Claude.', body: 'Measure traffic from AI chat platforms. See conversion rates, revenue per AI source, and compare AI-driven quality against paid, organic, and social.' },
            { icon: 'G', title: 'Gemini and AI search.', body: 'Track visitors from AI search results. Know which queries and pages AI surfaces are sending qualified traffic that converts.' },
            { icon: 'P', title: 'Perplexity and answer engines.', body: 'Reveal answer-engine referrals that assist pipeline. Compare AI traffic quality against traditional channels — see the revenue, not just the visits.' },
          ]} />

          <div className="mt-[54px] text-center">
            <Link to="/ai-referral-tracking" className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full border border-[rgba(31,35,35,.10)] bg-white text-st-black text-[15px] font-extrabold tracking-[-0.025em] hover:border-[rgba(31,35,35,.24)] transition-all hover:-translate-y-px">
              See how AI referral tracking works →
            </Link>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
