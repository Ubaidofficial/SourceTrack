import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DevelopersConversions() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Browser Conversions API Reference | SourceTrack Docs</title>
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

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            The JavaScript Conversion SDK
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            To capture and attribute a conversion, invoke the <code>sourcetrack.conversion</code> method directly from your success page, payment flow, or submit action:
          </p>
          <DocsCodeBlock lang="js">
{`window.sourcetrack.conversion({
  value: 99.00,             // Revenue value of the conversion
  type: 'purchase',         // String label: purchase, lead, signup, etc.
  order_id: 'ORD-98765',    // Optional deduplication ID
  properties: {             // Optional metadata parameters object
    plan_tier: 'enterprise',
    payment_mode: 'invoice'
  }
});`}
          </DocsCodeBlock>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Parameter Specifications
          </h2>
          <ul className="space-y-3 text-sm text-gray-750 dark:text-gray-350">
            <li>
              <strong>value</strong> <span className="text-xs text-[#00AA57] font-mono">number</span> (optional):
              <p className="mt-0.5">
                The numeric financial value attributed to this event. If omitted, the conversion is logged with a value of 0.
              </p>
            </li>
            <li>
              <strong>type</strong> <span className="text-xs text-[#00AA57] font-mono">string</span> (optional):
              <p className="mt-0.5">
                A custom classification label (e.g. <code>lead</code>, <code>trial_signup</code>, <code>newsletter_sub</code>). Defaults to <code>conversion</code> if not provided.
              </p>
            </li>
            <li>
              <strong>order_id</strong> <span className="text-xs text-[#00AA57] font-mono">string</span> (optional):
              <p className="mt-0.5">
                A unique transaction code. If a duplicate conversion payload containing the same <code>order_id</code> is dispatched, SourceTrack will ignore it to prevent skewing reports.
              </p>
            </li>
            <li>
              <strong>properties</strong> <span className="text-xs text-[#00AA57] font-mono">object</span> (optional):
              <p className="mt-0.5">
                A custom key-value object containing metadata. For privacy protection, sensitive parameters (like passwords, auth tokens, or emails) should be omitted or pseudonymized.
              </p>
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Loading Safeguards
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Because the tracking script loads asynchronously, the global <code>window.sourcetrack</code> object might not be defined immediately on page load. To prevent runtime reference errors, wrap your conversion dispatches with a check:
          </p>
          <DocsCodeBlock lang="js">
{`window.addEventListener('load', function() {
  if (window.sourcetrack) {
    window.sourcetrack.conversion({
      value: 12.50,
      type: 'book_download',
      order_id: 'DL_' + Date.now()
    });
  }
});`}
          </DocsCodeBlock>
        </section>

        <DocsCallout type="info">
          For server-to-server or CRM conversion triggers, utilize the server-side offline conversion endpoint. Details are available on the <a href="/developers/offline-conversions" className="underline font-bold">Offline conversions reference page</a>.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
