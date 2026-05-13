export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && <Icon className="w-10 h-10 text-gray-300 mb-4" />}
      <p className="text-gray-500 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="mt-4 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          {action.label}
        </button>
      )}
    </div>
  )
}
