export default function DashboardPreviewMock() {
  return (
    <div className="relative min-h-[620px]">
      <div className="absolute right-[34px] top-[30px] w-[380px] h-[380px] rounded-full bg-st-lime opacity-[0.28] blur-[42px]" />
      <div className="relative rounded-[36px] bg-[#0D1010] p-[14px] shadow-[0_34px_110px_rgba(31,35,35,.34)] border border-white/20" style={{ transform: 'rotate(-1.2deg)' }}>
        <div className="overflow-hidden min-h-[528px] rounded-[26px] bg-st-black border border-[#343A3A]">
          <div className="h-[54px] grid grid-cols-[90px_1fr_auto] items-center gap-3 px-[18px] bg-[#171B1B] text-[#F5F8F8] border-b border-white/10 text-[13px] font-black">
            <div className="flex gap-[7px]">
              <span className="w-[10px] h-[10px] rounded-full bg-[#E54545]" />
              <span className="w-[10px] h-[10px] rounded-full bg-[#FF8800]" />
              <span className="w-[10px] h-[10px] rounded-full bg-st-lime" />
            </div>
            <span>Revenue attribution — see which sources create customers</span>
            <span className="inline-flex items-center gap-[7px] rounded-full py-[6px] px-[10px] bg-[rgba(204,240,63,.12)] text-st-lime text-xs font-black">
              <span className="w-2 h-2 rounded-full bg-st-lime" />Live
            </span>
          </div>

          <div className="p-4 grid grid-cols-6 gap-3 text-[#F6FAFA]">
            <KpiCard label="Revenue by source" value="$150.4k" trend="↗ +23.5% from multi-touch attribution" />
            <KpiCard label="AI-assisted conversions" value="$48.9k" trend="↗ +156% from ChatGPT, Gemini & more" />
            <KpiCard label="Source quality score" value="92%" trend="Email + partner referrals lead" />

            <div className="col-span-6 bg-[#161A1A] border border-[#343A3A] rounded-[18px] p-4">
              <div className="text-[#9DA7A7] text-[11px] font-black uppercase tracking-[0.055em]">Recent converting journeys</div>
              <div className="mt-3 grid gap-0">
                {[
                  ['Marvin McKinney', 'LinkedIn → Blog → Demo', 'Lead', '$14.8k'],
                  ['Dianne Russell', 'ChatGPT → Pricing → Signup', 'Demo', '$8.9k'],
                  ['Kathryn Murphy', 'Google Ads → Landing → Purchase', 'Purchase', '$17.8k'],
                  ['Robert Fox', 'Gemini → Comparison → Trial', 'Signup', '$12.2k'],
                ].map((row, i) => (
                  <div key={i} className="grid grid-cols-[1.3fr_.72fr_.55fr_.55fr] gap-[10px] py-[10px] border-b border-white/10 text-[#D8E0E0] text-[11px] font-bold leading-tight last:border-0">
                    <span className="truncate">{row[0]}</span><span className="text-[#B9C2C2]">{row[1]}</span>
                    <span className="inline-flex items-center justify-center min-w-[54px] px-2 py-[3px] rounded-full bg-[rgba(204,240,63,.16)] text-st-lime text-[11px] font-black">{row[2]}</span>
                    <span>{row[3]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-3 bg-[#161A1A] border border-[#343A3A] rounded-[18px] p-4">
              <div className="text-[#9DA7A7] text-[11px] font-black uppercase tracking-[0.055em]">Landing page revenue</div>
              <div className="flex items-end gap-2 h-[132px] mt-[18px] pb-1 border-b border-dashed border-white/20">
                {[42, 72, 55, 88, 63, 78, 48].map((h, i) => (
                  <span key={i} className="flex-1 min-h-[20px] rounded-t-full" style={{ height: `${h}%`, background: 'linear-gradient(180deg, #CCF03F, rgba(204,240,63,.06))' }} />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[9px] font-bold text-[#9DA7A7] uppercase">
                <span>/pricing</span><span>/blog</span><span>/demo</span><span>/features</span><span>/compare</span><span>/trial</span><span>/docs</span>
              </div>
            </div>

            <div className="col-span-3 bg-[#161A1A] border border-[#343A3A] rounded-[18px] p-4">
              <div className="text-[#9DA7A7] text-[11px] font-black uppercase tracking-[0.055em]">AI referral sources</div>
              <div className="mt-[14px] grid gap-[10px]">
                {[
                  ['C', 'ChatGPT', '8,462', '↗ +32%'],
                  ['G', 'Gemini', '1,674', '↗ +18%'],
                  ['P', 'Perplexity', '1,284', '↗ +44%'],
                ].map((s, i) => (
                  <div key={i} className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-[10px] text-[#DDE5E5] text-xs font-extrabold">
                    <span className="w-7 h-7 rounded-[9px] grid place-items-center bg-[#252B2B] text-st-lime border border-white/10 font-black">{s[0]}</span>
                    <span>{s[1]}</span>
                    <strong>{s[2]}</strong>
                    <span className="text-[#18C76E] text-[10px]">{s[3]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute left-[-24px] bottom-[34px] w-[292px] rounded-[24px] p-[18px] bg-white/90 border border-[rgba(31,35,35,.10)] shadow-[0_24px_80px_rgba(31,35,35,.12)] backdrop-blur-lg" style={{ transform: 'rotate(2deg)' }}>
        <strong className="block text-sm tracking-[-0.03em]">Hidden channel found</strong>
        <p className="mt-2 text-[#627070] text-[13px] font-semibold">AI referrals generated 21% of demos this month. Only 4% appeared in GA4 or ad platform reports.</p>
      </div>
    </div>
  )
}

function KpiCard({ label, value, trend }) {
  return (
    <div className="col-span-2 bg-[#161A1A] border border-[#343A3A] rounded-[18px] p-4 min-h-[118px]">
      <div className="text-[#9DA7A7] text-[11px] font-black uppercase tracking-[0.055em]">{label}</div>
      <div className="mt-3 text-[30px] leading-none font-black tracking-[-0.055em]">{value}</div>
      <div className="mt-[10px] text-[#18C76E] text-xs font-black">{trend}</div>
    </div>
  )
}
