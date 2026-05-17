import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { createCheckout, getBillingPortal } from '../lib/api'
import { Copy, Check, ExternalLink, Globe, Link2, Zap, Shield, Building2 } from 'lucide-react'

const PLANS = [
  {
    key: 'starter',
    label: 'Starter',
    price: 29,
    limit: '50',
    limitRaw: 50,
    unit: 'leads/mo',
    features: ['Up to 50 leads/mo', 'All attribution models', 'AI search tracking', 'Email support'],
    icon: Zap,
    highlight: false
  },
  {
    key: 'pro',
    label: 'Pro',
    price: 99,
    limit: '200',
    limitRaw: 200,
    unit: 'leads/mo',
    features: ['Up to 200 leads/mo', 'All attribution models', 'AI search tracking', 'Report builder', 'Priority support'],
    icon: Shield,
    highlight: true
  },
  {
    key: 'agency',
    label: 'Agency',
    price: 149,
    limit: '500',
    limitRaw: 500,
    unit: 'leads/mo',
    features: ['Up to 500 leads/mo', 'All attribution models', 'AI search tracking', 'Report builder', 'Multi-site (coming)', 'White-label (coming)'],
    icon: Building2,
    highlight: false
  }
]

export default function Settings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const checkoutSuccess = searchParams.get('checkout') === 'success'

  const [site, setSite]                 = useState(null)
  const [name, setName]                 = useState('')
  const [domain, setDomain]             = useState('')
  const [saving, setSaving]             = useState(false)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [shareToken, setShareToken]     = useState(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied]   = useState(false)
  const [message, setMessage]           = useState('')
  const [copied, setCopied]             = useState(false)
  const [loadingCheckout, setLoadingCheckout] = useState(null) // plan key
  const [loadingPortal, setLoadingPortal]     = useState(false)

  useEffect(() => {
    if (checkoutSuccess) {
      setMessage('Subscription activated! Welcome to SourceTrack Pro.')
      setTimeout(() => loadSite(), 2000)
    }
  }, [checkoutSuccess])

  useEffect(() => { loadSite() }, [user])

  async function loadSite() {
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
      setShareEnabled(!!data.public_share_enabled)
      setShareToken(data.public_share_token || null)
      setName(data.name || '')
      setDomain(data.domain || '')
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      if (site) {
        await supabase.from('sites').update({ name, domain }).eq('id', site.id)
      } else {
        const { data } = await supabase.from('sites').insert({
          name, domain, owner_id: user.id, plan: 'trial'
        }).select().single()
        setSite(data)
      }
      setMessage('Saved!')
    } catch (_err) {
      setMessage('Error saving')
    } finally {
      setSaving(false)
    }
  }

  const handleSubscribe = async (planKey) => {
    if (!site) return
    setLoadingCheckout(planKey)
    setMessage('')
    try {
      const successUrl = `${window.location.origin}/settings?checkout=success`
      const cancelUrl  = `${window.location.origin}/settings`
      const data = await createCheckout(site.site_key, successUrl, cancelUrl, planKey)
      if (data?.url) window.location.href = data.url
    } catch (_err) {
      setMessage('Failed to start checkout. Please try again.')
    } finally {
      setLoadingCheckout(null)
    }
  }

  const handlePortal = async () => {
    if (!site) return
    setLoadingPortal(true)
    setMessage('')
    try {
      const returnUrl = `${window.location.origin}/settings`
      const data = await getBillingPortal(site.site_key, returnUrl)
      if (data?.url) window.location.href = data.url
    } catch (_err) {
      setMessage('Failed to open billing portal')
    } finally {
      setLoadingPortal(false)
    }
  }

  const handleShareToggle = async () => {
    if (!site) return
    setShareLoading(true)
    try {
      const newEnabled = !shareEnabled
      const { data, error } = await supabase
        .from('sites')
        .update({ public_share_enabled: newEnabled })
        .eq('id', site.id)
        .select('public_share_token, public_share_enabled')
        .single()
      if (error) throw error
      setShareEnabled(!!data.public_share_enabled)
      setShareToken(data.public_share_token || null)
    } catch (_err) {
      setMessage('Error updating share settings')
    } finally {
      setShareLoading(false)
    }
  }

  const handleShareCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/public/${shareToken}`)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const plan     = site?.plan || 'trial'
  const isPro    = plan === 'pro'
  const isInactive = plan === 'inactive'
  const isTrial  = plan === 'trial'

  // Days left in trial (14-day from created_at)
  const daysLeft = (() => {
    if (!site?.created_at || !isTrial) return null
    const end  = new Date(new Date(site.created_at).getTime() + 14 * 86400000)
    const diff = Math.ceil((end - new Date()) / 86400000)
    return Math.max(0, diff)
  })()

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-st-black">Settings</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-1">{user?.email}</p>
      </div>

      {/* Status message */}
      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          message.includes('Error') || message.includes('Failed')
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 border border-red-200'
            : 'bg-green-50 dark:bg-green-900/20 text-green-700 border border-green-200'
        }`}>
          {message}
        </div>
      )}

      {/* ── Plan & Billing ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-st-black">Plan & Billing</h3>
            <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
              {isTrial && daysLeft !== null
                ? daysLeft > 0
                  ? `Free trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`
                  : 'Free trial expired — upgrade to continue'
                : isPro ? 'You are on the Pro plan'
                : isInactive ? 'Subscription inactive'
                : 'Active subscription'}
            </p>
          </div>
          {isPro && (
            <button
              onClick={handlePortal}
              disabled={loadingPortal}
              className="text-xs text-st-black dark:text-white border border-gray-200 dark:border-[#333838] px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-[#252929] dark:bg-[#111414] disabled:opacity-50"
            >
              {loadingPortal ? 'Loading…' : 'Manage Subscription'}
            </button>
          )}
        </div>

        {/* Pricing cards */}
        {!isPro && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map((p) => {
              const Icon = p.icon
              const isLoading = loadingCheckout === p.key
              return (
                <div
                  key={p.key}
                  className={`relative rounded-2xl border-2 p-5 flex flex-col gap-4 transition-all ${
                    p.highlight
                      ? 'border-st-black bg-st-black text-white'
                      : 'border-gray-200 dark:border-[#333838] bg-white'
                  }`}
                >
                  {p.highlight && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-st-lime text-st-black dark:text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wide">
                      Most Popular
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      p.highlight ? 'bg-white/10' : 'bg-gray-100'
                    }`}>
                      <Icon className={`w-4 h-4 ${p.highlight ? 'text-white' : 'text-st-black'}`} />
                    </div>
                    <span className={`text-sm font-bold ${p.highlight ? 'text-white' : 'text-st-black'}`}>
                      {p.label}
                    </span>
                  </div>

                  <div>
                    <span className={`text-3xl font-extrabold ${p.highlight ? 'text-white' : 'text-st-black'}`}>
                      ${p.price}
                    </span>
                    <span className={`text-xs ml-1 ${p.highlight ? 'text-white/70' : 'text-st-gray'}`}>/mo</span>
                    <p className={`text-xs mt-1 ${p.highlight ? 'text-white/70' : 'text-st-gray'}`}>
                      {p.limit} {p.unit}
                    </p>
                  </div>

                  <ul className="space-y-1.5 flex-1">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className={`mt-0.5 text-xs ${p.highlight ? 'text-st-lime' : 'text-st-green'}`}>✓</span>
                        <span className={`text-xs ${p.highlight ? 'text-white/80' : 'text-st-gray'}`}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSubscribe(p.key)}
                    disabled={!!loadingCheckout}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
                      p.highlight
                        ? 'bg-st-lime text-st-black dark:text-white hover:bg-st-lime/90'
                        : 'bg-st-black text-white hover:bg-st-black/90'
                    }`}
                  >
                    {isLoading ? 'Redirecting…' : 'Get Started'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Already on Pro */}
        {isPro && (
          <div className="bg-st-lime/10 dark:bg-st-lime/5 border border-st-lime/30 rounded-xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-st-lime flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-st-black" />
            </div>
            <div>
              <p className="text-sm font-semibold text-st-black">You're on Pro</p>
              <p className="text-xs text-st-gray">200 leads/mo · All features included</p>
            </div>
          </div>
        )}

        {/* Inactive */}
        {isInactive && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            Your subscription is inactive. Reactivate below to restore access.
          </div>
        )}
      </section>

      {/* ── Site Settings ──────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#333838] rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-st-black">Site Settings</h3>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">Site Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-[#333838] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20"
              placeholder="My Website"
            />
          </div>
          <div>
            <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-[#333838] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20"
              placeholder="yoursite.com"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-st-black text-white text-sm font-semibold rounded-lg hover:bg-st-black/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </section>

      {/* ── Public Dashboard ───────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#333838] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-st-gray" />
          <h3 className="text-sm font-bold text-st-black">Public Dashboard</h3>
        </div>
        <p className="text-xs text-st-gray">Share a read-only view of your analytics — no login required.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{shareEnabled ? 'Sharing enabled' : 'Sharing disabled'}</span>
          <button
            onClick={handleShareToggle}
            disabled={shareLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              shareEnabled ? 'bg-st-black' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-[#1A1D1D] shadow transition-transform ${
              shareEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {shareEnabled && shareToken && (
          <div className="bg-gray-50 dark:bg-[#111414] border border-gray-200 dark:border-[#333838] rounded-lg p-3 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-st-gray dark:text-gray-400 shrink-0" />
            <span className="text-xs text-st-gray dark:text-gray-400 truncate flex-1">
              {`${window.location.origin}/public/${shareToken}`}
            </span>
            <button onClick={handleShareCopy} className="p-1 hover:bg-gray-200 rounded">
              {shareCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-st-gray" />}
            </button>
            <a
              href={`${window.location.origin}/public/${shareToken}`}
              target="_blank" rel="noopener noreferrer"
              className="p-1 hover:bg-gray-200 rounded"
            >
              <ExternalLink className="w-4 h-4 text-st-gray" />
            </a>
          </div>
        )}
      </section>
    </div>
  )
}
