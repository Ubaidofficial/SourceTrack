import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCardGrid from '../../components/docs/DocsCardGrid'

const DEV_SECTIONS = [
  {
    title: 'API Reference',
    description: 'Endpoints for server-side page view dispatches and client settings updates.',
    to: '/developers/api'
  },
  {
    title: 'Tracker SDK',
    description: 'JavaScript API reference for the standard and cookieless client-side pixel.',
    to: '/developers/tracker'
  },
  {
    title: 'Browser Conversions',
    description: 'Trigger purchase, lead, sign-up, and demo booking events from front-end code.',
    to: '/developers/conversions'
  },
  {
    title: 'Offline / Server Conversions',
    description: 'Record backend offline transactions, recurring subscription bills, and server events.',
    to: '/developers/offline-conversions'
  },
  {
    title: 'User Identification',
    description: 'Link anonymous sessions with logged-in user profiles for conversion attribution stitching.',
    to: '/developers/identify'
  },
  {
    title: 'Webhooks & HMAC',
    description: 'Stripe and Shopify webhook receivers, and validating webhook signatures.',
    to: '/developers/webhooks'
  },
  {
    title: 'Campaign Costs API',
    description: 'CSV cost schemas and REST endpoints for campaign clicks, impressions, and spend imports.',
    to: '/developers/campaign-costs'
  },
  {
    title: 'Security Specifications',
    description: 'Factual details on data scope, scripting bounds, and secure token practices.',
    to: '/developers/security'
  }
]

export default function DevelopersHome() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Developer Portal — API & Integration Reference | SourceTrack</title>
        <meta name="description" content="Technical details, API specs, tracker configurations, and payloads for implementing first-party revenue attribution." />
        <link rel="canonical" href="https://sourcetrack.ai/developers" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Developer Portal
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            API references, payload schemas, and webhook recipes for developer setups.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">
            Reference Documentation
          </h2>
          <DocsCardGrid items={DEV_SECTIONS} />
        </section>
      </div>
    </DocsLayout>
  )
}
