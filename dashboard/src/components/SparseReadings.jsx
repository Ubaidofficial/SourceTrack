// design.md §9.2, fewer-than-3 tier: "do not draw a chart. Render the numbers."
//
// Deliberately NOT a full-height empty card. §38.2: "An empty module is one line with
// a link, never a full-height card." The readings here are real data, so they lead —
// the explanatory line sits under them, not in place of them.
export default function SparseReadings({ readings = [], unit = '', note = null }) {
  if (readings.length === 0) return null
  return (
    <div className="py-4 space-y-3">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {readings.map((r) => (
          <div key={r.label}>
            <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-0.5">{r.label}</p>
            <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">{r.value}</p>
            {/* Second metric for the same reading (e.g. revenue beside visitors). Rendered only
                when the caller has a real value for it — never as a dash placeholder (§6). */}
            {r.sub && <p className="text-[11px] text-st-gray dark:text-gray-400 tabular-nums mt-0.5">{r.sub}</p>}
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-st-gray dark:text-gray-400 max-w-sm">
        {note || `Not enough history to plot a trend yet — ${readings.length === 1 ? 'this is the only day' : `these are the only ${readings.length} days`} with a reading${unit ? ` of ${unit}` : ''}. A line through ${readings.length === 1 ? 'one point' : 'two points'} would imply a trend the data cannot support.`}
      </p>
    </div>
  )
}
