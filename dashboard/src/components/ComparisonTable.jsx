export default function ComparisonTable({ rows }) {
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div className="overflow-hidden rounded-[32px] bg-white border border-[rgba(31,35,35,.10)] shadow-[0_24px_80px_rgba(31,35,35,.12)] min-w-[580px]">
        {rows.map((row, i) => (
          <div key={i} className={`grid grid-cols-[1.5fr_1fr_1fr_1fr] border-b border-[#E5ECEC] last:border-0 ${i === 0 ? 'bg-st-black text-white' : ''}`}>
            {row.map((cell, j) => (
              <div key={j} className={`p-[18px_22px] min-h-[62px] flex items-center border-r border-[#E5ECEC] last:border-r-0 font-extrabold tracking-[-0.02em] text-sm ${i === 0 ? 'border-white/10' : ''}`}>
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
