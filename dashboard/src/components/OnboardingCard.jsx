import { ChevronLeft } from 'lucide-react'

export default function OnboardingCard({ icon: Icon, title, subtitle, children, onBack, showBack = false }) {
  return (
    <div className="w-full max-w-[650px] rounded-[20px] border border-[#DDE4E4] dark:border-white/10 bg-white dark:bg-[#1A1F1F] shadow-[0_18px_50px_rgba(31,35,35,0.10)] dark:shadow-none p-8">
      <div className="flex items-start gap-4 mb-6">
        <div className="h-14 w-14 shrink-0 rounded-full bg-[#F1F4F4] dark:bg-white/5 flex items-center justify-center text-[#1F2323] dark:text-white">
          {Icon && <Icon className="w-7 h-7" />}
        </div>
        <div className="min-w-0 flex-1">
          {showBack && (
            <button
              onClick={onBack}
              className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-[#7D8090] hover:text-[#1F2323] dark:hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Go Back
            </button>
          )}
          <h2 className="text-[24px] font-extrabold tracking-[-0.04em] text-[#1F2323] dark:text-white leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-sm text-[#6B7373] dark:text-gray-400 leading-relaxed max-w-[520px]">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}
