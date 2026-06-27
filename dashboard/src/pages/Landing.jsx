import { Link } from 'react-router-dom'
import MarketingPage from '../components/MarketingPage'
import MarketingInteractiveDemo from '../components/MarketingInteractiveDemo'
import FeatureCards from '../components/FeatureCards'
import HowItWorksSteps from '../components/HowItWorksSteps'
import ComparisonTable from '../components/ComparisonTable'
import SectionKicker from '../components/SectionKicker'
import HeroPreviewCard from '../components/HeroPreviewCard'
import AiSourcesFixture from '../components/AiSourcesFixture'
import GscQueryFixture from '../components/GscQueryFixture'
import JourneyFixture from '../components/JourneyFixture'
import ReportBuilderMock from '../components/ReportBuilderMock'

const SEO = {
  title: 'SourceTrack — Know which sources bring your leads and revenue',
  description: 'Founder-simple attribution. See which sources, search queries, and AI tools bring your leads and revenue — one script, no CRM, no heavy stack.',
  canonical: 'https://sourcetrack.ai/',
  ogTitle: 'SourceTrack — Know which sources bring your leads and revenue',
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "SourceTrack",
      "url": "https://sourcetrack.ai",
      "logo": "https://sourcetrack.ai/og-image.png",
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "support@sourcetrack.ai",
        "contactType": "customer support"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "SourceTrack",
      "url": "https://sourcetrack.ai"
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "SourceTrack",
      "applicationCategory": "AnalyticsApplication",
      "operatingSystem": "Web",
      "description": "Founder-simple attribution. See which sources, search queries, and AI tools bring your leads and revenue. First-, last-, and multi-touch views, AI-referral detection, Search Console SEO signal, and cookieless privacy-first tracking.",
      "url": "https://sourcetrack.ai",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
        "description": "Start free, no credit card required. Founder early-bird annual access is $99/year."
      }
    }
  ],
}

const HERO = {
  kicker: 'Attribution for founders',
  h1: 'Know which sources bring your leads —',
  h1Gradient: 'and which bring revenue.',
  sub: 'See exactly where your traffic, leads, and customers come from: search, referral, campaigns, and AI tools like ChatGPT. One lightweight script. No CRM. No tag-manager maze. No "book a demo" wall.',
  primaryCta: 'Start free',
  secondaryCta: 'See how it works',
  secondaryHref: '/product',
  proofs: ['No credit card required', 'One script or GTM', 'Cookieless & privacy-first'],
}

