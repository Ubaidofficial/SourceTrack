export default function DocsCallout({ type = 'info', children }) {
  const isWarning = type === 'warning' || type === 'warn'
  return (
    <div className={`flex gap-3 border rounded-xl px-4 py-3 text-sm my-4 leading-relaxed ${
      isWarning
        ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40 text-[#7C5E00] dark:text-amber-300'
        : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/40 text-[#00529B] dark:text-blue-300'
    }`}>
      <span className="text-sm shrink-0 select-none mt-0.5">{isWarning ? '⚠️' : 'ℹ️'}</span>
      <div>{children}</div>
    </div>
  )
}
