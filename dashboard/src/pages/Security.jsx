import React from 'react'
import MarketingPage from '../components/MarketingPage'
import SectionKicker from '../components/SectionKicker'

const SEO = {
  title: 'Data Privacy & Tracking Security Standards | SourceTrack',
  description: 'Factual technical documentation regarding SourceTrack data collection boundaries, public site key security, manual API integration rules, and data minimization guidelines.',
  canonical: 'https://www.sourcetrack.ai/security',
  ogTitle: 'Data Privacy & Tracking Security Standards | SourceTrack',
}

const HERO = {
  kicker: 'Security & Privacy',
  h1: 'Clean tracking built for transparency.',
  sub: 'Learn exactly what our visitor script captures, how conversion data is securely processed, and how site token permissions are scoped.',
  primaryCta: 'Start free',
  secondaryCta: 'View API docs',
  secondaryHref: '/docs',
}

export default function Security() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>
      <section className="py-[96px] bg-[#F7F4ED]">
        <div className="max-w-[800px] mx-auto px-8">
          
          <div className="space-y-12">
            
            {/* 1. What the script may collect */}
            <div>
              <SectionKicker label="01. Script Collection Bounds" />
              <h3 className="text-xl font-black text-st-black mt-2 mb-3">What the visitor script collects</h3>
              <p className="text-[#6E675C] leading-relaxed mb-4">
                The SourceTrack client-side tracking script captures aggregate session activity to calculate marketing attribution. By default, it collects the following parameters:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm text-[#6E675C] font-medium">
                <li><strong>Page Context:</strong> Page path (e.g., <code className="bg-gray-100 px-1 py-0.5 rounded text-st-black">/pricing</code>), page title, and domain name.</li>
                <li><strong>Referrer Context:</strong> Referrer URL (parsed to group search engine, social media, or AI chatbot domains).</li>
                <li><strong>Acquisition Signals:</strong> Campaign parameters (UTM source, medium, campaign, content, term) and click identifiers (e.g., gclid, fbclid, msclkid, ttclid).</li>
                <li><strong>Browser Context:</strong> User-agent header (to resolve device category, browser name, and operating system) and screen dimensions.</li>
                <li><strong>Network Context:</strong> Geolocation context resolved at the server level (country and city resolution only; raw IP addresses are discarded and never written to database tables).</li>
              </ul>
              <p className="text-xs text-amber-600 font-semibold mt-4">
                Note: No Personally Identifiable Information (PII) like names, email addresses, phone numbers, or mailing addresses is collected, parsed, or stored by default.
              </p>
            </div>

            <hr className="border-[rgba(18,16,12,.08)]" />

            {/* 2. What conversion data customers may send */}
            <div>
              <SectionKicker label="02. Ingestion Boundaries" />
              <h3 className="text-xl font-black text-st-black mt-2 mb-3">Conversion and Revenue Payloads</h3>
              <p className="text-[#6E675C] leading-relaxed mb-4">
                When a user completes a checkout or lead flow, customers fire conversion events containing:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm text-[#6E675C] font-medium">
                <li><strong>Value:</strong> The purchase total (represented as a decimal number) or 0 for lead-generation completions.</li>
                <li><strong>Type:</strong> A conversion event string label (e.g., <code className="bg-gray-100 px-1 py-0.5 rounded text-st-black">purchase</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-st-black">lead</code>).</li>
                <li><strong>Order Identifier:</strong> A stable unique ID (e.g., order name, transaction ID) used to prevent duplicate reporting and double-counting.</li>
                <li><strong>Custom Properties:</strong> Optional client-defined metadata properties. These payloads are automatically sanitized on ingestion, stripping out common sensitive parameters.</li>
              </ul>
            </div>

            <hr className="border-[rgba(18,16,12,.08)]" />

            {/* 3. How site keys/API tokens are handled */}
            <div>
              <SectionKicker label="03. Authorization Scope" />
              <h3 className="text-xl font-black text-st-black mt-2 mb-3">Site Token Authorization Scope</h3>
              <p className="text-[#6E675C] leading-relaxed mb-4">
                SourceTrack routes incoming data points using a public site key:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm text-[#6E675C] font-medium">
                <li><strong>Public key:</strong> Your site key is visible in your website's HTML source. It acts strictly as an ingestion identifier, allowing our server to route pageview and conversion events to your database workspace.</li>
                <li><strong>Data Access Protection:</strong> The public site key cannot be used to retrieve, view, or modify any stored workspace data. All data access requests (reports, settings, visitor journeys) require user authentication and site membership checks.</li>
              </ul>
            </div>

            <hr className="border-[rgba(18,16,12,.08)]" />

            {/* 4. How manual/API integrations should be secured */}
            <div>
              <SectionKicker label="04. Integration Guidelines" />
              <h3 className="text-xl font-black text-st-black mt-2 mb-3">Securing Manual &amp; API Integrations</h3>
              <p className="text-[#6E675C] leading-relaxed mb-4">
                When building manual integrations or webhook handlers, ensure the following best practices are applied:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm text-[#6E675C] font-medium">
                <li><strong>HTTPS Enforced:</strong> All server-side requests to the offline conversion API (<code className="bg-gray-100 px-1 py-0.5 rounded text-st-black">/api/conversion/offline</code>) must be transmitted over encrypted HTTPS channels.</li>
                <li><strong>HMAC Validation:</strong> When configuring inbound webhooks from Stripe, Shopify, or other payment gateways, always verify the payload signature timing-safely before processing the data, using the gateway's signing secret.</li>
                <li><strong>Outbound webhook validation:</strong> Outbound webhooks sent by SourceTrack contain a cryptographic signature header calculated using your unique signing key, allowing your endpoint to verify the authenticity of the event.</li>
              </ul>
            </div>

            <hr className="border-[rgba(18,16,12,.08)]" />

            {/* 5. Data minimization guidance */}
            <div>
              <SectionKicker label="05. Data Minimization" />
              <h3 className="text-xl font-black text-st-black mt-2 mb-3">Data Minimization Guidance</h3>
              <p className="text-[#6E675C] leading-relaxed">
                SourceTrack is designed to report attribution patterns while respecting user privacy. We recommend following data minimization principles: do not send raw email addresses, customer names, billing addresses, or phone numbers in custom properties. Keep identifiers pseudonymized and only transmit parameters necessary for conversion verification and journey stitching.
              </p>
            </div>

            <hr className="border-[rgba(18,16,12,.08)]" />

            {/* 6. Contact */}
            <div>
              <SectionKicker label="Contact" />
              <h3 className="text-xl font-black text-st-black mt-2 mb-3">Privacy &amp; Security Contacts</h3>
              <p className="text-[#6E675C] leading-relaxed">
                For questions regarding data processing, security controls, or privacy compliance, please reach out to us at <a href="mailto:privacy@sourcetrack.ai" className="text-blue-600 hover:underline">privacy@sourcetrack.ai</a>.
              </p>
            </div>

          </div>

        </div>
      </section>
    </MarketingPage>
  )
}
