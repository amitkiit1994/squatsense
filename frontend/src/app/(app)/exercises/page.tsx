"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dumbbell,
  ArrowDown,
  Footprints,
  HandMetal,
  Weight,
  ArrowUp,
  Rows3,
  CircleArrowUp,
  Search,
  X,
  Info,
  AlertTriangle,
  Target,
  Play,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

interface Exercise {
  exercise_type: string;
  display_name: string;
  category: string;
  primary_side: string;
  description?: string;
}

interface ExerciseListResponse {
  exercises: Exercise[];
}

interface SummaryData {
  recent_sessions: { exercise_type: string; avg_form_score: number; created_at: string }[];
}

interface TutorialData {
  exercise_type: string;
  display_name: string;
  tips: string[];
  common_mistakes: string[];
  key_angles: Record<string, string>;
}

const EXERCISE_DEFAULTS: {
  type: string;
  name: string;
  category: string;
  icon: React.ElementType;
}[] = [
  { type: "squat", name: "Squat", category: "Lower Body", icon: ArrowDown },
  { type: "deadlift", name: "Deadlift", category: "Posterior Chain", icon: Weight },
  { type: "lunge", name: "Lunge", category: "Lower Body", icon: Footprints },
  { type: "push_up", name: "Push-up", category: "Upper Body", icon: HandMetal },
  { type: "bench_press", name: "Bench Press", category: "Upper Body", icon: Dumbbell },
  { type: "overhead_press", name: "Overhead Press", category: "Upper Body", icon: ArrowUp },
  { type: "row", name: "Row", category: "Back", icon: Rows3 },
  { type: "pull_up", name: "Pull-up", category: "Back", icon: CircleArrowUp },
];

function daysAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

