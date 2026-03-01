"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  RefreshCw,
  Target,
  Dumbbell,
  Lightbulb,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";

interface CoachingFeedback {
  session_id: string;
  session_date: string;
  exercise_type: string;
  summary: string;
  cues: string[];
  priority_areas: string[];
  overall_assessment: string;
}

/* Backend response shape from POST /coach/feedback */
interface CoachFeedbackResponse {
  session_id: string;
  exercise_type: string;
  detected_risk_markers?: string[];
  coaching: {
    coaching_cues: string[];
    corrective_drill: { name: string; description: string } | string;
    recovery_suggestion: string;
    provider: string;
  };
}

interface Drill {
  id: string;
  name: string;
  description: string;
  target_area: string;
  duration_minutes: number;
  difficulty: string;
}

interface DrillHistoryItem {
  drill_id: string;
  drill_name: string;
  completed_at: string;
  target_area: string;
}

/* Backend session list item */
interface SessionListItem {
  id: string;
  exercise_type: string;
  created_at: string;
}

export default function CoachPage() {
  const [feedback, setFeedback] = useState<CoachingFeedback | null>(null);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [drillHistory, setDrillHistory] = useState<DrillHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completedDrillIds, setCompletedDrillIds] = useState<globalThis.Set<string>>(new globalThis.Set());

  useEffect(() => {
    const abortController = new AbortController();
    fetchCoachingData(abortController.signal);
    return () => abortController.abort();
  }, []);

  async function fetchCoachingData(signal?: AbortSignal) {
    try {
      // 1. Get the most recent session
      const sessionsResp = await apiFetch<{ items: SessionListItem[] }>(
        "/sessions/?page=1&page_size=1",
        { signal }
      );

      if (signal?.aborted) return;

      if (sessionsResp.items.length === 0) {
        setLoading(false);
        return;
      }

      const latestSession = sessionsResp.items[0];

      // 2. Get coaching feedback for that session
      let detectedMarkers: string[] = [];
      try {
        const feedbackResp = await apiFetch<CoachFeedbackResponse>(
          `/coach/feedback?session_id=${latestSession.id}`,
          { method: "POST", signal }
        );

        if (signal?.aborted) return;

        // Extract risk markers from response
        const riskMarkers = feedbackResp.detected_risk_markers ?? [];

        // Extract corrective drill name as a priority area string
        const drill = feedbackResp.coaching?.corrective_drill;
        const priorityAreas: string[] = riskMarkers.length > 0
          ? riskMarkers.map((m) => m.replace(/_/g, " "))
          : typeof drill === "object" && drill?.name
            ? [drill.name]
            : typeof drill === "string" && drill
              ? [drill]
              : [];

        // Transform backend response to match the UI's CoachingFeedback interface
        setFeedback({
          session_id: feedbackResp.session_id,
          session_date: latestSession.created_at,
          exercise_type: feedbackResp.exercise_type,
          summary: feedbackResp.coaching?.recovery_suggestion ?? "",
          cues: feedbackResp.coaching?.coaching_cues ?? [],
          priority_areas: priorityAreas,
          overall_assessment:
            feedbackResp.coaching?.coaching_cues?.[0] ??
            "Complete a session to get coaching feedback.",
        });

        // Store risk markers for drills request
        detectedMarkers = riskMarkers;
      } catch {
        if (signal?.aborted) return;
        // Feedback fetch is optional; user may not have enough data
        console.error("Failed to fetch coaching feedback");
      }

      // 3. Get drills if we have session info
      try {
        const markersParam = detectedMarkers.length > 0
          ? detectedMarkers.join(",")
          : "shallow_depth";  // reasonable default for first session
        const drillsResp = await apiFetch<{
          drills: { name: string; description: string }[];
        }>(
          `/coach/drills?exercise_type=${latestSession.exercise_type}&risk_markers=${markersParam}`,
          { signal }
        );
        if (signal?.aborted) return;
        setDrills(
          drillsResp.drills.map((d, i) => ({
            id: String(i),
            name: d.name,
            description: d.description,
            target_area: latestSession.exercise_type,
            duration_minutes: 5,
            difficulty: "medium",
          }))
        );
      } catch {
        if (signal?.aborted) return;
        /* drills are optional */
      }

      // 4. Drill history
      try {
        const historyResp = await apiFetch<DrillHistoryItem[]>(
          "/coach/drill-history",
          { signal }
        );
        if (signal?.aborted) return;
        setDrillHistory(historyResp);
      } catch {
        if (signal?.aborted) return;
        setDrillHistory([]);
      }
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Failed to fetch coaching data:", error);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }

  async function handleRefreshFeedback() {
    setRefreshing(true);
    try {
      // Get latest session first
      const sessionsResp = await apiFetch<{ items: SessionListItem[] }>(
        "/sessions/?page=1&page_size=1"
      );

      if (sessionsResp.items.length === 0) {
        setRefreshing(false);
        return;
      }

      const latestSession = sessionsResp.items[0];

      // POST feedback for that session
      const feedbackResp = await apiFetch<CoachFeedbackResponse>(
        `/coach/feedback?session_id=${latestSession.id}`,
        { method: "POST" }
      );

      // Extract risk markers and fix priority areas type
      const riskMarkers = feedbackResp.detected_risk_markers ?? [];
      const drill = feedbackResp.coaching?.corrective_drill;
      const priorityAreas: string[] = riskMarkers.length > 0
        ? riskMarkers.map((m) => m.replace(/_/g, " "))
        : typeof drill === "object" && drill?.name
          ? [drill.name]
          : typeof drill === "string" && drill
            ? [drill]
            : [];

      // Transform to UI shape
      setFeedback({
        session_id: feedbackResp.session_id,
        session_date: latestSession.created_at,
        exercise_type: feedbackResp.exercise_type,
        summary: feedbackResp.coaching?.recovery_suggestion ?? "",
        cues: feedbackResp.coaching?.coaching_cues ?? [],
        priority_areas: priorityAreas,
        overall_assessment:
          feedbackResp.coaching?.coaching_cues?.[0] ??
          "Complete a session to get coaching feedback.",
      });
    } catch (error) {
      console.error("Failed to refresh feedback:", error);
    } finally {
      setRefreshing(false);
    }
  }

  function getDifficultyColor(difficulty: string) {
    switch (difficulty.toLowerCase()) {
      case "easy":
        return "default";
      case "medium":
        return "secondary";
      case "hard":
        return "destructive";
      default:
        return "outline" as const;
    }
  }

  async function handleCompleteDrill(drill: Drill) {
    try {
      const params = new URLSearchParams({
        drill_name: drill.name,
        exercise_type: drill.target_area,
      });
      const result = await apiFetch<{ drill_name: string; completed_at: string }>(
        `/coach/drill-complete?${params}`,
        { method: "POST" }
      );
      setCompletedDrillIds((prev) => new globalThis.Set(prev).add(drill.id));
      // Add to history
      setDrillHistory((prev) => [
        {
          drill_id: drill.id,
          drill_name: drill.name,
          target_area: drill.target_area,
          completed_at: result.completed_at || new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (error) {
      console.error("Failed to complete drill:", error);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Loading coaching data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
              AI Coach
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Personalized feedback and corrective drills
          </p>
        </div>
        <Button
          onClick={handleRefreshFeedback}
          disabled={refreshing}
          className="gap-2 animate-glow-pulse rounded-xl"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Analyzing..." : "Get New Feedback"}
        </Button>
      </div>

      {/* Latest Feedback */}
      {feedback ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Brain className="h-5 w-5 text-violet-400" />
                Latest Feedback
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                <Calendar className="mr-1 h-3 w-3" />
                {formatDate(feedback.session_date)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground capitalize">
              {feedback.exercise_type.replace(/_/g, " ")} session
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Overall Assessment */}
            <div className="rounded-lg bg-violet-500/5 border border-violet-500/10 p-4">
              <p className="text-sm leading-relaxed">
                {feedback.overall_assessment}
              </p>
            </div>

            {/* Summary */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Summary</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feedback.summary}
              </p>
            </div>

            {/* Coaching Cues */}
            {feedback.cues.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-violet-400" />
                  Coaching Cues
                </h3>
                <ul className="space-y-2">
                  {feedback.cues.map((cue, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-zinc-800/60 p-3 transition-all duration-200 hover:bg-zinc-800/40"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="text-sm">{cue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Priority Areas */}
            {feedback.priority_areas.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Priority Areas</h3>
                <div className="flex flex-wrap gap-2">
                  {feedback.priority_areas.map((area) => (
                    <Badge key={area} variant="secondary" className="gap-1">
                      <Target className="h-3 w-3" />
                      {area}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              No coaching feedback available yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete a workout session to receive personalized feedback
            </p>
          </CardContent>
        </Card>
      )}

      {/* Corrective Drills */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Corrective Drills</h2>
        {drills.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {drills.map((drill) => (
              <Card
                key={drill.id}
                className="transition-all duration-300 hover:bg-zinc-800/40 hover:scale-[1.02]"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold">
                      {drill.name}
                    </CardTitle>
                    <Badge
                      variant={getDifficultyColor(drill.difficulty) as "default" | "secondary" | "destructive" | "outline"}
                    >
                      {drill.difficulty}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {drill.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs gap-1">
                      <Target className="h-3 w-3" />
                      {drill.target_area}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {drill.duration_minutes} min
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={completedDrillIds.has(drill.id) ? "secondary" : "outline"}
                    className="w-full mt-1 gap-1.5"
                    disabled={completedDrillIds.has(drill.id)}
                    onClick={() => handleCompleteDrill(drill)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {completedDrillIds.has(drill.id) ? "Completed" : "Mark Done"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Dumbbell className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No drills recommended yet. Get coaching feedback first.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Drill History */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Drill History</h2>
        {drillHistory.length > 0 ? (
          <Card>
            <CardContent className="divide-y pt-4">
              {drillHistory.map((item, i) => (
                <div
                  key={`${item.drill_id}-${i}`}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/10">
                      <Dumbbell className="h-4 w-4 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.drill_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {item.target_area}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(item.completed_at)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No drill history yet. Start completing drills to track progress.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
