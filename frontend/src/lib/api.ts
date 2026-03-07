/**
 * FreeForm Fitness API client.
 *
 * Wraps the native `fetch` API with JWT bearer-token injection,
 * automatic token refresh on 401, and typed helper functions for
 * every backend endpoint.
 */

import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from "@/lib/auth";
import type {
  AnalysisJobPending,
  AnalysisJobResponse,
  AnalyticsSummary,
  CoachFeedback,
  DrillsResponse,
  ExerciseInfo,
  ExerciseListResponse,
  ExerciseProgram,
  LoginRequest,
  OnboardingUpdate,
  ProgressData,
  RegisterRequest,
  Session,
  SessionCreate,
  SessionListResponse,
  TokenResponse,
  TrainingMaxUpdate,
  TrendData,
  User,
  UserExport,
  UserUpdate,
  VolumeData,
  Set as SetResponse,
  SetCreate,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const API_V1 = `${API_BASE}/api/v1`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Track whether a token refresh is already in-flight to avoid races. */
let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns `true` on success, `false` on failure (caller should log out).
 */
async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_V1}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data: TokenResponse = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

/**
 * Core fetch wrapper that:
 *  1. Injects the Authorization header with the stored JWT.
 *  2. On a 401 response, attempts a single token refresh and retries.
 *  3. Throws on non-OK responses (after optional retry).
 *
 * For requests that return no body (204), the caller should check
 * `response.status` rather than parsing JSON.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_V1}${path}`;

  const buildHeaders = (): HeadersInit => {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    // Only set Content-Type for JSON requests (not FormData / file uploads)
    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !(options.body instanceof Blob) &&
      !(options.body instanceof ArrayBuffer)
    ) {
      headers["Content-Type"] = "application/json";
    }
    return { ...headers, ...(options.headers as Record<string, string>) };
  };

  let response = await fetch(url, { ...options, headers: buildHeaders() });

  // Transparent token refresh on 401
  if (response.status === 401) {
    // Deduplicate concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;
    if (refreshed) {
      // Retry the original request with the new token
      response = await fetch(url, { ...options, headers: buildHeaders() });
    } else {
      // Refresh failed -- let the 401 propagate
      const errorBody = await response.json().catch(() => ({ detail: "Unauthorized" }));
      throw new ApiResponseError(response.status, errorBody.detail ?? "Unauthorized");
    }
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // Error responses
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new ApiResponseError(response.status, errorBody.detail ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Typed API error that surfaces both the HTTP status and the `detail`
 * message returned by the FastAPI backend.
 */
export class ApiResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "ApiResponseError";
  }
}

// =========================================================================
// AUTH endpoints  (/api/v1/auth)
// =========================================================================

/**
 * Register a new user account. Returns JWT tokens.
 */
export async function register(body: RegisterRequest): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Log in with email and password. Returns JWT tokens.
 */
export async function login(body: LoginRequest): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Refresh the access token using a valid refresh token.
 */
export async function refreshToken(refresh: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refresh }),
  });
}

/**
 * Log out by invalidating the refresh token server-side.
 * Clears local tokens regardless of the server response.
 */
export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refresh }),
      });
    } catch {
      // Best-effort; clear tokens either way
    }
  }
  clearTokens();
}

/**
 * Request a password reset email.
 */
