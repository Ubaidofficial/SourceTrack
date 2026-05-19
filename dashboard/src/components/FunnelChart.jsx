import { TrendingDown } from 'lucide-react'

export default function FunnelChart({ steps = [] }) {
  if (!steps || steps.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-st-gray dark:text-gray-400">
        No funnel data to display
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
              <span className="font-medium text-st-black dark:text-white truncate mr-2">
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
        <span className="text-sm font-semibold text-st-black dark:text-white">
          {overallRate}% overall conversion rate
        </span>
        <span className="text-xs text-st-gray dark:text-gray-400">
          ({steps[0]?.visitors.toLocaleString()} → {lastStep?.visitors.toLocaleString()})
        </span>
      </div>
    </div>
  )
}
