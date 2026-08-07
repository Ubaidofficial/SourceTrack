import React, { useState } from 'react';
import { demoData } from '../lib/marketingDemoData';

export default function MarketingInteractiveDemo() {
  const [activeMode, setActiveMode] = useState('SaaS');
  const [activeTabA, setActiveTabA] = useState('sources'); // 'sources', 'ai', 'pages'
  const [activeTabB, setActiveTabB] = useState('country'); // 'country', 'browser', 'device'
  const [selectedRowName, setSelectedRowName] = useState('ChatGPT');
  const [hoveredChartIndex, setHoveredChartIndex] = useState(null);

  const modeData = demoData[activeMode];

  // Sync selected row when mode changes to prevent display mismatch
  const handleModeChange = (mode) => {
    setActiveMode(mode);
    if (mode === 'SaaS') {
      setSelectedRowName('ChatGPT');
      setActiveTabA('sources');
    } else if (mode === 'eCommerce') {
      setSelectedRowName('Meta Ads');
      setActiveTabA('sources');
    } else if (mode === 'LeadGen') {
      setSelectedRowName('Google Ads');
      setActiveTabA('sources');
    } else if (mode === 'Agency') {
      setSelectedRowName('Client A');
      setActiveTabA('sources');
    }
  };

  // Find the selected journey detail
  const journey = modeData.journeys[selectedRowName] || modeData.journeys[Object.keys(modeData.journeys)[0]];

  // Find high and low index for chart
  const maxVisitors = Math.max(...modeData.chartData.map(d => d.visitors));
  const maxRevenue = Math.max(...modeData.chartData.map(d => d.revenue));

  const hoveredDay = hoveredChartIndex !== null ? modeData.chartData[hoveredChartIndex] : modeData.chartData[modeData.chartData.length - 1];

  return (
    <div className="w-full">
      {/* Intro info box positioned above the demo frame */}
      <div className="text-center mb-8">
        <h3 className="text-white text-2xl sm:text-3xl font-black tracking-[-0.04em]">
          See the product before you install it.
        </h3>
        <p className="mt-2 text-[#A79E8C] text-sm sm:text-base max-w-[620px] mx-auto font-medium">
          Explore sample analytics, source attribution, AI traffic, and conversion journeys — no account needed.
        </p>
      </div>

      {/* Browser frame container */}
      <div className="relative rounded-[24px] sm:rounded-[36px] bg-[#12100C] p-[10px] sm:p-[14px] shadow-[0_34px_110px_rgba(27,24,17,.34)] border border-white/20">
        <div className="overflow-hidden rounded-[18px] sm:rounded-[26px] bg-[#12100C] border border-[#302B22]">
          {/* Top Browser Bar */}
          <div className="h-[52px] sm:h-[60px] grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4 px-3 sm:px-[18px] bg-[#1B1811] border-b border-white/10 text-[12px] font-bold text-[#F6F3EB]">
            {/* Mac style dots */}
            <div className="flex gap-[6px] sm:gap-[7px]">
              <span className="w-[8px] h-[8px] sm:w-[10px] sm:h-[10px] rounded-full bg-[#F0563A]" />
              <span className="w-[8px] h-[8px] sm:w-[10px] sm:h-[10px] rounded-full bg-[#FF7A33]" />
              <span className="w-[8px] h-[8px] sm:w-[10px] sm:h-[10px] rounded-full bg-[#D2EC2A]" />
            </div>

            {/* Site Pill Search Bar */}
            <div className="mx-auto w-[160px] sm:w-[280px] bg-[#12100C] border border-white/10 rounded-lg py-1 px-2.5 sm:px-4 text-[11px] font-mono text-[#6E6656] text-center truncate">
              demo.sourcetrack.ai
            </div>

            {/* Live details & copy */}
            <div className="flex items-center gap-3">
              <span className="hidden md:inline text-[11px] text-[#6E6656]">
                Interactive demo · sample data
              </span>
              <span className="inline-flex items-center gap-[5px] sm:gap-[7px] rounded-full py-[4px] px-[8px] bg-[rgba(210,236,42,.12)] text-[#D2EC2A] text-[10px] sm:text-xs font-black">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D2EC2A] animate-pulse" />Sample
              </span>
            </div>
          </div>

          {/* Sub Navigation controls - switcher and date */}
          <div className="p-3 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#12100C] border-b border-white/5">
            {/* Mode Switcher */}
            <nav className="flex items-center bg-[#241F17] border border-white/10 rounded-full p-0.5 self-start" aria-label="Demo scenario selector">
              {[
                ['SaaS', 'SaaS'],
                ['eCommerce', 'eCommerce'],
                ['LeadGen', 'Lead Gen'],
                ['Agency', 'Agency']
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleModeChange(key)}
                  aria-pressed={activeMode === key}
                  className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-extrabold transition-all focus:outline-none focus:ring-2 focus:ring-[#D2EC2A] ${
                    activeMode === key
                      ? 'bg-[#D2EC2A] text-[#12100C] shadow-md'
                      : 'text-[#A79E8C] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            {/* Date Preset Selector */}
            <div className="flex items-center gap-2 text-xs font-bold text-[#A79E8C]">
              <span className="px-3 py-1.5 bg-[#241F17] border border-white/10 rounded-lg text-white">
                Last 30 days
              </span>
            </div>
          </div>

          {/* Metric Cards Row */}
          <div className="p-3 sm:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {modeData.metrics.map((m) => (
              <div
                key={m.id}
                className="bg-[#1B1811] border border-[#302B22] rounded-xl p-3 sm:p-4 min-h-[92px] sm:min-h-[108px] flex flex-col justify-between"
              >
                <div className="text-[#6E6656] text-[10px] sm:text-[11px] font-black uppercase tracking-[0.05em] truncate">
                  {m.label}
                </div>
                <div className="mt-1 text-2xl sm:text-[28px] leading-none font-black text-white tracking-[-0.04em]">
                  {m.value}
                </div>
                {/* Was `m.isLive ? lime : #18C76E`. TWO REASONS that branch is gone, not one:
                    (1) `isLive` is set NOWHERE — it appeared exactly once in the whole marketing
                        tree, here, at the point of use. `m.isLive` was always undefined, so every
                        metric already rendered the green branch and the lime branch was dead.
                    (2) design.md:439 — "Success is lime, not green… there must be no separate
                        success green". #18C76E was that banned second success colour.
                    So no live/not-live distinction was lost: there was never one to lose. */}
                <div className="mt-1 text-[10px] sm:text-xs font-bold text-[#D2EC2A]">
                  {m.trend}
                </div>
              </div>
            ))}
          </div>

          {/* Main Chart Area */}
          <div className="px-3 sm:px-5 pb-3 sm:pb-5">
            <div className="bg-[#1B1811] border border-[#302B22] rounded-xl p-4 sm:p-5">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className="text-[#A79E8C] text-[11px] font-black uppercase tracking-[0.05em]">
                    Combined Traffic &amp; {modeData.revenueLabel} Trend
                  </h4>
                  <p className="text-[#6E6656] text-xs mt-0.5">
                    Hover over bars to inspect daily metrics (Sample data)
                  </p>
                </div>
                <div className="text-right text-xs bg-[#241F17] border border-white/5 px-3 py-1.5 rounded-lg text-white font-mono">
                  <span className="text-[#6E6656]">{hoveredDay.date}:</span>{' '}
                  <span className="text-white font-extrabold">{hoveredDay.visitors} visitors</span>{' '}
                  <span className="text-[#6E6656]">·</span>{' '}
                  <span className="text-[#D2EC2A] font-extrabold">${hoveredDay.revenue}</span>
                </div>
              </div>

              {/* Chart Grid */}
              <div className="relative h-[120px] sm:h-[160px] flex items-end gap-2.5 sm:gap-4 pt-6 border-b border-[#302B22]">
                {modeData.chartData.map((d, idx) => {
                  const visitorsHeight = (d.visitors / maxVisitors) * 100;
                  const revenueHeight = (d.revenue / maxRevenue) * 100;
                  const isHovered = hoveredChartIndex === idx;

                  return (
                    <div
                      key={idx}
                      className="flex-1 h-full flex items-end justify-center gap-[3px] sm:gap-[5px] relative group cursor-pointer"
                      onMouseEnter={() => setHoveredChartIndex(idx)}
                      onMouseLeave={() => setHoveredChartIndex(null)}
                    >
                      {/* Visitors Bar */}
                      <div
                        className="w-1.5 sm:w-2.5 rounded-t-sm transition-all duration-100 mid-bar-visitors"
                        style={{ height: `${visitorsHeight}%` }}
                      />
                      {/* Revenue Bar */}
                      <div
                        className={`w-1.5 sm:w-2.5 rounded-t-sm transition-all duration-100 mid-bar-revenue${isHovered ? ' is-hovered' : ''}`}
                        style={{ height: `${revenueHeight}%` }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* X Axis Labels */}
              <div className="flex justify-between mt-2 text-[9px] sm:text-[10px] font-bold text-[#6E6656] uppercase tracking-wider">
                <span>{modeData.chartData[0].date}</span>
                <span>{modeData.chartData[Math.floor(modeData.chartData.length / 2)].date}</span>
                <span>{modeData.chartData[modeData.chartData.length - 1].date}</span>
              </div>
            </div>
          </div>

          {/* Lower Analytics Grid */}
          <div className="px-3 sm:px-5 pb-5 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr_1fr] gap-4">
            {/* Table A: Primary Sources & AI */}
            <div className="bg-[#1B1811] border border-[#302B22] rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[300px]">
              <div>
                {/* Tab selector A */}
                <div className="flex border-b border-[#302B22] pb-2 mb-3" role="tablist">
                  {[
                    ['sources', 'Sources'],
                    ['ai', 'AI Sources'],
                    ['pages', 'Top Pages']
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={activeTabA === key}
                      onClick={() => setActiveTabA(key)}
                      className={`mr-4 pb-2 text-xs font-black transition-all border-b-2 -mb-[10px] focus:outline-none focus:text-white ${
                        activeTabA === key
                          ? 'border-[#D2EC2A] text-white'
                          : 'border-transparent text-[#6E6656] hover:text-[#A79E8C]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-semibold text-white">
                    <thead>
                      <tr className="text-[#6E6656] border-b border-[#302B22] text-[10px] font-black uppercase tracking-wider">
                        <th className="py-2 pr-2">Name</th>
                        <th className="py-2 text-right pr-2">Visitors</th>
                        <th className="py-2 text-right pr-2">Convs</th>
                        <th className="py-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modeData.tables[activeTabA].map((row) => {
                        const isSelected = selectedRowName === row.name;
                        return (
                          <tr
                            key={row.name}
                            className={`group border-b border-[#302B22] last:border-0 hover:bg-white/5 transition-colors ${
                              isSelected ? 'bg-[rgba(210,236,42,.06)] text-[#D2EC2A]' : ''
                            }`}
                          >
                            <td className="py-2 pr-2 font-bold truncate max-w-[120px]">
                              <button
                                onClick={() => setSelectedRowName(row.name)}
                                aria-pressed={isSelected}
                                className={`w-full text-left font-bold focus:outline-none focus:ring-2 focus:ring-[#D2EC2A] rounded px-1 -mx-1 py-1 flex items-center gap-1.5 transition-all ${
                                  isSelected ? 'text-[#D2EC2A]' : 'text-white hover:text-white'
                                }`}
                              >
                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#D2EC2A] shrink-0" />}
                                <span className="truncate">{row.name}</span>
                              </button>
                            </td>
                            <td className="py-2 text-right font-mono pr-2 text-[#F6F3EB] group-hover:text-white">
                              {row.visitors}
                            </td>
                            <td className="py-2 text-right font-mono pr-2 text-[#F6F3EB] group-hover:text-white">
                              {row.conversions} <span className="text-[9px] text-[#6E6656] font-normal">({row.rate})</span>
                            </td>
                            <td className={`py-2 text-right font-extrabold ${isSelected ? 'text-[#D2EC2A]' : 'text-white'}`}>
                              {row.revenue}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-3 text-[10px] text-[#6E6656] italic font-medium">
                * Select a source button to inspect its attribution journey.
              </div>
            </div>

            {/* Table B: Demographics / Devices */}
            <div className="bg-[#1B1811] border border-[#302B22] rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[300px]">
              <div>
                {/* Tab selector B */}
                <div className="flex border-b border-[#302B22] pb-2 mb-3" role="tablist">
                  {[
                    ['country', 'Country'],
                    ['browser', 'Browser'],
                    ['device', 'Device']
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={activeTabB === key}
                      onClick={() => setActiveTabB(key)}
                      className={`mr-4 pb-2 text-xs font-black transition-all border-b-2 -mb-[10px] focus:outline-none focus:text-white ${
                        activeTabB === key
                          ? 'border-[#D2EC2A] text-white'
                          : 'border-transparent text-[#6E6656] hover:text-[#A79E8C]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-semibold text-white">
                    <thead>
                      <tr className="text-[#6E6656] border-b border-[#302B22] text-[10px] font-black uppercase tracking-wider">
                        <th className="py-2 pr-2">Dimension</th>
                        <th className="py-2 text-right pr-2">Visitors</th>
                        <th className="py-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modeData.tables[activeTabB].map((row) => (
                        <tr
                          key={row.name}
                          className="border-b border-[#302B22] last:border-0 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="py-2.5 pr-2 font-bold truncate max-w-[120px] text-white">
                            {row.name}
                          </td>
                          <td className="py-2.5 text-right font-mono pr-2 text-[#F6F3EB]">
                            {row.visitors}
                          </td>
                          <td className="py-2.5 text-right font-extrabold text-[#F6F3EB]">
                            {row.revenue}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-3 text-[10px] text-[#6E6656] font-medium uppercase tracking-wider">
                Demographic split (Sample data)
              </div>
            </div>

            {/* Column 3: Attribution Journey Panel */}
            <div className="bg-[#1B1811] border border-[#302B22] rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[300px]">
              <div>
                <h4 className="text-white text-xs font-black border-b border-[#302B22] pb-2 mb-3">
                  Attribution Journey — <span className="text-[#D2EC2A]">{journey.sourceName}</span>
                </h4>

                <p className="text-[#6E6656] text-[10px] leading-relaxed uppercase tracking-wider font-extrabold">
                  Journey Timeline
                </p>

                {/* Journey Steps Nodes */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
                  {journey.steps.map((step, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && (
                        <span className="text-[#6E6656] text-xs font-extrabold font-mono">
                          →
                        </span>
                      )}
                      <span className="px-2.5 py-1 rounded-full bg-[#241F17] text-[#F6F3EB] text-[10px] font-bold border border-white/10 truncate max-w-[120px]" title={step}>
                        {step}
                      </span>
                    </React.Fragment>
                  ))}
                </div>

                {/* Attribution Explanation Card */}
                {journey.explanation && (
                  <p className="text-[#A79E8C] text-[11px] leading-relaxed mt-3 bg-[#241F17] p-2.5 rounded-lg border border-white/5 font-semibold">
                    {journey.explanation}
                  </p>
                )}

                {/* Recommended Report Template Card */}
                {journey.recommendedTemplate && (
                  <div className="mt-3 p-2.5 rounded-lg bg-[#D2EC2A]/10 border border-[#D2EC2A]/20 text-[10px] font-black text-[#D2EC2A]">
                    <span className="text-[#6E6656] text-[8px] uppercase tracking-wider block mb-0.5 font-bold">Recommended Template</span>
                    {journey.recommendedTemplate}
                  </div>
                )}

                {/* Attribution properties */}
                <div className="grid grid-cols-2 gap-2 mt-4 text-[10px] font-bold">
                  <div className="p-2 rounded-lg bg-[#241F17] border border-white/5 truncate">
                    <div className="text-[#6E6656] text-[8px] uppercase tracking-wider">First Touch</div>
                    <div className="mt-0.5 text-white truncate" title={journey.firstTouch}>{journey.firstTouch}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#241F17] border border-white/5 truncate">
                    <div className="text-[#6E6656] text-[8px] uppercase tracking-wider">Last Touch</div>
                    <div className="mt-0.5 text-white truncate" title={journey.lastTouch}>{journey.lastTouch}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#241F17] border border-white/5 truncate">
                    <div className="text-[#6E6656] text-[8px] uppercase tracking-wider">Attributed Value</div>
                    <div className="mt-0.5 text-[#D2EC2A] truncate">{journey.revenue}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#241F17] border border-white/5 truncate">
                    <div className="text-[#6E6656] text-[8px] uppercase tracking-wider">Attribution Status</div>
                    <div className="mt-0.5 text-[#D2EC2A] truncate" title={journey.status}>{journey.status}</div>
                  </div>
                </div>

                <div className="mt-3 p-2 rounded-lg bg-[#241F17] border border-white/5 text-[10px] font-bold">
                  <div className="flex justify-between items-center border-b border-white/5 pb-1">
                    <span className="text-[#6E6656] text-[8px] uppercase tracking-wider">Stitching Method</span>
                    <span className="text-white font-mono text-[9px]">{journey.stitchingMethod}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 text-[10px]">
                    <span className="text-[#6E6656] text-[8px] uppercase tracking-wider">Conversion Type</span>
                    <span className="text-white text-[9px]">{journey.conversionType}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#302B22] text-[10px] text-[#6E6656] flex items-center justify-between">
                <span>Stitched visitor journey</span>
                <span className="px-1.5 py-0.5 bg-[#302B22] text-[#D2EC2A] text-[9px] rounded font-black font-mono">STITCHED</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA actions below the demo box */}
      <div className="mt-8 text-center flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
        <a
          href="https://app.sourcetrack.ai/signup"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto inline-flex items-center justify-center min-h-[50px] px-8 rounded-full bg-[#D2EC2A] text-[#12100C] text-[15px] font-extrabold tracking-[-0.02em] shadow-[0_12px_44px_rgba(210,236,42,0.18)] hover:bg-[#BCD41C] transition-all hover:-translate-y-px"
        >
          Start tracking free
        </a>
        <a
          href="/pricing"
          className="w-full sm:w-auto inline-flex items-center justify-center min-h-[50px] px-8 rounded-full border border-white/10 bg-[#12100C] text-white text-[15px] font-extrabold tracking-[-0.02em] hover:border-white/25 transition-all hover:-translate-y-px"
        >
          See pricing
        </a>
      </div>
    </div>
  );
}
