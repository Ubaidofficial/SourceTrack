import { useState, useEffect, useRef } from 'react'

// Shared, calm scroll-reveal primitive for the marketing site.
// - IntersectionObserver drives a one-shot fade + ≤8px translateY.
// - Respects prefers-reduced-motion: when set, opacity-only (no transform),
//   mirroring the MetricTile reduced-motion pattern.
// - Fails open: if IntersectionObserver is unavailable, content shows immediately.
// CSS transitions only — no animation library, no parallax/scroll-jacking.

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function useInView(threshold = 0.12) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          obs.disconnect()
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])

  return [ref, inView]
}

export default function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const [ref, inView] = useInView()
  const [reduced] = useState(prefersReducedMotion)

  const style = reduced
    ? {
        opacity: inView ? 1 : 0,
        transition: `opacity 0.5s ease ${delay}ms`,
      }
    : {
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity 0.55s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        willChange: 'opacity, transform',
      }

  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  )
}
