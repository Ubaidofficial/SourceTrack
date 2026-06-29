import { useState } from 'react'
import { prefersReducedMotion } from '../utils/prefersReducedMotion'

// Live "online" indicator — a green dot with a pulsing halo. This is the ONE
// intentionally-looping element. The pulse (animate-ping, core Tailwind, no dep)
// is disabled under prefers-reduced-motion; the static dot always renders.
//
// Ships as a primitive; not adopted anywhere yet.
export default function LiveDot({ className = '', label = 'Live' }) {
  const [reduced] = useState(prefersReducedMotion)

  return (
    <span
      className={`relative inline-flex h-2 w-2 ${className}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {!reduced && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-st-green opacity-75 animate-ping" />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full bg-st-green" />
    </span>
  )
}
