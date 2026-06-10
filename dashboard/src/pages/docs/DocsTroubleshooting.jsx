import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCallout from '../../components/docs/DocsCallout'

const TROUBLESHOOTING_ITEMS = [
  {
    symptom: 'No pageviews are showing up in the dashboard',
    cause: 'The site key is incorrect, the script is not loading, or an ad blocker is suppressing the endpoint.',
    fix: 'Verify that the script tag exists in your HTML source and contains the exact Site Key from settings. Check the browser Console and Network tabs for blocks. Turn off strict ad blockers during testing.',
    verify: 'Look for the "track" network request returning a 200 success response.'
  },
  {
    symptom: 'Missing conversion events',
    cause: 'The conversion script was fired before the window.sourcetrack object finished loading, or the script tag did not fire on the thank-you/success page.',
    fix: 'Wrap your conversion script in a load event listener or check that it executes after the main script loads. Ensure the tracking script is installed on the checkout confirmation page.',
    verify: 'Paste a manual conversion call into the browser Console on your checkout page and verify it appears in the Event Debugger.'
  },
  {
    symptom: 'Duplicate conversion counts',
    cause: 'The conversion script is fired multiple times (e.g., when the user refreshes the thank-you page).',
    fix: 'Pass a unique, stable order_id parameter (such as the order number or payment intent ID) in your conversion options body. SourceTrack will automatically skip duplicate payloads containing the same order_id.',
    verify: 'Trigger the event twice in your console. The first should return success, and the second should be logged as deduplicated.'
  },
  {
    symptom: 'Traffic shows as "Direct/None" instead of organic/referral',
    cause: 'The referrer header was stripped when transitioning from HTTPS to HTTP, or the traffic is coming from a private window/ad-network click without UTM parameters.',
    fix: 'Ensure your site has HTTPS enabled and uses appropriate Referrer-Policy headers. Ensure you use standard UTM campaign variables for custom acquisition campaigns.',
    verify: 'Inspect the document.referrer value in the console on initial page entry to verify it is not empty.'
  },
  {
    symptom: 'Shopify order revenue does not stitch to journeys',
    cause: 'The st_aid attribute was not successfully saved on the Shopify cart object, or the Shopify webhook HMAC check failed.',
    fix: 'Ensure your theme files update the cart attributes successfully before the customer reaches checkout. Check that your Shopify webhook url is configured with the correct site key.',
    verify: 'Add items to your cart, fetch the cart JSON (yoursite.com/cart.json), and verify that "st_aid" exists inside the attributes object.'
  },
  {
    symptom: 'Stripe webhook payments do not stitch to journeys',
    cause: 'The st_aid metadata parameter was not forwarded in the Checkout Session or Customer object creation call.',
    fix: 'Verify your backend API code is extracting "st_aid" from requests and passing it in the metadata configurations of the Stripe object creation.',
    verify: 'Inspect the Checkout Session object in your Stripe Dashboard logs to verify that the metadata contains the correct st_aid value.'
  }
]

export default function DocsTroubleshooting() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Troubleshooting Ingestion & Setup Issues | SourceTrack Docs</title>
        <meta name="description" content="Symptom, cause, and fix checklist for resolving missing pageviews, unstitched conversions, and duplicate revenue counts." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/troubleshooting" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Troubleshooting Guide
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Resolve common pageview, conversion, and stitching issues.
          </p>
        </div>

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This guide is for developers, founders, and marketers looking to diagnose issues with missing pageviews, unstitched conversions, or webhook errors.
          </p>
        </section>

        {/* Glossary Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Key Terms Defined:</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <li><strong>Developer Tools</strong> — the inspect panel inside modern browsers used to view console logs and inspect network payloads.</li>
            <li><strong>Console</strong> — the command-line interface inside Developer Tools where errors are logged and manual code can be run.</li>
            <li><strong>Event Debugger</strong> — the real-time event log inside the SourceTrack dashboard showing raw events as they hit our servers.</li>
          </ul>
        </DocsCallout>

        {/* 2. What you will set up */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            What You Will Diagnose
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You will inspect your browser network logs, review dashboard event updates, verify API responses, and run quick browser tests to solve tracking discrepancies.
          </p>
        </section>

        {/* 3. Steps / Symptom Checklist */}
        <section className="space-y-6">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Symptoms and Solutions
          </h2>

          <div className="space-y-6">
            {TROUBLESHOOTING_ITEMS.map((item, idx) => (
              <div key={idx} className="p-5 bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-gray-800 rounded-xl space-y-3">
                <h3 className="text-sm font-extrabold text-[#E54545] flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">Symptom:</span>
                  <span>{item.symptom}</span>
                </h3>

                <div className="text-xs space-y-1.5 pl-6 text-gray-700 dark:text-gray-400">
                  <p><strong>Likely Cause:</strong> {item.cause}</p>
                  <p><strong>Fix:</strong> {item.fix}</p>
                  <p><strong>How to Verify:</strong> {item.verify}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. How to verify it worked */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify Success
          </h2>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Make your target changes (updating theme files, clearing caching systems, or adjusting metadata configurations).</li>
            <li>Clear your browser data or load the site inside an incognito/private tab to bypass local caches.</li>
            <li>Open your browser Developer Tools (Network Tab) and filter for <code>track</code>.</li>
            <li>Perform the action (loading a page, clicking a button) and verify the request exits successfully.</li>
          </ol>
        </section>

        {/* 5. Common mistakes */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Troubleshooting Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-750 dark:text-gray-350">
            <li>
              <strong>Testing behind active proxy profiles:</strong> VPNs or corporate firewalls can occasionally filter incoming analytic endpoints. Test on standard connections or home networks.
            </li>
            <li>
              <strong>Ignoring CSS/Theme caches:</strong> Caching systems (like WordPress plugins, Shopify edge networks, or Cloudflare proxies) may hold onto outdated tracking scripts. Always clear caches after making script changes.
            </li>
          </ul>
        </section>

        {/* 5b. Cookieless mode trade-offs */}
        <section id="cookieless" className="space-y-3 scroll-mt-20">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Cookieless Mode: Attribution Trade-offs
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Cookieless mode is more privacy-friendly but less persistent than the standard tracker. Visitor IDs are derived server-side via a daily-rotating salted hash and are not stored in the browser at all.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              <strong>Visitor ID request can be blocked.</strong> The cookieless tracker fetches its visitor id from <code>/api/tracker/id</code> on every page load. If an ad-blocker, corporate proxy, or transient network failure blocks that request, the tracker falls back to a session-only random id and writes a one-line warning to the browser DevTools console: <code>[SourceTrack] Cookieless visitor ID … using a session-only fallback id</code>.
            </li>
            <li>
              <strong>Same-session only when the fallback fires.</strong> A visitor whose id resets cannot be connected across sessions. Their later conversion may be recorded as <em>direct</em> because no prior pageview is linked to the new id. Attribution may become same-session only or weaker depending on browser and network behavior.
            </li>
            <li>
              <strong>First-touch is in-memory only.</strong> The cookieless tracker holds the first-touch source for the active page session only. It is not preserved across page reloads.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            If you need full multi-session attribution, switch off cookieless mode in <Link to="/settings" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Settings</Link> and use the standard tracker, which stores a stable id in <code>localStorage</code>.
          </p>
        </section>

        {/* 6. Next step */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Next Step
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Troubleshooting resolved? Return to the{' '}
            <Link to="/docs" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">User Docs hub</Link> to configure additional platform integrations.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
