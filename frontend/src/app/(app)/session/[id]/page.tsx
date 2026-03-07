"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Dumbbell,
  Repeat,
  Layers,
  TrendingDown,
  Brain,
  Target,
  Share2,
  Copy,
  Check,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/api";
import type { Session, CoachFeedback, Rep } from "@/lib/types";

// ---------------------------------------------------------------------------
// Derived types computed from backend Session data
// ---------------------------------------------------------------------------

interface CompositeScores {
  overall: number;
  depth: number;
  stability: number;
  symmetry: number;
  tempo: number;
  rom: number;
}

interface FatigueAnalysis {
  fatigue_detected: boolean;
  fatigue_onset_set: number | null;
  score_decline_percent: number;
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Helpers to derive computed data from Session
// ---------------------------------------------------------------------------

/** Compute session duration in seconds from timestamps. */
function computeDuration(session: Session): number {
  const start = session.started_at ?? session.created_at;
  const end = session.completed_at ?? session.created_at;
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(diffMs / 1000));
}

/** Compute composite form sub-scores by averaging across all reps in all sets. */
function computeCompositeScores(session: Session): CompositeScores {
  const allReps: Rep[] = session.sets.flatMap((s) => s.reps ?? []);

  if (allReps.length === 0) {
    const fallback = session.avg_form_score ?? 0;
    return {
      overall: fallback,
      depth: fallback,
      stability: fallback,
      symmetry: fallback,
      tempo: fallback,
      rom: fallback,
    };
  }

  const avg = (extractor: (r: Rep) => number | null | undefined): number => {
    const values = allReps.map(extractor).filter((v): v is number => v != null);
    if (values.length === 0) return session.avg_form_score ?? 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  const overall = avg((r) => r.form_score);

  const depthScore = avg((r) => r.depth_score ?? r.form_score);
  const stabilityScore = avg((r) => r.stability_score ?? r.form_score);
  const symmetryScore = avg((r) => r.symmetry_score ?? r.form_score);
  const tempoScore = avg((r) => r.tempo_score ?? r.form_score);
  const romScore = avg((r) => r.rom_score ?? r.form_score);

  return {
    overall,
    depth: depthScore,
    stability: stabilityScore,
    symmetry: symmetryScore,
    tempo: tempoScore,
    rom: romScore,
  };
}

/** Compute per-set sub-scores from reps. */
function computeSetSubScores(reps: Rep[]) {
  const avg = (fn: (r: Rep) => number | null | undefined) => {
    const vals = reps.map(fn).filter((v): v is number => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    depth: avg((r) => r.depth_score),
    stability: avg((r) => r.stability_score),
    symmetry: avg((r) => r.symmetry_score),
    tempo: avg((r) => r.tempo_score),
    rom: avg((r) => r.rom_score),
  };
}

/** Human-readable labels for rep flags. */
const FLAG_LABELS: Record<string, string> = {
  shallow_depth: "Shallow depth",
  knee_cave: "Knee cave",
  knee_valgus: "Knee valgus",
  excessive_forward_lean: "Forward lean",
  lumbar_rounding: "Lumbar rounding",
  hip_shift: "Hip shift",
  balance_fail: "Balance off",
  hip_sag: "Hip sag",
  trunk_instability: "Trunk unstable",
};

/** Build fatigue analysis from the session's fatigue fields. */
function buildFatigueAnalysis(session: Session): FatigueAnalysis {
  const detected =
    session.fatigue_risk === "moderate" || session.fatigue_risk === "high";

  // Estimate fatigue onset set: the first set where form score drops below average
  let onsetSet: number | null = null;
  if (detected && session.sets.length > 1) {
    const avgScore = session.avg_form_score ?? 100;
    for (const s of session.sets) {
      if (s.avg_form_score != null && s.avg_form_score < avgScore * 0.9) {
        onsetSet = s.set_number;
        break;
      }
    }
  }

  // Compute score decline from first to last set
  let declinePercent = 0;
  if (session.sets.length >= 2) {
    const first = session.sets[0]?.avg_form_score;
    const last = session.sets[session.sets.length - 1]?.avg_form_score;
    if (first != null && last != null && first > 0) {
      declinePercent = Math.max(0, ((first - last) / first) * 100);
    }
  }

  let recommendation: string;
  if (session.fatigue_risk === "high") {
    recommendation =
      "Significant fatigue detected. Consider reducing volume or load in your next session and prioritise recovery.";
  } else if (session.fatigue_risk === "moderate") {
    recommendation =
      "Moderate fatigue observed. Monitor your form closely on later sets and consider an extra rest day if needed.";
  } else {
    recommendation =
      "No significant fatigue detected. You managed your effort well throughout the session.";
  }

  return {
    fatigue_detected: detected,
    fatigue_onset_set: onsetSet,
    score_decline_percent: declinePercent,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Coaching feedback mapping
// ---------------------------------------------------------------------------

interface MappedCoaching {
  cues: string[];
  summary: string;
  priority_areas: string[];
}

function mapCoachFeedback(raw: CoachFeedback): MappedCoaching {
  const coaching = raw.coaching;
  const cues = coaching.coaching_cues ?? [];

  // Build a summary from the corrective drill and recovery suggestion
  const parts: string[] = [];
  if (coaching.corrective_drill?.name) {
    parts.push(
      `Recommended drill: ${coaching.corrective_drill.name}. ${coaching.corrective_drill.description ?? ""}`
    );
  }
  if (coaching.recovery_suggestion) {
    parts.push(coaching.recovery_suggestion);
  }
  const summary = parts.join(" ") || "Review the coaching cues below.";

  // Priority areas derived from cues keywords
  const priority_areas: string[] = [];
  const keywords = ["depth", "stability", "tempo", "symmetry", "balance", "mobility", "fatigue"];
  for (const keyword of keywords) {
    if (cues.some((c) => c.toLowerCase().includes(keyword))) {
      priority_areas.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
    }
  }

  return { cues, summary, priority_areas };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [coaching, setCoaching] = useState<MappedCoaching | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expandedSet, setExpandedSet] = useState<number | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchData() {
      try {
        const [sessionData, coachingData] = await Promise.allSettled([
          apiFetch<Session>(`/sessions/${sessionId}`, {
            signal: abortController.signal,
          }),
          apiFetch<CoachFeedback>(`/coach/feedback?session_id=${sessionId}`, {
            method: "POST",
            signal: abortController.signal,
          }),
        ]);

        if (abortController.signal.aborted) return;

        if (sessionData.status === "fulfilled") {
          setSession(sessionData.value);
        }
        if (coachingData.status === "fulfilled") {
          setCoaching(mapCoachFeedback(coachingData.value));
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error("Failed to fetch session data:", error);
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }
    fetchData();

    return () => abortController.abort();
  }, [sessionId]);

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  function getScoreColor(score: number) {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  }

  function getProgressColor(score: number) {
    if (score >= 80) return "[&>div]:bg-emerald-500";
    if (score >= 60) return "[&>div]:bg-amber-500";
    return "[&>div]:bg-red-400";
  }

  function handleExportJson() {
    if (!session) return;
    const blob = new Blob([JSON.stringify(session, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `freeformfitness-session-${session.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleCopySummary() {
    if (!session) return;
    const date = new Date(session.created_at).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const score = session.avg_form_score != null
      ? Math.round(session.avg_form_score)
      : "N/A";
    const summary = [
      "FreeForm Fitness Session Report",
      `Exercise: ${session.exercise_type.replace(/_/g, " ")}`,
      `Date: ${date}`,
      `Total Reps: ${session.total_reps} | Sets: ${session.total_sets}`,
      `Form Score: ${score}/100`,
    ].join("\n");

    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Loading session details...
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <p className="text-lg font-medium text-muted-foreground">
          Session not found
        </p>
        <Button onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // Derived data
  const duration = computeDuration(session);
  const compositeScores = computeCompositeScores(session);
  const fatigueAnalysis = buildFatigueAnalysis(session);

  const subScores = [
    { label: "Depth", value: compositeScores.depth, icon: ArrowLeft },
    {
      label: "Stability",
      value: compositeScores.stability,
      icon: Target,
    },
    {
      label: "Symmetry",
      value: compositeScores.symmetry,
      icon: Layers,
    },
    { label: "Tempo", value: compositeScores.tempo, icon: Clock },
    {
      label: "Range of Motion",
      value: compositeScores.rom,
      icon: Repeat,
    },
  ];

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold capitalize sm:text-2xl">
            <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-cyan-400 bg-clip-text text-transparent">
              {session.exercise_type.replace(/_/g, " ")} Session
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(session.created_at).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* Session Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <Dumbbell className="mb-1 h-5 w-5 text-orange-400" />
            <p className="text-xs text-muted-foreground">Exercise</p>
            <p className="font-semibold capitalize text-sm">
              {session.exercise_type.replace(/_/g, " ")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <Repeat className="mb-1 h-5 w-5 text-orange-400" />
            <p className="text-xs text-muted-foreground">Total Reps</p>
            <p className="text-xl font-bold">{session.total_reps}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <Layers className="mb-1 h-5 w-5 text-orange-400" />
            <p className="text-xs text-muted-foreground">Sets</p>
            <p className="text-xl font-bold">{session.total_sets}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <Clock className="mb-1 h-5 w-5 text-orange-400" />
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-xl font-bold">
              {formatDuration(duration)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overall Form Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Overall Form Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Progress
                value={compositeScores.overall}
                className={`h-4 ${getProgressColor(
                  compositeScores.overall
                )}`}
              />
            </div>
            <span
              className={`text-3xl font-bold ${getScoreColor(
                compositeScores.overall
              )}`}
            >
              {Math.round(Number(compositeScores.overall) || 0)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Composite Score Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Score Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {subScores.map((sub) => (
            <div key={sub.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{sub.label}</span>
                <span className={`font-semibold ${getScoreColor(sub.value)}`}>
                  {Math.round(Number(sub.value) || 0)}
                </span>
              </div>
              <Progress
                value={sub.value}
                className={`h-2.5 ${getProgressColor(sub.value)}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Per-Set Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Set Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {session.sets.map((set) => {
            // Wall-clock diff (bulk-saved timestamps may be near-identical)
            const wallClockSecs = (() => {
              if (set.started_at && set.completed_at) {
                const diffMs =
                  new Date(set.completed_at).getTime() -
                  new Date(set.started_at).getTime();
                const secs = Math.round(diffMs / 1000);
                if (secs > 1) return secs;
              }
              return 0;
            })();
            // Average rep tempo from per-rep duration data
            const avgTempo = (() => {
              const tempos = set.reps?.filter(
                (r) => r.tempo_seconds != null && r.tempo_seconds > 0,
              );
              if (!tempos || tempos.length === 0) return 0;
              return (
                tempos.reduce((sum, r) => sum + r.tempo_seconds!, 0) /
                tempos.length
              );
            })();
            const formScore = set.avg_form_score ?? 0;
            const reps = set.reps ?? [];
            const setScores = computeSetSubScores(reps);
            const isExpanded = expandedSet === set.set_number;

            // Find the weakest sub-score for the collapsed indicator
            const scored = [
              { label: "Depth", value: setScores.depth },
              { label: "Stability", value: setScores.stability },
              { label: "Symmetry", value: setScores.symmetry },
              { label: "Tempo", value: setScores.tempo },
              { label: "ROM", value: setScores.rom },
            ].filter((s) => s.value != null) as { label: string; value: number }[];
            const weakest = scored.length > 0
              ? scored.reduce((a, b) => (a.value < b.value ? a : b))
              : null;

            // Collect flag counts across reps
            const flagCounts: Record<string, number> = {};
            for (const r of reps) {
              for (const f of r.flags ?? []) {
                flagCounts[f] = (flagCounts[f] || 0) + 1;
              }
            }
            const flagEntries = Object.entries(flagCounts).sort(
              (a, b) => b[1] - a[1],
            );

            return (
              <div key={set.set_number} className="rounded-lg border border-zinc-800/60 transition-all duration-200">
                {/* Collapsed row — always visible */}
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-3 hover:bg-zinc-800/40 rounded-lg"
                  onClick={() =>
                    setExpandedSet(isExpanded ? null : set.set_number)
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {set.set_number}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">
                        {set.actual_reps} reps
                        {weakest && weakest.value < 60 && (
                          <span className={`ml-2 text-xs font-normal ${getScoreColor(weakest.value)}`}>
                            {weakest.label.toLowerCase()} {Math.round(Number(weakest.value) || 0)}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {wallClockSecs > 0
                          ? formatDuration(wallClockSecs)
                          : avgTempo > 0
                          ? `~${Math.round(avgTempo * 10) / 10}s/rep`
                          : "--"}
                        {set.load_used != null
                          ? ` | ${set.load_used} kg`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        formScore >= 80
                          ? "default"
                          : formScore >= 60
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {Math.round(Number(formScore) || 0)}
                    </Badge>
                    <ChevronDown
                      className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-zinc-800/40 px-3 pb-3 pt-2 space-y-3">
                    {/* Sub-score bars */}
                    {scored.length > 0 && (
                      <div className="space-y-1.5">
                        {[
                          { label: "Depth", value: setScores.depth },
                          { label: "Stability", value: setScores.stability },
                          { label: "Symmetry", value: setScores.symmetry },
                          { label: "Tempo", value: setScores.tempo },
                          { label: "ROM", value: setScores.rom },
                        ]
                          .filter((s) => s.value != null)
                          .map((s) => (
                            <div key={s.label} className="flex items-center gap-2">
                              <span className="w-16 text-xs text-muted-foreground">
                                {s.label}
                              </span>
                              <div className="flex-1">
                                <Progress
                                  value={s.value!}
                                  className={`h-1.5 ${getProgressColor(s.value!)}`}
                                />
                              </div>
                              <span
                                className={`w-7 text-right text-xs font-medium ${getScoreColor(
                                  s.value!
                                )}`}
                              >
                                {Math.round(Number(s.value) || 0)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Per-rep form score dots */}
                    {reps.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Per-rep form
                        </p>
                        <div className="flex items-end gap-1">
                          {reps.map((r) => {
                            const score = r.form_score ?? 0;
                            const height = Math.max(8, (score / 100) * 32);
                            const color =
                              score >= 80
                                ? "bg-emerald-500"
                                : score >= 60
                                ? "bg-amber-500"
                                : "bg-red-400";
                            return (
                              <div
                                key={r.rep_number}
                                className="flex flex-col items-center gap-0.5 flex-1"
                              >
                                <span className="text-[10px] text-muted-foreground">
                                  {score > 0 ? Math.round(score) : ""}
                                </span>
                                <div
                                  className={`w-full max-w-[20px] rounded-sm ${color}`}
                                  style={{ height: `${height}px` }}
                                />
                                <span className="text-[10px] text-zinc-500">
                                  {r.rep_number}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Phase Timing (eccentric/pause/concentric) */}
                    {reps.some((r) => r.eccentric_ms != null) && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Phase timing (ms)
                        </p>
                        <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground mb-1">
                          <span>Rep</span>
                          <span>Ecc</span>
                          <span>Pause</span>
                          <span>Con</span>
                        </div>
                        {reps
                          .filter((r) => r.eccentric_ms != null)
                          .map((r) => (
                            <div
                              key={`phase-${r.rep_number}`}
                              className="grid grid-cols-4 gap-1 text-xs"
                            >
                              <span className="text-zinc-500">
                                #{r.rep_number}
                              </span>
                              <span>{r.eccentric_ms}</span>
                              <span>{r.pause_ms}</span>
                              <span>{r.concentric_ms}</span>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Flags */}
                    {flagEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {flagEntries.slice(0, 4).map(([flag, count]) => (
                          <span
                            key={flag}
                            className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                          >
                            <AlertTriangle className="h-3 w-3 text-amber-400" />
                            {FLAG_LABELS[flag] || flag.replace(/_/g, " ")}{" "}
                            <span className="text-zinc-500">
                              {count}/{reps.length}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Fatigue Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingDown className="h-5 w-5 text-orange-400" />
            Fatigue Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge
              variant={
                fatigueAnalysis.fatigue_detected
                  ? "destructive"
                  : "default"
              }
            >
              {fatigueAnalysis.fatigue_detected
                ? "Fatigue Detected"
                : "No Significant Fatigue"}
            </Badge>
            {session.fatigue_index != null && (
              <span className="text-xs text-muted-foreground">
                Index: {Math.round((Number(session.fatigue_index) || 0) * 100) / 100}
              </span>
            )}
          </div>
          {fatigueAnalysis.fatigue_detected &&
            fatigueAnalysis.fatigue_onset_set && (
              <p className="text-sm text-muted-foreground">
                Fatigue onset at Set {fatigueAnalysis.fatigue_onset_set}{" "}
                | Score declined{" "}
                {Math.round((Number(fatigueAnalysis.score_decline_percent) || 0) * 10) / 10}%
              </p>
            )}
          <p className="text-sm">
            {fatigueAnalysis.recommendation}
          </p>
        </CardContent>
      </Card>

      {/* AI Coaching Cues */}
      {coaching && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-orange-400" />
              AI Coaching Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {coaching.summary}
            </p>
            {coaching.cues.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Coaching Cues:</p>
                <ul className="space-y-1.5">
                  {coaching.cues.map((cue, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      {cue}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {coaching.priority_areas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {coaching.priority_areas.map((area) => (
                  <Badge key={area} variant="outline">
                    {area}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Share & Export */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Share2 className="h-5 w-5 text-orange-400" />
            Share &amp; Export
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleExportJson}>
            <Share2 className="mr-2 h-4 w-4" />
            Export as JSON
          </Button>
          <Button variant="outline" onClick={handleCopySummary}>
            {copied ? (
              <Check className="mr-2 h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copied!" : "Copy Summary"}
          </Button>
        </CardContent>
      </Card>

      {/* Back to Dashboard */}
      <div className="pb-8">
        <Button
          size="lg"
          className="w-full"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
