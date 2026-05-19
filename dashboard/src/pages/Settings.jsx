import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getBillingPortal } from '../lib/api'
import { Copy, Check, ExternalLink, Globe, Link2, CreditCard, Link, ShieldCheck, Trash2, AlertTriangle } from 'lucide-react'
import UTMBuilder from '../components/UTMBuilder'

export default function Settings() {
  const { user } = useAuth()

  const [site, setSite]                 = useState(null)
  const [name, setName]                 = useState('')
  const [domain, setDomain]             = useState('')
  const [saving, setSaving]             = useState(false)
  const [shareEnabled, setShareEnabled]         = useState(false)
  const [shareToken, setShareToken]             = useState(null)
  const [shareLoading, setShareLoading]         = useState(false)
  const [shareCopied, setShareCopied]           = useState(false)
  const [cookielessMode, setCookielessMode]         = useState(false)
  const [cookielessLoading, setCookielessLoading]   = useState(false)
  const [retentionDays, setRetentionDays]           = useState(0)
  const [retentionSaving, setRetentionSaving]       = useState(false)
  const [visitorId, setVisitorId]                   = useState('')
  const [visitorDeleting, setVisitorDeleting]       = useState(false)
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState('')
  const [deletingAccount, setDeletingAccount]       = useState(false)
  const [message, setMessage]                       = useState('')
  const [loadingPortal, setLoadingPortal]           = useState(false)

  useEffect(() => { loadSite() }, [user])

  async function loadSite() {
    const { data: member } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const query = supabase.from('sites').select('*, cookieless_mode, data_retention_days').limit(1)
    if (member?.company_id) query.eq('company_id', member.company_id)
    else query.eq('owner_id', user.id)

    const { data } = await query.maybeSingle()
    setSite(data)
    if (data) {
      setShareEnabled(!!data.public_share_enabled)
      setShareToken(data.public_share_token || null)
      setCookielessMode(!!data.cookieless_mode)
      setRetentionDays(data.data_retention_days || 0)
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

  const handleCookielessToggle = async () => {
    if (!site) return
    setCookielessLoading(true)
    try {
      const newMode = !cookielessMode
      const { error } = await supabase
        .from('sites')
        .update({ cookieless_mode: newMode })
        .eq('id', site.id)
      if (error) throw error
      setCookielessMode(newMode)
      setMessage(newMode ? 'Cookieless mode enabled.' : 'Cookieless mode disabled.')
      setTimeout(() => setMessage(''), 3000)
    } catch (_err) {
      setMessage('Error updating tracking mode')
    } finally {
      setCookielessLoading(false)
    }
  }

  const handleRetentionSave = async () => {
    if (!site) return
    setRetentionSaving(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      const res = await fetch('/api/gdpr/retention', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_key: site.site_key, retention_days: retentionDays })
      })
      const json = await res.json()
      setMessage(json.message || (json.success ? 'Retention policy saved.' : 'Error saving.'))
      setTimeout(() => setMessage(''), 4000)
    } catch (_err) {
      setMessage('Error saving retention policy')
    } finally {
      setRetentionSaving(false)
    }
  }

  const handleVisitorDelete = async (e) => {
    e.preventDefault()
    if (!site || !visitorId.trim()) return
    setVisitorDeleting(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      const res = await fetch('/api/gdpr/visitor', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_key: site.site_key, anonymous_id: visitorId.trim() })
      })
      const json = await res.json()
      setMessage(json.message || (json.success ? 'Visitor data erased.' : 'Error erasing.'))
      setVisitorId('')
      setTimeout(() => setMessage(''), 4000)
    } catch (_err) {
      setMessage('Error deleting visitor data')
    } finally {
      setVisitorDeleting(false)
    }
  }

  const handleAccountDelete = async () => {
    if (deleteAccountConfirm !== 'DELETE') return
    setDeletingAccount(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      await fetch('/api/gdpr/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      // Force sign out — account no longer exists
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (_err) {
      setMessage('Error deleting account. Please contact support.')
      setDeletingAccount(false)
    }
  }

  const plan = site?.plan || 'trial'
  const isPro = plan === 'pro'
  const isTrial = plan === 'trial'

  // Days left in trial (14-day from created_at)
  const daysLeft = (() => {
    if (!site?.created_at || !isTrial) return null
    const end = new Date(new Date(site.created_at).getTime() + 14 * 86400000)
    const diff = Math.ceil((end - new Date()) / 86400000)
    return Math.max(0, diff)
  })()

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-st-black dark:text-white">Settings</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-1">{user?.email}</p>
      </div>

      {/* Status message */}
      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          message.includes('Error') || message.includes('Failed')
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
            : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
        }`}>
          {message}
        </div>
      )}

      {/* ── Plan & Billing ─────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Plan & Billing</h3>
        </div>
        
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Current Plan: <span className="font-semibold text-st-black dark:text-white capitalize">{plan}</span>
            </p>
            {isTrial && daysLeft !== null && (
              <p className="text-xs text-st-gray dark:text-gray-500 mt-1">
                {daysLeft > 0
                  ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining in trial`
                  : 'Trial expired'}
              </p>
            )}
          </div>

          {isPro && (
            <button
              onClick={handlePortal}
              disabled={loadingPortal}
              className="text-sm text-st-black dark:text-white border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {loadingPortal ? 'Loading…' : 'Manage Subscription'}
            </button>
          )}
        </div>
      </section>

      {/* ── Site Settings ──────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-st-black dark:text-white">Site Settings</h3>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">Site Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20"
              placeholder="My Website"
            />
          </div>
          <div>
            <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20"
              placeholder="yoursite.com"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </section>

      {/* ── Public Dashboard ───────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Public Dashboard</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">Share a read-only view of your analytics — no login required.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">{shareEnabled ? 'Sharing enabled' : 'Sharing disabled'}</span>
          <button
            onClick={handleShareToggle}
            disabled={shareLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              shareEnabled ? 'bg-st-black dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-st-black shadow transition-transform ${
              shareEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {shareEnabled && shareToken && (
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-st-gray dark:text-gray-400 shrink-0" />
            <span className="text-xs text-st-gray dark:text-gray-400 truncate flex-1">
              {`${window.location.origin}/public/${shareToken}`}
            </span>
            <button onClick={handleShareCopy} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
              {shareCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-st-gray dark:text-gray-400" />}
            </button>
            <a
              href={`${window.location.origin}/public/${shareToken}`}
              target="_blank" rel="noopener noreferrer"
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              <ExternalLink className="w-4 h-4 text-st-gray dark:text-gray-400" />
            </a>
          </div>
        )}
      </section>

      {/* ── Cookieless Tracking ───────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Cookieless Tracking</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">
          When enabled, the tracker uses a server-derived daily-rotating hash instead of localStorage or cookies.
          No personal data is stored in the browser — fully compliant with GDPR, ePrivacy, and PECR without a consent banner.
          Note: first-touch attribution is limited to the current session in cookieless mode.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {cookielessMode ? 'Cookieless mode on — use tracker.cookieless.js' : 'Standard mode — uses localStorage'}
          </span>
          <button
            onClick={handleCookielessToggle}
            disabled={cookielessLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
              cookielessMode ? 'bg-st-black dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-st-black shadow transition-transform ${
              cookielessMode ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        {cookielessMode && (
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Use this snippet instead:</p>
            <code className="block text-xs text-gray-600 dark:text-gray-400 break-all">
              {`<script async src="${typeof window !== 'undefined' ? window.location.origin : ''}/tracker/tracker.cookieless.js" data-site-key="${site?.site_key || 'YOUR_SITE_KEY'}"></script>`}
            </code>
          </div>
        )}
      </section>

      {/* ── Privacy & Data Retention ──────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Privacy &amp; Data</h3>
        </div>

        {/* Retention policy */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-st-black dark:text-white">Data Retention</p>
          <p className="text-xs text-st-gray dark:text-gray-400">
            Attribution records older than the selected period are automatically deleted each night.
            Set to "Keep forever" if you are not subject to a retention obligation.
          </p>
          <div className="flex items-center gap-3">
            <select
              value={retentionDays}
              onChange={e => setRetentionDays(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20"
            >
              <option value={0}>Keep forever</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
            </select>
            <button
              onClick={handleRetentionSave}
              disabled={retentionSaving}
              className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {retentionSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Visitor data erasure */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
          <p className="text-xs font-semibold text-st-black dark:text-white">Erase Visitor Data (Right to Erasure)</p>
          <p className="text-xs text-st-gray dark:text-gray-400">
            Enter a visitor's anonymous ID to permanently delete all attribution records and PostHog events associated with them.
          </p>
          <form onSubmit={handleVisitorDelete} className="flex items-center gap-3">
            <input
              type="text"
              value={visitorId}
              onChange={e => setVisitorId(e.target.value)}
              placeholder="anonymous_id (e.g. xxxxxxxx-xxxx-4xxx-…)"
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20"
            />
            <button
              type="submit"
              disabled={visitorDeleting || !visitorId.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {visitorDeleting ? 'Erasing…' : 'Erase'}
            </button>
          </form>
        </div>
      </section>

      {/* ── Danger Zone (Account Deletion) ────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-red-200 dark:border-red-900/40 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Danger Zone</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">
          Permanently delete your account, all sites, and all attribution data. This action is irreversible.
          Type <strong>DELETE</strong> to confirm.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={deleteAccountConfirm}
            onChange={e => setDeleteAccountConfirm(e.target.value)}
            placeholder='Type DELETE to confirm'
            className="flex-1 px-3 py-2 border border-red-200 dark:border-red-900/40 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40"
          />
          <button
            onClick={handleAccountDelete}
            disabled={deletingAccount || deleteAccountConfirm !== 'DELETE'}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deletingAccount ? 'Deleting…' : 'Delete Account'}
          </button>
        </div>
      </section>

      {/* ── UTM Builder ────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">UTM Builder</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">Generate tagged URLs for accurate campaign tracking. All parameters are lowercased automatically.</p>
        <UTMBuilder />
      </section>
    </div>
  )
}
