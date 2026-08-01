import { Link } from 'react-router-dom'

// Monthly pageview caps are taken verbatim from PLAN_DEFAULT_PV_LIMIT in
// api/lib/plan-features.js: starter 50_000, growth 150_000. Founder (early-bird
// annual) maps to Growth entitlements, so 150,000. Data-retention is NOT claimed
// here — it is not enforced in prod. "First month free" is intentionally NOT
// claimed: the trial is 28 days (raised from 14 in migration 20260730000000), and
// 28 days is still not a month, so that copy would still overstate it. The
// conclusion is unchanged by the raise; only the number it turns on has moved.
const PLANS = [
  {
    key: 'starter', name: 'Starter', price: '$49', period: '/mo',
    desc: 'For a founder tracking one site who wants real attribution, fast.',
    features: [
      'Source, UTM, referrer & campaign attribution',
      'AI-referral detection',
      'Cookieless lightweight analytics',
      'Conversion tracking + lead qualification',
      'First-, last- & multi-touch views',
      'CSV export',
      '1 site',
      '50,000 tracked pageviews/mo',
    ],
    cta: 'Start free', href: '/signup', featured: false,
  },
  {
    key: 'growth', name: 'Growth', price: '$79', period: '/mo',
    desc: 'For founders scaling traffic who want the full toolkit.',
    features: [
      'Everything in Starter',
      'Report Builder with saved & pinned reports',
      'Google Search Console SEO attribution (beta)',
      'Stripe revenue attribution (beta / test-mode)',
      'Manual Shopify & webhook revenue import',
      '150,000 tracked pageviews/mo',
    ],
    cta: 'Start free', href: '/signup', featured: true,
  },
  {
    key: 'founder', name: 'Founder', price: '$99', period: '/yr',
    desc: 'Early-bird annual — a one-time founder seat for early believers.',
    features: [
      '25 seats. One per customer. Locked forever.',
      'Growth-level features',
      '150,000 tracked pageviews/mo',
      '28-day money-back guarantee',
      'Price never rises while you keep the seat',
      'Seats left — [VERIFY: wire to a real count]',
    ],
    cta: 'Claim a Founder seat', href: '/signup?plan=early_bird_annual', featured: false,
  },
]

export default function PricingCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch max-w-[1080px] mx-auto">
      {PLANS.map((p) => (
        <article key={p.key} className={`relative p-7 rounded-[32px] border flex flex-col min-h-0 sm:min-h-[460px] ${
          p.featured
            ? 'bg-st-black text-white border-[rgba(255,255,255,.10)] shadow-[0_24px_80px_rgba(18,16,12,.12)] lg:-translate-y-2.5'
            : 'bg-white border-[rgba(18,16,12,.10)] shadow-[0_12px_38px_rgba(18,16,12,.055)]'
        }`}>
          {p.featured && (
            <span className="inline-flex items-center gap-2 rounded-full py-2 px-3 text-[13px] font-extrabold tracking-[-0.015em] text-white bg-white/10 border border-white/15">
              <span className="w-2 h-2 rounded-full bg-[#D2EC2A] shadow-[0_0_0_6px_rgba(210,236,42,.12)]" />Most popular
            </span>
          )}
          <h3 className="text-[28px] font-bold tracking-[-0.055em] mt-[18px]" style={p.featured ? { color: '#fff' } : {}}>{p.name}</h3>
          <div className="mt-[18px] mb-2 text-[52px] leading-none font-black tracking-[-0.07em]">
            {p.price}<span className={`text-[15px] tracking-[-0.02em] ${p.featured ? 'text-[#CBD4D4]' : 'text-[#6E7979]'}`}>{p.period}</span>
          </div>
          <p className={p.featured ? 'text-[#CBD4D4]' : 'text-[#657070]'}>{p.desc}</p>
          <ul className="mt-6 mb-6 grid gap-3 flex-1 list-none p-0">
            {p.features.map((f, j) => (
              <li key={j} className={`font-bold text-sm before:content-['✓'] before:mr-[9px] before:font-black ${p.featured ? 'text-[#CBD4D4] before:text-[#D2EC2A]' : 'text-[#566161] before:text-[#12100C]'}`}>{f}</li>
            ))}
          </ul>
          <Link to={p.href} className={`mt-auto inline-flex items-center justify-center gap-2.5 min-h-[52px] px-[22px] rounded-full text-[15px] font-extrabold tracking-[-0.025em] transition-all hover:-translate-y-px ${
            p.featured ? 'bg-st-lime text-st-black shadow-[0_18px_52px_rgba(210,236,42,0.28)] hover:bg-[#BCD41C]' : 'border border-[rgba(18,16,12,.10)] bg-white text-st-black hover:border-[rgba(18,16,12,.24)]'
          }`}>
            {p.cta}
          </Link>
          {!p.featured && <p className="mt-2 text-center text-[12px] font-bold text-[#8A9B9B]">No card required.</p>}
        </article>
      ))}
    </div>
  )
}
