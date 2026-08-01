import { useQuery } from '@tanstack/react-query'
import { Crosshair, RefreshCw } from 'lucide-react'
import { fetchApi } from '../lib/api'
import { useCountUp } from '../utils/useCountUp'

// Deterministic, read-only Attribution Coverage stat for the Setup & Health
// surface. Coverage = % of conversions in the window we can trace to a known
// acquisition source (first- OR last-touch channel that isn't direct/unknown).
// This is a coverage/health number — NOT the credited-channel mix shown on the
// attribution dashboard. No LLM narration, no recommendations, no predictions.
const WINDOW_DAYS = 30

// Ring geometry. r=34 in a 80x80 box leaves room for the 8px stroke without clipping.
const RING_R = 34
const RING_C = 2 * Math.PI * RING_R

// Coverage ring. The sweep is driven by the SAME interpolated value as the number beside
// it (useCountUp — rAF, ease-out cubic, fires once per target change, never loops, and
// snaps to the end state under prefers-reduced-motion), so the arc and the digits can
// never disagree mid-animation.
//
// aria-hidden: the value is already exposed as text next to this, so announcing the ring
// too would just read the same number twice. The ring is presentation for a value that is
// stated in the accessible tree — not an unlabelled graphic.
function CoverageRing({ pct }) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0))
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true" className="shrink-0">
      <circle
        cx="40" cy="40" r={RING_R}
        fill="none" strokeWidth="8"
        className="stroke-gray-200 dark:stroke-[#3D3830]"
      />
      <circle
        cx="40" cy="40" r={RING_R}
        fill="none" strokeWidth="8" strokeLinecap="round"
        className="stroke-st-lime dark:stroke-st-lime-dark"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - clamped / 100)}
        // -90deg so the arc starts at 12 o'clock instead of 3.
        transform="rotate(-90 40 40)"
      />
    </svg>
  )
}

export default function AttributionCoverageCard({ siteKey }) {
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['attribution-coverage', siteKey, WINDOW_DAYS],
    queryFn: () => fetchApi(`/analytics/coverage?site_key=${encodeURIComponent(siteKey)}&days=${WINDOW_DAYS}`),
    enabled: !!siteKey,
    retry: false
  })

  const stat = response?.data ?? response ?? null

  // Called BEFORE the loading/empty early returns below — a hook after a conditional
  // return would change hook order between renders. useCountUp already handles a null
  // target by returning null, so the gated-off case costs nothing.
  const shouldAnimate =
    stat?.has_data === true && typeof stat.coverage_pct === 'number' && !Number.isNaN(stat.coverage_pct)
  const animatedPct = useCountUp(shouldAnimate ? stat.coverage_pct : null)

  const Shell = ({ children }) => (
    <div className="bg-white dark:bg-[#1B1811] border border-gray-200 dark:border-[#3D3830] rounded-xl p-5 shadow-sm">
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

  // Same fallback convention as MetricTile: use the interpolated value once it exists,
  // otherwise the real one — so the figure is never blank and never a placeholder zero.
  // Rounded to 1dp to match coverage_pct's own precision (and so 100 renders as "100",
  // not "100.0"). At rest this is exactly stat.coverage_pct.
  const livePct = shouldAnimate && animatedPct != null ? animatedPct : stat.coverage_pct
  const displayPct = Math.round(livePct * 10) / 10
  const ringPct = livePct

  return (
    <Shell>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        % of conversions we can trace to a known acquisition source.
      </p>
      <div className="mt-3 flex items-center gap-4">
        <CoverageRing pct={ringPct} />
        <div className="flex flex-col">
          <span className="text-4xl font-black tracking-tight text-st-black dark:text-dark-primary tabular-nums">
            {displayPct}%
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {stat.covered}/{stat.total} conversions · last {stat.window_days} days
          </span>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        First- or last-touch traced to a known channel (not direct/unknown). This is a coverage
        health metric — not your credited-channel mix.
      </p>

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#3D3830]">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-st-black dark:text-dark-primary tabular-nums">{stat.tagged_pct}%</span>{' '}
          of conversions arrived with a tagged link (UTM or click ID).
        </p>
      </div>
    </Shell>
  )
}
