export default function OnboardingCard({ icon: Icon, title, subtitle, children, onBack, showBack = false }) {
  return (
    <div className="bg-white dark:bg-[#1A1D1D] rounded-2xl shadow-md border border-gray-100 dark:border-[#2A2E2E] max-w-[560px] w-full mx-auto p-8">
      {showBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-st-gray dark:text-gray-400 hover:text-st-black dark:text-white transition-colors mb-5"
        >
          ← Go Back
        </button>
      )}
      <h2 className="text-[22px] font-bold text-st-black dark:text-white leading-tight mb-1">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-st-gray dark:text-gray-400 mb-6 leading-relaxed">
          {subtitle}
        </p>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}
