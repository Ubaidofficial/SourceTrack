import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { DOCS_MANIFEST, sectionLabel } from './docsManifest'

// Client-side docs search. NO backend, NO index build — filters DOCS_MANIFEST in
// memory over title + keywords + description. Mounted ONCE in DocsLayout; opened by
// the sidebar input, the mobile magnifier (both dispatch window 'docs:search-open'),
// or Cmd/Ctrl+K / "/". Esc closes; ↑/↓ move; Enter navigates.
export const openDocsSearch = () => window.dispatchEvent(new CustomEvent('docs:search-open'))

function scoreEntry(entry, q) {
  const title = entry.title.toLowerCase()
  const desc = entry.description.toLowerCase()
  const kw = (entry.keywords || []).join(' ').toLowerCase()
  if (title.startsWith(q)) return 3
  if (title.includes(q)) return 2
  if (kw.includes(q) || desc.includes(q)) return 1
  return 0
}

export default function DocsSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DOCS_MANIFEST
    return DOCS_MANIFEST
      .map((e) => ({ e, s: scoreEntry(e, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.e)
  }, [query])

  // Reset highlight when the result set changes.
  useEffect(() => { setActive(0) }, [query])

  // Open triggers: custom event (sidebar/mobile) + Cmd/Ctrl+K + "/" (not while typing).
  useEffect(() => {
    const onOpen = () => setOpen(true)
    const onKey = (e) => {
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); setOpen(true); return }
      if (e.key === '/' && !open) {
        const el = document.activeElement
        const tag = el?.tagName
        const typing = tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable
        if (!typing) { e.preventDefault(); setOpen(true) }
      }
    }
    window.addEventListener('docs:search-open', onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('docs:search-open', onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Focus the input + lock body scroll while open; reset query on close.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { clearTimeout(t); document.body.style.overflow = prev }
    }
    setQuery('')
  }, [open])

  const go = (entry) => {
    if (!entry) return
    setOpen(false)
    navigate(entry.to)
  }

  const onInputKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
  }

  // Keep the active row scrolled into view.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh] bg-black/50 dark:bg-black/70"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search docs"
        className="w-full max-w-xl bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-gray-100 dark:border-dark-border">
          <Search className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search docs…"
            aria-label="Search docs"
            aria-controls="docs-search-results"
            className="flex-1 bg-transparent py-3.5 text-sm text-gray-900 dark:text-dark-primary placeholder-gray-400 focus:outline-none"
          />
          <kbd className="hidden sm:block text-[10px] font-bold text-gray-400 border border-gray-200 dark:border-dark-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <ul id="docs-search-results" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No docs match “{query}”
            </li>
          ) : (
            results.map((entry, i) => (
              <li key={entry.to} role="option" aria-selected={i === active} data-active={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(entry)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    i === active ? 'bg-st-lime/15 dark:bg-st-lime/10' : 'hover:bg-gray-50 dark:hover:bg-dark-hover'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900 dark:text-dark-primary truncate">{entry.title}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{entry.description}</span>
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 shrink-0">{sectionLabel(entry.section)}</span>
                  {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-st-black dark:text-st-lime shrink-0" aria-hidden="true" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
