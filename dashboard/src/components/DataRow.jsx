import { safeNumber, fmtMoney } from '../utils/numbers'

// Bar-behind-label row (visitors/count bar; optional revenue accent bar).
//
// Moved here VERBATIM from Analytics.jsx — that page got the dedicated density pass and is now
// the second consumer, not the owner. The Dashboard's Top Sources / AI Source Performance panels
// render through this same component instead of a plain table, which is what made the two pages
// read as different products. One implementation, so they cannot drift.
// `rate` is an OPTIONAL third figure (a percentage, already computed) shown next to revenue in the
// muted line. Additive: every existing call site omits it, so nothing about their rendering changes.
// Added here rather than duplicating the row markup for the Goals list, per this file's own rule —
// one implementation, so the two pages cannot drift.
export default function DataRow({ label, count, max, icon, onClick, active, revenue, maxRevenue, rate }) {
  const n = safeNumber(count, 0)
  const pct = max > 0 ? (n / max) * 100 : 0
  const rev = safeNumber(revenue, 0)
  const revPct = maxRevenue > 0 ? (rev / maxRevenue) * 100 : 0
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-dark-border last:border-0 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${active ? 'bg-st-lime/5' : 'hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
    >
      {icon && <span className="flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>}
      <div className="flex-1 min-w-0">
        <span className="text-xs truncate text-st-black dark:text-dark-primary block">{label}</span>
        <div style={{ height: '2px', width: `${pct.toFixed(1)}%`, background: 'rgba(204,240,63,0.6)', borderRadius: '1px', marginTop: '3px' }} />
        {rev > 0 && (
          <div style={{ height: '2px', width: `${revPct.toFixed(1)}%`, background: '#C8F000', borderRadius: '1px', marginTop: '2px' }} />
        )}
      </div>
      <div className="flex-shrink-0 text-right w-20">
        <span className="text-sm font-medium text-st-black dark:text-dark-primary tabular-nums block">{n.toLocaleString()}</span>
        {(rev > 0 || rate != null) && (
          <span className="text-[10px] text-st-gray dark:text-gray-400 tabular-nums">
            {rev > 0 ? fmtMoney(rev) : null}
            {rev > 0 && rate != null ? ' · ' : null}
            {rate != null ? `${safeNumber(rate, 0).toFixed(1)}%` : null}
          </span>
        )}
      </div>
    </div>
  )
}
