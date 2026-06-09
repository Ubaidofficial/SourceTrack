import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DevelopersWebhooks() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Webhooks & Signature Verification Reference | SourceTrack Docs</title>
        <meta name="description" content="Technical guide for configuring outbound webhook listeners, validating HMAC payload signatures, and integrating Shopify and Stripe webhook recipes." />
        <link rel="canonical" href="https://sourcetrack.ai/developers/webhooks" />
      </Helmet>

      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Webhooks & HMAC Verification
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Inbound payment webhook setups and outbound conversion webhook payload structures.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Stripe Inbound Webhooks
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Connect Stripe checkout events site-wide. Ensure you pass the anonymous tracking ID (<code>st_aid</code>) inside your Stripe checkout session metadata.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Set your webhook listener to receive events at:
          </p>
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300">
{`https://api.srctk.com/api/webhooks/stripe/YOUR_SITE_KEY`}
          </pre>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Shopify Inbound Webhooks
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Configure order creation hooks under your Shopify Admin notifications panel. Forward the <code>st_aid</code> cart attribute value as a cart attribute payload.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Set your webhook endpoint URL to:
          </p>
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300">
{`https://api.srctk.com/api/webhooks/shopify/YOUR_SITE_KEY`}
          </pre>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Outbound Webhook Payload Schema
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Outbound webhooks trigger a POST dispatch to your target systems (e.g. Make, Zapier, custom backend) on conversion validation.
          </p>
          <DocsCodeBlock lang="json">
{`{
  "event": "conversion.created",
  "created_at": "2026-06-09T15:00:00.000Z",
  "site_key": "sk_live_abc123",
  "conversion": {
    "type": "purchase",
    "value": 100.00,
    "currency": "USD",
    "order_id": "ORD-1234",
    "event_id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "visitor": {
    "anonymous_id": "8a7c6b5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d",
    "user_id": "user_9876"
  },
  "attribution": {
    "source": "google",
    "medium": "cpc",
    "campaign": "brand-search",
    "channel": "Paid Search"
  },
  "page": {
    "page_url": "https://example.com/checkout/thank-you",
    "referrer": "https://google.com"
  }
}`}
          </DocsCodeBlock>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Validating Outbound Webhook Signatures
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Verify webhook payloads by calculating the HMAC SHA-256 signature of the raw body using your webhook\'s signing secret (sent in the <code>X-SourceTrack-Signature</code> header):
          </p>
          <DocsCodeBlock lang="js">
{`// Node.js Express verification example
const crypto = require('crypto');

app.post('/webhook-receiver', (req, res) => {
  const signature = req.headers['x-sourcetrack-signature'];
  const secret = 'YOUR_WEBHOOK_SIGNING_SECRET';

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature === expectedSignature) {
    // Request is verified and safe
    res.sendStatus(200);
  } else {
    // Unauthorized
    res.sendStatus(401);
  }
});`}
          </DocsCodeBlock>
        </section>

        <DocsCallout type="info">
          Webhook signing secrets are managed inside the dashboard under <strong>Integrations &rarr; Outbound Webhooks</strong>.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
