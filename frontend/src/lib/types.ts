/**
 * TypeScript interfaces matching the SquatSense backend Pydantic schemas.
 *
 * These types mirror the exact shapes returned by the FastAPI backend at
 * http://localhost:8000/api/v1/ and accepted as request payloads.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface InjuryRecord {
  area: string;
  side: "left" | "right" | "bilateral";
  notes?: string | null;
}

export interface BaselineMetrics {
  squat_depth_degrees?: number | null;
  hip_mobility_degrees?: number | null;
  ankle_mobility_degrees?: number | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  experience_level?: "beginner" | "intermediate" | "advanced" | null;
  goal?: "strength" | "hypertrophy" | "rehab" | "general" | null;
  injury_history?: InjuryRecord[] | null;
  training_max?: Record<string, number> | null;
  baseline_metrics?: BaselineMetrics | null;
  onboarding_completed: boolean;
  created_at: string;
}

export interface UserUpdate {
  name?: string | null;
  avatar_url?: string | null;
}

export interface OnboardingUpdate {
  experience_level: "beginner" | "intermediate" | "advanced";
  goal: "strength" | "hypertrophy" | "rehab" | "general";
  injury_history?: InjuryRecord[] | null;
}

export interface TrainingMaxUpdate {
  training_max: Record<string, number>;
}

export interface SessionExport {
  id: string;
  exercise_type: string;
  total_reps: number;
  avg_form_score?: number | null;
  fatigue_risk?: string | null;
  created_at: string;
  reps: Record<string, unknown>[];
}

export interface UserExport {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  experience_level?: string | null;
  goal?: string | null;
  injury_history?: InjuryRecord[] | null;
  training_max?: Record<string, number> | null;
  baseline_metrics?: BaselineMetrics | null;
  onboarding_completed: boolean;
  created_at: string;
  sessions: SessionExport[];
}

// ---------------------------------------------------------------------------
// Rep
// ---------------------------------------------------------------------------

export interface Rep {
  id: string;
  set_id: string;
  rep_number: number;
  depth_angle?: number | null;
  knee_valgus_angle?: number | null;
  hip_shift?: number | null;
  trunk_lean?: number | null;
  tempo_seconds?: number | null;
  form_score?: number | null;
  depth_score?: number | null;
  stability_score?: number | null;
  symmetry_score?: number | null;
  tempo_score?: number | null;
  rom_score?: number | null;
  flags?: string[] | null;
  timestamp?: string | null;
  eccentric_ms?: number | null;
  pause_ms?: number | null;
  concentric_ms?: number | null;
}

// ---------------------------------------------------------------------------
// Set
// ---------------------------------------------------------------------------

export interface SetCreate {
  target_reps: number;
  load_used?: number | null;
}

export interface Set {
  id: string;
  session_id: string;
  set_number: number;
  target_reps: number;
  actual_reps: number;
  load_used?: number | null;
  avg_form_score?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  reps: Rep[];
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionCreate {
  exercise_type: string;
  source?: "live" | "upload" | "manual";
  load_used?: number | null;
}

export interface SetSummaryInfo {
  set_number: number;
  actual_reps: number;
  avg_form_score?: number | null;
  load_used?: number | null;
}

export interface Session {
  id: string;
  user_id: string;
  exercise_type: string;
  source: string;
  load_used?: number | null;
  total_reps: number;
  total_sets: number;
  avg_form_score?: number | null;
  fatigue_index?: number | null;
  fatigue_risk?: "low" | "moderate" | "high" | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  sets: Set[];
  strongest_set?: SetSummaryInfo | null;
  weakest_set?: SetSummaryInfo | null;
}

export interface SessionListItem {
  id: string;
  exercise_type: string;
  total_reps: number;
  avg_form_score?: number | null;
  fatigue_risk?: string | null;
  created_at: string;
}

export interface SessionListResponse {
  items: SessionListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface SessionSummary {
  total_reps: number;
  avg_form_score?: number | null;
  fatigue_index?: number | null;
  fatigue_risk?: string | null;
  load_recommendation?: number | null;
  ai_coaching?: string | null;
  strongest_set?: SetSummaryInfo | null;
  weakest_set?: SetSummaryInfo | null;
}

// ---------------------------------------------------------------------------
// Exercise
// ---------------------------------------------------------------------------

export interface ExerciseInfo {
  exercise_type: string;
  display_name: string;
  category: string;
  primary_side: string;
  description?: string | null;
}

export interface ExerciseListResponse {
  exercises: ExerciseInfo[];
}

export interface ExerciseProgram {
  exercise_type: string;
  goal: string;
  experience_level: string;
  sets: number;
  reps: number;
  load_kg?: number | null;
  rest_seconds: number;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface RecentSessionSummary {
  id: string;
  exercise_type: string;
  total_reps: number;
  avg_form_score?: number | null;
  created_at: string;
}

export interface AnalyticsSummary {
  user_name?: string;
  total_sessions: number;
  total_reps: number;
  total_volume?: number;
  avg_form_score?: number | null;
  current_streak?: number;
  strength_trend: number[];
  recent_sessions: RecentSessionSummary[];
}

export interface ProgressData {
  dates: string[];
  values: number[];
  metric_name: string;
}

export interface TrendData {
  strength_progression: ProgressData;
  form_trend: ProgressData;
  stability_trend: ProgressData;
  fatigue_pattern: ProgressData;
  depth_trend?: ProgressData;
  symmetry_trend?: ProgressData;
  rom_trend?: ProgressData;
}

export interface VolumeWeek {
  week: string;
  volume: number;
  sessions: number;
  total_reps: number;
}

export interface VolumeData {
  weeks: VolumeWeek[];
}

// ---------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------

export interface CorrectiveDrill {
  name: string;
  description: string;
}

export interface CoachFeedback {
  session_id: string;
  exercise_type: string;
  detected_risk_markers?: string[];
  coaching: {
    coaching_cues: string[];
    corrective_drill: CorrectiveDrill;
    recovery_suggestion: string;
    provider?: string;
  };
}

export interface DrillsResponse {
  exercise_type: string;
  risk_markers: string[];
  drills: CorrectiveDrill[];
}

// ---------------------------------------------------------------------------
// Analysis (video upload)
// ---------------------------------------------------------------------------

export interface AnalysisJobPending {
  job_id: string;
  status: "pending";
}

export interface AnalysisJobCompleted {
  job_id: string;
  status: "completed";
  result: {
    exercise_type: string;
    total_reps: number;
    fps: number;
    total_frames: number;
    avg_form_score: number | null;
    fatigue_index: number | null;
    fatigue_risk: string | null;
    reps: Record<string, unknown>[];
  };
}

export interface AnalysisJobFailed {
  job_id: string;
  status: "failed";
  error: string;
}

export type AnalysisJobResponse =
  | AnalysisJobPending
  | AnalysisJobCompleted
  | AnalysisJobFailed;

// ---------------------------------------------------------------------------
// WebSocket (live analysis)
// ---------------------------------------------------------------------------

export interface WebSocketFrameResult {
  type: "frame_result";
  landmarks: [number, number][];
  metrics: {
    knee_flexion_deg?: number | null;
    trunk_angle_deg?: number | null;
    com_offset_norm?: number | null;
    speed_proxy?: number | null;
    composite_score?: number | null;
    depth_score?: number | null;
    stability_score?: number | null;
    symmetry_score?: number | null;
    tempo_score?: number | null;
    rom_score?: number | null;
    [key: string]: unknown;
  };
  rep_count: number;
  form_score: number | null;
  fatigue: {
    fatigue_index: number;
    fatigue_risk: string;
  };
  status: string;
  phase: string;
}

export interface WebSocketSessionSummary {
  type: "session_summary";
  exercise_type: string;
  total_reps: number;
  avg_form_score: number | null;
  fatigue_index: number | null;
  fatigue_risk: string | null;
  reps: Record<string, unknown>[];
}

export interface WebSocketError {
  error: string;
}

export type WebSocketMessage =
  | WebSocketFrameResult
  | WebSocketSessionSummary
  | WebSocketError;

// ---------------------------------------------------------------------------
// API Error
// ---------------------------------------------------------------------------

export interface ApiError {
  detail: string;
}
