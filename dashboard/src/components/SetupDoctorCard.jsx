import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink
} from 'lucide-react'

const buildTestUrl = (domain, token) => {
  if (!domain) return null
  let cleanDomain = domain.trim()
  if (!/^https?:\/\//i.test(cleanDomain)) {
    cleanDomain = 'https://' + cleanDomain
  }
  try {
    const url = new URL(cleanDomain)
    url.searchParams.set('st_verify', token)
    return url.toString()
  } catch (_) {
    return null
  }
}

const isUnsafeTestDomain = (domain) => {
  const value = String(domain || '').trim().toLowerCase()
  if (!value) return true
  return (
    value.includes('localhost') ||
    value.includes('127.0.0.1') ||
    value.includes('0.0.0.0') ||
    value.endsWith('.local') ||
    value.includes('staging.') ||
    value.includes('dev.') ||
    value.includes('preview.') ||
    value.includes('vercel.app') ||
    value.includes('netlify.app')
  )
}

const STATUS_MAP = {
  healthy: {
    label: 'Healthy',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    severity: 'success'
  },
  pending: {
    label: 'Waiting for first event',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    severity: 'info'
  },
  test_env: {
    label: 'Test traffic detected',
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
    severity: 'info'
  },
  wrong_domain: {
    label: 'Wrong domain',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    severity: 'warning'
  },
  needs_domain: {
    label: 'Missing registered domain',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    severity: 'warning'
  },
  no_recent_traffic: {
    label: 'No recent traffic',
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    severity: 'info'
  },
  warning: {
    label: 'Needs attention',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    severity: 'warning'
  },
  critical: {
    label: 'Needs attention',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    severity: 'error'
  },
  error: {
    label: 'Needs attention',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    severity: 'error'
  }
}

