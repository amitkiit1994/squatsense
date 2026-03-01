"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

const LEVELS = [
  {
    id: "beginner",
    title: "Beginner",
    description:
      "New to squatting or have less than 6 months of consistent training. Still learning proper form and movement patterns.",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
    color: "green",
  },
  {
    id: "intermediate",
    title: "Intermediate",
    description:
      "6 months to 2 years of training. Comfortable with basic squat form and looking to refine technique and increase load.",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    color: "yellow",
  },
  {
    id: "advanced",
    title: "Advanced",
    description:
      "Over 2 years of consistent training. Strong command of squat mechanics, working on advanced variations and optimization.",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
    color: "purple",
  },
];

const COLOR_CLASSES: Record<string, { selected: string; icon: string; text: string; title: string }> = {
  green: {
    selected: "border-green-500 bg-green-950/40",
    icon: "bg-green-900 text-green-400",
    text: "text-green-300",
    title: "text-green-100",
  },
  yellow: {
    selected: "border-amber-500 bg-amber-950/40",
    icon: "bg-amber-900 text-amber-400",
    text: "text-amber-300",
    title: "text-amber-100",
  },
  purple: {
    selected: "border-violet-500 bg-violet-950/40",
    icon: "bg-violet-900 text-violet-400",
    text: "text-violet-300",
    title: "text-violet-100",
  },
};

export default function ExperiencePage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  function handleNext() {
    if (!selected) return;

    try {
      localStorage.setItem("onboarding_experience", selected);
    } catch {
      // localStorage not available
    }

    router.push("/onboarding/injuries");
  }

  return (
    <div className="flex flex-1 flex-col">
      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">
            What&apos;s your experience level?
          </CardTitle>
          <CardDescription>
            This helps us tailor cues and feedback to your skill level.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {LEVELS.map((level) => {
            const isSelected = selected === level.id;
            const colorClass = COLOR_CLASSES[level.color];

            return (
              <button
                key={level.id}
                type="button"
                onClick={() => setSelected(level.id)}
                className={`flex w-full items-start gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected
                    ? colorClass.selected
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800"
                }`}
              >
                <div
                  className={`flex-shrink-0 rounded-lg p-2 ${
                    isSelected
                      ? colorClass.icon
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {level.icon}
                </div>
                <div className="flex-1">
                  <h3
                    className={`text-sm font-semibold ${
                      isSelected
                        ? colorClass.title
                        : "text-white"
                    }`}
                  >
                    {level.title}
                  </h3>
                  <p
                    className={`mt-1 text-sm leading-relaxed ${
                      isSelected
                        ? colorClass.text
                        : "text-zinc-400"
                    }`}
                  >
                    {level.description}
                  </p>
                </div>
                <div className="flex-shrink-0 pt-1">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected
                        ? `border-current bg-current`
                        : "border-zinc-600"
                    }`}
                    style={
                      isSelected
                        ? {
                            borderColor:
                              level.color === "green"
                                ? "#16a34a"
                                : level.color === "yellow"
                                ? "#d97706"
                                : "#9333ea",
                            backgroundColor:
                              level.color === "green"
                                ? "#16a34a"
                                : level.color === "yellow"
                                ? "#d97706"
                                : "#9333ea",
                          }
                        : undefined
                    }
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
