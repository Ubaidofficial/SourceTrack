import { Download } from 'lucide-react'

export default function FilterBar({ dateButtons = [], activeDate, onDateChange, onExport }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {dateButtons.map((d) => (
        <button
          key={d.key}
          onClick={() => onDateChange?.(d.key)}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            activeDate === d.key
              ? 'bg-st-lime/15 text-st-black dark:text-white font-medium'
              : 'bg-gray-100 dark:bg-[#252929] text-gray-600 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          {d.label}
        </button>
      ))}
      {onExport && (
        <button onClick={onExport} className="ml-auto flex items-center gap-1 px-3 py-1 text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#333838] rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      )}
    </div>
  )
}
