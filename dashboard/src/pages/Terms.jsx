import MarketingPage from '../components/MarketingPage'

const SEO = {
  title: 'Terms of Service — SourceTrack',
  description: 'Terms of service and usage policies for the SourceTrack attribution analytics platform.',
  canonical: 'https://sourcetrack.ai/terms',
  ogTitle: 'Terms of Service',
}

const HERO = {
  kicker: 'Terms of service',
  h1: 'Terms of Service',
  sub: 'Terms and rules governing the use of the SourceTrack attribution platform.',
  primaryCta: 'Start tracking free',
}

export default function Terms() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>
      <section className="py-[80px] bg-white text-st-black">
        <div className="max-w-[720px] mx-auto px-8">
          <div className="prose prose-slate max-w-none text-base leading-[1.65] text-[#586464] space-y-8 font-sans">
            
            <div>
              <span className="text-xs uppercase tracking-widest font-extrabold text-st-black block mb-2">Notice</span>
              <p className="font-bold text-st-black">
                Please note that this document governs the use of SourceTrack during its private beta phase. These terms are provided to define rules and expectations during testing and do not represent a final lawyer-reviewed policy.
              </p>
            </div>

            <hr className="border-[rgba(31,35,35,0.08)]" />

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">1. Acceptance of Terms</h2>
              <p>
                By signing up for SourceTrack, registering a workspace, or installing our tracking code, you agree to comply with and be bound by these beta terms. If you do not agree, you must not access the platform or use the tracking script.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">2. Beta Software License</h2>
              <p>
                SourceTrack is currently private beta software. We grant you a limited, non-exclusive, non-transferable, revocable license to access our dashboard and install our tracking script solely for your website attribution analysis.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">3. Permitted & Unlawful Use</h2>
              <p>
                You must not use SourceTrack for:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li>Unlawful tracking, harassment, or collecting unauthorized personal data from visitors.</li>
                <li>Attempting to bypass security limits, scraping dashboard APIs, or cross-company data intrusion.</li>
                <li>Sending spam, malware, or exploiting rate limits on our ingestion routes.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">4. Compliance & Privacy Notices</h2>
              <p>
                You are solely responsible for compliance with any laws applicable to your website traffic (e.g., GDPR, CCPA). You must present appropriate cookies, privacy notices, and opt-out configurations to your visitors.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">5. Warranty & Disclaimer</h2>
              <p>
                The service is provided "as-is" and "as-available" during the private beta. We make no representations or warranties of any kind, express or implied, regarding uptime, data retention longevity, accuracy of attribution models, or the absence of bugs. We do not provide a service level agreement (SLA) or legal guarantees.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">6. Pricing & Billing</h2>
              <p>
                Pricing plans are based on tracked pageview volumes, plan features, and conversion source profile allowances. Accounts exceeding their monthly limits may experience paused ingestion or upgrade notifications. You may downgrade or cancel your subscription at any time via the Stripe customer billing portal.
              </p>
            </div>

          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
