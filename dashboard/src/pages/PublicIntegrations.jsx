import React from 'react'
import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'Marketing & Revenue Integrations Directory | SourceTrack',
  description: 'Browse installation guides and webhook integration recipes for Stripe, Shopify, Webflow, WordPress, Google Tag Manager, and custom API setups.',
  canonical: 'https://sourcetrack.ai/integrations',
  ogTitle: 'Marketing & Revenue Integrations Directory | SourceTrack',
}

const HERO = {
  kicker: 'Integrations',
  h1: 'Connect marketing and revenue data.',
  sub: 'Learn how to install the tracking script and configure webhook listener recipes to capture visitor touchpoints, AI search referrals, and order conversions.',
  primaryCta: 'Start free',
  secondaryCta: 'View API docs',
  secondaryHref: '/developers/api',
}

const CATEGORIES = [
  {
    title: 'Script Installation & CMS',
    desc: 'Install the lightweight tracking snippet in your website head to capture pageviews and campaign touchpoints automatically.',
    items: [
      { name: 'Google Tag Manager', desc: 'Deploy as a Custom HTML tag triggered on all page views. Manual setup — paste the SourceTrack snippet into your own GTM container. Supports SPA route changes.', icon: '🏷️' },
      { name: 'Webflow', desc: 'Paste the tracking snippet into your site settings custom code head section.', icon: '🕸️' },
      { name: 'WordPress', desc: 'Add to header.php or use a header-code injection plugin. Works with all themes.', icon: '📝' },
      { name: 'Framer / Next.js', desc: 'Embed directly in your main layout or custom code injection settings.', icon: '⚡' },
      { name: 'Custom HTML / JS', desc: 'Standard minified pixel script with fallback cookieless tracking parameters.', icon: '🌐' }
    ]
  },
  {
    title: 'Revenue Ingestion Webhooks',
    desc: 'Manual webhook recipes for payment platforms and ecommerce carts. These are listener URLs you configure inside Stripe or Shopify yourself — SourceTrack is not distributed as a plugin in those platforms.',
    items: [
      { name: 'Shopify webhook recipe (manual)', desc: 'Configure orders/paid (or orders/create when financial_status is paid) to POST to a SourceTrack listener URL. Forward st_aid via cart note_attributes to stitch attribution.', icon: '🛍️' },
      { name: 'Stripe webhook recipe (manual)', desc: 'Subscribe to checkout.session.completed only. Pass the visitor anonymous id as client_reference_id or metadata.anonymous_id so revenue ties back to a journey.', icon: '💳' },
      { name: 'Custom offline / server API', desc: 'POST backend revenue events or CRM stage upgrades from your server using the REST API and a private Server API Token.', icon: '🔌' }
    ]
  },
  {
    title: 'Traffic & Ad Channels',
    desc: 'Capture click identifiers and UTM search parameters to attribute conversion value to exact campaigns.',
    items: [
      { name: 'Google Ads click ID', desc: 'Resolves gclid, gbraid, and wbraid clicks to map paid search touchpoints.', icon: '🔍' },
      { name: 'Meta Ads click ID', desc: 'Ingests fbclid parameters to attribute paid social conversions.', icon: '👥' },
      { name: 'Custom Campaigns', desc: 'Extracts UTM source, medium, campaign, content, and term signals out of the box.', icon: '📊' }
    ]
  },
  {
    title: 'AI Search Referrals',
    desc: 'Identify chatbot and AI search engine referrals out of the box without complex tagging.',
    items: [
      { name: 'ChatGPT Recommendations', desc: 'Identifies chatgpt.com referral paths to trace AI-assisted purchase journeys.', icon: '🤖' },
      { name: 'Claude Chat Referrals', desc: 'Tracks claude.ai referrals to link conversational recommendations to conversions.', icon: '🧠' },
      { name: 'Perplexity Search', desc: 'Attributes perplexity.ai click-through traffic back to its query source.', icon: '🌀' }
    ]
  }
]

export default function PublicIntegrations() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>
      <section className="py-[96px] bg-[#F7FAFA]">
        <div className="max-w-[1320px] mx-auto px-8">
          
          <div className="space-y-[72px]">
            {CATEGORIES.map((cat, catIdx) => (
              <div key={catIdx} className="border-b border-[rgba(31,35,35,.06)] pb-12 last:border-0 last:pb-0">
                <div className="max-w-[720px] mb-8">
                  <SectionKicker label={cat.title} />
                  <p className="mt-2 text-[#586464] text-base leading-[1.5]">
                    {cat.desc}
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {cat.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="bg-white border border-[rgba(31,35,35,.06)] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                      <div className="text-3xl mb-4">{item.icon}</div>
                      <h3 className="text-base font-bold text-st-black mb-1">{item.name}</h3>
                      <p className="text-sm text-[#586464] leading-[1.45]">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 bg-white border border-[rgba(31,35,35,.08)] rounded-2xl p-8 max-w-[800px] mx-auto text-center shadow-sm">
            <h3 className="text-lg font-bold text-st-black mb-2">Need a custom backend connection?</h3>
            <p className="text-sm text-[#586464] leading-relaxed mb-6">
              Our developer documentation details how to send conversion events directly from your server, database, or CRM using the offline conversion endpoints.
            </p>
            <div className="flex justify-center gap-4">
              <Link to="/developers/offline-conversions" className="text-sm font-semibold bg-st-black text-white px-5 py-2.5 rounded-lg hover:bg-st-black/90 transition-colors">
                View API Setup Guides
              </Link>
            </div>
          </div>

        </div>
      </section>
    </MarketingPage>
  )
}
