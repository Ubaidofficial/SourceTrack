import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCardGrid from '../../components/docs/DocsCardGrid'
import { bySection } from '../../components/docs/docsManifest'

// All cards derive from docsManifest — no duplicate lists. The Overview (/docs)
// self-entry is excluded from the home grid (it IS this page) but stays in the sidebar.
const START = bySection('start').filter((e) => e.to !== '/docs')
const PLATFORMS = bySection('platforms')
const HELP = bySection('help')

const GLOSSARY = [
  { term: 'Tracker Script', body: 'The lightweight JS snippet that records visitor sessions and referrers.' },
  { term: 'Site Key', body: <>The public <code>st_</code> identifier that authorizes your script to submit data.</> },
  { term: 'Pageview', body: 'An event recorded automatically each time a visitor loads a page or route.' },
  { term: 'Conversion', body: 'A tracked action — signup, demo, or purchase — you attribute to a source.' },
  { term: 'Source & Referrer', body: <>The channel that sent the visitor (e.g. <code>google</code> or direct).</> },
  { term: 'UTMs & Click IDs', body: <>URL tags (<code>utm_source</code>) and ad click IDs (<code>gclid</code>) that map paid campaigns.</> },
  { term: 'Webhook', body: 'A server-to-server message reporting order value from Stripe or Shopify.' }
]

function SectionHeading({ children, count }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2 mb-4">
      {children}
      <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 tabular-nums">{count}</span>
    </h2>
  )
}

export default function DocsHome() {
  return (
    <DocsLayout>
      <Helmet>
        <title>SourceTrack Integration Documentation & API Docs</title>
        <meta name="description" content="Technical guides for installing the tracker, tracking custom conversions, stitching user IDs, and API references." />
        <link rel="canonical" href="https://sourcetrack.ai/docs" />
      </Helmet>

      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            SourceTrack Docs
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Install tracking, verify conversions, and connect revenue without an analytics maze.
          </p>
        </div>

        <section>
          <SectionHeading count={START.length}>Start here</SectionHeading>
          <DocsCardGrid items={START} cols={2} />
        </section>

        <section>
          <SectionHeading count={PLATFORMS.length}>Platform recipes</SectionHeading>
          <DocsCardGrid items={PLATFORMS} cols={3} />
        </section>

        <section>
          <SectionHeading count={HELP.length}>Help &amp; Developer Portal</SectionHeading>
          <DocsCardGrid items={HELP} cols={2} />
        </section>

        <section className="bg-gray-50 dark:bg-dark-card border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Glossary: Key Concepts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="space-y-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-dark-primary">{g.term}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{g.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DocsLayout>
  )
}
