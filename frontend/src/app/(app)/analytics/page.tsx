"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  BarChart3,
  Filter,
  Trophy,
  CalendarDays,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { apiFetch } from "@/lib/api";

/* ---- Backend response shapes ---- */

interface BackendProgressData {
  dates: string[];
  values: number[];
  metric_name: string;
}

interface BackendTrendData {
  strength_progression: BackendProgressData;
  form_trend: BackendProgressData;
  stability_trend: BackendProgressData;
  fatigue_pattern: BackendProgressData;
  depth_trend?: BackendProgressData;
  symmetry_trend?: BackendProgressData;
  rom_trend?: BackendProgressData;
}

interface BackendSummaryData {
  total_sessions: number;
  total_reps: number;
  avg_form_score: number;
}

/* ---- Chart data shapes ---- */

interface TrendPoint {
  date: string;
  score: number;
}

interface StrengthPoint {
  date: string;
  estimated_1rm: number;
}

interface SubScoreData {
  depth: number;
  stability: number;
  symmetry: number;
  tempo: number;
  rom: number;
}

interface ProgressSummary {
  total_sessions: number;
  avg_form_score: number;
  best_form_score: number;
  total_reps: number;
  total_volume: number;
  improvement_percent: number;
}

/* ---- Personal Records ---- */

interface PersonalRecord {
  exercise_type: string;
  best_form_score: number;
  best_form_date: string;
  heaviest_load: number;
  heaviest_load_date: string;
  most_reps_session: number;
  most_reps_date: string;
}

interface PersonalRecordsResponse {
  records: PersonalRecord[];
}

/* ---- Sessions (for consistency calendar) ---- */

interface SessionItem {
  created_at: string;
}

interface SessionsResponse {
  items: SessionItem[];
}

/* ---- Weekly averages (derived from trend data) ---- */

interface WeeklyAverage {
  week: string;
  avg_score: number;
  session_count: number;
}

const EXERCISE_OPTIONS = [
  { value: "all", label: "All Exercises" },
  { value: "squat", label: "Squat" },
  { value: "deadlift", label: "Deadlift" },
  { value: "lunge", label: "Lunge" },
  { value: "push_up", label: "Push-up" },
  { value: "bench_press", label: "Bench Press" },
  { value: "overhead_press", label: "Overhead Press" },
  { value: "row", label: "Row" },
  { value: "pull_up", label: "Pull-up" },
];

/* Helper: zip backend dates + values into chart data */
function zipToTrendPoints(data: BackendProgressData): TrendPoint[] {
  return data.dates.map((d, i) => ({ date: d, score: data.values[i] ?? 0 }));
}

function zipToStrengthPoints(data: BackendProgressData): StrengthPoint[] {
  return data.dates.map((d, i) => ({ date: d, estimated_1rm: data.values[i] ?? 0 }));
}

