import { SourceIcon } from './SourceIcon'

// Marketing fixture — hard-coded sample data only (no API/Supabase/PostHog).
// Compact "source → landing → event" journeys, consistent with the hero story.
// Illustrative only — not real customer data.
const JOURNEYS = [
  { source: 'chatgpt', label: 'ChatGPT', steps: ['/compare', '/pricing'], event: 'Trial started', model: 'First touch → ChatGPT' },
  { source: 'google', label: 'Google', steps: ['/pricing'], event: 'Demo booked', model: 'First touch → Organic' },
  { source: 'perplexity', label: 'Perplexity', steps: ['/blog', '/features'], event: 'Signup', model: 'First touch → Perplexity' },
  { source: 'linkedin', label: 'LinkedIn', steps: ['/blog', '/demo'], event: 'Qualified lead', model: 'Multi-touch → LinkedIn' },
]

export default function JourneyFixture() {
  return (
    <div className="relative">
      <div className="absolute right-[24px] top-[18px] w-[300px] h-[300px] rounded-full bg-st-lime opacity-[0.18] blur-[48px]" />
      <div className="relative rounded-[28px] bg-[#0D1010] p-3 border border-white/10 shadow-[0_24px_80px_rgba(18,16,12,.22)]">
        <div className="overflow-hidden rounded-[20px] bg-[#121616] border border-[#2D3333]">
          {/* Header */}
          <div className="h-[44px] flex items-center justify-between px-4 bg-[#171B1B] border-b border-white/10">
            <span className="text-[#F5F8F8] text-xs font-bold">Recent converting journeys</span>
            <span className="inline-flex items-center gap-1.5 rounded-full py-1 px-2.5 bg-[#D2EC2A]/10 text-st-lime text-[10px] font-black uppercase tracking-wider">
              Sample data
            </span>
          </div>

          <div className="p-4 grid gap-3">
            {JOURNEYS.map((j) => (
              <div key={j.label} className="rounded-2xl bg-[#181D1D] border border-[#2D3333] p-3.5">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[#DDE5E5]">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#2D3333] border border-white/5">
                    <SourceIcon source={j.source} className="w-3.5 h-3.5" />{j.label}
                  </span>
                  {j.steps.map((step) => (
                    <span key={step} className="inline-flex items-center gap-1.5">
                      <span className="text-st-lime font-black">→</span>
                      <span className="px-2 py-1 rounded bg-[#2D3333] border border-white/5 font-mono">{step}</span>
                    </span>
                  ))}
                  <span className="text-st-lime font-black">→</span>
                  <span className="px-2 py-1 rounded bg-[#D2EC2A]/20 text-st-lime border border-[#D2EC2A]/20">{j.event}</span>
                </div>
                <div className="mt-2 text-[#9DA7A7] text-[10px] font-bold">{j.model}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
