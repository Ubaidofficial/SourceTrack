const STEP_LABELS = [
  'Connect Domain',
  'Business Type',
  'Install Script',
  'Instructions',
  'Conversions',
  'Verify'
]

export default function OnboardingProgress({ currentStep, totalSteps = 6 }) {
  return (
    <div className="flex items-start justify-center mb-8">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1
        const isCompleted = stepNum < currentStep
        const isCurrent = stepNum === currentStep

        return (
          <div key={stepNum} className="flex items-start">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  isCompleted
                    ? 'bg-st-lime text-black'
                    : isCurrent
                    ? 'bg-st-black text-white'
                    : 'bg-[#E5E7EB] text-st-gray'
                }`}
              >
                {isCompleted ? '✓' : stepNum}
              </div>
              {isCurrent && (
                <div className="w-6 h-0.5 bg-st-black rounded-full mt-1" />
              )}
              <span
                className={`text-[11px] mt-1.5 whitespace-nowrap ${
                  isCurrent ? 'text-st-black font-semibold' : 'text-st-gray'
                }`}
              >
                {STEP_LABELS[i] || `Step ${stepNum}`}
              </span>
            </div>
            {stepNum < totalSteps && (
              <div
                className={`w-6 sm:w-10 md:w-12 h-0.5 mt-4 ${
                  stepNum < currentStep ? 'bg-st-lime' : 'bg-[#E5E7EB]'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
