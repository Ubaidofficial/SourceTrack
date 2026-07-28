import { Helmet } from 'react-helmet-async'
import MarketingHeader from './MarketingHeader'
import MarketingFooter from './MarketingFooter'
import HeroSection from './HeroSection'
import FinalCTA from './FinalCTA'

export default function MarketingPage({ seo, hero, heroChildren, children, finalCta }) {
  const jsonLdItems = Array.isArray(seo.jsonLd)
    ? seo.jsonLd
    : seo.jsonLd
      ? [seo.jsonLd]
      : []

  return (
    <div className="bg-white text-st-black font-sans antialiased">
      <Helmet>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        {seo.canonical && <link rel="canonical" href={seo.canonical} />}
        <meta property="og:title" content={seo.ogTitle || seo.title} />
        <meta property="og:description" content={seo.ogDescription || seo.description} />
        {seo.canonical && <meta property="og:url" content={seo.canonical} />}
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.sourcetrack.ai/og-image.png" />
        <meta property="og:site_name" content="SourceTrack" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@sourcetrackio" />
        <meta name="twitter:title" content={seo.ogTitle || seo.title} />
        <meta name="twitter:description" content={seo.ogDescription || seo.description} />
        <meta name="twitter:image" content="https://www.sourcetrack.ai/og-image.png" />
        {jsonLdItems.map((schema, i) => (
          <script key={i} type="application/ld+json">{JSON.stringify(schema)}</script>
        ))}
      </Helmet>

      <MarketingHeader />

      <main>
        <HeroSection {...hero}>{heroChildren}</HeroSection>
        {children}
        <FinalCTA {...(finalCta || {})} />
      </main>

      <MarketingFooter />
    </div>
  )
}
