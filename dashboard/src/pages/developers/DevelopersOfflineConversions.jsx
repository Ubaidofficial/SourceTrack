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
              <td className="py-2 pr-4 text-[13px] text-[#00AA57] dark:text-green-400 font-mono align-top">{p.type}</td>
              <td className="py-2 pr-4 align-top">
                {p.required
                  ? <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">required</span>
                  : <span className="text-[11px] text-gray-400">optional</span>}
              </td>
              <td className="py-2 text-[13px] text-gray-600 dark:text-gray-400 align-top">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DevelopersOfflineConversions() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Offline & Server Conversions API Reference | SourceTrack Docs</title>
        <meta name="description" content="Integrate server-side revenue tracking via the offline conversions endpoint. Parameter specifications for Stripe, CRM, and Stripe webhooks." />
        <link rel="canonical" href="https://sourcetrack.ai/developers/offline-conversions" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Offline Conversions
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Record backend conversions, subscription billing cycles, or delayed CRM conversions.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            POST /api/conversion/offline
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Submit a server-to-server conversion payload. Authenticated by your public <code>site_key</code> parameter inside the JSON body.
          </p>

          <h4 className="text-sm font-extrabold text-gray-900 dark:text-white">Payload Parameters</h4>
          <ParamTable params={[
            { name: 'site_key', type: 'string', required: true, desc: 'Your Site Key.' },
            { name: 'anonymous_id', type: 'string', required: false, desc: 'The visitor\'s anonymous tracking UUID (e.g. st_aid). Either anonymous_id or user_id is required to stitch the journey.' },
            { name: 'user_id', type: 'string', required: false, desc: 'Your internal database User ID. Stitches journey if the user was identified previously.' },
            { name: 'conversion_value', type: 'number', required: true, desc: 'The monetary value (e.g., 149.00).' },
            { name: 'currency', type: 'string', required: true, desc: '3-letter currency code (e.g. "USD"). Required for correct revenue aggregation.' },
            { name: 'conversion_type', type: 'string', required: false, desc: 'Label of the conversion. Defaults to "offline_conversion".' },
            { name: 'order_id', type: 'string', required: false, desc: 'Unique order identifier to prevent duplicate processing.' },
            { name: 'occurred_at', type: 'string', required: false, desc: 'ISO timestamp representing when the transaction occurred (e.g. "2026-06-09T12:00:00Z").' },
            { name: 'properties', type: 'object', required: false, desc: 'Additional metadata fields object.' }
          ]} />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Server Ingestion Example
          </h2>
          <DocsCodeBlock lang="js">
{`// Example of submitting a server-side offline conversion (Node.js)
await fetch('https://api.srctk.com/api/conversion/offline', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    site_key: 'sk_live_abc123',
    anonymous_id: '550e8400-e29b-41d4-a716-446655440000',
    conversion_value: 120.00,
    currency: 'USD',
    conversion_type: 'subscription_charge',
    order_id: 'INV_987654321',
    occurred_at: new Date().toISOString()
  })
});`}
          </DocsCodeBlock>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            temporal attribution window
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            By default, server-side conversion records are matched with touchpoints that occurred within your workspace\'s configured lookback window. If no touchpoint is matched, the conversion is recorded as <strong>Direct/None</strong>.
          </p>
        </section>

        <DocsCallout type="info">
          Stripe and Shopify integrations utilize this endpoint under the hood inside webhook listeners to forward charges and order actions.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
