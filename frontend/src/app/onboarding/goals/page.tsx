"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

const GOALS = [
  {
    id: "strength",
    title: "Strength",
    description: "Build raw strength and improve your max lifts",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    id: "muscle_gain",
    title: "Muscle Gain",
    description: "Increase muscle mass with hypertrophy-focused training",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    id: "fat_loss",
    title: "Fat Loss",
    description: "Burn fat and improve body composition efficiently",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
      </svg>
    ),
  },
  {
    id: "athletic_performance",
    title: "Athletic Performance",
    description: "Enhance speed, power, and functional movement",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-2.77.896m5.25-6.388V2.721" />
      </svg>
    ),
  },
];

export default function GoalsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  function handleNext() {
    if (!selected) return;

    try {
      localStorage.setItem("onboarding_goal", selected);
    } catch {
      // localStorage not available
    }

    router.push("/onboarding/experience");
  }

  return (
    <div className="flex flex-1 flex-col">
      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">
            What&apos;s your primary goal?
          </CardTitle>
          <CardDescription>
            Select one goal to help us customize your training recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {GOALS.map((goal) => {
            const isSelected = selected === goal.id;
            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => setSelected(goal.id)}
                className={`flex w-full items-start gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected
                    ? "border-orange-500 bg-orange-950/40"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800"
                }`}
              >
                <div
                  className={`flex-shrink-0 rounded-lg p-2 ${
                    isSelected
                      ? "bg-orange-900 text-orange-400"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {goal.icon}
                </div>
                <div className="flex-1">
                  <h3
                    className={`text-sm font-semibold ${
                      isSelected
                        ? "text-orange-100"
                        : "text-white"
                    }`}
                  >
                    {goal.title}
                  </h3>
                  <p
                    className={`mt-0.5 text-sm ${
                      isSelected
                        ? "text-orange-300"
                        : "text-zinc-400"
                    }`}
                  >
                    {goal.description}
                  </p>
                </div>
                <div className="flex-shrink-0 pt-1">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected
                        ? "border-orange-600 bg-orange-600"
                        : "border-zinc-600"
                    }`}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          <Button
            onClick={handleNext}
            size="lg"
            className="w-full mt-4"
            disabled={!selected}
          >
            Next
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
