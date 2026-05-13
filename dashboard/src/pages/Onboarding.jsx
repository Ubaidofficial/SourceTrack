import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { seedReportsForBusiness } from '../lib/seedReports'
import { useAuth } from '../contexts/AuthContext'
import {
  Globe, ShoppingCart, CreditCard, Layers,
  Code, FileCode, Check, X, ArrowRight, Copy, RefreshCw, Play
} from 'lucide-react'
import OnboardingProgress from '../components/OnboardingProgress'
import OnboardingCard from '../components/OnboardingCard'

const STEP_TITLES = {
  1: 'Connect Domain',
  2: 'Select Business Type',
  3: 'Install Script',
  4: 'Installation Instructions',
  5: 'Customize Conversions',
  6: 'Verify Installation'
}

const BUSINESS_TYPES = [
  { key: 'ecommerce', label: 'eCommerce', icon: ShoppingCart, desc: 'Online store selling products' },
  { key: 'saas', label: 'SaaS', icon: CreditCard, desc: 'Subscription software business' },
  { key: 'leadgen', label: 'Lead Gen / Other', icon: Layers, desc: 'Generate leads or other goals' }
]

const INSTALL_METHODS = [
  { key: 'standard', label: 'SourceTrack Pixel', icon: Code, desc: 'Add one script to your website — recommended for most users', recommended: true },
  { key: 'gtm', label: 'Google Tag Manager', icon: FileCode, desc: 'Install via GTM — for teams already using Tag Manager', advanced: true }
]

const CONVERSIONS = [
  { key: 'purchase', label: 'Purchase', desc: 'Completed checkout or payment' },
  { key: 'trial', label: 'Free Trial', desc: 'Started a free trial' },
  { key: 'lead', label: 'Lead Form Submission', desc: 'Submitted a contact or lead form' },
  { key: 'signup', label: 'Sign Up', desc: 'Created a new account' },
  { key: 'meeting', label: 'Schedule a Meeting', desc: 'Booked a meeting or demo' },
  { key: 'custom', label: 'Custom...', desc: 'Define your own conversion event', disabled: true }
]

