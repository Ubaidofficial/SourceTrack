import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { createCheckout } from '../lib/api'
import { Copy, Check, ArrowRight, Sparkles } from 'lucide-react'

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const upgrade = searchParams.get('upgrade') === 'true'

  const [step, setStep] = useState(1)
  const [site, setSite] = useState(null)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [loadingCheckout, setLoadingCheckout] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sites')
        .select('*')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
      if (data) {
        setSite(data)
        setName(data.name || '')
        setDomain(data.domain || '')
        setStep(2)
      }
    }
    load()
  }, [user])

  const handleCreateSite = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { data, error: insertErr } = await supabase
        .from('sites')
        .insert({ name, domain, owner_id: user.id, plan: 'trial' })
        .select()
        .single()
      if (insertErr) throw insertErr
      setSite(data)
      setStep(2)
    } catch (_err) {
      setError('Failed to create site')
    } finally {
      setSaving(false)
    }
  }

  const handleSubscribe = async () => {
    if (!site) return
    setLoadingCheckout(true)
    setError('')
    try {
      const successUrl = `${window.location.origin}/settings?checkout=success`
      const cancelUrl = `${window.location.origin}/onboarding?upgrade=true`
      const data = await createCheckout(site.site_key, successUrl, cancelUrl)
      if (data?.url) {
        window.location.href = data.url
      }
    } catch (_err) {
      setError('Failed to start checkout')
    } finally {
      setLoadingCheckout(false)
    }
  }

  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin
  const snippet = site
    ? `<script>\nwindow.__trackiq_config = {\n  site_key: "${site.site_key}",\n  api_url: "${apiUrl}"\n}\n</script>\n<script src="${apiUrl}/tracker.min.js" async></script>`
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

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <Sparkles className="w-10 h-10 text-indigo-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">
            {upgrade ? 'Upgrade to Pro' : 'Welcome to TrackIQ'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {upgrade
              ? 'Your trial has ended. Subscribe to continue.'
              : 'Set up your site and start tracking in 2 minutes'}
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 1 ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600'}`}>1</span>
          <span className="w-8 h-px bg-gray-300" />
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 2 ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600'}`}>2</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Create Site */}
        {step === 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Create your site</h3>
            <form onSubmit={handleCreateSite} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Site Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="My Website"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Domain (optional)</label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="example.com"
                />
              </div>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? 'Creating...' : 'Continue'} <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Snippet + Subscribe */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Snippet */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Add this snippet to your website</h3>
              <div className="bg-gray-900 rounded-lg p-4 relative mb-3">
                <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400">Paste this in the &lt;head&gt; of your website to start tracking.</p>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Choose your plan</h3>

              <button
                onClick={handleSubscribe}
                disabled={loadingCheckout}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loadingCheckout ? 'Loading...' : 'Subscribe to Pro — $29/mo'}
              </button>

              {!upgrade && (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Continue with free trial
                </button>
              )}

              <p className="text-xs text-gray-400 text-center">
                14-day free trial. Cancel anytime.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
