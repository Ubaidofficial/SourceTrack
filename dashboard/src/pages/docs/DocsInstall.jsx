import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsInstall() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Installing the Tracking Script | SourceTrack Docs</title>
        <meta name="description" content="Step-by-step instructions for placing the SourceTrack pixel on your site, verifying it loaded, and what data is captured." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/install" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            Install Script
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Learn how to deploy the tracking pixel on your website and verify data flow.
          </p>
        </div>

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This guide is for website owners, founders, and marketers who want to capture visitor sources (like Google Ads clicks or AI chatbot referrals) and trace them all the way to customer actions. No deep programming experience is required.
          </p>
        </section>

        {/* Glossary Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Key Terms Defined:</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <li><strong>Tracker script</strong> — the small JavaScript code snippet SourceTrack uses to record visits.</li>
            <li><strong>Site key</strong> — the public ID that tells SourceTrack which site the event belongs to.</li>
            <li><strong>Pageview</strong> — an event recorded when a visitor loads or navigates to a page on your site.</li>
          </ul>
        </DocsCallout>

        {/* 2. What you will set up */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            What You Will Set Up
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You will paste our lightweight script into your site's HTML layout. Once installed, it automatically tracks pageviews (including page changes in Single Page Apps), UTM parameters, and ad click identifiers.
          </p>
        </section>

        {/* 3. Steps */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Steps: Copy-Paste Installation
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Paste the tracking script inside the <code>&lt;head&gt;</code> element of your website layout so it executes before other scripts:
          </p>
          <DocsCodeBlock lang="html" replaceKey={true} pasteOnce={true}>
{`<script async src="https://api.srctk.com/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
          </DocsCodeBlock>
        </section>

        {/* What captures section */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            What the Script Captures
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Pageviews:</strong> Recorded on initial load and during subsequent Single Page App (SPA) route changes automatically.</li>
            <li><strong>Acquisition parameters:</strong> UTM parameters (<code>utm_source</code>, <code>utm_medium</code>, <code>utm_campaign</code>, etc.).</li>
            <li><strong>Ad Click IDs:</strong> Google Click ID (<code>gclid</code>, <code>gbraid</code>, <code>wbraid</code>), Facebook Click ID (<code>fbclid</code>), Microsoft Click ID (<code>msclkid</code>), TikTok Click ID (<code>ttclid</code>), LinkedIn Click ID (<code>li_fat_id</code>).</li>
            <li><strong>Referrer information:</strong> Captures the organic search engine, direct entry, or referring site domain.</li>
            <li><strong>Device metadata:</strong> Browser name, operating system, and country (derived safely on the server from the IP address).</li>
          </ul>
        </section>

        {/* 4. How to verify it worked */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify Setup
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You can verify your installation either automatically using the <strong>Setup Doctor</strong> in your dashboard, or manually via your browser's Developer Tools.
          </p>

          <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Option 1: Setup Doctor (Recommended)</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Go to the <strong>Snippet Code</strong> page in your dashboard to view the Setup Doctor card.
            The Setup Doctor helps confirm:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Event Freshness:</strong> Whether SourceTrack received tracking events from your site recently.</li>
            <li><strong>Domain Match:</strong> Whether the domain sending events matches your registered production domain (or flags "test traffic" / "wrong domain" if misconfigured).</li>
            <li><strong>Browser Connection Check:</strong> Whether your browser can reach the SourceTrack API successfully without being blocked by network firewalls.</li>
            <li><strong>Live Pageview Verification:</strong> Generate a temporary test link with a unique <code>st_verify</code> token, then open it in a new tab to check whether a live pageview from your production domain is received.</li>
            <li><strong>Paid Parameters & Conversions:</strong> Checks if UTM parameters or conversion events have been recorded in the last 30 days.</li>
          </ul>

          <DocsCallout type="warning">
            <h4 className="font-extrabold text-amber-900 dark:text-amber-400 mb-1">What Setup Doctor Does Not Prove:</h4>
            <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
              <li>It does not prove every single page on your website has the script installed.</li>
              <li>It does not prove every custom conversion or event trigger is configured.</li>
              <li>Setup Doctor does not validate attribution accuracy.</li>
              <li>It does not prove checkout/revenue attribution is fully configured or running.</li>
            </ul>
          </DocsCallout>

          <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary mt-4">Option 2: Manual Browser Inspection</h3>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Open your live website in a browser.</li>
            <li>Right-click and select <strong>Inspect</strong> to open Developer Tools, then go to the <strong>Network</strong> tab.</li>
            <li>Filter requests by typing <code>track</code> in the filter box.</li>
            <li>Refresh your page. You should see a network request named <code>track</code> go to <code>POST /api/track</code> (returning a <code>{"{ success: true }"}</code> response).</li>
            <li>Go to the <strong>Event Debugger</strong> in your SourceTrack dashboard to see your visit log update in real-time.</li>
          </ol>
        </section>

        {/* 5. Common mistakes */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>Incorrect Site Key:</strong> Double-check that your key matches the exact string shown under Settings in your dashboard.
            </li>
            <li>
              <strong>Failing to Replace the Placeholder:</strong> Make sure you have replaced <code>YOUR_SITE_KEY</code> with your real key in the script.
            </li>
            <li>
              <strong>Ad Blockers / Privacy Shields:</strong> Strict ad blockers or privacy shields during local development may block network requests to our servers, though they are not the only cause of missing events. We recommend testing in a clean browser profile or temporary incognito tab without blockers active.
            </li>
          </ul>
        </section>

        {/* 6. Next step */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Next Step
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Now that the basic pageview tracker is installed, you are ready to configure conversion goals. Move on to the{' '}
            <Link to="/developers/conversions" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Browser Conversions guide</Link> to track signups, purchases, and leads.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
