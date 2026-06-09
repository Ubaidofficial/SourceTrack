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
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-48">Attribute / Key</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-24">Type</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-20">Required</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2">Purpose</th>
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

export default function DevelopersTracker() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Tracker SDK Reference | SourceTrack Docs</title>
        <meta name="description" content="Technical details for the SourceTrack frontend tracking script, localStorage parameters, cookies usage, and cookieless modes." />
        <link rel="canonical" href="https://sourcetrack.ai/developers/tracker" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Tracker SDK
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Technical specs of the standard and cookieless browser tracking pixel scripts.
          </p>
        </div>

        {/* Overview */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Overview
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            The SourceTrack frontend SDK captures acquisition metadata (UTM tags, referrer URLs, and ad click identifiers) on page load and route changes. It is available in two modes: standard storage-based tracking (supporting multi-touch attribution) and a fully cookieless privacy-compliant mode.
          </p>
        </section>

        {/* Script Tag Attributes */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Script Attributes
          </h2>
          <ParamTable params={[
            { name: 'data-site-key', type: 'string', required: true, desc: 'Your public Site Key (e.g. st_120983).' },
            { name: 'data-exclude', type: 'string', required: false, desc: 'Comma-separated path globs to prevent tracking on dashboard or staging pages (e.g. "/admin/*, /test/*").' }
          ]} />
        </section>

        {/* Standard Storage-Based Tracker */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Standard Storage-Based Tracker
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            The standard script loads a lightweight IIFE script. By default, it stores three keys in browser storage to track visitors and sessions across page loads:
          </p>
          <div className="overflow-x-auto my-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-4">Key</th>
                  <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-4">Storage Type</th>
                  <th className="text-left text-xs font-semibold text-gray-500 py-2">Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-200">st_aid</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">localStorage</td>
                  <td className="py-2 text-xs text-gray-650 dark:text-gray-400">Anonymous visitor UUID — stable across sessions. Used to stitch journeys.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-200">st_ft_src / med / cmp</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">localStorage</td>
                  <td className="py-2 text-xs text-gray-650 dark:text-gray-400">First-touch UTM acquisition parameters — captured once on first visit.</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/60">
                  <td className="py-2 pr-4 font-mono text-xs text-gray-800 dark:text-gray-200">st_sid</td>
                  <td className="py-2 pr-4 text-xs text-gray-500">sessionStorage</td>
                  <td className="py-2 text-xs text-gray-650 dark:text-gray-400">Session ID — remains stable for the browser tab.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Cookieless Tracking Mode */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Cookieless Tracking Mode
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            For strict GDPR/ePrivacy compliance without consent banners, SourceTrack supports a cookieless script option. Load the cookieless variant:
          </p>
          <DocsCodeBlock lang="html">
{`<script async src="https://api.srctk.com/tracker/tracker.cookieless.js" data-site-key="YOUR_SITE_KEY"></script>`}
          </DocsCodeBlock>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            The cookieless script stores absolutely nothing in the visitor's browser. On loading, it requests <code>GET /api/tracker/id</code>, which returns a visitor hash calculated on the server from:
          </p>
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300">
{`SHA-256( HMAC(daily_salt, UTC-date) : site_key : SHA-256(IP) : SHA-256(UserAgent) )`}
          </pre>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            The raw IP address is <strong>never logged or stored</strong>. The visitor ID rotates every 24 hours (UTC midnight), and the session ID rotates every hour.
          </p>
        </section>

        {/* Path Exclusions */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Path Exclusions (Client-Side)
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            To prevent the tracker from emitting pageview dispatches on admin, dashboard, or staging pages, use the <code>data-exclude</code> attribute directly on the script tag:
          </p>
          <DocsCodeBlock lang="html">
{`<script async src="https://api.srctk.com/tracker/tracker.min.js"
        data-site-key="YOUR_SITE_KEY"
        data-exclude="/admin/*, /checkout/success"></script>`}
          </DocsCodeBlock>
        </section>

        {/* Common Errors */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-850 pb-2">
            Common Errors
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-750 dark:text-gray-355 leading-relaxed">
            <li>
              <strong>Ad Blockers / Brave Shields blocking network requests:</strong> Strict privacy filters can block calls to <code>POST /api/track</code>. Ensure you test inside a clean browser tab or pause blockers.
            </li>
            <li>
              <strong>Content Security Policy (CSP) Directives:</strong> If your website uses strict CSP rules, the browser will block requests to our analytical endpoint. Add <code>connect-src https://api.srctk.com</code> and <code>script-src https://api.srctk.com</code> to your site headers.
            </li>
          </ul>
        </section>

        {/* Security Note */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Security & Privacy Note
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            By default, the SDK captures only anonymous metrics: browser configuration, screen bounds, country (derived on-the-fly from IP without saving raw IP strings), and campaign UTMs. No Personally Identifiable Information (PII) like names, email addresses, or phone numbers is parsed, logged, or recorded.
          </p>
        </section>

        <DocsCallout type="warning">
          <strong>Cookieless Limitation:</strong> Because cookieless mode rotates visitor hashes daily and does not store identity keys in the browser, first-touch attribution is scoped to the active session. Cross-session multi-touch attribution reports require the standard storage-based tracker.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
