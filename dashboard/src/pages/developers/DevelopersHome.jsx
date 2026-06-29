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
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            Developer Portal
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            API references, payload schemas, and webhook recipes for developer setups.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">
            Reference Documentation
          </h2>
          <DocsCardGrid items={DEV_SECTIONS} />
        </section>

        {/* Developer Glossary Section */}
        <section className="bg-gray-50 dark:bg-dark-card border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Developer Glossary: Concepts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">HMAC Verification</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                A mechanism using cryptographic signatures to verify that incoming webhook request payloads originate from Stripe or Shopify and were not tampered with.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">Idempotency Key</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                A unique value (like an <code>order_id</code>) submitted with an event to prevent processing or storing duplicate payloads (e.g. on page refresh).
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">Anonymous ID (st_aid)</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                The tracking cookie/localStorage identifier representing a visitor's browser session before a logged-in identity is registered.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">User ID</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                A stable database identifier from your application backend that identifies a logged-in user. Stitching maps the <code>st_aid</code> to this ID.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">Properties / Metadata</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                Structured key-value fields sent with tracking payloads (like <code>conversion_value</code>, <code>currency</code>, or custom user tags).
              </p>
            </div>
          </div>
        </section>
      </div>
    </DocsLayout>
  )
}
