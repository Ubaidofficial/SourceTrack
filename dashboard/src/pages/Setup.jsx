import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useSite } from '../contexts/SiteContext'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import {
  Copy, Check, Code, RefreshCw, ChevronRight, Send,
  ExternalLink, Key, CheckCircle, ArrowRight,
  Activity, BookOpen, ShieldCheck, SlidersHorizontal,
  Globe, Filter, MapPin, Lock, Rocket, DollarSign, Link2
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import SetupDoctorCard from '../components/SetupDoctorCard'
import AttributionCoverageCard from '../components/AttributionCoverageCard'
import CapiDeliveryStatus from '../components/CapiDeliveryStatus'


export default function Setup() {
  const { user } = useAuth()
  const { activeSite } = useSite()
  const [site, setSite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [proxyDomain, setProxyDomain] = useState(null)
  const [showPrivacyNotes, setShowPrivacyNotes] = useState(false)
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(
    ['install', 'health', 'conversions', 'additional', 'learn'].includes(searchParams.get('tab'))
      ? searchParams.get('tab')
      : 'install'
  )

  const [testConvLoading, setTestConvLoading] = useState(false)
  const [testConvResult, setTestConvResult] = useState(null)

  // Per-platform URL parameter helper (install tab) — pure frontend, static strings.
  const [paramPlatform, setParamPlatform] = useState('google')
  const [paramCopied, setParamCopied] = useState(false)
  const URL_PARAM_TEMPLATES = {
    google: '?utm_source=google&utm_medium=cpc&utm_campaign={{campaign}}',
    meta:   '?utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign}}',
    tiktok: '?utm_source=tiktok&utm_medium=paid_social&utm_campaign={{campaign}}',
    email:  '?utm_source=email&utm_medium=email&utm_campaign={{campaign}}'
  }
  const handleCopyParam = () => {
    try {
      navigator.clipboard.writeText(URL_PARAM_TEMPLATES[paramPlatform])
      setParamCopied(true)
      setTimeout(() => setParamCopied(false), 2000)
    } catch (_) {}
  }

  // Tracking Health questionnaire — React state only (no DB, no API). Score
  // calculation is a follow-up task; answers are passed to SetupDoctorCard.
  const [hasForms, setHasForms] = useState(null)
  const [businessType, setBusinessType] = useState(null)
  const [hasRevenue, setHasRevenue] = useState(null)
  const [questionnaireComplete, setQuestionnaireComplete] = useState(false)
  const questionnaireAnswered = hasForms !== null && businessType !== null && hasRevenue !== null

  // Load site details
  useEffect(() => {
    async function load() {
      if (!user) return

      let targetSite = activeSite
      if (!targetSite) {
        const { data: member } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle()

        const query = supabase.from('sites').select('id, site_key, name, domain, cookieless_mode, cross_domain_domains, cross_domain_cookie_domain, last_seen_at, onboarding_completed').limit(1)
        if (member?.company_id) {
          query.eq('company_id', member.company_id)
        } else {
          query.eq('owner_id', user.id)
        }
        const { data } = await query.maybeSingle()
        targetSite = data
      }
      setSite(targetSite)

      if (targetSite?.site_key) {
        try {
          const proxyData = await fetchApi(`/integrations/proxy-domain?site_key=${encodeURIComponent(targetSite.site_key)}`)
          if (proxyData && proxyData.status === 'active') {
            setProxyDomain(proxyData.domain)
          }
        } catch (_err) {
          // Optional proxy-domain lookup failed; fall back to default tracker URL.
        }
      }
    }
    load()
  }, [user, activeSite])

  // React query to fetch tracking health status
  const { data: doctorResponse, refetch: refetchDoctor } = useQuery({
    queryKey: ['setup-doctor', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return null
      return fetchApi(`/install/doctor?site_key=${encodeURIComponent(site.site_key)}`)
    },
    enabled: !!site?.site_key,
    staleTime: 30000,
  })

  const diagnostics = doctorResponse?.data ?? doctorResponse ?? null

  const trackerBaseUrl = (import.meta.env.VITE_TRACKER_BASE_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');

  function buildSnippet() {
    if (!site) return ''
    const trackerFile = site.cookieless_mode ? 'tracker.cookieless.min.js' : 'tracker.min.js'
    const scriptSrc = proxyDomain ? `https://${proxyDomain}/${trackerFile}` : `${trackerBaseUrl}/${trackerFile}`
    let attrs = ` async src="${scriptSrc}" data-site-key="${site.site_key}"`
    if (site.cross_domain_domains && site.cross_domain_domains.length > 0) {
      attrs += ` data-cross-domains="${site.cross_domain_domains.join(',')}"`
    }
    if (site.cross_domain_cookie_domain) {
      attrs += ` data-cookie-domain="${site.cross_domain_cookie_domain}"`
    }
    return `<script${attrs}></script>`
  }

  const snippet = buildSnippet()

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

  const handleTestConversion = async () => {
    if (!site) return
    setTestConvLoading(true)
    setTestConvResult(null)
    try {
      await fetchApi('/conversion', {
        method: 'POST',
        body: {
          site_key: site.site_key,
          conversion_type: 'test_conversion',
          conversion_value: 0,
          anonymous_id: `test-${Date.now()}`,
          page_url: window.location.href
        }
      })
      setTestConvResult({ ok: true })
      refetchDoctor()
    } catch (_err) {
      setTestConvResult({ ok: false, message: 'Failed to send test conversion. Check your connection.' })
    } finally {
      setTestConvLoading(false)
    }
  }

  // Determine check states
  const hasFirstEvent = !!site?.last_seen_at || !!diagnostics?.tracker_install?.last_seen_at
  const hasVerifiedDomain = diagnostics?.domain_match?.status === 'passed' || diagnostics?.domain_match?.event_domain === diagnostics?.domain_match?.registered_domain
  const hasConversion = diagnostics?.conversion_setup?.detected || !!diagnostics?.checks?.find(c => c.label === 'Conversion tracking' && c.status === 'passed')

  const checklistItems = [
    {
      id: 'install',
      label: '1. Install Code',
      desc: 'Add snippet to your site',
      done: hasFirstEvent,
      icon: Code
    },
    {
      id: 'health',
      label: '2. Tracking Health',
      desc: 'Verify active connection',
      done: hasFirstEvent && hasVerifiedDomain,
      icon: Activity
    },
    {
      id: 'conversions',
      label: '3. Conversions',
      desc: 'Verify purchase or lead logs',
      done: hasConversion,
      icon: ShieldCheck
    },
    {
      id: 'additional',
      label: '4. Additional Setup',
      desc: 'Optional accuracy & privacy',
      done: false,
      icon: SlidersHorizontal
    },
    {
      id: 'learn',
      label: '5. Learn',
      desc: 'Guides and attribution basics',
      done: false,
      icon: BookOpen
    }
  ]

  return (
    <div className="space-y-6 max-w-6xl pb-10">
      <div>
        <h2 className="text-2xl font-bold text-st-black dark:text-white">Setup &amp; Health</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-1">Get SourceTrack installed, verified, and configured.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left checklist panel */}
        <div className="lg:col-span-4 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 select-none">
            Steps
          </h3>
          <div className="space-y-1">
            {checklistItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all group border ${
                    isActive
                      ? 'bg-st-lime/10 dark:bg-dark-hover border-st-lime/20 dark:border-dark-border'
                      : 'hover:bg-gray-50 dark:hover:bg-dark-hover/40 border-transparent'
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 p-1.5 rounded-md ${
                    item.done
                      ? 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400'
                      : isActive
                      ? 'bg-st-lime text-st-black'
                      : 'bg-gray-100 text-gray-500 dark:bg-dark-hover dark:text-gray-400'
                  }`}>
                    {item.done ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold truncate ${
                      isActive ? 'text-st-black dark:text-st-lime' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-st-gray dark:text-gray-400 truncate mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 self-center transition-transform ${
                    isActive ? 'translate-x-0.5' : 'group-hover:translate-x-0.5'
                  }`} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Right content panel */}
        <div className="lg:col-span-8 space-y-6">
          {activeTab === 'install' && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-st-black dark:text-white">1. Install Tracking Code</h3>
                <p className="text-sm text-st-gray dark:text-gray-400 mt-1">
                  Add this tracking script to your site to capture traffic and attribution details automatically.
                </p>
              </div>

              {site?.domain && (
                <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-[#1E2121]/50 border border-gray-200 dark:border-transparent rounded-lg text-xs">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Registered Domain:</span>
                  <span className="font-mono text-st-black dark:text-white select-all">{site.domain}</span>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-st-lime text-st-black text-xs font-extrabold">A</span>
                  <h4 className="font-semibold text-sm text-st-black dark:text-white">Copy your snippet</h4>
                </div>
                {activeSite?.support_preview ? (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-lg p-4 text-center text-sm text-amber-800 dark:text-amber-400">
                    Install snippet is hidden in support preview. Use Ops Console / Site Inspector for setup diagnostics.
                  </div>
                ) : site ? (
                  <div className="bg-st-black rounded-lg p-4 relative border border-gray-800">
                    <pre className="text-green-400 text-xs font-mono overflow-x-auto whitespace-pre-wrap pr-12 leading-relaxed select-all">{snippet}</pre>
                    <button
                      onClick={handleCopy}
                      className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ) : (
                  <div className="h-20 animate-pulse bg-gray-100 dark:bg-dark-hover rounded-lg" />
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-st-lime text-st-black text-xs font-extrabold">B</span>
                  <h4 className="font-semibold text-sm text-st-black dark:text-white">Paste before closing head tag</h4>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed pl-7">
                  Paste the copied snippet into the <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono">&lt;head&gt;</code> element of your website's HTML code (preferably before the closing <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono">&lt;/head&gt;</code> tag) to ensure it loads on every page.
                </p>
              </div>

              {/* Per-platform URL parameter helper — static strings, pure frontend */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-st-lime text-st-black text-xs font-extrabold">C</span>
                  <h4 className="font-semibold text-sm text-st-black dark:text-white">Add URL parameters to your ad links</h4>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed pl-7">
                  Append these parameters to the destination URLs in your ads so SourceTrack can attribute each click. Replace <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono">{'{{campaign}}'}</code> with your campaign name.
                </p>
                <div className="pl-7 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { key: 'google', label: 'Google' },
                      { key: 'meta', label: 'Meta' },
                      { key: 'tiktok', label: 'TikTok' },
                      { key: 'email', label: 'Email' }
                    ].map(p => (
                      <button
                        key={p.key}
                        onClick={() => setParamPlatform(p.key)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          paramPlatform === p.key
                            ? 'bg-st-black text-white dark:bg-white dark:text-st-black'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="bg-st-black rounded-lg p-3 relative border border-gray-800">
                    <pre className="text-green-400 text-xs font-mono overflow-x-auto whitespace-pre-wrap pr-12 leading-relaxed select-all">{URL_PARAM_TEMPLATES[paramPlatform]}</pre>
                    <button
                      onClick={handleCopyParam}
                      className="absolute top-2.5 right-2.5 p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded transition-colors"
                      title="Copy to clipboard"
                    >
                      {paramCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={() => setActiveTab('health')}
                  className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black rounded-lg text-xs font-bold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
                >
                  Verify installation <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Platform Guides */}
              <div className="bg-gray-50 dark:bg-[#1E2121]/50 border border-gray-200 dark:border-transparent rounded-xl p-4">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">CMS platform guides</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  {[
                    { label: 'Google Tag Manager', to: '/docs/platforms/google-tag-manager' },
                    { label: 'Webflow', to: '/docs/platforms/webflow' },
                    { label: 'WordPress', to: '/docs/platforms/wordpress' },
                    { label: 'Framer', to: '/docs/platforms/framer' },
                    { label: 'Shopify Recipe', to: '/docs/platforms/shopify' },
                  ].map(p => (
                    <Link key={p.label} to={p.to} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
                      {p.label} <ExternalLink className="w-3 h-3" />
                    </Link>
                  ))}
                </div>
              </div>

              {/* Privacy Reminder */}
              <div className="bg-gray-50/50 dark:bg-[#1E2121]/30 border border-gray-200 dark:border-transparent rounded-xl p-4">
                <div className="flex items-start gap-2.5">
                  <span className="text-gray-500 mt-0.5 text-sm">🔒</span>
                  <div className="flex-1 text-xs text-st-gray dark:text-gray-400">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Privacy reminder. </span>
                    SourceTrack is built with privacy-conscious features, including standard cookieless options. Update your privacy policy before production use.{' '}
                    <button
                      onClick={() => setShowPrivacyNotes(!showPrivacyNotes)}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline ml-1 font-sans"
                    >
                      {showPrivacyNotes ? 'Hide notes' : 'Read privacy notes'}
                    </button>
                    {showPrivacyNotes && (
                      <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed pt-2 border-t border-gray-200 dark:border-gray-800/60 font-sans">
                        Under GDPR, CCPA, and PECR regulations, you must disclose that you collect anonymous site metrics (referrers, UTM params, session length, and IP-derived location). While Cookieless Mode avoids writing browser cookies or localStorage keys, reading client headers (e.g., User-Agent, IP address) to generate visitor hashes may still require disclosure or explicit consent in certain jurisdictions. Customers are solely responsible for ensuring their tracking configurations comply with all regional regulations.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'health' && (
            <div className="space-y-6">
              {/* Health questionnaire — React state only; score is a follow-up task */}
              <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <h3 className="text-sm font-semibold text-st-black dark:text-white">Tell us about your setup</h3>
                </div>

                {/* Q1 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-st-black dark:text-white">Do you have forms on your website?</p>
                  <div className="flex gap-1.5">
                    {[['Yes', true], ['No', false]].map(([label, val]) => (
                      <button
                        key={label}
                        onClick={() => setHasForms(val)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          hasForms === val
                            ? 'bg-st-black text-white dark:bg-white dark:text-st-black'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q2 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-st-black dark:text-white">What best describes your business?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['SaaS', 'eCommerce', 'Lead Gen', 'Other'].map(label => (
                      <button
                        key={label}
                        onClick={() => setBusinessType(label)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          businessType === label
                            ? 'bg-st-black text-white dark:bg-white dark:text-st-black'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q3 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-st-black dark:text-white">Have you connected a revenue source?</p>
                  <div className="flex gap-1.5">
                    {[['Yes', true], ['No', false]].map(([label, val]) => (
                      <button
                        key={label}
                        onClick={() => setHasRevenue(val)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          hasRevenue === val
                            ? 'bg-st-black text-white dark:bg-white dark:text-st-black'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => setQuestionnaireComplete(true)}
                    disabled={!questionnaireAnswered}
                    className="px-3 py-1.5 bg-st-black dark:bg-white text-white dark:text-st-black rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
                  >
                    Calculate Health Score
                  </button>
                  {questionnaireComplete && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Health score: calculating…</span>
                    </div>
                  )}
                </div>
              </div>

              {site?.site_key ? (
                <SetupDoctorCard
                  siteKey={site.site_key}
                  mode="snippet"
                  onVerificationSuccess={() => refetchDoctor()}
                  questionnaire={{ hasForms, businessType, hasRevenue }}
                  questionnaireComplete={questionnaireComplete}
                />
              ) : (
                <div className="h-40 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl animate-pulse" />
              )}

              {site?.site_key && <AttributionCoverageCard siteKey={site.site_key} />}

              {site?.site_key && <CapiDeliveryStatus siteKey={site.site_key} />}

              {/* Test Conversion Section */}
              <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <h3 className="text-sm font-semibold text-st-black dark:text-white">Send a test conversion</h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Send a $0 test conversion from this dashboard to confirm SourceTrack can receive conversion events for this site.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTestConversion}
                    disabled={testConvLoading || !site || activeSite?.support_preview}
                    className="px-3 py-1.5 bg-st-black dark:bg-white text-white dark:text-st-black rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 hover:opacity-90"
                  >
                    {testConvLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Send test conversion
                      </>
                    )}
                  </button>
                </div>
                {testConvResult && (
                  <div className={`rounded-lg px-3.5 py-2.5 text-xs ${
                    testConvResult.ok
                      ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/35'
                      : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/35'
                  }`}>
                    {testConvResult.ok ? (
                      <div className="space-y-1">
                        <p className="font-medium">Test conversion sent. It can take a few minutes to appear in your reports.</p>
                      </div>
                    ) : (
                      <p className="font-medium">{testConvResult.message}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'conversions' && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-st-black dark:text-white">3. Conversion Tracking</h3>
                <p className="text-sm text-st-gray dark:text-gray-400 mt-1">
                  Ensure conversions (signups, leads, sales) are sent to SourceTrack to enable attribution calculations.
                </p>
              </div>

              {/* Custom conversions client-side */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-st-black dark:text-white">Client-side JavaScript API</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Call the tracking script directly on your site when a visitor completes a conversion event:
                </p>
                <div className="bg-st-black rounded-lg p-4 border border-gray-800">
                  <pre className="text-green-400 text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
{`window.sourcetrack?.track('purchase', {
  value: 99.00,
  currency: 'USD'
})`}
                  </pre>
                </div>
              </div>

              {/* Developer conversions endpoint link */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-st-black dark:text-white font-sans">Server-side Conversion API</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Send conversions from your backend server or CRM. Learn more in our{' '}
                  <Link to="/developers/conversions" className="text-blue-600 dark:text-blue-400 underline hover:no-underline font-semibold">Conversions Developer Guide</Link>.
                </p>
              </div>

              {/* Integrations checklist */}
              <div className="pt-4 border-t border-gray-200 dark:border-dark-border space-y-4">
                <h4 className="text-sm font-semibold text-st-black dark:text-white font-sans">Offline & Platform Webhook Integrations</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Stripe */}
                  <div className="border border-gray-200 dark:border-dark-border rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-st-black dark:text-white">Stripe Checkout Attribution</span>
                      <span className="px-2 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 rounded-full">Test Mode Beta</span>
                    </div>
                    <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                      Pass the browser-generated <code className="font-mono bg-gray-500/10 px-1 py-0.5 rounded text-[10px]">st_anonymous_id</code> in your Stripe session metadata to attribute backend invoice payments.
                    </p>
                    <Link to="/docs/platforms/stripe" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1 pt-1">
                      Read Stripe Setup Guide <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  {/* Shopify */}
                  <div className="border border-gray-200 dark:border-dark-border rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-st-black dark:text-white">Shopify Integration</span>
                      <span className="px-2 py-0.5 text-[9px] font-bold bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-400 rounded-full">Manual Webhook</span>
                    </div>
                    <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                      Configure manual webhooks inside your Shopify store settings to dispatch conversion metrics directly into SourceTrack.
                    </p>
                    <Link to="/docs/platforms/shopify" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1 pt-1">
                      View Shopify Recipe <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'additional' && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-st-black dark:text-white">4. Additional Setup</h3>
                <p className="text-sm text-st-gray dark:text-gray-400 mt-1">
                  Optional settings that improve accuracy and privacy. Configure these in Settings.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    icon: Globe,
                    title: 'First-party domain tracking',
                    desc: 'Improve cross-session accuracy in Safari and privacy browsers. Recommended for SaaS.',
                    cta: 'Read the docs',
                    to: '/docs/install'
                  },
                  {
                    icon: Filter,
                    title: 'Bot filtering',
                    desc: 'Exclude known bots and internal traffic from your analytics.',
                    cta: 'Settings › Advanced',
                    to: '/settings'
                  },
                  {
                    icon: MapPin,
                    title: 'IP exclusion',
                    desc: 'Exclude your own IP address from tracking.',
                    cta: 'Settings › Advanced',
                    to: '/settings'
                  },
                  {
                    icon: Lock,
                    title: 'Webhook secret',
                    desc: 'Add HMAC verification to your conversion webhook.',
                    cta: 'Settings › Advanced › Webhook secret',
                    to: '/settings'
                  }
                ].map(card => (
                  <div key={card.title} className="border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <card.icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      <h4 className="text-xs font-bold text-st-black dark:text-white">{card.title}</h4>
                    </div>
                    <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">{card.desc}</p>
                    <Link to={card.to} className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                      {card.cta} <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'learn' && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-st-black dark:text-white">5. Resources & Documentation</h3>
                <p className="text-sm text-st-gray dark:text-gray-400 mt-1">
                  Learn how tracking works, configure custom URLs, and build reports.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1 */}
                <div className="border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-st-black dark:text-white">Attribution & UTM Parameters</h4>
                  <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                    SourceTrack resolves campaign attribution using UTM parameters and click-IDs. Learn about the campaign URL syntax rules.
                  </p>
                  <Link to="/docs/quickstart" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                    Quickstart Guide <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* Card 2 */}
                <div className="border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-st-black dark:text-white font-sans">Report Builder Basics</h4>
                  <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                    Once tracking events arrive, use the Report Builder to organize metrics by channel group-bys, models, and campaign names.
                  </p>
                  <Link to="/report-builder" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                    Go to Report Builder <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* Card 3 */}
                <div className="border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-st-black dark:text-white font-sans">Google Ads GCLID Ingestion</h4>
                  <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                    Learn how auto-tagging routes ad clicks from Google Search campaigns directly into your visitor journeys.
                  </p>
                  <Link to="/docs/platforms/google-ads" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                    Google Ads Guide <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* Card 4 */}
                <div className="border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-st-black dark:text-white font-sans">Troubleshooting Diagnostic Issues</h4>
                  <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                    See explanations for common Tracking Doctor errors, wrong domain warnings, or missing telemetry messages.
                  </p>
                  <Link to="/docs/troubleshooting" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                    Troubleshooting Help <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* Card 5 — Install the script */}
                <div className="border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <h4 className="text-xs font-bold text-st-black dark:text-white">Install SourceTrack script</h4>
                  </div>
                  <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                    Step-by-step guide to adding the tracking snippet to your site and verifying it loads.
                  </p>
                  <Link to="/docs/install" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                    Install Guide <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* Card 6 — Track first conversion */}
                <div className="border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <h4 className="text-xs font-bold text-st-black dark:text-white">Track your first conversion</h4>
                  </div>
                  <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                    Fire a conversion event so SourceTrack can tie leads and sales back to their source.
                  </p>
                  <Link to="/developers/conversions" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                    Conversions Guide <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* Card 7 — Attribute revenue */}
                <div className="border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <h4 className="text-xs font-bold text-st-black dark:text-white">Attribute revenue</h4>
                  </div>
                  <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                    Send conversion values (including offline) to see revenue by source, not just clicks.
                  </p>
                  <Link to="/developers/offline-conversions" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                    Revenue Guide <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* Card 8 — UTM link builder */}
                <div className="border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <h4 className="text-xs font-bold text-st-black dark:text-white">UTM link builder</h4>
                  </div>
                  <p className="text-xs text-st-gray dark:text-gray-400 leading-relaxed">
                    Build clean, consistent UTM-tagged campaign URLs so every link reports correctly.
                  </p>
                  <Link to="/tools/utm-builder" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1">
                    Open UTM Builder <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
