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

const MetricTile = ({ label, value, format = 'number', isEmpty = false, trend = null }) => {
  const animated = useCountUp(
    (isEmpty || value == null || format === 'text') ? null : Number(value)
  )

  const formatValue = (val, fmt) => {
    if (val == null) return null
    const n = Number(val)
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
    : format === 'text'
      ? formatValue(value, format)
      : animated != null ? formatValue(animated, format) : formatValue(value, format)

  const trendPositive = trend != null && trend > 0
  const trendNegative = trend != null && trend < 0

  return (
    <div className="metric-tile bg-white dark:bg-dark-card rounded-xl p-5 shadow-sm border border-gray-100 dark:border-dark-border flex flex-col gap-1 transition-all">
      <p className="text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wide">{label}</p>
      {displayValue != null ? (
        <p className="text-2xl font-semibold text-st-black dark:text-white tabular-nums">{displayValue}</p>
      ) : (
        <p className="text-2xl font-semibold text-gray-300">—</p>
      )}
      {isEmptyState && <p className="text-xs text-st-gray dark:text-gray-400 italic mt-0.5">Not yet tracked</p>}
      {!isEmptyState && trend != null && (
        <p className={`text-xs font-medium mt-0.5 ${trendPositive ? 'text-green-600' : trendNegative ? 'text-red-500' : 'text-st-gray'}`}>
          {trendPositive ? '▲' : trendNegative ? '▼' : '—'} {Math.abs(safeNumber(trend, 0)).toFixed(1)}% vs last period
        </p>
      )}
    </div>
  )
}

export default MetricTile
