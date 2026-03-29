import { clearAuth } from "@/lib/auth";

// Use relative paths so requests go through Next.js rewrite proxy (next.config.ts)
// instead of direct cross-origin requests to the backend.
const API_BASE = "";

interface FetchOptions extends RequestInit {
  token?: string;
  skipAuthRedirect?: boolean;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, skipAuthRedirect, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    // Handle expired/invalid tokens — clear auth and redirect to join
    // Skip for auth endpoints (login/register) where 401 means bad credentials, not expired session
    if (res.status === 401 && typeof window !== "undefined" && !skipAuthRedirect) {
      clearAuth();
      window.location.href = "/join";
      throw new Error("Session expired. Please sign in again.");
    }

    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  return res.json();
}

// ── Auth ────────────────────────────────────────────────────────────────

export interface LeagueTokenResponse {
  access_token: string;
  token_type: string;
  player_id: string;
  nickname: string;
  team_code: string | null;
}

export function joinLeague(nickname: string, teamCode?: string) {
  return apiFetch<LeagueTokenResponse>("/api/v1/league/join", {
    method: "POST",
    body: JSON.stringify({ nickname, team_code: teamCode || null }),
  });
}

export function registerLeague(nickname: string, email: string, password: string, teamCode?: string) {
  return apiFetch<LeagueTokenResponse>("/api/v1/league/register", {
    method: "POST",
    body: JSON.stringify({ nickname, email, password, team_code: teamCode || null }),
    skipAuthRedirect: true,
  });
}

export function loginLeague(email: string, password: string) {
  return apiFetch<LeagueTokenResponse>("/api/v1/league/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipAuthRedirect: true,
  });
}

// ── Teams ───────────────────────────────────────────────────────────────

export interface TeamResponse {
  id: string;
  name: string;
  code: string;
  total_points: number;
  total_sessions: number;
  member_count: number;
}

