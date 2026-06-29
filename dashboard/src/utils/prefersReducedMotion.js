// Shared reduced-motion check. Mirrors the inline pattern already used in
// MetricTile/Reveal so motion primitives gate consistently. SSR-safe.
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
