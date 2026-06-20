import { Shield, X } from 'lucide-react'

export default function SupportModeBanner({ siteName, siteDomain }) {
  function handleExit() {
    sessionStorage.removeItem('sourcetrack_admin_preview')
    window.location.href = '/ops'
  }

  const displayName = siteName || siteDomain || 'Site'

  return (
    <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-6 h-6 rounded bg-emerald-100 dark:bg-emerald-500/10">
            <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-sm font-medium text-slate-900 dark:text-slate-200">
            Support Preview: {displayName}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
            Read-only
          </span>
        </div>
        <button
          onClick={handleExit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 rounded-lg transition-colors font-medium shadow-sm"
        >
          <X className="w-3.5 h-3.5" />
          Exit Preview
        </button>
      </div>
    </div>
  )
}
