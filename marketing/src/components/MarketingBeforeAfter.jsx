import React, { useState } from 'react'
import { comparisonDemoData } from '../lib/marketingDemoData'

// title / subtitle / customData are OPTIONAL — each falls back to the active data set
// just below. They were destructured bare, so tsc inferred them as required and flagged
// all three call sites (/compare/ga4, /solutions/saas, /solutions/ecommerce), none of
// which pass them. The explicit `= undefined` changes nothing at runtime — a missing key
// already destructures to undefined — it just states the contract the code already has,
// matching mode / showToggle / className, which were declared optional all along.
export default function MarketingBeforeAfter({
  mode = 'default',
  title = undefined,
  subtitle = undefined,
  customData = undefined,
  showToggle = true,
  className = ''
}) {
  const [selectedMode, setSelectedMode] = useState(mode)

  const activeDataSet = customData || comparisonDemoData[selectedMode] || comparisonDemoData.default
  const displayTitle = title || activeDataSet.title
  const displaySubtitle = subtitle || activeDataSet.subtitle

  const { before, after } = activeDataSet

  return (
    <div className={`w-full ${className}`}>
      {/* Header section */}
      {/* `text-st-black` was a DEAD class here, the same species of bug as the inert
          className attributes: st-* are dashboard-only tokens and are not defined in the
          marketing Tailwind theme, so the utility produced no colour at all. It went
          unnoticed because every one of this component's three call sites sat in a
          section whose dark background was itself inert — on the light page that showed
          instead, the badge fell through to near-black and looked deliberate. With those
          sections now actually dark, the badge inherited `text-white` onto its own light
          pill (1.16:1) and the heading fell to the base h1-h6 `text-text` rule (1.07:1).
          Both replaced with explicit colours. All three call sites are dark sections, so
          light-on-dark is the whole contract, not a guess. */}
      <div className="text-center max-w-[760px] mx-auto mb-10 sm:mb-14">
        <span className="inline-block px-3 py-1 text-xs font-black uppercase tracking-widest text-[#0F1012] bg-[#E8F0F0] rounded-full mb-3 border border-[#E5E7EB]">
          Attribution comparison
        </span>
        <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-[-0.05em] leading-[1.05]">
          {displayTitle}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-[#586464] font-medium leading-relaxed">
          {displaySubtitle}
        </p>

        {/* Mode selector pills (if enabled and no custom data passed) */}
        {showToggle && !customData && (
          <div className="inline-flex p-1 mt-6 rounded-xl bg-[#161719] border border-[#2A2C30] text-xs font-extrabold gap-1">
            <button
              onClick={() => setSelectedMode('default')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedMode === 'default'
                  ? 'bg-[#C8F000] text-[#0F1012] font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              SaaS / B2B Journey
            </button>
            <button
              onClick={() => setSelectedMode('ecommerce')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedMode === 'ecommerce'
                  ? 'bg-[#C8F000] text-[#0F1012] font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              eCommerce / Shopify
            </button>
          </div>
        )}
      </div>

      {/* 2-column Before vs After comparison grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 max-w-[1240px] mx-auto">
        {/* BEFORE CARD */}
        <div className="rounded-2xl bg-[#161719] border border-[#2A2C30] p-6 sm:p-8 flex flex-col justify-between shadow-md">
          <div className="space-y-6">
            {/* Header Badge & Warning */}
            <div className="flex items-center justify-between gap-2 border-b border-[#232527] pb-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black tracking-wide bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                {before.badge}
              </span>
              <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                Unattributed
              </span>
            </div>

            {/* Source & Channel Summary */}
            <div className="bg-[#1C1D20] rounded-xl p-4 sm:p-5 border border-[#2A2C30] space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
                <span>Attributed Source:</span>
                <span className="text-gray-400 font-mono">{before.channel}</span>
              </div>
              <div className="flex items-center gap-3 text-lg font-black text-rose-400 font-mono">
                <span>{before.source}</span>
              </div>
            </div>

            {/* Empty Journey State — Absence vs Presence */}
            <div className="space-y-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-gray-400 block">
                Captured Journey Touchpoints
              </span>
              <div className="rounded-xl border border-dashed border-[#2A2C30] bg-[#1C1D20] p-6 text-center space-y-2">
                <div className="text-2xl">🚫</div>
                <strong className="block text-xs font-extrabold text-gray-300">
                  No touchpoints captured
                </strong>
                <p className="text-[11px] text-gray-400 max-w-[280px] mx-auto leading-relaxed">
                  {before.emptyMessage || 'Referrer missing or stripped. Zero touchpoints available before conversion.'}
                </p>
              </div>
            </div>

            {/* UTM Metadata Grid */}
            <div className="grid grid-cols-3 gap-2 text-center bg-[#1C1D20] p-3 rounded-xl border border-[#2A2C30]">
              <div>
                <span className="block text-[10px] font-bold uppercase text-gray-400">utm_source</span>
                <span className="text-xs font-mono text-gray-400">{before.utmSource}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-gray-400">utm_medium</span>
                <span className="text-xs font-mono text-gray-400">{before.utmMedium}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-gray-400">utm_campaign</span>
                <span className="text-xs font-mono text-gray-400">{before.utmCampaign}</span>
              </div>
            </div>
          </div>

          {/* Outcome Footer */}
          <div className="mt-8 pt-4 border-t border-[#232527] flex items-center justify-between gap-4">
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Status</span>
              <span className="text-xs font-extrabold text-rose-400">{before.attributionStatus}</span>
            </div>
            <div className="text-right">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Order Value</span>
              <span className="text-sm font-black text-white font-mono">{before.customerRevenue}</span>
            </div>
          </div>
        </div>

        {/* AFTER CARD */}
        <div className="rounded-2xl bg-[#161719] border border-[#C8F000]/40 p-6 sm:p-8 flex flex-col justify-between shadow-md">
          <div className="space-y-6">
            {/* Header Badge & Signal Marker */}
            <div className="flex items-center justify-between gap-2 border-b border-[#232527] pb-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black tracking-wide bg-[#C8F000]/10 text-[#C8F000] border border-[#C8F000]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C8F000]"></span>
                {after.badge}
              </span>
              <span className="text-[11px] font-mono text-[#C8F000] uppercase tracking-wider">
                Stitched
              </span>
            </div>

            {/* Source & Channel Summary */}
            <div className="bg-[#1C1D20] rounded-xl p-4 sm:p-5 border border-[#2A2C30] space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
                <span>Attributed Source:</span>
                <span className="text-[#C8F000] font-bold">{after.channel}</span>
              </div>
              <div className="flex items-center gap-3 text-lg font-black text-[#C8F000] font-mono">
                <span>{after.source}</span>
              </div>
            </div>

            {/* Full Touchpoint Journey Chain */}
            <div className="space-y-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-gray-400 block">
                Full Touchpoint Journey Chain
              </span>
              <div className="space-y-2">
                {after.touchpoints.map((tp, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-[#1C1D20] p-3 rounded-xl border border-[#2A2C30]">
                    <span className="text-base">{tp.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span>{tp.name}</span>
                        <span className="text-[10px] text-[#C8F000] font-mono">{tp.time}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">{tp.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* UTM Metadata Grid */}
            <div className="grid grid-cols-3 gap-2 text-center bg-[#1C1D20] p-3 rounded-xl border border-[#2A2C30]">
              <div>
                <span className="block text-[10px] font-bold uppercase text-gray-400">utm_source</span>
                <span className="text-xs font-mono font-bold text-[#C8F000]">{after.utmSource}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-gray-400">utm_medium</span>
                <span className="text-xs font-mono font-bold text-[#C8F000]">{after.utmMedium}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-gray-400">utm_campaign</span>
                <span className="text-xs font-mono font-bold text-white truncate block">{after.utmCampaign}</span>
              </div>
            </div>
          </div>

          {/* Outcome Footer */}
          <div className="mt-8 pt-4 border-t border-[#232527] flex items-center justify-between gap-4">
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Status</span>
              <span className="text-xs font-extrabold text-[#C8F000]">{after.attributionStatus}</span>
            </div>
            <div className="text-right">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Order Value</span>
              <span className="text-sm font-black text-[#C8F000] font-mono">{after.customerRevenue}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
