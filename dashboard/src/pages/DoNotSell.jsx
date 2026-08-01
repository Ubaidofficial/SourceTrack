import MarketingPage from '../components/MarketingPage'

const SEO = {
  title: 'Do Not Sell or Share My Personal Information — SourceTrack',
  description: 'SourceTrack does not sell or share personal information. How our cookieless, first-party model works and how to exercise your CCPA rights.',
  canonical: 'https://www.sourcetrack.ai/do-not-sell',
  ogTitle: 'Do Not Sell or Share My Personal Information',
}

const HERO = {
  kicker: 'Your privacy choices (CCPA)',
  h1: 'Do Not Sell or Share My Personal Information',
  sub: 'Where SourceTrack stands on selling and sharing personal information — and how to exercise your rights.',
  primaryCta: 'Email a privacy request',
  primaryHref: 'mailto:privacy@sourcetrack.ai?subject=CCPA%20request',
}

export default function DoNotSell() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>
      <section className="py-[80px] bg-white text-st-black">
        <div className="max-w-[720px] mx-auto px-8">
          <div className="rounded-2xl border border-dashed border-[rgba(18,16,12,.25)] bg-[#F7FAFA] p-5 mb-8">
            <span className="text-xs uppercase tracking-widest font-extrabold text-st-black block mb-1">Draft</span>
            <p className="text-sm text-[#586464] leading-[1.6]">
              Plain-language overview for the private beta, pending legal review. It is not formal legal advice or a
              certification.
            </p>
          </div>

          <div className="text-base leading-[1.65] text-[#586464] space-y-8 font-sans">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">We don’t sell or share your data</h2>
              <p>
                SourceTrack does not sell personal information, and does not “share” it for cross-context behavioral
                advertising as those terms are used under the CCPA/CPRA. We make money from subscriptions, not from
                selling data.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">Why there’s little to opt out of</h2>
              <p>
                Our analytics are cookieless and first-party by design: no fingerprinting, no third-party advertising
                cookies, and no raw IP storage. We don’t build cross-site profiles, so there is no ad-tech “sale” or
                “share” to switch off.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">Exercise your rights</h2>
              <p>
                To make a request to know, delete, or correct personal information — or to ask any privacy question —
                email{' '}
                <a href="mailto:privacy@sourcetrack.ai?subject=CCPA%20request" className="text-st-black font-bold underline">privacy@sourcetrack.ai</a>.
                If your data was collected by a business using SourceTrack on their own site, that business is the
                controller; we’ll help route your request to them.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
