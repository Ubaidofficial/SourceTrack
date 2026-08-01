import { Link } from 'react-router-dom'
import MarketingPage from '../../components/MarketingPage'
import UTMBuilder from '../../components/UTMBuilder'
import SectionKicker from '../../components/SectionKicker'

const SEO = {
  title: 'Free UTM Builder — campaign URL link generator | SourceTrack',
  description: 'Build clean, consistent UTM-tagged campaign URLs in seconds. Free, no sign-up — everything runs in your browser. Source, medium, campaign, content and term, lowercased automatically.',
  canonical: 'https://www.sourcetrack.ai/tools/utm-builder',
  ogTitle: 'Free UTM Builder — campaign URL link generator',
  ogDescription: 'Generate tagged campaign URLs in seconds. Free, no sign-up, runs entirely in your browser. Parameters are lowercased automatically so your attribution stays consistent.',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'SourceTrack UTM Builder',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://www.sourcetrack.ai/tools/utm-builder',
      description: 'Free UTM campaign URL builder. Add utm_source, utm_medium, utm_campaign, utm_content and utm_term to any destination URL. Runs entirely in the browser.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to build a UTM-tagged campaign URL',
      step: [
        { '@type': 'HowToStep', name: 'Add your destination URL', text: 'Paste the page you want visitors to land on, for example https://yoursite.com/landing-page.' },
        { '@type': 'HowToStep', name: 'Set the source and medium', text: 'Enter utm_source (where the traffic comes from, e.g. google) and utm_medium (the channel type, e.g. cpc).' },
        { '@type': 'HowToStep', name: 'Name the campaign', text: 'Enter utm_campaign to group the links for one campaign, e.g. summer-sale-2025. Add utm_content and utm_term if you need them.' },
        { '@type': 'HowToStep', name: 'Copy the tagged URL', text: 'Copy the generated URL and use it in your ad, email, or post. Parameters are lowercased automatically for consistent reporting.' },
      ],
    },
  ],
}

const HERO = {
  kicker: 'Free tool',
  h1: 'UTM builder for',
  h1Gradient: 'campaign URLs that report cleanly.',
  sub: 'Add UTM parameters to any link and get a tagged URL you can drop into ads, email, and social. Source, medium, and campaign are lowercased automatically so your attribution stays consistent.',
  primaryCta: 'Track these links free',
  secondaryCta: 'See pricing',
  secondaryHref: '/pricing',
  proofs: ['100% free', 'No sign-up required', 'Runs in your browser — nothing leaves the page'],
}

export default function UtmBuilder() {
  return (
    <MarketingPage
      seo={SEO}
      hero={HERO}
      heroChildren={
        <div className="bg-white border border-[rgba(18,16,12,.10)] rounded-[26px] p-6 sm:p-7 shadow-[0_24px_80px_rgba(18,16,12,.10)]">
          <UTMBuilder />
        </div>
      }
      finalCta={{
        h2: 'See which campaigns make money.',
        sub: 'Tagged links tell you where a visit came from. SourceTrack ties those visits to the leads and revenue behind them — start free, no card.',
        primaryCta: 'Start free',
        secondaryCta: 'How attribution works',
        secondaryHref: '/attribution',
      }}
    >
      {/* What is a UTM-tagged URL */}
      <section className="py-[88px] border-b border-[rgba(18,16,12,.06)]">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="max-w-[760px]">
            <SectionKicker label="The basics" />
            <h2 className="mt-5 text-[clamp(30px,4vw,52px)] leading-[0.95] tracking-[-0.06em] font-black text-st-black">
              What is a UTM-tagged URL?
            </h2>
            <p className="mt-5 text-[#6E675C] text-lg leading-[1.6]">
              A UTM-tagged URL is a normal link with extra parameters on the end that describe where the
              click came from. When someone lands on your site, analytics tools read those parameters and
              record the source — so you can tell paid, email, and social traffic apart instead of lumping
              it all into “direct.”
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ['utm_source', 'Where the traffic comes from', 'google, newsletter, twitter'],
              ['utm_medium', 'The kind of channel', 'cpc, email, social'],
              ['utm_campaign', 'The campaign it belongs to', 'summer-sale-2025'],
              ['utm_content', 'Which creative or link (optional)', 'banner-top, footer-link'],
              ['utm_term', 'Paid keyword (optional)', 'running shoes'],
            ].map(([param, what, eg]) => (
              <div key={param} className="p-5 rounded-[20px] border border-[rgba(18,16,12,.10)] bg-white shadow-[0_12px_38px_rgba(18,16,12,.05)]">
                <code className="text-sm font-bold text-st-black">{param}</code>
                <p className="mt-2 text-sm text-[#6E675C] leading-[1.5]">{what}</p>
                <p className="mt-2 text-xs font-mono text-st-gray">{eg}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why consistency matters + internal links */}
      <section className="py-[88px] bg-[#F7F4ED]">
        <div className="max-w-[1320px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div>
            <SectionKicker label="Why it matters" />
            <h2 className="mt-5 text-[clamp(30px,4vw,52px)] leading-[0.95] tracking-[-0.06em] font-black text-st-black">
              Consistent tags make attribution honest.
            </h2>
            <p className="mt-5 text-[#6E675C] text-lg leading-[1.6]">
              <code>Google</code>, <code>google</code>, and <code>Google-Ads</code> are three different sources
              to a reporting tool. Inconsistent casing and naming split one channel across several rows and
              quietly distort which source gets credit. This builder lowercases your parameters automatically
              so the same campaign always reports as the same thing.
            </p>
            <p className="mt-4 text-[#6E675C] text-lg leading-[1.6]">
              Tagging the link is step one. To learn which of those campaigns actually drives leads and
              revenue, you need to connect the tagged visit to what happens next.
            </p>
          </div>

          <div className="lg:pt-2">
            <p className="text-xs font-extrabold tracking-[-0.01em] text-st-gray uppercase">Keep reading</p>
            <ul className="mt-4 space-y-3">
              {[
                ['How multi-touch attribution works', '/attribution'],
                ['SourceTrack vs GA4 and the alternatives', '/compare/ga4'],
                ['Attribution for e-commerce stores', '/use-cases/ecommerce'],
                ['Attribution for lead generation', '/use-cases/lead-generation'],
                ['Install the tracker — docs', '/docs'],
                ['Plans and pricing', '/pricing'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link to={href} className="group inline-flex items-center gap-2 text-st-black font-bold tracking-[-0.02em] hover:text-st-black transition-colors">
                    <span className="border-b border-transparent group-hover:border-st-lime">{label}</span>
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
