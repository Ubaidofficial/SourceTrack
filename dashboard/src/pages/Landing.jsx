import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'Docs', href: '/docs' },
]

const FEATURES = [
  {
    icon: '⚡',
    title: 'One script tag. Zero setup.',
    body: 'Paste a single 1.7 KB snippet into your site\'s <head> and start capturing every pageview, conversion, and UTM parameter instantly — no GTM, no config files.',
  },
  {
    icon: '🤖',
    title: 'AI traffic attribution',
    body: 'Automatically detect visitors arriving from ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek and 25+ other AI platforms — before your competitors even know AI referrals exist.',
  },
  {
    icon: '🔁',
    title: 'Multi-touch attribution',
    body: 'See the full customer journey — not just the last click. Choose from 8 models: First Touch, Last Touch, Linear, Time Decay, U-Shaped, W-Shaped, and more.',
  },
  {
    icon: '📊',
    title: 'Report builder',
    body: 'Build any attribution report in seconds with our guided 7-step workflow. Group by channel, source, campaign, country, device, AI platform, or landing page. Export to CSV.',
  },
  {
    icon: '🛤️',
    title: 'Customer journey maps',
    body: 'Visualise every touchpoint from first visit to conversion. Understand exactly which ads, content, and referral sources work together to close deals.',
  },
  {
    icon: '🔒',
    title: 'Cookieless & GDPR-ready',
    body: 'Enable cookieless mode for a server-derived, daily-rotating visitor ID — no localStorage, no cookies, no consent banner required. Fully GDPR, ePrivacy, and PECR compliant.',
  },
]

const MODELS = [
  { name: 'First Touch', desc: '100% credit to the first interaction', color: 'bg-blue-500' },
  { name: 'Last Touch', desc: '100% credit to the final touchpoint', color: 'bg-purple-500' },
  { name: 'Linear', desc: 'Equal credit across all touchpoints', color: 'bg-green-500' },
  { name: 'Time Decay', desc: 'More credit to recent touchpoints', color: 'bg-yellow-500' },
  { name: 'U-Shaped', desc: '40% first, 40% last, 20% middle', color: 'bg-orange-500' },
  { name: 'W-Shaped', desc: '30% first, 30% mid, 30% last', color: 'bg-pink-500' },
]

const AI_PLATFORMS = [
  'ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok',
  'Copilot', 'DeepSeek', 'Meta AI', 'Mistral', 'Poe',
  'You.com', 'Phind', 'Kagi',
]

const STEPS = [
  {
    number: '01',
    title: 'Add the snippet',
    body: 'Paste one line of JavaScript into your site\'s <head>. Works on any website — Webflow, WordPress, Shopify, custom code.',
    code: `<script async\n  src="https://app.sourcetrack.ai/tracker/tracker.min.js"\n  data-site-key="YOUR_KEY">\n</script>`,
  },
  {
    number: '02',
    title: 'Fire your first conversion',
    body: 'Call sourcetrack.conversion() when a purchase, sign-up, or form submit happens. Pass an optional value and order ID.',
    code: `sourcetrack.conversion({\n  value: 99,\n  type: 'purchase',\n  order_id: 'ORD-123'\n})`,
  },
  {
    number: '03',
    title: 'See where revenue comes from',
    body: 'Open your dashboard to see revenue, conversions, and visitor journeys broken down by every marketing source — including AI.',
    code: null,
  },
]

const WHO_ITS_FOR = [
  {
    role: 'Performance marketers',
    desc: 'Know exactly which ad campaigns, keywords, and creatives generate revenue — not just clicks.',
  },
  {
    role: 'Growth teams',
    desc: 'Understand your full acquisition funnel from first touch to closed deal, across every channel.',
  },
  {
    role: 'Agencies',
    desc: 'Prove ROI to clients with multi-model attribution reports they can trust. Export to CSV in one click.',
  },
  {
    role: 'E-commerce brands',
    desc: 'Attribute purchase revenue to the right source — including organic AI traffic from ChatGPT and Perplexity.',
  },
  {
    role: 'SaaS companies',
    desc: 'Track sign-ups, trial starts, and upgrades back to the marketing touchpoints that drove them.',
  },
  {
    role: 'Privacy-conscious teams',
    desc: 'Enable cookieless mode and track conversions without storing any personal data in the browser.',
  },
]

