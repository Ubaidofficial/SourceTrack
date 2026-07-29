import React from 'react'

export default function HeroPreviewCard() {
  return (
    <div className="relative min-h-[520px] w-full max-w-[560px] mx-auto">
      {/* Background ambient glow */}
      <div className="absolute right-[30px] top-[20px] w-[320px] h-[320px] rounded-full bg-st-lime opacity-[0.24] blur-[48px]" />

      <div className="relative rounded-[32px] bg-[#0D1010] p-3 shadow-[0_30px_90px_rgba(31,35,35,.30)] border border-white/10" style={{ transform: 'rotate(-0.8deg)' }}>
        <div className="overflow-hidden min-h-[460px] rounded-[22px] bg-[#121616] border border-[#2D3333]">
          {/* Header */}
          <div className="h-[48px] grid grid-cols-[80px_1fr_auto] items-center gap-2 px-4 bg-[#171B1B] text-[#F5F8F8] border-b border-white/10 text-xs font-bold">
            <div className="flex gap-[6px]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E54545]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF8800]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#C8F000]" />
            </div>
            <span className="truncate">Sample Attribution Preview</span>
            <span className="inline-flex items-center gap-1.5 rounded-full py-1 px-2.5 bg-[#C8F000]/10 text-st-lime text-[10px] font-black uppercase tracking-wider">
              Sample Data
            </span>
          </div>

          <div className="p-3 grid grid-cols-2 gap-3 text-white">
            {/* KPI Cards */}
            <div className="bg-[#181D1D] border border-[#2D3333] rounded-2xl p-3">
              <div className="text-[#9DA7A7] text-[10px] font-extrabold uppercase tracking-wider">Attributed Revenue</div>
              <div className="mt-1 text-2xl font-black tracking-tight text-white">$18,420</div>
              <div className="mt-1 text-[#18C76E] text-[10px] font-bold">Sample dataset</div>
            </div>

            <div className="bg-[#181D1D] border border-[#2D3333] rounded-2xl p-3">
              <div className="text-[#9DA7A7] text-[10px] font-extrabold uppercase tracking-wider">Top Source</div>
              <div className="mt-1 text-2xl font-black tracking-tight text-[#C8F000]">ChatGPT</div>
              <div className="mt-1 text-[#9DA7A7] text-[10px] font-bold">AI referral channel</div>
            </div>

            {/* Example Journey Panel */}
            <div className="col-span-2 bg-[#181D1D] border border-[#2D3333] rounded-2xl p-3.5">
              <div className="text-[#9DA7A7] text-[10px] font-extrabold uppercase tracking-wider mb-2">Example Journey Map</div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#DDE5E5] font-bold">
                <span className="px-2 py-1 rounded bg-[#2D3333] border border-white/5">ChatGPT</span>
                <span className="text-st-lime font-black">→</span>
                <span className="px-2 py-1 rounded bg-[#2D3333] border border-white/5">/pricing</span>
                <span className="text-st-lime font-black">→</span>
                <span className="px-2 py-1 rounded bg-[#C8F000]/20 text-st-lime border border-[#C8F000]/20">checkout ($120.00)</span>
              </div>
              <div className="mt-2 text-[#9DA7A7] text-[10px]">Attributed 100% to ChatGPT referral (Linear model)</div>
            </div>

            {/* Sample Source Table */}
            <div className="col-span-2 bg-[#181D1D] border border-[#2D3333] rounded-2xl p-3">
              <div className="text-[#9DA7A7] text-[10px] font-extrabold uppercase tracking-wider mb-2">Sample Channel Breakdown</div>
              <div className="grid gap-1.5">
                {[
                  ['ChatGPT', 'AI Search', '$3,840'],
                  ['Google Ads', 'Paid Search', '$6,200'],
                  ['Meta Ads', 'Paid Social', '$5,820'],
                ].map((row, i) => (
                  <div key={i} className="flex justify-between items-center py-1 border-b border-[#2D3333] last:border-0 text-xs font-bold">
                    <div className="flex flex-col">
                      <span className="text-[#D8E0E0]">{row[0]}</span>
                      <span className="text-[#586464] text-[9px] font-normal">{row[1]}</span>
                    </div>
                    <span className="text-[#C8F000]">{row[2]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Demo Insight Badge */}
      <div className="absolute left-[-20px] bottom-[20px] w-[260px] rounded-2xl p-3.5 bg-white/95 border border-[rgba(31,35,35,.08)] shadow-[0_20px_60px_rgba(31,35,35,.10)] backdrop-blur-md" style={{ transform: 'rotate(1.5deg)' }}>
        <strong className="block text-xs font-black text-st-black tracking-tight">Demo Insight</strong>
        <p className="mt-1 text-[#586464] text-[11px] font-bold leading-normal">
          Claude and ChatGPT referrals generated 22% of revenue. Standard analytics labeled these as direct traffic.
        </p>
      </div>
    </div>
  )
}
