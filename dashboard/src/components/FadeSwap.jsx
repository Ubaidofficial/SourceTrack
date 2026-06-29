import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../utils/prefersReducedMotion'

// Reusable state-change transition: when `keyProp` changes, the incoming content
// does a 150ms crossfade + 4px slide-up. Reduced-motion → opacity-only (no
// transform). CSS transitions only, no dependency. Transform-based, so no layout
// shift. The initial mount does NOT animate (avoids decorative entrance motion).
//
// Usage: <FadeSwap keyProp={activeTab}>{tabContent}</FadeSwap>
// Not wired into any tabs yet — ships as a primitive for opt-in adoption.
export default function FadeSwap({ keyProp, children, className = '', duration = 150 }) {
  const [reduced] = useState(prefersReducedMotion)
  const [entered, setEntered] = useState(true)
  const mounted = useRef(false)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return } // skip initial mount
    setEntered(false)
    // Double rAF so the browser paints the out-state before transitioning in.
    rafRef.current = requestAnimationFrame(() =>
      requestAnimationFrame(() => setEntered(true))
    )
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [keyProp])

  const style = reduced
    ? { opacity: entered ? 1 : 0, transition: `opacity ${duration}ms ease` }
    : {
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0)' : 'translateY(4px)',
        transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
        willChange: 'opacity, transform'
      }

  return (
    <div className={className} style={style}>
      {children}
    </div>
  )
}
