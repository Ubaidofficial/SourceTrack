export default function ComparisonTable({ rows }) {
  // Derive the column layout from the data so the same component renders both the
  // 4-column (vs-GA4) and 5-column (4-way) honest comparisons. First column is
  // the label (wider); the rest are equal vendor columns.
  const cols = rows[0]?.length || 4
  const gridTemplateColumns = `1.5fr ${Array(Math.max(cols - 1, 1)).fill('1fr').join(' ')}`
  const minWidth = cols >= 5 ? 680 : 580

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div className="overflow-hidden rounded-[32px] bg-white border border-[rgba(18,16,12,.10)] shadow-[0_24px_80px_rgba(18,16,12,.12)]" style={{ minWidth }}>
        {rows.map((row, i) => (
          <div key={i} className={`grid border-b border-[#F1EDE3] last:border-0 ${i === 0 ? 'bg-st-black text-white' : ''}`} style={{ gridTemplateColumns }}>
            {row.map((cell, j) => (
              <div key={j} className={`p-[18px_22px] min-h-[62px] flex items-center border-r border-[#F1EDE3] last:border-r-0 font-extrabold tracking-[-0.02em] text-sm ${i === 0 ? 'border-white/10' : ''}`}>
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
