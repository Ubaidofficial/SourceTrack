export default function OnboardingCard({ icon: Icon, title, subtitle, children, onBack, showBack = false, cta }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-[648px] w-full mx-auto p-8">
      {showBack && (
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
          ← Go Back
        </button>
      )}
      <div className="flex items-center gap-3 mb-2">
        {Icon && <Icon className="w-6 h-6 text-black" />}
        <h2 className="text-xl font-semibold text-gray-900">
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="text-sm text-st-gray mb-6">
          {subtitle}
        </p>
      )}
      <div className="space-y-4">
        {children}
      </div>
      {cta && (
        <div className="mt-6">
          {cta}
        </div>
      )}
    </div>
  )
}
