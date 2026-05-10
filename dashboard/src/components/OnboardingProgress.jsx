export default function OnboardingProgress({ currentStep, totalSteps = 6 }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1
        const isCompleted = stepNum < currentStep
        const isCurrent = stepNum === currentStep

        return (
          <div key={stepNum} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                isCompleted
                  ? 'bg-[#D7F550] text-black'
                  : isCurrent
                  ? 'bg-black text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {isCompleted ? '✓' : stepNum}
            </div>
            {stepNum < totalSteps && (
              <div className={`w-8 h-0.5 ${stepNum < currentStep ? 'bg-[#D7F550]' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