function getDefaultConversions(businessType) {
  switch (businessType) {
    case 'ecommerce': return ['purchase']
    case 'saas': return ['trial', 'meeting']
    case 'leadgen': return ['lead']
    default: return []
  }
}

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [siteId, setSiteId] = useState(null)
  const [siteKey, setSiteKey] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [domain, setDomain] = useState('')
  const [businessType, setBusinessType] = useState(null)
  const [installMethod, setInstallMethod] = useState(null)
  const [selectedConversions, setSelectedConversions] = useState([])
  const [snippet, setSnippet] = useState('')
  const [verificationState, setVerificationState] = useState('idle')
  const [videoModalOpen, setVideoModalOpen] = useState(false)

  useEffect(() => {
    loadOnboardingStatus()
  }, [])

  async function loadOnboardingStatus() {
    try {
      const { data: sites } = await supabase
        .from('sites')
        .select('id, site_key, onboarding_completed, onboarding_state, domain')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)

      const site = sites?.[0]
      if (!site) return

      if (site.onboarding_completed) {
        navigate('/dashboard', { replace: true })
        return
      }

      setSiteId(site.id)
      setSiteKey(site.site_key)

      const state = site.onboarding_state || {}
      if (state.current_step && state.current_step > 1) {
        setStep(state.current_step)
        setBusinessType(state.business_type || null)
        setInstallMethod(state.install_method || null)
        setSelectedConversions(state.selected_conversions || [])
      }
      if (site.domain) {
        setDomain(site.domain)
        setStep((prev) => (prev === 1 ? 2 : prev))
      }
      if (businessType && step < 3) setStep(2)
    } catch (_err) {
      /* ignore */
    }
  }

  async function saveOnboardingState(nextStep, extraData = {}) {
    if (!siteId) return
    try {
      await fetchApi('/onboarding/update', {
        method: 'POST',
        body: JSON.stringify({ site_id: siteId, step: nextStep, data: extraData })
      })
    } catch (_err) {
      /* non-critical — state persists for next load */
    }
  }

  async function saveOnboardingStateViaSite(id, nextStep, extraData = {}) {
    try {
      await fetchApi('/onboarding/update', {
        method: 'POST',
        body: JSON.stringify({ site_id: id, step: nextStep, data: extraData })
      })
    } catch (_err) {
      /* non-critical */
    }
  }

  async function handleDomainSubmit(e) {
    e.preventDefault()
    setError('')

    const trimmed = domain.trim().toLowerCase()
    if (!trimmed) {
      setError('Please enter a domain')
      return
    }

    try {
      const url = new URL(`https://${trimmed}`)
      if (url.hostname === 'localhost' || url.hostname.includes('staging')) {
        setError('Please enter a production domain (localhost and staging domains are not supported)')
        return
      }
    } catch {
      setError('Please enter a valid domain (e.g., yoursite.com)')
      return
    }

    try {
      const { data: existing } = await supabase
        .from('sites')
        .select('id, domain, onboarding_completed, onboarding_state, site_key')
        .eq('owner_id', user.id)
        .eq('domain', trimmed)
        .maybeSingle()

      if (existing) {
        if (existing.onboarding_completed) {
          navigate('/dashboard', { replace: true })
          return
        }
        setSiteId(existing.id)
        setSiteKey(existing.site_key)
        const state = existing.onboarding_state || {}
        if (state.current_step && state.current_step > 1) {
          setStep(state.current_step)
          setBusinessType(state.business_type || null)
          setInstallMethod(state.install_method || null)
          setSelectedConversions(state.selected_conversions || [])
        } else {
          setStep(2)
          await saveOnboardingStateViaSite(existing.id, 2, { business_type: null, install_method: null, selected_conversions: [] })
        }
        return
      }
    } catch {
      /* proceed */
    }

    setLoading(true)
    try {
      const siteKey = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`

      const { data: site, error: createErr } = await supabase
        .from('sites')
        .insert({
          owner_id: user.id,
          domain: trimmed,
          site_key: siteKey,
          name: trimmed
        })
        .select('id, site_key')
        .single()

      if (createErr) {
        if (createErr.code === '23505') {
          setError('This domain already exists in your workspace. Resuming setup.')
        } else if (createErr.message?.includes('duplicate')) {
          setError('This site is already registered; resuming setup.')
        } else {
          setError(`Registration failed: ${createErr.message || 'Unknown error'}`)
        }
        throw createErr
      }

      setSiteId(site.id)
      setSiteKey(site.site_key)
      await saveOnboardingState(2, { business_type: null, install_method: null, selected_conversions: [] })
      setStep(2)
    } catch (_err) {
      if (!error) {
        setError('Failed to register domain. Please try again.')
      }
      console.error(_err)
    } finally {
      setLoading(false)
    }
  }

  async function handleBusinessTypeSelect(type) {
    setBusinessType(type)
    const defaults = getDefaultConversions(type)
    setSelectedConversions(defaults)
    await saveOnboardingState(3, {
      business_type: type,
      install_method: null,
      selected_conversions: defaults
    })
    setStep(3)
  }

  async function handleInstallMethodSelect(method) {
    setInstallMethod(method)
    if (siteId) {
      try {
        const data = await fetchApi(`/install/snippet?site_id=${siteId}`)
        if (data?.snippet) setSnippet(data.snippet)
      } catch {
        const apiUrl = import.meta.env.VITE_API_URL || window.location.origin
        setSnippet(`<script async src="${apiUrl}/tracker/loader.min.js" data-site-key="${siteKey}"></script>`)
      }
    }
    await saveOnboardingState(4, { install_method: method })
    setStep(4)
  }

  function toggleConversion(key) {
    setSelectedConversions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function handleConversionsContinue() {
    await saveOnboardingState(6, { selected_conversions: selectedConversions })
    setStep(6)
  }

  async function handleVerify() {
    setVerificationState('checking')
    let attempts = 0
    const maxAttempts = 6

    async function poll() {
      try {
        const params = new URLSearchParams({ site_key: siteKey })
        const res = await fetch(`/api/install/status?${params}`)
        const json = await res.json()
        if (json.data?.status === 'verified') {
          setVerificationState('success')
          const completeRes = await fetchApi('/onboarding/complete', {
            method: 'POST',
            body: JSON.stringify({ site_id: siteId })
          })
          if (!completeRes || completeRes.success === false) {
            setVerificationState('failed')
            setError(completeRes?.error || 'Installation could not be verified. Please try again.')
            return
          }
          seedReportsForBusiness(businessType, siteKey)
          setTimeout(() => {
            navigate('/dashboard', { replace: true, state: { toast: 'Setup complete! Your dashboard is ready.' } })
          }, 1500)
          return
        }
      } catch {
        /* retry */
      }
      attempts++
      if (attempts < maxAttempts) {
        setVerificationState('checking')
        setTimeout(poll, 5000)
      } else {
        setVerificationState('failed')
      }
    }

    poll()
  }

  function handleCopySnippet() {
    if (snippet) {
      navigator.clipboard.writeText(snippet).catch(() => {})
    }
  }

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <OnboardingCard
            icon={Globe}
            title="Connect Your Domain"
            subtitle="Register your domain (e.g., yourstore.com) inside SourceTrack."
          >
            <form onSubmit={handleDomainSubmit}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website Domain</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ex: google.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
              />
              <p className="text-xs text-st-gray mt-1">We'll use this URL to personalize your set up process</p>
              {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="mt-4 w-full py-3 bg-st-black text-white rounded-lg text-sm font-semibold hover:bg-st-black/90 disabled:opacity-50"
              >
                {loading ? 'Confirming...' : 'Confirm Domain'}
              </button>
            </form>
          </OnboardingCard>
        )

      case 2:
        return (
          <OnboardingCard
            icon={ShoppingCart}
            title="Select business type"
            subtitle="Select your website business type"
            showBack
            onBack={() => setStep(1)}
          >
            <div className="grid grid-cols-1 gap-3">
              {BUSINESS_TYPES.map((bt) => {
                const Icon = bt.icon
                const selected = businessType === bt.key
                return (
                  <button
                    key={bt.key}
                    onClick={() => handleBusinessTypeSelect(bt.key)}
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-colors ${
                      selected
                        ? 'border-st-lime bg-st-lime/10'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-8 h-8 text-gray-700" />
                    <div>
                      <p className="font-semibold text-gray-900">{bt.label}</p>
                      <p className="text-xs text-st-gray">{bt.desc}</p>
                    </div>
                    {selected && <Check className="w-5 h-5 text-st-lime ml-auto" />}
                  </button>
                )
              })}
            </div>
          </OnboardingCard>
        )

      case 3:
        return (
          <OnboardingCard
            icon={Code}
            title="Install Tracking Script"
            subtitle="Copy the unique SourceTrack tracking script generated for your website."
            showBack
            onBack={() => setStep(2)}
          >
            <p className="text-sm font-medium text-gray-700 mb-2">Choose Installation Method</p>
            <div className="grid grid-cols-1 gap-3">
              {INSTALL_METHODS.map((m) => {
                const Icon = m.icon
                const selected = installMethod === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => handleInstallMethodSelect(m.key)}
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-colors ${
                      selected
                        ? 'border-st-lime bg-st-lime/10'
                        : m.advanced
                          ? 'border-gray-200 hover:border-gray-300 opacity-90'
                          : 'border-gray-900/20 hover:border-gray-300 bg-gray-50'
                    }`}
                  >
                    <Icon className="w-8 h-8 text-gray-700" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{m.label}</p>
                        {m.recommended && <span className="text-[10px] font-semibold bg-lime-100 text-lime-800 px-1.5 py-0.5 rounded-full">Recommended</span>}
                      </div>
                      <p className="text-xs text-st-gray">{m.desc}</p>
                    </div>
                    {selected && <Check className="w-5 h-5 text-st-lime ml-auto" />}
                  </button>
                )
              })}
            </div>
          </OnboardingCard>
        )

      case 4:
        return renderInstallInstructions()

      case 5:
        return (
          <OnboardingCard
            icon={Check}
            title="Now customize your dashboard"
            subtitle="Since you have added our tracking script now it's time to customize your dashboard. Data should start flowing within the next few minutes."
            showBack
            onBack={() => setStep(3)}
          >
            <p className="text-sm font-medium text-gray-700">Configure Conversions</p>
            <p className="text-xs text-st-gray mt-1 mb-4">
              Define what success means for your business. Select or create conversion events to track.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CONVERSIONS.map((conv) => {
                const selected = selectedConversions.includes(conv.key)
                return (
                  <button
                    key={conv.key}
                    onClick={() => !conv.disabled && toggleConversion(conv.key)}
                    disabled={conv.disabled}
                    className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
                      conv.disabled
                        ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                        : selected
                        ? 'border-st-lime bg-st-lime/10'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      selected ? 'border-st-black bg-st-black' : 'border-gray-300'
                    }`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{conv.label}</p>
                      <p className="text-xs text-st-gray">{conv.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <button
              onClick={handleConversionsContinue}
              className="mt-6 w-full py-3 bg-st-black text-white rounded-lg text-sm font-semibold hover:bg-st-black/90"
            >
              Continue
            </button>
          </OnboardingCard>
        )

      case 6:
        return (
          <OnboardingCard
            icon={Play}
            title="Verify your script"
            subtitle="We need to check whether you've placed the script in the correct location or not."
            showBack
            onBack={() => setStep(5)}
          >
            <p className="text-sm font-medium text-gray-700 mb-1">
              Let us Verify SourceTrack Script in {installMethod === 'gtm' ? 'GTM' : 'Your Site'}
            </p>
            <p className="text-xs text-st-gray mb-4">
              Click the button below to check if your tracking script is live and sending data.
            </p>

            {verificationState === 'idle' && (
              <button
                onClick={handleVerify}
                className="w-full py-3 bg-st-black text-white rounded-lg text-sm font-semibold hover:bg-st-black/90 flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" /> Run Verification
              </button>
            )}

            {verificationState === 'checking' && (
              <div className="text-center py-6">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">Checking installation...</p>
                <p className="text-xs text-st-gray mt-1">This may take up to 30 seconds</p>
              </div>
            )}

            {verificationState === 'success' && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-st-lime/10 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-st-lime" />
                </div>
                <p className="text-lg font-semibold text-gray-900">Great! Script Verified Successfully</p>
                <button
                  onClick={() => { seedReportsForBusiness(businessType, siteKey); navigate('/dashboard', { replace: true, state: { toast: 'Setup complete! Your dashboard is ready.' } }) }}
                  className="mt-4 px-6 py-3 bg-st-black text-white rounded-lg text-sm font-semibold hover:bg-st-black/90 flex items-center gap-2 mx-auto"
                >
                  <ArrowRight className="w-4 h-4" /> Continue to Dashboard
                </button>
              </div>
            )}

            {verificationState === 'failed' && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                  <X className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-lg font-semibold text-gray-900">Script not detected yet</p>
                {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
                <ul className="text-sm text-st-gray mt-3 space-y-1">
                  <li>Make sure the script is published on your live site</li>
                  <li>It may take 1-2 minutes for the first event to appear</li>
                </ul>
                <div className="flex items-center justify-center gap-3 mt-4">
                  <a href="/debugger" className="text-sm text-gray-900 hover:underline">Open Event Logger</a>
                  <button
                    onClick={handleVerify}
                    className="px-4 py-2 bg-st-black text-white rounded-lg text-sm font-semibold hover:bg-st-black/90 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" /> Try Again
                  </button>
                </div>
              </div>
            )}
          </OnboardingCard>
        )

      default:
        return null
    }
  }

  function renderInstallInstructions() {
    const isGTM = installMethod === 'gtm'

    return (
      <OnboardingCard
        icon={isGTM ? FileCode : Code}
        title="Install Tracking Script"
        subtitle="Copy the unique SourceTrack tracking script generated for your website."
        showBack
        onBack={() => setStep(3)}
      >
        {isGTM ? (
          <>
            <p className="text-sm font-medium text-gray-700 mb-1">Connect SourceTrack via Google Tag Manager</p>
            <p className="text-xs text-st-gray mb-4">
              Easily add SourceTrack to your website using Google Tag Manager (GTM) without editing your site's code manually.
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 mb-4">
              <li>Log in to your Google Tag Manager account and select your container.</li>
              <li>Go to Tags → New → Tag Configuration → Custom HTML.</li>
              <li>Paste your SourceTrack tracking script into the HTML box.</li>
              <li>Set the trigger to "All Pages" and save the tag.</li>
              <li>Click "Submit" and "Publish" your container.</li>
            </ol>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700 mb-1">Standard Installation</p>
            <p className="text-xs text-st-gray mb-4">
              Add the SourceTrack tracking script directly to your website's &lt;head&gt; section.
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 mb-4">
              <li>Copy the tracking script below.</li>
              <li>Open your website's HTML template or theme file.</li>
              <li>Paste the script inside the &lt;head&gt; section, before the closing &lt;/head&gt; tag.</li>
              <li>Save and publish your changes.</li>
            </ol>
          </>
        )}

        <div className="bg-gray-900 rounded-lg p-4 relative">
          <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all">{snippet || 'Loading script...'}</pre>
          <button
            onClick={handleCopySnippet}
            className="absolute top-3 right-3 px-3 py-1.5 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 flex items-center gap-1"
          >
            <Copy className="w-3 h-3" /> Copy Code
          </button>
        </div>

        <button
          onClick={async () => {
            await saveOnboardingState(5, { install_method: installMethod })
            setStep(5)
          }}
          className="mt-6 w-full py-3 bg-st-black text-white rounded-lg text-sm font-semibold hover:bg-st-black/90"
        >
          Continue
        </button>
      </OnboardingCard>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-st-black">SourceTrack</h1>
        <button
          onClick={() => setVideoModalOpen(true)}
          className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <Play className="w-4 h-4" /> Watch Video
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <p className="text-xs text-st-gray uppercase tracking-wider mb-1">Step {step} of 6</p>
        <p className="text-lg font-semibold text-gray-900 mb-6">{STEP_TITLES[step]}</p>
        <OnboardingProgress currentStep={step} />
        {renderStepContent()}
      </div>

      {videoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setVideoModalOpen(false)}>
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Watch Video</h3>
              <button onClick={() => setVideoModalOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center">
              <Play className="w-12 h-12 text-gray-300" />
            </div>
            <p className="text-sm text-st-gray mt-3 text-center">
              A walkthrough video will help you set up tracking in under 2 minutes.
            </p>
            <p className="text-xs text-st-gray mt-1 text-center">
              {/* TODO confirm: Watch Video modal content */}
              Video content coming soon.
            </p>
            <button
              onClick={() => setVideoModalOpen(false)}
              className="mt-4 w-full py-2 bg-st-black text-white rounded-lg text-sm font-semibold hover:bg-st-black/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