/* Helper: compute summary from trend data + backend summary */
function computeSummary(
  formTrend: BackendProgressData,
  strengthProg: BackendProgressData,
  backendSummary?: BackendSummaryData,
): ProgressSummary {
  const values = formTrend.values;
  const totalSessions = backendSummary?.total_sessions ?? formTrend.dates.length;
  const avgScore = backendSummary?.avg_form_score ?? (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const bestScore = values.length > 0 ? Math.max(...values) : 0;

  // Volume / reps from backend summary or derive from strength data
  const strengthValues = strengthProg.values;
  const totalVolume = strengthValues.length > 0 ? strengthValues.reduce((a, b) => a + b, 0) : 0;
  const totalReps = backendSummary?.total_reps ?? totalSessions;

  // Improvement: compare last value to first value
  let improvementPercent = 0;
  if (values.length >= 2) {
    const first = values[0];
    const last = values[values.length - 1];
    if (first > 0) {
      improvementPercent = ((last - first) / first) * 100;
    }
  }

  return {
    total_sessions: totalSessions,
    avg_form_score: avgScore,
    best_form_score: bestScore,
    total_reps: totalReps,
    total_volume: Math.round(totalVolume),
    improvement_percent: improvementPercent,
  };
}

/* Helper: derive weekly averages from form trend data */
function computeWeeklyAverages(formTrend: BackendProgressData): WeeklyAverage[] {
  if (formTrend.dates.length === 0) return [];

  const weekMap: Record<string, { total: number; count: number }> = {};

  formTrend.dates.forEach((dateStr, i) => {
    const d = new Date(dateStr);
    // Get the Monday of the week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const weekKey = monday.toISOString().split("T")[0];

    if (!weekMap[weekKey]) {
      weekMap[weekKey] = { total: 0, count: 0 };
    }
    weekMap[weekKey].total += formTrend.values[i] ?? 0;
    weekMap[weekKey].count += 1;
  });

  return Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, data]) => ({
      week: `Week of ${new Date(weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      avg_score: data.total / data.count,
      session_count: data.count,
    }));
}

/* Helper: build consistency calendar data (last 35 days) */
function buildCalendarData(sessions: SessionItem[]): { date: Date; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build a map of date string -> count
  const countMap: Record<string, number> = {};
  sessions.forEach((s) => {
    const d = new Date(s.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    countMap[key] = (countMap[key] ?? 0) + 1;
  });

  const days: { date: Date; count: number }[] = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: d, count: countMap[key] ?? 0 });
  }
  return days;
}

export default function AnalyticsPage() {
  const [exerciseFilter, setExerciseFilter] = useState("all");

  // Derived chart data
  const [formScoreTrend, setFormScoreTrend] = useState<TrendPoint[]>([]);
  const [strengthProgression, setStrengthProgression] = useState<StrengthPoint[]>([]);
  const [subScores, setSubScores] = useState<SubScoreData | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [weeklyAverages, setWeeklyAverages] = useState<WeeklyAverage[]>([]);

  // Personal records
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);

  // Consistency calendar
  const [calendarData, setCalendarData] = useState<{ date: Date; count: number }[]>([]);

  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params =
        exerciseFilter !== "all" ? `?exercise_type=${exerciseFilter}` : "";

      const [progressResult, trendsResult, recordsResult, sessionsResult, summaryResult] = await Promise.allSettled([
        apiFetch<BackendProgressData>(`/analytics/progress${params}`, { signal }),
        apiFetch<BackendTrendData>(`/analytics/trends${params}`, { signal }),
        apiFetch<PersonalRecordsResponse>(`/analytics/personal-records`, { signal }),
        apiFetch<SessionsResponse>(`/sessions/?page=1&page_size=100`, { signal }),
        apiFetch<BackendSummaryData>(`/analytics/summary`, { signal }),
      ]);

      if (signal?.aborted) return;

      // Get backend summary data for accurate totals
      const backendSummary = summaryResult.status === "fulfilled" ? summaryResult.value : undefined;

      // Process trend data (primary source for charts)
      if (trendsResult.status === "fulfilled") {
        const trendsData = trendsResult.value;

        // Form Score Trend
        setFormScoreTrend(zipToTrendPoints(trendsData.form_trend));

        // Strength Progression
        setStrengthProgression(zipToStrengthPoints(trendsData.strength_progression));

        // Summary stats computed from trend data + backend summary
        setSummary(computeSummary(trendsData.form_trend, trendsData.strength_progression, backendSummary));

        // Weekly averages derived from form trend
        setWeeklyAverages(computeWeeklyAverages(trendsData.form_trend));

        // Sub-scores: use actual per-component trend data
        const depthVals = trendsData.depth_trend?.values ?? [];
        const stabilityVals = trendsData.stability_trend.values;
        const fatigueVals = trendsData.fatigue_pattern.values;
        const symmetryVals = trendsData.symmetry_trend?.values ?? [];
        const romVals = trendsData.rom_trend?.values ?? [];

        setSubScores({
          depth: depthVals.length > 0 ? depthVals[depthVals.length - 1] : 0,
          stability: stabilityVals.length > 0 ? stabilityVals[stabilityVals.length - 1] : 0,
          symmetry: symmetryVals.length > 0 ? symmetryVals[symmetryVals.length - 1] : 0,
          tempo: fatigueVals.length > 0 ? Math.max(0, 100 - fatigueVals[fatigueVals.length - 1]) : 0,
          rom: romVals.length > 0 ? romVals[romVals.length - 1] : 0,
        });
      }

      // Personal records
      if (recordsResult.status === "fulfilled") {
        setPersonalRecords(recordsResult.value.records ?? []);
      }

      // Consistency calendar
      if (sessionsResult.status === "fulfilled") {
        setCalendarData(buildCalendarData(sessionsResult.value.items ?? []));
      }
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Failed to fetch analytics:", error);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [exerciseFilter]);

  useEffect(() => {
    const abortController = new AbortController();
    fetchData(abortController.signal);
    return () => abortController.abort();
  }, [fetchData]);

  // Prepare radar chart data
  const radarData = subScores
    ? [
        { subject: "Depth", value: subScores.depth, fullMark: 100 },
        { subject: "Stability", value: subScores.stability, fullMark: 100 },
        { subject: "Symmetry", value: subScores.symmetry, fullMark: 100 },
        { subject: "Tempo", value: subScores.tempo, fullMark: 100 },
        { subject: "ROM", value: subScores.rom, fullMark: 100 },
      ]
    : [];

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatRecordDate(dateStr: string | null | undefined) {
    if (!dateStr) return "N/A";
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
            Loading analytics...
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
              Progress Analytics
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your form improvement over time
          </p>
        </div>

        {/* Exercise Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-violet-400" />
          <Select value={exerciseFilter} onValueChange={setExerciseFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select exercise" />
            </SelectTrigger>
            <SelectContent>
              {EXERCISE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground">Sessions</p>
              <p className="text-xl font-bold">
                {summary.total_sessions}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground">Avg Score</p>
              <p className="text-xl font-bold">
                {Math.round((Number(summary.avg_form_score) || 0) * 10) / 10}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground">Best Score</p>
              <p className="text-xl font-bold text-emerald-400">
                {Math.round((Number(summary.best_form_score) || 0) * 10) / 10}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground">Total Reps</p>
              <p className="text-xl font-bold">
                {summary.total_reps}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground">Total Volume</p>
              {summary.total_volume > 0 ? (
                <p className="text-xl font-bold">
                  {summary.total_volume.toLocaleString()} kg
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No load data</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground">Improvement</p>
              <p
                className={`text-xl font-bold ${
                  summary.improvement_percent >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {(summary.improvement_percent ?? 0) >= 0 ? "+" : ""}
                {Math.round((Number(summary.improvement_percent) || 0) * 10) / 10}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Form Score Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-violet-400" />
            Form Score Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {formScoreTrend.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={formScoreTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.08)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    className="text-xs"
                  />
                  <YAxis domain={[0, 100]} className="text-xs" />
                  <Tooltip
                    labelFormatter={(label) => formatDate(String(label))}
                    formatter={(value) => [
                      Math.round((Number(value) || 0) * 10) / 10,
                      "Form Score",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No data available yet. Complete more sessions to see trends.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strength Progression */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-violet-400" />
            Strength Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          {strengthProgression.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={strengthProgression}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 92, 246, 0.08)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    className="text-xs"
                  />
                  <YAxis className="text-xs" />
                  <Tooltip
                    labelFormatter={(label) => formatDate(String(label))}
                    formatter={(value) => [
                      Math.round((Number(value) || 0) * 10) / 10,
                      "Est. 1RM",
                    ]}
                  />
                  <Bar
                    dataKey="estimated_1rm"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No strength data available yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-Score Radar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Form Component Scores</CardTitle>
        </CardHeader>
        <CardContent>
          {radarData.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid />
                  <PolarAngleAxis
                    dataKey="subject"
                    className="text-xs"
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    className="text-xs"
                  />
                  <Radar
                    name="Score"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                  />
                  <Tooltip
                    formatter={(value) => [
                      Math.round((Number(value) || 0) * 10) / 10,
                      "Score",
                    ]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No sub-score data available yet.
            </div>
          )}

          {/* Sub-score horizontal bars fallback / additional detail */}
          {subScores && (
            <div className="mt-4 space-y-3">
              {radarData.map((item) => (
                <div key={item.subject} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {item.subject}
                    </span>
                    <span className="font-medium">{Math.round((Number(item.value) || 0) * 10) / 10}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.value >= 80
                          ? "bg-emerald-500"
                          : item.value >= 60
                          ? "bg-amber-500"
                          : "bg-red-400"
                      }`}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Trends */}
      {weeklyAverages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weekly Averages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {weeklyAverages.map((week) => (
                <div
                  key={week.week}
                  className="flex items-center justify-between rounded-lg border border-zinc-800/60 p-3 transition-all duration-200 hover:bg-zinc-800/40"
                >
                  <div>
                    <p className="text-sm font-medium">{week.week}</p>
                    <p className="text-xs text-muted-foreground">
                      {week.session_count} session
                      {week.session_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      week.avg_score >= 80
                        ? "default"
                        : week.avg_score >= 60
                        ? "secondary"
                        : "destructive"
                    }
                  >
                    {Math.round((Number(week.avg_score) || 0) * 10) / 10}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personal Records */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-violet-400" />
            Personal Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          {personalRecords.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {personalRecords.map((record) => (
                <div
                  key={record.exercise_type}
                  className="rounded-lg border border-zinc-800/60 p-4 space-y-3 transition-all duration-200 hover:bg-zinc-800/40"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold capitalize">
                      {record.exercise_type.replace(/_/g, " ")}
                    </p>
                    <Badge variant="default" className="gap-1">
                      <Trophy className="h-3 w-3" />
                      {record.best_form_score != null ? Math.round(record.best_form_score * 10) / 10 : "—"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Best Form</p>
                      <p className="font-medium">
                        {record.best_form_score != null ? `${Math.round(record.best_form_score * 10) / 10} pts` : "N/A"}
                      </p>
                      <p className="text-muted-foreground">
                        {formatRecordDate(record.best_form_date)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Heaviest Load</p>
                      <p className="font-medium">
                        {record.heaviest_load != null && record.heaviest_load > 0
                          ? `${record.heaviest_load} lbs`
                          : "N/A"}
                      </p>
                      {record.heaviest_load != null && record.heaviest_load > 0 && (
                        <p className="text-muted-foreground">
                          {formatRecordDate(record.heaviest_load_date)}
                        </p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Most Reps (Session)</p>
                      <p className="font-medium">
                        {record.most_reps_session != null && record.most_reps_session > 0
                          ? `${record.most_reps_session} reps`
                          : "N/A"}
                      </p>
                      {record.most_reps_session != null && record.most_reps_session > 0 && (
                        <p className="text-muted-foreground">
                          {formatRecordDate(record.most_reps_date)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-[100px] items-center justify-center text-sm text-muted-foreground">
              No personal records yet. Complete more sessions to set records.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Training Consistency Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-violet-400" />
            Training Consistency
          </CardTitle>
        </CardHeader>
        <CardContent>
          {calendarData.length > 0 ? (
            <div className="space-y-3">
              {/* Day labels */}
              <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              {/* Calendar grid: 7 columns x 5 rows */}
              <div className="grid grid-cols-7 gap-1.5">
                {(() => {
                  // Pad the start so the first cell aligns to the correct day of week
                  const firstDay = calendarData[0]?.date;
                  const startDow = firstDay ? (firstDay.getDay() + 6) % 7 : 0; // Mon=0
                  const cells: { date: Date | null; count: number }[] = [];

                  // Add empty cells for padding
                  for (let i = 0; i < startDow; i++) {
                    cells.push({ date: null, count: 0 });
                  }

                  // Add actual data
                  calendarData.forEach((d) => cells.push(d));

                  // Pad end to fill the grid (up to 35 total cells)
                  while (cells.length < 35) {
                    cells.push({ date: null, count: 0 });
                  }

                  return cells.slice(0, 35).map((cell, idx) => (
                    <div
                      key={idx}
                      className={`flex h-8 w-full items-center justify-center rounded text-xs ${
                        cell.date === null
                          ? "bg-transparent"
                          : cell.count === 0
                          ? "bg-muted"
                          : cell.count === 1
                          ? "bg-violet-500/30"
                          : "bg-violet-500 text-white"
                      }`}
                      title={
                        cell.date
                          ? `${cell.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${cell.count} session${cell.count !== 1 ? "s" : ""}`
                          : ""
                      }
                    >
                      {cell.date ? cell.date.getDate() : ""}
                    </div>
                  ));
                })()}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                <span>Less</span>
                <div className="h-3 w-3 rounded bg-muted" />
                <div className="h-3 w-3 rounded bg-violet-500/30" />
                <div className="h-3 w-3 rounded bg-violet-500" />
                <span>More</span>
              </div>
            </div>
          ) : (
            <div className="flex h-[100px] items-center justify-center text-sm text-muted-foreground">
              No session data available for the calendar.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
