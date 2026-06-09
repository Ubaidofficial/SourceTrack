import { Link } from 'react-router-dom'

export default function DocsCardGrid({ items }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
      {items.map((item, i) => {
        const isExternal = item.to.startsWith('http') || item.to.startsWith('mailto')
        const linkProps = isExternal
          ? { href: item.to, target: '_blank', rel: 'noopener noreferrer' }
          : { to: item.to }

        const Component = isExternal ? 'a' : Link

        return (
          <Component
            key={i}
            {...linkProps}
            className="block p-5 bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-gray-800 rounded-xl hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all group"
          >
            <h5 className="text-sm font-extrabold text-gray-900 dark:text-white group-hover:text-[#CCF03F] transition-colors flex items-center gap-1">
              {item.title}
              {isExternal && <span className="text-[10px] text-gray-400">↗</span>}
            </h5>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
              {item.description}
            </p>
          </Component>
        )
      })}
    </div>
  )
}
