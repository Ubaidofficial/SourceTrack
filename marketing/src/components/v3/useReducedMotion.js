import { useEffect, useState } from 'react'

// Shared reduced-motion hook for the v3 hero islands.
//
// ⚠️ CSS ALONE IS NOT ENOUGH HERE. A `@media (prefers-reduced-motion: reduce)` rule can
// stop a CSS animation, but these three islands animate by MUTATING STATE on a timer —
// a setInterval that swaps the ticker slot or moves a session between pages. No CSS rule
// reaches that. Without this hook the motion continues for a user who asked for none; it
// just stops being styled.
//
// Defaults to REDUCED (true) so the very first render before the effect runs is the calm
// one. Getting that backwards would flash motion at exactly the user who opted out.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}