function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return scrolled
}

export default function Landing() {
  const scrolled = useScrolled()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="bg-[#0C0E0E] text-white min-h-screen font-sans antialiased">

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0C0E0E]/95 backdrop-blur border-b border-white/5' : ''}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-st-lime flex items-center justify-center">
              <span className="text-black font-black text-sm">S</span>
            </div>
            <span className="font-bold text-white text-lg tracking-tight">SourceTrack</span>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href}
                className="text-sm text-white/60 hover:text-white transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/login"
              className="text-sm text-white/70 hover:text-white transition-colors px-3 py-1.5">
              Sign in
            </Link>
            <Link to="/signup"
              className="text-sm font-semibold bg-st-lime text-black px-4 py-2 rounded-lg hover:bg-st-lime/90 transition-colors">
              Start free trial
            </Link>
          </div>

          <button className="md:hidden text-white/70 hover:text-white" onClick={() => setMobileOpen(o => !o)}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden bg-[#0C0E0E] border-t border-white/5 px-6 py-4 space-y-3">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} onClick={() => setMobileOpen(false)}
                className="block text-sm text-white/60 hover:text-white py-1">
                {l.label}
              </a>
            ))}
            <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
              <Link to="/login" className="text-sm text-center text-white/70 py-2">Sign in</Link>
              <Link to="/signup"
                className="text-sm font-semibold text-center bg-st-lime text-black px-4 py-2.5 rounded-lg">
                Start free trial
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-st-lime/30 bg-st-lime/5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-st-lime animate-pulse" />
            <span className="text-xs font-medium text-st-lime">Now tracking AI referrals from 30+ platforms</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight mb-6">
            Know exactly which{' '}
            <span className="text-st-lime">marketing</span>{' '}
            drives your revenue
          </h1>

          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            SourceTrack gives you multi-touch attribution, AI traffic detection, and full customer journey visibility — with one 1.7 KB script tag and zero configuration.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-st-lime text-black text-sm font-bold rounded-xl hover:bg-st-lime/90 transition-colors">
              Start free — 14-day trial
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link to="/docs"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-white/10 text-white/70 text-sm font-medium rounded-xl hover:border-white/20 hover:text-white transition-colors">
              View API docs
            </Link>
          </div>

          <p className="text-xs text-white/30 mt-4">No credit card required · GDPR-compliant · Cancel anytime</p>
        </div>

        {/* Hero visual — attribution flow */}
        <div className="max-w-4xl mx-auto mt-16">
          <div className="relative rounded-2xl border border-white/10 bg-[#111414] overflow-hidden">
            {/* Fake browser chrome */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-[#0F1212]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              <div className="ml-3 flex-1 max-w-xs mx-auto bg-white/5 rounded-md h-5 flex items-center px-2">
                <span className="text-[10px] text-white/30">app.sourcetrack.ai/dashboard</span>
              </div>
            </div>
            {/* Dashboard preview */}
            <div className="p-6">
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Revenue', value: '$48,320', delta: '+24%' },
                  { label: 'Conversions', value: '1,284', delta: '+18%' },
                  { label: 'AI Revenue', value: '$9,140', delta: '+61%' },
                  { label: 'Leads', value: '8,903', delta: '+12%' },
                ].map(k => (
                  <div key={k.label} className="bg-[#1A1D1D] rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{k.label}</p>
                    <p className="text-xl font-bold text-white">{k.value}</p>
                    <p className="text-xs text-st-lime mt-1">▲ {k.delta}</p>
                  </div>
                ))}
              </div>
              {/* Attribution table */}
              <div className="bg-[#1A1D1D] rounded-xl border border-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                  <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Top Sources</span>
                  <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded">Last Touch</span>
                </div>
                <div className="divide-y divide-white/5">
                  {[
                    { source: 'google / cpc', revenue: '$18,400', conv: 412, bar: 82, color: 'bg-blue-500' },
                    { source: 'chatgpt.com', revenue: '$6,890', conv: 156, bar: 31, color: 'bg-st-lime' },
                    { source: 'organic / seo', revenue: '$5,210', conv: 118, bar: 23, color: 'bg-purple-500' },
                    { source: 'perplexity.ai', revenue: '$2,250', conv: 51, bar: 10, color: 'bg-orange-500' },
                  ].map(row => (
                    <div key={row.source} className="flex items-center gap-4 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/80 font-medium truncate">{row.source}</p>
                        <div className="mt-1.5 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full ${row.color} rounded-full`} style={{ width: `${row.bar}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-white">{row.revenue}</p>
                        <p className="text-xs text-white/30">{row.conv} conv.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof strip ───────────────────────────────────────────── */}
      <section className="border-y border-white/5 py-6 px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-white/30 text-sm">
          <span>✓ 1.7 KB tracker script</span>
          <span>✓ 8 attribution models</span>
          <span>✓ 30+ AI platforms detected</span>
          <span>✓ GDPR-compliant cookieless mode</span>
          <span>✓ No GTM required</span>
          <span>✓ REST API + webhooks</span>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Built for teams that need to prove ROI</h2>
            <p className="text-white/40 max-w-xl mx-auto">If you spend money on marketing and need to know what actually works, SourceTrack is for you.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WHO_ITS_FOR.map(w => (
              <div key={w.role} className="rounded-2xl border border-white/8 bg-[#111414] p-6 hover:border-white/15 transition-colors">
                <p className="text-sm font-bold text-white mb-2">{w.role}</p>
                <p className="text-sm text-white/45 leading-relaxed">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Everything you need to understand your marketing</h2>
            <p className="text-white/40 max-w-xl mx-auto">Powerful attribution in a lightweight package. No bloated analytics suite — just the data that drives decisions.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div key={f.title} className="rounded-2xl border border-white/8 bg-[#111414] p-6 hover:border-white/15 transition-colors group">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI tracking highlight ────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-4">AI Era Attribution</p>
              <h2 className="text-3xl sm:text-4xl font-black mb-5 leading-tight">
                Your customers discover you on AI. Are you tracking it?
              </h2>
              <p className="text-white/45 mb-6 leading-relaxed">
                Millions of buying decisions now start with a ChatGPT or Perplexity query. Standard analytics tools are blind to this traffic. SourceTrack automatically identifies visitors arriving from AI platforms and attributes their conversions correctly.
              </p>
              <ul className="space-y-3">
                {[
                  'Detect 30+ AI platforms from referrer and UTM signals',
                  'See AI revenue vs. non-AI revenue side by side',
                  'Track which AI platforms convert best for your product',
                  'No manual UTM tagging needed for organic AI traffic',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/60">
                    <span className="text-st-lime mt-0.5 shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#111414] rounded-2xl border border-white/8 p-6">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-4">Detected AI platforms</p>
              <div className="flex flex-wrap gap-2">
                {AI_PLATFORMS.map(p => (
                  <span key={p}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white/60 border border-white/8 hover:border-st-lime/40 hover:text-white hover:bg-st-lime/5 transition-colors cursor-default">
                    {p}
                  </span>
                ))}
                <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-st-lime/10 text-st-lime border border-st-lime/20">
                  + 17 more
                </span>
              </div>
              <div className="mt-6 pt-5 border-t border-white/5 space-y-3">
                {[
                  { platform: 'ChatGPT', revenue: '$6,890', share: '14.3%', trend: '+88%' },
                  { platform: 'Perplexity', revenue: '$2,250', share: '4.7%', trend: '+124%' },
                  { platform: 'Claude', revenue: '$1,180', share: '2.4%', trend: '+67%' },
                ].map(row => (
                  <div key={row.platform} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{row.platform}</p>
                      <p className="text-xs text-white/30">{row.share} of revenue</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">{row.revenue}</p>
                      <p className="text-xs text-st-lime">{row.trend} MoM</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Attribution models ───────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-3">Attribution Models</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">See your data through 8 different lenses</h2>
            <p className="text-white/40 max-w-xl mx-auto">Every business has a different sales cycle. Switch between models to understand how different channels contribute at different stages of the funnel.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {MODELS.map(m => (
              <div key={m.name} className="rounded-2xl border border-white/8 bg-[#111414] p-5 hover:border-white/15 transition-colors">
                <div className={`w-2 h-2 rounded-full ${m.color} mb-3`} />
                <p className="text-sm font-bold text-white mb-1">{m.name}</p>
                <p className="text-xs text-white/40 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-3">Setup</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Live in under 3 minutes</h2>
            <p className="text-white/40 max-w-xl mx-auto">No data engineers. No tracking plans. No waiting. Just paste a script tag and start seeing where your revenue comes from.</p>
          </div>
          <div className="space-y-6">
            {STEPS.map((step, i) => (
              <div key={step.number} className="flex gap-6 items-start">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-sm font-black text-st-lime">{step.number}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1">{step.title}</h3>
                  <p className="text-sm text-white/45 mb-3 leading-relaxed">{step.body}</p>
                  {step.code && (
                    <pre className="bg-[#0F1212] border border-white/8 rounded-xl p-4 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                      {step.code}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy ──────────────────────────────────────────────────────── */}
      <section id="privacy" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div className="bg-[#111414] rounded-2xl border border-white/8 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-st-lime/10 border border-st-lime/20 flex items-center justify-center">
                  <span className="text-lg">🔒</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Cookieless mode</p>
                  <p className="text-xs text-white/40">GDPR · ePrivacy · PECR</p>
                </div>
                <div className="ml-auto">
                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-st-lime/10 text-st-lime border border-st-lime/20">Active</span>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'localStorage writes', value: '0', good: true },
                  { label: 'Cookies set', value: '0', good: true },
                  { label: 'Personal data in browser', value: 'None', good: true },
                  { label: 'Consent banner required', value: 'No', good: true },
                  { label: 'Visitor ID method', value: 'Server SHA-256', good: true },
                  { label: 'ID rotation', value: 'Daily', good: true },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-white/50">{row.label}</span>
                    <span className={`text-sm font-medium ${row.good ? 'text-st-lime' : 'text-red-400'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-4">Privacy-first</p>
              <h2 className="text-3xl sm:text-4xl font-black mb-5 leading-tight">
                Track conversions without touching a single cookie
              </h2>
              <p className="text-white/45 mb-6 leading-relaxed">
                Enable cookieless mode and SourceTrack switches to a server-derived visitor ID — a salted SHA-256 hash that rotates every 24 hours. No personal data ever leaves your server, no consent banner required.
              </p>
              <ul className="space-y-3">
                {[
                  'Zero browser storage in cookieless mode',
                  'IP address never stored — hashed server-side only',
                  'Visitor ID rotates daily — no persistent tracking',
                  'GDPR right-to-erasure API endpoint built-in',
                  'Configurable data retention policy (30 to 365 days)',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/60">
                    <span className="text-st-lime mt-0.5 shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-black mb-5 leading-tight">
            Start tracking what actually drives revenue
          </h2>
          <p className="text-white/40 mb-10 text-lg">
            14-day free trial. One script tag. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-st-lime text-black text-base font-bold rounded-xl hover:bg-st-lime/90 transition-colors">
              Create free account
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link to="/docs"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-white/10 text-white/70 text-base font-medium rounded-xl hover:border-white/20 hover:text-white transition-colors">
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-st-lime flex items-center justify-center">
              <span className="text-black font-black text-xs">S</span>
            </div>
            <span className="text-sm font-semibold text-white/70">SourceTrack</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-white/30">
            <Link to="/docs" className="hover:text-white transition-colors">API Docs</Link>
            <a href="mailto:support@sourcetrack.ai" className="hover:text-white transition-colors">Support</a>
            <span>© {new Date().getFullYear()} SourceTrack</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
