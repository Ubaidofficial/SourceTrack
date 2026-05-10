import { TrendingUp, TrendingDown } from 'lucide-react'

export default function MetricTile({ label, value, delta, icon: Icon, iconBg = 'bg-gray-100', iconColor = 'text-gray-600' }) {
  const isUp = delta?.up ?? (delta?.pct >= 0)
  const showDelta = delta !== null && delta !== undefined

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`p-2 rounded-lg ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
          {showDelta && (
            <p className={`text-xs font-medium mt-0.5 flex items-center gap-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isUp ? '+' : ''}{Math.abs(delta.pct).toFixed(0)}% vs prev. 30d
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
