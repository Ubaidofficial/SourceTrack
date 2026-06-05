import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import DashboardPreviewMock from '../components/DashboardPreviewMock'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import ComparisonTable from '../components/ComparisonTable'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies',
  description: 'SourceTrack helps SaaS, lead-gen, and agency teams track which sources, campaigns, AI referrals, and customer journeys turn into conversions and revenue. Multi-touch attribution with a lightweight install.',
  canonical: 'https://sourcetrack.ai/',
  ogTitle: 'SourceTrack — Know which sources actually create revenue',
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
      "description": "Revenue attribution analytics for SaaS, lead-gen, and agency teams. Track campaigns, AI referrals, customer journeys, and conversions. Multi-touch attribution with 8 models.",
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
  kicker: 'Revenue attribution for modern marketing teams',
  h1: 'Know which sources actually',
  h1Gradient: 'create revenue.',
  sub: 'Stop guessing which campaigns drive sales. SourceTrack connects the entire customer journey — from first click to paying customer — so you can stop relying on biased ad-platform self-reporting and scale what actually converts.',
  primaryCta: 'Start tracking free',
  secondaryCta: 'View product',
  secondaryHref: '/product',
  proofs: ['Install with one script or GTM', 'Free for 5,000 pageviews/mo', 'Built for founders and marketers'],
}

export default function Landing() {
  return (
    <MarketingPage seo={SEO} hero={HERO} heroChildren={<DashboardPreviewMock />}>

      {/* Trust band — what SourceTrack tracks */}
      <section className="py-[56px] border-b border-[rgba(31,35,35,.06)] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              ['AI referral tracking', '15 AI platforms detected'],
              ['Multi-touch journeys', '8 attribution models'],
              ['Revenue attribution', 'First to last touch'],
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
                One workspace for source, journey, conversion, and revenue clarity.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              SourceTrack captures every visitor touchpoint, connects the full customer journey, and attributes revenue back to the channels that actually created it — not just the last click.
            </p>
          </div>

          <FeatureCards items={[
            { icon: '①', title: 'Attribution engine.', body: 'Track every campaign, UTM, referrer, landing page, and conversion event. Compare channels across 8 attribution models — first touch, last touch, linear, U-shaped, and more.' },
            { icon: '②', title: 'AI referral tracking.', body: 'Reveal leads and revenue from ChatGPT, Claude, Gemini, Perplexity, and 15 AI platforms. Stop losing AI-driven conversions to direct traffic in your reports.' },
            { icon: '③', title: 'Report builder.', body: 'Start from a blank canvas. Choose the metric and dimension that matches your business, save the widget, and pin it to your dashboard.' },
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
              { title: 'Install the tracker', body: 'Add one script directly or through Google Tag Manager. Works on any website, Shopify store, or Webflow site.' },
              { title: 'Capture the source', body: 'Every UTM, referrer, AI platform, landing page, and click ID is preserved — automatically.' },
              { title: 'Track conversions', body: 'Fire events for purchases, trials, demos, forms, signups, or any custom business outcome.' },
              { title: 'Build reports', body: 'Create and pin dashboards around the metrics your team actually uses to make budget decisions.' },
            ]} />
          </div>
        </div>
      </section>

      {/* Why SourceTrack — comparison positioning */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Why SourceTrack vs GA4 + ad platforms" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            GA4 gives you pageviews. Ad platforms give you clicks.<br />
            <span className="text-st-black">SourceTrack gives you the source that created the customer.</span>
          </h2>
          <p className="mt-5 max-w-[620px] mx-auto text-[#586464] text-lg leading-[1.55]">
            GA4 is built to track pageviews, not customer journeys. Ad platforms are built to favor their own ads, leading to duplicate conversion reports and wasted spend. SourceTrack gives you full-funnel attribution clarity. Track every touchpoint independently, prove the real ROI of your marketing, and double down on what actually works.
          </p>

          <div className="mt-[54px]">
            <ComparisonTable rows={[
              ['Capability', 'SourceTrack', 'GA4', 'Ad platforms'],
              ['Multi-touch attribution setup', 'Install and go', 'Config-heavy', 'Platform-specific only'],
              ['Full customer journey timeline', 'Yes — every touchpoint', 'Hard to reconstruct', 'Not available'],
              ['AI referral tracking (15 platforms)', 'Built in', 'Limited — marked as direct', 'Not available'],
              ['Custom attribution reports', 'Drag and pin', 'Complex — Explore only', 'Biased toward their clicks'],
              ['Revenue attribution per channel', 'Yes — all 8 models', 'Partial — last-click biased', 'Platform-biased'],
              ['Install speed', 'One script, minutes', 'Tag setup + configuration', 'Platform pixel only'],
            ]} />
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-[96px]" style={{ background: '#F7FAFA' }}>
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
              <Link to="/saas-attribution" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">SaaS</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Trials, demos, paid conversions, MRR influence, and trial-to-paid attribution by source.</p>
              </Link>
              <Link to="/ecommerce-attribution" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">Ecommerce</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Purchases, revenue, AOV, ROAS per campaign, and landing page purchase attribution.</p>
              </Link>
              <Link to="/lead-gen-attribution" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">Lead generation</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Qualified leads, forms, booked meetings, CPL by channel, and pipeline revenue attribution.</p>
              </Link>
              <Link to="/agency-attribution" className="flex flex-col p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.12)] shadow-[0_12px_38px_rgba(31,35,35,.055)] hover:-translate-y-1 transition-all hover:shadow-[0_18px_52px_rgba(31,35,35,.09)]">
                <strong className="text-lg tracking-[-0.04em]">Agencies</strong>
                <p className="mt-1.5 text-[#586464] text-[15px]">Client reporting, source-of-truth attribution, campaign optimization, and client-safe report exports.</p>
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
            { icon: 'G', title: 'Gemini and AI search.', body: 'Track visitors from AI-powered search results. Know which queries and pages AI surfaces are sending qualified traffic that converts.' },
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
