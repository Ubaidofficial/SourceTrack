import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { LogoFull } from './Logo'

const NAV_LINKS = [
  { label: 'Product', href: '/product' },
  { label: 'Attribution', href: '/attribution' },
  { label: 'AI Tracking', href: '/ai-referral-tracking' },
  { label: 'Reports', href: '/report-builder' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Demo', href: '/demo' },
  { label: 'Docs', href: '/docs' },
]

const SOLUTIONS = [
  { label: 'For SaaS', href: '/use-cases/saas' },
  { label: 'For Shopify', href: '/use-cases/shopify' },
  { label: 'For Lead Gen', href: '/use-cases/lead-generation' },
]

export default function MarketingHeader() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-[rgba(31,35,35,0.08)]">
      <div className="max-w-[1320px] mx-auto px-8 h-[76px] flex items-center justify-between gap-7">
        <Link to="/" aria-label="SourceTrack home" className="inline-flex items-center">
          <LogoFull className="h-9 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-[26px] text-[#586161] text-sm font-extrabold" aria-label="Primary navigation">
          {/* Solutions dropdown — opens on hover or keyboard focus (focus-within) */}
          <div className="relative group">
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-st-black group-focus-within:text-st-black transition-colors"
              aria-haspopup="true"
            >
              Solutions
              <svg className="w-3 h-3 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute left-0 top-full pt-3 z-50 invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity">
              <div className="min-w-[200px] rounded-2xl border border-[rgba(31,35,35,0.08)] bg-white shadow-[0_18px_52px_rgba(31,35,35,.12)] p-2">
                {SOLUTIONS.map(s => (
                  <Link key={s.href} to={s.href} aria-current={pathname === s.href ? 'page' : undefined}
                    className={`block px-3 py-2 rounded-xl text-sm font-extrabold hover:bg-[rgba(31,35,35,.04)] transition-colors ${pathname === s.href ? 'text-st-black' : 'text-[#586161] hover:text-st-black'}`}>
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          {NAV_LINKS.map(l => (
            <Link key={l.href} to={l.href} aria-current={pathname === l.href ? 'page' : undefined}
              className={`hover:text-st-black transition-colors ${pathname === l.href ? 'text-st-black' : ''}`}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full border border-[rgba(31,35,35,0.10)] bg-white text-st-black text-[15px] font-extrabold tracking-[-0.025em] hover:border-[rgba(31,35,35,0.24)] transition-all hover:-translate-y-px">
            Log in
          </Link>
          <Link to="/signup" className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full bg-st-lime text-st-black text-[15px] font-extrabold tracking-[-0.025em] shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64] transition-all hover:-translate-y-px">
            Start free
          </Link>
        </div>

        <button className="md:hidden text-st-black p-2 min-h-[44px] min-w-[44px] flex items-center justify-center" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {open
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden px-8 pb-4 space-y-1">
          {NAV_LINKS.map(l => (
            <Link key={l.href} to={l.href} onClick={() => setOpen(false)}
              className={`block py-2 text-sm font-extrabold ${pathname === l.href ? 'text-st-black' : 'text-[#586161]'}`}>
              {l.label}
            </Link>
          ))}
          <p className="pt-3 pb-1 text-[11px] uppercase tracking-[0.08em] font-bold text-[#8A9B9B]">Solutions</p>
          {SOLUTIONS.map(s => (
            <Link key={s.href} to={s.href} onClick={() => setOpen(false)}
              className={`block py-2 pl-3 text-sm font-extrabold ${pathname === s.href ? 'text-st-black' : 'text-[#586161]'}`}>
              {s.label}
            </Link>
          ))}
          <div className="pt-3 flex flex-col gap-2">
            <Link to="/login" onClick={() => setOpen(false)} className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-full border border-[rgba(31,35,35,0.10)] text-sm font-extrabold">Log in</Link>
            <Link to="/signup" onClick={() => setOpen(false)} className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-full bg-st-lime text-st-black text-sm font-extrabold">Start free</Link>
          </div>
          <p className="text-[13px] font-bold text-[#586464] pt-2">Revenue attribution, AI referral tracking, and custom reports.</p>
        </div>
      )}
    </header>
  )
}
