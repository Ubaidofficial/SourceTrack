import MarketingPage from '../components/MarketingPage'

const SEO = {
  title: 'Data Processing Agreement (DPA) — SourceTrack',
  description: 'How to request SourceTrack’s Data Processing Agreement. Draft overview provided for transparency during the private beta.',
  canonical: 'https://sourcetrack.ai/dpa',
  ogTitle: 'Data Processing Agreement (DPA)',
}

const HERO = {
  kicker: 'Data Processing Agreement',
  h1: 'Data Processing Agreement',
  sub: 'How SourceTrack acts as your data processor — and how to request a signed DPA.',
  primaryCta: 'Request a DPA',
  primaryHref: 'mailto:privacy@sourcetrack.ai?subject=DPA%20request',
}

export default function DPA() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>
      <section className="py-[80px] bg-white text-st-black">
        <div className="max-w-[720px] mx-auto px-8">
          <div className="rounded-2xl border border-dashed border-[rgba(31,35,35,.25)] bg-[#F7FAFA] p-5 mb-8">
            <span className="text-xs uppercase tracking-widest font-extrabold text-st-black block mb-1">Draft — not binding</span>
            <p className="text-sm text-[#586464] leading-[1.6]">
              This page is a plain-language overview, not a binding legal document. SourceTrack’s Data Processing
              Agreement is being finalized with counsel during the private beta. The signed DPA — not this page — governs
              the processing relationship once executed.
            </p>
          </div>

          <div className="text-base leading-[1.65] text-[#586464] space-y-8 font-sans">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">Roles</h2>
              <p>
                For the customer data you collect through SourceTrack, you are the data controller and SourceTrack is your
                data processor. We process that data only to provide the attribution analytics service, on your
                instructions.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">What we process</h2>
              <p>
                First-party, cookieless analytics events from your sites — pageviews, referrers and campaign parameters,
                AI-referral sources, and the conversion events you configure. SourceTrack does not fingerprint visitors,
                does not store raw IP addresses, and does not sell or share personal data.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">Where data is stored</h2>
              <p>
                Core customer data (database and application hosting) is stored in the EU (Supabase and Railway). Some
                sub-processors operate outside the EU — see the{' '}
                <a href="/subprocessors" className="text-st-black font-bold underline">Sub-processors</a> list for the
                current set and their regions. We use “stored in the EU” precisely: it describes storage of core data, not
                a claim that all processing occurs in the EU.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-[-0.05em] text-st-black mb-4">Request a signed DPA</h2>
              <p>
                Email{' '}
                <a href="mailto:privacy@sourcetrack.ai?subject=DPA%20request" className="text-st-black font-bold underline">privacy@sourcetrack.ai</a>{' '}
                and we’ll send the current DPA for signature.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
