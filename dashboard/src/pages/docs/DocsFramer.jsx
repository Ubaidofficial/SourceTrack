import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsFramer() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Framer Setup Guide | SourceTrack Docs</title>
        <meta name="description" content="Add the SourceTrack tracking pixel to Framer. Learn where to insert custom tracking codes and how to verify page view events." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/platforms/framer" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Framer Setup Recipe
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Integrate the tracking pixel into your Framer site settings to track landing page visitors.
          </p>
        </div>

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This guide is for startups, founders, and designers who build their marketing websites or landing pages on Framer, and want campaign attribution set up in minutes.
          </p>
        </section>

        {/* Glossary Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Key Terms Defined:</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <li><strong>Start of &lt;head&gt;</strong> — a settings text field in Framer that inserts custom HTML scripts at the top of your page before it renders in the browser.</li>
            <li><strong>Single Page Application (SPA)</strong> — a modern website structure (used by Framer) that changes pages instantly without full browser reloads.</li>
          </ul>
        </DocsCallout>

        {/* 2. What you will set up */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            What You Will Set Up
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You will add our pixel script code into the custom code head configuration of your Framer project settings and publish it to launch automatic pageview and referrer tracking.
          </p>
        </section>

        {/* 3. Steps */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Steps: Framer Integration
          </h2>
          
          <ol className="list-decimal pl-5 space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              Log in to your <strong>Framer Dashboard</strong> and open your target project.
            </li>
            <li>
              Click the gear icon in the top toolbar to open <strong>Project Settings</strong>.
            </li>
            <li>
              Go to the <strong>Custom Code</strong> section on the left sidebar.
            </li>
            <li>
              Locate the <strong>Start of &lt;head&gt;</strong> field.
            </li>
            <li>
              Paste the tracking code snippet into the box:
              <DocsCodeBlock lang="html" replaceKey={true} pasteOnce={true}>
{`<script async src="https://api.srctk.com/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
              </DocsCodeBlock>
            </li>
            <li>
              Click <strong>Save</strong>.
            </li>
            <li>
              Click <strong>Publish</strong> in the top right to deploy the code to your live domain.
            </li>
          </ol>
        </section>

        {/* 4. How to verify it worked */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify It Worked
          </h2>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Visit your live published Framer website.</li>
            <li>Open Developer Tools (right-click &rarr; Inspect), click <strong>Network</strong>, and filter by <code>track</code>.</li>
            <li>Refresh the page. Verify a call to <code>POST /api/track</code> completes successfully.</li>
            <li>Since Framer runs as a Single Page Application (SPA), click a navigation link. You should see another network call to <code>POST /api/track</code> trigger instantly without a full page reload.</li>
            <li>Verify visits are recorded in real-time under the <strong>Event Debugger</strong> in your SourceTrack dashboard.</li>
          </ol>
        </section>

        {/* 5. Common mistakes */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>Failing to Publish:</strong> Code changes inside Framer Settings do not take effect until you click <strong>Publish</strong>.
            </li>
            <li>
              <strong>Pasting into Page-Specific Code instead of Project Settings:</strong> Ensure the script is placed inside the global <strong>Project Settings &rarr; Custom Code</strong> area so it tracks across all pages.
            </li>
          </ul>
        </section>

        {/* 6. Next step */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Next Step
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Now that basic pageview tracking is active, configure your conversion triggers for leads or signups by following our{' '}
            <Link to="/developers/conversions" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Browser Conversions guide</Link>.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
