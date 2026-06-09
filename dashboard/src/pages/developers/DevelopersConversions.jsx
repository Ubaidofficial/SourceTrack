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

function MethodSignature({ signature }) {
  return (
    <div className="bg-gray-50 dark:bg-[#1a1d1d] border border-gray-200 dark:border-[#2a2e2e] rounded-lg px-4 py-3 my-4">
      <code className="text-sm font-mono text-gray-800 dark:text-gray-200 font-semibold">{signature}</code>
    </div>
  )
}

export default function DevelopersConversions() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Browser Conversions SDK Reference | SourceTrack Docs</title>
        <meta name="description" content="Integrate client-side conversions on checkout thank-you pages, form actions, and scheduler embeds using the JavaScript SDK." />
        <link rel="canonical" href="https://sourcetrack.ai/developers/conversions" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Browser Conversions
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Record conversion events from your frontend code using the JavaScript SDK.
          </p>
        </div>

        {/* Overview */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Overview
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            SourceTrack captures browser-side conversion milestones to calculate multi-touch marketing attribution models. Use the JavaScript helper to log transactions, registrations, or demo bookings directly from user interactions.
          </p>
        </section>

        {/* Method Signature */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Method Signature
          </h2>
          <MethodSignature signature="window.sourcetrack.conversion(options)" />
        </section>

        {/* Parameters Table */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Parameters
          </h2>
          <ParamTable params={[
            { name: 'value', type: 'number', required: false, desc: 'Financial value attributed to the conversion event. Defaults to 0.' },
            { name: 'type', type: 'string', required: false, desc: 'Conversion classification label (e.g. purchase, signup, lead). Defaults to "conversion".' },
            { name: 'order_id', type: 'string', required: false, desc: 'Unique transaction reference to prevent duplicate conversion records on page reload.' },
            { name: 'properties', type: 'object', required: false, desc: 'Key-value object for custom metadata. Do not include raw email addresses or plaintext passwords.' }
          ]} />
        </section>

        {/* Copy-Paste Example */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Example Implementation
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Because the tracking script loads asynchronously, wrap conversion calls inside a check to confirm the SDK object has finished initializing:
          </p>
          <DocsCodeBlock lang="js">
{`window.addEventListener('load', function() {
  if (window.sourcetrack) {
    window.sourcetrack.conversion({
      value: 99.00,
      type: 'purchase',
      order_id: 'ORD-98765',
      properties: {
        plan_tier: 'enterprise',
        billing_period: 'yearly'
      }
    });
  }
});`}
          </DocsCodeBlock>
        </section>

        {/* Common Errors */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Errors
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-750 dark:text-gray-350">
            <li>
              <strong>TypeError: Cannot read properties of undefined (reading 'conversion'):</strong> Occurs if you call the SDK method before the async tracking script executes. Wrap calls in a <code>load</code> event listener or null check.
            </li>
            <li>
              <strong>Duplicate Conversion Logs:</strong> If a user refreshes their checkout confirmation page, the conversion triggers again. Always supply a stable <code>order_id</code> to enable automatic deduplication.
            </li>
            <li>
              <strong>Incorrect Option Names:</strong> Passing <code>amount</code> instead of <code>value</code>, or <code>conversion_type</code> instead of <code>type</code> will fallback to defaults.
            </li>
          </ul>
        </section>

        {/* Security Note */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Security Note
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            All browser-submitted payloads are public and can be inspected in Developer Tools. Never pass sensitive user credentials, access tokens, or unredacted passwords inside the conversion <code>properties</code> metadata object.
          </p>
        </section>

        <DocsCallout type="info">
          For server-to-server or CRM conversion triggers, utilize the server-side offline conversion endpoint. Details are available on the <a href="/developers/offline-conversions" className="underline font-bold">Offline conversions reference page</a>.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
