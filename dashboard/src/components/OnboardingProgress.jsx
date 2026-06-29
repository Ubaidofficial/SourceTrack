const STEP_LABELS = [
  'Connect Domain',
  'Business Type',
  'Install Method',
  'Install Script',
  'Customize',
  'Run Verification'
]

export default function OnboardingProgress({ currentStep, totalSteps = 6 }) {
  return (
    <div className="hidden md:flex items-start justify-center gap-8 lg:gap-12">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1
        const isCompleted = stepNum < currentStep
        const isCurrent = stepNum === currentStep

        return (
          <div key={stepNum} className="relative flex flex-col items-center gap-2 min-w-[92px]">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold transition-all ${
                isCompleted
                  ? 'bg-st-lime text-[#1F2323]'
                  : isCurrent
                  ? 'bg-[#1F2323] dark:bg-white text-white dark:text-[#1F2323]'
                  : 'bg-[#F1F4F4] dark:bg-white/5 text-[#1F2323] dark:text-gray-500'
              }`}
            >
              {isCompleted ? '✓' : stepNum}
            </div>
            <span
              className={`text-sm whitespace-nowrap tracking-[-0.02em] ${
                isCurrent
                  ? 'font-extrabold text-[#1F2323] dark:text-dark-primary'
                  : isCompleted
                  ? 'font-semibold text-[#1F2323] dark:text-dark-primary'
                  : 'font-medium text-[#6B7373] dark:text-gray-500'
              }`}
            >
              {STEP_LABELS[i]}
            </span>
            <div className={`h-0.5 w-24 rounded-full ${isCurrent ? 'bg-[#1F2323] dark:bg-white' : 'bg-transparent'}`} />
          </div>
        )
      })}
    </div>
  )
}
