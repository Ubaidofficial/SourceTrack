import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { CreditCard, Check, ArrowRight } from 'lucide-react'

const PLAN_LIMITS = { trial: 200, starter: 1000, pro: 4000, agency: 10000 }
const PRICES = { starter: '$29', pro: '$99', agency: '$149' }

const FAQ = [
  { q: 'Can I cancel anytime?', a: 'Yes, cancel from your billing portal.' },
  { q: 'What counts as a lead?', a: 'Each unique visitor session tracked per month.' },
  { q: 'Do you offer refunds?', a: 'Yes, within 7 days of any charge.' }
]

export default function Billing() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [usage, setUsage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [checkouting, setCheckouting] = useState(null)

  useEffect(() => { loadData() }, [user])

  async function loadData() {
    try {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase.from('sites').select('*').limit(1)
      if (member?.company_id) query.eq('company_id', member.company_id)
      else query.eq('owner_id', user.id)

      const { data } = await query.maybeSingle()
      setSite(data)

      if (data) {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        const { count } = await supabase
          .from('pageviews')
          .select('session_id', { count: 'exact', head: true })
          .eq('site_id', data.id)
          .gte('timestamp', monthStart)
          .not('session_id', 'is', null)
        setUsage(count ?? 0)
      }
    } catch (_e) {
      /* silent */
    } finally {
      setLoading(false)
    }
  }

  async function handleCheckout(plan) {
    setCheckouting(plan)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          plan,
          site_key: site.site_key,
          successUrl: `${window.location.origin}/billing?success=true`,
          cancelUrl: `${window.location.origin}/billing?canceled=true`
        })
      })
      const json = await res.json()
      if (json?.data?.url) {
        window.location.href = json.data.url
      }
    } catch (_e) {
      /* silent */
    } finally {
      setCheckouting(null)
    }
  }

  const plan = site?.plan || 'trial'
  const limit = PLAN_LIMITS[plan] || 200
  const usagePct = Math.min(100, Math.round((usage / limit) * 100))
  const usageColor = usagePct >= 95 ? 'bg-red-500' : usagePct >= 80 ? 'bg-amber-500' : 'bg-st-lime'

  const isTrial = plan === 'trial'
  const daysLeft = (() => {
    if (!site?.trial_ends_at || !isTrial) return null
    const end = new Date(site.trial_ends_at)
    const diff = Math.ceil((end - new Date()) / 86400000)
    return Math.max(0, diff)
  })()

  const cards = [
    { plan: 'starter', price: '$29', leads: '1,000', label: 'Get Started' },
    { plan: 'pro', price: '$99', leads: '4,000', label: 'Upgrade', badge: 'Most Popular' },
    { plan: 'agency', price: '$149', leads: '10,000', label: 'Scale Up' }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-st-black dark:text-white">Billing</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-1">Manage your plan and subscription</p>
      </div>

      {/* ── Current Plan Card ────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Current Plan</h3>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-st-black dark:text-white capitalize">{plan}</span>
          {!isTrial && <span className="text-sm text-st-gray dark:text-gray-400">{PRICES[plan] || '$29'}/mo</span>}
        </div>

        {isTrial && daysLeft !== null && (
          <p className="text-sm text-st-gray dark:text-gray-400">
            Trial ends {new Date(site.trial_ends_at).toLocaleDateString()} — {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining
          </p>
        )}

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-st-gray dark:text-gray-400">
            <span>{usage} of {limit.toLocaleString()} leads used this month</span>
            <span>{usagePct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${usageColor} rounded-full transition-all duration-500`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>
      </section>

      {/* ── Pricing Cards ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-st-black dark:text-white">Available Plans</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map(({ plan: cardPlan, price, leads, label, badge }) => {
            const isCurrent = plan === cardPlan
            return (
              <div
                key={cardPlan}
                className={`relative bg-white dark:bg-[#1A1C1C] border-2 rounded-xl p-5 flex flex-col gap-3 ${
                  isCurrent
                    ? 'border-green-500 dark:border-green-400 shadow-md'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                {badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-st-black dark:bg-white text-white dark:text-st-black text-[10px] font-bold rounded-full">
                    {badge}
                  </span>
                )}

                <h4 className="text-sm font-bold text-st-black dark:text-white capitalize mt-1">{cardPlan}</h4>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-st-black dark:text-white">{price}</span>
                  <span className="text-xs text-st-gray dark:text-gray-400">/mo</span>
                </div>
                <p className="text-xs text-st-gray dark:text-gray-400">{leads} leads/mo</p>

                <button
                  onClick={() => handleCheckout(cardPlan)}
                  disabled={checkouting === cardPlan || isCurrent}
                  className={`mt-auto flex items-center justify-center gap-1.5 w-full py-2 px-3 text-sm font-semibold rounded-lg transition-colors ${
                    isCurrent
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 cursor-default'
                      : 'bg-st-black dark:bg-white text-white dark:text-st-black hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50'
                  }`}
                >
                  {isCurrent ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Current Plan
                    </>
                  ) : checkouting === cardPlan ? (
                    'Redirecting…'
                  ) : (
                    <>
                      {label} <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-st-black dark:text-white">FAQ</h3>
        <div className="space-y-3">
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <p className="text-sm font-medium text-st-black dark:text-white">{q}</p>
              <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
