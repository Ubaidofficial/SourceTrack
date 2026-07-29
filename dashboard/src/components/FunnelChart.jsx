import { TrendingDown, Info } from 'lucide-react'

export default function FunnelChart({
  steps = [],
  loading = false,
  hasSteps = false,
  error = false,
  // Set when the backend's pageview read hit its row cap, so these counts are a floor
  // rather than a total. Shown as a caveat ON the result (§6: never present a partial
  // dataset as complete) — not as an error, because the numbers are real, just incomplete.
  truncated = false,
  sampleSize = null
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-lime" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-sm text-red-400">
        Failed to load funnel data. Please try again.
      </div>
    )
  }

  if (!hasSteps) {
    return (
      <div className="text-center py-8 text-sm text-st-gray dark:text-gray-400">
        No funnel data to display
      </div>
    )
  }

  const hasFunnelResults = steps?.some(step => Number(step.visitors || 0) > 0)
  if (!hasFunnelResults) {
    return (
      <div className="text-center py-8 text-sm text-st-gray dark:text-gray-400 leading-relaxed max-w-xs mx-auto">
        No matching pageviews found for these path steps. Try broader keywords — funnels match any URL containing each keyword.
      </div>
    )
  }

  const maxVisitors = steps[0]?.visitors || 1

  const lastStep = steps[steps.length - 1]
  const overallRate = maxVisitors > 0
    ? Math.round((lastStep.visitors / maxVisitors) * 100)
    : 0

  const barColors = [
    'bg-st-lime',
    'bg-lime-200',
    'bg-amber-100',
    'bg-amber-200',
    'bg-orange-100',
    'bg-orange-200',
    'bg-red-100',
    'bg-red-200'
  ]

  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const barPct = Math.max(2, Math.round((s.visitors / maxVisitors) * 100))
        const color = barColors[Math.min(i, barColors.length - 1)]
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-st-black dark:text-dark-primary truncate mr-2">
                {i + 1}. {s.step}
              </span>
              <span className="text-st-gray dark:text-gray-400 flex-shrink-0">
                {s.visitors.toLocaleString()} visitors
                {i > 0 && (
                  <span className={s.dropoff_rate > 50 ? 'text-red-500 ml-1' : 'text-amber-500 ml-1'}>
                    (-{s.dropoff_rate}%)
                  </span>
                )}
              </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-5 overflow-hidden">
              <div
                className={`h-full ${color} rounded-full transition-all duration-500 flex items-center justify-end px-2`}
                style={{ width: `${barPct}%`, minWidth: '24px' }}
              >
                {barPct > 8 && (
                  <span className="text-[10px] font-bold text-st-black truncate">
                    {barPct}%
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
        <TrendingDown className="w-4 h-4 text-st-gray dark:text-gray-400" />
        <span className="text-sm font-semibold text-st-black dark:text-dark-primary">
          {overallRate}% overall conversion rate
        </span>
        <span className="text-xs text-st-gray dark:text-gray-400">
          ({steps[0]?.visitors.toLocaleString()} → {lastStep?.visitors.toLocaleString()})
        </span>
      </div>

      {/* Truncation caveat. Deliberately rendered BELOW the numbers it qualifies, and
          worded as a floor ("at least", "may be incomplete") rather than implying the
          rate above is exact. */}
      {truncated && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2">
          <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            Based on the most recent{' '}
            {sampleSize ? sampleSize.toLocaleString() : 'capped set of'} pageviews in this
            range — results may be incomplete for high-traffic date ranges. Narrow the date
            range for a complete funnel.
          </p>
        </div>
      )}
    </div>
  )
}
