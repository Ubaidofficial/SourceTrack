import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import LogoChip from './LogoChip'

// Compact doc card. Each item carries EITHER `logoDomain` (platform → LogoChip) or
// `icon` (a lucide component → calm lime-subtle chip). Backward-compatible with the
// plain { to, title, description } shape (renders with no leading media).
// `cols` = 2 (default) or 3 for the denser platform grid.
const COL_CLASS = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
}

export default function DocsCardGrid({ items, cols = 2 }) {
  return (
    <div className={`grid ${COL_CLASS[cols] || COL_CLASS[2]} gap-3 my-5`}>
      {items.map((item, i) => {
        const isExternal = item.to.startsWith('http') || item.to.startsWith('mailto')
        const linkProps = isExternal
          ? { href: item.to, target: '_blank', rel: 'noopener noreferrer' }
          : { to: item.to }
        const Component = isExternal ? 'a' : Link
        const Icon = item.icon

        return (
          <Component
            key={i}
            {...linkProps}
            className="group flex items-center gap-3 p-[13px] bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl transition-all duration-150 hover:border-st-lime dark:hover:border-st-lime hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-st-lime focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-bg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {item.logoDomain ? (
              <LogoChip domain={item.logoDomain} name={item.title} variant="card" />
            ) : Icon ? (
              <span className="w-[34px] h-[34px] shrink-0 inline-flex items-center justify-center rounded-[7px] bg-st-lime/15 dark:bg-st-lime/10 ring-1 ring-st-lime/25">
                <Icon className="w-[18px] h-[18px] text-st-black dark:text-st-lime" aria-hidden="true" />
              </span>
            ) : null}

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-extrabold text-gray-900 dark:text-dark-primary group-hover:text-st-black dark:group-hover:text-st-lime transition-colors">
                {item.title}
                {isExternal && <span className="text-[10px] text-gray-400" aria-hidden="true">↗</span>}
              </span>
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {item.description}
              </span>
            </span>

            <ArrowRight
              className="w-4 h-4 shrink-0 text-gray-300 dark:text-gray-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-st-black dark:group-hover:text-st-lime transition-all duration-150 motion-reduce:transition-none motion-reduce:translate-x-0"
              aria-hidden="true"
            />
          </Component>
        )
      })}
    </div>
  )
}