export default function Landing() {
  return (
    <MarketingPage
      seo={SEO}
      hero={HERO}
      heroChildren={<HeroPreviewCard />}
      finalCta={{
        h2: 'Stop guessing where your growth comes from.',
        sub: 'Set it up in five minutes. See your first attributed journey today.',
        primaryCta: 'Start free',
        secondaryCta: 'See pricing',
        secondaryHref: '/pricing',
      }}
    >

      {/* Interactive Demo Section — fixture product preview (attribution story) */}
      <section className="py-[72px] border-b border-[rgba(31,35,35,.06)] bg-[#F7FAFA]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
          <MarketingInteractiveDemo />
        </div>
      </section>

      {/* Social proof — PLACEHOLDER (visible TODO; no fabricated logos/quotes/counts) */}
      <section className="py-[56px] border-b border-[rgba(31,35,35,.06)] bg-white">
        <div className="max-w-[860px] mx-auto px-8">
          <div className="rounded-2xl border border-dashed border-[rgba(31,35,35,.22)] bg-[#F7FAFA] p-6 text-center">
            <strong className="block text-st-black text-sm font-extrabold tracking-[-0.02em]">[ TODO — social proof ]</strong>
            <p className="mt-1.5 text-[#586464] text-sm leading-[1.55]">
              No fabricated logos, quotes, or user counts. Before publishing, add a real beta quote, a single honest line
              (e.g. &ldquo;Built by a founder who got tired of GA4&rdquo;), or leave this blank. Do not borrow competitors&rsquo; numbers.
            </p>
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="py-[96px] bg-[#F7FAFA] border-b border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7">
            <div>
              <SectionKicker label="The problem" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                GA4 buries the one answer you need.
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              GA4 hides the answer you need under a hundred you don&rsquo;t. Enterprise attribution tools want your ad budget,
              your CRM, and a sales call before you see a number. SourceTrack is the third option: the source behind every
              lead and sale, readable in five seconds, set up in five minutes.
            </p>
          </div>
        </div>
      </section>

      {/* How it works — 3 steps */}
      <section className="py-[96px] bg-st-black text-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="How it works" dark />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black">
            Find what&rsquo;s working in 3 steps.
          </h2>
          <p className="mt-5 max-w-[620px] mx-auto text-[#B9C2C2] text-lg leading-[1.55]">
            No long implementation. Install one script, connect your events, and see which sources actually drive leads and revenue.
          </p>

          <div className="mt-[54px]">
            <HowItWorksSteps steps={[
              { title: 'Install', body: 'Add one script — or use the guided setup for WordPress, Shopify, Webflow, Framer, or Google Tag Manager. Under a minute, no engineer needed.' },
              { title: 'Connect', body: 'Add your conversion events. Connect Google Search Console for SEO, or Stripe to attribute revenue, whenever you’re ready.' },
              { title: 'Know', body: 'Open the dashboard and see which sources, pages, and search queries actually drive your leads and revenue.' },
            ]} />
          </div>
        </div>
      </section>

      {/* What you get — feature blocks */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-7 mb-[54px]">
            <div>
              <SectionKicker label="What you get" />
              <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
                The plain answer to &ldquo;where is my growth coming from?&rdquo;
              </h2>
            </div>
            <p className="self-end text-[#586464] text-lg leading-[1.55] tracking-[-0.02em] max-w-[480px]">
              Go beyond UTMs and last-click. SourceTrack connects sources, search queries, AI tools, and journeys to the
              leads and customers they actually produce — without a CRM or a heavy stack.
            </p>
          </div>

          <FeatureCards items={[
            { icon: 'S', title: 'See which sources bring leads — and which bring revenue.', body: 'See how many leads and customers come from Organic Search, AI tools, Referral, Direct, Email, and your campaigns — with first-touch, last-touch, and multi-touch views.' },
            { icon: 'AI', title: 'See the AI traffic everyone else calls “direct.”', body: 'When someone arrives from ChatGPT, Gemini, Claude, Perplexity, Copilot, DeepSeek, or Grok, SourceTrack recognizes it and tracks what that visitor does next. Most analytics still can’t see it.' },
            { icon: 'Q', title: 'Turn Search Console into a revenue signal.', body: 'Connect Google Search Console and see which queries and landing pages bring traffic that converts — matched by landing page and date range. (Query-level revenue is estimated, not exact identity; Search Console can lag 2–3 days.)' },
          ]} />

          <div className="mt-[18px]">
            <FeatureCards items={[
              { icon: 'J', title: 'Follow the journey, not just the last click.', body: 'Every conversion has a path — first touch, the pages in between, the return visits. SourceTrack tells the story of how a visitor actually became a customer.' },
              { icon: 'L', title: 'Qualify leads — without a CRM.', body: 'Mark any lead Qualified, MQL, SQL, or Unqualified right where the data lives. Push to your CRM one way if you want one — there’s no two-way sync to babysit.' },
              { icon: 'P', title: 'Privacy-first by default.', body: 'Cookieless visitor tracking. No fingerprinting. First-party by design. Privacy isn’t a toggle you flip — it’s how the tracker works.' },
            ]} />
          </div>
        </div>
      </section>

      {/* Showcase — AI sources */}
      <section className="py-[96px] bg-[#F7FAFA] border-y border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionKicker label="AI sources" />
            <h2 className="mt-5 text-[clamp(28px,3.6vw,46px)] leading-[0.98] tracking-[-0.06em] font-black text-st-black">
              The AI traffic everyone else calls &ldquo;direct.&rdquo;
            </h2>
            <p className="mt-4 text-[#586464] text-lg leading-[1.55] max-w-[460px]">
              ChatGPT, Perplexity, Gemini, Claude, Copilot, and DeepSeek are a real acquisition channel now.
              SourceTrack recognizes each one and tracks what those visitors do next.
            </p>
          </div>
          <AiSourcesFixture />
        </div>
      </section>

      {/* Showcase — SEO / Search Console */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="lg:order-2">
            <SectionKicker label="SEO" />
            <h2 className="mt-5 text-[clamp(28px,3.6vw,46px)] leading-[0.98] tracking-[-0.06em] font-black text-st-black">
              Turn Search Console into a revenue signal.
            </h2>
            <p className="mt-4 text-[#586464] text-lg leading-[1.55] max-w-[460px]">
              See which queries and landing pages bring traffic that converts — matched by landing page and date range.
              Clicks and impressions stop being vanity and start showing outcomes.
            </p>
          </div>
          <div className="lg:order-1">
            <GscQueryFixture />
          </div>
        </div>
      </section>

      {/* Showcase — Journeys */}
      <section className="py-[96px] bg-[#F7FAFA] border-y border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionKicker label="Journeys" />
            <h2 className="mt-5 text-[clamp(28px,3.6vw,46px)] leading-[0.98] tracking-[-0.06em] font-black text-st-black">
              Follow the journey, not just the last click.
            </h2>
            <p className="mt-4 text-[#586464] text-lg leading-[1.55] max-w-[460px]">
              Every conversion has a path — first touch, the pages in between, the return visits. SourceTrack tells the
              story of how a visitor actually became a customer.
            </p>
          </div>
          <JourneyFixture />
        </div>
      </section>

      {/* Showcase — Report Builder */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="lg:order-2">
            <SectionKicker label="Report Builder" />
            <h2 className="mt-5 text-[clamp(28px,3.6vw,46px)] leading-[0.98] tracking-[-0.06em] font-black text-st-black">
              Build the report, save the view.
            </h2>
            <p className="mt-4 text-[#586464] text-lg leading-[1.55] max-w-[460px]">
              Start from a template, pick your dimensions and metrics, and pin the views that matter to your dashboard.
              Powerful enough to investigate, simple enough you won&rsquo;t need a data team.
            </p>
          </div>
          <div className="lg:order-1">
            <ReportBuilderMock />
          </div>
        </div>
      </section>

      {/* Things you won't say anymore */}
      <section className="py-[96px] bg-[#F7FAFA] border-y border-[rgba(31,35,35,.06)]">
        <div className="max-w-[900px] mx-auto px-8 text-center">
          <SectionKicker label="Before & after" />
          <h2 className="mt-5 text-[clamp(28px,4vw,48px)] leading-[0.96] tracking-[-0.06em] font-black text-st-black">
            Things you won&rsquo;t say anymore.
          </h2>
          <ul className="mt-[40px] grid gap-3 list-none p-0 text-left max-w-[680px] mx-auto">
            {[
              '“Where did this lead even come from?”',
              '“Is our SEO actually making money or just traffic?”',
              '“Wait — people find us through ChatGPT now?”',
              '“I’ll figure out attribution once we’re bigger.”',
              '“Let me export four tools into a spreadsheet.”',
            ].map((line, i) => (
              <li key={i} className="px-5 py-3.5 rounded-2xl bg-white border border-[rgba(31,35,35,.08)] text-[#586464] text-base font-semibold tracking-[-0.01em] line-through decoration-[rgba(31,35,35,.25)]">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-7 text-st-black text-lg font-extrabold tracking-[-0.02em]">
            One script. One dashboard. The answer, in five seconds.
          </p>
        </div>
      </section>

      {/* A note from the founder — PLACEHOLDER (visible TODO; founder writes in own voice) */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[820px] mx-auto px-8">
          <SectionKicker label="A note from the founder" />
          <div className="mt-6 rounded-[28px] border border-dashed border-[rgba(31,35,35,.22)] bg-[#F7FAFA] p-7">
            <strong className="block text-st-black text-sm font-extrabold tracking-[-0.02em]">[ TODO — founder note ]</strong>
            <p className="mt-2 text-[#586464] text-base leading-[1.6]">
              Write this in your own voice, with real detail — why you built SourceTrack, what you needed that other tools
              couldn&rsquo;t give you, and an honest invitation to try it. Keep it true; don&rsquo;t borrow another founder&rsquo;s story or
              numbers. Sign it with your name. (Suggested frame is in the copy doc.)
            </p>
          </div>
        </div>
      </section>

      {/* Works with your stack */}
      <section className="py-[96px] bg-[#F7FAFA] border-b border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-[54px]">
            <SectionKicker label="Works with your stack" />
            <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
              Add it in minutes, your way.
            </h2>
            <p className="mt-4 max-w-[620px] mx-auto text-[#586464] text-lg leading-[1.55]">
              Add SourceTrack with a single script, through Google Tag Manager, or with the guided setup for WordPress,
              Shopify, Webflow, and Framer. Connect Search Console for SEO and Stripe (beta) or a manual webhook for revenue.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { title: 'One script', desc: 'Paste the lightweight snippet directly' },
              { title: 'Google Tag Manager', desc: 'Deploy via template tag or custom HTML' },
              { title: 'WordPress', desc: 'Guided setup via headers/footers' },
              { title: 'Shopify', desc: 'Guided setup for your storefront' },
              { title: 'Webflow', desc: 'Paste the snippet in custom header settings' },
              { title: 'Framer', desc: 'Add the tracking code in site settings' },
              { title: 'Google Search Console', desc: 'Connect for SEO query attribution' },
              { title: 'Stripe / webhook revenue', desc: 'Stripe (beta) or manual webhook import' },
            ].map((item) => (
              <div key={item.title} className="p-4 rounded-xl bg-white border border-[rgba(31,35,35,.08)] shadow-[0_4px_12px_rgba(31,35,35,.015)]">
                <strong className="block text-st-black text-sm tracking-tight">{item.title}</strong>
                <p className="mt-1 text-[#586464] text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Honest comparison — 4-way (competitor cells are [verify] TODOs) */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Honest comparison" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            The simple, private middle.
          </h2>
          <p className="mt-5 max-w-[640px] mx-auto text-[#586464] text-lg leading-[1.55]">
            Most founders choose between free analytics that don&rsquo;t tell you what pays, form-trackers that need a CRM, or
            enterprise platforms priced like a hire. SourceTrack is the simple, private middle.
          </p>

          <div className="mt-[54px]">
            <ComparisonTable rows={[
              ['', 'SourceTrack', 'Free analytics (GA4)', 'Form-trackers', 'Enterprise'],
              ['Source behind every lead', '✓', 'Partial', '✓', '✓'],
              ['AI-referral detection', '✓', '—', '[verify]', '[verify]'],
              ['Search Console revenue signal', '✓ (beta)', '—', '[verify]', '[verify]'],
              ['Works without a CRM', '✓', '✓', '✗ (CRM required)', '[verify]'],
              ['Cookieless / privacy-first', '✓', '[verify]', '[verify]', '[verify]'],
              ['Set up in minutes, no demo call', '✓', '✓', '✓', 'Often demo-gated'],
              ['Starting price', '$49/mo · $99/yr Founder', 'Free', '[verify]', '$$$ [verify]'],
            ]} />
          </div>
          <p className="mt-5 text-[#8A9B9B] text-xs font-bold">
            Last verified: [DATE]. Competitor cells must be re-checked on their live sites before publishing.
          </p>
        </div>
      </section>

      {/* Simple pricing — summary */}
      <section className="py-[96px] bg-[#F7FAFA] border-y border-[rgba(31,35,35,.06)]">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="Simple pricing" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Start free. No card required.
          </h2>
          <div className="mt-[40px] grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-[920px] mx-auto">
            {[
              ['Starter', '$49/mo', 'Real attribution for one site.'],
              ['Growth', '$79/mo', 'The full toolkit: Report Builder, Search Console SEO, Stripe revenue (beta).'],
              ['Founder', '$99/yr', 'Early-bird annual. 25 seats, one per customer, Growth-level features, locked forever.'],
            ].map(([name, price, desc]) => (
              <div key={name} className="p-6 rounded-[26px] bg-white border border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)] text-left">
                <strong className="block text-st-black text-lg tracking-[-0.04em]">{name}</strong>
                <span className="block mt-1 text-[28px] font-black tracking-[-0.05em] text-st-black">{price}</span>
                <p className="mt-2 text-[#586464] text-sm leading-[1.5]">{desc}</p>
              </div>
            ))}
          </div>
          <Link to="/pricing" className="mt-8 inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-black text-white text-[15px] font-extrabold tracking-[-0.025em] hover:bg-[#171B1B] transition-all hover:-translate-y-px">
            See full pricing →
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-[96px] bg-white">
        <div className="max-w-[1320px] mx-auto px-8 text-center">
          <SectionKicker label="FAQ" />
          <h2 className="mt-5 text-[clamp(32px,4.5vw,58px)] leading-[0.92] tracking-[-0.07em] font-black text-st-black">
            Questions founders ask first.
          </h2>
          <div className="mt-[54px] grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            {[
              ['Is this a GA4 replacement?', 'For the questions that matter — where traffic comes from, what converts, which pages and queries drive revenue — yes. It’s not built for exhaustive raw-event debugging. It’s built to be readable.'],
              ['Do I need a CRM?', 'No. Lead qualification lives inside SourceTrack. If you use a CRM, you can push leads one way — there’s no two-way sync to maintain.'],
              ['Do I need to code?', 'No. Use the script tag, Google Tag Manager, or the guided setup for WordPress, Shopify, Webflow, and Framer.'],
              ['How does AI-referral tracking work?', 'When a visitor arrives from an AI tool — ChatGPT, Perplexity, Gemini, Claude, and others — SourceTrack detects the referral and attributes the journey that follows, like any other source.'],
              ['Can I see revenue by source?', 'You can connect revenue through Stripe (beta / test-mode), a webhook, or manual conversion values, and attribute it to sources. Where no revenue is connected, SourceTrack shows leads and conversions instead — and never invents a number.'],
              ['Is it really private?', 'Yes. Cookieless, first-party, no fingerprinting. Because the tracker is cookieless, you typically won’t need a cookie banner for SourceTrack. The trade-off, shared by all cookieless analytics, is that long-term cross-session identity is less precise than cookie-based tracking.'],
              ['What about Search Console?', 'Connect it and SourceTrack matches your search queries and landing pages to conversions by landing page and date range. Search Console data can lag 2–3 days, and Google omits some rare queries.'],
              ['Is there a free trial?', 'Yes — and no credit card required to start.'],
            ].map(([q, a], i) => (
              <div key={i} className="p-6 rounded-[24px] bg-white border border-[#E0E7E7]">
                <strong className="block text-lg tracking-[-0.04em] mb-2 text-st-black">{q}</strong>
                <p className="text-[#667272] leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingPage>
  )
}
