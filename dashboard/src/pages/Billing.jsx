import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { CreditCard, ExternalLink } from 'lucide-react'

const PLAN_LIMITS = { trial: 200, starter: 1000, pro: 4000, agency: 10000 }

export default function Billing() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [usage, setUsage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

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

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/billing`
        })
      })
      const json = await res.json()
      if (json?.data?.url) {
        window.location.href = json.data.url
      }
    } catch (_e) {
      /* silent */
    } finally {
      setPortalLoading(false)
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
          {!isTrial && <span className="text-sm text-st-gray dark:text-gray-400 capitalize">{plan} plan</span>}
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

      {/* ── Manage Subscription ───────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h3 className="text-sm font-bold text-st-black dark:text-white mb-1">Manage Subscription</h3>
        <p className="text-xs text-st-gray dark:text-gray-400 mb-4">
          Upgrade, downgrade, update payment details, or cancel — all from your billing portal.
        </p>
        <button
          onClick={handlePortal}
          disabled={portalLoading}
          className="flex items-center gap-2 px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {portalLoading ? 'Opening portal…' : 'Open Billing Portal'}
        </button>
      </section>
    </div>
  )
}
