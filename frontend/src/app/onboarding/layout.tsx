"use client";

import { usePathname, useRouter } from "next/navigation";

const STEPS = [
  { path: "/onboarding/profile", label: "Profile" },
  { path: "/onboarding/goals", label: "Goals" },
  { path: "/onboarding/experience", label: "Experience" },
  { path: "/onboarding/injuries", label: "Injuries" },
  { path: "/onboarding/baseline", label: "Baseline" },
];

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const currentStepIndex = STEPS.findIndex((s) => s.path === pathname);
  const currentStep = currentStepIndex >= 0 ? currentStepIndex + 1 : 1;

  function handleSkip() {
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-950 to-zinc-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <span className="text-sm font-medium text-zinc-400">
            Step {currentStep} of {STEPS.length}
          </span>

          <button
            onClick={handleSkip}
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            Skip
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-zinc-800">
          <div
            className="h-full bg-orange-600 transition-all duration-500 ease-out"
            style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      {/* Step indicators */}
      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-6 py-4">
        {STEPS.map((step, index) => {
          const stepNum = index + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          return (
            <div key={step.path} className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isCompleted
                    ? "bg-orange-600 text-white"
                    : isCurrent
                    ? "border-2 border-orange-500 bg-orange-950 text-orange-400"
                    : "border border-zinc-700 bg-zinc-900 text-zinc-500"
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={`hidden text-xs sm:block ${
                  isCurrent
                    ? "font-medium text-orange-400"
                    : isCompleted
                    ? "text-zinc-400"
                    : "text-zinc-500"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Content */}
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8">
        {children}
      </main>
    </div>
  );
}
