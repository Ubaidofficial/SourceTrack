import { Link } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { LogoFullDark } from '../components/Logo'

// ── Shared scroll animation ───────────────────────────────────────────────────
function useInView(threshold = 0.1) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { threshold }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, inView]
}

function FadeUp({ children, delay = 0, className = '' }) {
  const [ref, inView] = useInView()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-2xl border transition-colors ${open ? 'border-white/15 bg-[#111414]' : 'border-white/8 bg-[#111414]'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left">
        <span className="text-sm font-semibold text-white leading-snug">{q}</span>
        <span className={`shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && <div className="px-6 pb-5"><p className="text-sm text-white/50 leading-relaxed">{a}</p></div>}
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0C0E0E]/95 backdrop-blur border-b border-white/5' : ''}`}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <LogoFullDark className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-white/70 hover:text-white transition-colors px-3 py-1.5 hidden sm:block">Sign in</Link>
          <Link to="/signup" className="text-sm font-semibold bg-st-lime text-black px-4 py-2 rounded-lg hover:bg-st-lime/90 transition-colors">Start free</Link>
        </div>
      </div>
    </header>
  )
}

// ── Main SolutionPage template ────────────────────────────────────────────────
export default function SolutionPage({ data }) {
  const {
    slug, title, description, canonical, ogTitle, ogDescription,
    badge, headline, headlineAccent, subheadline,
    stats, features, steps, faqs, jsonLd,
    ctaHeadline, ctaBody,
  } = data

  return (
    <div className="bg-[#0C0E0E] text-white min-h-screen font-sans antialiased">
      <style>{`
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes glow-pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.7 } }
        .glow-anim { animation: glow-pulse 4s ease-in-out infinite; }
      `}</style>

      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title"       content={ogTitle} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:url"         content={canonical} />
        <meta property="og:type"        content="website" />
        <meta property="og:image"       content="https://sourcetrack.ai/og-image.png" />
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:site"        content="@sourcetrackio" />
        <meta name="twitter:title"       content={ogTitle} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image"       content="https://sourcetrack.ai/og-image.png" />
        {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
      </Helmet>

      <Nav />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="glow-anim absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-st-lime/5 blur-3xl" />
          <div className="glow-anim absolute top-40 right-0 w-72 h-72 rounded-full bg-blue-500/5 blur-3xl" style={{ animationDelay: '2s' }} />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-st-lime/30 bg-st-lime/5 mb-8"
            style={{ animation: 'fade-in-up 0.5s ease-out both' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-st-lime animate-pulse" />
            <span className="text-xs font-medium text-st-lime">{badge}</span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-black leading-[1.05] tracking-tight mb-6"
            style={{ animation: 'fade-in-up 0.6s ease-out 0.1s both' }}>
            {headline}{' '}
            <span className="text-st-lime">{headlineAccent}</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ animation: 'fade-in-up 0.6s ease-out 0.2s both' }}>
            {subheadline}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3"
            style={{ animation: 'fade-in-up 0.6s ease-out 0.3s both' }}>
            <Link to="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-st-lime text-black text-sm font-bold rounded-xl hover:bg-st-lime/90 transition-all hover:scale-[1.02]">
              Start free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link to="/#pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 border border-white/10 text-white/70 text-sm font-medium rounded-xl hover:border-white/20 hover:text-white transition-all">
              See pricing
            </Link>
          </div>
          <p className="text-xs text-white/30 mt-4">Free attribution tracking — up to 30 conversions free · Upgrade any time · Privacy-conscious tracking</p>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      {stats && (
        <section className="border-y border-white/5 py-14 px-6">
          <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
            {stats.map((s, i) => (
              <FadeUp key={s.label} delay={i * 100}>
                <div className="text-center">
                  <p className="text-4xl font-black text-st-lime mb-2">{s.value}</p>
                  <p className="text-sm font-semibold text-white mb-1">{s.label}</p>
                  <p className="text-xs text-white/35 leading-relaxed">{s.sub}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </section>
      )}

      {/* ── Features ──────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeUp>
            <div className="text-center mb-14">
              <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-3">Features</p>
              <h2 className="text-3xl sm:text-4xl font-black mb-4">{features.heading}</h2>
              <p className="text-white/40 max-w-xl mx-auto">{features.subheading}</p>
            </div>
          </FadeUp>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.items.map((f, i) => (
              <FadeUp key={f.title} delay={(i % 3) * 80}>
                <div className="rounded-2xl border border-white/8 bg-[#111414] p-6 hover:border-white/15 hover:-translate-y-0.5 transition-all group h-full">
                  <div className="text-3xl mb-4 group-hover:scale-110 transition-transform duration-200 inline-block">{f.icon}</div>
                  <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-white/45 leading-relaxed">{f.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      {steps && (
        <section className="py-24 px-6 border-t border-white/5">
          <div className="max-w-4xl mx-auto">
            <FadeUp>
              <div className="text-center mb-14">
                <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-3">Setup</p>
                <h2 className="text-3xl sm:text-4xl font-black mb-4">{steps.heading}</h2>
                <p className="text-white/40 max-w-xl mx-auto">{steps.subheading}</p>
              </div>
            </FadeUp>
            <div className="space-y-6">
              {steps.items.map((step, i) => (
                <FadeUp key={step.number} delay={i * 120}>
                  <div className="flex gap-6 items-start">
                    <div className="shrink-0 w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <span className="text-sm font-black text-st-lime">{step.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white mb-1">{step.title}</h3>
                      <p className="text-sm text-white/45 mb-3 leading-relaxed">{step.body}</p>
                      {step.code && (
                        <pre className="bg-[#0F1212] border border-white/8 rounded-xl p-4 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre">
                          {step.code}
                        </pre>
                      )}
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      {faqs && (
        <section className="py-24 px-6 border-t border-white/5">
          <div className="max-w-3xl mx-auto">
            <FadeUp>
              <div className="text-center mb-14">
                <p className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-3">FAQ</p>
                <h2 className="text-3xl sm:text-4xl font-black mb-4">{faqs.heading}</h2>
              </div>
            </FadeUp>
            <div className="space-y-4">
              {faqs.items.map((item, i) => (
                <FadeUp key={i} delay={i * 50}>
                  <FAQItem q={item.q} a={item.a} />
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <FadeUp>
            <h2 className="text-4xl sm:text-5xl font-black mb-5 leading-tight">
              {ctaHeadline}
            </h2>
            <p className="text-white/40 mb-10 text-lg">{ctaBody}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/signup"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-st-lime text-black text-base font-bold rounded-xl hover:bg-st-lime/90 transition-all hover:scale-[1.02]">
                Start free
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link to="/"
                className="inline-flex items-center justify-center px-8 py-4 border border-white/10 text-white/70 text-base font-medium rounded-xl hover:border-white/20 hover:text-white transition-all">
                See all features
              </Link>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <LogoFullDark className="h-6 w-auto" />
          </Link>
          <div className="flex items-center gap-6 text-xs text-white/30">
            <Link to="/#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link to="/developers" className="hover:text-white transition-colors">API Docs</Link>
            <Link to="/#faq" className="hover:text-white transition-colors">FAQ</Link>
            <a href="mailto:support@sourcetrack.ai" className="hover:text-white transition-colors">Support</a>
            <span>© {new Date().getFullYear()} SourceTrack</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
