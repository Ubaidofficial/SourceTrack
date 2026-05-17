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
              ? 'bg-st-lime/15 text-st-black font-medium'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {d.label}
        </button>
      ))}
      {onExport && (
        <button onClick={onExport} className="ml-auto flex items-center gap-1 px-3 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      )}
    </div>
  )
}
