import { useState, useEffect, useRef } from 'react'
import { safeNumber } from '../utils/numbers'

function useCountUp(target, duration = 650) {
  const [current, setCurrent] = useState(null)
  const rafRef = useRef(null)
  const startRef = useRef(null)
  const fromRef = useRef(0)

  useEffect(() => {
    if (target == null) { setCurrent(null); return }
    const to = Number(target)
    const from = fromRef.current ?? 0
    if (from === to) { setCurrent(to); return }

    const prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

    if (prefersReducedMotion) {
      setCurrent(to)
      fromRef.current = to
      return
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = null

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts
      const progress = Math.min((ts - startRef.current) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setCurrent(from + (to - from) * eased)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        fromRef.current = to
        setCurrent(to)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return current
}

const MetricTile = ({
  label,
  value,
  format = 'number',
  isEmpty = false,
  trend = null,
  compact = false,
  delta = null,
  sub = null
}) => {
  const shouldAnimate = typeof value === 'number' && !Number.isNaN(value) && !isEmpty && value != null && format !== 'text'

  const animated = useCountUp(shouldAnimate ? value : null)

  const formatValue = (val, fmt) => {
    if (val == null) return null
    const n = Number(val)
    if (Number.isNaN(n)) return String(val)

    switch (fmt) {
      case 'currency': return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 10000 ? 0 : 2 }).format(n)
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

  return (
    <div className={`metric-tile bg-white dark:bg-dark-card rounded-xl shadow-sm border border-gray-200 dark:border-dark-border flex flex-col justify-between transition-all hover:shadow-md duration-200 ${
      compact ? 'px-4 py-3 gap-0.5' : 'p-5 gap-1.5'
    }`}>
      <div>
        <p className={`text-st-gray dark:text-gray-400 font-semibold uppercase tracking-wider ${compact ? 'text-[10px] mb-1' : 'text-[11px] mb-1.5'}`}>{label}</p>
        {displayValue != null ? (
          <p className={`text-st-black dark:text-white font-bold tabular-nums tracking-tight ${compact ? 'text-xl' : 'text-2xl'}`}>{displayValue}</p>
        ) : (
          <p className={`text-st-black dark:text-white font-bold tracking-tight ${compact ? 'text-xl' : 'text-2xl'}`}>—</p>
        )}
      </div>
      {(isEmptyState || showTrend || sub) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {isEmptyState && <p className="text-[10px] text-st-gray dark:text-gray-400 italic">Not yet tracked</p>}
          {showTrend && renderTrendPill()}
          {showTrend && <span className="text-[10px] text-st-gray dark:text-gray-400 font-medium">vs prior</span>}
          {sub && <p className="text-[10px] text-st-gray dark:text-gray-400 font-medium truncate">{sub}</p>}
        </div>
      )}
    </div>
  )
}

export default MetricTile
