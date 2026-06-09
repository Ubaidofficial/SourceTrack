import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCallout from '../../components/docs/DocsCallout'

const TROUBLESHOOTING_ITEMS = [
  {
    symptom: 'No pageviews are showing up in the dashboard',
    cause: 'The site key is incorrect, the script is not loading, or an ad blocker is suppressing the endpoint.',
    fix: 'Verify that the script tag exists in your HTML source and contains the exact Site Key from settings. Check the browser Console and Network tabs for blocks. Turn off strict ad blockers during testing.',
    verify: 'Look for the "collect" network request returning a 200 success response.'
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

        <section className="space-y-6">
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
        </section>

        <DocsCallout type="info">
          Still having issues? Contact our technical team at{' '}
          <a href="mailto:support@sourcetrack.ai" className="underline font-bold">support@sourcetrack.ai</a> and provide your site domain and configuration snapshots.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
