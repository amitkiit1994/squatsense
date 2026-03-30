"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Flame,
  ChevronRight,
  Dumbbell,
  CalendarDays,
  Lightbulb,
  AlertTriangle,
  Target,
  Zap,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";

interface RecentSession {
  id: string;
  exercise_type: string;
  created_at: string;
  avg_form_score?: number | null;
  total_reps: number;
  fatigue_risk?: string | null;
}

interface AnalyticsSummary {
  user_name: string;
  total_sessions: number;
  total_reps: number;
  avg_form_score: number;
  current_streak: number;
  strength_trend?: string;
  recent_sessions: RecentSession[];
}

interface VolumeData {
  weeks: { week: string; volume: number; sessions: number; total_reps: number }[];
}

interface TrendDataSlim {
  form_trend?: { dates: string[]; values: number[] };
}

interface WeeklyPlanDay {
  day: string;
  is_rest_day: boolean;
  workouts: {
    exercise_type: string;
    display_name: string;
    sets: number;
    target_reps: number;
    suggested_load_kg: number | null;
    rest_seconds: number;
    periodization_phase: string;
  }[];
}

interface WeeklyPlan {
  periodization_phase: string;
  deload_needed: boolean;
  recovery_prompt: string | null;
  weekly_plan: WeeklyPlanDay[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [volumeData, setVolumeData] = useState<VolumeData | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [formTrend, setFormTrend] = useState<{ direction: "up" | "down" | "flat"; delta: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchData() {
      try {
        const partialErrors: string[] = [];

        const [summaryData, volume, trends, plan] = await Promise.all([
          apiFetch<AnalyticsSummary>("/analytics/summary", {
            signal: abortController.signal,
          }),
          apiFetch<VolumeData>("/analytics/volume", {
            signal: abortController.signal,
          }).catch(() => { partialErrors.push("volume"); return null; }),
          apiFetch<TrendDataSlim>("/analytics/trends?exercise_type=squat", {
            signal: abortController.signal,
          }).catch(() => { partialErrors.push("trends"); return null; }),
          apiFetch<WeeklyPlan>("/exercises/weekly-plan?days_per_week=3", {
            signal: abortController.signal,
          }).catch(() => { partialErrors.push("weekly plan"); return null; }),
        ]);

        if (abortController.signal.aborted) return;
        setSummary(summaryData);
        setVolumeData(volume);
        setWeeklyPlan(plan);

        if (partialErrors.length > 0) {
          setFetchError(`Could not load ${partialErrors.join(", ")} data. Some sections may be incomplete.`);
        }

        // Compute form trend direction from last 2 trend data points
        if (trends?.form_trend?.values && trends.form_trend.values.length >= 2) {
          const vals = trends.form_trend.values;
          const last = vals[vals.length - 1];
          const prev = vals[vals.length - 2];
          const delta = Math.round((last - prev) * 10) / 10;
          setFormTrend({
            direction: delta > 1 ? "up" : delta < -1 ? "down" : "flat",
            delta,
          });
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error("Failed to fetch analytics summary:", error);
        setFetchError("Failed to load dashboard data. Please try refreshing the page.");
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }
    fetchData();

    return () => abortController.abort();
  }, []);

  const userName = summary?.user_name ?? "Athlete";

  function getScoreColor(score: number) {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  }

  function getScoreBadgeVariant(score: number): "default" | "secondary" | "destructive" | "outline" {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Get personalized insight from last session
  function getPersonalizedInsight(): { icon: typeof AlertTriangle; text: string; color: string } {
    if (!summary?.recent_sessions?.length) {
      return {
        icon: Dumbbell,
        text: "Start your first workout to get personalized insights based on your form data.",
        color: "text-orange-400",
      };
    }

    const last = summary.recent_sessions[0];

    if (last.fatigue_risk === "high") {
      return {
        icon: AlertTriangle,
        text: `Your last ${last.exercise_type.replace(/_/g, " ")} session showed high fatigue. Consider a lighter session or rest day to allow recovery.`,
        color: "text-amber-400",
      };
    }

    if ((last.avg_form_score ?? 0) < 60) {
      return {
        icon: Target,
        text: `Your last ${last.exercise_type.replace(/_/g, " ")} scored ${Math.round(Number(last.avg_form_score) || 0)}/100. Focus on depth and control next session — reduce weight if needed.`,
        color: "text-red-400",
      };
    }

    if (formTrend?.direction === "up" && formTrend.delta > 2) {
      return {
        icon: TrendingUp,
        text: `Form score trending up (+${Math.round((formTrend.delta ?? 0) * 10) / 10} pts). Your technique is improving — consider progressive overload if fatigue is low.`,
        color: "text-emerald-400",
      };
    }

    if (formTrend?.direction === "down" && formTrend.delta < -2) {
      return {
        icon: TrendingDown,
        text: `Form score dropped ${Math.round(Math.abs(formTrend.delta ?? 0) * 10) / 10} pts recently. Review your depth and trunk position — a deload may help.`,
        color: "text-amber-400",
      };
    }

    if ((last.avg_form_score ?? 0) >= 85) {
      return {
        icon: Zap,
        text: `Excellent form last session (${Math.round(Number(last.avg_form_score) || 0)}/100). You're ready to increase load by 2.5-5%.`,
        color: "text-emerald-400",
      };
    }

    return {
      icon: Lightbulb,
      text: `Your last ${last.exercise_type.replace(/_/g, " ")} scored ${Math.round(Number(last.avg_form_score) || 0)}/100. Maintain this weight and focus on hitting all cues consistently.`,
      color: "text-orange-400",
    };
  }

  // Get today's workout from the weekly plan
  function getTodaysWorkout(): WeeklyPlanDay | null {
    if (!weeklyPlan?.weekly_plan) return null;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const today = dayNames[new Date().getDay()];
    return weeklyPlan.weekly_plan.find((d) => d.day === today) ?? null;
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const insight = getPersonalizedInsight();
  const InsightIcon = insight.icon;
  const todaysWorkout = getTodaysWorkout();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back,{" "}
          <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-cyan-400 bg-clip-text text-transparent">
            {userName}
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s your training overview
        </p>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-200">{fetchError}</p>
        </div>
      )}

      {/* Start Workout CTA */}
      <Button
        size="lg"
        className="w-full gap-2 text-base font-semibold sm:w-auto animate-glow-pulse rounded-xl"
        onClick={() => router.push("/exercises")}
      >
        <Dumbbell className="h-5 w-5" />
        Start Workout
      </Button>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="animate-fade-in-up">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sessions
            </CardTitle>
            <Activity className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {summary?.total_sessions ?? 0}
            </div>
            {summary && summary.total_reps > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.total_reps} total reps
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up delay-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Form Score
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold ${getScoreColor(
                  summary?.avg_form_score ?? 0
                )}`}
              >
                {summary?.avg_form_score != null ? (Math.round(summary.avg_form_score * 10) / 10) : "0.0"}
              </span>
              {formTrend && formTrend.direction !== "flat" && (
                <span className={`text-xs font-medium flex items-center gap-0.5 ${
                  formTrend.direction === "up" ? "text-emerald-400" : "text-red-400"
                }`}>
                  {formTrend.direction === "up" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {formTrend.delta > 0 ? "+" : ""}{Math.round((formTrend.delta ?? 0) * 10) / 10}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up delay-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Streak
            </CardTitle>
            <Flame className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {summary?.current_streak ?? 0}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                days
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Workout (from weekly plan) */}
      {todaysWorkout && !todaysWorkout.is_rest_day && (
        <Card className="border-orange-500/20">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10">
              <CalendarDays className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Today&apos;s Workout</CardTitle>
              {weeklyPlan?.periodization_phase && (
                <p className="text-xs text-muted-foreground capitalize">
                  {weeklyPlan.periodization_phase} phase
                  {weeklyPlan.deload_needed && " - deload recommended"}
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todaysWorkout.workouts.map((w, i) => (
                <button
                  key={i}
                  onClick={() => router.push(`/workout?exercise=${w.exercise_type}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-800/60 p-3 text-left transition-all hover:bg-zinc-800/40"
                >
                  <div>
                    <p className="font-medium">{w.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.sets} sets x {w.target_reps} reps
                      {w.suggested_load_kg ? ` @ ${w.suggested_load_kg} kg` : ""}
                      {" | "}{Math.floor(w.rest_seconds / 60)}:{String(w.rest_seconds % 60).padStart(2, "0")} rest
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rest day card */}
      {todaysWorkout && todaysWorkout.is_rest_day && (
        <Card className="border-emerald-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                <Flame className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-emerald-400">Rest Day</p>
                <p className="text-sm text-muted-foreground">
                  {weeklyPlan?.recovery_prompt
                    ? weeklyPlan.recovery_prompt
                    : "Recovery is when your body adapts and grows stronger. Light mobility work and hydration recommended."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Volume Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Weekly Volume</CardTitle>
        </CardHeader>
        <CardContent>
          {volumeData?.weeks && volumeData.weeks.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={volumeData.weeks}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.08)" />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Complete more sessions to see volume trends
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personalized Insight (replaces generic tip) */}
      <Card className="border-orange-500/20">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10">
            <InsightIcon className={`h-5 w-5 ${insight.color}`} />
          </div>
          <CardTitle className="text-lg">Your Insight</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {insight.text}
          </p>
        </CardContent>
      </Card>

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {summary?.recent_sessions && summary.recent_sessions.length > 0 ? (
            <div className="space-y-3">
              {summary.recent_sessions.slice(0, 5).filter((s) => s && s.id).map((session) => (
                <button
                  key={session.id}
                  onClick={() => router.push(`/session/${session.id}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-800/60 p-3 text-left transition-all duration-200 hover:bg-zinc-800/40 hover:scale-[1.01]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Dumbbell className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium capitalize">
                        {session.exercise_type.replace(/_/g, " ")}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(session.created_at)}
                        <span>|</span>
                        <span>{session.total_reps} reps</span>
                        {session.fatigue_risk === "high" && (
                          <>
                            <span>|</span>
                            <span className="text-red-400">High fatigue</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getScoreBadgeVariant(Number(session.avg_form_score) || 0)}>
                      {Math.round(Number(session.avg_form_score) || 0)}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Dumbbell className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No sessions yet. Start your first workout!
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
