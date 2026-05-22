import { Helmet } from 'react-helmet-async'
import MarketingHeader from './MarketingHeader'
import MarketingFooter from './MarketingFooter'
import HeroSection from './HeroSection'
import FinalCTA from './FinalCTA'

export default function MarketingPage({ seo, hero, heroChildren, children }) {
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
        <meta property="og:image" content="https://sourcetrack.ai/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.ogTitle || seo.title} />
        <meta name="twitter:description" content={seo.ogDescription || seo.description} />
        <meta name="twitter:image" content="https://sourcetrack.ai/og-image.png" />
      </Helmet>

      <MarketingHeader />

      <main>
        <HeroSection {...hero}>{heroChildren}</HeroSection>
        {children}
        <FinalCTA />
      </main>

      <MarketingFooter />
    </div>
  )
}
