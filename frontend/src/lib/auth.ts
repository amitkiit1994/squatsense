/**
 * Auth token management using localStorage.
 *
 * Provides functions to read, write, and clear JWT tokens for
 * the FreeForm Fitness API. Tokens are stored under well-known keys
 * so that both the API client and React hooks can access them.
 */

const ACCESS_TOKEN_KEY = "freeform_access_token";
const REFRESH_TOKEN_KEY = "freeform_refresh_token";

// Migrate tokens from old key names (one-time, runs on first import)
if (typeof window !== "undefined") {
  const oldAccess = localStorage.getItem("squatsense_access_token");
  const oldRefresh = localStorage.getItem("squatsense_refresh_token");
  if (oldAccess && !localStorage.getItem(ACCESS_TOKEN_KEY)) {
    localStorage.setItem(ACCESS_TOKEN_KEY, oldAccess);
  }
  if (oldRefresh && !localStorage.getItem(REFRESH_TOKEN_KEY)) {
    localStorage.setItem(REFRESH_TOKEN_KEY, oldRefresh);
  }
  // Clean up old keys after migration
  if (oldAccess) localStorage.removeItem("squatsense_access_token");
  if (oldRefresh) localStorage.removeItem("squatsense_refresh_token");
}

/**
 * Return the current access token, or `null` if none is stored.
 */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Return the current refresh token, or `null` if none is stored.
 */
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Persist both JWT tokens in localStorage.
 */
export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/**
 * Remove both tokens from localStorage (logout).
 */
export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Quick check: is there a stored access token?
 *
 * This does NOT verify the token is valid or unexpired -- that
 * happens server-side on the next API call. If the token turns
 * out to be expired the `apiFetch` helper in `lib/api.ts` will
 * attempt a transparent refresh.
 */
export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}
