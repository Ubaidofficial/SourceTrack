import { AlertTriangle, RefreshCw, Lock } from 'lucide-react'
import { describeQueryError } from '../lib/queryError'

// Honest error state — renders ONLY when isError. NEVER let a failed query fall through to a "no data"
// empty state (design spec §5.1: an error is not a zero; broken != empty). Optional onRetry shows a
// retry button. Drop this in EVERY data surface's render, checked BEFORE the empty/zero branch.
export default function QueryError ({ isError, error, onRetry, className = '' }) {
  if (!isError) return null
  const { title, message, isGated } = describeQueryError(error)
  // A GATED shape is a deliberate server-side deny, not a failure: retrying cannot help, so we
  // suppress the retry affordance and use a calm lock (not an alarm triangle). Offering "Retry" on
  // a permanent gate is its own small lie.
  const Icon = isGated ? Lock : AlertTriangle
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 py-10 text-center ${className}`}>
      <Icon className={`w-6 h-6 ${isGated ? 'text-st-gray dark:text-gray-400' : 'text-amber-500'}`} />
      <p className="text-sm font-medium text-st-black dark:text-dark-primary">{title}</p>
      <p className="text-xs text-st-gray dark:text-gray-400 max-w-md">{message}</p>
      {onRetry && !isGated && (
        <button onClick={onRetry} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-st-black dark:text-dark-primary hover:underline">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      )}
    </div>
  )
}
