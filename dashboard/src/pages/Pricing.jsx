import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import PricingCards from '../components/PricingCards'
import FAQSection from '../components/FAQSection'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'SourceTrack Pricing — Simple Attribution Pricing, Free Forever Tier | SourceTrack',
  description: 'Simple pricing for marketing attribution, AI referral tracking, customer journeys, conversion tracking, and custom report builder dashboards. Start free for 5,000 pageviews/mo.',
  canonical: 'https://sourcetrack.ai/pricing',
  ogTitle: 'SourceTrack Pricing',
}

const HERO = {
  kicker: 'Pricing',
  h1: 'Simple attribution pricing that grows with you.',
  sub: 'Start free with 5,000 pageviews per month. Validate your tracking setup and attribution data. Upgrade when attribution becomes part of your growth workflow.',
  primaryCta: 'Start free',
  secondaryCta: 'Talk to sales',
  secondaryHref: 'mailto:sales@sourcetrack.ai',
  proofs: ['Verify setup on the free plan', 'No annual contracts', 'Upgrade or downgrade anytime'],
}

const COMPARISON_FEATURES = [
  { category: 'Limits', items: [
    { name: 'Active Sites', free: '1 site', starter: '1 site', growth: '3 sites', scale: '10+ sites' },
    { name: 'Tracked Pageviews / mo', free: '5,000', starter: '50,000', growth: '150,000', scale: '500,000+' },
    { name: 'Attributed Conversions / mo', free: '30', starter: '150', growth: '750', scale: '2,500+' },
    { name: 'Data Retention History', free: '30 days', starter: '90 days', growth: '1 year', scale: '5 years' },
  ]},
  { category: 'Reporting & Analytics', items: [
    { name: 'Traffic Sources & Pages', free: 'Yes', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
    { name: 'AI Referral Detection', free: 'Yes', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
    { name: 'Attribution Models Supported', free: 'Last-touch only', freeLabel: 'Last-touch', starter: 'All 9 models', growth: 'All 9 models', scale: 'All 9 models' },
    { name: 'Dashboard Widget Pinning', free: 'No', starter: 'No', growth: 'Yes', scale: 'Yes' },
    { name: 'CSV Report Exports', free: 'No', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
  ]},
  { category: 'Integrations & API', items: [
    { name: 'JavaScript Tracking Snippet', free: 'Yes', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
    { name: 'Shopify Webhook Listener Recipe', free: 'Yes', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
    { name: 'Stripe Webhook setup recipe', free: 'Yes', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
    { name: 'Google Search Console Integration', free: 'No', starter: 'No', growth: 'Yes', scale: 'Yes' },
    { name: 'Developer Offline Ingestion API', free: 'No', starter: 'No', growth: 'Yes', scale: 'Yes' },
  ]},
  { category: 'Team & Collaboration', items: [
    { name: 'User Seats Included', free: '1 user', starter: '1 user', growth: '3 users', scale: '99 users' },
    { name: 'Support Tier', free: 'Self-serve', starter: 'Email', growth: 'Email', scale: 'Priority onboarding' }
  ]}
]

export default function Pricing() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>

      {/* Pricing cards */}
      <section className="py-[96px] bg-[#F7FAFA]">
        <div className="max-w-[1320px] mx-auto px-8">
          <PricingCards />
        </div>
      </section>

      {/* Feature Comparison Matrix */}
      <section className="py-[96px] bg-white border-b border-[rgba(31,35,35,.06)]">
        <div className="max-w-[960px] mx-auto px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="Features Matrix" />
            <h2 className="text-[clamp(32px,4vw,48px)] leading-[0.95] tracking-[-0.06em] font-black text-st-black">
              Compare plans and capabilities
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-semibold text-[#586464]">
              <thead>
                <tr className="border-b-2 border-st-black text-st-black font-black uppercase text-[10px] tracking-wider">
                  <th className="py-3 pr-4 w-[280px]">Feature capability</th>
                  <th className="py-3 px-3 w-[120px] text-center">Free</th>
                  <th className="py-3 px-3 w-[120px] text-center">Starter</th>
                  <th className="py-3 px-3 w-[120px] text-center">Growth</th>
                  <th className="py-3 px-3 w-[120px] text-center">Scale</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_FEATURES.map((cat, catIdx) => (
                  <React.Fragment key={catIdx}>
                    {/* Category Header Row */}
                    <tr className="bg-[#F7FAFA] border-b border-[rgba(31,35,35,.08)]">
                      <td colSpan={5} className="py-2.5 px-3 text-st-black font-black uppercase tracking-wider text-[9px] bg-[#F7FAFA]">
                        {cat.category}
                      </td>
                    </tr>
                    {cat.items.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-[rgba(31,35,35,.06)] hover:bg-[#F7FAFA]/30 transition-colors">
                        <td className="py-3.5 pr-4 pl-3 font-bold text-st-black text-sm tracking-tight">{row.name}</td>
                        <td className="py-3.5 px-3 text-center text-sm font-medium">{row.free}</td>
                        <td className="py-3.5 px-3 text-center text-sm font-medium">{row.starter}</td>
                        <td className="py-3.5 px-3 text-center text-sm font-bold text-st-black">{row.growth}</td>
                        <td className="py-3.5 px-3 text-center text-sm font-medium">{row.scale}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
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
              { q: 'How does the free plan work?', a: 'Free forever — see where your next 30 conversions came from. Includes 1 site, 5,000 tracked pageviews/mo, simple analytics, traffic sources, top pages, referrers, countries, devices, browsers, UTMs, AI source detection, and basic conversions. CSV export, saved reports, dashboard widgets, manual revenue/status, API/webhooks, and revenue attribution are available on paid plans.' },
              { q: 'What attribution models does SourceTrack support?', a: 'All plans include last-touch. Paid plans add first touch, linear, time decay, U-shaped, W-shaped, and position-based models. Compare channels across all 9 models from a single dashboard.' },
              { q: 'Can I cancel anytime?', a: 'Yes. No annual contracts. Upgrade or downgrade as your traffic and attribution needs change.' },
            ]} />
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
