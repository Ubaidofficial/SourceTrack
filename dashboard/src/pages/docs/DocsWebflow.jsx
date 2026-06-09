import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsWebflow() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Webflow Setup Guide | SourceTrack Docs</title>
        <meta name="description" content="Add the SourceTrack tracking pixel to Webflow sites. Step-by-step custom code integration and page view triggers." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/platforms/webflow" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Webflow Setup Recipe
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Integrate the tracking pixel into your Webflow site settings to track visitors site-wide.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Installation Steps
          </h2>
          
          <ol className="list-decimal pl-5 space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              Log in to your <strong>Webflow Dashboard</strong> and locate the target website project.
            </li>
            <li>
              Click on the project settings (the gear icon next to your site preview) to open <strong>Site Settings</strong>.
            </li>
            <li>
              Navigate to the <strong>Custom Code</strong> tab in the settings menu.
            </li>
            <li>
              Scroll to the <strong>Head Code</strong> section and paste the following snippet:
              <DocsCodeBlock lang="html">
{`<!-- Paste in Webflow Page Settings -> Custom Code -> Head Code -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
              </DocsCodeBlock>
            </li>
            <li>
              Click <strong>Save Changes</strong> at the top right of the dashboard.
            </li>
            <li>
              Click <strong>Publish</strong> and publish your site to your domain configurations to make the changes live.
            </li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Verifying Webflow Pageviews
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Visit your live Webflow website domain. Check the <strong>Event Debugger</strong> in your SourceTrack workspace. You should see incoming pageviews displaying the correct pathnames instantly.
          </p>
        </section>

        <DocsCallout type="info">
          If you have custom contact forms or demo scheduler embeds (like Calendly) on Webflow, check the{' '}
          <a href="/docs/quickstart" className="underline font-bold">Quickstart Conversion Section</a> for instructions on tracking conversion triggers.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
