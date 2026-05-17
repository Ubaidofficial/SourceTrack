export default function OnboardingCard({ icon: Icon, title, subtitle, children, onBack, showBack = false, cta }) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 max-w-[560px] w-full mx-auto p-8">
      {showBack && (
        <button onClick={onBack} className="text-sm text-st-gray hover:text-st-black transition-colors mb-4">
          ← Go Back
        </button>
      )}
      <h2 className="text-[22px] font-bold text-st-black">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-st-gray mt-2 mb-6">
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
