import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsStripe() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Stripe Webhook/API Revenue Attribution Recipe | SourceTrack Docs</title>
        <meta name="description" content="Stitch Stripe billing and subscription events with acquisition sources. Metadata structures and webhook configurations." />
        <link rel="canonical" href="https://sourcetrack.ai/docs/platforms/stripe" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Stripe Webhook / API Revenue Attribution Recipe
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Stitch subscription and payment events with marketing campaigns using Stripe metadata and webhook listener configurations.
          </p>
        </div>

        <DocsCallout type="warning">
          <strong>Integration notice:</strong> This setup is an API and webhook integration recipe. SourceTrack does not provide an official Stripe Dashboard extension or marketplace plugin. You must configure metadata forwarding in your billing system code and set up webhooks manually in your Stripe Dashboard.
        </DocsCallout>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This setup is designed for SaaS and subscription-based products processing payments via Stripe. It allows you to link recurring payments, upgrades, and cancellations back to the original marketing touchpoints.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Step 1: Forward Visitor ID in Stripe Metadata
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            When creating a Stripe Checkout Session or Customer record, you must extract the anonymous visitor ID (<code>st_aid</code>) from the visitor's browser local storage and pass it inside the Stripe <code>metadata</code> object:
          </p>
          <DocsCodeBlock lang="js">
{`// Example of passing st_aid in Stripe Checkout Session creation (Node.js)
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{ price: 'price_H5gg...', quantity: 1 }],
  mode: 'subscription',
  success_url: 'https://yoursite.com/success',
  cancel_url: 'https://yoursite.com/cancel',
  metadata: {
    // Forward st_aid to stitch billing events to marketing paths
    st_aid: req.body.st_aid 
  }
});`}
          </DocsCodeBlock>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Step 2: Configure Stripe Webhook
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Set up Stripe to send event notifications to your SourceTrack webhook listener:
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Log in to your <strong>Stripe Dashboard</strong> and go to <strong>Developers &rarr; Webhooks</strong>.</li>
            <li>Click <strong>Add Endpoint</strong>.</li>
            <li>Configure the endpoint settings:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li><strong>Endpoint URL:</strong> <code>https://api.srctk.com/api/webhooks/stripe/YOUR_SITE_KEY</code></li>
                <li><strong>Events to listen to:</strong> <code>invoice.paid</code>, <code>customer.subscription.created</code>, <code>charge.refunded</code></li>
              </ul>
            </li>
            <li>Click <strong>Add Endpoint</strong> to save. SourceTrack will verify the Stripe signature, extract the <code>st_aid</code> visitor ID from the metadata fields, and record the payment value.</li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Deduplication & Test Mode
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>
              <strong>Idempotency:</strong> SourceTrack uses Stripe's charge/invoice ID as the <code>order_id</code> to deduplicate requests. If Stripe retries a webhook dispatch, the duplicate event is ignored.
            </li>
            <li>
              <strong>Test Mode:</strong> To verify your flow, test sessions with test cards will trigger events immediately. We recommend naming your conversion type <code>stripe_test_purchase</code> during checkout testing.
            </li>
          </ul>
        </section>
      </div>
    </DocsLayout>
  )
}
