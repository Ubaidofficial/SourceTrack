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

export default function DevelopersCampaignCosts() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Campaign Cost CSV & API Reference | SourceTrack Docs</title>
        <meta name="description" content="Technical details for importing ad costs, clicks, and impressions. CSV format validation rules, deduplication indexing, and API ingestion endpoints." />
        <link rel="canonical" href="https://sourcetrack.ai/developers/campaign-costs" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Campaign Cost Imports
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Import ad campaign clicks, impressions, and spend data for ROI, CPC, and ROAS calculations.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            CSV Schema Format
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            CSV imports require a header row and must match the following format precisely:
          </p>
          <DocsCodeBlock lang="csv">
{`date,platform,campaign_name,campaign_id,spend,currency,clicks,impressions
2026-06-08,facebook,Summer Sale Campaign,fb_cmp_1202,45.50,USD,40,1200
2026-06-08,google,Brand Search,,12.30,USD,12,180`}
          </DocsCodeBlock>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Validation & Database Constraints
          </h2>
          <ParamTable params={[
            { name: 'date', type: 'string', required: true, desc: 'YYYY-MM-DD format. Cannot be a future date.' },
            { name: 'platform', type: 'string', required: true, desc: 'Alphanumeric lowercase string, max 50 chars (e.g. google, facebook).' },
            { name: 'campaign_name', type: 'string', required: true, desc: 'Exact name used in the utm_campaign parameter to resolve matching, max 255 chars.' },
            { name: 'campaign_id', type: 'string', required: false, desc: 'Optional campaign identifier. Max 255 chars.' },
            { name: 'spend', type: 'number', required: true, desc: 'Spend value. Must be a non-negative number.' },
            { name: 'currency', type: 'string', required: false, desc: '3-letter currency code (e.g. USD, EUR). Defaults to USD.' },
            { name: 'clicks', type: 'integer', required: false, desc: 'Must be a non-negative integer.' },
            { name: 'impressions', type: 'integer', required: false, desc: 'Must be a non-negative integer and greater than or equal to clicks.' }
          ]} />
          <DocsCallout type="info">
            <strong>Deduplication:</strong> SourceTrack implements a database unique index on <code>site_id + platform + cost_dedupe_key + period_start</code>. If <code>campaign_id</code> is provided, the key is hashed as <code>id:campaign_id</code>. Otherwise, it hashes as <code>name:campaign_name</code>. Re-importing a row with the same key overwrites the existing record (upsert).
          </DocsCallout>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            REST API Cost Import
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Bulk upload costs programmatically to the backend receiver endpoint. Authenticated via User token header.
          </p>
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300">
{`POST /api/campaign-costs/import
Authorization: Bearer <user_access_token>
Content-Type: application/json`}
          </pre>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Request body is an object containing a list of objects under the <code>costs</code> key, matching the CSV parameter structure.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
