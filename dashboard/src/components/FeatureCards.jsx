export default function FeatureCards({ items, compact = false }) {
  return (
    <div className={`grid gap-[18px] ${items.length === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
      {items.map((f, i) => (
        <article key={i} className={`lift relative overflow-hidden p-7 rounded-[28px] bg-white border border-[rgba(31,35,35,.10)] shadow-[0_12px_38px_rgba(31,35,35,.055)] ${compact ? 'min-h-[220px]' : 'min-h-[300px]'}`}>
          <div className="absolute right-[-48px] bottom-[-48px] w-[158px] h-[158px] rounded-full bg-[rgba(204,240,63,.18)]" />
          <div className="relative z-10 w-[52px] h-[52px] rounded-[18px] grid place-items-center text-st-black bg-st-lime font-black tracking-[-0.04em]">
            {f.icon}
          </div>
          <h3 className="relative z-10 mt-[64px] max-w-[350px] text-2xl leading-[1.04] tracking-[-0.055em] text-st-black font-bold">{f.title}</h3>
          {f.body && <p className="relative z-10 mt-3 text-[#667272] text-base leading-[1.55]">{f.body}</p>}
        </article>
      ))}
    </div>
  )
}
