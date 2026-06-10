// Tiny shared helper so every "Direct" row in the dashboard explains itself.
// Used by Dashboard.jsx, ReportBuilder.jsx, and Campaigns.jsx top-source rows.

export const DIRECT_TOOLTIP =
  'Direct = SourceTrack did not receive a reliable campaign tag, click ID, or referrer for this visit. Common causes: app-to-app handoffs, HTTPS-to-HTTP downgrades, AI tools stripping the referrer, and bookmarks. Returning visitors whose anonymous ID is preserved are still tied to their earlier known source — not counted as direct.'

export function isDirectLabel(name) {
  if (!name) return true
  const lower = String(name).toLowerCase().trim()
  return lower === 'direct' || lower === 'direct / none' || lower === '(none)' || lower === 'none' || lower === 'unknown'
}

export function DirectInfo({ className = '' }) {
  return (
    <span
      title={DIRECT_TOOLTIP}
      aria-label="What does Direct mean?"
      className={`ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-st-gray/15 dark:bg-white/15 text-st-gray dark:text-gray-300 text-[9px] font-bold cursor-help select-none ${className}`}
    >
      i
    </span>
  )
}
