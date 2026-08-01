export default function ReportBuilderMock() {
  return (
    <div className="relative min-h-[620px]">
      <div className="absolute right-[34px] top-[30px] w-[380px] h-[380px] rounded-full bg-st-lime opacity-[0.28] blur-[42px]" />
      <div className="relative rounded-[34px] p-[18px] bg-[#E9EFEF] border border-[#D7E0E0] shadow-[0_24px_80px_rgba(18,16,12,.12)]">
        <div className="flex items-center justify-between gap-3 mb-[14px]">
          <strong className="px-1 text-sm tracking-[-0.025em]">New attribution dashboard</strong>
          <span className="inline-flex items-center rounded-full bg-st-lime py-2 px-3 text-xs font-black">Pin to dashboard</span>
        </div>
        <div className="grid grid-cols-6 gap-3">
          <Widget bars title="Revenue by source" />
          <Widget list title="AI search leads" />
          <Widget bars title="Conversions by source" />
          <Widget list title="Top landing pages" />
          <Widget bars title="Organic search queries" />
        </div>
      </div>

      <div className="absolute left-[-24px] bottom-[34px] w-[292px] rounded-[24px] p-[18px] bg-white/90 border border-[rgba(18,16,12,.10)] shadow-[0_24px_80px_rgba(18,16,12,.12)] backdrop-blur-lg" style={{ transform: 'rotate(2deg)' }}>
        <strong className="block text-sm tracking-[-0.03em]">Custom dashboards</strong>
        <p className="mt-2 text-[#627070] text-[13px] font-semibold">Build, save, and pin only the reports your team actually needs to make decisions.</p>
      </div>
    </div>
  )
}

function Widget({ bars, list, title }) {
  return (
    <div className="col-span-3 min-h-[150px] p-[18px] rounded-[22px] bg-white border border-[#DDE5E5]">
      <strong className="block text-sm tracking-[-0.035em] mb-[22px]">{title}</strong>
      {bars && (
        <div className="flex items-end gap-[7px] h-16">
          {bars === 1
            ? [42, 85, 58, 72, 49].map((h, i) => (
                <span key={i} className="flex-1 rounded-t-full" style={{ height: `${h}%`, background: 'linear-gradient(180deg, #D2EC2A, #F1FFC8)' }} />
              ))
            : [40, 50, 78].map((h, i) => (
                <span key={i} className="flex-1 rounded-t-full" style={{ height: `${h}%`, background: 'linear-gradient(180deg, #D2EC2A, #F1FFC8)' }} />
              ))}
        </div>
      )}
      {list && (
        <div className="grid gap-[10px]">
          {[92, 78, 84, 62].slice(0, list === 1 ? 4 : 3).map((w, i) => (
            <span key={i} className="block h-3 rounded-full bg-[#EEF3F3]" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
    </div>
  )
}
