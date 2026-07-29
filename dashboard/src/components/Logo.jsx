// SourceTrack logo system — inline SVG components.
// Colors: #1F2323 (dark ring/cursor/Source), #C8F000 (lime accent/path),
//         #00AA57 (conversion node/Track), #FFFFFF (reverse)
//
// Concept: circular tracking ring, integrated cursor pointer, subtle journey
// path with 2 nodes (source + conversion), "SourceTrack" wordmark.

// ── Core mark (no text) — used for favicon, app icon, small spots ─────────────
export function LogoMark({ className = 'w-9 h-9' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer tracking ring */}
      <circle cx="32" cy="32" r="28" stroke="#1F2323" strokeWidth="3.5" fill="none" />
      {/* Journey path — arc from source to conversion */}
      <path d="M18 44 Q 32 12 46 24" stroke="#C8F000" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Source node */}
      <circle cx="18" cy="44" r="4.5" fill="#C8F000" />
      {/* Conversion node — green */}
      <circle cx="46" cy="24" r="5" fill="#00AA57" />
      {/* Cursor/pointer — integrated into ring at 45° */}
      <path d="M44 14 L38 6 L34 12 Z" fill="#1F2323" />
    </svg>
  )
}

// ── Full logo — mark + "SourceTrack" wordmark (default dark on light) ────────
export function LogoFull({ className = 'h-9 w-auto' }) {
  return (
    <svg className={className} viewBox="0 0 228 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Mark */}
      <g transform="translate(0, 0)">
        <circle cx="24" cy="24" r="20" stroke="#1F2323" strokeWidth="2.5" fill="none" />
        <path d="M12 32 Q 24 8 36 18" stroke="#C8F000" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="12" cy="32" r="3.5" fill="#C8F000" />
        <circle cx="36" cy="18" r="3.8" fill="#00AA57" />
        <path d="M34 10 L28 2 L26 8 Z" fill="#1F2323" />
      </g>
      {/* Wordmark */}
      <text x="56" y="32" fontFamily="'Switzer', 'Inter', system-ui, sans-serif" fontSize="24" fontWeight="900" fill="#1F2323" letterSpacing="-0.06em">
        SourceTrack
      </text>
    </svg>
  )
}

// ── Full logo (light on dark) — for dark backgrounds ────────────────────────
export function LogoFullDark({ className = 'h-9 w-auto' }) {
  return (
    <svg className={className} viewBox="0 0 228 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(0, 0)">
        <circle cx="24" cy="24" r="20" stroke="#FFFFFF" strokeWidth="2.5" fill="none" />
        <path d="M12 32 Q 24 8 36 18" stroke="#C8F000" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="12" cy="32" r="3.5" fill="#C8F000" />
        <circle cx="36" cy="18" r="3.8" fill="#00AA57" />
        <path d="M34 10 L28 2 L26 8 Z" fill="#FFFFFF" />
      </g>
      <text x="56" y="32" fontFamily="'Switzer', 'Inter', system-ui, sans-serif" fontSize="24" fontWeight="900" fill="#FFFFFF" letterSpacing="-0.06em">
        SourceTrack
      </text>
    </svg>
  )
}

// ── App icon — lime background square, mark reversed for white on lime ───────
export function LogoIcon({ className = 'w-12 h-12' }) {
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Lime app-icon background */}
      <rect x="4" y="4" width="72" height="72" rx="18" fill="#C8F000" />
      {/* Ring */}
      <circle cx="40" cy="40" r="24" stroke="#1F2323" strokeWidth="2.8" fill="none" />
      {/* Journey path */}
      <path d="M22 50 Q 40 14 54 30" stroke="#1F2323" strokeWidth="2.8" strokeLinecap="round" fill="none" />
      {/* Source node */}
      <circle cx="22" cy="50" r="4.5" fill="#1F2323" />
      {/* Conversion node */}
      <circle cx="54" cy="30" r="5" fill="#00AA57" />
      {/* Cursor */}
      <path d="M52 18 L44 8 L40 14 Z" fill="#1F2323" />
    </svg>
  )
}
