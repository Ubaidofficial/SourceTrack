import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

function ParamTable({ params }) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-40">Parameter</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-24">Type</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-20">Required</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
              <td className="py-2 pr-4 font-mono text-[13px] text-gray-800 dark:text-gray-200 align-top">{p.name}</td>
              <td className="py-2 pr-4 text-[13px] text-green-600 dark:text-green-400 font-mono align-top">{p.type}</td>
              <td className="py-2 pr-4 align-top">
                {p.required
                  ? <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">required</span>
                  : <span className="text-[11px] text-gray-400">{p.requiredCondition || 'optional'}</span>}
              </td>
              <td className="py-2 text-[13px] text-gray-600 dark:text-gray-400 align-top">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Endpoint({ method, path, description }) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg px-4 py-3 my-4">
      <span className="inline-block text-[11px] font-bold font-mono px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
        {method}
      </span>
      <code className="text-sm font-mono text-gray-800 dark:text-gray-200 font-semibold">{path}</code>
      {description && <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{description}</span>}
    </div>
  )
}

export default function DevelopersOfflineConversions() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Offline & Server Conversions API Reference | SourceTrack Docs</title>
        <meta name="description" content="Integrate server-side revenue tracking via the offline conversions endpoint. Parameter specifications for Stripe, CRM, and Stripe webhooks." />
        <link rel="canonical" href="https://www.sourcetrack.ai/developers/offline-conversions" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            Offline Conversions
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Record backend conversions, subscription billing cycles, or delayed CRM conversions.
          </p>
        </div>

        {/* Overview */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Overview
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            For transactions that happen off the website (such as recurring billing charges, CRM status upgrades, or backend invoice payments), use the offline conversions endpoint to stitch value back to the user's initial acquisition path.
          </p>
        </section>

        {/* Endpoint */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            HTTP Endpoint
          </h2>
          <Endpoint method="POST" path="/api/conversion/offline" description="Public Ingestion — validated by site_key" />
          <DocsCallout type="info">
            To record a refund, use the Stripe <code>refund.created</code> webhook; the offline conversion API accepts positive conversion values only.
          </DocsCallout>
        </section>

        {/* Parameters */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Payload Parameters
          </h2>
          <ParamTable params={[
            { name: 'site_key', type: 'string', required: true, desc: 'Your public Site Key.' },
            { name: 'conversion_value', type: 'number', required: true, desc: 'The monetary value of the conversion (e.g. 149.00 or 0).' },
            { name: 'currency', type: 'string', required: false, requiredCondition: 'conditionally required', desc: '3-letter currency code (e.g. USD). Required if conversion_value is greater than 0.' },
            { name: 'anonymous_id', type: 'string', required: false, requiredCondition: 'conditionally required', desc: 'The visitor\'s anonymous st_aid identifier. Required if user_id is omitted. This is the most reliable stitching key for browser-originated journeys.' },
            { name: 'user_id', type: 'string', required: false, requiredCondition: 'conditionally required', desc: 'Your backend user identifier. Required if anonymous_id is omitted. Use only when the same user_id was previously sent via sourcetrack.identify() so the pageview history exists under that identity — send anonymous_id when available for the most accurate attribution.' },
            { name: 'order_id', type: 'string', required: false, requiredCondition: 'conditionally required', desc: 'Unique transaction ID. Required for revenue events (value > 0) to deduplicate dispatches.' },
            { name: 'payment_id', type: 'string', required: false, desc: 'Alternative deduplication key (e.g. Stripe payment intent ID).' },
            { name: 'idempotency_key', type: 'string', required: false, desc: 'Alternative transaction-level deduplication key.' },
            { name: 'provider_event_id', type: 'string', required: false, desc: 'Stripe, Shopify, or custom provider transaction ID.' },
            { name: 'occurred_at', type: 'string', required: false, desc: 'ISO 8601 UTC date string when the event happened. Defaults to server time.' },
            { name: 'provider', type: 'string', required: false, desc: 'Naming slug for the transaction source. Defaults to "payments_api".' },
            { name: 'properties', type: 'object', required: false, desc: 'JSON object containing custom metadata. Also accepts alias "metadata".' }
          ]} />
        </section>

        {/* Copy-Paste Example */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Code Examples
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary mb-2">cURL POST Request</h3>
              <DocsCodeBlock lang="bash">
{`curl -X POST https://api.srctk.com/api/conversion/offline \\
  -H "Content-Type: application/json" \\
  -d '{
    "site_key": "sk_live_abc123",
    "anonymous_id": "550e8400-e29b-41d4-a716-446655440000",
    "conversion_value": 149.00,
    "currency": "USD",
    "order_id": "ORDER_100293",
    "conversion_type": "subscription_charge",
    "occurred_at": "2026-06-09T12:00:00Z"
  }'`}
              </DocsCodeBlock>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary mb-2">Node.js Fetch</h3>
              <DocsCodeBlock lang="js">
{`await fetch('https://api.srctk.com/api/conversion/offline', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    site_key: 'sk_live_abc123',
    anonymous_id: '550e8400-e29b-41d4-a716-446655440000',
    conversion_value: 120.00,
    currency: 'USD',
    conversion_type: 'subscription_renewal',
    order_id: 'INV_987654321',
    occurred_at: new Date().toISOString()
  })
});`}
              </DocsCodeBlock>
            </div>
          </div>
        </section>

        {/* Common Errors */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Errors
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-4 w-24">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-4 w-48">Error Response</th>
                  <th className="text-left text-xs font-semibold text-gray-500 py-2">Typical Cause</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">400 Bad Request</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"conversion_value must be a valid number"</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">The value passed is empty, string, or boolean instead of a number.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">400 Bad Request</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"A valid 3-letter currency code (e.g. USD) is required..."</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">The value is greater than 0, but the currency is missing or invalid.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">400 Bad Request</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"At least one stable deduplication key... is required..."</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">Revenue value is greater than 0, but no order_id, payment_id, or provider_event_id is supplied.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">400 Bad Request</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"occurred_at... must be a valid ISO 8601 date string"</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">The time string supplied cannot be parsed by standard JavaScript Date engines.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Security Note */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Security Note
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            The endpoint is public and uses <code>site_key</code> validation, meaning you can hit it from backend cron jobs or billing services without maintaining auth headers. However, because it logs monetary revenue, you should always verify the endpoint responses and restrict call loops on your server to prevent malicious or accidental inflation of reports.
          </p>
        </section>

        <DocsCallout type="info">
          Stripe and Shopify integrations utilize this endpoint under the hood inside webhook listeners to forward charges and order actions.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
