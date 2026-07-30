import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsStripe() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Stripe Webhook/API Revenue Attribution Recipe | SourceTrack Docs</title>
        <meta name="description" content="Stitch Stripe billing and subscription events with acquisition sources. Metadata structures and webhook configurations." />
        <link rel="canonical" href="https://www.sourcetrack.ai/docs/stripe" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            Stripe Webhook / API Revenue Attribution Recipe
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Stitch subscription and payment events with marketing campaigns using Stripe metadata and webhook listener configurations.
          </p>
        </div>

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This recipe is for developers and founders running SaaS or subscription-based sites on Stripe who want to link user checkouts, paid subscriptions, and order amounts back to marketing channels (like Google Ads clicks or organic referrers).
          </p>
        </section>

        {/* Glossary Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Key Terms Defined:</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <li><strong>Webhook</strong> — a server-to-server HTTP message sent by Stripe to SourceTrack whenever a billing event occurs.</li>
            <li><strong>HMAC verification</strong> — a way to cryptographically confirm that the webhook payload was sent by Stripe and not modified in transit.</li>
            <li><strong>Checkout Session</strong> — Stripe's system for collecting payment details and managing customer transactions.</li>
            <li><strong>Visitor ID (st_aid)</strong> — the anonymous tracking identifier that maps the customer's click journey.</li>
          </ul>
        </DocsCallout>

        {/* 2. What you will set up */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            What You Will Set Up
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You will configure your backend server code to retrieve the visitor ID from local storage (or a browser cookie) and pass it into Stripe's checkout session metadata. You will then set up a webhook endpoint inside Stripe to forward completed checkout session events to SourceTrack.
          </p>
        </section>

        <DocsCallout type="warning">
          <strong>Integration notice:</strong> This setup is an API and webhook integration recipe. SourceTrack does not provide an official Stripe Dashboard extension or marketplace plugin. You must configure metadata forwarding in your billing system code and set up webhooks manually in your Stripe Dashboard.
        </DocsCallout>

        {/* 3. Steps */}
        <section className="space-y-6">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Steps: Stripe Integration
          </h2>

          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Step 1: Forward Visitor ID in Stripe Metadata</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              When creating a Stripe Checkout Session on your backend, read the visitor ID (stored in the browser as <code>st_aid</code>) from the client's request payload and pass it as <code>client_reference_id</code> or inside the <code>metadata</code> block as <code>anonymous_id</code> or <code>visitor_id</code>.
            </p>
            <DocsCodeBlock lang="js">
{`// Example of passing st_aid in Stripe Checkout Session creation (Node.js backend)
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{ price: 'price_H5gg...', quantity: 1 }],
  mode: 'subscription',
  success_url: 'https://yoursite.com/success',
  cancel_url: 'https://yoursite.com/cancel',

  // Method A: Pass directly as client_reference_id (Recommended)
  client_reference_id: req.body.st_aid,

  // Method B: Pass inside metadata object
  metadata: {
    anonymous_id: req.body.st_aid
  }
});`}
            </DocsCodeBlock>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              * Note: The SourceTrack webhook listener checks <code>client_reference_id</code>, <code>metadata.anonymous_id</code>, <code>metadata.visitor_id</code>, <code>metadata.sourcetrack_user_id</code>, and <code>metadata.site_user_id</code> in that order.
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Step 2: Configure Stripe Webhook</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Route event messages from Stripe directly to the SourceTrack ingestion URL:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>Log in to your <strong>Stripe Dashboard</strong> and navigate to <strong>Developers &rarr; Webhooks</strong>.</li>
              <li>Click <strong>Add Endpoint</strong>.</li>
              <li>Enter your customized webhook endpoint URL:
                <div className="my-1.5 font-mono text-xs p-2 bg-gray-100 dark:bg-gray-800 rounded">
                  https://api.srctk.com/api/webhooks/stripe/YOUR_SITE_KEY
                </div>
                Replace <code>YOUR_SITE_KEY</code> with the Site Key found under settings in your dashboard.
              </li>
              <li>Under <strong>Select events to listen to</strong>, add:
                <ul className="list-disc pl-5 mt-1">
                  <li><code>checkout.session.completed</code></li>
                  <li><code>refund.created</code></li>
                </ul>
              </li>
              <li>Click <strong>Add Endpoint</strong>.</li>
            </ol>
            <DocsCallout type="info">
              Refunds are recorded as negative conversions and automatically net your revenue by source — subscribe to <code>refund.created</code>.
            </DocsCallout>
            <DocsCallout type="info">
              To secure your webhook, save the Stripe Webhook signing secret (starts with <code>whsec_</code>) in your SourceTrack dashboard under <strong>Integrations &rarr; Stripe settings</strong>. This allows SourceTrack to perform cryptographic HMAC verification of incoming payloads.
            </DocsCallout>
          </div>
        </section>

        {/* 4. How to verify it worked */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Verify It Worked
          </h2>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Run a payment check through Stripe in <strong>Test Mode</strong>.</li>
            <li>In your Stripe Dashboard under <strong>Developers &rarr; Webhooks</strong>, inspect the event logs for <code>checkout.session.completed</code>.</li>
            <li>Verify that the webhook request returned a HTTP <code>200 OK</code> response.</li>
            <li>Verify that the transaction data (revenue and site metadata) appears attributed in the <strong>Event Debugger</strong> of your SourceTrack dashboard.</li>
          </ol>
        </section>

        {/* 5. Common mistakes */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Mistakes
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>Incorrect Webhook Event Types:</strong> Stripe triggers a variety of events like <code>payment_intent.succeeded</code>. SourceTrack parses <code>checkout.session.completed</code>, <code>refund.created</code>, and subscription lifecycle events; other events are safely ignored.
            </li>
            <li>
              <strong>Unmatched Metadata Key:</strong> If you use custom names like <code>metadata.st_aid</code>, SourceTrack's engine will not process it. Stick to <code>client_reference_id</code> or <code>metadata.anonymous_id</code>.
            </li>
            <li>
              <strong>Missing Stripe Signing Secret:</strong> If you omit the signing secret under Settings, webhook payload signature checks will fail, returning a <code>400 Bad Request</code>.
            </li>
          </ul>
        </section>

        {/* 6. Next step */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Next Step
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Stripe setup is complete! Go to the{' '}
            <Link to="/developers/offline-conversions" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Offline Conversions API</Link> to learn how to register custom offline sales or updates directly from your server.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
