import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsWebflow() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Webflow Setup Guide | SourceTrack Docs</title>
        <meta name="description" content="Add the SourceTrack tracking pixel to Webflow sites. Step-by-step custom code integration and page view triggers." />
        <link rel="canonical" href="https://www.sourcetrack.ai/docs/webflow" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            Webflow Setup Recipe
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Integrate the tracking pixel into your Webflow site settings to track visitors site-wide.
          </p>
        </div>

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This guide is for designers and marketers who build and manage websites using Webflow, and want to quickly add first-party conversion tracking without needing to code.
          </p>
        </section>

        {/* Glossary Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Key Terms Defined:</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <li><strong>Head Code</strong> — a settings panel in Webflow where you can inject custom scripts that run before the webpage's body contents load.</li>
            <li><strong>Site-wide</strong> — code that runs on every page of your domain (e.g. landing pages, blog posts, contact pages).</li>
          </ul>
        </DocsCallout>

        {/* 2. What you will set up */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            What You Will Set Up
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You will add our base tracking snippet into your Webflow dashboard settings and publish the changes to establish standard pageview and acquisition parameter tracking.
          </p>
        </section>

        {/* 3. Steps */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Steps: Webflow Integration
          </h2>
          
          <ol className="list-decimal pl-5 space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              Log in to your <strong>Webflow Dashboard</strong> and open your site settings.
            </li>
            <li>
              Navigate to the <strong>Custom Code</strong> tab in the settings menu.
            </li>
            <li>
              Scroll to the <strong>Head Code</strong> section and paste the following snippet:
              <DocsCodeBlock lang="html" replaceKey={true} pasteOnce={true}>
{`<script async src="https://api.srctk.com/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
              </DocsCodeBlock>
            </li>
            <li>
              Click <strong>Save Changes</strong>.
            </li>
            <li>
              Click <strong>Publish</strong> at the top right of your Webflow editor to make the tracking pixel active on your live domain.
            </li>
          </ol>
        </section>

        {/* 4. How to verify it worked */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify It Worked
          </h2>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Visit your live Webflow website.</li>
            <li>Open Developer Tools (right-click &rarr; Inspect), click the <strong>Network</strong> tab, and filter by typing <code>track</code>.</li>
            <li>Refresh the page and check that a successful call to <code>POST /api/track</code> executes.</li>
            <li>Verify incoming pageviews appear instantly in the SourceTrack dashboard <strong>Event Debugger</strong>.</li>
          </ol>
        </section>

        {/* 5. Common mistakes */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>Forgetting to Publish:</strong> Webflow custom code settings are only deployed when you click the <strong>Publish</strong> button in Webflow.
            </li>
            <li>
              <strong>Pasting in Footer Code instead of Head:</strong> Ensure the script is placed inside the <strong>Head Code</strong> box so acquisition signals are loaded before page view behaviors begin.
            </li>
          </ul>
        </section>

        {/* 6. Next step */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Next Step
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Now that base tracking is active, set up conversion triggers for forms, button clicks, or demo calendars. Refer to our{' '}
            <Link to="/developers/conversions" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Browser Conversions guide</Link> for recipes.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
