import { useQuery } from '@tanstack/react-query'
import { Crosshair, RefreshCw } from 'lucide-react'
import { fetchApi } from '../lib/api'

// Deterministic, read-only Attribution Coverage stat for the Setup & Health
// surface. Coverage = % of conversions in the window we can trace to a known
// acquisition source (first- OR last-touch channel that isn't direct/unknown).
// This is a coverage/health number — NOT the credited-channel mix shown on the
// attribution dashboard. No LLM narration, no recommendations, no predictions.
const WINDOW_DAYS = 30

export default function AttributionCoverageCard({ siteKey }) {
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['attribution-coverage', siteKey, WINDOW_DAYS],
    queryFn: () => fetchApi(`/analytics/coverage?site_key=${encodeURIComponent(siteKey)}&days=${WINDOW_DAYS}`),
    enabled: !!siteKey,
    retry: false
  })

  const stat = response?.data ?? response ?? null

  const Shell = ({ children }) => (
    <div className="bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Crosshair className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        <h3 className="text-sm font-semibold text-st-black dark:text-dark-primary">Attribution coverage</h3>
      </div>
      {children}
    </div>
  )

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 py-4">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading coverage…</span>
        </div>
      </Shell>
    )
  }

  // On error, or no data in the window: calm empty state — never a fake 0%.
  if (error || !stat || stat.has_data === false) {
    return (
      <Shell>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
          No conversions in the last {stat?.window_days || WINDOW_DAYS} days yet. Attribution
          coverage appears once this site has attributed conversions.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        % of conversions we can trace to a known acquisition source.
      </p>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-4xl font-black tracking-tight text-st-black dark:text-dark-primary tabular-nums">
          {stat.coverage_pct}%
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          {stat.covered}/{stat.total} conversions · last {stat.window_days} days
        </span>
      </div>

      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        First- or last-touch traced to a known channel (not direct/unknown). This is a coverage
        health metric — not your credited-channel mix.
      </p>

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#2A2E2E]">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-st-black dark:text-dark-primary tabular-nums">{stat.tagged_pct}%</span>{' '}
          of conversions arrived with a tagged link (UTM or click ID).
        </p>
      </div>
    </Shell>
  )
}
