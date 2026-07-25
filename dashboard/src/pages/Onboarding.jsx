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
import {
  STEP_TITLES, STEPPER_LABELS, DISPLAY_STEP_COUNT,
  displayIndexForStep, internalStepForDisplay
} from '../lib/onboardingSteps'

// Step titles + stepper labels + the internal->display mapping all come from ONE module now.
// They used to be two local arrays that named the same steps differently (STEP_TITLES[3]
// 'Install Script' vs STEPPER_LABELS[2] 'Install Method'). See lib/onboardingSteps.js for why the
// install merge is presentational rather than a renumber — the persisted step numbers are unchanged.

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
  { key: 'trial', label: 'Trial', desc: 'Started a trial' },
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
  // statusLoading shields the page render until loadOnboardingStatus() has
  // resolved. Without this shield, Step 1 (Connect Domain) flashes for every
  // returning user before their saved progress is hydrated from the API.
  const [statusLoading, setStatusLoading] = useState(true)

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
      // Honor an explicit site hint from the URL — the "Resume setup" entry
      // navigates to /onboarding?site_id=<incomplete>&mode=onboarding. Fall back
      // to the saved active site key. Always ?mode=onboarding so the backend
      // resolves the latest INCOMPLETE site (not a completed one).
      const urlParams = new URLSearchParams(window.location.search)
      const hintSiteId = urlParams.get('site_id')
      const hintSiteKey = urlParams.get('site_key')
      const savedKey = window.localStorage.getItem('sourcetrack_active_site_key')

      const meParams = new URLSearchParams({ mode: 'onboarding' })
      if (hintSiteId) meParams.set('site_id', hintSiteId)
      else if (hintSiteKey) meParams.set('site_key', hintSiteKey)
      else if (savedKey) meParams.set('site_key', savedKey)

      const site = await fetchApi(`/onboarding/me?${meParams.toString()}`)

      if (!site || !site.has_site) return

      if (site.onboarding_completed) {
        window.location.href = '/dashboard'
        return
      }

      setSiteId(site.site_id)
      setSiteKey(site.site_key)

      const state = site.onboarding_state || {}

      // Always hydrate business type and install method from site data, not just
      // when current_step > 1. This ensures the 'Verify Later' guard in step 6
      // has the values it needs after a page reload, even if the user navigated
      // back to an earlier step in a previous session.
      setBusinessType(site.business_type || state.business_type || null)
      setInstallMethod(state.install_method || 'standard')
      setSelectedConversions(state.selected_conversions || [])

      let stepToSet = 1
      if (state.current_step && state.current_step > 1) {
        stepToSet = state.current_step
        setStep(state.current_step)
      }
      if (site.domain) {
        setDomain(site.domain)
        if (stepToSet === 1) {
          stepToSet = 2
          setStep(2)
        }
      }

      // >= 3, not >= 4: the install card now shows the snippet as soon as it opens (internal step 3),
      // because method selection is a tab rather than a step advance. Gating at 4 would leave a user
      // resuming at step 3 staring at "Loading script..." until they touched a tab.
      if (stepToSet >= 3) {
        await ensureSnippet(site.site_id, site.site_key)
      }
    } catch (_err) {
      /* ignore — user stays on step 1 if we cannot resolve their state */
    } finally {
      // Always clear the mount shield so the page renders regardless of outcome.
      setStatusLoading(false)
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
        window.location.href = '/dashboard'
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
      // Step 3 IS the install card now, and it shows the snippet immediately — fetch before landing
      // there or the user reads "Loading script..." until they touch a tab.
      await ensureSnippet(siteId, siteKey)
      setStep(3)
    } catch (err) {
      console.error('Failed to save business type onboarding state:', err.message || err)
      setError('We encountered a problem saving your selection. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // The install card renders the snippet the moment it opens, so every path that can land on it has
  // to have fetched one. That is now THREE paths (resume-from-saved-state, business-type continue,
  // and a tab switch), which is two too many to keep copy-pasting the fetch + offline fallback.
  async function ensureSnippet(id, key) {
    if (!id) return
    try {
      const data = await fetchApi(`/install/snippet?site_id=${id}`)
      if (data?.snippet) setSnippet(data.snippet)
    } catch {
      const trackerUrl = (import.meta.env.VITE_TRACKER_BASE_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '')
      setSnippet(`<script async src="${trackerUrl}/tracker.min.js" data-site-key="${key}"></script>`)
    }
  }

  async function handleInstallMethodSelect(method) {
    setError('')
    setLoading(true)
    try {
      // Still persists the internal 3 -> 4 advance (it is a valid server transition and preserves
      // furthest-progress), but the CARD does not change — only the selected tab does.
      await saveOnboardingState(4, { install_method: method })
      setInstallMethod(method)
      await ensureSnippet(siteId, siteKey)
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
                className="w-full px-4 py-3 bg-white dark:bg-[#1A1F1F] text-[#1F2323] dark:text-dark-primary placeholder:text-[#8D9696] border border-[#C9D1D1] dark:border-white/15 rounded-xl text-sm outline-none focus:ring-2 focus:ring-st-lime focus:border-st-lime"
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
            <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-dark-text transition-colors">
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
                      <p className="font-extrabold text-[#1F2323] dark:text-dark-primary">{bt.label}</p>
                      <p className="text-xs text-st-gray dark:text-gray-400 mt-1">{bt.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            {error && <p className="text-sm text-red-500 mt-4 text-center font-medium">{error}</p>}
          </OnboardingCard>
        )

      // Steps 3 and 4 are ONE card now (method tabs + that method's instructions + snippet).
      // Both internal numbers render it so a user stored at either resumes in the right place —
      // see lib/onboardingSteps.js for why this is presentational rather than a renumber.
      case 3:
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
            <button type="button" onClick={() => setStep(4)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-dark-text transition-colors mb-3">
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
                      <p className="font-semibold text-sm text-st-black dark:text-dark-primary">{conv.label}</p>
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
            <button type="button" onClick={() => setStep(5)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-dark-text transition-colors mb-3">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <p className="text-sm font-medium text-gray-700 dark:text-dark-primary mb-1">
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
                <p className="text-lg font-semibold text-st-black dark:text-dark-primary">Great! Script Verified Successfully</p>
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
                      window.location.href = '/dashboard'
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
                        window.location.href = '/dashboard'
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
                  className="w-full text-center text-xs font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-dark-text transition-colors py-2 disabled:opacity-50"
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
        subtitle="Pick how you install, then copy the script generated for your website."
        showBack
        onBack={() => setStep(2)}
      >
        <button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7373] hover:text-[#1F2323] dark:text-gray-400 dark:hover:text-dark-text transition-colors mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* METHOD TABS — was a whole separate step. Selecting one swaps the instructions below
            instead of navigating, which is the merge. */}
        <div role="tablist" aria-label="Installation method" className="flex gap-2 mb-4">
          {INSTALL_METHODS.map((m) => {
            const Icon = m.icon
            const selected = installMethod === m.key
            return (
              <button
                key={m.key}
                role="tab"
                aria-selected={selected}
                onClick={() => handleInstallMethodSelect(m.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-extrabold transition-colors ${
                  selected
                    ? 'border-st-lime bg-st-lime/10 dark:bg-st-lime/10 text-[#1F2323] dark:text-dark-primary'
                    : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] text-[#6B7373] dark:text-gray-400 hover:border-st-lime/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{m.label}</span>
                {m.recommended && <span className="hidden sm:inline text-[10px] font-bold bg-lime-100 text-lime-800 px-1.5 py-0.5 rounded-full">Recommended</span>}
              </button>
            )
          })}
        </div>

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
            className="absolute top-3 right-3 px-3 py-1.5 bg-white dark:bg-white/10 text-[#1F2323] dark:text-dark-primary border border-gray-200 dark:border-white/10 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/15 flex items-center gap-1"
          >
            <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Platform install guides — prominent cards linking to existing /docs/platforms/* */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-[#6B7373] dark:text-gray-400 mb-2">Using a website builder or CMS? Open the step-by-step guide:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: 'WordPress', desc: 'Plugin / theme header', to: '/docs/platforms/wordpress' },
              { label: 'Shopify', desc: 'Theme + checkout', to: '/docs/platforms/shopify' },
              { label: 'Webflow', desc: 'Site-wide custom code', to: '/docs/platforms/webflow' },
              { label: 'Framer', desc: 'Site settings → custom code', to: '/docs/platforms/framer' },
              { label: 'Google Tag Manager', desc: 'Custom HTML tag', to: '/docs/platforms/google-tag-manager' },
            ].map(p => (
              <a
                key={p.label}
                href={p.to}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#DDE4E4] dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 hover:border-blue-400 dark:hover:border-blue-400/60 hover:bg-blue-50/40 dark:hover:bg-white/10 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[#1F2323] dark:text-dark-primary truncate">{p.label}</span>
                  <span className="block text-[10px] text-[#6B7373] dark:text-gray-400 truncate">{p.desc}</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              </a>
            ))}
          </div>
        </div>

        <button
          onClick={async () => {
            setError('')
            setLoading(true)
            try {
              // The server only accepts `targetStep <= currentStep || targetStep === currentStep + 1`
              // (api/routes/onboarding.js). Now that method selection is a TAB rather than a step
              // advance, a user who keeps the default 'standard' is still at internal step 3, so
              // jumping straight to 5 would be rejected. Persist the intermediate 4 first — it is
              // idempotent (`<= currentStep` is allowed) for anyone who did switch tabs.
              await saveOnboardingState(4, { install_method: installMethod })
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

  // Shield the page render until the mount status check resolves.
  // Without this, Step 1 (Connect Domain) always flashes first for returning
  // users, even when they are mid-setup or already complete.
  if (statusLoading) {
    return (
      <div className="min-h-screen bg-[#F1F4F4] dark:bg-[#2B302F] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black dark:border-st-lime" />
      </div>
    )
  }

  // Presentational 3-phase framing over the underlying 6 steps (no logic change):
  // Add site (1-2) → Install (3-4) → Configure (5-6).
  const PHASES = ['Add site', 'Install', 'Configure']
  const phaseIdx = step <= 2 ? 0 : step <= 4 ? 1 : 2

  return (
    <div className="min-h-screen bg-[#F1F4F4] dark:bg-[#2B302F] text-[#1F2323] dark:text-dark-primary flex flex-col">
      {/* Header — brand left, stepper centered (desktop), logout right */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-6 px-6 lg:px-12 py-8">
        <div className="dark:hidden"><LogoFull className="h-8 w-auto" /></div>
        <div className="hidden dark:block"><LogoFullDark className="h-8 w-auto" /></div>
        {/* Clickable stepper — completed steps jump back, current non-clickable, future dimmed */}
        <div className="hidden md:flex items-start justify-center gap-8 lg:gap-12">
          {STEPPER_LABELS.map((label, i) => {
            const stepNum = i + 1
            // Compare DISPLAY positions, not internal step numbers: the install dot covers internal
            // 3 and 4, so `stepNum === step` would leave it un-highlighted at step 4.
            const currentDisplay = displayIndexForStep(step)
            const isCompleted = stepNum < currentDisplay
            const isCurrent = stepNum === currentDisplay
            const clickable = isCompleted && !isCurrent

            return (
              <button
                key={stepNum}
                type="button"
                disabled={!clickable}
                onClick={() => setStep(internalStepForDisplay(stepNum))}
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
                      ? 'font-extrabold text-[#1F2323] dark:text-dark-primary'
                      : isCompleted
                      ? `font-semibold text-[#1F2323] dark:text-dark-primary ${clickable ? 'group-hover:underline' : ''}`
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
          className="justify-self-end inline-flex items-center justify-center min-h-[44px] px-5 rounded-full border border-[rgba(31,35,35,.12)] dark:border-white/15 bg-white dark:bg-white/5 text-[#1F2323] dark:text-dark-primary text-sm font-bold hover:bg-[#F1F4F4] dark:hover:bg-white/10 transition-colors"
        >
          Log out
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* 3-phase progress framing (presentational; underlying flow is still 6 steps) */}
        <div className="text-center mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7373] dark:text-gray-400">
            Phase {phaseIdx + 1} of 3 · {PHASES[phaseIdx]}
          </span>
        </div>
        {/* Mobile fallback: full stepper is hidden below md, show compact step text instead */}
        <div className="md:hidden text-center mb-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-white dark:bg-white/5 text-xs font-semibold text-[#6B7373] dark:text-gray-400 mb-2">
            Step {displayIndexForStep(step)} of {DISPLAY_STEP_COUNT}
          </span>
          <p className="text-lg font-extrabold text-[#1F2323] dark:text-dark-primary">{STEP_TITLES[displayIndexForStep(step)]}</p>
        </div>
        {renderStepContent()}
      </div>
    </div>
  )
}
