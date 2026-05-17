export default function OnboardingCard({ icon: Icon, title, subtitle, children, onBack, showBack = false }) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 max-w-[560px] w-full mx-auto p-8">
      {showBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-st-gray hover:text-st-black transition-colors mb-5"
        >
          ← Go Back
        </button>
      )}
      <h2 className="text-[22px] font-bold text-st-black leading-tight mb-1">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-st-gray mb-6 leading-relaxed">
          {subtitle}
        </p>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}
