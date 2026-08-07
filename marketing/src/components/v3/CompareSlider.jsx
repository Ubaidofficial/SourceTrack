import { useState, useRef } from 'react'
import { useReducedMotion } from './useReducedMotion.js'

// GA4-vs-SourceTrack comparison slider — the handoff's `compare` mount, RECREATED.
// §11 "The GA4 alternative built for revenue, not pageviews" was the last empty section.
//
// ⚠️ TWO OF THE HANDOFF'S FOUR SOURCETRACK TILES WERE REPLACED, NOT PORTED.
// It headlines "AI Search revenue" and "Best conversion rate". Both are in GATED_METRICS
// (dashboard/src/lib/gate-constants.js), which that file calls "the SINGLE source of truth
// for which report shapes the server can actually serve" — a gated metric returns
// gated_dead_store: UNSERVABLE AT ANY TIER, a 422, not plan-gating. The claims guard passed
// all four (KI-111: it matches phrasings, not claims), so this was caught by reading them.
//
// That is worse than the claims already cut. §12 and hero-orbit asserted things that had
// never RUN; these assert things the server actively REFUSES — in a credibility comparison
// against GA4, the worst place on the site to overstate.
//
// Replaced with `conversions` and `leads`, both verified against GATED_METRICS *and*
// ALLOWED_METRICS before building, with a control confirming a known-gated metric still
// reads gated. Four-tile symmetry survives: a two-tile pane against GA4's four would lose
// the comparison on layout while winning it on substance.
//
// GA4-side claims are about GA4's DEFAULT reports and are defensible as written: (direct)/
// (none) is unattributable, organic gives no keyword, revenue needs ecommerce setup, and
// assistant referrers arrive stripped — the last matching our own FAQ copy.
// §35.4 permits naming a competitor in TEXT; no mark is drawn (PR 5 already ships
// MarkRow with "Google Analytics").
//
// §29.8: every figure is illustrative. The page-level disclosure in Footer.astro covers it —
// exactly one per page, so this component carries no badge of its own.

const GA4_ROWS = [
  ['(direct) / (none)', '2,556', 'Unattributable'],
  ['google / organic', '1,432', 'No keyword, no revenue'],
  ['google / cpc', '1,180', 'Clicks only'],
  ['(not set)', '842', 'Lost in redirect'],
  ['chatgpt.com / referral', '—', 'Filed as direct'],
]

const ST_ROWS = [
  ['Google Ads', 48200, 100],
  ['Organic search', 31050, 64],
  ['ChatGPT', 19400, 40],
  ['LinkedIn', 12760, 26],
  ['Direct', 8930, 18],
]

export default function CompareSlider() {
  const reduced = useReducedMotion()
  const [pos, setPos] = useState(50)
  const wrapRef = useRef(null)
  const dragging = useRef(false)

  const setFromClientX = (clientX) => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }

  return (
    <div
      class="v3-cmp"
      ref={wrapRef}
      style={{ '--cmp-pos': `${pos}%` }}
      onPointerDown={(e) => { dragging.current = true; setFromClientX(e.clientX) }}
      onPointerMove={(e) => { if (dragging.current) setFromClientX(e.clientX) }}
      onPointerUp={() => { dragging.current = false }}
      onPointerLeave={() => { dragging.current = false }}
    >
      {/* BEFORE — GA4's default read of the same week */}
      <div class="v3-cmp-pane v3-cmp-pane--before">
        <div class="v3-cmp-bar"><h4>GA4 · default reports</h4><span class="v3-cmp-tag">Sessions view</span></div>
        <div class="v3-cmp-grid">
          <div class="v3-cmp-tile"><span class="l">Sessions</span><span class="v">18,420</span><span class="s">Anonymous — no person attached</span></div>
          <div class="v3-cmp-tile"><span class="l">Conv. rate</span><span class="v">2.14%</span><span class="s">All channels averaged together</span></div>
          <div class="v3-cmp-tile"><span class="l">Top source</span><span class="v v--sm">(direct)</span><span class="s">38% of sessions, cause unknown</span></div>
          <div class="v3-cmp-tile"><span class="l">Revenue by source</span><span class="v v--muted">—</span><span class="s">Not available without ecommerce setup</span></div>
        </div>
        <div class="v3-cmp-list">
          <div class="v3-cmp-lh">Session source / medium</div>
          {GA4_ROWS.map(([a, b, c]) => (
            <div class="v3-cmp-li" key={a}><code>{a}</code><b>{b}</b><em>{c}</em></div>
          ))}
        </div>
      </div>

      {/* AFTER — the same week, credited */}
      <div class="v3-cmp-pane v3-cmp-pane--after">
        <div class="v3-cmp-clip">
          <div class="v3-cmp-bar"><h4>SourceTrack</h4><span class="v3-cmp-tag v3-cmp-tag--on">Revenue view</span></div>
          <div class="v3-cmp-grid">
            <div class="v3-cmp-tile"><span class="l">Attributed revenue</span><span class="v">$120,340</span><span class="s">394 verified conversions</span></div>
            {/* was "AI Search revenue" — ai_revenue is GATED */}
            <div class="v3-cmp-tile"><span class="l">Conversions</span><span class="v">394</span><span class="s">Every one carries its full path</span></div>
            <div class="v3-cmp-tile"><span class="l">Top revenue source</span><span class="v v--sm">Google Ads</span><span class="s">$48,200 on first touch</span></div>
            {/* was "Best conversion rate" — conversion_rate is GATED */}
            <div class="v3-cmp-tile"><span class="l">Leads</span><span class="v">1,208</span><span class="s">Source attached on arrival</span></div>
          </div>
          <div class="v3-cmp-list">
            <div class="v3-cmp-lh">Channel · first touch <span>revenue</span></div>
            {ST_ROWS.map(([name, rev, w]) => (
              <div class="v3-cmp-li v3-cmp-li--rev" key={name}>
                <span class="v3-cmp-ch">{name}</span>
                <span class="v3-cmp-track"><i style={{ width: `${w}%` }} /></span>
                <b>${rev.toLocaleString()}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The handle. `reduced` removes the idle nudge only — dragging always works, because
          reduced motion is about involuntary movement, not about disabling a control. */}
      <div class={`v3-cmp-handle${reduced ? '' : ' v3-cmp-handle--nudge'}`} aria-hidden="true"><i /></div>
      <label class="v3-cmp-sr">
        Comparison position
        <input type="range" min="0" max="100" value={pos} onInput={(e) => setPos(Number(e.target.value))} />
      </label>
    </div>
  )
}
