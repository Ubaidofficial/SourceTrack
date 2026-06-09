import { Helmet } from 'react-helmet-async'
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

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Step-by-Step GTM Deployment
          </h2>
          
          <ol className="list-decimal pl-5 space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              <strong>Open GTM:</strong> Log in to your Google Tag Manager account and select your container.
            </li>
            <li>
              <strong>Create a New Tag:</strong> Navigate to <strong>Tags</strong> on the left panel and click <strong>New</strong>.
            </li>
            <li>
              <strong>Configure Tag Type:</strong> Click inside the <em>Tag Configuration</em> card and choose <strong>Custom HTML</strong>.
            </li>
            <li>
              <strong>Paste the Snippet:</strong> Paste the following snippet into the HTML text area. Remember to change <code>YOUR_SITE_KEY</code> to your actual public key.
              <DocsCodeBlock lang="html">
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
              <strong>Set the Trigger:</strong> Click inside the <em>Triggering</em> card and choose <strong>Initialization - All Pages</strong> or <strong>All Pages (Page View)</strong>.
            </li>
            <li>
              <strong>Save:</strong> Name the tag (e.g. <code>SourceTrack Pixel</code>) and click <strong>Save</strong>.
            </li>
            <li>
              <strong>Preview and Test:</strong> Click the <strong>Preview</strong> button in the top right to verify that the tag fires successfully on your domain using GTM Tag Assistant.
            </li>
            <li>
              <strong>Publish:</strong> Submit and publish your changes to deploy the pixel live.
            </li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Triggering a Custom Conversion via GTM
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            To trigger conversion events via GTM triggers (such as form submissions or clicks):
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Create a new <strong>Custom HTML Tag</strong>.</li>
            <li>Paste the conversion snippet into the HTML box:
              <DocsCodeBlock lang="js">
{`<script>
  if (window.sourcetrack) {
    window.sourcetrack.conversion({
      value: 0, // Set dynamic transaction values if available in your GTM datalayer
      type: 'gtm_lead',
      order_id: 'GTM_' + Date.now()
    });
  }
</script>`}
              </DocsCodeBlock>
            </li>
            <li>Configure the trigger for your target form submission or button click, and save the tag.</li>
          </ul>
        </section>

        <DocsCallout type="warning">
          If your website enforces a Content Security Policy (CSP), ensure you allow GTM to fetch scripts from <code>https://api.srctk.com</code> and execute inline tags.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
