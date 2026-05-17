export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && <Icon className="w-10 h-10 text-gray-300 mb-4" />}
      <p className="text-st-gray dark:text-gray-400 font-medium">{title}</p>
      {description && <p className="text-sm text-st-gray dark:text-gray-400 mt-1">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="mt-4 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1A1D1D] border border-gray-300 rounded-lg hover:bg-gray-50">
          {action.label}
        </button>
      )}
    </div>
  )
}