export default function ExercisesPage() {
  const router = useRouter();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [tutorial, setTutorial] = useState<TutorialData | null>(null);
  const [tutorialLoading, setTutorialLoading] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchData() {
      try {
        const [exerciseData, summary] = await Promise.all([
          apiFetch<ExerciseListResponse>("/exercises/", {
            signal: abortController.signal,
          }),
          apiFetch<SummaryData>("/analytics/summary", {
            signal: abortController.signal,
          }).catch(() => null),
        ]);
        if (abortController.signal.aborted) return;
        setExercises(exerciseData.exercises);
        setSummaryData(summary);
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error("Failed to fetch exercises:", error);
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }
    fetchData();

    return () => abortController.abort();
  }, []);

  function handleSelect(exerciseType: string) {
    router.push(`/workout?exercise=${encodeURIComponent(exerciseType)}`);
  }

  async function handleShowDetail(exerciseType: string) {
    setSelectedDetail(exerciseType);
    setTutorialLoading(true);
    setTutorial(null);
    try {
      const data = await apiFetch<TutorialData>(
        `/exercises/${encodeURIComponent(exerciseType)}/tutorial`
      );
      setTutorial(data);
    } catch {
      // Silently fail — show what we have
    } finally {
      setTutorialLoading(false);
    }
  }

  // Merge API exercises with defaults for display
  const displayExercises = EXERCISE_DEFAULTS.map((def) => {
    const apiExercise = exercises.find(
      (e) => e.exercise_type === def.type
    );
    return {
      ...def,
      description: apiExercise?.description,
    };
  });

  // Filter by search query
  const filteredExercises = displayExercises.filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Find the most recent session per exercise type
  function getLastPerformance(exerciseType: string) {
    if (!summaryData?.recent_sessions) return null;
    const session = summaryData.recent_sessions.find(
      (s) => s.exercise_type === exerciseType
    );
    return session ?? null;
  }

  // Find exercise with the lowest form score for recommendation
  const recommendedType = (() => {
    if (!summaryData?.recent_sessions || summaryData.recent_sessions.length === 0) return null;
    let lowest = summaryData.recent_sessions[0];
    for (const session of summaryData.recent_sessions) {
      if (session.avg_form_score < lowest.avg_form_score) {
        lowest = session;
      }
    }
    return lowest.exercise_type;
  })();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading exercises...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
            Select Exercise
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose an exercise to start your workout
        </p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400/60" />
        <Input
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 rounded-xl border-zinc-700/50 bg-zinc-900/80 backdrop-blur-sm focus-visible:border-violet-500 focus-visible:ring-violet-500/50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filteredExercises.map((exercise, index) => {
          const IconComponent = exercise.icon;
          const lastPerformance = getLastPerformance(exercise.type);
          const isRecommended = recommendedType === exercise.type;
          return (
            <Card
              key={exercise.type}
              className="animate-fade-in-up cursor-pointer transition-all duration-300 hover:bg-zinc-800/40 hover:scale-[1.02] active:scale-[0.98] relative"
              style={{ animationDelay: `${index * 0.05}s` }}
              onClick={() => handleSelect(exercise.type)}
            >
              {/* Info button */}
              <button
                type="button"
                className="absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
                aria-label={`Details about ${exercise.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleShowDetail(exercise.type);
                }}
              >
                <Info className="h-3.5 w-3.5 text-zinc-400" />
              </button>
              <CardHeader className="items-center pb-2 pt-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <IconComponent className="h-6 w-6 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="pb-5 text-center">
                <CardTitle className="text-sm font-semibold sm:text-base">
                  {exercise.name}
                </CardTitle>
                <Badge variant="secondary" className="mt-2 text-xs">
                  {exercise.category}
                </Badge>
                {isRecommended && (
                  <Badge className="mt-1 block bg-amber-500 text-xs text-white hover:bg-amber-600">
                    Recommended
                  </Badge>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {lastPerformance
                    ? `Last: ${Math.round(Number(lastPerformance.avg_form_score) || 0)} score | ${daysAgo(lastPerformance.created_at)}`
                    : "No history"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Exercise Detail Modal */}
      {selectedDetail && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedDetail(null)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold capitalize">
                {tutorial?.display_name ?? selectedDetail.replace(/_/g, " ")}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {tutorialLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : tutorial ? (
              <>
                {/* Tips */}
                {tutorial.tips.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-2">
                      <Target className="h-4 w-4" />
                      Tips
                    </h3>
                    <ul className="space-y-1.5">
                      {tutorial.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs text-emerald-400 font-bold">
                            {i + 1}
                          </span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Common Mistakes */}
                {tutorial.common_mistakes.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-400 mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      Common Mistakes
                    </h3>
                    <ul className="space-y-1">
                      {tutorial.common_mistakes.map((mistake, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                          {mistake}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Angles */}
                {Object.keys(tutorial.key_angles).length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-400 mb-2">
                      <Info className="h-4 w-4" />
                      Key Angles
                    </h3>
                    <div className="space-y-1">
                      {Object.entries(tutorial.key_angles).map(
                        ([angle, desc]) => (
                          <div key={angle} className="flex items-start gap-2 text-sm">
                            <span className="text-zinc-500 capitalize min-w-[100px]">
                              {angle.replace(/_/g, " ")}:
                            </span>
                            <span className="text-zinc-300">{desc}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Last Performance */}
                {(() => {
                  const perf = getLastPerformance(selectedDetail);
                  if (!perf) return null;
                  return (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        Your last performance
                      </p>
                      <p className="text-sm">
                        <span className="font-semibold">{Math.round(Number(perf.avg_form_score) || 0)}</span>{" "}
                        form score &mdash; {daysAgo(perf.created_at)}
                      </p>
                      {perf.avg_form_score < 70 && (
                        <p className="text-xs text-amber-400 mt-1">
                          Focus on the tips above to improve your score
                        </p>
                      )}
                      {perf.avg_form_score >= 80 && (
                        <p className="text-xs text-emerald-400 mt-1">
                          Great form! Consider adding load for progressive overload
                        </p>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Could not load exercise details.
              </p>
            )}

            {/* Action button */}
            <Button
              className="w-full"
              onClick={() => {
                setSelectedDetail(null);
                handleSelect(selectedDetail);
              }}
            >
              <Play className="mr-2 h-4 w-4" />
              Start Workout
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
