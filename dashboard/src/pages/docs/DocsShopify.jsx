import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsShopify() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Shopify Manual Revenue Attribution Recipe | SourceTrack Docs</title>
        <meta name="description" content="Integrate Shopify manually with SourceTrack. Storefront pixel setup and order conversion webhooks to stitch customer journeys." />
        <link rel="canonical" href="https://www.sourcetrack.ai/docs/shopify" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            Shopify Manual Revenue Attribution Recipe
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Connect your Shopify storefront and order revenue to SourceTrack using manual snippet placement and Shopify webhooks.
          </p>
        </div>

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This guide is for eCommerce developers and shop owners using Shopify who want to track marketing campaigns and attribute purchases back to click channels (like Google Ads or AI referrals) using custom code and Shopify webhook triggers.
          </p>
        </section>

        {/* Glossary Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Key Terms Defined:</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <li><strong>Theme Liquid (theme.liquid)</strong> — the layout file in your Shopify theme that wraps all pages.</li>
            <li><strong>Cart attributes</strong> — custom metadata fields stored on a Shopify cart. We use this to save the anonymous visitor ID (<code>st_aid</code>) so it flows into the final order.</li>
            <li><strong>Webhook</strong> — an automatic server message sent by Shopify when an action occurs (like <code>orders/paid</code>).</li>
            <li><strong>HMAC validation</strong> — a cryptographic handshake that confirms the webhook message was really sent by Shopify.</li>
          </ul>
        </DocsCallout>

        {/* 2. What you will set up */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            What You Will Set Up
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You will set up storefront visitor tracking by injecting our pixel, save the visitor ID as a cart attribute, and direct Shopify order webhooks to our processing endpoint to stitch conversions.
          </p>
        </section>

        <DocsCallout type="warning">
          <strong>Integration notice:</strong> This setup is a manual configuration recipe. SourceTrack does not ship as a packaged Shopify plugin and is not auto-installed. All steps below must be performed manually in your Shopify store admin and theme code.
        </DocsCallout>

        {/* 3. Steps */}
        <section className="space-y-6">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Steps: Shopify Integration
          </h2>

          {/* FULL CHECKLIST — every required step, in order.
              This is the list api/lib/platform-guides.js serves to MCP's get_install_snippet
              and the wizard renders, and the sync guard in api/tests/mcp-server.test.js pins
              it to dashboard/src/lib/shopifyWalkthrough.js item by item. It reads the FIRST
              <ol> on this page, so this block must stay first — the detailed sections below
              expand these same steps and must not be promoted above it. */}
          <div className="space-y-2">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              The complete install, end to end. Steps 6 and 7 are both required: the webhook
              delivers the order revenue, and the cart attribute is what lets SourceTrack tell
              you which marketing source earned it.
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <li>In your Shopify Admin, go to <strong>Online Store &rarr; Themes</strong>.</li>
              <li>On your current theme, click the action dropdown (the three dots) and select <strong>Edit Code</strong>.</li>
              <li>Open the <code>layout/theme.liquid</code> file.</li>
              <li>Paste the tracking script directly before the closing <code>&lt;/head&gt;</code> tag.</li>
              <li>Save <code>theme.liquid</code>. Shopify publishes the change to your live theme straight away.</li>
              <li>Still in your theme, add the cart-attribute snippet so the anonymous visitor ID (<code>st_aid</code>) is saved onto the Shopify cart and travels with the order.</li>
              <li>In Shopify Admin &rarr; Settings &rarr; Notifications, create an <code>orders/paid</code> webhook pointing at <code>/api/webhooks/shopify/YOUR_SITE_KEY</code>. The webhook delivers the order revenue; step 6 is what makes that revenue attributable, so a store with the webhook alone records purchases against no visitor.</li>
            </ol>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Step 1: Storefront Pixel Tracking</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Add the standard SourceTrack pixel script to your storefront theme to log UTMs and referrers:
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <li>In your Shopify Admin, go to <strong>Online Store &rarr; Themes</strong>.</li>
              <li>Click the action dropdown (the three dots) and select <strong>Edit Code</strong>.</li>
              <li>Open the <code>layout/theme.liquid</code> file.</li>
              <li>Paste the tracking script directly before the closing <code>&lt;/head&gt;</code> tag. Replace <code>YOUR_SITE_KEY</code>:</li>
            </ol>
            <DocsCodeBlock lang="html" replaceKey={true} pasteOnce={true}>
{`<!-- Paste inside layout/theme.liquid before </head> -->
<script async src="https://api.srctk.com/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
            </DocsCodeBlock>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Step 2: Capture Visitor ID in Shopify Cart</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              To link checkout purchases with marketing sessions, you must store the anonymous visitor ID (<code>st_aid</code>) as a cart attribute. Add this Javascript snippet to your checkout or cart templates:
            </p>
            <DocsCodeBlock lang="js">
{`// Read st_aid from localStorage and forward as a cart attribute
const visitorId = localStorage.getItem('st_aid');
if (visitorId) {
  fetch(window.Shopify.routes.root + 'cart/update.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      attributes: {
        'st_aid': visitorId
      }
    })
  });
}`}
            </DocsCodeBlock>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Step 3: Connect Order Webhooks</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Configure a webhook inside Shopify to forward order details to your SourceTrack endpoint on purchase confirmation:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>In your Shopify Admin, go to <strong>Settings &rarr; Notifications</strong>.</li>
              <li>Scroll to the <strong>Webhooks</strong> section and click <strong>Create Webhook</strong>.</li>
              <li>Configure the webhook details:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><strong>Event:</strong> <code>orders/paid</code> (recommended) or <code>orders/create</code>. With <code>orders/create</code>, SourceTrack only processes orders where <code>financial_status === 'paid'</code> — unpaid carts and pending orders are ignored.</li>
                  <li><strong>Format:</strong> JSON</li>
                  <li><strong>URL:</strong> <code>https://api.srctk.com/api/webhooks/shopify/YOUR_SITE_KEY</code></li>
                  <li><strong>API Version:</strong> Latest / stable</li>
                </ul>
              </li>
              <li>Save the webhook, then copy the <strong>Shopify signing secret</strong> (shared with all webhooks for the shop) and paste it into <Link to="/app/integrations" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">Integrations → Shopify webhook recipe</Link>. SourceTrack rejects any webhook whose HMAC-SHA256 signature does not match.</li>
            </ol>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Attribution stitching:</strong> the order webhook reads the visitor id from <code>note_attributes</code> using the first key it finds among <code>_st_aid</code>, <code>st_aid</code>, <code>anonymous_id</code>, <code>visitor_id</code>, <code>sourcetrack_user_id</code>, or <code>site_user_id</code>. Step 2 sets <code>st_aid</code>; using one of those other keys also works.
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Dedupe:</strong> Shopify webhooks are idempotent by Shopify webhook id and order id, so a redelivered webhook will record as <code>duplicate</code>, not a second conversion.
            </p>
          </div>
        </section>

        {/* 4. How to verify it worked */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify It Worked
          </h2>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Place a test order on your storefront theme using Shopify test checkout methods.</li>
            <li>In the Shopify Admin webhook settings, click <strong>Send test notification</strong> on your created webhook to verify the connection.</li>
            <li>Go to the SourceTrack dashboard <strong>Event Debugger</strong>. Verify that a success webhook event logs for the order, and the revenue appears in your overview graphs.</li>
          </ol>
        </section>

        {/* 5. Common mistakes */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>Missing Cart Attribute:</strong> If you forget Step 2, Shopify won't store the visitor ID on the cart. Without it, the order webhook cannot stitch the purchase back to the acquisition source, and the conversion will show as unattributed.
            </li>
            <li>
              <strong>No Storefront Script:</strong> Ensure your storefront theme is loaded with the tracking pixel so the visitor ID gets generated and stored.
            </li>
          </ul>
        </section>

        {/* 6. Next step */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Next Step
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Your Shopify integration is complete! You can explore additional API options or customize dashboard views in our{' '}
            <Link to="/developers" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Developer Portal</Link>.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