export default function SetupDoctorCard({ siteKey, mode = 'dashboard', onVerificationSuccess, questionnaire = {}, questionnaireComplete = false }) {
  const navigate = useNavigate()
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [verificationToken] = useState(() => {
    const rand = Math.random().toString(36).substring(2, 8)
    return `st_${Date.now()}_${rand}`
  })
  const [testPageOpened, setTestPageOpened] = useState(false)
  const [reachability, setReachability] = useState('not_checked')
  const [checkingReachability, setCheckingReachability] = useState(false)

  const checkBrowserReachability = async () => {
    setCheckingReachability(true)
    setReachability('checking')
    try {
      const res = await fetchApi('/install/ping')
      if (res && res.success) {
        setReachability('reachable')
      } else {
        setReachability('blocked')
      }
    } catch (err) {
      setReachability('blocked')
    } finally {
      setCheckingReachability(false)
    }
  }

  const shouldPoll = mode === 'onboarding' || (mode === 'snippet' && testPageOpened)

  const { data: response, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['setup-doctor', siteKey, verificationToken, testPageOpened],
    queryFn: async () => {
      const params = new URLSearchParams({ site_key: siteKey })
      if (mode === 'snippet' && testPageOpened) {
        params.set('verification_token', verificationToken)
      }
      return fetchApi(`/install/doctor?${params}`)
    },
    enabled: !!siteKey,
    retry: false,
    refetchInterval: (query) => {
      const status =
        query?.state?.error?.status ||
        query?.state?.error?.response?.status ||
        null

      if (status === 401 || status === 403) return false
      return shouldPoll ? 5000 : false
    }
  })

  // CAPI deliveries — only for the composite health score (no-error-in-30min check).
  // Fetched only once the questionnaire is complete (score is hidden until then).
  const { data: capiResp, isLoading: capiLoading, error: capiError } = useQuery({
    queryKey: ['capi-deliveries', siteKey],
    queryFn: () => fetchApi(`/integrations/capi/deliveries?site_key=${encodeURIComponent(siteKey)}`),
    enabled: !!siteKey && questionnaireComplete,
    retry: false
  })

  const isAuthError = error?.status === 401 || error?.status === 403

  const diagnostics = response?.data ?? response ?? null

  // Trigger success callback if verified healthy during onboarding
  useEffect(() => {
    if (diagnostics && onVerificationSuccess) {
      if (diagnostics.status === 'healthy' && !isUnsafeTestDomain(diagnostics.domain_match?.registered_domain)) {
        onVerificationSuccess(diagnostics)
      }
    }
  }, [diagnostics, onVerificationSuccess])

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#1B1811] border border-gray-200 dark:border-[#3D3830] rounded-xl p-5 shadow-sm flex items-center justify-center min-h-[150px]">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-st-gray dark:text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading setup diagnostics...</p>
        </div>
      </div>
    )
  }

  if (error || !diagnostics) {
    return (
      <div className="bg-white dark:bg-[#1B1811] border border-gray-200 dark:border-[#3D3830] rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-3 text-amber-600 dark:text-amber-400">
          {isAuthError ? (
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="font-semibold text-st-black dark:text-dark-primary">
              {isAuthError ? 'Verification Pending' : 'Diagnostics Unavailable'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-normal">
              {isAuthError
                ? "We are waiting for your first tracking event. If you haven't installed the script yet, you can skip verification by clicking 'Verify Later' below and configure it in your settings."
                : `We encountered an error loading setup diagnostics: ${error?.message || 'Check site key configuration.'}`}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-3 px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-[#1B1811] hover:bg-gray-200 dark:hover:bg-[#241F17] rounded-lg transition-colors flex items-center gap-1.5 text-gray-700 dark:text-gray-300"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {isAuthError ? 'Check Again' : 'Retry'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const {
    status,
    severity,
    message,
    tracker_install,
    domain_match,
    environment_detection,
    conversion_setup,
    paid_tracking,
    verification_token,
    recommended_next_action,
    privacy_suppression,
    pageviews_30d,
    checks = []
  } = diagnostics

  const statusConfig = STATUS_MAP[status] || {
    label: status || 'Unknown',
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    severity: severity || 'info'
  }

  const handleActionClick = () => {
    const key = recommended_next_action?.action_key
    if (key === 'install_script') {
      if (mode === 'dashboard') {
        navigate('/snippet')
      } else if (mode === 'snippet') {
        document.getElementById('snippet-code')?.scrollIntoView({ behavior: 'smooth' })
      }
    } else if (key === 'register_domain' || key === 'fix_domain') {
      navigate('/snippet')
    } else if (key === 'test_conversions') {
      if (mode === 'snippet') {
        document.getElementById('test-conversion-btn')?.scrollIntoView({ behavior: 'smooth' })
      } else {
        navigate('/snippet')
      }
    }
  }

  // Construct UI checks list
  const displayChecks = [...checks]
  if (paid_tracking) {
    displayChecks.push({
      label: 'Paid tracking parameters',
      status: paid_tracking.parameters_detected ? 'passed' : 'pending',
      detail: paid_tracking.parameters_detected
        ? `Params detected (${paid_tracking.last_click_id_type || 'UTM/Ad ID'})`
        : 'No paid search/campaign parameters detected'
    })
  }

  // ── Composite health score (0–100) — deterministic, no LLM, no recommendations.
  // Shown only when the questionnaire (from Setup) is complete. Indeterminate
  // checks get half points and are marked 'pending'. Note: there is no server-side
  // "forms detected" signal, so the forms criterion can only ever be pending.
  const capiErrors30m = (() => {
    const rows = Array.isArray(capiResp?.data) ? capiResp.data : []
    const cutoff = Date.now() - 30 * 60 * 1000
    return rows.filter(r =>
      ['failed', 'error', 'rejected'].includes(r.status) &&
      new Date(r.created_at).getTime() >= cutoff
    )
  })()

  const scoreParts = [
    // Pixel detected
    tracker_install?.installed ? { pts: 30, status: 'passed' } : { pts: 0, status: 'failed' },
    // At least one conversion configured
    conversion_setup?.detected ? { pts: 20, status: 'passed' } : { pts: 0, status: 'failed' },
    // Revenue source connected (from questionnaire)
    questionnaire?.hasRevenue === true ? { pts: 20, status: 'passed' } : { pts: 0, status: 'failed' },
    // No CAPI delivery errors in last 30 min (indeterminate while loading/error)
    (capiLoading || capiError)
      ? { pts: 8, status: 'pending' }
      : (capiErrors30m.length === 0 ? { pts: 15, status: 'passed' } : { pts: 0, status: 'failed' }),
    // Forms: hasForms AND forms detected — no server signal for detection → indeterminate
    questionnaire?.hasForms === true
      ? { pts: 8, status: 'pending' }
      : { pts: 0, status: 'na' }
  ]
  const healthScore = scoreParts.reduce((s, p) => s + p.pts, 0)
  const issuesFound = scoreParts.filter(p => p.status === 'failed').length
  const pendingCount = scoreParts.filter(p => p.status === 'pending').length
  const scoreColorClass = healthScore >= 80
    ? 'text-green-600 dark:text-green-400'
    : healthScore >= 50
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400'

  return (
    <div className="bg-white dark:bg-[#1B1811] border border-gray-200 dark:border-[#3D3830] rounded-xl p-5 shadow-sm space-y-4">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-[#3D3830] pb-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${
            statusConfig.severity === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400' :
            statusConfig.severity === 'warning' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' :
            statusConfig.severity === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' :
            'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
          }`}>
            {statusConfig.severity === 'success' && <CheckCircle className="w-5 h-5" />}
            {statusConfig.severity === 'warning' && <AlertTriangle className="w-5 h-5" />}
            {statusConfig.severity === 'error' && <AlertTriangle className="w-5 h-5" />}
            {statusConfig.severity === 'info' && <Info className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-st-black dark:text-dark-primary">Tracking Doctor</h3>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusConfig.badge}`}>
                {statusConfig.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{message}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          {mode === 'dashboard' && (
            <>
              <button
                onClick={() => navigate('/snippet')}
                className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#1B1811] hover:bg-gray-200 dark:hover:bg-[#241F17] border border-gray-200 dark:border-white/5 rounded-lg transition-colors"
              >
                Snippet Code
              </button>
            </>
          )}

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#1B1811] hover:bg-gray-200 dark:hover:bg-[#241F17] border border-gray-200 dark:border-white/5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            Verify Now
          </button>
        </div>
      </div>

      {/* Composite health score — only once the questionnaire is complete */}
      {questionnaireComplete ? (
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-gray-50 dark:bg-[#1B1811]/40 border border-gray-100 dark:border-[#3D3830]">
          <div className="flex items-baseline gap-1">
            <span className={`text-4xl font-black tabular-nums ${scoreColorClass}`}>{healthScore}</span>
            <span className="text-sm font-semibold text-gray-400 dark:text-gray-500">/100</span>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-st-black dark:text-dark-primary">
              {issuesFound} {issuesFound === 1 ? 'issue' : 'issues'} found
            </p>
            {pendingCount > 0 && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{pendingCount} pending</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400 p-4 rounded-xl bg-gray-50 dark:bg-[#1B1811]/40 border border-gray-100 dark:border-[#3D3830]">
          Answer the questions above to see your health score.
        </p>
      )}

      {/* 2. Setup Checks Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {displayChecks.map((check, i) => (
          <div key={i} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-[#1B1811]/30 border border-gray-100 dark:border-transparent">
            <span className="font-medium text-gray-600 dark:text-gray-400">{check.label}</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                check.status === 'passed' ? 'bg-green-500' :
                check.status === 'warning' ? 'bg-amber-500' :
                check.status === 'failed' ? 'bg-red-500' :
                check.status === 'pending' ? 'bg-blue-500' :
                'bg-gray-400'
              }`} />
              <span className="text-gray-500 dark:text-gray-400 font-medium">{check.detail}</span>
            </div>
          </div>
        ))}
      </div>

      {/* C4: the 30-day count, truthfully labelled. doctor_pageviews_30d counts $pageview ONLY, so
          this says "Pageviews", not "Events". Floor caveat: we cannot see what a blocker dropped. */}
      {typeof pageviews_30d === 'number' && (
        <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-[#1B1811]/30 border border-gray-100 dark:border-transparent">
          <span className="font-medium text-gray-600 dark:text-gray-400">Pageviews received (last 30 days)</span>
          <span className="font-semibold text-st-black dark:text-dark-primary tabular-nums">{pageviews_30d.toLocaleString()}</span>
        </div>
      )}
      {privacy_suppression && typeof privacy_suppression.suppressed_count === 'number' && privacy_suppression.suppressed_count > 0 && (
        <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-[#1B1811]/30 border border-gray-100 dark:border-transparent">
          <span className="font-medium text-gray-600 dark:text-gray-400">Privacy signals honored (GPC/DNT), last 30 days</span>
          <span className="font-semibold text-st-black dark:text-dark-primary tabular-nums">at least {privacy_suppression.suppressed_count.toLocaleString()} browser-days</span>
        </div>
      )}

      {/* C4 TRUTH FOOTER — the page must never imply completeness (§5.1). Every count above is a floor. */}
      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-500 pt-1">
        These figures cover the <span className="font-medium">last 30 days</span> and count only what SourceTrack received. Events blocked by ad blockers, browser privacy settings, or network failures are undetectable, so every number here is a <span className="font-medium">floor — not a guaranteed total</span>. Privacy-signal counts are unique browser-days (the tracker script is cached for 24h), not per-visit. A new install starts empty; visitor journeys before install cannot be backfilled.
      </p>

      {/* 3. Single Next Action Recommendation */}
      {recommended_next_action && recommended_next_action.action_key !== 'none' && (
        <div className="p-3 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/40 dark:border-amber-900/30 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-gray-700 dark:text-gray-300">
              <span className="font-semibold">Recommended Action: </span>
              {recommended_next_action.message}
            </div>
          </div>
          <button
            onClick={handleActionClick}
            className="px-3 py-1.5 bg-[#12100C] dark:bg-st-lime text-white dark:text-[#12100C] rounded-lg font-bold shrink-0 transition-opacity hover:opacity-90"
          >
            Resolve Issue
          </button>
        </div>
      )}

      {/* Verify a Live Pageview Token UX */}
      {mode === 'snippet' && (
        <div className="pt-3 border-t border-gray-200 dark:border-[#3D3830] space-y-2.5">
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Verify a live pageview</h4>

          {!diagnostics?.domain_match?.registered_domain ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Add your live domain before generating a test link.
            </p>
          ) : isUnsafeTestDomain(diagnostics.domain_match.registered_domain) ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Use your live production domain to generate a test link.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                Open the link below in a new tab. It includes a verification tag that is checked in real-time.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={buildTestUrl(diagnostics.domain_match.registered_domain, verificationToken)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setTestPageOpened(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#12100C] dark:bg-st-lime text-white dark:text-[#12100C] rounded-lg text-xs font-extrabold hover:opacity-90 transition-opacity"
                >
                  Open test page <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {testPageOpened && !diagnostics?.verification_token?.token_matched && (
                  <button
                    type="button"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="px-3 py-2 bg-gray-200 dark:bg-[#1B1811] hover:bg-gray-300 dark:hover:bg-[#241F17] text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg transition-colors border border-gray-200 dark:border-white/5 flex items-center justify-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
                    Check now
                  </button>
                )}
              </div>

              <div className="text-[11px] font-semibold">
                {diagnostics?.verification_token?.token_matched ? (
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    Verification pageview received.
                  </span>
                ) : testPageOpened ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
                    Not seen yet. It can take a few seconds.
                  </span>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">
                    Waiting: Open your site using the test link, then return here.
                  </span>
                )}
              </div>

              <div className="text-[9px] font-mono text-gray-400 dark:text-gray-500">
                Token: {verificationToken}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Browser Reachability Check */}
      {mode === 'snippet' && (
        <div className="pt-3 border-t border-gray-200 dark:border-[#3D3830]">
          <details className="group" onToggle={(e) => {
            if (e.target.open && reachability === 'not_checked') {
              checkBrowserReachability()
            }
          }}>
            <summary className="list-none flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-dark-text transition-colors cursor-pointer select-none">
              <span>Dashboard connection check</span>
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 p-3 bg-gray-50 dark:bg-[#1B1811]/50 border border-gray-200 dark:border-transparent rounded-lg text-xs space-y-2">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal font-sans">
                Tests whether <strong>this dashboard</strong> can reach the SourceTrack API. It does not test your website visitors&apos; tracker connection or any content-security-policy on your site.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400 font-medium">This dashboard&apos;s connection to the API:</span>
                <span className={`font-bold ${
                  reachability === 'reachable' ? 'text-green-600 dark:text-green-400' :
                  reachability === 'blocked' ? 'text-red-500' :
                  reachability === 'checking' ? 'text-blue-500 animate-pulse' :
                  'text-gray-400'
                }`}>
                  {reachability === 'reachable' && 'Reachable'}
                  {reachability === 'blocked' && 'API blocked'}
                  {reachability === 'checking' && 'Checking...'}
                  {reachability === 'not_checked' && 'Not checked yet'}
                </span>
              </div>
              {reachability === 'blocked' && (
                <p className="text-[11px] text-red-500 leading-normal font-sans">
                  This dashboard&apos;s browser/network may be blocking the SourceTrack API. Try a clean browser profile or pause aggressive blockers. (This does not indicate a problem on your website itself.)
                </p>
              )}
              {reachability === 'reachable' && (
                <p className="text-[11px] text-green-600 dark:text-green-400 leading-normal font-sans">
                  This dashboard can reach the SourceTrack API successfully.
                </p>
              )}
              {reachability !== 'checking' && (
                <button
                  type="button"
                  onClick={checkBrowserReachability}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1 mt-1"
                >
                  <RefreshCw className="w-2.5 h-2.5" /> Re-check connection
                </button>
              )}
            </div>
          </details>
        </div>
      )}


      {/* 5. Technical Details Accordion */}
      <div className="border-t border-gray-200 dark:border-[#3D3830] pt-3">
        <button
          onClick={() => setAccordionOpen(!accordionOpen)}
          className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-dark-text transition-colors"
        >
          <span>Technical Diagnostics</span>
          {accordionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {accordionOpen && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-[#1B1811]/50 border border-gray-200 dark:border-transparent rounded-lg text-[11px] font-sans text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <div className="grid grid-cols-2 gap-y-1.5 border-b border-gray-100 dark:border-gray-800 pb-2">
              <div>Last Seen Event</div>
              <div className="font-semibold text-st-black dark:text-dark-primary">{tracker_install.last_event_name || 'None'}</div>

              <div>Last Event Timestamp</div>
              <div className="font-mono text-st-black dark:text-dark-primary">
                {tracker_install.last_seen_at ? new Date(tracker_install.last_seen_at).toLocaleString() : 'Never'}
              </div>

              <div>Event Source Domain</div>
              <div className="font-semibold text-st-black dark:text-dark-primary">{domain_match.event_domain || 'Unknown'}</div>

              <div>Registered Domain</div>
              <div className="font-semibold text-st-black dark:text-dark-primary">{domain_match.registered_domain || 'Not configured'}</div>

              <div>Environment Type</div>
              <div className="font-mono text-st-black dark:text-dark-primary uppercase tracking-wider text-[10px]">
                {environment_detection}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-1.5 pt-1">
              <div>Conversion Tracking Configured</div>
              <div className={`font-semibold ${conversion_setup.detected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {conversion_setup.detected ? 'Yes' : 'No'}
              </div>

              <div>Paid Traffic Tracked (30d)</div>
              <div className={`font-semibold ${paid_tracking?.parameters_detected ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                {paid_tracking?.parameters_detected ? 'Yes' : 'No'}
              </div>

              {verification_token?.token_supplied && (
                <>
                  <div>Token Matched</div>
                  <div className={`font-semibold ${verification_token.token_matched ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                    {verification_token.token_matched ? 'Yes' : 'No'}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
