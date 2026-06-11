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
  Info
} from 'lucide-react'

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
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-850 dark:text-gray-400',
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

export default function SetupDoctorCard({ siteKey, mode = 'dashboard', onVerificationSuccess }) {
  const navigate = useNavigate()
  const [accordionOpen, setAccordionOpen] = useState(false)

  const { data: response, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['setup-doctor', siteKey],
    queryFn: async () => {
      const params = new URLSearchParams({ site_key: siteKey })
      return fetchApi(`/install/doctor?${params}`)
    },
    enabled: !!siteKey,
    refetchInterval: mode === 'onboarding' ? 5000 : false // Auto-poll during onboarding step
  })

  const diagnostics = response?.data ?? response ?? null

  // Trigger success callback if verified healthy during onboarding
  useEffect(() => {
    if (diagnostics && onVerificationSuccess) {
      if (diagnostics.status === 'healthy') {
        onVerificationSuccess(diagnostics)
      }
    }
  }, [diagnostics, onVerificationSuccess])

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-5 shadow-sm flex items-center justify-center min-h-[150px]">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-st-gray dark:text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading setup diagnostics...</p>
        </div>
      </div>
    )
  }

  if (error || !diagnostics) {
    return (
      <div className="bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-3 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">Diagnostics Unavailable</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              We encountered an error loading setup diagnostics: {error?.message || 'Check site key configuration.'}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-3 px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-[#252929] hover:bg-gray-200 dark:hover:bg-[#333838] rounded-lg transition-colors flex items-center gap-1.5 text-gray-700 dark:text-gray-200"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
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

  return (
    <div className="bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-5 shadow-sm space-y-4">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-150 dark:border-[#2A2E2E] pb-4">
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
              <h3 className="font-semibold text-st-black dark:text-white">Tracking Doctor</h3>
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
                onClick={() => navigate('/debugger')}
                className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-250 bg-gray-50 dark:bg-[#252929] hover:bg-gray-150 dark:hover:bg-[#333838] border border-gray-200 dark:border-white/5 rounded-lg transition-colors"
              >
                Event Logger
              </button>
              <button
                onClick={() => navigate('/snippet')}
                className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-250 bg-gray-50 dark:bg-[#252929] hover:bg-gray-150 dark:hover:bg-[#333838] border border-gray-200 dark:border-white/5 rounded-lg transition-colors"
              >
                Snippet Code
              </button>
            </>
          )}

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-250 bg-gray-50 dark:bg-[#252929] hover:bg-gray-150 dark:hover:bg-[#333838] border border-gray-200 dark:border-white/5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            Verify Now
          </button>
        </div>
      </div>

      {/* 2. Setup Checks Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {displayChecks.map((check, i) => (
          <div key={i} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-gray-50 dark:bg-[#252929]/30 border border-gray-100 dark:border-transparent">
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

      {/* 3. Single Next Action Recommendation */}
      {recommended_next_action && recommended_next_action.action_key !== 'none' && (
        <div className="p-3 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/40 dark:border-amber-900/30 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-450 mt-0.5 shrink-0" />
            <div className="text-gray-700 dark:text-gray-300">
              <span className="font-semibold">Recommended Action: </span>
              {recommended_next_action.message}
            </div>
          </div>
          <button
            onClick={handleActionClick}
            className="px-3 py-1.5 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-lg font-bold shrink-0 transition-opacity hover:opacity-90"
          >
            Resolve Issue
          </button>
        </div>
      )}


      {/* 5. Technical Details Accordion */}
      <div className="border-t border-gray-150 dark:border-[#2A2E2E] pt-3">
        <button
          onClick={() => setAccordionOpen(!accordionOpen)}
          className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
        >
          <span>Technical Diagnostics</span>
          {accordionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {accordionOpen && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-[#1E2121]/50 border border-gray-200 dark:border-transparent rounded-lg text-[11px] font-sans text-gray-650 dark:text-gray-400 space-y-2 leading-relaxed">
            <div className="grid grid-cols-2 gap-y-1.5 border-b border-gray-100 dark:border-gray-800 pb-2">
              <div>Last Seen Event</div>
              <div className="font-semibold text-st-black dark:text-white">{tracker_install.last_event_name || 'None'}</div>

              <div>Last Event Timestamp</div>
              <div className="font-mono text-st-black dark:text-white">
                {tracker_install.last_seen_at ? new Date(tracker_install.last_seen_at).toLocaleString() : 'Never'}
              </div>

              <div>Event Source Domain</div>
              <div className="font-semibold text-st-black dark:text-white">{domain_match.event_domain || 'Unknown'}</div>

              <div>Registered Domain</div>
              <div className="font-semibold text-st-black dark:text-white">{domain_match.registered_domain || 'Not configured'}</div>

              <div>Environment Type</div>
              <div className="font-mono text-st-black dark:text-white uppercase tracking-wider text-[10px]">
                {environment_detection}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-1.5 pt-1">
              <div>Conversion Tracking Configured</div>
              <div className={`font-semibold ${conversion_setup.detected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-450'}`}>
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
