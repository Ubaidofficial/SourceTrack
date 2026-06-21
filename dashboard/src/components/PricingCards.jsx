import { Link } from 'react-router-dom'

const PLANS = [
  {
    key: 'starter', name: 'Starter', price: '$29', period: '/mo',
    desc: 'Founder pricing locked at $29/mo — rises to $49 when founding closes.',
    features: [
      'Track visits, leads, and conversions by source',
      'Detect AI referrals from ChatGPT, Claude, and Perplexity',
      'View lead and customer journeys',
      'Multi-touch attribution models',
      'Manual conversion and event tracking',
      'Saved reports and CSV export',
      '1 site',
      '50,000 tracked visits/mo',
    ],
    cta: 'Get Starter', href: '/signup', featured: false,
  },
  {
    key: 'growth', name: 'Growth', price: '$99', period: '/mo',
    desc: 'Best for teams scaling campaigns, SEO, and AI referrals.',
    features: [
      'Everything in Starter',
      'Stripe revenue tracking (webhook recipe)',
      'Google Search Console visibility',
      'Campaign cost imports',
      'Source and conversion change detection',
      'Advanced report builder and dashboard widgets',
      '3 sites · 1 user',
      '150,000 tracked visits/mo',
    ],
    cta: 'Get Growth', href: '/signup', featured: true,
  },
  {
    key: 'scale', name: 'Scale', price: 'From $149', period: '/mo',
    desc: 'Best for agencies and high-volume teams needing more sites, volume, and support.',
    features: [
      'Everything in Growth',
      'Up to 99 sites · 1 user',
      'Unbranded CSV export',
      '5-year data history',
      'Higher conversion event limits',
      'Priority support and setup guidance',
      '500,000+ tracked visits/mo',
    ],
    cta: 'Talk to sales', href: 'mailto:sales@sourcetrack.ai', featured: false,
  },
]

export default function PricingCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
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
