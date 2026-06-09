import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DevelopersSecurity() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>Technical Security & Privacy Specs | SourceTrack Docs</title>
        <meta name="description" content="Detailed technical security standards for SourceTrack: data collection bounds, site key authorization scopes, and API integration security." />
        <link rel="canonical" href="https://sourcetrack.ai/developers/security" />
      </Helmet>

      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Security Specifications
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Data collection boundaries, public token access control, and integration security.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            1. Script Collection Bounds
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            The SourceTrack client-side tracking script captures aggregate session activity to calculate marketing attribution. By default, it collects the following parameters:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Page Context:</strong> Page path (e.g., <code>/pricing</code>), page title, and domain name.</li>
            <li><strong>Referrer Context:</strong> Referrer URL (parsed to group search engine, social media, or AI chatbot domains).</li>
            <li><strong>Acquisition Signals:</strong> Campaign parameters (UTM source, medium, campaign, content, term) and click identifiers (e.g., gclid, fbclid, msclkid, ttclid).</li>
            <li><strong>Browser Context:</strong> User-agent header (to resolve device category, browser name, and operating system) and viewport dimensions.</li>
            <li><strong>Network Context:</strong> Geolocation context resolved at the server level (country and city resolution only; raw IP addresses are discarded and never written to database tables).</li>
          </ul>
          <DocsCallout type="warning">
            No Personally Identifiable Information (PII) like names, email addresses, phone numbers, or mailing addresses is collected, parsed, or stored by default.
          </DocsCallout>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            2. Site Token Authorization Scope
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            SourceTrack manages access using two different types of tokens:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Public Site Key:</strong> Visible in your website's HTML source. It acts strictly as an ingestion router for client-side pixel pageviews and conversions. It cannot read any of your workspace data.</li>
            <li><strong>Private Server API Tokens:</strong> Authenticate server-to-server writes to the <code>/api/server/event</code> route. These tokens are highly sensitive and must never be exposed in public browsers.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            3. Private Server API Tokens Secrecy &amp; Revocation
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Private Server API Tokens grant write access to your workspace's server-side telemetry events. Treat them with the same level of security as database passwords:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Server-Only Context:</strong> Never include private API tokens in front-end code, client-side scripts, browser cookies, or check them into public Git repositories.</li>
            <li><strong>Single Exposure:</strong> When you generate an API token under Settings, the plaintext token is shown only once and is never stored in plaintext on our servers. Make sure to copy it and store it in a secure environment variable manager (e.g. AWS Secrets Manager, Vercel Env, or dotenv files).</li>
            <li><strong>Instant Revocation:</strong> If a token is compromised, you can revoke it immediately in the Settings dashboard. Revocation permanently deletes the token mapping, causing any subsequent API calls using that token to fail instantly with a <code>401 Unauthorized</code> response.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            4. Securing Manual &amp; API Integrations
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            When building manual integrations or webhook handlers, ensure the following best practices are applied:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>HTTPS Enforced:</strong> All server-side requests to the offline conversion API (<code>/api/conversion/offline</code>) must be transmitted over encrypted HTTPS channels.</li>
            <li><strong>HMAC Validation:</strong> When configuring inbound webhooks from Stripe, Shopify, or other payment gateways, always verify the payload signature timing-safely before processing the data, using the gateway's signing secret.</li>
            <li><strong>Outbound webhook validation:</strong> Outbound webhooks sent by SourceTrack contain a cryptographic signature header calculated using your unique signing key, allowing your endpoint to verify the authenticity of the event.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            5. Data Minimization Guidance
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            SourceTrack is designed to report attribution patterns while respecting user privacy. We recommend following data minimization principles: do not send raw email addresses, customer names, billing addresses, or phone numbers in custom properties. Keep identifiers pseudonymized and only transmit parameters necessary for conversion verification and journey stitching.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Privacy &amp; Security Contacts
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            For questions regarding data processing, security controls, or privacy compliance, please reach out to us at <a href="mailto:privacy@sourcetrack.ai" className="text-blue-600 hover:underline">privacy@sourcetrack.ai</a>.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
