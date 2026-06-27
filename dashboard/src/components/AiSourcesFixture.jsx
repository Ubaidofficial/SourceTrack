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
      <div className="relative rounded-[28px] bg-[#0D1010] p-3 border border-white/10 shadow-[0_24px_80px_rgba(31,35,35,.22)]">
        <div className="overflow-hidden rounded-[20px] bg-[#121616] border border-[#2D3333]">
          {/* Header */}
          <div className="h-[44px] flex items-center justify-between px-4 bg-[#171B1B] border-b border-white/10">
            <span className="text-[#F5F8F8] text-xs font-bold">AI referral sources</span>
            <span className="inline-flex items-center gap-1.5 rounded-full py-1 px-2.5 bg-[#CCF03F]/10 text-st-lime text-[10px] font-black uppercase tracking-wider">
              Sample data
            </span>
          </div>

          {/* Chips */}
          <div className="px-4 pt-4 flex flex-wrap gap-2">
            {AI_SOURCES.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full py-1.5 px-2.5 bg-[#1D2222] border border-white/10 text-[#DDE5E5] text-[11px] font-bold">
                <SourceIcon source={s.key} className="w-3.5 h-3.5" />
                {s.name}
              </span>
            ))}
          </div>

          {/* Breakdown */}
          <div className="p-4 grid gap-2">
            {AI_SOURCES.map((s) => (
              <div key={s.key} className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-3 py-1.5 border-b border-[#2D3333] last:border-0 text-xs font-extrabold text-[#DDE5E5]">
                <span className="w-7 h-7 rounded-[9px] grid place-items-center bg-[#252B2B] border border-white/10">
                  <SourceIcon source={s.key} className="w-4 h-4" />
                </span>
                <span>{s.name}</span>
                <strong className="tabular-nums">{s.visits}</strong>
                <span className="text-[#18C76E] text-[10px] tabular-nums">↗ {s.trend}</span>
              </div>
            ))}
          </div>

          {/* AI attribution callout */}
          <div className="mx-4 mb-4 rounded-2xl bg-[#181D1D] border border-[#2D3333] p-3.5">
            <div className="text-[#9DA7A7] text-[10px] font-extrabold uppercase tracking-wider mb-1">AI attribution</div>
            <p className="text-[#DDE5E5] text-[11px] font-semibold leading-normal">
              AI referrals drove <span className="text-st-lime font-black">21%</span> of conversions this period — most analytics
              label these as direct traffic.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
