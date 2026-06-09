import { Helmet } from 'react-helmet-async'
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

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Installation Steps
          </h2>
          
          <ol className="list-decimal pl-5 space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              Log in to your <strong>Framer Dashboard</strong> and open your project.
            </li>
            <li>
              Open the project settings panel (the gear icon on the top toolbar).
            </li>
            <li>
              Navigate to the <strong>General Settings &rarr; Custom Code</strong> card.
            </li>
            <li>
              Locate the <strong>Start of &lt;head&gt;</strong> section.
            </li>
            <li>
              Paste the standard tracking script:
              <DocsCodeBlock lang="html">
{`<!-- Paste in Framer Page Settings -> Custom Code -> Head tag -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
              </DocsCodeBlock>
            </li>
            <li>
              Click <strong>Save</strong> or apply the changes.
            </li>
            <li>
              Click <strong>Publish</strong> in the top right to deploy the updated custom code onto your domain.
            </li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Verifying Framer Pageviews
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Visit your published Framer site, and trigger a few page views. Verify that they appear immediately in the <strong>Event Debugger</strong> in your SourceTrack workspace.
          </p>
        </section>

        <DocsCallout type="info">
          Because Framer sites function as React Single Page Applications (SPAs), page changes without full browser reloads will still trigger pageview dispatches to <code>POST /api/collect</code> automatically.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
