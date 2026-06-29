import { Info, AlertTriangle } from 'lucide-react'

// Info / warning callout. Standardized on the Tailwind amber/blue scale already
// used for the bg/border/dark-text here (the theme has no dedicated info/warning
// hex token), replacing the two ad-hoc light-text hexes. Emoji swapped for Lucide
// icons so the glyph inherits currentColor and tints with the callout token.
export default function DocsCallout({ type = 'info', children }) {
  const isWarning = type === 'warning' || type === 'warn'
  const Icon = isWarning ? AlertTriangle : Info
  return (
    <div className={`flex gap-3 border rounded-xl px-4 py-3 text-sm my-4 leading-relaxed ${
      isWarning
        ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300'
        : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/40 text-blue-800 dark:text-blue-300'
    }`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