export async function forgotPassword(
  email: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/**
 * Reset password using a token from the reset email.
 * Returns JWT tokens (auto-login).
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

// =========================================================================
// USER endpoints  (/api/v1/users)
// =========================================================================

/**
 * Get the currently authenticated user's profile.
 */
export async function getMe(): Promise<User> {
  return apiFetch<User>("/users/me");
}

/**
 * Update basic profile fields (name, avatar_url).
 */
export async function updateMe(body: UserUpdate): Promise<User> {
  return apiFetch<User>("/users/me", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Complete onboarding (experience level, goal, injury history).
 */
export async function updateOnboarding(body: OnboardingUpdate): Promise<User> {
  return apiFetch<User>("/users/me/onboarding", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Update training-max weights for one or more exercises.
 */
export async function updateTrainingMax(body: TrainingMaxUpdate): Promise<User> {
  return apiFetch<User>("/users/me/training-max", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Export all user data (profile + sessions + reps) as JSON.
 */
export async function exportData(): Promise<UserExport> {
  return apiFetch<UserExport>("/users/me/export");
}

/**
 * Permanently delete the user account and all associated data.
 */
export async function deleteAccount(): Promise<void> {
  await apiFetch("/users/me", { method: "DELETE" });
  clearTokens();
}

// =========================================================================
// EXERCISE endpoints  (/api/v1/exercises)
// =========================================================================

/**
 * List all supported exercises.
 */
export async function listExercises(): Promise<ExerciseListResponse> {
  return apiFetch<ExerciseListResponse>("/exercises/");
}

/**
 * Get metadata for a single exercise by its type key.
 */
export async function getExercise(exerciseType: string): Promise<ExerciseInfo> {
  return apiFetch<ExerciseInfo>(`/exercises/${encodeURIComponent(exerciseType)}`);
}

/**
 * Get a goal-based training program for an exercise.
 */
export async function getExerciseProgram(
  exerciseType: string,
  goal: string,
  experienceLevel: string,
  trainingMaxKg?: number,
): Promise<ExerciseProgram> {
  const params = new URLSearchParams({
    goal,
    experience_level: experienceLevel,
  });
  if (trainingMaxKg !== undefined) {
    params.set("training_max_kg", trainingMaxKg.toString());
  }
  return apiFetch<ExerciseProgram>(
    `/exercises/${encodeURIComponent(exerciseType)}/program?${params}`,
  );
}

// =========================================================================
// SESSION endpoints  (/api/v1/sessions)
// =========================================================================

/**
 * Create a new training session.
 */
export async function createSession(body: SessionCreate): Promise<Session> {
  return apiFetch<Session>("/sessions/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * List the user's sessions (paginated, with optional filters).
 */
export async function listSessions(
  page = 1,
  pageSize = 20,
  filters?: {
    exercise_type?: string;
    start_date?: string;
    end_date?: string;
  },
): Promise<SessionListResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (filters?.exercise_type) params.set("exercise_type", filters.exercise_type);
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  return apiFetch<SessionListResponse>(`/sessions/?${params}`);
}

/**
 * Get full session detail with nested sets and reps.
 */
export async function getSession(sessionId: string): Promise<Session> {
  return apiFetch<Session>(`/sessions/${sessionId}`);
}

/**
 * Update mutable session fields (status, load, AI coaching).
 */
export async function updateSession(
  sessionId: string,
  updates: {
    status?: string;
    load_used?: number;
    ai_coaching?: string;
  },
): Promise<Session> {
  const params = new URLSearchParams();
  if (updates.status !== undefined) params.set("status", updates.status);
  if (updates.load_used !== undefined) params.set("load_used", updates.load_used.toString());
  if (updates.ai_coaching !== undefined) params.set("ai_coaching", updates.ai_coaching);
  return apiFetch<Session>(`/sessions/${sessionId}?${params}`, {
    method: "PUT",
  });
}

/**
 * Add a set to an existing session.
 */
export async function addSet(
  sessionId: string,
  body: SetCreate,
): Promise<SetResponse> {
  return apiFetch<SetResponse>(`/sessions/${sessionId}/sets`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Populate a set in a session from video analysis results.
 * Each uploaded video becomes one set with its detected reps.
 */
export async function populateSetFromAnalysis(
  sessionId: string,
  setNumber: number,
  analysisResult: Record<string, unknown>,
): Promise<{ set_number: number; reps: number; avg_form_score: number | null; fatigue_index: number | null; fatigue_risk: string | null }> {
  return apiFetch(`/sessions/${sessionId}/populate-set-from-analysis`, {
    method: "POST",
    body: JSON.stringify({ set_number: setNumber, analysis_result: analysisResult }),
  });
}

/**
 * Delete a session and all associated data.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await apiFetch(`/sessions/${sessionId}`, { method: "DELETE" });
}

// =========================================================================
// ANALYSIS endpoints  (/api/v1/analyze)
// =========================================================================

/**
 * Upload a video file for asynchronous analysis.
 * Returns a job ID that can be polled for results.
 */
export async function uploadVideo(
  file: File,
  exerciseType = "squat",
): Promise<AnalysisJobPending> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("exercise_type", exerciseType);

  return apiFetch<AnalysisJobPending>("/analysis/", {
    method: "POST",
    body: formData,
  });
}

/**
 * Poll the status of an analysis job.
 */
export async function getAnalysisJob(jobId: string): Promise<AnalysisJobResponse> {
  return apiFetch<AnalysisJobResponse>(`/analysis/${jobId}`);
}

// =========================================================================
// ANALYTICS endpoints  (/api/v1/analytics)
// =========================================================================

/**
 * Get strength progression data for a given exercise.
 */
export async function getProgress(exerciseType: string): Promise<ProgressData> {
  const params = new URLSearchParams({ exercise_type: exerciseType });
  return apiFetch<ProgressData>(`/analytics/progress?${params}`);
}

/**
 * Get form, stability, and fatigue trends for a given exercise.
 */
export async function getTrends(exerciseType: string): Promise<TrendData> {
  const params = new URLSearchParams({ exercise_type: exerciseType });
  return apiFetch<TrendData>(`/analytics/trends?${params}`);
}

/**
 * Get a dashboard summary for the current user.
 */
export async function getSummary(): Promise<AnalyticsSummary> {
  return apiFetch<AnalyticsSummary>("/analytics/summary");
}

// =========================================================================
// COACH endpoints  (/api/v1/coach)
// =========================================================================

/**
 * Get AI coaching feedback for a completed session.
 */
export async function getFeedback(sessionId: string): Promise<CoachFeedback> {
  const params = new URLSearchParams({ session_id: sessionId });
  return apiFetch<CoachFeedback>(`/coach/feedback?${params}`, {
    method: "POST",
  });
}

/**
 * Get corrective drills for specific risk markers.
 */
export async function getDrills(
  exerciseType: string,
  riskMarkers: string[],
): Promise<DrillsResponse> {
  const params = new URLSearchParams({
    exercise_type: exerciseType,
    risk_markers: riskMarkers.join(","),
  });
  return apiFetch<DrillsResponse>(`/coach/drills?${params}`);
}

/**
 * Get weekly training volume analytics.
 */
export async function getVolume(exerciseType?: string): Promise<VolumeData> {
  const params = new URLSearchParams();
  if (exerciseType) params.set("exercise_type", exerciseType);
  const qs = params.toString();
  return apiFetch<VolumeData>(`/analytics/volume${qs ? `?${qs}` : ""}`);
}

/**
 * Get drill completion history for the current user.
 */
export async function getDrillHistory(): Promise<unknown[]> {
  return apiFetch<unknown[]>("/coach/drill-history");
}

/**
 * Get personalized weekly workout plan.
 */
export async function getWeeklyPlan(daysPerWeek: number = 3): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(`/exercises/weekly-plan?days_per_week=${daysPerWeek}`);
}

/**
 * Change the current user's password.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/users/me/password", {
    method: "PUT",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

/**
 * Mark a drill as completed.
 */
export async function completeDrill(
  drillName: string,
  exerciseType: string,
  targetArea?: string,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    drill_name: drillName,
    exercise_type: exerciseType,
  });
  if (targetArea) params.set("target_area", targetArea);
  return apiFetch<Record<string, unknown>>(`/coach/drill-complete?${params}`, {
    method: "POST",
  });
}
