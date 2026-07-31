import { safeNumber, normalizeCurrency } from '../utils/numbers'
import { useCountUp } from '../utils/useCountUp'

const MetricTile = ({
  label,
  value,
  format = 'number',
  isEmpty = false,
  trend = null,
  compact = false,
  // Drops the tile's OWN card chrome (background, border, radius, shadow, hover) so a row of
  // tiles can sit inside one shared divided strip — the treatment the Analytics page already
  // uses. Purely presentational; defaults false, so every existing call site is unchanged.
  flush = false,
  // design.md §2.4: "When available, revenue and conversions visually dominate. Secondary
  // metrics ... should be quieter but still polished." Before this, every tile rendered its
  // value at exactly one size (text-xl tight / text-2xl otherwise), so Revenue and Sessions
  // were typographically identical and the section had no hierarchy at all.
  //
  // This is a step for ONE tile, not a bump for all of them — differentiation is the point,
  // so the secondary sizes below are deliberately unchanged. Which tile is primary is decided
  // by data, not hardcoded here: overviewKpis.js marks its slot-1 "headline number for this
  // business type", which is Revenue for saas/ecommerce and Total Leads for leadgen.
  primary = false,
  delta = null,
  sub = null,
  // Why this tile has no value. A bare "—" reads as broken; the reason is what makes it read as
  // "not applicable". Defaults to the generic caption so every existing call site is unchanged.
  emptyReason = 'Not yet tracked',
  // ISO code for the `currency` format only. Defaults to USD, so every existing call site —
  // none of which passes this today — renders exactly as before. Nothing supplies a real
  // currency yet: attributed_conversions has no currency column (separate dispatch).
  currency = 'USD'
}) => {
  const currencyCode = normalizeCurrency(currency)
  const shouldAnimate = typeof value === 'number' && !Number.isNaN(value) && !isEmpty && value != null && format !== 'text'

  const animated = useCountUp(shouldAnimate ? value : null)

  const formatValue = (val, fmt) => {
    if (val == null) return null
    const n = Number(val)
    if (Number.isNaN(n)) return String(val)

    switch (fmt) {
      case 'currency': return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, maximumFractionDigits: n >= 10000 ? 0 : 2 }).format(n)
      case 'percent':  return `${n >= 0 ? '+' : ''}${safeNumber(n, 0).toFixed(1)}%`
      case 'number':   return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(safeNumber(n, 0)))
      case 'text':     return String(val)
      default:         return String(val)
    }
  }

  const isEmptyState = isEmpty || value == null
  const displayValue = isEmptyState
    ? null
    : typeof value === 'string'
      ? value
      : shouldAnimate && animated != null
        ? formatValue(animated, format)
        : formatValue(value, format)

  const renderTrendPill = () => {
    if (delta) {
      const isPos = delta.arrow === '▲'
      const isNeg = delta.arrow === '▼'
      const pillBg = isPos
        ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
        : isNeg
          ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-900/20'
          : 'bg-gray-50 text-st-gray dark:bg-[#252929] dark:text-gray-400 border border-gray-200 dark:border-dark-border'
      return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none shadow-sm ${pillBg} ${delta.color}`}>
          <span>{delta.arrow}</span>
          <span>{delta.pct}%</span>
        </span>
      )
    }

    if (trend != null) {
      const isPos = trend > 0
      const isNeg = trend < 0
      const pillBg = isPos
        ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
        : isNeg
          ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-900/20'
          : 'bg-gray-50 text-st-gray dark:bg-[#252929] dark:text-gray-400 border border-gray-200 dark:border-dark-border'
      return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none shadow-sm ${pillBg}`}>
          <span>{isPos ? '▲' : isNeg ? '▼' : '—'}</span>
          <span>{Math.abs(safeNumber(trend, 0)).toFixed(1)}%</span>
        </span>
      )
    }

    return null
  }

  const showTrend = !isEmptyState && (trend != null || delta)
  const tight = compact || flush
  // One step up for the headline tile; secondary tiles keep the size they already had.
  const valueSize = primary ? 'text-3xl' : tight ? 'text-xl' : 'text-2xl'

  return (
    <div
      title={isEmptyState ? emptyReason : undefined}
      className={`metric-tile flex flex-col justify-between ${
      flush
        ? 'flex-1 min-w-[120px] p-4 gap-0.5'
        : 'bg-white dark:bg-dark-card rounded-xl shadow-sm card-hairline border border-gray-200 dark:border-dark-border transition-all hover:shadow-md duration-200 ' +
          (compact ? 'px-4 py-3 gap-0.5' : 'p-5 gap-1.5')
    }`}>
      {/* flush shares compact's type scale — that IS the Analytics strip's scale
          (text-[10px] label / text-xl value). */}
      <div>
        <p className={`text-st-gray dark:text-gray-400 font-semibold uppercase tracking-wider ${tight ? 'text-[10px] mb-1' : 'text-[11px] mb-1.5'}`}>{label}</p>
        {displayValue != null ? (
          <p className={`text-st-black dark:text-dark-primary font-bold tabular-nums tracking-tight ${valueSize}`}>{displayValue}</p>
        ) : (
          <p className={`text-st-black dark:text-dark-primary font-bold tracking-tight ${valueSize}`}>—</p>
        )}
      </div>
      {(isEmptyState || showTrend || sub) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {isEmptyState && <p className="text-[10px] text-st-gray dark:text-gray-400 italic">{emptyReason}</p>}
          {showTrend && renderTrendPill()}
          {showTrend && <span className="text-[10px] text-st-gray dark:text-gray-400 font-medium">vs prior</span>}
          {sub && <p className="text-[10px] text-st-gray dark:text-gray-400 font-medium truncate">{sub}</p>}
        </div>
      )}
    </div>
  )
}

export default MetricTile
