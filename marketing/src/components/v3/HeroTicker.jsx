import { useEffect, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.js'

// Hero revenue ticker — the handoff's `hero-ticker` mount, recreated.
//
// Rotates one "revenue credited to <channel>" line. Fixtures are local (the handoff reads
// window.DEMO); §29.8's single page-level disclosure in Footer.astro covers them, so this
// carries no badge of its own.
//
// REDUCED MOTION: the interval never starts. A static first row renders instead — the
// information is still there, it just stops moving. That is the honest reduction: hiding
// the component would remove content, not motion.
const ITEMS = [
  ['ChatGPT', 1180],
  ['Google Ads', 7080],
  ['Claude', 410],
  ['Organic search', 5410],
  ['Gemini', 520],
  ['LinkedIn Ads', 1040],
  ['Perplexity', 250],
  ['Copilot', 120],
]

export default function HeroTicker() {
  const reduced = useReducedMotion()
  const [i, setI] = useState(0)

  useEffect(() => {
    if (reduced) return
    const id = setInterval(() => setI((x) => (x + 1) % ITEMS.length), 2200)
    return () => clearInterval(id)
  }, [reduced])

  const [name, rev] = ITEMS[i]
  return (
    <div class="v3-ticker">
      <span class="v3-ticker-dot" aria-hidden="true" />
      <span class="v3-ticker-lead">Revenue credited to</span>
      <span class="v3-ticker-slot" key={i}>
        <span class="v3-ticker-name">{name}</span>
        <span class="v3-ticker-amt">${rev.toLocaleString()}</span>
      </span>
    </div>
  )
}
