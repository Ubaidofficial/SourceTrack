import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { createCheckout, getBillingPortal } from '../lib/api'
import { Copy, Check, Code, ExternalLink } from 'lucide-react'

export default function Settings() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const checkoutSuccess = searchParams.get('checkout') === 'success'

  const [site, setSite] = useState(null)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)
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
    const { data } = await supabase
      .from('sites')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle()
    setSite(data)
    if (data) {
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

  const planLabel = site?.plan === 'pro' ? 'Pro' : site?.plan === 'inactive' ? 'Inactive' : 'Trial'
  const planColor = site?.plan === 'pro' ? 'text-gray-900' : site?.plan === 'inactive' ? 'text-red-600' : 'text-amber-600'

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
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

      {/* Site Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Site Configuration</h3>

        {site && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Site Key</p>
            <p className="text-sm font-mono text-gray-900">{site.site_key}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Site Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="My Website"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="example.com"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      {/* Plan + Billing */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Plan & Billing</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Current plan</p>
            <p className={`text-lg font-semibold ${planColor}`}>{planLabel}</p>
          </div>

          {site?.plan === 'pro' ? (
            <button
              onClick={handlePortal}
              disabled={loadingPortal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
            >
              {loadingPortal ? 'Loading...' : 'Manage Billing'} <ExternalLink className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={loadingCheckout}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {loadingCheckout ? 'Loading...' : site?.plan === 'trial' ? 'Upgrade to Pro' : 'Reactivate'}
            </button>
          )}
        </div>

        {site?.plan === 'trial' && site?.created_at && (
          <TrialDays created_at={site.created_at} />
        )}
      </div>

      {/* Ignored Referrers */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Ignored Referrers & Sources</h3>
        <p className="text-xs text-gray-400">
          Referrers from these domains will not overwrite attribution. Useful for payment gateways and auth redirects.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-700">
            TODO: confirm exact persistence — this list is currently hardcoded as defaults.
          </p>
          <ul className="list-disc list-inside text-xs text-amber-600 mt-1 space-y-0.5">
            <li>paypal.com</li>
            <li>checkout.stripe.com</li>
            <li>accounts.google.com</li>
            <li>login.microsoftonline.com</li>
            <li>appleid.apple.com</li>
          </ul>
        </div>
        <p className="text-xs text-gray-400">
          Configuration UI will be built once the sites.config JSONB column is confirmed in the schema.
        </p>
      </div>

      {/* Snippet */}
      {site && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-gray-700" />
            <h3 className="text-sm font-semibold text-gray-700">Tracking Snippet</h3>
          </div>

          <p className="text-xs text-gray-400">Add this to the &lt;head&gt; of your website to start tracking.</p>

          <div className="bg-gray-900 rounded-lg p-4 relative">
            <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
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
    <p className="text-xs text-gray-400">
      {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in trial` : 'Trial expired'}
    </p>
  )
}
