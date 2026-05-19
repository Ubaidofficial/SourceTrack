import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { CreditCard, ExternalLink, Zap, CheckCircle2 } from 'lucide-react'

const PLAN_LIMITS = { trial: 200, starter: 1000, pro: 4000, agency: 10000 }

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    price: '$49',
    limit: '1,000 conversions/mo',
    features: ['All 8 attribution models', 'AI traffic detection', 'Server-side CAPI sync', 'CSV export'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$99',
    limit: '4,000 conversions/mo',
    highlight: true,
    features: ['Everything in Starter', 'Cookieless tracking mode', 'Data retention controls', 'Nightly attribution jobs'],
  },
  {
    key: 'agency',
    name: 'Agency',
    price: '$199',
    limit: '10,000 conversions/mo',
    features: ['Everything in Pro', 'Multi-site management', 'White-label reports', 'Priority support'],
  },
]

export default function Billing() {
  const { user } = useAuth()
  const [site, setSite]             = useState(null)
  const [usage, setUsage]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [upgradeLoading, setUpgradeLoading] = useState(null)

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

  async function getAuthHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` }
  }

  async function handleUpgrade(planKey) {
    setUpgradeLoading(planKey)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          plan: planKey,
          successUrl: `${window.location.origin}/billing?upgrade=success`,
          cancelUrl:  `${window.location.origin}/billing`,
          site_key:   site?.site_key,
        })
      })
      const json = await res.json()
      if (json?.data?.url) window.location.href = json.data.url
    } catch (_e) {
      /* silent */
    } finally {
      setUpgradeLoading(null)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers,
        body: JSON.stringify({ returnUrl: `${window.location.origin}/billing` })
      })
      const json = await res.json()
      if (json?.data?.url) window.location.href = json.data.url
    } catch (_e) {
      /* silent */
    } finally {
      setPortalLoading(false)
    }
  }

  const plan      = site?.plan || 'trial'
  const limit     = PLAN_LIMITS[plan] || 200
  const usagePct  = Math.min(100, Math.round((usage / limit) * 100))
  const usageColor = usagePct >= 95 ? 'bg-red-500' : usagePct >= 80 ? 'bg-amber-500' : 'bg-st-lime'
  const isTrial   = plan === 'trial'
  const isPaid    = ['starter', 'pro', 'agency'].includes(plan)

  const daysLeft = (() => {
    if (!site?.trial_ends_at || !isTrial) return null
    const diff = Math.ceil((new Date(site.trial_ends_at) - new Date()) / 86400000)
    return Math.max(0, diff)
  })()

  const upgradeCallout = isTrial && daysLeft !== null && daysLeft <= 3

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-st-black dark:text-white">Billing</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-1">Manage your plan and subscription</p>
      </div>

      {/* ── Trial expiry banner ───────────────────────────────────────────── */}
      {upgradeCallout && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-5 py-4">
          <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            Your trial ends in <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>. Upgrade to keep tracking.
          </p>
        </div>
      )}

      {/* ── Current Plan Card ─────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Current Plan</h3>
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-black text-st-black dark:text-white capitalize">{plan}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            isTrial       ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' :
            plan === 'pro' ? 'bg-st-lime/15 text-green-700 dark:text-st-lime' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
          }`}>
            {isTrial ? 'Free Trial' : 'Active'}
          </span>
        </div>

        {isTrial && daysLeft !== null && (
          <p className="text-sm text-st-gray dark:text-gray-400">
            Trial ends {new Date(site.trial_ends_at).toLocaleDateString()} — {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining
          </p>
        )}

        {/* Usage meter */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-st-gray dark:text-gray-400">
            <span>{usage.toLocaleString()} of {limit.toLocaleString()} conversions used this month</span>
            <span className={usagePct >= 80 ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>{usagePct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full ${usageColor} rounded-full transition-all duration-500`} style={{ width: `${usagePct}%` }} />
          </div>
        </div>

        {/* Portal button for paid plans */}
        {isPaid && (
          <div className="pt-2">
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="flex items-center gap-2 px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 disabled:opacity-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {portalLoading ? 'Opening…' : 'Manage Subscription'}
            </button>
          </div>
        )}
      </section>

      {/* ── Upgrade Plans (trial only) ─────────────────────────────────────── */}
      {isTrial && (
        <section>
          <h3 className="text-sm font-bold text-st-black dark:text-white mb-4">Choose a Plan</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {PLANS.map(p => (
              <div key={p.key} className={`rounded-xl border p-5 flex flex-col ${
                p.highlight
                  ? 'border-st-lime/40 dark:border-st-lime/40 bg-st-lime/5'
                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1C1C]'
              }`}>
                {p.highlight && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-st-lime text-black px-2 py-0.5 rounded-full self-start mb-3">
                    Most popular
                  </span>
                )}
                <p className="text-base font-black text-st-black dark:text-white">{p.name}</p>
                <p className="text-2xl font-black text-st-black dark:text-white mt-0.5">{p.price}<span className="text-sm font-normal text-st-gray dark:text-gray-400">/mo</span></p>
                <p className="text-xs text-st-gray dark:text-gray-400 mb-4">{p.limit}</p>
                <ul className="space-y-2 mb-5 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-st-gray dark:text-gray-300">
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${p.highlight ? 'text-st-lime' : 'text-gray-400 dark:text-gray-500'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(p.key)}
                  disabled={upgradeLoading === p.key}
                  className={`w-full text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 ${
                    p.highlight
                      ? 'bg-st-lime text-black hover:bg-st-lime/90'
                      : 'border border-gray-300 dark:border-gray-700 text-st-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {upgradeLoading === p.key ? 'Redirecting…' : `Upgrade to ${p.name}`}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-st-gray dark:text-gray-500 mt-4 text-center">14-day free trial included · Cancel any time · No credit card until trial ends</p>
        </section>
      )}

      {/* ── Downgrade option for paid plans ───────────────────────────────── */}
      {isPaid && (
        <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-bold text-st-black dark:text-white mb-1">Change or Cancel Plan</h3>
          <p className="text-xs text-st-gray dark:text-gray-400 mb-4">
            Upgrade, downgrade, update payment details, or cancel — all from your Stripe billing portal.
          </p>
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-st-black dark:text-white text-sm font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {portalLoading ? 'Opening portal…' : 'Open Billing Portal'}
          </button>
        </section>
      )}
    </div>
  )
}
