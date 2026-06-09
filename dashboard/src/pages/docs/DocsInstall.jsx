import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsInstall() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Installing the Tracking Script | SourceTrack Docs</title>
        <meta name="description" content="Step-by-step instructions for placing the SourceTrack pixel on your site, verifying it loaded, and what data is captured." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/install" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Install Script
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Learn how to deploy the tracking pixel on your website and verify data flow.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Copy-Paste Installation
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            The standard tracking script should be loaded on every page of your site. Paste the script tag in the <code>&lt;head&gt;</code> layout of your pages so it captures search referral signals before page transition scripts execute.
          </p>
          <DocsCodeBlock lang="html">
{`<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
          </DocsCodeBlock>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            What the Script Captures
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Once loaded, the pixel script automatically records:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Pageviews:</strong> Recorded on initial load and during subsequent history-based Single Page App (SPA) route changes.</li>
            <li><strong>Acquisition parameters:</strong> UTM query parameters (<code>utm_source</code>, <code>utm_medium</code>, <code>utm_campaign</code>, <code>utm_term</code>, <code>utm_content</code>).</li>
            <li><strong>Ad Click IDs:</strong> Google Click ID (<code>gclid</code>, <code>gbraid</code>, <code>wbraid</code>), Facebook Click ID (<code>fbclid</code>), Microsoft Click ID (<code>msclkid</code>), TikTok Click ID (<code>ttclid</code>), LinkedIn Click ID (<code>li_fat_id</code>), Twitter Click ID (<code>twclid</code>).</li>
            <li><strong>Referrer information:</strong> Captures the organic search engine, direct entry, or referring site domain.</li>
            <li><strong>Device metadata:</strong> Browser name, operating system, layout viewport width/height, country (derived on the server from the IP address).</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify
          </h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Open your live website in a browser.</li>
            <li>Right-click and select <strong>Inspect</strong> to open Developer Tools, then go to the <strong>Network</strong> tab.</li>
            <li>Filter requests by <code>collect</code> or <code>tracker</code>. You should see a successful network dispatch to <code>POST /api/collect</code> (returning a <code>{"{ success: true }"}</code> JSON body).</li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-750 dark:text-gray-300">
            <li>
              <strong>Incorrect Site Key:</strong> Double-check that your key matches the exact string shown under Settings in your dashboard.
            </li>
            <li>
              <strong>Failing to Replace the Placeholder:</strong> Make sure you have replaced <code>YOUR_SITE_KEY</code> with your real key in the script.
            </li>
            <li>
              <strong>Ad Blockers / Privacy Settings:</strong> If you use a strict blocker during development, the network request to our analytics collection servers might be blocked. Configure exceptions or test in a clean browser profile.
            </li>
          </ul>
        </section>

        <DocsCallout type="info">
          Want to track traffic without using client-side cookies or storage under GDPR regulations? Read our{' '}
          <Link to="/developers/tracker" className="underline font-bold">Cookieless Mode documentation</Link>.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
