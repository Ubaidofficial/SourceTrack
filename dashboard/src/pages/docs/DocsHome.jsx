import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCardGrid from '../../components/docs/DocsCardGrid'

const START_CARDS = [
  {
    title: 'Quickstart',
    description: 'Set up tracking in under 5 minutes with our guided checklist.',
    to: '/docs/quickstart'
  },
  {
    title: 'Install SourceTrack Script',
    description: 'Learn where and how to install the pixel script on your website.',
    to: '/docs/install'
  },
  {
    title: 'Track Your First Conversion',
    description: 'Configure and record conversion triggers from browser actions.',
    to: '/developers/conversions'
  },
  {
    title: 'Attribute Revenue',
    description: 'Connect Shopify or Stripe webhook data to attribute sales back to touchpoints.',
    to: '/developers/offline-conversions'
  }
]

const PLATFORM_CARDS = [
  {
    title: 'Google Tag Manager',
    description: 'Deploy the standard script easily via GTM Custom HTML tags.',
    to: '/docs/platforms/google-tag-manager'
  },
  {
    title: 'Webflow',
    description: 'Add conversion tracking to Webflow sites via page headers.',
    to: '/docs/platforms/webflow'
  },
  {
    title: 'WordPress',
    description: 'Install the tracking code manually or via header templates on WordPress.',
    to: '/docs/platforms/wordpress'
  },
  {
    title: 'Framer',
    description: 'Integrate first-party tracking onto Framer landing pages.',
    to: '/docs/platforms/framer'
  },
  {
    title: 'Shopify Setup Recipe',
    description: 'Manual cart attribute and order webhook listener setup instructions.',
    to: '/docs/platforms/shopify'
  },
  {
    title: 'Stripe Setup Recipe',
    description: 'Connect Stripe webhooks to stitch marketing channels with subscriptions.',
    to: '/docs/platforms/stripe'
  }
]

const HELP_CARDS = [
  {
    title: 'Troubleshooting Guide',
    description: 'Resolve common problems like missing conversions or pageviews.',
    to: '/docs/troubleshooting'
  },
  {
    title: 'Developer Portal',
    description: 'Explore full REST API specs, tracker configurations, and payloads.',
    to: '/developers'
  }
]

export default function DocsHome() {
  return (
    <DocsLayout>
      <Helmet>
        <title>SourceTrack Integration Documentation & API Docs</title>
        <meta name="description" content="Technical guides for installing the tracker, tracking custom conversions, stitching user IDs, and API references." />
        <link rel="canonical" href="https://sourcetrack.ai/docs" />
      </Helmet>

      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            SourceTrack Docs
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Install tracking, verify conversions, and connect revenue without an analytics maze.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">
            Start here
          </h2>
          <DocsCardGrid items={START_CARDS} />
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">
            Platform setup recipes
          </h2>
          <DocsCardGrid items={PLATFORM_CARDS} />
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">
            Help & Developer Portal
          </h2>
          <DocsCardGrid items={HELP_CARDS} />
        </section>

        {/* Glossary / Terms Section */}
        <section className="bg-gray-50 dark:bg-dark-card border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Glossary: Key Concepts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">Tracker Script</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                The lightweight JavaScript snippet that loads on your website pages to record visitor sessions and referrers.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">Site Key</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                The public identifier (starting with <code>st_</code>) that authorizes your script to submit tracking data to your dashboard profile.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">Pageview</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                An event recorded automatically every time a customer navigates to a new page or route on your site.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">Conversion</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                A key action taken by a user (like registering, booking a demo, or buying an item) that you want to track and attribute.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">Source & Referrer</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                The channel or website that referred the user to your page (e.g. <code>google</code>, <code>twitter.com</code>, or direct traffic).
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">UTMs & Click IDs</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                Standard tags (like <code>utm_source</code>) and ad click identifiers (like <code>gclid</code>) parsed from the URL to map paid ad campaigns.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">Webhook</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                An automated server-to-server message sent from payment systems (like Stripe or Shopify) to report order value to SourceTrack.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DocsLayout>
  )
}
