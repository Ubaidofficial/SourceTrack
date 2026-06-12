import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { CreditCard, ExternalLink, Zap, CheckCircle2 } from 'lucide-react'
import { normalizePlan } from '../lib/planFeatures'
import { getPlanLabel } from '../lib/billing'
import { createCheckout, getBillingPortal } from '../lib/api'

// Default pageview limits per plan. The site's own pv_limit column takes precedence.
const PLAN_DEFAULT_LIMITS = {
  free:     5000,
  trial:    10000,
  starter:  50000,
  growth:   150000,
  scale:    500000,
  inactive: 0,
  archived: 0,
}

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    price: '$19/mo',
    period: 'billed yearly ($29/mo monthly)',
    limit: '50,000 tracked pageviews/mo',
    highlight: false,
  },
  {
    key: 'growth',
    name: 'Growth',
    price: '$49/mo',
    period: 'billed yearly ($79/mo monthly)',
    limit: '150,000 tracked pageviews/mo',
    highlight: true,
  },
  {
    key: 'scale',
    name: 'Scale',
    price: 'From $149/mo',
    period: 'billed monthly',
    limit: '500,000+ tracked pageviews/mo',
    highlight: false,
  },
]

export default function Billing() {
  const { user } = useAuth()
  const [site, setSite]             = useState(null)
  const [usage, setUsage]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [upgradeLoading, setUpgradeLoading] = useState(null)
  const [acceptedTerms, setAcceptedTerms]   = useState(false)

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

  async function handleUpgrade(planKey) {
    if (!acceptedTerms) return
    setUpgradeLoading(planKey)
    try {
      const successUrl = `${window.location.origin}/billing?upgrade=success`
      const cancelUrl  = `${window.location.origin}/billing`
      const data = await createCheckout(site?.site_key, successUrl, cancelUrl, planKey, acceptedTerms)
      if (data?.url) window.location.href = data.url
    } catch (_e) {
      /* silent */
    } finally {
      setUpgradeLoading(null)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const returnUrl = `${window.location.origin}/billing`
      const data = await getBillingPortal(site?.site_key, returnUrl)
      if (data?.url) window.location.href = data.url
    } catch (_e) {
      /* silent */
    } finally {
      setPortalLoading(false)
    }
  }

  const plan      = normalizePlan(site?.plan || 'free')
  const limit     = (site?.pv_limit && Number.isFinite(site.pv_limit)) ? site.pv_limit : (PLAN_DEFAULT_LIMITS[plan] || 0)
  const usagePct  = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0
  const usageColor = usagePct >= 95 ? 'bg-red-500' : usagePct >= 80 ? 'bg-amber-500' : 'bg-st-lime'
  const isTrial   = plan === 'trial'
  const isFree    = plan === 'free'
  const isPaid    = ['starter', 'growth', 'scale'].includes(plan)

  const daysLeft = (() => {
    if (!site?.trial_ends_at || !isTrial) return null
    const diff = Math.ceil((new Date(site.trial_ends_at) - new Date()) / 86400000)
    return Math.max(0, diff)
  })()

  const upgradeCallout = isTrial && daysLeft !== null && daysLeft <= 3
  const showUpgradePlans = isTrial || isFree

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-st-black dark:text-white">Billing</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-0.5">Manage your plan, limits, and billing details</p>
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
          <span className="text-2xl font-black text-st-black dark:text-white capitalize">{getPlanLabel(plan)}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            isTrial ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' :
            isPaid  ? 'bg-st-lime/15 text-green-700 dark:text-st-lime' :
                      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
          }`}>
            {isTrial ? 'Free Trial' : isFree ? 'Free Forever' : 'Active'}
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
            <span>{usage.toLocaleString()} of {limit.toLocaleString()} pageviews used this month</span>
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

      {/* ── Upgrade Plans (trial or free) ─────────────────────────────────────── */}
      {showUpgradePlans && (
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-st-black dark:text-white">Available Plans</h3>

          <div className="flex items-start gap-2.5 p-4 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-xl max-w-xl">
            <input
              id="terms-checkbox"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-700 text-st-lime focus:ring-st-lime focus:ring-offset-0 focus:outline-none bg-white dark:bg-gray-900"
            />
            <label htmlFor="terms-checkbox" className="text-xs text-st-gray dark:text-gray-400 leading-normal select-none">
              I have read and agree to the SourceTrack{' '}
              <Link to="/terms" className="text-st-black dark:text-white font-semibold hover:underline" target="_blank" rel="noopener noreferrer">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-st-black dark:text-white font-semibold hover:underline" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </Link>.
            </label>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {PLANS.map(p => (
              <div key={p.key} className={`rounded-xl border p-5 flex flex-col justify-between ${
                p.highlight
                  ? 'border-st-lime/40 dark:border-st-lime/40 bg-st-lime/5'
                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1C1C]'
              }`}>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-base font-black text-st-black dark:text-white">{p.name}</p>
                    {p.highlight && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-st-lime text-black px-1.5 py-0.5 rounded-full">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-black text-st-black dark:text-white mt-2">{p.price}</p>
                  <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">{p.period}</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-2">{p.limit}</p>
                </div>
                <button
                  onClick={() => handleUpgrade(p.key)}
                  disabled={upgradeLoading === p.key || !acceptedTerms}
                  className={`w-full text-xs font-semibold py-2.5 mt-4 rounded-lg transition-colors disabled:opacity-60 ${
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

      {/* ── Billing Help Footer ─────────────────────────────────────────── */}
      <div className="text-center text-xs text-st-gray dark:text-gray-400 pt-4 border-t border-gray-150 dark:border-gray-800">
        For billing, cancellation, or refund questions, email{' '}
        <a href="mailto:support@sourcetrack.ai" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
          support@sourcetrack.ai
        </a>{' '}
        with your account email and plan. We’ll review your message and reply as soon as possible.
      </div>
    </div>
  )
}
