import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsQuickstart() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Quickstart Guide — 5-Minute Setup | SourceTrack Docs</title>
        <meta name="description" content="Set up SourceTrack in 5 minutes. Learn how to install the script, verify pageviews, and test conversions." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/quickstart" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Quickstart Guide
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Get up and running with SourceTrack in 5 minutes.
          </p>
        </div>

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This guide is for founders, marketers, ecommerce store owners, and developers who want to set up conversion tracking on their website from scratch in under five minutes.
          </p>
        </section>

        {/* Glossary Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Key Terms Defined:</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <li><strong>Site key</strong> — the public ID that tells SourceTrack which site the event belongs to.</li>
            <li><strong>Tracker script</strong> — the small JavaScript snippet SourceTrack uses to record visits.</li>
            <li><strong>Pageview</strong> — an event recorded when a visitor loads a page on your site.</li>
            <li><strong>Conversion</strong> — a signup, lead, purchase, booked call, or other action you care about.</li>
          </ul>
        </DocsCallout>

        {/* 2. What you will set up */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            What You Will Set Up
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You will configure a site profile in the dashboard, retrieve your unique tracking key, install the lightweight snippet on your website, and trigger a test conversion event to ensure attribution works end-to-end.
          </p>
        </section>

        {/* 3. Steps */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Steps: The 5-Minute Checklist
          </h2>

          <ol className="list-decimal pl-5 space-y-6 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              <h4 className="font-extrabold text-gray-900 dark:text-white inline-block">Create a Site Profile</h4>
              <p className="mt-1">
                Log in to the dashboard, click on your site profile selector in the sidebar, and select <strong>Add New Site</strong>. Enter your domain name and choose your primary currency.
              </p>
            </li>

            <li>
              <h4 className="font-extrabold text-gray-900 dark:text-white inline-block">Copy your Site Key</h4>
              <p className="mt-1">
                Go to the Settings page in your dashboard. Under the Site Settings tab, copy your unique public <strong>Site Key</strong> (which starts with <code>st_</code>).
              </p>
            </li>

            <li>
              <h4 className="font-extrabold text-gray-900 dark:text-white inline-block">Install the Tracker Script</h4>
              <p className="mt-1">
                Paste this code snippet before the closing <code>&lt;/head&gt;</code> tag of your website. Replace <code>YOUR_SITE_KEY</code> with your real key.
              </p>
              <DocsCodeBlock lang="html" replaceKey={true} pasteOnce={true}>
{`<script async src="https://api.srctk.com/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
              </DocsCodeBlock>
            </li>

            <li>
              <h4 className="font-extrabold text-gray-900 dark:text-white inline-block">Visit your Website</h4>
              <p className="mt-1">
                Open a new browser tab, go to your live website, and click around a few pages to trigger pageview events.
              </p>
            </li>

            <li>
              <h4 className="font-extrabold text-gray-900 dark:text-white inline-block">Verify your First Pageview</h4>
              <p className="mt-1">
                Return to the SourceTrack dashboard. Go to the Event Debugger or Dashboard view. You should see your visit appear in real-time, showing which browser and country you came from.
              </p>
            </li>

            <li>
              <h4 className="font-extrabold text-gray-900 dark:text-white inline-block">Trigger a Test Conversion</h4>
              <p className="mt-1">
                To test conversion attribution, trigger an action on your website that fires a conversion call. For example, paste this in your browser console:
              </p>
              <DocsCodeBlock lang="js">
{`window.sourcetrack.conversion({
  value: 49.00,
  type: 'test_conversion',
  order_id: 'TEST_' + Date.now()
});`}
              </DocsCodeBlock>
            </li>

            <li>
              <h4 className="font-extrabold text-gray-900 dark:text-white inline-block">Check your Reports</h4>
              <p className="mt-1">
                Verify that the test conversion appears in the Event Debugger and Report Builder under your designated conversion type.
              </p>
            </li>
          </ol>
        </section>

        {/* 4. How to verify it worked */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify It Worked
          </h2>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Visit your website with your browser's Developer Tools open (Network tab).</li>
            <li>Filter the network requests by typing <code>track</code>.</li>
            <li>Verify that a network request to <code>POST /api/track</code> executes and returns a success status.</li>
            <li>Confirm that the event appears in the <strong>Event Debugger</strong> in your SourceTrack dashboard.</li>
          </ol>
        </section>

        {/* 5. Common mistakes */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-750 dark:text-gray-350">
            <li>
              <strong>Pasting script in the footer:</strong> The tracking script should go in the <code>&lt;head&gt;</code> section so that pageviews and acquisition details are captured before the visitor exits.
            </li>
            <li>
              <strong>Using ad blockers during test:</strong> Strict privacy filters can block requests to our analytical endpoint. Pause ad blockers or use a private window for verification.
            </li>
          </ul>
        </section>

        {/* 6. Next step */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Next Step
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Setup is complete! Read our{' '}
            <Link to="/docs/platforms/shopify" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Platform integration recipes</Link> to connect your content systems and store carts.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
