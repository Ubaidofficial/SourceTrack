import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

function HeaderTable({ headers }) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-56">Header</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2 pr-4 w-24">Type</th>
            <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 py-2">Purpose</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((h, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
              <td className="py-2 pr-4 font-mono text-[13px] text-gray-800 dark:text-gray-200 align-top">{h.name}</td>
              <td className="py-2 pr-4 text-[13px] text-green-600 dark:text-green-400 font-mono align-top">{h.type}</td>
              <td className="py-2 text-[13px] text-gray-600 dark:text-gray-400 align-top">{h.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

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

        {/* Overview */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Overview
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            SourceTrack uses webhooks for two purposes: receiving billing events from payment platforms (Inbound) and dispatching real-time conversion updates to your external applications (Outbound).
          </p>
        </section>

        {/* Inbound Webhooks */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Inbound Webhooks (Stripe & Shopify)
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            To feed sales and subscriptions into SourceTrack, configure your payment platforms to send events to our receiver URLs:
          </p>
          <div className="space-y-3 pl-4 border-l-2 border-gray-200 dark:border-gray-800">
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">Stripe Checkout Webhook</h4>
              <code className="text-xs font-mono block p-2 bg-gray-50 dark:bg-gray-800 rounded mt-1">
                https://api.srctk.com/api/webhooks/stripe/YOUR_SITE_KEY
              </code>
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">Shopify Paid Order Webhook</h4>
              <code className="text-xs font-mono block p-2 bg-gray-50 dark:bg-gray-800 rounded mt-1">
                https://api.srctk.com/api/webhooks/shopify/YOUR_SITE_KEY
              </code>
            </div>
          </div>
        </section>

        {/* Outbound Webhook Header Details */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Outbound Webhook Headers
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            When a conversion is attributed, SourceTrack dispatches a POST request to your configured endpoint with these custom headers:
          </p>
          <HeaderTable headers={[
            { name: 'Content-Type', type: 'string', desc: 'Will always be set to application/json.' },
            { name: 'X-SourceTrack-Event', type: 'string', desc: 'The type of event triggered: conversion.created for standard conversions, conversion.offline for offline conversion imports.' },
            { name: 'X-SourceTrack-Signature', type: 'string', desc: 'Timestamped signature in the form t=<unix-seconds>,v1=<hex>. v1 is the SHA-256 HMAC of `<t>.<raw-body>`, computed with your webhook secret. The timestamp lets your endpoint reject replayed deliveries.' }
          ]} />
        </section>

        {/* Outbound Webhook Payload Schema */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Outbound Webhook Payload Schema
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            The JSON body contains visitor session details, campaign touchpoints, conversion value, and classification:
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
    "content": "hero-cta",
    "term": "running shoes",
    "channel": "Paid Search",
    "ai_source": null,
    "click_ids": {
      "gclid": "Cj0KCQ..."
    }
  },
  "page": {
    "page_url": "https://example.com/checkout/thank-you",
    "referrer": "https://google.com"
  }
}`}
          </DocsCodeBlock>
        </section>

        {/* Validating Outbound Webhook Signatures */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Validating Outbound Webhook Signatures
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            The signature header has the form <code>t=&lt;unix-seconds&gt;,v1=&lt;hex&gt;</code>. Parse out <code>t</code> and <code>v1</code>, recompute the SHA-256 HMAC of <code>{'`${t}.${rawBody}`'}</code> with your Outbound Webhook signing secret, and compare it to <code>v1</code> using a timing-safe equality. Optionally reject the request when <code>t</code> is too far from your own clock to block replays:
          </p>
          <DocsCodeBlock lang="js">
{`// Node.js Express signature verification example
const crypto = require('crypto');

app.post('/webhook-receiver', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.headers['x-sourcetrack-signature'] || '';
  const secret = 'YOUR_WEBHOOK_SIGNING_SECRET';

  // Header format: t=<unix-seconds>,v1=<hex>
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  const { t, v1 } = parts;

  // Recompute HMAC over \`<t>.<raw-body>\` (req.body is the raw Buffer)
  const expected = crypto
    .createHmac('sha256', secret)
    .update(t + '.' + req.body.toString('utf8'))
    .digest('hex');

  const valid =
    v1 &&
    v1.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));

  // Optional replay guard: reject deliveries older than 5 minutes
  const fresh = Math.abs(Math.floor(Date.now() / 1000) - Number(t)) < 300;

  if (valid && fresh) {
    res.sendStatus(200); // Verified and authentic
  } else {
    res.sendStatus(401); // Signature mismatch or stale timestamp
  }
});`}
          </DocsCodeBlock>
        </section>

        {/* Common Errors */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Common Errors
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>401 Unauthorized / Signature Mismatch:</strong> Occurs when checking req.body after JSON parsing. Verify signatures on the raw payload buffer before parser middleware edits it.
            </li>
            <li>
              <strong>Webhook Timeout:</strong> SourceTrack webhook dispatches expire after a 5000ms threshold. Endpoints must return a quick status response (e.g. 200 OK) and process payloads asynchronously.
            </li>
          </ul>
        </section>

        {/* Security Note */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Security Note
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Signature validation is essential for outbound webhooks to prevent spoofing. Always transmit secrets securely via server environment variables, and verify that the destination URL enforces HTTPS configuration.
          </p>
        </section>

        <DocsCallout type="info">
          Webhook signing secrets are managed inside the dashboard under <strong>Integrations &rarr; Outbound Webhooks</strong>.
        </DocsCallout>

        {/* Attribution stitching */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Attribution stitching
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Read the visitor&apos;s anonymous token in the browser and forward it with your form or
            order submission so your server can stitch the conversion back to the original visit.
          </p>
          <DocsCodeBlock lang="js">
{`const token = sourcetrack.getToken();
formData.append('st_token', token); // pass to your server`}
          </DocsCodeBlock>
        </section>
      </div>
    </DocsLayout>
  )
}
