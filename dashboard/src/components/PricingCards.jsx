import { Link } from 'react-router-dom'

const PLANS = [
  {
    key: 'free', name: 'Free', price: '$0', period: '',
    desc: 'Track where your next 30 signups or orders came from.',
    features: ['1 site', '30 conversion source profiles/mo', '5,000 tracked pageviews/mo', '30-day history', 'SourceTrack logo on export'],
    cta: 'Start free', href: '/signup', featured: false,
  },
  {
    key: 'starter', name: 'Starter', price: '$19', period: '/mo',
    desc: 'Replace your lead-source spreadsheet.',
    features: ['1 site', '150 conversion source profiles/mo', '50,000 tracked pageviews/mo', '90-day history', 'Manual status & revenue', 'Saved reports & CSV export', 'Clean report exports'],
    cta: 'Choose Starter', href: '/signup', featured: false,
    subprice: '$29/mo monthly',
  },
  {
    key: 'growth', name: 'Growth', price: '$49', period: '/mo',
    desc: 'Connect sources to revenue and ROI.',
    features: ['3 sites', '750 conversion source profiles/mo', '150,000 tracked pageviews/mo', '1-year history', 'Revenue attribution models', 'Dashboard widgets', '3 users (seats)'],
    cta: 'Choose Growth', href: '/signup', featured: true,
    subprice: '$79/mo monthly',
  },
  {
    key: 'scale', name: 'Scale', price: 'From $149', period: '/mo',
    desc: 'For agencies and high-volume teams.',
    features: ['10+ sites', '2,500+ conversion source profiles/mo', '500,000+ tracked pageviews/mo', 'Multi-user seats (99 seats)', 'Priority onboarding support'],
    cta: 'Talk to sales', href: 'mailto:sales@sourcetrack.ai', featured: false,
  },
]

export default function PricingCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
      {PLANS.map((p, i) => (
        <article key={p.key} className={`relative p-7 rounded-[32px] border flex flex-col min-h-0 sm:min-h-[460px] ${
          p.featured
            ? 'bg-st-black text-white border-[rgba(255,255,255,.10)] shadow-[0_24px_80px_rgba(31,35,35,.12)] -translate-y-2.5'
            : 'bg-white border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)]'
        }`}>
          {p.featured && (
            <span className="inline-flex items-center gap-2 rounded-full py-2 px-3 text-[13px] font-extrabold tracking-[-0.015em] text-white bg-white/10 border border-white/15">
              <span className="w-2 h-2 rounded-full bg-[#00AA57] shadow-[0_0_0_6px_rgba(0,170,87,.12)]" />Most popular
            </span>
          )}
          <h3 className="text-[28px] font-bold tracking-[-0.055em] mt-[18px]" style={p.featured ? { color: '#fff' } : {}}>{p.name}</h3>
          <div className="mt-[18px] mb-2 text-[52px] leading-none font-black tracking-[-0.07em]">
            {p.price}<span className={`text-[15px] tracking-[-0.02em] ${p.featured ? 'text-[#CBD4D4]' : 'text-[#6E7979]'}`}>{p.period}</span>
          </div>
          {p.subprice && (
            <p className={`text-[13px] -mt-1 mb-2 font-bold ${p.featured ? 'text-[#CBD4D4]' : 'text-[#6E7979]'}`}>{p.subprice}</p>
          )}
          <p className={p.featured ? 'text-[#CBD4D4]' : 'text-[#657070]'}>{p.desc}</p>
          <ul className="mt-6 mb-6 grid gap-3 flex-1 list-none p-0">
            {p.features.map((f, j) => (
              <li key={j} className={`font-bold text-sm before:content-['✓'] before:mr-[9px] before:text-[#00AA57] before:font-black ${p.featured ? 'text-[#CBD4D4]' : 'text-[#566161]'}`}>{f}</li>
            ))}
          </ul>
          {p.href.startsWith('mailto:') ? (
            <a href={p.href} className={`mt-auto inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full text-[15px] font-extrabold tracking-[-0.025em] transition-all hover:-translate-y-px ${
              p.featured ? 'bg-st-lime text-st-black shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64]' : 'border border-[rgba(31,35,35,.10)] bg-white text-st-black hover:border-[rgba(31,35,35,.24)]'
            }`}>
              {p.cta}
            </a>
          ) : (
            <Link to={p.href} className={`mt-auto inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full text-[15px] font-extrabold tracking-[-0.025em] transition-all hover:-translate-y-px ${
              p.featured ? 'bg-st-lime text-st-black shadow-[0_18px_52px_rgba(204,240,63,0.28)] hover:bg-[#D9FA64]' : 'border border-[rgba(31,35,35,.10)] bg-white text-st-black hover:border-[rgba(31,35,35,.24)]'
            }`}>
              {p.cta}
            </Link>
          )}
        </article>
      ))}
    </div>
  )
}