export function createTeam(name: string) {
  return apiFetch<TeamResponse>("/api/v1/league/teams", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function getTeam(code: string) {
  return apiFetch<TeamResponse>(`/api/v1/league/teams/${code}`);
}

export interface LeaderboardEntry {
  position: number;
  player_id: string;
  nickname: string;
  avatar_seed: string;
  rank: string;
  value: number;
  is_current_player: boolean;
}

export function getLeaderboard(period = "week") {
  return apiFetch<LeaderboardEntry[]>(`/api/v1/league/leaderboard?period=${period}`);
}

export function getTeamLeaderboard(code: string, period = "week") {
  return apiFetch<LeaderboardEntry[]>(`/api/v1/league/teams/${code}/leaderboard?period=${period}`);
}

export function getTeamToday(code: string) {
  return apiFetch<{ sessions_today: number; reps_today: number; points_today: number; active_players: number }>(
    `/api/v1/league/teams/${code}/today`
  );
}

// ── Sessions ────────────────────────────────────────────────────────────

export interface StartSessionResponse {
  session_id: string;
  reps_remaining_today: number;
  sessions_remaining_today: number;
}

export function startSession(token: string, mode = "personal") {
  return apiFetch<StartSessionResponse>("/api/v1/league/sessions/start", {
    method: "POST",
    body: JSON.stringify({ mode }),
    token,
  });
}

export interface CompleteSessionResponse {
  points_earned: number;
  reps_counted: number;
  reps_total: number;
  avg_quality: number;
  max_combo: number;
  perfect_reps: number;
  total_points: number;
  rank: string;
  current_streak: number;
  streak_multiplier: number;
  capped: boolean;
}

export function completeSession(token: string, sessionId: string, repScores: number[], durationSec = 30) {
  return apiFetch<CompleteSessionResponse>(`/api/v1/league/sessions/${sessionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ rep_scores: repScores, duration_sec: durationSec }),
    token,
  });
}

// ── Profile ─────────────────────────────────────────────────────────────

export interface PlayerProfile {
  id: string;
  nickname: string;
  avatar_seed: string;
  email: string | null;
  team_name: string | null;
  team_code: string | null;
  rank: string;
  total_points: number;
  total_reps: number;
  total_sessions: number;
  best_session_points: number;
  best_quality: number;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  email_verified: boolean;
}

export function getProfile(token: string) {
  return apiFetch<PlayerProfile>("/api/v1/league/me", { token });
}

export interface SessionHistoryEntry {
  id: string;
  mode: string;
  reps_counted: number;
  reps_total: number;
  avg_quality: number;
  points_earned: number;
  max_combo: number;
  perfect_reps: number;
  created_at: string;
}

export function getHistory(token: string, limit = 20) {
  return apiFetch<SessionHistoryEntry[]>(`/api/v1/league/me/history?limit=${limit}`, { token });
}

// ── Kiosk ───────────────────────────────────────────────────────────────

export interface KioskRegisterResponse {
  kiosk_id: string;
  team_name: string;
  team_code: string;
}

export function registerKiosk(teamCode: string) {
  return apiFetch<KioskRegisterResponse>(`/api/v1/league/kiosk/${teamCode}/register`, {
    method: "POST",
  });
}

export interface KioskPendingResponse {
  has_pending: boolean;
  player_id: string | null;
  nickname: string | null;
  queue_size: number;
}

export function getKioskPending(kioskId: string) {
  return apiFetch<KioskPendingResponse>(`/api/v1/league/kiosk/${kioskId}/pending`);
}

export interface KioskJoinResponse {
  status: string;
  player_id: string;
  nickname: string;
  access_token: string;
  queue_position: number;
}

export function joinKiosk(kioskId: string, nickname: string) {
  return apiFetch<KioskJoinResponse>(
    `/api/v1/league/kiosk/${kioskId}/join`,
    { method: "POST", body: JSON.stringify({ nickname }) }
  );
}

export function kioskSessionStarted(kioskId: string) {
  return apiFetch<{ status: string; access_token?: string }>(`/api/v1/league/kiosk/${kioskId}/session-started`, {
    method: "POST",
  });
}

export interface KioskSessionCompleteBody {
  player_id: string;
  points_earned: number;
  reps_counted: number;
  reps_total: number;
  avg_quality: number;
  max_combo: number;
  perfect_reps: number;
  total_points: number;
  rank: string;
  current_streak: number;
  capped: boolean;
}

export function kioskSessionComplete(kioskId: string, body: KioskSessionCompleteBody) {
  return apiFetch<{ status: string; has_next: boolean }>(
    `/api/v1/league/kiosk/${kioskId}/session-complete`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export interface KioskPlayerStatus {
  status: "queued" | "active" | "completed" | "unknown";
  queue_position?: number;
  queue_size?: number;
  // When completed, result fields:
  points_earned?: number;
  reps_counted?: number;
  reps_total?: number;
  avg_quality?: number;
  max_combo?: number;
  perfect_reps?: number;
  total_points?: number;
  rank?: string;
  current_streak?: number;
  capped?: boolean;
}

export function getKioskPlayerStatus(kioskId: string, playerId: string) {
  return apiFetch<KioskPlayerStatus>(
    `/api/v1/league/kiosk/${kioskId}/player/${playerId}/status`
  );
}

// ── Auth flows ─────────────────────────────────────────────────────────

export function leagueForgotPassword(email: string) {
  return apiFetch<{ message: string }>("/api/v1/league/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function leagueResetPassword(token: string, newPassword: string) {
  return apiFetch<LeagueTokenResponse>("/api/v1/league/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export function leagueVerifyEmail(token: string) {
  return apiFetch<{ message: string }>("/api/v1/league/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function leagueSendVerification(token: string) {
  return apiFetch<{ message: string }>("/api/v1/league/send-verification", {
    method: "POST",
    token,
  });
}

export function upgradeAccount(token: string, email: string, password: string) {
  return apiFetch<LeagueTokenResponse>("/api/v1/league/upgrade", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    token,
  });
}

// ── Stats ───────────────────────────────────────────────────────────────

export interface GlobalStats {
  total_squats_today: number;
  total_players: number;
  total_teams: number;
}

export function getGlobalStats() {
  return apiFetch<GlobalStats>("/api/v1/league/stats");
}
