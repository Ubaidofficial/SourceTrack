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
import { LogoFull, LogoFullDark } from '../components/Logo'

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
  const [installMethod, setInstallMethod] = useState('standard')
  const [selectedConversions, setSelectedConversions] = useState([])
  const [snippet, setSnippet] = useState('')
  const [verificationState, setVerificationState] = useState('idle')
  const [videoModalOpen, setVideoModalOpen] = useState(false)

  useEffect(() => {
    loadOnboardingStatus()
  }, [])

  async function loadOnboardingStatus() {
    try {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase
        .from('sites')
        .select('id, site_key, onboarding_completed, onboarding_state, domain')
        .order('created_at', { ascending: true })
        .limit(1)

      if (member?.company_id) {
        query.eq('company_id', member.company_id)
      } else {
        query.eq('owner_id', user.id)
      }
      const { data: sites } = await query

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

    setLoading(true)
    try {
      // Domain creation/resume now goes through the backend so the access
      // checks + plan default + onboarding_state init all happen in one place.
      // The backend POST /onboarding/site normalizes the domain and either
      // resumes an existing one or creates a fresh site (with the DB default
      // plan='free' applied — do NOT pass plan from the client).
      const site = await fetchApi('/onboarding/site', {
        method: 'POST',
        body: JSON.stringify({ domain: trimmed })
      })

      if (site.onboarding_completed) {
        navigate('/dashboard', { replace: true })
        return
      }

      setSiteId(site.site_id)
      setSiteKey(site.site_key)
      const state = site.onboarding_state || {}
      setBusinessType(site.business_type || state.business_type || null)
      setInstallMethod(state.install_method || 'standard')
      setSelectedConversions(state.selected_conversions || [])
      setStep(2)
    } catch (err) {
      setError(err.message || 'Failed to register domain. Please try again.')
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
        setSnippet(`<script async src="${apiUrl}/tracker/tracker.min.js" data-site-key="${siteKey}"></script>`)
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
        // fetchApi sends the auth token + unwraps the { success, data, error }
        // envelope so we read installStatus.status directly.
        const installStatus = await fetchApi(`/install/status?${params}`)
        if (installStatus?.status === 'verified') {
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
              <label className="block text-sm font-bold text-[#1F2323] dark:text-gray-100 mb-2">Website Domain</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ex: google.com"
                className="w-full px-4 py-3 bg-white dark:bg-[#1A1F1F] text-[#1F2323] dark:text-white placeholder:text-[#8D9696] border border-[#C9D1D1] dark:border-white/15 rounded-xl text-sm outline-none focus:ring-2 focus:ring-st-lime focus:border-st-lime"
              />
              <p className="text-xs text-st-gray dark:text-gray-400 mt-1">We'll use this URL to personalize your set up process</p>
              {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="mt-5 inline-flex items-center justify-center gap-2 px-7 py-3 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Confirming...' : 'Confirm Domain'} {!loading && <ArrowRight className="w-4 h-4" />}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {BUSINESS_TYPES.map((bt) => {
                const Icon = bt.icon
                const selected = businessType === bt.key
                return (
                  <button
                    key={bt.key}
                    onClick={() => handleBusinessTypeSelect(bt.key)}
                    className={`flex flex-col items-center justify-center gap-3 min-h-[142px] p-5 rounded-2xl border-2 text-center transition-colors ${
                      selected
                        ? 'border-st-lime bg-st-lime/10 dark:bg-st-lime/10'
                        : 'border-gray-200 dark:border-white/10 hover:border-st-lime/70 dark:hover:border-st-lime/70 bg-white dark:bg-white/[0.02]'
                    }`}
                  >
                    <span className={`h-16 w-16 rounded-full flex items-center justify-center ${selected ? 'bg-st-lime text-[#1F2323]' : 'bg-white dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10'}`}>
                      <Icon className="w-8 h-8" />
                    </span>
                    <div>
                      <p className="font-extrabold text-[#1F2323] dark:text-white">{bt.label}</p>
                      <p className="text-xs text-st-gray dark:text-gray-400 mt-1">{bt.desc}</p>
                    </div>
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
            <p className="text-sm font-bold text-[#1F2323] dark:text-gray-100 mb-3">Choose Installation Method</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {INSTALL_METHODS.map((m) => {
                const Icon = m.icon
                const selected = installMethod === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => handleInstallMethodSelect(m.key)}
                    className={`flex flex-col items-center justify-center gap-4 min-h-[168px] p-5 rounded-2xl border-2 text-center transition-colors ${
                      selected
                        ? 'border-st-lime bg-st-lime/10 dark:bg-st-lime/10'
                        : m.advanced
                          ? 'border-gray-200 dark:border-white/10 hover:border-st-lime/70 bg-white dark:bg-white/[0.02] opacity-90'
                          : 'border-gray-200 dark:border-white/10 hover:border-st-lime/70 bg-white dark:bg-white/[0.02]'
                    }`}
                  >
                    <span className={`h-20 w-full rounded-xl flex items-center justify-center ${selected ? 'bg-white dark:bg-white text-[#1F2323]' : 'bg-[#F1F4F4] dark:bg-white/5 text-[#1F2323] dark:text-white'}`}>
                      <Icon className="w-10 h-10" />
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-center gap-2">
                        <p className="font-extrabold text-[#1F2323] dark:text-white">{m.label}</p>
                        {m.recommended && <span className="text-[10px] font-bold bg-lime-100 text-lime-800 px-1.5 py-0.5 rounded-full">Recommended</span>}
                      </div>
                      <p className="text-xs text-st-gray dark:text-gray-400 mt-1">{m.desc}</p>
                    </div>
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
            <p className="text-xs text-st-gray dark:text-gray-400 mt-1 mb-4">
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
                        ? 'border-gray-100 dark:border-[#2A2E2E] bg-gray-50 dark:bg-[#111414] opacity-50 cursor-not-allowed'
                        : selected
                        ? 'border-st-lime bg-st-lime/10'
                        : 'border-gray-200 dark:border-[#333838] hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      selected ? 'border-[#1F2323] bg-[#1F2323] dark:border-[#CCF03F] dark:bg-[#CCF03F]' : 'border-gray-300'
                    }`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-st-black">{conv.label}</p>
                      <p className="text-xs text-st-gray">{conv.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <button
              onClick={handleConversionsContinue}
              className="mt-6 w-full py-3 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90"
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
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Let us Verify SourceTrack Script in {installMethod === 'gtm' ? 'GTM' : 'Your Site'}
            </p>
            <p className="text-xs text-st-gray dark:text-gray-400 mb-4">
              Click the button below to check if your tracking script is live and sending data.
            </p>

            {verificationState === 'idle' && (
              <button
                onClick={handleVerify}
                className="w-full py-3 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90 flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" /> Run Verification
              </button>
            )}

            {verificationState === 'checking' && (
              <div className="text-center py-6">
                <RefreshCw className="w-8 h-8 animate-spin text-st-gray dark:text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">Checking installation...</p>
                <p className="text-xs text-st-gray dark:text-gray-400 mt-1">This may take up to 30 seconds</p>
              </div>
            )}

            {verificationState === 'success' && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-st-lime/10 dark:bg-st-lime/5 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-st-lime" />
                </div>
                <p className="text-lg font-semibold text-st-black">Great! Script Verified Successfully</p>
                <button
                  onClick={() => { seedReportsForBusiness(businessType, siteKey); navigate('/dashboard', { replace: true, state: { toast: 'Setup complete! Your dashboard is ready.' } }) }}
                  className="mt-4 px-6 py-3 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90 flex items-center gap-2 mx-auto"
                >
                  <ArrowRight className="w-4 h-4" /> Continue to Dashboard
                </button>
              </div>
            )}

            {verificationState === 'failed' && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-3">
                  <X className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-lg font-semibold text-st-black">Script not detected yet</p>
                {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
                <ul className="text-sm text-st-gray dark:text-gray-400 mt-3 space-y-1">
                  <li>Make sure the script is published on your live site</li>
                  <li>It may take 1-2 minutes for the first event to appear</li>
                </ul>
                <div className="flex items-center justify-center gap-3 mt-4">
                  <a href="/debugger" className="text-sm text-st-black dark:text-white hover:underline">Open Event Logger</a>
                  <button
                    onClick={handleVerify}
                    className="px-4 py-2 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90 flex items-center gap-2"
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
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Connect SourceTrack via Google Tag Manager</p>
            <p className="text-xs text-st-gray dark:text-gray-400 mb-4">
              Easily add SourceTrack to your website using Google Tag Manager (GTM) without editing your site's code manually.
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-200 space-y-2 mb-4">
              <li>Log in to your Google Tag Manager account and select your container.</li>
              <li>Go to Tags → New → Tag Configuration → Custom HTML.</li>
              <li>Paste your SourceTrack tracking script into the HTML box.</li>
              <li>Set the trigger to "All Pages" and save the tag.</li>
              <li>Click "Submit" and "Publish" your container.</li>
            </ol>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Standard Installation</p>
            <p className="text-xs text-st-gray dark:text-gray-400 mb-4">
              Add the SourceTrack tracking script directly to your website's &lt;head&gt; section.
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-200 space-y-2 mb-4">
              <li>Copy the tracking script below.</li>
              <li>Open your website's HTML template or theme file.</li>
              <li>Paste the script inside the &lt;head&gt; section, before the closing &lt;/head&gt; tag.</li>
              <li>Save and publish your changes.</li>
            </ol>
          </>
        )}

        <div className="bg-[#F1F4F4] dark:bg-[#252A29] border border-[#DDE4E4] dark:border-white/10 rounded-xl p-4 relative">
          <pre className="text-xs text-[#1F2323] dark:text-gray-200 overflow-x-auto whitespace-pre-wrap break-all pr-24">{snippet || 'Loading script...'}</pre>
          <button
            onClick={handleCopySnippet}
            className="absolute top-3 right-3 px-3 py-1.5 bg-white dark:bg-white/10 text-[#1F2323] dark:text-white border border-gray-200 dark:border-white/10 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/15 flex items-center gap-1"
          >
            <Copy className="w-3 h-3" /> Copy Code
          </button>
        </div>

        <button
          onClick={async () => {
            await saveOnboardingState(5, { install_method: installMethod })
            setStep(5)
          }}
          className="mt-6 w-full py-3 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90"
        >
          Continue
        </button>
      </OnboardingCard>
    )
  }

  return (
    <div className="min-h-screen bg-[#F1F4F4] dark:bg-[#2B302F] text-[#1F2323] dark:text-white flex flex-col">
      {/* Header — brand left, stepper centered (desktop), watch-video right */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-6 px-6 lg:px-12 py-8">
        <div className="dark:hidden"><LogoFull className="h-8 w-auto" /></div>
        <div className="hidden dark:block"><LogoFullDark className="h-8 w-auto" /></div>
        <OnboardingProgress currentStep={step} />
        <button
          onClick={() => setVideoModalOpen(true)}
          className="justify-self-end inline-flex items-center gap-3 text-left text-[#1F2323] dark:text-white"
        >
          <span className="h-12 w-12 rounded-full bg-st-lime text-[#1F2323] flex items-center justify-center shadow-[0_14px_32px_rgba(204,240,63,0.26)]">
            <Play className="w-5 h-5 fill-current" />
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-extrabold tracking-[-0.03em]">Watch Video</span>
            <span className="block text-xs text-[#6B7373] dark:text-gray-400">Learn how to setup</span>
          </span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* Mobile fallback: full stepper is hidden below md, show compact step text instead */}
        <div className="md:hidden text-center mb-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-white dark:bg-white/5 text-xs font-semibold text-[#6B7373] dark:text-gray-400 mb-2">
            Step {step} of 6
          </span>
          <p className="text-lg font-extrabold text-[#1F2323] dark:text-white">{STEP_TITLES[step]}</p>
        </div>
        {renderStepContent()}
      </div>

      {videoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setVideoModalOpen(false)}>
          <div className="bg-white dark:bg-[#1A1D1D] rounded-xl p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-st-black">Watch Video</h3>
              <button onClick={() => setVideoModalOpen(false)}>
                <X className="w-5 h-5 text-st-gray" />
              </button>
            </div>
            <div className="bg-gray-100 dark:bg-[#252929] rounded-lg h-48 flex items-center justify-center">
              <Play className="w-12 h-12 text-gray-300" />
            </div>
            <p className="text-sm text-st-gray dark:text-gray-400 mt-3 text-center">
              A walkthrough video will help you set up tracking in under 2 minutes.
            </p>
            <p className="text-xs text-st-gray dark:text-gray-400 mt-1 text-center">
              Video content coming soon.
            </p>
            <button
              onClick={() => setVideoModalOpen(false)}
              className="mt-4 w-full py-2 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-lg text-sm font-semibold hover:opacity-90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
