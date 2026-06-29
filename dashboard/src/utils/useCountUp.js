import { useState, useEffect, useRef } from 'react'
import { prefersReducedMotion } from './prefersReducedMotion'

// Shared KPI count-up. rAF-driven, ease-out cubic, fires once per target change
// (mount/refresh) — never loops. Honors prefers-reduced-motion (snaps to the
// final value instantly). Returns the live interpolated number, or null when
// target is null. Extracted from MetricTile so any KPI can reuse it.
export function useCountUp(target, duration = 400) {
  const [current, setCurrent] = useState(null)
  const rafRef = useRef(null)
  const startRef = useRef(null)
  const fromRef = useRef(0)

  useEffect(() => {
    if (target == null) { setCurrent(null); return }
    const to = Number(target)
    const from = fromRef.current ?? 0
    if (from === to) { setCurrent(to); return }

    if (prefersReducedMotion()) {
      setCurrent(to)
      fromRef.current = to
      return
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = null

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts
      const progress = Math.min((ts - startRef.current) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setCurrent(from + (to - from) * eased)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        fromRef.current = to
        setCurrent(to)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return current
}

export default useCountUp
