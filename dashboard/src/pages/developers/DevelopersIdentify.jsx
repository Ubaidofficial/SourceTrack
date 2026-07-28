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

function MethodSignature({ signature }) {
  return (
    <div className="bg-gray-50 dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg px-4 py-3 my-4">
      <code className="text-sm font-mono text-gray-800 dark:text-gray-200 font-semibold">{signature}</code>
    </div>
  )
}

export default function DevelopersIdentify() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>User Stitching (Identify) SDK Reference | SourceTrack Docs</title>
        <meta name="description" content="Technical details for the user identification method. Stitch anonymous pre-signup visitor paths with post-signup conversions." />
        <link rel="canonical" href="https://www.sourcetrack.ai/developers/identify" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            User Identification
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Stitch anonymous pre-login journeys with registered profile records using the JavaScript SDK.
          </p>
        </div>

        {/* Overview */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Overview
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            When a visitor lands on your site, they are tracked via an anonymous identifier (<code>st_aid</code>). When they register or log in, use the <code>identify</code> method to link their anonymous click history to their permanent account user ID. This ensures historical campaign touchpoints (UTMs, referrers) are correctly associated with future purchases.
          </p>
        </section>

        {/* Method Signature */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Method Signature
          </h2>
          <MethodSignature signature="window.sourcetrack.identify(userId, traits)" />
        </section>

        {/* Parameters */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Parameters
          </h2>
          <ParamTable params={[
            { name: 'userId', type: 'string', required: true, desc: 'Your internal database user ID (e.g. usr_10293) that represents this user.' },
            { name: 'traits', type: 'object', required: false, desc: 'Key-value descriptors representing user details (e.g. plan_tier, signup_date, contact_email).' }
          ]} />
        </section>

        {/* Copy-Paste Example */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Code Example
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Execute this call immediately following a successful login, registration, or form sign-up:
          </p>
          <DocsCodeBlock lang="js">
{`if (window.sourcetrack) {
  window.sourcetrack.identify('usr_99283471', {
    email: 'user@domain.com',
    name: 'John Doe',
    company: 'Acme Corp',
    plan: 'trial'
  });
}`}
          </DocsCodeBlock>
        </section>

        {/* Common Errors */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Errors
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>Calling identify before script load:</strong> Ensure the main pixel has loaded or verify that <code>window.sourcetrack</code> is defined before calling <code>identify</code>.
            </li>
            <li>
              <strong>Passing null/empty strings:</strong> If <code>userId</code> is missing or empty, the alias will not register, preventing future server-side webhook stitching.
            </li>
          </ul>
        </section>

        {/* Security Note */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Security Note
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Do not supply sensitive parameters (like passwords or authorization keys) inside the user's <code>traits</code>. Standard user traits (such as email addresses) are automatically hashed or redacted if configured in your dashboard privacy rules.
          </p>
        </section>

        <DocsCallout type="info">
          After identify is called, server-side conversions sent with user_id can be
          attributed to the visitor's prior anonymous sessions. For best accuracy,
          always send anonymous_id alongside user_id when available. Conversions sent
          with user_id alone before any identify call was made cannot recover past
          anonymous visits.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
