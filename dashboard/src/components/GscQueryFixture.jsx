// Marketing fixture — hard-coded sample data only (no API/Supabase/PostHog).
// Mirrors the real Search Console query surface (query / clicks / impressions /
// CTR / avg position). Illustrative only — not real customer data.
const QUERIES = [
  { query: 'revenue attribution software', clicks: '1,284', impr: '18,420', ctr: '6.9%', pos: '3.2' },
  { query: 'ga4 alternative for founders', clicks: '942', impr: '12,060', ctr: '7.8%', pos: '2.7' },
  { query: 'ai referral tracking', clicks: '631', impr: '9,840', ctr: '6.4%', pos: '4.1' },
  { query: 'attribution without a crm', clicks: '418', impr: '7,210', ctr: '5.8%', pos: '5.0' },
  { query: 'track chatgpt traffic', clicks: '372', impr: '6,540', ctr: '5.7%', pos: '4.6' },
  { query: 'cookieless analytics', clicks: '264', impr: '5,180', ctr: '5.1%', pos: '6.3' },
]

export default function GscQueryFixture() {
  return (
    <div className="relative">
      <div className="absolute left-[24px] top-[18px] w-[300px] h-[300px] rounded-full bg-st-lime opacity-[0.18] blur-[48px]" />
      <div className="relative rounded-[28px] bg-[#0D1010] p-3 border border-white/10 shadow-[0_24px_80px_rgba(31,35,35,.22)]">
        <div className="overflow-hidden rounded-[20px] bg-[#121616] border border-[#2D3333]">
          {/* Header */}
          <div className="h-[44px] flex items-center justify-between px-4 bg-[#171B1B] border-b border-white/10">
            <span className="text-[#F5F8F8] text-xs font-bold">Search Console — top queries</span>
            <span className="inline-flex items-center gap-1.5 rounded-full py-1 px-2.5 bg-[#C8F000]/10 text-st-lime text-[10px] font-black uppercase tracking-wider">
              Sample data
            </span>
          </div>

          {/* Table */}
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[#7D8090] border-b border-[#2D3333] text-[10px] font-black uppercase tracking-wider">
                  <th className="py-2 pr-2">Query</th>
                  <th className="py-2 px-2 text-right">Clicks</th>
                  <th className="py-2 px-2 text-right">Impr.</th>
                  <th className="py-2 px-2 text-right">CTR</th>
                  <th className="py-2 pl-2 text-right">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {QUERIES.map((q) => (
                  <tr key={q.query} className="border-b border-[#202525] last:border-0 text-[#DDE5E5] font-bold">
                    <td className="py-2.5 pr-2 font-mono text-[11px] text-white truncate max-w-[180px]">{q.query}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{q.clicks}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-[#9DA7A7]">{q.impr}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{q.ctr}</td>
                    <td className="py-2.5 pl-2 text-right tabular-nums text-st-lime">{q.pos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="px-4 pb-4 text-[#7D8090] text-[10px] font-medium leading-normal">
            Matched to conversions by landing page + date range. Search Console data can lag 2–3 days.
          </p>
        </div>
      </div>
    </div>
  )
}
