// SourceTrack logo system — inline SVG components.
//
// Mark (BRAND_v2.md §1 / design.md v1.3 §3.1, word-for-word): "two lime discs on a warm-ink
// rounded square, large disc upper-right, small disc lower-left". Two elements on a square.
//
// This replaces a mark that was never built to that spec: a circular tracking ring, a journey
// arc, two nodes and a cursor-pointer — five to six elements — and, on the app-icon and both
// favicon sets, with the colours INVERTED (lime square, ink mark) against a spec that calls for
// an ink square carrying lime discs. Both faults are corrected here.
//
// Colours: #12100C warm ink (square), #D2EC2A lime (discs), #302B22 dark-mode border token.
//
// The square is #12100C, which is also the dark-mode body colour — on a dark surface it would
// vanish and the mark would read as two floating discs, a different silhouette than in light
// mode. The `hidden dark:block` border rect holds the shape in dark mode using the existing
// --color-border token. It is dropped from LogoIcon on purpose: LogoIcon is the app-icon
// artwork and must stay byte-identical to the favicon SVGs, which render on browser chrome
// rather than on our own page and so have no theme to respond to.

const INK = '#12100C'
const LIME = '#D2EC2A'

// The mark's artwork in an 80-unit box, shared by every export so the geometry cannot drift
// between them again (the two favicon.svg files had already diverged from each other — r=24 vs
// r=20, different arc and cursor paths — from being traced separately).
function MarkArtwork({ withDarkBorder = true }) {
  return (
    <>
      <rect x="4" y="4" width="72" height="72" rx="18" fill={INK} />
      {withDarkBorder && (
        <rect
          x="5"
          y="5"
          width="70"
          height="70"
          rx="17"
          fill="none"
          stroke="#302B22"
          strokeWidth="2"
          className="hidden dark:block"
        />
      )}
      <circle cx="54" cy="26" r="14" fill={LIME} />
      <circle cx="24" cy="56" r="8" fill={LIME} />
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
      <MarkArtwork withDarkBorder={false} />
    </svg>
  )
}
