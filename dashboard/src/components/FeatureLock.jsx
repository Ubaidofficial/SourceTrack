import { Link } from 'react-router-dom'
import { hasFeature, minPlanFor, FEATURE_LABELS } from '../lib/planFeatures'

// Wrap any paid-only feature surface. If the user's plan grants the feature,
// renders {children} unchanged. Otherwise renders a locked overlay with an
// upgrade CTA — children stay in the DOM (blurred) so the user can see what
// they'd be getting.
//
// Usage:
//   <FeatureLock plan={plan} feature="over_reporting_detection">
//     <OverReportingCard ... />
//   </FeatureLock>
export default function FeatureLock({ plan, feature, children, label, compact = false }) {
  if (hasFeature(plan, feature)) return children

  const friendly = label || FEATURE_LABELS[feature] || feature
  const minPlan = minPlanFor(feature)
  const minPlanName = minPlan.charAt(0).toUpperCase() + minPlan.slice(1)

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-40 blur-[2px]" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`rounded-xl border border-white/10 bg-[#111414]/95 backdrop-blur-sm shadow-xl ${compact ? 'p-4 max-w-xs' : 'p-6 max-w-sm'} text-center`}>
          <div className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-2">🔒 {minPlanName} feature</div>
          <p className={`font-bold text-white mb-1 ${compact ? 'text-sm' : 'text-base'}`}>{friendly}</p>
          <p className="text-xs text-white/50 mb-4">Available on the {minPlanName} plan and above.</p>
          <Link
            to="/billing"
            className="inline-block text-xs font-semibold px-4 py-2 rounded-lg bg-st-lime text-black hover:bg-st-lime/90 transition-colors"
          >
            Upgrade to unlock
          </Link>
        </div>
      </div>
    </div>
  )
}

// Compact inline variant — replaces the gated content entirely instead of
// blurring it. Use when the underlying component would error or fetch
// expensive data even when hidden.
export function FeatureLockInline({ plan, feature, label }) {
  if (hasFeature(plan, feature)) return null
  const friendly = label || FEATURE_LABELS[feature] || feature
  const minPlan = minPlanFor(feature)
  const minPlanName = minPlan.charAt(0).toUpperCase() + minPlan.slice(1)
  return (
    <div className="rounded-xl border border-white/10 bg-[#111414] p-6 text-center">
      <div className="text-xs font-semibold text-st-lime uppercase tracking-widest mb-2">🔒 {minPlanName} feature</div>
      <p className="text-base font-bold text-white mb-1">{friendly}</p>
      <p className="text-xs text-white/50 mb-4">Upgrade to unlock {friendly.toLowerCase()} and more.</p>
      <Link to="/billing" className="inline-block text-xs font-semibold px-4 py-2 rounded-lg bg-st-lime text-black hover:bg-st-lime/90">
        Upgrade to unlock
      </Link>
    </div>
  )
}
