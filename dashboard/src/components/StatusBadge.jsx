const STATUS_STYLES = {
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200',
  verified: 'bg-lime-50 text-lime-800 border-lime-200',
  pending: 'bg-gray-50 text-gray-500 border-gray-200',
  active: 'bg-green-50 text-green-700 border-green-200',
  inactive: 'bg-red-50 text-red-500 border-red-200'
}

export default function StatusBadge({ status = 'neutral', label, className = '' }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.neutral
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${style} ${className}`}>
      {label || status}
    </span>
  )
}
