import { Download } from 'lucide-react'

export default function FilterBar({ dateButtons = [], activeDate, onDateChange, onExport }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {dateButtons && dateButtons.length > 0 && (
        <div className="inline-flex p-0.5 bg-gray-100 dark:bg-[#1B1811] border border-gray-200 dark:border-dark-border rounded-lg">
          {dateButtons.map((d) => {
            const isActive = activeDate === d.key
            return (
              <button
                key={d.key}
                onClick={() => onDateChange?.(d.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-150 focus-visible:ring-1 focus-visible:ring-st-lime focus-visible:outline-none ${
                  isActive
                    ? 'bg-white dark:bg-[#1B1811] text-st-black dark:text-dark-primary shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text'
                }`}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      )}
      {onExport && (
        <button
          onClick={onExport}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors focus-visible:ring-1 focus-visible:ring-st-lime focus-visible:outline-none"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      )}
    </div>
  )
}
