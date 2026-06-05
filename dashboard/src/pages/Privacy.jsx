import MarketingPage from '../components/MarketingPage'

const SEO = {
  title: 'Privacy Policy Overview — SourceTrack',
  description: 'Privacy overview and tracking data handling policies for the SourceTrack attribution analytics platform.',
  canonical: 'https://sourcetrack.ai/privacy',
  ogTitle: 'Privacy Policy Overview',
}

const HERO = {
  kicker: 'Privacy policy overview',
  h1: 'Privacy & Data Handling',
  sub: 'Learn how SourceTrack collects, processes, and protects visitor analytics data.',
  primaryCta: 'Start tracking free',
}

export default function Privacy() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>
      <section className="py-[80px] bg-white text-st-black">
        <div className="max-w-[720px] mx-auto px-8">
          <div className="prose prose-slate max-w-none text-base leading-[1.65] text-[#586464] space-y-8 font-sans">
            
            <div>
              <span className="text-xs uppercase tracking-widest font-extrabold text-st-black block mb-2">Notice</span>
              <p className="font-bold text-st-black">
                Please note that this document is a practical product and privacy overview describing how the SourceTrack platform handles data. It is provided for transparency during our private beta and does not constitute formal legal certification.
              </p>
            </div>

            <hr className="border-[rgba(31,35,35,0.08)]" />

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">1. Privacy-Conscious Design</h2>
              <p>
                SourceTrack is built as a privacy-conscious attribution platform. Our goal is to connect marketing efforts to actual conversion outcomes with the minimum necessary data collection. Unlike broad analytics suites, we do not build cross-site behavior profiles or sell customer telemetry data.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">2. Data We Collect</h2>
              <p>
                When a customer installs our tracking pixel, we collect analytics events submitted by that customer's website. This includes:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Pageviews, referrer headers, and landing page paths.</li>
                <li>Campaign parameters (UTM tags, click identifiers like GCLID).</li>
                <li>AI discovery referrers (e.g., ChatGPT, Claude, Gemini, Perplexity).</li>
                <li>Conversion events (signups, purchases, and custom events configured by the workspace owner).</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">3. IP Addresses & Geolocation</h2>
              <p>
                SourceTrack uses IP addresses solely to determine approximate geographic location (country level) during ingestion. We discard raw IP addresses immediately after country classification and do not store them in ClickHouse event database logs.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">4. PII Redaction & Security</h2>
              <p>
                We execute automatic ingestion-side filters to redact sensitive URL query parameters (such as email addresses, phone numbers, passwords, and authentication tokens) to prevent accidental storage of Personally Identifiable Information (PII).
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">5. Cookie & Storage Settings</h2>
              <p>
                SourceTrack provides customers with a Cookieless Mode. When enabled by placing a simple attribute on the script tag, the tracker avoids using browser cookies or localStorage. Customers are fully responsible for configuring consent notices and disclosures according to their local laws and target markets.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">6. Contact</h2>
              <p>
                If you have questions about our privacy overview or data practices, please contact us at: <a href="mailto:support@sourcetrack.ai" className="text-st-black font-extrabold hover:underline">support@sourcetrack.ai</a>.
              </p>
            </div>

          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
