// SourceTrack logo system — inline SVG components.
//
// Mark: three small agent dots in a column, one large lime source disc to their right, on a
// rounded square. Meaning: three AI assistants, ONE earned the revenue. Four elements.
//
// ⚠️ DO NOT add a fourth agent dot, and do not add a glow behind the source disc. The count is
// the meaning — a fourth dot says "four assistants", and a glow reads as the lime background
// wash that §2.6's accent-density ceiling exists to prevent.
//
// This replaces the previous two-disc mark, which in turn replaced a five-to-six element ring/
// arc/cursor drawing. Both earlier marks are gone; do not reinstate either.
//
// ── COLOURS, and why these exact values ─────────────────────────────────────────────────────
//   square      #12100C light · #1B1811 dark   (--color-bg / --color-surface, §3.2 / §3.3)
//   agent dots  #4A4634 both modes
//   source disc #D2EC2A both modes             (--color-accent, §3.1)
//
// The source disc is `#D2EC2A`, NOT `#C8F000`. §3.1:324 is the accent, and §3.8:494 lists
// `#C8F000` as superseded and forbidden — it was the pre-v1.3 lime, migrated away at v1.3
// (design.md :3773). A mark built on `#C8F000` would ship a §3.8-banned colour.
//
// The dark square is `#1B1811` (§3.3 `--color-surface`), NOT a cool `#1C1D20`. §3.8:496 bans
// cool greys "anywhere", and #567/#569 were two merged PRs mapping cool neutrals onto the warm
// ramp — a cool square would reintroduce exactly what they removed.
//
// ── WHY THE DARK-MODE BORDER RECT IS GONE ───────────────────────────────────────────────────
// The previous mark's square was `#12100C`, which is ALSO `--color-bg` in dark mode, so on a
// dark surface the square vanished and the mark read as floating discs. A `hidden dark:block`
// stroked rect was used to hold the silhouette. Giving the square its own surface token
// (`#1B1811`, distinct from `--color-bg` `#12100C`) removes the cause, so the hack is deleted
// rather than carried forward. Nothing now depends on a Tailwind class to keep its shape.
//
// The theme swap is two mutually exclusive rects (`dark:hidden` / `hidden dark:block`) rather
// than a CSS variable, because the FAVICON EXPORTS RENDER WITH NO THEME AT ALL — browser chrome
// has no dark class to respond to. `forExport` collapses to the light square only, which is what
// keeps LogoIcon byte-identical to the committed favicon.svg files.

const INK = '#12100C'          // --color-bg, light
const SURFACE_DARK = '#1B1811' // --color-surface, dark (§3.3)
const AGENT = '#4A4634'        // agent dots, both modes — see note below
const LIME = '#D2EC2A'         // --color-accent (§3.1)

// AGENT is one value for both modes deliberately. No §3.3 token sits at the light mark's
// contrast step: #4A4634 on #12100C is 2.006:1, while --color-border #302B22 lands at 1.26
// (too faint to read) and --color-text-faint #6E6656 at 3.12 (too strong). Reusing #4A4634
// gives 1.87 on #1B1811 — a 0.136 drift from the light reference, closer than any token —
// and it is warm, so it does not reintroduce the cool neutrals #567/#569 removed. The source
// disc already works this way (#D2EC2A in both modes), so the dots now match it.

// Geometry in an 80-unit box, shared by every export so it cannot drift between them again:
// the two favicon.svg files had already diverged from each other — r=24 vs r=20, different arc
// and cursor paths — from having been traced separately on different occasions.
const SQUARE = { x: 4, y: 4, width: 72, height: 72, rx: 18 }
const AGENT_DOTS = [{ cx: 21, cy: 24 }, { cx: 21, cy: 41 }, { cx: 21, cy: 58 }]
const AGENT_R = 5.5
const SOURCE_DOT = { cx: 55, cy: 41, r: 13 }

// `forExport` — emit the light square ONLY, with no theme-conditional class. Used by LogoIcon,
// the artwork the favicon SVGs are generated from and asserted against.
function MarkArtwork({ forExport = false }) {
  return (
    <>
      {forExport ? (
        <rect {...SQUARE} fill={INK} />
      ) : (
        <>
          <rect {...SQUARE} fill={INK} className="dark:hidden" />
          <rect {...SQUARE} fill={SURFACE_DARK} className="hidden dark:block" />
        </>
      )}
      {AGENT_DOTS.map((d) => (
        <circle key={`${d.cx}-${d.cy}`} cx={d.cx} cy={d.cy} r={AGENT_R} fill={AGENT} />
      ))}
      <circle cx={SOURCE_DOT.cx} cy={SOURCE_DOT.cy} r={SOURCE_DOT.r} fill={LIME} />
    </>
  )
}

// ── Core mark (no text) — auth pages, small spots ────────────────────────────
export function LogoMark({ className = 'w-9 h-9' }) {
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <MarkArtwork />
    </svg>
  )
}

// ── Full logo — mark + "SourceTrack" wordmark (default dark on light) ────────
// scale(0.6) maps the shared 80-unit artwork onto the 48px lockup height, so the mark here is
// the same geometry as LogoMark rather than a second hand-drawn copy of it.
export function LogoFull({ className = 'h-9 w-auto' }) {
  return (
    <svg className={className} viewBox="0 0 228 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="scale(0.6)">
        <MarkArtwork />
      </g>
      <text x="56" y="32" fontFamily="'Switzer', 'Inter', system-ui, sans-serif" fontSize="24" fontWeight="900" fill={INK} letterSpacing="-0.06em">
        SourceTrack
      </text>
    </svg>
  )
}

// ── Full logo (light on dark) — for dark backgrounds ────────────────────────
// Kept, not retired: five files import it, and some of those surfaces (MarketingFooter,
// SolutionPage) are dark regardless of the app theme, so collapsing this into LogoFull via
// `currentColor` would resolve wrong on exactly those. Now that the mark is a self-contained
// ink square, the ONLY difference from LogoFull is the wordmark fill — the mark no longer
// differs at all, where previously the ring and cursor were re-coloured too.
export function LogoFullDark({ className = 'h-9 w-auto' }) {
  return (
    <svg className={className} viewBox="0 0 228 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="scale(0.6)">
        <MarkArtwork />
      </g>
      <text x="56" y="32" fontFamily="'Switzer', 'Inter', system-ui, sans-serif" fontSize="24" fontWeight="900" fill="#FFFFFF" letterSpacing="-0.06em">
        SourceTrack
      </text>
    </svg>
  )
}

// ── App icon — the canonical artwork the favicon sets are generated from ─────
// No dark-mode border: see the note at the top of this file.
export function LogoIcon({ className = 'w-12 h-12' }) {
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <MarkArtwork forExport />
    </svg>
  )
}
