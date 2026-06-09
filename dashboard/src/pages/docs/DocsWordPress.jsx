import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsWordPress() {
  return (
    <DocsLayout>
      <Helmet>
        <title>WordPress Setup Guide | SourceTrack Docs</title>
        <meta name="description" content="Add the SourceTrack tracking pixel to WordPress manually or via header injection plugins. Learn how to troubleshoot caching issues." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/platforms/wordpress" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            WordPress Setup Recipe
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Integrate the tracking pixel into your WordPress site to capture visitors site-wide.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Setup Option 1: Header/Footer Plugin (Recommended)
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            The easiest and safest way to add the snippet is using a header injection plugin:
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Log in to your WordPress Admin dashboard.</li>
            <li>Go to <strong>Plugins</strong> &rarr; <strong>Add New</strong>, and search for <em>"WPCode"</em> or <em>"Insert Headers and Footers"</em>.</li>
            <li>Install and activate the plugin.</li>
            <li>Navigate to the plugin settings and paste the following snippet in the <strong>Header</strong> section:</li>
          </ol>
          <DocsCodeBlock lang="html">
{`<!-- Paste in Header configuration section -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
          </DocsCodeBlock>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Save settings to apply the script site-wide.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Setup Option 2: Manual Theme Edit
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            If you prefer editing theme templates directly:
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Log in to your FTP or file manager and open <code>wp-content/themes/your-active-theme/header.php</code>.</li>
            <li>Paste the tracking script before the closing <code>&lt;/head&gt;</code> tag:</li>
          </ol>
          <DocsCodeBlock lang="php">
{`<!-- Paste in wp-content/themes/your-theme/header.php before </head> -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
          </DocsCodeBlock>
          <DocsCallout type="warning">
            Note: If you update your theme in the future, these manual modifications will be overwritten. We recommend using a child theme or Option 1.
          </DocsCallout>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Cache & Optimization Troubleshooting
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            If pageviews are not showing up, the script might be blocked by optimization plugins:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>W3 Total Cache / WP Rocket:</strong> Clear all site caches after inserting the script to ensure the server delivers the updated HTML output.
            </li>
            <li>
              <strong>Autoptimize / WP Super Cache:</strong> Exclude <code>tracker.min.js</code> from JavaScript minification or concatenation options if they throw scripts load order errors.
            </li>
          </ul>
        </section>
      </div>
    </DocsLayout>
  )
}
