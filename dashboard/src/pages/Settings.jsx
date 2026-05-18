import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getBillingPortal } from '../lib/api'
import { Copy, Check, ExternalLink, Globe, Link2, CreditCard } from 'lucide-react'

export default function Settings() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [shareToken, setShareToken] = useState(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [message, setMessage] = useState('')
  const [loadingPortal, setLoadingPortal] = useState(false)

  useEffect(() => { loadSite() }, [user])

  async function loadSite() {
    const { data: member } = await supabase.from('company_members').select('company_id').eq('user_id', user.id).maybeSingle()
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
        const { data } = await supabase.from('sites').insert({ name, domain, owner_id: user.id, plan: 'trial' }).select().single()
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
      const returnUrl = window.location.origin + '/settings'
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
      const { data, error } = await supabase.from('sites').update({ public_share_enabled: newEnabled }).eq('id', site.id).select('public_share_token, public_share_enabled').single()
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
    navigator.clipboard.writeText(window.location.origin + '/public/' + shareToken)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const plan = site?.plan || 'trial'
  const isPro = plan === 'pro'
  const isTrial = plan === 'trial'
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
      {message && (
        <div className={'rounded-lg px-4 py-3 text-sm ' + (message.includes('Error') || message.includes('Failed') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800')}>
          {message}
        </div>
      )}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Plan & Billing</h3>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Current Plan: <span className="font-semibold text-st-black dark:text-white capitalize">{plan}</span></p>
            {isTrial && daysLeft !== null && (<p className="text-xs text-st-gray dark:text-gray-500 mt-1">{daysLeft > 0 ? daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' remaining in trial' : 'Trial expired'}</p>)}
          </div>
          {isPro && (<button onClick={handlePortal} disabled={loadingPortal} className="text-sm text-st-black dark:text-white border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">{loadingPortal ? 'Loading…' : 'Manage Subscription'}</button>)}
        </div>
      </section>
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-st-black dark:text-white">Site Settings</h3>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">Site Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20" placeholder="My Website" />
          </div>
          <div>
            <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">Domain</label>
            <input type="text" value={domain} onChange={e => setDomain(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20" placeholder="yoursite.com" />
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">{saving ? 'Saving…' : 'Save Changes'}</button>
        </form>
      </section>
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-st-gray dark:text-gray-400" />
          <h3 className="text-sm font-bold text-st-black dark:text-white">Public Dashboard</h3>
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400">Share a read-only view of your analytics — no login required.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">{shareEnabled ? 'Sharing enabled' : 'Sharing disabled'}</span>
          <button onClick={handleShareToggle} disabled={shareLoading} className={'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ' + (shareEnabled ? 'bg-st-black dark:bg-white' : 'bg-gray-200 dark:bg-gray-700')}>
            <span className={'inline-block h-4 w-4 transform rounded-full bg-white dark:bg-st-black shadow transition-transform ' + (shareEnabled ? 'translate-x-6' : 'translate-x-1')} />
          </button>
        </div>
        {shareEnabled && shareToken && (
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-st-gray dark:text-gray-400 shrink-0" />
            <span className="text-xs text-st-gray dark:text-gray-400 truncate flex-1">{window.location.origin + '/public/' + shareToken}</span>
            <button onClick={handleShareCopy} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">{shareCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-st-gray dark:text-gray-400" />}</button>
            <a href={window.location.origin + '/public/' + shareToken} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"><ExternalLink className="w-4 h-4 text-st-gray dark:text-gray-400" /></a>
          </div>
        )}
      </section>
    </div>
  )
}
