export default function HowItWorksSteps({ steps }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {steps.map((s, i) => (
        <div key={i} className="p-6 min-h-[250px] rounded-[26px] bg-white/5 border border-white/10" style={{ counterIncrement: 'steps' }}>
          <span className="inline-flex items-center justify-center h-8 px-[10px] rounded-full bg-st-lime text-st-black text-xs font-black mb-[58px]">
            0{i + 1}
          </span>
          <h3 className="text-[22px] font-bold text-white tracking-[-0.055em] leading-[1.04]">{s.title}</h3>
          <p className="mt-[10px] text-[#D6CDBB] text-[15px] leading-[1.5]">{s.body}</p>
        </div>
      ))}
    </div>
  )
}
