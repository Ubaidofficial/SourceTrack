import MarketingPage from '../components/MarketingPage'

const SEO = {
  title: 'Sub-processors — SourceTrack',
  description: 'The third-party sub-processors SourceTrack uses to provide the service, and where they operate. Draft list maintained during the private beta.',
  canonical: 'https://www.sourcetrack.ai/subprocessors',
  ogTitle: 'Sub-processors',
}

const HERO = {
  kicker: 'Sub-processors',
  h1: 'Sub-processors',
  sub: 'The third parties that help us run SourceTrack, and where they operate.',
  primaryCta: 'Questions? Email privacy',
  primaryHref: 'mailto:privacy@sourcetrack.ai?subject=Sub-processors',
}

// DRAFT — regions to be confirmed by the founder/counsel before launch.
const ROWS = [
  ['Supabase', 'Database, authentication, storage (core customer data)', 'EU'],
  ['Railway', 'Application hosting & deployment (core customer data)', 'EU'],
  ['Stripe', 'Payments & billing', 'US / global'],
  ['Resend', 'Transactional email delivery', 'US'],
  ['Amazon SES', 'Authentication email delivery (signup / reset)', 'US / region'],
  ['Anthropic', 'AI features (deterministic, truthful-only)', 'US'],
  ['OpenAI', 'AI features (deterministic, truthful-only)', 'US'],
]

export default function Subprocessors() {
  return (
    <MarketingPage seo={SEO} hero={HERO}>
      <section className="py-[80px] bg-white text-st-black">
        <div className="max-w-[820px] mx-auto px-8">
          <div className="rounded-2xl border border-dashed border-[rgba(31,35,35,.25)] bg-[#F7FAFA] p-5 mb-8">
            <span className="text-xs uppercase tracking-widest font-extrabold text-st-black block mb-1">Draft</span>
            <p className="text-sm text-[#586464] leading-[1.6]">
              This list is maintained for transparency during the private beta. Provider regions are being confirmed
              before launch — treat regions marked here as provisional until this notice is removed.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E5ECEC]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-st-black text-white text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 font-extrabold">Sub-processor</th>
                  <th className="py-3 px-4 font-extrabold">Purpose</th>
                  <th className="py-3 px-4 font-extrabold">Region</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([name, purpose, region]) => (
                  <tr key={name} className="border-b border-[#E5ECEC] last:border-0">
                    <td className="py-3 px-4 font-extrabold text-st-black">{name}</td>
                    <td className="py-3 px-4 text-[#586464]">{purpose}</td>
                    <td className="py-3 px-4 font-bold text-st-black">{region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-sm text-[#586464] leading-[1.6]">
            Core customer data (database and hosting) is stored in the EU. Some sub-processors operate outside the EU, so
            “stored in the EU” refers to core data storage — not a claim that all processing happens in the EU. To be
            notified of changes to this list, email{' '}
            <a href="mailto:privacy@sourcetrack.ai?subject=Sub-processors" className="text-st-black font-bold underline">privacy@sourcetrack.ai</a>.
          </p>
        </div>
      </section>
    </MarketingPage>
  )
}
