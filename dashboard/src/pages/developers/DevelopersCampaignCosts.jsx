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
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-40">Column / Param</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-24">Type</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-20">Required</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2">Validation Rules</th>
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
      <span className="inline-block text-[11px] font-bold font-mono px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
        {method}
      </span>
      <code className="text-sm font-mono text-gray-800 dark:text-gray-200 font-semibold">{path}</code>
      {description && <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{description}</span>}
    </div>
  )
}

export default function DevelopersCampaignCosts() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Campaign Cost CSV & API Reference | SourceTrack Docs</title>
        <meta name="description" content="Technical details for importing ad costs, clicks, and impressions. CSV format validation rules, deduplication indexing, and API ingestion endpoints." />
        <link rel="canonical" href="https://www.sourcetrack.ai/developers/campaign-costs" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            Campaign Cost Imports
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Import ad campaign clicks, impressions, and spend data for ROI, CPC, and ROAS calculations.
          </p>
        </div>

        {/* Overview */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Overview
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            To view advertising ROI and calculate customer acquisition costs, import ad spend metrics from marketing channels. You can upload spend data manually via CSV in the dashboard, or bulk upload programmatically using the campaign costs REST API.
          </p>
        </section>

        {/* Endpoint */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            REST API Endpoint
          </h2>
          <Endpoint method="POST" path="/api/campaign-costs/import?site_key=YOUR_SITE_KEY" description="Authenticated via User Session" />
        </section>

        {/* CSV Schema & JSON validation table */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Validation & Database Constraints
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Every row in the uploaded CSV (or object in the JSON request body) must adhere to these rules:
          </p>
          <ParamTable params={[
            { name: 'date', type: 'string', required: true, desc: 'YYYY-MM-DD format. Cannot be a future date.' },
            { name: 'platform', type: 'string', required: true, desc: 'Ad channel name, e.g. google, facebook. Max 50 characters, letters/numbers/dashes/underscores only.' },
            { name: 'campaign_name', type: 'string', required: true, desc: 'Exact name matching your utm_campaign query tag. Max 255 characters.' },
            { name: 'campaign_id', type: 'string', required: false, desc: 'Optional campaign identifier. Max 255 characters.' },
            { name: 'spend', type: 'number', required: true, desc: 'Monetary ad spend. Must be a finite number greater than or equal to 0.' },
            { name: 'currency', type: 'string', required: false, desc: '3-letter currency code (e.g. USD, EUR). Defaults to USD.' },
            { name: 'clicks', type: 'integer', required: false, desc: 'Number of clicks recorded. Must be a non-negative integer.' },
            { name: 'impressions', type: 'integer', required: false, desc: 'Number of impressions. Must be a non-negative integer greater than or equal to clicks.' }
          ]} />
          <DocsCallout type="info">
            <strong>Deduplication:</strong> Cost rows use a composite key: <code>site_id + platform + cost_dedupe_key + period_start</code>. If <code>campaign_id</code> is supplied, it generates as <code>id:campaign_id</code>. Otherwise, it defaults to <code>name:campaign_name</code>. Re-importing matching keys overwrites the existing daily record.
          </DocsCallout>
        </section>

        {/* Copy-Paste Example */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Copy-Paste Examples
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary mb-2">CSV File Format Example</h3>
              <DocsCodeBlock lang="csv">
{`date,platform,campaign_name,campaign_id,spend,currency,clicks,impressions
2026-06-08,facebook,Summer Sale Campaign,fb_cmp_1202,45.50,USD,40,1200
2026-06-08,google,Brand Search,,12.30,USD,12,180`}
              </DocsCodeBlock>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary mb-2">Programmatic Bulk Import (cURL)</h3>
              <DocsCodeBlock lang="bash">
{`curl -X POST "https://api.srctk.com/api/campaign-costs/import?site_key=sk_live_abc123" \\
  -H "Authorization: Bearer YOUR_USER_SESSION_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rows": [
      {
        "date": "2026-06-08",
        "platform": "facebook",
        "campaign_name": "Summer Sale Campaign",
        "campaign_id": "fb_cmp_1202",
        "spend": 45.50,
        "currency": "USD",
        "clicks": 40,
        "impressions": 1200
      }
    ]
  }'`}
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
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"Clicks cannot be greater than impressions"</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">A row contains click counts that exceed the impression count on that platform.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">400 Bad Request</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"Maximum batch size is 1000 rows"</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">The upload array size exceeds the maximum batch limit of 1000 items.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">402 Payment Req</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"Feature manual_spend is not available..."</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">Manual spend imports are locked by your current subscription tier. Upgrade required.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-red-600 dark:text-red-400">401 Unauthorized</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-300">"Unauthorized access"</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-400">Missing or invalid Authorization user token.</td>
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
            Unlike public tracking endpoints, the Campaign Costs API requires a valid user session token (Authorization header) and membership permissions for the target site workspace. Never execute these bulk import requests from public frontend pages.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
