export default function SectionKicker({ label, dark = false }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full py-2 px-3 text-[13px] font-extrabold tracking-[-0.015em] ${
      dark
        ? 'text-white bg-white/10 border border-white/15'
        : 'text-st-black bg-[rgba(31,35,35,.055)] border border-[rgba(31,35,35,.07)]'
    }`}>
      <span className="w-2 h-2 rounded-full bg-[#00AA57] shadow-[0_0_0_6px_rgba(0,170,87,.12)]" />
      {label}
    </span>
  )
}
