import React, { useCallback, useEffect, useRef, useState } from 'react'
import { comparisonDemoData } from '../lib/marketingDemoData'
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion'

// How long each vertical stays on screen before the next one. Long on purpose: the card
// is dense (a full touchpoint chain plus three UTM fields), and anything under ~5s turns
// reading into chasing.
const CYCLE_MS = 7000
// Cross-fade on swap. Short enough not to read as an effect, long enough that the two
// data sets do not appear to teleport into each other.
const FADE_MS = 160

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
  const prefersReducedMotion = usePrefersReducedMotion()

  // The auto-cycle exists to show that the SAME comparison holds for a second vertical
  // without the visitor having to discover the pills. It is therefore only meaningful
  // where the pills are actually offered: /compare/ga4. The two /solutions pages pass
  // showToggle={false} and a fixed mode BECAUSE that page is about one vertical —
  // rotating it there would argue against the page it sits on.
  const canCycle = showToggle && !customData

  const [pinned, setPinned] = useState(false)   // visitor picked a side; stop for good
  const [hovered, setHovered] = useState(false) // pause while being read
  const [onScreen, setOnScreen] = useState(false)
  const [swapping, setSwapping] = useState(false)

  const regionRef = useRef(null)
  const fadeTimer = useRef(null)

  // Swap with a cross-fade, or instantly when the visitor has asked for reduced motion.
  // Manual clicks go through here too, so a click and an auto-advance cannot disagree
  // about what is on screen mid-transition.
  const swapTo = useCallback((next) => {
    if (next === selectedMode) return
    if (prefersReducedMotion) {
      setSelectedMode(next)
      return
    }
    setSwapping(true)
    window.clearTimeout(fadeTimer.current)
    fadeTimer.current = window.setTimeout(() => {
      setSelectedMode(next)
      setSwapping(false)
    }, FADE_MS)
  }, [selectedMode, prefersReducedMotion])

  useEffect(() => () => window.clearTimeout(fadeTimer.current), [])

  // Only run while the section is actually visible. An interval firing against a card
  // three screens away is work nobody sees, and it would mean the visitor arrives to a
  // vertical chosen by how long they took to scroll.
  useEffect(() => {
    const node = regionRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.35 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // prefers-reduced-motion is a hard stop, not a slower cycle: WCAG 2.2.2 wants moving
  // content stoppable, and the pills + hover/focus pause are the other two escape hatches.
  const cycling = canCycle && onScreen && !pinned && !hovered && !prefersReducedMotion

  useEffect(() => {
    if (!cycling) return undefined
    const id = window.setInterval(() => {
      swapTo(selectedMode === 'default' ? 'ecommerce' : 'default')
    }, CYCLE_MS)
    return () => window.clearInterval(id)
  }, [cycling, selectedMode, swapTo])

  const pickMode = useCallback((next) => {
    setPinned(true)
    swapTo(next)
  }, [swapTo])

  const activeDataSet = customData || comparisonDemoData[selectedMode] || comparisonDemoData.default
  const displayTitle = title || activeDataSet.title
  const displaySubtitle = subtitle || activeDataSet.subtitle

  const { before, after } = activeDataSet

  // Applied to the two blocks that actually change (heading copy and the card grid) —
  // never to the pills, which are controls and must not blink while you aim at them.
  const fadeStyle = prefersReducedMotion
    ? undefined
    : { opacity: swapping ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }

  return (
    <div
      ref={regionRef}
      className={`w-full ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
    >
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
        <span className="inline-block px-3 py-1 text-xs font-black uppercase tracking-widest text-[#1F2323] bg-[#FAFAF7] rounded-full mb-3 border border-[#DDE4E4]">
          Attribution comparison
        </span>
        <div style={fadeStyle}>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-[-0.05em] leading-[1.05]">
            {displayTitle}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#7D8090] font-medium leading-relaxed">
            {displaySubtitle}
          </p>
        </div>

        {/* Mode selector pills (if enabled and no custom data passed) */}
        {showToggle && !customData && (
          <div className="inline-flex p-1 mt-6 rounded-xl bg-[#1F2323] border border-[#303636] text-xs font-extrabold gap-1">
            <button
              type="button"
              aria-pressed={selectedMode === 'default'}
              onClick={() => pickMode('default')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedMode === 'default'
                  ? 'bg-[#CCF03F] text-[#1F2323] font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              SaaS / B2B Journey
            </button>
            <button
              type="button"
              aria-pressed={selectedMode === 'ecommerce'}
              onClick={() => pickMode('ecommerce')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedMode === 'ecommerce'
                  ? 'bg-[#CCF03F] text-[#1F2323] font-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              eCommerce / Shopify
            </button>
          </div>
        )}
      </div>

      {/* 2-column Before vs After comparison grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 max-w-[1240px] mx-auto" style={fadeStyle}>
        {/* BEFORE CARD */}
        <div className="rounded-2xl bg-[#1F2323] border border-[#303636] p-6 sm:p-8 flex flex-col justify-between shadow-md">
          <div className="space-y-6">
            {/* Header Badge & Warning */}
            <div className="flex items-center justify-between gap-2 border-b border-[#282C2C] pb-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black tracking-wide bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                {before.badge}
              </span>
              <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                Unattributed
              </span>
            </div>

            {/* Source & Channel Summary */}
            <div className="bg-[#1B1F1F] rounded-xl p-4 sm:p-5 border border-[#303636] space-y-2">
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
              <div className="rounded-xl border border-dashed border-[#303636] bg-[#1B1F1F] p-6 text-center space-y-2">
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
            <div className="grid grid-cols-3 gap-2 text-center bg-[#1B1F1F] p-3 rounded-xl border border-[#303636]">
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
          <div className="mt-8 pt-4 border-t border-[#282C2C] flex items-center justify-between gap-4">
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
        <div className="rounded-2xl bg-[#1F2323] border border-[#CCF03F]/40 p-6 sm:p-8 flex flex-col justify-between shadow-md">
          <div className="space-y-6">
            {/* Header Badge & Signal Marker */}
            <div className="flex items-center justify-between gap-2 border-b border-[#282C2C] pb-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black tracking-wide bg-[#CCF03F]/10 text-[#CCF03F] border border-[#CCF03F]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#CCF03F]"></span>
                {after.badge}
              </span>
              <span className="text-[11px] font-mono text-[#CCF03F] uppercase tracking-wider">
                Stitched
              </span>
            </div>

            {/* Source & Channel Summary */}
            <div className="bg-[#1B1F1F] rounded-xl p-4 sm:p-5 border border-[#303636] space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
                <span>Attributed Source:</span>
                <span className="text-[#CCF03F] font-bold">{after.channel}</span>
              </div>
              <div className="flex items-center gap-3 text-lg font-black text-[#CCF03F] font-mono">
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
                  <div key={idx} className="flex items-center gap-3 bg-[#1B1F1F] p-3 rounded-xl border border-[#303636]">
                    <span className="text-base">{tp.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span>{tp.name}</span>
                        <span className="text-[10px] text-[#CCF03F] font-mono">{tp.time}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">{tp.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* UTM Metadata Grid */}
            <div className="grid grid-cols-3 gap-2 text-center bg-[#1B1F1F] p-3 rounded-xl border border-[#303636]">
              <div>
                <span className="block text-[10px] font-bold uppercase text-gray-400">utm_source</span>
                <span className="text-xs font-mono font-bold text-[#CCF03F]">{after.utmSource}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-gray-400">utm_medium</span>
                <span className="text-xs font-mono font-bold text-[#CCF03F]">{after.utmMedium}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-gray-400">utm_campaign</span>
                <span className="text-xs font-mono font-bold text-white truncate block">{after.utmCampaign}</span>
              </div>
            </div>
          </div>

          {/* Outcome Footer */}
          <div className="mt-8 pt-4 border-t border-[#282C2C] flex items-center justify-between gap-4">
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Status</span>
              <span className="text-xs font-extrabold text-[#CCF03F]">{after.attributionStatus}</span>
            </div>
            <div className="text-right">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Order Value</span>
              <span className="text-sm font-black text-[#CCF03F] font-mono">{after.customerRevenue}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
