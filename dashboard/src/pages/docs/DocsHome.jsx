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
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            SourceTrack Docs
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Install tracking, verify conversions, and connect revenue without an analytics maze.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">
            Start here
          </h2>
          <DocsCardGrid items={START_CARDS} />
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">
            Platform setup recipes
          </h2>
          <DocsCardGrid items={PLATFORM_CARDS} />
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">
            Help & Developer Portal
          </h2>
          <DocsCardGrid items={HELP_CARDS} />
        </section>
      </div>
    </DocsLayout>
  )
}
