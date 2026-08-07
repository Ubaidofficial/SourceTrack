import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.js'

// Live visitor feed — the handoff's `live` mount, recreated.
//
// ⚠️ WHAT THIS DELIBERATELY DOES NOT DO. The tick moves a session to a different page and
// advances its timer. It NEVER invents a conversion, a lead or a revenue figure — the
// handoff's own live-visitors.jsx carries that constraint in a comment and honours it
// (verified: zero conversion/revenue references in the file). Keeping it matters, because
// a feed that spawned conversions on a timer would be manufacturing outcomes on screen,
// which is §6's "no fake predictions" in motion rather than prose.
//
// "No cookie set · anonymous ids" is a TRUE claim, not decoration — the cookieless build
// is the default and stores nothing (§6, tracker.cookieless.js).
//
// REDUCED MOTION: the interval never starts; the seeded rows render once and stay put. The
// content is unchanged, only the movement stops.
const SEED = [
  { id: 'a4f2', flag: '🇬🇧', alias: 'Visitor 4f2', dev: 'desktop', path: '/pricing',        secs: 3,  label: 'ChatGPT' },
  { id: 'b8c1', flag: '🇺🇸', alias: 'Visitor 8c1', dev: 'mobile',  path: '/product',        secs: 11, label: 'Google Ads' },
  { id: 'c3d9', flag: '🇩🇪', alias: 'Visitor 3d9', dev: 'desktop', path: '/compare/ga4',    secs: 18, label: 'Organic' },
  { id: 'd7e4', flag: '🇨🇦', alias: 'Visitor 7e4', dev: 'desktop', path: '/attribution',    secs: 24, label: 'LinkedIn' },
  { id: 'e1a8', flag: '🇦🇺', alias: 'Visitor 1a8', dev: 'mobile',  path: '/',               secs: 31, label: 'Direct' },
  { id: 'f5b2', flag: '🇮🇪', alias: 'Visitor 5b2', dev: 'desktop', path: '/report-builder', secs: 42, label: 'Perplexity' },
]
const PATHS = ['/', '/pricing', '/product', '/attribution', '/compare/ga4', '/report-builder', '/use-cases-saas']

function ago(s) { return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m` }

export default function LiveVisitors() {
  const reduced = useReducedMotion()
  const [list, setList] = useState(SEED)
  const [pulse, setPulse] = useState([])
  const tick = useRef(0)

  useEffect(() => {
    if (reduced) return
    const t = setInterval(() => {
      tick.current += 1
      setList((prev) => {
        const next = prev.map((v) => ({ ...v, secs: v.secs + 2 }))
        const moved = []
        // 2-3 sessions navigate per tick, as in the handoff — enough to read as live
        // without the whole list churning.
        for (let k = 0; k < 2 + (tick.current % 2); k++) {
          const i = (tick.current * 3 + k * 2) % next.length
          const p = PATHS[(tick.current + i + k) % PATHS.length]
          if (p !== next[i].path) { next[i] = { ...next[i], path: p, secs: 1 }; moved.push(next[i].id) }
        }
        if (moved.length) { setPulse(moved); setTimeout(() => setPulse([]), 1000) }
        return next.sort((a, b) => a.secs - b.secs)
      })
    }, 1400)
    return () => clearInterval(t)
  }, [reduced])

  return (
    <div class="v3-lv">
      <div class="v3-lv-head">
        <span class="v3-lv-live"><i aria-hidden="true" /> {list.length} active now</span>
        <span class="v3-lv-note">No cookie set · anonymous ids</span>
      </div>
      <div class="v3-lv-rows">
        {list.map((v) => (
          <div class={`v3-lv-row${pulse.includes(v.id) ? ' is-moved' : ''}`} key={v.id}>
            <span class="v3-lv-flag" aria-hidden="true">{v.flag}</span>
            <span class="v3-lv-who"><b>{v.alias}</b></span>
            <code class="v3-lv-path">{v.path}</code>
            <span class="v3-lv-ago">{ago(v.secs)}</span>
            <span class="v3-lv-src">{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
