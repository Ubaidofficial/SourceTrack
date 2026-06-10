import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
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

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This guide is for bloggers, businesses, and creators running WordPress sites who want to establish attribution and track visitor campaigns site-wide.
          </p>
        </section>

        {/* Glossary Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Key Terms Defined:</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <li><strong>WP Admin</strong> — the backend dashboard where you manage plugins, write pages, and configure your site settings.</li>
            <li><strong>Theme header (header.php)</strong> — the PHP template file that defines the top section of your site, including code placed inside the HTML <code>&lt;head&gt;</code> tags.</li>
            <li><strong>Caching</strong> — storing static versions of your pages to speed up load times. When you edit code, you must clear the cache to show updates.</li>
          </ul>
        </DocsCallout>

        {/* 2. What you will set up */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            What You Will Set Up
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You will install our pixel code either via a header injection plugin (recommended) or manually inside your active theme's template.
          </p>
        </section>

        {/* 3. Steps */}
        <section className="space-y-6">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Steps: WordPress Integration
          </h2>

          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">Option 1: Using a Plugin (Recommended)</h3>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>Log in to your WordPress Admin dashboard.</li>
              <li>Go to <strong>Plugins &rarr; Add New</strong> and search for <strong>WPCode</strong> (or any "Insert Headers and Footers" plugin).</li>
              <li>Install and activate the plugin.</li>
              <li>Navigate to the plugin settings and paste this code snippet in the <strong>Header</strong> section:
                <DocsCodeBlock lang="html" replaceKey={true} pasteOnce={true}>
{`<script async src="https://api.srctk.com/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
                </DocsCodeBlock>
              </li>
              <li>Click <strong>Save Changes</strong>.</li>
            </ol>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">Option 2: Direct Theme Edit</h3>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-750 dark:text-gray-300">
              <li>Log in to your file manager or theme editor and open <code>wp-content/themes/your-active-theme/header.php</code>.</li>
              <li>Paste the script directly before the closing <code>&lt;/head&gt;</code> tag:
                <DocsCodeBlock lang="php" replaceKey={true} pasteOnce={true}>
{`<script async src="https://api.srctk.com/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
                </DocsCodeBlock>
              </li>
              <li>Save the file.</li>
            </ol>
            <DocsCallout type="warning">
              <strong>Warning:</strong> Direct modifications to theme files will be overwritten when the theme updates. We strongly recommend using child themes or Option 1 (WPCode plugin).
            </DocsCallout>
          </div>
        </section>

        {/* 4. How to verify it worked */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify It Worked
          </h2>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Visit your WordPress website.</li>
            <li>Open Developer Tools (right-click &rarr; Inspect), click <strong>Network</strong>, and filter by <code>track</code>.</li>
            <li>Refresh the page. Verify a call to <code>POST /api/track</code> completes successfully.</li>
            <li>Confirm your browser visits appear in the SourceTrack dashboard <strong>Event Debugger</strong>.</li>
          </ol>
        </section>

        {/* 5. Common mistakes */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-750 dark:text-gray-350">
            <li>
              <strong>Active Cache Blocker:</strong> If you use cache plugins (e.g. WP Rocket, W3 Total Cache, Autoptimize), you must clear your site cache after saving changes. Otherwise, visitors will continue loading the old HTML page without the script.
            </li>
            <li>
              <strong>Minification Exclusions:</strong> If your caching plugin bundles JavaScript, it may break script loading. Exclude <code>tracker.min.js</code> from minification / defer lists if errors occur in your browser console.
            </li>
          </ul>
        </section>

        {/* 6. Next step */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Next Step
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Setup is complete! You can now track custom conversion goals (like contact form submits or checkout buy clicks) by reviewing the{' '}
            <Link to="/developers/conversions" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Browser Conversions guide</Link>.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
