import { SourceIcon } from './SourceIcon'

// Marketing fixture — hard-coded sample data only (no API/Supabase/PostHog).
// AI-referral story: chips + a sample AI-source breakdown. Numbers are kept
// consistent with the other homepage mockups (ChatGPT leads, Gemini/Perplexity
// follow). Illustrative only — does not represent real customer data.
const AI_SOURCES = [
  { key: 'chatgpt', name: 'ChatGPT', visits: '8,462', trend: '+32%' },
  { key: 'perplexity', name: 'Perplexity', visits: '1,284', trend: '+44%' },
  { key: 'gemini', name: 'Gemini', visits: '1,674', trend: '+18%' },
  { key: 'claude', name: 'Claude', visits: '942', trend: '+27%' },
  { key: 'copilot', name: 'Copilot', visits: '513', trend: '+12%' },
  { key: 'deepseek', name: 'DeepSeek', visits: '287', trend: '+9%' },
]

export default function AiSourcesFixture() {
  return (
    <div className="relative">
      <div className="absolute right-[30px] top-[20px] w-[300px] h-[300px] rounded-full bg-st-lime opacity-[0.20] blur-[48px]" />
      <div className="relative rounded-[28px] bg-[#12100C] p-3 border border-white/10 shadow-[0_24px_80px_rgba(18,16,12,.22)]">
        <div className="overflow-hidden rounded-[20px] bg-[#12100C] border border-[#3D3830]">
          {/* Header */}
          <div className="h-[44px] flex items-center justify-between px-4 bg-[#1B1811] border-b border-white/10">
            <span className="text-[#F7F4ED] text-xs font-bold">AI referral sources</span>
            <span className="inline-flex items-center gap-1.5 rounded-full py-1 px-2.5 bg-[#D2EC2A]/10 text-st-lime text-[10px] font-black uppercase tracking-wider">
              Sample data
            </span>
          </div>

          {/* Chips */}
          <div className="px-4 pt-4 flex flex-wrap gap-2">
            {AI_SOURCES.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full py-1.5 px-2.5 bg-[#1B1811] border border-white/10 text-[#E7E0D2] text-[11px] font-bold">
                <SourceIcon source={s.key} className="w-3.5 h-3.5" />
                {s.name}
              </span>
            ))}
          </div>

          {/* Breakdown */}
          <div className="p-4 grid gap-2">
            {AI_SOURCES.map((s) => (
              <div key={s.key} className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-3 py-1.5 border-b border-[#3D3830] last:border-0 text-xs font-extrabold text-[#E7E0D2]">
                <span className="w-7 h-7 rounded-[9px] grid place-items-center bg-[#1B1811] border border-white/10">
                  <SourceIcon source={s.key} className="w-4 h-4" />
                </span>
                <span>{s.name}</span>
                <strong className="tabular-nums">{s.visits}</strong>
                <span className="text-[#D2EC2A] text-[10px] tabular-nums">↗ {s.trend}</span>
              </div>
            ))}
          </div>

          {/* AI attribution callout */}
          <div className="mx-4 mb-4 rounded-2xl bg-[#1B1811] border border-[#3D3830] p-3.5">
            <div className="text-[#A39B8C] text-[10px] font-extrabold uppercase tracking-wider mb-1">AI attribution</div>
            <p className="text-[#E7E0D2] text-[11px] font-semibold leading-normal">
              AI referrals drove <span className="text-st-lime font-black">21%</span> of conversions this period — most analytics
              label these as direct traffic.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
