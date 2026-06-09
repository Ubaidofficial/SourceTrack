import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsGTM() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Google Tag Manager Setup Guide | SourceTrack Docs</title>
        <meta name="description" content="Deploy the SourceTrack tracking pixel using Google Tag Manager. Custom HTML tag configurations and triggering rules." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/platforms/google-tag-manager" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Google Tag Manager
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Deploy the SourceTrack tracking pixel site-wide using a Google Tag Manager container.
          </p>
        </div>

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This guide is for marketers and website managers who use Google Tag Manager (GTM) to deploy and organize marketing pixels across their site without editing theme code directly.
          </p>
        </section>

        {/* Glossary Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Key Terms Defined:</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <li><strong>GTM container</strong> — the master script tag you paste on your site that lets you deploy tags from the GTM interface.</li>
            <li><strong>Custom HTML Tag</strong> — a GTM tag type that allows you to copy-paste custom Javascript script code to be injected dynamically.</li>
            <li><strong>Trigger</strong> — a condition in GTM (like "All Pages" or a button click) that dictates when a tag fires.</li>
          </ul>
        </DocsCallout>

        {/* 2. What you will set up */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            What You Will Set Up
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You will create a Custom HTML tag in GTM, paste our helper script, configure it to fire on initialization, and verify using GTM Preview mode.
          </p>
        </section>

        {/* 3. Steps */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Steps: GTM Deployment
          </h2>
          
          <ol className="list-decimal pl-5 space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              <strong>Open GTM:</strong> Log in to your GTM workspace.
            </li>
            <li>
              <strong>Create Tag:</strong> Go to <strong>Tags</strong> and click <strong>New</strong>.
            </li>
            <li>
              <strong>Configure Tag Type:</strong> Click <em>Tag Configuration</em> and choose <strong>Custom HTML</strong>.
            </li>
            <li>
              <strong>Paste Script:</strong> Paste the code below. Remember to change <code>YOUR_SITE_KEY</code> to your actual public key.
              <DocsCodeBlock lang="html" replaceKey={true}>
{`<!-- Paste this inside a Custom HTML Tag in GTM -->
<script>
  (function() {
    if (document.querySelector('script[data-site-key]')) return;
    var script = document.createElement('script');
    script.src = 'https://api.srctk.com/tracker/tracker.min.js';
    script.setAttribute('data-site-key', 'YOUR_SITE_KEY');
    script.async = true;
    document.head.appendChild(script);
  })();
</script>`}
              </DocsCodeBlock>
            </li>
            <li>
              <strong>Configure Triggering:</strong> Click <em>Triggering</em> and select <strong>Initialization - All Pages</strong> (or <strong>All Pages (Page View)</strong> if Initialization is not available).
            </li>
            <li>
              <strong>Save:</strong> Name your tag (e.g. <code>SourceTrack - Base Pixel</code>) and click <strong>Save</strong>.
            </li>
          </ol>
        </section>

        {/* 4. How to verify it worked */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify It Worked
          </h2>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Click <strong>Preview</strong> in the GTM interface. Enter your live website URL and connect GTM Tag Assistant.</li>
            <li>In the Tag Assistant panel, verify that your new <code>SourceTrack - Base Pixel</code> tag has successfully fired.</li>
            <li>Open the browser Developer Tools (Network tab) on your site. Filter for <code>track</code>, reload the page, and confirm a call to <code>POST /api/track</code> completes successfully.</li>
            <li>Verify your pageviews start logging in the SourceTrack dashboard <strong>Event Debugger</strong>.</li>
          </ol>
        </section>

        {/* 5. Common mistakes */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-750 dark:text-gray-350">
            <li>
              <strong>Forgetting to Publish:</strong> Preview mode only works for you. Make sure you click <strong>Submit &rarr; Publish</strong> in GTM so the tag is deployed for all your users.
            </li>
            <li>
              <strong>Content Security Policy (CSP) Restrictions:</strong> If your server enforces a CSP, it may block GTM from injecting external scripts. Ensure <code>https://api.srctk.com</code> is allowlisted in your CSP headers under <code>script-src</code> and <code>connect-src</code>.
            </li>
          </ul>
        </section>

        {/* 6. Next step */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Next Step
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You're ready to configure conversions. If you want to track conversion events (like form submissions or button clicks) using GTM triggers, see our{' '}
            <Link to="/developers/conversions" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Browser Conversions guide</Link>.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
