import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { seedReportsForBusiness } from '../lib/seedReports'
import { useAuth } from '../contexts/AuthContext'
import {
  Globe, ShoppingCart, CreditCard, Layers,
  Code, FileCode, Check, X, ArrowRight, ArrowLeft, Copy, RefreshCw, Play
} from 'lucide-react'
import OnboardingCard from '../components/OnboardingCard'
import SetupDoctorCard from '../components/SetupDoctorCard'
import { LogoFull, LogoFullDark } from '../components/Logo'

const STEP_TITLES = {
  1: 'Connect Domain',
  2: 'Select Business Type',
  3: 'Install Script',
  4: 'Installation Instructions',
  5: 'Customize Conversions',
  6: 'Verify Installation'
}

const STEPPER_LABELS = [
  'Connect Domain',
  'Business Type',
  'Install Method',
  'Install Script',
  'Customize',
  'Run Verification'
]

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
  const { user, signOut } = useAuth()
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
  const [verificationSuccess, setVerificationSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleOnboardingVerified = useCallback((diagnostics) => {
    setVerificationSuccess(true)
  }, [])

  useEffect(() => {
    loadOnboardingStatus()
  }, [])

  async function loadOnboardingStatus() {
    try {
      const savedKey = window.localStorage.getItem('sourcetrack_active_site_key')
      const url = savedKey ? `/onboarding/me?mode=onboarding&site_key=${savedKey}` : '/onboarding/me?mode=onboarding'
      const site = await fetchApi(url)

      if (!site || !site.has_site) return

      if (site.onboarding_completed) {
        navigate('/dashboard', { replace: true })
        return
      }

      setSiteId(site.site_id)
      setSiteKey(site.site_key)

      const state = site.onboarding_state || {}
      let stepToSet = 1
      if (state.current_step && state.current_step > 1) {
        stepToSet = state.current_step
        setStep(state.current_step)
        setBusinessType(site.business_type || state.business_type || null)
        setInstallMethod(state.install_method || null)
        setSelectedConversions(state.selected_conversions || [])
      }
      if (site.domain) {
        setDomain(site.domain)
        if (stepToSet === 1) {
          stepToSet = 2
          setStep(2)
        }
      }
      if ((site.business_type || state.business_type) && stepToSet < 3) {
        stepToSet = 2
        setStep(2)
      }

      if (stepToSet >= 4 && site.site_id) {
        try {
          const data = await fetchApi(`/install/snippet?site_id=${site.site_id}`)
          if (data?.snippet) setSnippet(data.snippet)
        } catch (_err) {
          const trackerUrl = (import.meta.env.VITE_TRACKER_BASE_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '')
          setSnippet(`<script async src="${trackerUrl}/tracker.min.js" data-site-key="${site.site_key}"></script>`)
        }
      }
    } catch (_err) {
      /* ignore */
    }
  }

  async function saveOnboardingState(nextStep, extraData = {}) {
    if (!siteId) return
    await fetchApi('/onboarding/update', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, step: nextStep, data: extraData })
    })
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
    setError('')
    setLoading(true)
    const defaults = getDefaultConversions(type)
    try {
      await saveOnboardingState(3, {
        business_type: type,
        selected_conversions: defaults
      })
      setBusinessType(type)
      setSelectedConversions(defaults)
      setStep(3)
    } catch (err) {
      console.error('Failed to save business type onboarding state:', err.message || err)
      setError('We encountered a problem saving your selection. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleInstallMethodSelect(method) {
    setError('')
    setLoading(true)
    try {
      await saveOnboardingState(4, { install_method: method })
      setInstallMethod(method)
      if (siteId) {
        try {
          const data = await fetchApi(`/install/snippet?site_id=${siteId}`)
          if (data?.snippet) setSnippet(data.snippet)
        } catch {
          const trackerUrl = (import.meta.env.VITE_TRACKER_BASE_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '')
          setSnippet(`<script async src="${trackerUrl}/tracker.min.js" data-site-key="${siteKey}"></script>`)
        }
      }
      setStep(4)
    } catch (err) {
      console.error('Failed to save install method onboarding state:', err.message || err)
      setError('We encountered a problem saving your selection. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function toggleConversion(key) {
    setSelectedConversions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function handleConversionsContinue() {
    setError('')
    setLoading(true)
    try {
      await saveOnboardingState(6, { selected_conversions: selectedConversions })
      setStep(6)
    } catch (err) {
      console.error('Failed to save conversions onboarding state:', err.message || err)
      setError('We encountered a problem saving your selection. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleCopySnippet() {
    if (snippet) {
      navigator.clipboard.writeText(snippet)
        .then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
        .catch(() => {})
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
            <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
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
            {error && <p className="text-sm text-red-500 mt-4 text-center font-medium">{error}</p>}
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
            <button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-white transition-colors mb-3">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
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
            {error && <p className="text-sm text-red-500 mt-4 text-center font-medium">{error}</p>}
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
            <button type="button" onClick={() => setStep(4)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-white transition-colors mb-3">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Configure Conversions</p>
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
                        ? 'border-gray-100 dark:border-[#2A2E2E] bg-gray-50 dark:bg-[#111414] opacity-40 cursor-not-allowed'
                        : selected
                        ? 'border-st-lime bg-st-lime/10 dark:bg-st-lime/10'
                        : 'border-gray-200 dark:border-[#454949] bg-white dark:bg-[#252A29] hover:border-gray-300 dark:hover:border-[#555A5A]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      selected ? 'border-[#1F2323] bg-[#1F2323] dark:border-[#CCF03F] dark:bg-[#CCF03F]' : 'border-gray-300'
                    }`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-st-black dark:text-white">{conv.label}</p>
                      <p className="text-xs text-st-gray dark:text-gray-400">{conv.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <button
              onClick={handleConversionsContinue}
              disabled={loading}
              className="mt-6 w-full py-3 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Continue'}
            </button>
            {error && <p className="text-sm text-red-500 mt-4 text-center font-medium">{error}</p>}
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
            <button type="button" onClick={() => setStep(5)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-white transition-colors mb-3">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <p className="text-sm font-medium text-gray-700 dark:text-white mb-1">
              Verify SourceTrack Script in {installMethod === 'gtm' ? 'GTM' : 'Your Site'}
            </p>
            <p className="text-xs text-st-gray dark:text-gray-400 mb-4 leading-normal">
              Below is the Tracking Doctor checking if SourceTrack has received events for this site key.
            </p>

            {verificationSuccess ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-st-lime/10 dark:bg-st-lime/5 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6 text-st-lime" />
                </div>
                <p className="text-lg font-semibold text-st-black dark:text-white">Great! Script Verified Successfully</p>
                <p className="text-xs text-st-gray dark:text-gray-400">Your site is connected and data is flowing.</p>
                <button
                  disabled={loading}
                  onClick={async () => {
                    setError('')
                    setLoading(true)
                    try {
                      const completeRes = await fetchApi('/onboarding/complete', {
                        method: 'POST',
                        body: JSON.stringify({ site_id: siteId })
                      })
                      if (!completeRes || !completeRes.completed) {
                        setError('Installation could not be verified. Please try again.')
                        setVerificationSuccess(false)
                        return
                      }
                      seedReportsForBusiness(businessType, siteKey)
                      navigate('/dashboard', { replace: true, state: { toast: 'Setup complete! Your dashboard is ready.' } })
                    } catch (err) {
                      console.error('Failed to complete onboarding:', err.message || err)
                      setError('We encountered a problem verifying your installation. Please try again.')
                      setVerificationSuccess(false)
                    } finally {
                      setLoading(false)
                    }
                  }}
                  className="px-6 py-3 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90 flex items-center gap-2 mx-auto disabled:opacity-50"
                >
                  <ArrowRight className="w-4 h-4" /> {loading ? 'Saving...' : 'Continue to Dashboard'}
                </button>
                {error && <p className="text-sm text-red-500 mt-2 font-medium">{error}</p>}
              </div>
            ) : (
              <div className="space-y-4">
                <SetupDoctorCard
                  siteKey={siteKey}
                  mode="onboarding"
                  onVerificationSuccess={handleOnboardingVerified}
                />

                {error && <p className="text-sm text-red-500 mt-2 font-medium">{error}</p>}

                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setError('')
                    if (!businessType || !installMethod) {
                      setError('Go back to Business Type and Install Method, reselect your choices, then return here to continue.')
                      return
                    }
                    setLoading(true)
                    try {
                      await fetchApi('/onboarding/update', {
                        method: 'POST',
                        body: JSON.stringify({
                          site_id: siteId,
                          step: 6,
                          data: { business_type: businessType, install_method: installMethod }
                        })
                      })
                      const completeRes = await fetchApi('/onboarding/complete', {
                        method: 'POST',
                        body: JSON.stringify({ site_id: siteId })
                      })
                      if (completeRes?.completed) {
                        seedReportsForBusiness(businessType, siteKey)
                        navigate('/dashboard', { replace: true, state: { toast: 'Setup complete! Your dashboard is ready.' } })
                      } else {
                        setError('Failed to complete onboarding')
                      }
                    } catch (err) {
                      console.error('Verify later failed:', err.message || err)
                      setError('We encountered a problem skipping verification. Please try again.')
                    } finally {
                      setLoading(false)
                    }
                  }}
                  className="w-full text-center text-xs font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-white transition-colors py-2 disabled:opacity-50"
                >
                  Verify Later (Skip for now)
                </button>
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
        <button type="button" onClick={() => setStep(3)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-white transition-colors mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
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
            <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Platform install guides */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-3">
          <span className="font-semibold text-[#6B7373] dark:text-gray-400">Platform guides:</span>
          {[
            { label: 'GTM', to: '/docs/platforms/google-tag-manager' },
            { label: 'Webflow', to: '/docs/platforms/webflow' },
            { label: 'WordPress', to: '/docs/platforms/wordpress' },
            { label: 'Framer', to: '/docs/platforms/framer' },
            { label: 'Shopify', to: '/docs/platforms/shopify' },
          ].map(p => (
            <a key={p.label} href={p.to} className="text-blue-600 dark:text-blue-400 hover:underline">{p.label}</a>
          ))}
        </div>

        <button
          onClick={async () => {
            setError('')
            setLoading(true)
            try {
              await saveOnboardingState(5, { install_method: installMethod })
              setStep(5)
            } catch (err) {
              console.error('Failed to save install script step onboarding state:', err.message || err)
              setError('We encountered a problem saving your progress. Please try again.')
            } finally {
              setLoading(false)
            }
          }}
          disabled={loading}
          className="mt-6 w-full py-3 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Continue'}
        </button>
        {error && <p className="text-sm text-red-500 mt-4 text-center font-medium">{error}</p>}
      </OnboardingCard>
    )
  }

  return (
    <div className="min-h-screen bg-[#F1F4F4] dark:bg-[#2B302F] text-[#1F2323] dark:text-white flex flex-col">
      {/* Header — brand left, stepper centered (desktop), logout right */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-6 px-6 lg:px-12 py-8">
        <div className="dark:hidden"><LogoFull className="h-8 w-auto" /></div>
        <div className="hidden dark:block"><LogoFullDark className="h-8 w-auto" /></div>
        {/* Clickable stepper — completed steps jump back, current non-clickable, future dimmed */}
        <div className="hidden md:flex items-start justify-center gap-8 lg:gap-12">
          {STEPPER_LABELS.map((label, i) => {
            const stepNum = i + 1
            const isCompleted = stepNum < step
            const isCurrent = stepNum === step
            const clickable = isCompleted && !isCurrent

            return (
              <button
                key={stepNum}
                type="button"
                disabled={!clickable}
                onClick={() => setStep(stepNum)}
                className={`relative flex flex-col items-center gap-2 min-w-[92px] transition-colors ${
                  clickable ? 'cursor-pointer group' : 'cursor-default'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold transition-all ${
                    isCompleted
                      ? `bg-st-lime text-[#1F2323] ${clickable ? 'group-hover:ring-2 group-hover:ring-st-lime/50' : ''}`
                      : isCurrent
                      ? 'bg-[#1F2323] dark:bg-white text-white dark:text-[#1F2323]'
                      : 'bg-[#F1F4F4] dark:bg-white/5 text-[#1F2323] dark:text-gray-500'
                  }`}
                >
                  {isCompleted ? '✓' : stepNum}
                </div>
                <span
                  className={`text-sm whitespace-nowrap tracking-[-0.02em] ${
                    isCurrent
                      ? 'font-extrabold text-[#1F2323] dark:text-white'
                      : isCompleted
                      ? `font-semibold text-[#1F2323] dark:text-white ${clickable ? 'group-hover:underline' : ''}`
                      : 'font-medium text-[#6B7373] dark:text-gray-500'
                  }`}
                >
                  {label}
                </span>
                <div className={`h-0.5 w-24 rounded-full ${isCurrent ? 'bg-[#1F2323] dark:bg-white' : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>
        <button
          onClick={() => { signOut(); navigate('/login', { replace: true }) }}
          className="justify-self-end inline-flex items-center justify-center min-h-[44px] px-5 rounded-full border border-[rgba(31,35,35,.12)] dark:border-white/15 bg-white dark:bg-white/5 text-[#1F2323] dark:text-white text-sm font-bold hover:bg-[#F1F4F4] dark:hover:bg-white/10 transition-colors"
        >
          Log out
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
    </div>
  )
}
