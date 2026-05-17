const MetricTile = ({ label, value, format = 'number', isEmpty = false, trend = null }) => {
  const formatValue = (val, fmt) => {
    if (val == null) return null
    const n = Number(val)
    switch (fmt) {
      case 'currency': return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 10000 ? 0 : 2 }).format(n)
      case 'percent': return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
      case 'number': return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
      case 'text': return String(val)
      default: return String(val)
    }
  }
  const isEmptyState = isEmpty || value == null
  const displayValue = isEmptyState ? null : formatValue(value, format)
  const trendPositive = trend != null && trend > 0
  const trendNegative = trend != null && trend < 0
  return (
    <div className="metric-tile bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-1">
      <p className="text-xs font-medium text-st-gray uppercase tracking-wide">{label}</p>
      {displayValue != null ? (
        <p className="text-2xl font-semibold text-st-black tabular-nums">{displayValue}</p>
      ) : (
        <p className="text-2xl font-semibold text-gray-300">—</p>
      )}
      {isEmptyState && <p className="text-xs text-st-gray italic mt-0.5">Not yet tracked</p>}
      {!isEmptyState && trend != null && (
        <p className={`text-xs font-medium mt-0.5 ${trendPositive ? 'text-green-600' : trendNegative ? 'text-red-500' : 'text-st-gray'}`}>
          {trendPositive ? '▲' : trendNegative ? '▼' : '—'} {Math.abs(trend).toFixed(1)}% vs last period
        </p>
      )}
    </div>
  )
}
export default MetricTile
