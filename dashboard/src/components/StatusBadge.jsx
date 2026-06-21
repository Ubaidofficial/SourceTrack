const STATUS_STYLES = {
  success: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700/70',
  warning: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700/70',
  error: 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60',
  info: 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
  neutral: 'bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600',
  verified: 'bg-lime-50 dark:bg-green-950/30 text-lime-800 dark:text-green-300 border-lime-200 dark:border-green-700/70',
  pending: 'bg-gray-50 dark:bg-gray-900/40 text-st-gray dark:text-gray-200 border-gray-200 dark:border-gray-600',
  active: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700/70',
  inactive: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border-red-200 dark:border-red-900/50'
}

export default function StatusBadge({ status = 'neutral', label, className = '' }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.neutral
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${style} ${className}`}>
      {label || status}
    </span>
  )
}
