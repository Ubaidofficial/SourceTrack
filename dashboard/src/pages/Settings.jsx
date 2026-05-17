import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { createCheckout, getBillingPortal } from '../lib/api'
import { Copy, Check, Code, ExternalLink, Globe, Link2 } from 'lucide-react'

export default function Settings() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const checkoutSuccess = searchParams.get('checkout') === 'success'

  const [site, setSite] = useState(null)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [shareToken, setShareToken] = useState(null)
  const [apiKey, setApiKey] = useState(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [loadingCheckout, setLoadingCheckout] = useState(false)
  const [loadingPortal, setLoadingPortal] = useState(false)

  useEffect(() => {
    if (checkoutSuccess) {
      setMessage('Subscription activated! Refreshing...')
      setTimeout(() => loadSite(), 2000)
    }
  }, [checkoutSuccess])

  useEffect(() => {
    loadSite()
  }, [user])

  async function loadSite() {
    const { data: member } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const query = supabase.from('sites').select('*').limit(1)
    if (member?.company_id) {
      query.eq('company_id', member.company_id)
    } else {
      query.eq('owner_id', user.id)
    }
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
          name,
          domain,
          owner_id: user.id,
          plan: 'trial'
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

  const handleSubscribe = async () => {
    if (!site) return
    setLoadingCheckout(true)
    setMessage('')
    try {
      const successUrl = `${window.location.origin}/settings?checkout=success`
      const cancelUrl = `${window.location.origin}/settings`
      const data = await createCheckout(site.site_key, successUrl, cancelUrl)
      if (data?.url) {
        window.location.href = data.url
      }
    } catch (_err) {
      setMessage('Failed to start checkout')
    } finally {
      setLoadingCheckout(false)
    }
  }

  const handlePortal = async () => {
    if (!site) return
    setLoadingPortal(true)
    setMessage('')
    try {
      const returnUrl = `${window.location.origin}/settings`
      const data = await getBillingPortal(site.site_key, returnUrl)
      if (data?.url) {
        window.location.href = data.url
      }
    } catch (_err) {
      setMessage('Failed to open billing portal')
    } finally {
      setLoadingPortal(false)
    }
  }

  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin
  const snippet = site
    ? `<script async src="${apiUrl}/tracker/loader.min.js" data-site-key="${site.site_key}"></script>`
    : ''

  const handleCopy = async () => {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_err) {
      /* clipboard unavailable */
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
    } catch (err) {
      setMessage('Error updating share settings')
    } finally {
      setShareLoading(false)
    }
  }

  const handleShareCopy = () => {
    const url = `${window.location.origin}/public/${shareToken}`
    navigator.clipboard.writeText(url)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const planLabel = site?.plan === 'pro' ? 'Pro' : site?.plan === 'inactive' ? 'Inactive' : 'Trial'
  const planColor = site?.plan === 'pro' ? 'text-st-black' : site?.plan === 'inactive' ? 'text-red-600' : 'text-amber-600'

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-2xl font-bold text-st-black">Settings</h2>
        <p className="text-sm text-st-gray mt-1">{user?.email}</p>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          message.includes('Error') || message.includes('Failed')
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {message}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-gray-700" />
          <h3 className="text-sm font-semibold text-gray-700">Public Dashboard</h3>
        </div>
        <p className="text-xs text-st-gray">Share a read-only view of your analytics with anyone — no login required.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{shareEnabled ? 'Sharing enabled' : 'Sharing disabled'}</span>
          <button onClick={handleShareToggle} disabled={shareLoading} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${shareEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${shareEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {shareEnabled && shareToken && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-st-gray shrink-0" />
            <span className="text-xs text-st-gray truncate flex-1">{`${window.location.origin}/public/${shareToken}`}</span>
            <button onClick={handleShareCopy} className="p-1 hover:bg-gray-200 rounded transition-colors">
              {shareCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-st-gray" />}
            </button>
            <a href={`${window.location.origin}/public/${shareToken}`} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-gray-200 rounded transition-colors">
              <ExternalLink className="w-4 h-4 text-st-gray" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function TrialDays({ created_at }) {
  const [daysLeft, setDaysLeft] = useState(null)

  useEffect(() => {
    function calc() {
      const created = new Date(created_at)
      const end = new Date(created.getTime() + 14 * 24 * 60 * 60 * 1000)
      const diff = Math.ceil((end - new Date()) / (24 * 60 * 60 * 1000))
      setDaysLeft(Math.max(0, diff))
    }
    calc()
    const interval = setInterval(calc, 60_000)
    return () => clearInterval(interval)
  }, [created_at])

  if (daysLeft === null) return null

  return (
    <p className="text-xs text-st-gray">
      {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in trial` : 'Trial expired'}
    </p>
  )
}
