import { ChevronLeft } from 'lucide-react'

export default function OnboardingCard({ icon: Icon, title, subtitle, children, onBack, showBack = false }) {
  return (
    <div className="w-full max-w-[650px] rounded-[20px] border border-[#E7E0D2] dark:border-white/10 bg-white dark:bg-[#1B1811] shadow-[0_18px_50px_rgba(18,16,12,0.10)] dark:shadow-none p-8">
      <div className="flex items-start gap-4 mb-6">
        <div className="h-14 w-14 shrink-0 rounded-full bg-[#F7F4ED] dark:bg-white/5 flex items-center justify-center text-[#12100C] dark:text-dark-primary">
          {Icon && <Icon className="w-7 h-7" />}
        </div>
        <div className="min-w-0 flex-1">
          {showBack && (
            <button
              onClick={onBack}
              className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-[#6E675C] hover:text-[#12100C] dark:hover:text-dark-text transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Go Back
            </button>
          )}
          <h2 className="text-[24px] font-extrabold tracking-[-0.04em] text-[#12100C] dark:text-dark-primary leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-sm text-[#6E675C] dark:text-gray-400 leading-relaxed max-w-[520px]">
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
