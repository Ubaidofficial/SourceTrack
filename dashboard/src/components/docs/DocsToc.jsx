import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

// "On this page" right-rail TOC, auto-built from the rendered page's h2/h3. Doc pages
// are plain JSX (no MDX), so we scan the DOM after render, assign a slug id to any
// heading missing one, and scroll-spy the active section. Hidden below 1200px.
function slugify(text) {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60)
}

export default function DocsToc() {
  const { pathname } = useLocation()
  const [headings, setHeadings] = useState([])
  const [activeId, setActiveId] = useState(null)

  // Re-scan on route change (after content paints).
  useEffect(() => {
    let raf = 0
    const scan = () => {
      const main = document.querySelector('main')
      if (!main) return
      const nodes = Array.from(main.querySelectorAll('h2, h3'))
      const seen = new Set()
      const items = nodes.map((el) => {
        const text = el.textContent?.trim() || ''
        if (!text) return null
        let id = el.id
        if (!id) {
          id = slugify(text) || 'section'
          let unique = id
          let n = 2
          while (seen.has(unique)) { unique = `${id}-${n++}` }
          id = unique
          el.id = id
        }
        seen.add(id)
        el.style.scrollMarginTop = '96px' // clear the sticky marketing header on jump
        return { id, text, level: el.tagName === 'H3' ? 3 : 2 }
      }).filter(Boolean)
      setHeadings(items)
    }
    // Two frames: let the routed page mount + paint before scanning.
    raf = requestAnimationFrame(() => { raf = requestAnimationFrame(scan) })
    return () => cancelAnimationFrame(raf)
  }, [pathname])

  // Scroll-spy: highlight the heading nearest the top of the viewport.
  useEffect(() => {
    if (headings.length === 0) return
    const els = headings.map((h) => document.getElementById(h.id)).filter(Boolean)
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-88px 0px -70% 0px', threshold: 0 }
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [headings])

  const onJump = (e, id) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    setActiveId(id)
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
  }

  if (headings.length < 2) return null

  return (
    <aside className="hidden min-[1200px]:block w-56 shrink-0">
      <div className="sticky top-[108px] max-h-[calc(100vh-140px)] overflow-y-auto">
        <h4 className="px-3 text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
          On this page
        </h4>
        <nav aria-label="On this page">
          <ul className="space-y-0.5 border-l border-gray-200 dark:border-dark-border">
            {headings.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  onClick={(e) => onJump(e, h.id)}
                  aria-current={activeId === h.id ? 'location' : undefined}
                  className={`block py-1 text-[12px] leading-snug border-l -ml-px transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-st-lime ${
                    h.level === 3 ? 'pl-6' : 'pl-3'
                  } ${
                    activeId === h.id
                      ? 'border-st-lime text-st-black dark:text-st-lime font-semibold'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-dark-text'
                  }`}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  )
}
