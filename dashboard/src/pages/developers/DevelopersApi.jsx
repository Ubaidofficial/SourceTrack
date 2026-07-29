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

function Endpoint({ method, path, description }) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg px-4 py-3 my-4">
      <span className={`inline-block text-[11px] font-bold font-mono px-2 py-0.5 rounded ${
        method === 'POST'
          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
      }`}>
        {method}
      </span>
      <code className="text-sm font-mono text-gray-800 dark:text-gray-200 font-semibold">{path}</code>
      {description && <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{description}</span>}
    </div>
  )
}

export default function DevelopersApi() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Public Ingestion API Reference | SourceTrack Docs</title>
        <meta name="description" content="Technical reference for SourceTrack's public ingestion endpoints, payloads, HTTP responses, and authentication parameters." />
        <link rel="canonical" href="https://www.sourcetrack.ai/developers/api" />
      </Helmet>

      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            API Reference
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Public endpoints for tracking, conversions, user identification, and event tracking.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            POST /api/track
          </h2>
          <Endpoint method="POST" path="/api/track" description="No auth — validated by site_key" />
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Submit a pageview or custom event to the server. The client-side tracker calls this automatically on navigation events.
          </p>

          <h4 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Request Body</h4>
          <ParamTable params={[
            { name: 'site_key', type: 'string', required: true, desc: 'Your public Site Key.' },
            { name: 'event', type: 'string', required: false, desc: 'Event label. Defaults to $pageview.' },
            { name: 'anonymous_id', type: 'string', required: false, desc: 'Visitor UUID.' },
            { name: 'session_id', type: 'string', required: false, desc: 'Session identifier.' },
            { name: 'page_url', type: 'string', required: false, desc: 'Full URL of the page.' },
            { name: 'referrer', type: 'string', required: false, desc: 'HTTP Referrer.' },
            { name: 'utm_source', type: 'string', required: false, desc: 'Acquisition source campaign channel.' },
            { name: 'utm_medium', type: 'string', required: false, desc: 'Acquisition medium.' },
            { name: 'utm_campaign', type: 'string', required: false, desc: 'Campaign name.' }
          ]} />

          <h4 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Example CURL Request</h4>
          <DocsCodeBlock lang="bash">
{`curl -X POST https://api.srctk.com/api/track \\
  -H "Content-Type: application/json" \\
  -d '{
    "site_key":     "sk_live_abc123",
    "event":        "$pageview",
    "anonymous_id": "550e8400-e29b-41d4-a716-446655440000",
    "page_url":     "https://yoursite.com/pricing",
    "referrer":     "https://google.com",
    "utm_source":   "google",
    "utm_medium":   "cpc",
    "utm_campaign": "brand-search"
  }'`}
          </DocsCodeBlock>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            POST /api/conversion
          </h2>
          <Endpoint method="POST" path="/api/conversion" description="No auth — validated by site_key" />
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Record a browser-submitted conversion event to power multi-touch attribution models.
          </p>

          <h4 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Request Body</h4>
          <ParamTable params={[
            { name: 'site_key', type: 'string', required: true, desc: 'Your Site Key.' },
            { name: 'anonymous_id', type: 'string', required: true, desc: 'Visitor identifier to stitch attribution logs.' },
            { name: 'conversion_value', type: 'number', required: false, desc: 'Checkout value. Defaults to 0.' },
            { name: 'conversion_type', type: 'string', required: false, desc: 'Label of conversion type.' },
            { name: 'order_id', type: 'string', required: false, desc: 'Deduplication identifier.' }
          ]} />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            POST /api/identify
          </h2>
          <Endpoint method="POST" path="/api/identify" description="No auth — validated by site_key" />
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            Link an anonymous visitor's tracking ID with their user profile for future server-side attribution.
          </p>

          <h4 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Request Body</h4>
          <ParamTable params={[
            { name: 'site_key', type: 'string', required: true, desc: 'Your Site Key.' },
            { name: 'anonymous_id', type: 'string', required: true, desc: 'Anonymous ID of the active session.' },
            { name: 'user_id', type: 'string', required: true, desc: 'Internal user profile ID.' },
            { name: 'email', type: 'string', required: false, desc: 'User email trait.' }
          ]} />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            GET /api/tracker/id
          </h2>
          <Endpoint method="GET" path="/api/tracker/id?site_key=xxx" description="Public — validated by site_key" />
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Fetch server-side visitor and session identifiers. Utilized site-wide by <code>tracker.cookieless.js</code>.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            POST /api/server/event
          </h2>
          <Endpoint method="POST" path="/api/server/event" description="Auth — validated by Bearer Token" />
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Submit events directly from your server. Authorize the call using a private <strong>Server API Token</strong> generated under Settings.
          </p>

          <DocsCallout type="info">
            Server API Tokens must be created in the <strong>Settings</strong> page under the <strong>Server API Tokens</strong> section. They require the Growth plan.
          </DocsCallout>

          <h4 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Request Body</h4>
          <ParamTable params={[
            { name: 'event', type: 'string', required: false, desc: 'Event label. Defaults to $pageview.' },
            { name: 'anonymous_id', type: 'string', required: false, desc: 'Visitor anonymous UUID.' },
            { name: 'user_id', type: 'string', required: false, desc: 'Internal user profile ID.' },
            { name: 'user_ip', type: 'string', required: false, desc: 'IP address of the client (for geo-resolution).' },
            { name: 'user_agent', type: 'string', required: false, desc: 'User-agent string of the client browser.' },
            { name: 'page_url', type: 'string', required: false, desc: 'Full page URL.' },
            { name: 'referrer', type: 'string', required: false, desc: 'HTTP Referrer.' },
            { name: 'utm_source', type: 'string', required: false, desc: 'UTM source campaign.' },
            { name: 'utm_medium', type: 'string', required: false, desc: 'UTM medium.' },
            { name: 'utm_campaign', type: 'string', required: false, desc: 'Campaign name.' },
            { name: 'conversion_value', type: 'number', required: false, desc: 'Monetary conversion value.' },
            { name: 'conversion_type', type: 'string', required: false, desc: 'Conversion type label.' },
            { name: 'timestamp', type: 'string', required: false, desc: 'ISO 8601 UTC date string when the event occurred (defaults to ingestion time).' },
            { name: 'properties', type: 'object', required: false, desc: 'JSON object containing custom metadata.' }
          ]} />

          <h4 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Example CURL Request</h4>
          <DocsCodeBlock lang="bash">
{`curl -X POST https://api.srctk.com/api/server/event \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer st_live_your_private_token_here" \\
  -d '{
    "event":            "purchase_completed",
    "anonymous_id":     "550e8400-e29b-41d4-a716-446655440000",
    "user_id":          "user_10029",
    "user_ip":          "192.168.1.1",
    "user_agent":       "Mozilla/5.0...",
    "conversion_value": 149.00,
    "conversion_type":  "sale"
  }'`}
          </DocsCodeBlock>
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
                  <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-4 w-40">Error Message</th>
                  <th className="text-left text-xs font-semibold text-gray-500 py-2">Typical Cause</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">400 Bad Request</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"Missing site_key" or "Invalid payload"</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">The required request parameter or payload structure is invalid.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">404 Not Found</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"Site not found"</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">The public site key does not exist or has been deactivated.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">500 Server Error</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"Track failed" or "Internal error"</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">Temporary database disconnect or unexpected server exception.</td>
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
            All public ingestion endpoints (<code>/api/track</code>, <code>/api/conversion</code>, <code>/api/identify</code>) execute in the public browser context and do not require secret API headers or tokens. Authentication is validated solely by checking the public <code>site_key</code>. Never place private dashboard credentials or database secrets inside front-end code.
          </p>
        </section>

        <DocsCallout type="info">
          All endpoints return a standardized JSON envelope: <code>{"{ success: boolean, data: object, error: string | null }"}</code>.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
