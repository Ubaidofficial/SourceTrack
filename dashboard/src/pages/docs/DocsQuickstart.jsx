import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsQuickstart() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Quickstart Guide — 5-Minute Checklist | SourceTrack Docs</title>
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

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            The 5-Minute Checklist
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
                Go to the Settings page in your dashboard. Under the Site Settings tab, copy your unique public <strong>Site Key</strong> (which looks like `st_...`).
              </p>
            </li>

            <li>
              <h4 className="font-extrabold text-gray-900 dark:text-white inline-block">Install the Tracker Script</h4>
              <p className="mt-1">
                Paste the following code snippet before the closing <code>&lt;/head&gt;</code> tag of your website. Make sure to replace <code>YOUR_SITE_KEY</code> with the Site Key you copied in Step 2.
              </p>
              <DocsCodeBlock lang="html">
{`<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
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

        <DocsCallout type="info">
          Need step-by-step setup guides for GTM, Webflow, WordPress, or Framer? Head over to our{' '}
          <Link to="/docs" className="underline font-bold">Platform setup guides</Link>.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
