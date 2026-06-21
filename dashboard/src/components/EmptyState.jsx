export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && <Icon className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-4" />}
      <p className="text-st-gray dark:text-gray-400 font-medium">{title}</p>
      {description && <p className="text-sm text-st-gray dark:text-gray-400 mt-1">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover focus-visible:ring-2 focus-visible:ring-st-lime focus-visible:outline-none transition-colors shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
