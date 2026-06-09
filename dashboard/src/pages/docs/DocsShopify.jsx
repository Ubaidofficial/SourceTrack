import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsShopify() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Shopify Manual Revenue Attribution Recipe | SourceTrack Docs</title>
        <meta name="description" content="Integrate Shopify manually with SourceTrack. Storefront pixel setup and order conversion webhooks to stitch customer journeys." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/platforms/shopify" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Shopify Manual Revenue Attribution Recipe
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Connect your Shopify storefront and order revenue to SourceTrack using manual snippet placement and Shopify webhooks.
          </p>
        </div>

        <DocsCallout type="warning">
          <strong>Integration notice:</strong> This setup is a manual configuration recipe. SourceTrack does not offer a native Shopify integration or one-click automatic installation. All steps below must be performed manually in your Shopify store admin and theme code.
        </DocsCallout>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Step 1: Storefront Pixel Tracking
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Add the standard SourceTrack pixel script to your storefront theme to log UTMs, referrers, and visitor sessions:
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>In your Shopify Admin, navigate to <strong>Online Store &rarr; Themes</strong>.</li>
            <li>Click the action dropdown (the three dots) and select <strong>Edit Code</strong>.</li>
            <li>Open the <code>layout/theme.liquid</code> file.</li>
            <li>Paste the tracking script directly before the closing <code>&lt;/head&gt;</code> tag. Replace <code>YOUR_SITE_KEY</code> with your real key:</li>
          </ol>
          <DocsCodeBlock lang="html">
{`<!-- Paste inside layout/theme.liquid before </head> -->
<script async src="https://api.srctk.com/tracker/tracker.min.js" data-site-key="YOUR_SITE_KEY"></script>`}
          </DocsCodeBlock>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Step 2: Capture Visitor ID in Shopify Cart
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            To stitch checkout purchases with marketing sessions, you must store the anonymous visitor ID (<code>st_aid</code>) as a cart attribute. Add this Javascript snippet to your checkout or cart templates:
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
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Step 3: Connect Order Webhooks
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Configure a webhook inside Shopify to forward order details to your SourceTrack endpoint on purchase confirmation:
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>In your Shopify Admin, go to <strong>Settings &rarr; Notifications</strong>.</li>
            <li>Scroll to the <strong>Webhooks</strong> section and click <strong>Create Webhook</strong>.</li>
            <li>Configure the webhook details:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li><strong>Event:</strong> Order Creation (<code>orders/create</code>)</li>
                <li><strong>Format:</strong> JSON</li>
                <li><strong>URL:</strong> <code>https://api.srctk.com/api/webhooks/shopify/YOUR_SITE_KEY</code></li>
                <li><strong>API Version:</strong> Latest / stable</li>
              </ul>
            </li>
            <li>Click <strong>Save</strong>. SourceTrack will securely ingest the webhook payload, verify the Shopify HMAC signature, map the <code>st_aid</code> cart attribute to stitch visitor paths, and attribute order revenue.</li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Verification & Limitations
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              <strong>Deduplication:</strong> SourceTrack uses the Shopify <code>order_id</code> to deduplicate conversions, preventing double-counting of revenue.
            </li>
            <li>
              <strong>Offline Limitations:</strong> Without a native app, storefront behavior like checkout initiation funnel steps are not tracked automatically. Only storefront pageviews and completed webhook orders are synced.
            </li>
          </ul>
        </section>
      </div>
    </DocsLayout>
  )
}
