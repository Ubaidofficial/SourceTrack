import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

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
                  <td className="py-2 text-xs text-gray-650 dark:text-gray-400">Anonymous visitor UUID — stable across sessions.</td>
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

        <DocsCallout type="warning">
          <strong>Cookieless Limitation:</strong> Because cookieless mode rotates visitor hashes daily and does not store identity keys in the browser, first-touch attribution is scoped to the active session. Cross-session multi-touch attribution reports require the standard storage-based tracker.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
