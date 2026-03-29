const TOKEN_KEY = "squatsense_token";
const PLAYER_KEY = "squatsense_player";

export interface StoredPlayer {
  player_id: string;
  nickname: string;
  team_code: string | null;
}

export function saveAuth(token: string, player: StoredPlayer) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getPlayer(): StoredPlayer | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PLAYER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PLAYER_KEY);
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}
