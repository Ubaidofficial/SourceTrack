import { Link } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Docs', href: '/docs' },
]

const FEATURES = [
  {
    icon: '⚡',
    title: 'One script tag. Live in 3 minutes.',
    body: 'Paste a 1.7 KB snippet into your <head> — 54× lighter than GA4 — and immediately capture every pageview, conversion, UTM parameter, and AI referral. No GTM. No config files. No data engineers.',
  },
  {
    icon: '🤖',
    title: "Track the traffic GA4 marks as 'direct'",
    body: 'Visitors from ChatGPT, Perplexity, Claude, Gemini, Grok, Copilot, DeepSeek, and 8 more AI platforms often land with no referrer — so GA4 calls them direct. SourceTrack identifies them correctly across 22 domains, so their conversions get attributed to the right source.',
  },
  {
    icon: '🔁',
    title: '8 attribution models. Not just last-click.',
    body: 'Last-click attribution gives all the credit to the final ad. SourceTrack pre-computes all 8 models — First Touch, Last Touch, Linear, Time Decay, U-Shaped, W-Shaped, and more — so you can switch views instantly and see which channels actually start and close deals.',
  },
  {
    icon: '📊',
    title: 'Any attribution slice in seconds',
    body: 'Group revenue by channel, source, campaign, country, device, AI platform, or landing page with a guided 7-step builder. Export to CSV. No SQL. No BI tool. No waiting for a data analyst.',
  },
  {
    icon: '🛤️',
    title: 'See exactly what closed the deal',
    body: 'Map every touchpoint from first visit to conversion — including AI referral visits that other tools miss. Understand which combination of ads, content, and sources work together, not just which one got the last click.',
  },
  {
    icon: '🔒',
    title: 'No consent banner. No cookies. Full data.',
    body: 'Cookieless mode uses a salted SHA-256 hash that rotates every 24 hours — server-side only. No localStorage, no cookies, no consent banner. Fully GDPR, ePrivacy, and PECR compliant — with the same conversion accuracy as cookie-based tracking.',
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
  'You.com', 'Phind', 'Kagi', 'Character.AI', 'Pi AI',
]

const INTEGRATIONS = [
  { name: 'Meta Ads',       category: 'CAPI', icon: '🟦', desc: 'Server-side conversion sync' },
  { name: 'Google Ads',     category: 'CAPI', icon: '🔵', desc: 'OAuth2 conversion upload' },
  { name: 'TikTok Ads',     category: 'CAPI', icon: '⬛', desc: 'Events API integration' },
  { name: 'LinkedIn Ads',   category: 'CAPI', icon: '🔷', desc: 'Conversion event API' },
  { name: 'Microsoft Ads',  category: 'CAPI', icon: '🟩', desc: 'UET CAPI integration' },
  { name: 'Shopify',        category: 'Platform', icon: '🛍️', desc: 'Script tag, 2-minute setup' },
  { name: 'WooCommerce',    category: 'Platform', icon: '🟣', desc: 'Script tag + order hook' },
  { name: 'Webflow',        category: 'Platform', icon: '🌐', desc: 'Custom code embed' },
  { name: 'WordPress',      category: 'Platform', icon: '🔵', desc: 'Header snippet or plugin' },
  { name: 'Stripe',         category: 'Revenue', icon: '💳', desc: 'Webhook revenue sync' },
  { name: 'Any website',    category: 'Universal', icon: '✨', desc: 'One script tag, any stack' },
  { name: 'REST API',       category: 'Universal', icon: '⚡', desc: 'Custom server-side events' },
]

const PRICING = [
  {
    name: 'Trial',
    price: '$0',
    period: '14 days',
    limit: '200 conversions',
    color: 'border-white/10',
    cta: 'Start free trial',
    ctaStyle: 'border border-white/20 text-white hover:border-white/40',
    features: ['200 conversions/month', 'All attribution models', 'AI platform detection', 'API access', 'No credit card required'],
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$49',
    period: '/month',
    limit: '1,000 conversions',
    color: 'border-white/10',
    cta: 'Get started',
    ctaStyle: 'border border-white/20 text-white hover:border-white/40',
    features: ['1,000 conversions/month', 'All 8 attribution models', 'AI traffic attribution', 'Server-side CAPI sync', 'Customer journey maps', 'CSV export'],
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$99',
    period: '/month',
    limit: '4,000 conversions',
    color: 'border-st-lime/40',
    cta: 'Start Pro trial',
    ctaStyle: 'bg-st-lime text-black font-bold hover:bg-st-lime/90',
    features: ['4,000 conversions/month', 'Everything in Starter', 'Cookieless tracking mode', 'Data retention controls', 'Nightly attribution jobs', 'Priority support'],
    highlight: true,
  },
  {
    name: 'Agency',
    price: '$199',
    period: '/month',
    limit: '10,000 conversions',
    color: 'border-white/10',
    cta: 'Contact us',
    ctaStyle: 'border border-white/20 text-white hover:border-white/40',
    features: ['10,000 conversions/month', 'Everything in Pro', 'Multi-site management', 'White-label reports', 'Dedicated onboarding', 'SLA support'],
    highlight: false,
  },
]

const FAQS = [
  {
    q: 'How is SourceTrack different from Google Analytics?',
    a: 'GA4 shows last-click attribution only and is blind to AI referrals (ChatGPT, Perplexity, etc.). SourceTrack gives you 8 attribution models, server-side CAPI sync to ad platforms, and explicit AI traffic detection — so you can see which touchpoints actually drove revenue, not just the last click before conversion.',
  },
  {
    q: 'Do I need a developer to set it up?',
    a: 'No. Paste one 1.7 KB script tag into your site\'s <head> and you\'re tracking within minutes. For server-side events (e.g. Stripe purchases), you call a single REST endpoint from your backend. Most customers are live in under 3 minutes.',
  },
  {
    q: 'Does this work with Shopify / WooCommerce / Webflow?',
    a: 'Yes. The tracker works on any website that can embed JavaScript. For Shopify, paste the snippet in your theme\'s <head> or via Shopify Scripts. For WooCommerce, use the header snippet plugin. Webflow supports custom code embeds natively.',
  },
  {
    q: 'Is SourceTrack GDPR compliant?',
    a: 'Yes. Enable cookieless mode (one attribute on the script tag) and SourceTrack uses a server-derived SHA-256 visitor ID that rotates daily — no cookies, no localStorage, no consent banner required. You can also call the GDPR deletion API to erase any visitor\'s data on request, and configure data retention windows per site.',
  },
  {
    q: 'What is a "conversion" for billing purposes?',
    a: 'A conversion is any event you fire via sourcetrack.conversion() — a purchase, sign-up, form submit, trial start, or any custom event. Pageviews and session tracking are unlimited and do not count toward your conversion limit.',
  },
  {
    q: 'Can I track AI referrals from ChatGPT and Perplexity?',
    a: 'Yes — this is one of SourceTrack\'s core features. We detect visitors arriving from 15 AI platforms (22 domains) by referrer and UTM signals, including ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek, and more. Their conversions are attributed just like any other channel.',
  },
  {
    q: 'How does server-side CAPI sync work?',
    a: 'When a conversion is fired, SourceTrack simultaneously sends a server-side event to Meta CAPI, Google Ads, TikTok, LinkedIn, and Microsoft UET (whichever you\'ve configured). This bypasses browser ad-blockers and iOS/Safari restrictions that block pixel-only tracking, giving ad platforms more complete conversion data for smarter bidding.',
  },
  {
    q: 'What attribution models are available?',
    a: 'Eight models: First Touch, Last Touch, Linear, Time Decay (7-day half-life), U-Shaped (40/20/40), W-Shaped (30/30/30/10), Position Based, and Data Driven. The nightly attribution job pre-computes multi-touch models so dashboards load instantly.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Paste one line',
    body: 'Drop the 1.7 KB snippet into your <head>. Works on Webflow, WordPress, Shopify, or any custom stack — no plugin, no GTM container, no additional config.',
    code: `<script async\n  src="https://app.sourcetrack.ai/tracker/tracker.min.js"\n  data-site-key="YOUR_KEY">\n</script>`,
  },
  {
    number: '02',
    title: 'Fire one conversion call',
    body: 'Call sourcetrack.conversion() on any purchase, sign-up, or form submit. Pass a revenue value and order ID if you have them. That\'s the entire integration.',
    code: `sourcetrack.conversion({\n  value: 99,\n  type: 'purchase',\n  order_id: 'ORD-123'\n})`,
  },
  {
    number: '03',
    title: 'See which sources drive revenue — including AI',
    body: 'Open your dashboard to see revenue and conversions by channel, campaign, device, and AI platform. The sources GA4 marks as direct now have names.',
    code: null,
  },
]

const WHO_ITS_FOR = [
  {
    role: 'Performance marketers',
    desc: 'See which campaigns, keywords, and creatives generate revenue — and sync that data back to Meta, Google, and TikTok CAPI automatically so the ad platforms bid on winners, not guesses.',
  },
  {
    role: 'Growth teams',
    desc: 'Map every touchpoint from first-touch to conversion, including the AI platform query that started the journey — across 8 attribution models, not one.',
  },
  {
    role: 'Agencies',
    desc: 'Run multi-model attribution reports for every client in seconds, export to CSV, and surface the AI-driven revenue they didn\'t know existed. That\'s a new value-add on every retainer.',
  },
  {
    role: 'E-commerce brands',
    desc: 'Stop over-crediting paid ads. See exactly how much purchase revenue started with an AI search — and rebalance your budget accordingly.',
  },
  {
    role: 'SaaS companies',
    desc: 'Connect every trial start and upgrade to the exact touchpoints that drove it — including the ChatGPT recommendation your pipeline never captured.',
  },
  {
    role: 'Privacy-first teams',
    desc: 'Track every conversion without cookies, consent banners, or browser storage. Cookieless mode uses a server-side rotating ID — same data quality, zero compliance risk.',
  },
]

// ── SVG Sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ data, color = '#D7F550' }) {
  const h = 44, w = 300
  const max = Math.max(...data), min = Math.min(...data)
  const r = max - min || 1
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 6 - ((v - min) / r) * (h - 12)
  ])
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const fill = `${line} L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace('#', '')})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0].toFixed(1)} cy={pts[pts.length - 1][1].toFixed(1)} r="3" fill={color} />
    </svg>
  )
}

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target, duration = 900, trigger = 0) {
  const [val, setVal] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    let start = null
    const animate = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * e))
      if (p < 1) raf.current = requestAnimationFrame(animate)
    }
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf.current)
  }, [target, trigger])
  return val
}

// ── Demo data ─────────────────────────────────────────────────────────────────
const REV_SPARK  = [28400, 31200, 29800, 36500, 41200, 44800, 48320]
const AI_SPARK   = [3200, 4100, 3800, 5600, 7200, 8400, 9140]

const JOURNEY_STEPS = [
  { channel: 'ChatGPT', icon: '🤖', day: 'Day 1', type: 'AI Referral', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
  { channel: 'Google Ads', icon: '🔍', day: 'Day 3', type: 'Paid Search', border: 'border-blue-500/40', bg: 'bg-blue-500/10', text: 'text-blue-300' },
  { channel: 'Email', icon: '✉️', day: 'Day 6', type: 'Newsletter', border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-300' },
  { channel: 'Purchase', icon: '★', day: 'Day 7', type: '$249', border: 'border-st-lime/40', bg: 'bg-st-lime/10', text: 'text-st-lime' },
]

const LIVE_SEED = [
  { type: 'conversion', source: 'google / cpc', value: '$249', ago: '2s' },
  { type: 'pageview', source: 'chatgpt.com', value: null, ago: '9s' },
  { type: 'conversion', source: 'perplexity.ai', value: '$99', ago: '21s' },
  { type: 'pageview', source: 'organic / seo', value: null, ago: '35s' },
  { type: 'conversion', source: 'email / newsletter', value: '$149', ago: '48s' },
]

const NEW_LIVE = [
  { type: 'pageview', source: 'chatgpt.com', value: null },
  { type: 'conversion', source: 'google / cpc', value: '$199' },
  { type: 'pageview', source: 'claude.ai', value: null },
  { type: 'conversion', source: 'perplexity.ai', value: '$299' },
  { type: 'pageview', source: 'organic / seo', value: null },
  { type: 'conversion', source: 'meta / paid', value: '$149' },
]

// ── Interactive dashboard widget ──────────────────────────────────────────────
function LiveDashboard() {
  const [tab, setTab] = useState(0)
  const [tick, setTick] = useState(0)
  const [bars, setBars] = useState(true)
  const [liveEvents, setLiveEvents] = useState(LIVE_SEED)
  const liveRef = useRef(0)
  const TABS = ['Attribution', 'AI Platforms', 'Journey', 'Live Events']

  // Auto-cycle every 5 s
  useEffect(() => {
    const id = setInterval(() => {
      setTab(t => (t + 1) % TABS.length)
      setTick(k => k + 1)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // Animate bars after tab switch
  useEffect(() => {
    setBars(false)
    const t = setTimeout(() => setBars(true), 120)
    return () => clearTimeout(t)
  }, [tab])

  // Simulate live events only when that tab is active
  useEffect(() => {
    if (tab !== 3) return
    const id = setInterval(() => {
      const ev = NEW_LIVE[liveRef.current % NEW_LIVE.length]
      liveRef.current++
      setLiveEvents(prev => [{ ...ev, ago: 'now' }, ...prev.slice(0, 5)])
    }, 1800)
    return () => clearInterval(id)
  }, [tab])

  const rev   = useCountUp(48320, 900, tick)
  const conv  = useCountUp(1284,  900, tick)
  const aiRev = useCountUp(9140,  900, tick)
  const aiLd  = useCountUp(284,   900, tick)

  return (
    <div className="relative rounded-2xl border border-white/10 bg-[#0F1212] overflow-hidden shadow-2xl">
      {/* CSS keyframes injected inline */}
      <style>{`
        @keyframes dash-progress { from { width: 0% } to { width: 100% } }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        .dash-anim { animation: fade-in-up 0.25s ease-out both; }
        .progress-bar { animation: dash-progress 5s linear forwards; }
      `}</style>

      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-[#0C0E0E]">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
        <div className="ml-3 flex-1 max-w-xs bg-white/5 rounded-md h-5 flex items-center px-2">
          <span className="text-[10px] text-white/30">app.sourcetrack.ai/dashboard</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-white/40">3 live now</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center px-4 pt-3 border-b border-white/5 gap-0.5">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => { setTab(i); setTick(k => k + 1) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-all ${
              tab === i ? 'bg-[#1A1D1D] text-white border border-b-transparent border-white/10' : 'text-white/40 hover:text-white/70'
            }`}>
            {t}
          </button>
        ))}
        <div className="ml-auto mb-1 w-16 h-1 bg-white/5 rounded-full overflow-hidden">
          <div key={tick} className="h-full bg-st-lime/60 rounded-full progress-bar" />
        </div>
      </div>

      {/* Panel body */}
      <div className="p-4" style={{ minHeight: 340 }}>

        {/* ── Tab 0 — Attribution ── */}
        {tab === 0 && (
          <div className="space-y-3 dash-anim">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Revenue',     val: `$${rev.toLocaleString()}`,  delta: '+24%' },
                { label: 'Conversions', val: conv.toLocaleString(),        delta: '+18%' },
                { label: 'AI Revenue',  val: `$${aiRev.toLocaleString()}`, delta: '+61%' },
                { label: 'Sessions',    val: '24,830',                     delta: '+8%' },
              ].map(k => (
                <div key={k.label} className="bg-[#1A1D1D] rounded-xl p-3 border border-white/5">
                  <p className="text-[9px] text-white/40 uppercase tracking-wider">{k.label}</p>
                  <p className="text-base font-bold text-white mt-0.5 tabular-nums">{k.val}</p>
                  <p className="text-[9px] text-st-lime">▲ {k.delta}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#1A1D1D] rounded-xl border border-white/5 px-3 pt-2 pb-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-white/40 uppercase tracking-wider">Revenue — last 7 days</span>
                <span className="text-[9px] text-st-lime">Last Touch</span>
              </div>
              <Sparkline data={REV_SPARK} />
            </div>
            <div className="bg-[#1A1D1D] rounded-xl border border-white/5 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5">
                <span className="text-[9px] text-white/40 font-semibold uppercase tracking-wider">Top Attribution Sources</span>
              </div>
              {[
                { source: 'google / cpc',   rev: '$18,400', bar: 100, color: 'bg-blue-500' },
                { source: 'chatgpt.com',    rev: '$6,890',  bar: 37,  color: 'bg-st-lime' },
                { source: 'organic / seo',  rev: '$5,210',  bar: 28,  color: 'bg-purple-500' },
                { source: 'perplexity.ai',  rev: '$2,250',  bar: 12,  color: 'bg-orange-500' },
              ].map(row => (
                <div key={row.source} className="flex items-center gap-3 px-3 py-2 border-b border-white/5 last:border-0">
                  <p className="text-xs text-white/70 w-24 shrink-0 truncate">{row.source}</p>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${row.color} rounded-full transition-all duration-700`}
                      style={{ width: bars ? `${row.bar}%` : '0%' }} />
                  </div>
                  <p className="text-xs font-semibold text-white w-14 text-right shrink-0">{row.rev}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab 1 — AI Platforms ── */}
        {tab === 1 && (
          <div className="space-y-3 dash-anim">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'AI Revenue', val: `$${aiRev.toLocaleString()}`, sub: '+61% MoM', accent: true },
                { label: 'AI Leads',   val: aiLd.toLocaleString(),         sub: '+44% MoM', accent: false },
                { label: 'AI Share',   val: '18.9%',                       sub: 'of total revenue', accent: false },
                { label: 'Platforms',  val: '8 active',                    sub: 'this period', accent: false },
              ].map(k => (
                <div key={k.label} className={`rounded-xl p-3 border ${k.accent ? 'bg-st-lime/5 border-st-lime/20' : 'bg-[#1A1D1D] border-white/5'}`}>
                  <p className="text-[9px] text-white/40 uppercase tracking-wider">{k.label}</p>
                  <p className={`text-base font-bold mt-0.5 tabular-nums ${k.accent ? 'text-st-lime' : 'text-white'}`}>{k.val}</p>
                  <p className="text-[9px] text-white/30">{k.sub}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#1A1D1D] rounded-xl border border-white/5 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5">
                <span className="text-[9px] text-white/40 font-semibold uppercase tracking-wider">Platform Breakdown</span>
              </div>
              {[
                { name: 'ChatGPT',    rev: '$6,890', share: 75, leads: 186, dot: 'bg-emerald-400' },
                { name: 'Perplexity', rev: '$1,240', share: 14, leads: 44,  dot: 'bg-purple-400' },
                { name: 'Claude',     rev: '$580',   share: 6,  leads: 31,  dot: 'bg-orange-400' },
                { name: 'Gemini',     rev: '$430',   share: 5,  leads: 23,  dot: 'bg-blue-400' },
              ].map(p => (
                <div key={p.name} className="flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.dot}`} />
                  <p className="text-xs text-white/80 font-medium w-20 shrink-0">{p.name}</p>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-st-lime rounded-full transition-all duration-700"
                      style={{ width: bars ? `${p.share}%` : '0%' }} />
                  </div>
                  <p className="text-xs font-semibold text-white w-14 text-right shrink-0">{p.rev}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#1A1D1D] rounded-xl border border-white/5 px-3 pt-2 pb-1">
              <p className="text-[9px] text-white/40 mb-1">AI revenue trend — 7 days</p>
              <Sparkline data={AI_SPARK} color="#34d399" />
            </div>
          </div>
        )}

        {/* ── Tab 2 — Journey ── */}
        {tab === 2 && (
          <div className="space-y-3 dash-anim">
            <p className="text-[10px] text-white/30 text-center">Sample customer journey — 7 days · U-Shaped attribution</p>
            <div className="flex items-stretch gap-2">
              {JOURNEY_STEPS.map((step, i) => (
                <div key={step.channel} className="flex-1 flex flex-col gap-1">
                  <div className={`rounded-xl border p-2.5 text-center flex-1 flex flex-col items-center justify-center ${step.border} ${step.bg}`}>
                    <span className="text-2xl">{step.icon}</span>
                    <p className={`text-[10px] font-bold mt-1 ${step.text}`}>{step.channel}</p>
                    <p className="text-[9px] text-white/40 mt-0.5">{step.type}</p>
                  </div>
                  <p className="text-[9px] text-white/25 text-center">{step.day}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 px-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex-1 flex items-center">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[9px] text-white/20 px-0.5">→</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Time to Convert', val: '7 days' },
                { label: 'Touchpoints',     val: '3 sources' },
                { label: 'Order Value',      val: '$249' },
              ].map(s => (
                <div key={s.label} className="bg-[#1A1D1D] rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-[9px] text-white/30 uppercase tracking-wider">{s.label}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{s.val}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#1A1D1D] rounded-xl border border-white/5 px-3 py-2.5">
              <p className="text-[10px] text-white/50 leading-relaxed">
                <span className="text-st-lime font-semibold">ChatGPT (first)</span> gets 40% ·{' '}
                <span className="text-white/40">Google 20%</span> ·{' '}
                <span className="text-white/40">Email 10%</span> ·{' '}
                <span className="text-blue-400 font-semibold">Purchase (last) 30%</span>
              </p>
            </div>
          </div>
        )}

        {/* ── Tab 3 — Live Events ── */}
        {tab === 3 && (
          <div className="space-y-2 dash-anim">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-[10px] text-white/50">Live event stream · updating in real time</p>
            </div>
            {liveEvents.slice(0, 6).map((ev, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 border transition-all duration-300 ${
                i === 0 && ev.ago === 'now' ? 'bg-white/5 border-white/15' : 'bg-[#1A1D1D] border-white/5'
              }`}>
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                  ev.type === 'conversion' ? 'bg-st-lime/20 text-st-lime' : 'bg-white/10 text-white/50'
                }`}>
                  {ev.type === 'conversion' ? 'CONV' : 'VIEW'}
                </span>
                <span className="text-xs text-white/70 flex-1 truncate">{ev.source}</span>
                {ev.value && <span className="text-xs font-bold text-st-lime shrink-0">{ev.value}</span>}
                <span className="text-[9px] text-white/30 w-8 text-right shrink-0">{ev.ago}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <p className="text-[9px] text-white/20">powered by tracker.min.js · 1.7 KB</p>
              <p className="text-[9px] text-st-lime">● tracking</p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── FAQ accordion item ────────────────────────────────────────────────────────
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-2xl border transition-colors ${open ? 'border-white/15 bg-[#111414]' : 'border-white/8 bg-[#111414]'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="text-sm font-semibold text-white leading-snug">{q}</span>
        <span className={`shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5">
          <p className="text-sm text-white/50 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

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
      <Helmet>
        <title>SourceTrack — Track ChatGPT Traffic & Multi-Touch Attribution</title>
        <meta name="description" content="The only attribution tool that tracks ChatGPT, Perplexity & 13 other AI platforms — plus full multi-touch attribution and server-side CAPI sync to Meta, Google, TikTok, LinkedIn & Microsoft. One 1.7 KB script. Live in 3 minutes. From $49/mo." />
        <link rel="canonical" href="https://sourcetrack.ai/" />
        <meta property="og:title"       content="SourceTrack — Track ChatGPT Traffic & Multi-Touch Attribution" />
        <meta property="og:description" content="Your AI traffic is being attributed to 'direct' right now. SourceTrack fixes it — tracking ChatGPT, Perplexity, and 13 AI platforms with full multi-touch attribution and CAPI sync." />
        <meta property="og:url"         content="https://sourcetrack.ai/" />
        <meta property="og:type"        content="website" />
        <meta property="og:image"       content="https://sourcetrack.ai/og-image.png" />
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:site"        content="@sourcetrackio" />
        <meta name="twitter:title"       content="SourceTrack — AI-Powered Attribution" />
        <meta name="twitter:description" content="Track every conversion source including AI platforms. Multi-touch attribution with server-side tracking." />
        <meta name="twitter:image"       content="https://sourcetrack.ai/og-image.png" />
        {/* SoftwareApplication — product pricing & features */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "SourceTrack",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "url": "https://sourcetrack.ai",
          "description": "Multi-touch attribution platform with server-side CAPI sync, 15 AI platform detection, 8 attribution models, and GDPR cookieless compliance for eCommerce, SaaS, and lead generation businesses.",
          "offers": [
            { "@type": "Offer", "name": "Trial",   "price": "0",   "priceCurrency": "USD", "description": "14-day free trial, 200 conversions included" },
            { "@type": "Offer", "name": "Starter", "price": "49",  "priceCurrency": "USD", "priceSpecification": { "@type": "UnitPriceSpecification", "price": "49",  "priceCurrency": "USD", "unitText": "MONTH" } },
            { "@type": "Offer", "name": "Pro",     "price": "99",  "priceCurrency": "USD", "priceSpecification": { "@type": "UnitPriceSpecification", "price": "99",  "priceCurrency": "USD", "unitText": "MONTH" } },
            { "@type": "Offer", "name": "Agency",  "price": "199", "priceCurrency": "USD", "priceSpecification": { "@type": "UnitPriceSpecification", "price": "199", "priceCurrency": "USD", "unitText": "MONTH" } }
          ],
          "featureList": [
            "First Touch, Last Touch, Linear, U-Shaped, W-Shaped, Time Decay, Position Based, Data Driven attribution models",
            "15 AI platform detection — ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek and more",
            "Server-side Conversions API sync — Meta CAPI, Google Ads, TikTok, LinkedIn, Microsoft UET",
            "GDPR-compliant cookieless mode — no cookies, no localStorage, no consent banner required",
            "1.7 KB tracker script, works on Shopify, WordPress, Webflow, any website",
            "Data retention controls and GDPR right-to-erasure API",
            "Real-time live dashboard, visitor journey timelines, multi-channel report builder"
          ]
        })}</script>

        {/* Organization — brand entity for AI knowledge graphs */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "SourceTrack",
          "url": "https://sourcetrack.ai",
          "logo": "https://sourcetrack.ai/apple-touch-icon.png",
          "description": "SourceTrack is a multi-touch marketing attribution platform that tracks every conversion source — including AI platforms like ChatGPT, Perplexity, and Claude — using server-side tracking, 8 attribution models, and GDPR-compliant cookieless mode.",
          "foundingDate": "2024",
          "sameAs": [],
          "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "customer support",
            "url": "https://sourcetrack.ai/docs"
          }
        })}</script>

        {/* FAQPage — powers direct FAQ answers in AI Overviews */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": FAQS.map(({ q, a }) => ({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": { "@type": "Answer", "text": a }
          }))
        })}</script>

        {/* HowTo — installation steps for "how to set up attribution" queries */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          "name": "How to set up multi-touch attribution with SourceTrack",
          "description": "Add SourceTrack to any website in under 3 minutes to start tracking conversions across all marketing channels including AI platforms.",
          "totalTime": "PT3M",
          "step": [
            {
              "@type": "HowToStep",
              "position": 1,
              "name": "Add the snippet",
              "text": "Paste one 1.7 KB JavaScript snippet into your site's <head>. Works on any website — Webflow, WordPress, Shopify, or custom code."
            },
            {
              "@type": "HowToStep",
              "position": 2,
              "name": "Fire your first conversion",
              "text": "Call sourcetrack.conversion() when a purchase, sign-up, or form submission happens. Pass an optional revenue value and order ID."
            },
            {
              "@type": "HowToStep",
              "position": 3,
              "name": "See where revenue comes from",
              "text": "Open your SourceTrack dashboard to see revenue, conversions, and visitor journeys broken down by every marketing source — including AI referrals."
            }
          ]
        })}</script>
      </Helmet>

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
            <span className="text-xs font-medium text-st-lime">GA4 can't see ChatGPT traffic. SourceTrack can. → Start free</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight mb-6">
            Your competitors don't know their{' '}
            <span className="text-st-lime">ChatGPT traffic</span>{' '}
            exists. You will.
          </h1>

          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            SourceTrack is the only attribution tool that tracks conversions from ChatGPT, Perplexity, and 13 other AI platforms — plus full multi-touch attribution and CAPI sync to Meta, Google, TikTok, LinkedIn, and Microsoft. One 1.7 KB script. Under 3 minutes to live data.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-st-lime text-black text-sm font-bold rounded-xl hover:bg-st-lime/90 transition-colors">
              See your AI traffic — free for 14 days
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link to="/docs"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-white/10 text-white/70 text-sm font-medium rounded-xl hover:border-white/20 hover:text-white transition-colors">
              View API docs
            </Link>
          </div>

          <p className="text-xs text-white/30 mt-4">No credit card · GDPR-compliant · Cancel anytime · Live in under 3 minutes</p>
        </div>

        {/* Hero visual — interactive live dashboard */}
        <div className="max-w-4xl mx-auto mt-16">
          <LiveDashboard />
        </div>
      </section>

      {/* ── Social proof strip ───────────────────────────────────────────── */}
      <section className="border-y border-white/5 py-6 px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-white/30 text-sm">
          <span>✓ 1.7 KB script — 54× lighter than GA4</span>
          <span>✓ 15 AI platforms tracked</span>
          <span>✓ 8 attribution models</span>
          <span>✓ CAPI sync to 5 ad platforms</span>
          <span>✓ Cookieless &amp; GDPR-ready</span>
          <span>✓ No GTM needed</span>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Built for teams tired of guessing</h2>
            <p className="text-white/40 max-w-xl mx-auto">Marketing budgets are shrinking. AI is reshaping where buyers start their research. SourceTrack shows you exactly where revenue comes from — including the channels your current analytics can't see.</p>
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
            <h2 className="text-3xl sm:text-4xl font-black mb-4">One tool. Every attribution question answered.</h2>
            <p className="text-white/40 max-w-xl mx-auto">GA4 gives you pageviews. SourceTrack gives you revenue by source — including the AI platforms GA4 can't see — in a 1.7 KB script with no configuration.</p>
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

      {/* ── Integrations ────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-3">Integrations</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Plugs into your entire stack</h2>
            <p className="text-white/40 max-w-xl mx-auto">Server-side CAPI sync to every major ad platform. Works with any website or e-commerce platform — no native connector required.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {INTEGRATIONS.map(int => (
              <div key={int.name} className="rounded-xl border border-white/8 bg-[#111414] p-4 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{int.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white leading-tight">{int.name}</p>
                    <span className={`text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded ${
                      int.category === 'CAPI' ? 'bg-st-lime/10 text-st-lime' :
                      int.category === 'Revenue' ? 'bg-purple-500/15 text-purple-300' :
                      'bg-white/8 text-white/40'
                    }`}>{int.category}</span>
                  </div>
                </div>
                <p className="text-xs text-white/35 leading-relaxed">{int.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-white/25 mt-6">All CAPI integrations bypass ad-blockers and iOS tracking restrictions for more complete conversion data.</p>
        </div>
      </section>

      {/* ── AI tracking highlight ────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-4">AI Era Attribution</p>
              <h2 className="text-3xl sm:text-4xl font-black mb-5 leading-tight">
                Every month you don't track AI traffic, you're misattributing the revenue it drives.
              </h2>
              <p className="text-white/45 mb-6 leading-relaxed">
                ChatGPT and Perplexity referrals often arrive with no referrer header — so GA4 logs them as direct traffic. That means the revenue they drive gets silently credited to the wrong source. SourceTrack identifies AI visitors correctly across 15 platforms and 22 domains using referrer signals and UTM pattern matching — no manual tagging required.
              </p>
              <ul className="space-y-3">
                {[
                  '15 AI platforms, 22 domains — detected automatically from referrer and UTM signals',
                  'AI revenue vs. non-AI revenue in one dashboard view — no custom segmentation needed',
                  'See which AI platforms drive buyers vs. browsers for your specific product',
                  'No manual UTM tagging — organic AI traffic is identified server-side',
                  "Conversions previously logged as 'direct' now have a source",
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
                  + Character.AI, Pi AI
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
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Your sales cycle is unique. Your attribution model should be too.</h2>
            <p className="text-white/40 max-w-xl mx-auto">Last-click makes paid search look like a hero and content look useless. First-touch does the opposite. SourceTrack pre-computes all 8 models simultaneously — switch views instantly to see which channels open deals, which close them, and which do both.</p>
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
            <p className="text-white/40 max-w-xl mx-auto">No data engineers. No tracking plans. No GTM. No waiting. Paste one script tag and your first attribution data appears before your coffee cools.</p>
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
                Enable cookieless mode and SourceTrack switches to a server-derived, daily-rotating SHA-256 hash. No personal data ever touches the browser. No consent banner needed. Same attribution accuracy — just zero compliance exposure.
              </p>
              <ul className="space-y-3">
                {[
                  'Zero browser storage — no cookies, no localStorage, no fingerprinting',
                  'IP address hashed server-side and never stored in raw form',
                  'Visitor ID rotates every 24 hours — impossible to build a long-term profile',
                  'GDPR right-to-erasure endpoint built in — one API call, user deleted',
                  'Data retention window: 30 to 365 days, configurable per workspace',
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

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Pay for conversions. Pageviews are always free.</h2>
            <p className="text-white/40 max-w-xl mx-auto">No pageview caps. No session limits. No surprise overages. You only pay for conversion events — the moment you actually get value from the data.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PRICING.map(plan => (
              <div key={plan.name} className={`rounded-2xl border p-6 flex flex-col ${plan.highlight ? 'bg-st-lime/5 border-st-lime/40' : 'bg-[#111414] border-white/8'}`}>
                {plan.highlight && (
                  <div className="mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-st-lime text-black px-2 py-0.5 rounded-full">Most popular</span>
                  </div>
                )}
                <p className={`text-sm font-bold mb-1 ${plan.highlight ? 'text-st-lime' : 'text-white/60'}`}>{plan.name}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-black text-white">{plan.price}</span>
                  <span className="text-sm text-white/40">{plan.period}</span>
                </div>
                <p className="text-xs text-white/35 mb-5">{plan.limit}</p>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-white/55">
                      <span className={`shrink-0 mt-0.5 ${plan.highlight ? 'text-st-lime' : 'text-white/30'}`}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/signup"
                  className={`w-full text-center text-sm px-4 py-2.5 rounded-xl transition-colors ${plan.ctaStyle}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-white/25 mt-8">All plans include a 14-day free trial. No credit card. Cancel any time. Switch plans as your conversion volume grows.</p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Questions we get before the first conversion fires</h2>
          </div>
          <div className="space-y-4">
            {FAQS.map((item, i) => (
              <FAQItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-black mb-5 leading-tight">
            Your AI traffic is being attributed to{' '}
            <span className="text-st-lime">'direct'</span>{' '}
            right now.
          </h2>
          <p className="text-white/40 mb-10 text-lg">
            Every day without SourceTrack, AI-driven conversions are credited to the wrong source. Fix it in under 3 minutes. No credit card.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-st-lime text-black text-base font-bold rounded-xl hover:bg-st-lime/90 transition-colors">
              Start seeing your AI traffic — free
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
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Link to="/docs" className="hover:text-white transition-colors">API Docs</Link>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            <a href="mailto:support@sourcetrack.ai" className="hover:text-white transition-colors">Support</a>
            <span>© {new Date().getFullYear()} SourceTrack</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
