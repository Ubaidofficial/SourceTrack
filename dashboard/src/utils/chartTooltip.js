import { prefersReducedMotion } from './prefersReducedMotion'

// Canvas-rendered colors can't use Tailwind classes, so the chart's grid/tick
// colors are centralized here as the single source of truth (mirrors the Phase A
// dark tokens: grid ≈ a faint edge-of-light, tick = gray-400 / gray-500).
export const CHART_COLORS = {
  grid:  { light: '#f3f4f6', dark: 'rgba(255,255,255,0.06)' },
  tick:  { light: '#6b7280', dark: '#9CA3AF' },
  lime:  '#C8F000'
}

// Token class strings are LITERAL here so Tailwind's content scanner generates
// them (this file is under src/, which is in the content globs).
const CARD_CLASS =
  'st-chart-tooltip pointer-events-none fixed z-[60] min-w-[148px] rounded-xl border px-3 py-2 ' +
  'bg-white dark:bg-dark-card border-gray-200 dark:border-dark-border card-hairline shadow-lg'

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

function getEl() {
  let el = document.getElementById('st-chart-tooltip')
  if (!el) {
    el = document.createElement('div')
    el.id = 'st-chart-tooltip'
    el.className = CARD_CLASS
    el.style.opacity = '0'
    el.style.left = '0'
    el.style.top = '0'
    // 150ms crossfade (Phase A transition); instant under reduced motion.
    el.style.transition = prefersReducedMotion() ? 'none' : 'opacity 150ms ease'
    document.body.appendChild(el)
  } else {
    el.style.transition = prefersReducedMotion() ? 'none' : 'opacity 150ms ease'
  }
  return el
}

// Build a Chart.js `external` tooltip handler. `getRows(dataIndex)` returns the
// rows to render — the CALLER truth-gates it (returns only fields that exist in
// the data source; never fabricates). Each row: { label, value, accent? }.
// `accent` marks the actively-plotted metric (lime dot).
export function createExternalTooltip(getRows) {
  return (context) => {
    const { chart, tooltip } = context
    const el = getEl()

    if (tooltip.opacity === 0) {
      el.style.opacity = '0'
      return
    }

    const idx = tooltip.dataPoints?.[0]?.dataIndex
    const rows = (idx != null ? getRows(idx) : []) || []
    if (rows.length === 0) {
      el.style.opacity = '0'
      return
    }
    const title = tooltip.title?.[0] || ''

    el.innerHTML =
      `<div class="text-[11px] font-semibold text-st-gray dark:text-gray-400 mb-1">${escapeHtml(title)}</div>` +
      rows.map((r) => (
        `<div class="flex items-center justify-between gap-4 text-xs leading-relaxed">` +
          `<span class="flex items-center gap-1.5 text-st-gray dark:text-gray-400">` +
            (r.accent ? `<span class="inline-block w-1.5 h-1.5 rounded-full bg-st-lime"></span>` : '') +
            escapeHtml(r.label) +
          `</span>` +
          `<span class="font-bold tabular-nums text-st-black dark:text-dark-primary">${escapeHtml(r.value)}</span>` +
        `</div>`
      )).join('')

    // Fixed positioning relative to the viewport (getBoundingClientRect is
    // already viewport-relative), centered above the caret. No layout shift —
    // the element lives on document.body and never reflows the chart.
    const rect = chart.canvas.getBoundingClientRect()
    el.style.left = `${rect.left + tooltip.caretX}px`
    el.style.top = `${rect.top + tooltip.caretY}px`
    el.style.transform = 'translate(-50%, calc(-100% - 10px))'
    el.style.opacity = '1'
  }
}

// Shared tooltip plugin block: disable the canvas tooltip, drive the HTML one,
// index mode so the whole x-position is hoverable (real-time feel).
export function tooltipPlugin(getRows) {
  return { enabled: false, external: createExternalTooltip(getRows), mode: 'index', intersect: false }
}
