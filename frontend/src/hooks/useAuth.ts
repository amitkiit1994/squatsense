"use client";

/**
 * Auth hook for SquatSense.
 *
 * Provides the current user, loading state, and actions for login,
 * registration, logout, and profile refresh. Automatically loads the
 * user profile on mount when a stored token exists.
 */

import { useCallback, useEffect, useState } from "react";

import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from "@/lib/api";
import { clearTokens, isAuthenticated, setTokens } from "@/lib/auth";
import type { LoginRequest, RegisterRequest, User } from "@/lib/types";

export interface UseAuthReturn {
  /** The currently authenticated user, or `null` if logged out. */
  user: User | null;
  /** `true` while the initial profile load is in progress. */
  isLoading: boolean;
  /** Log in with email and password. Stores tokens and loads the user. */
  login: (credentials: LoginRequest) => Promise<User>;
  /** Register a new account. Stores tokens and loads the user. */
  register: (payload: RegisterRequest) => Promise<User>;
  /** Log out: invalidate refresh token, clear local state. */
  logout: () => Promise<void>;
  /** Re-fetch the user profile from the server. */
  refreshUser: () => Promise<User | null>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Fetch the user profile from the server and update state.
   * Returns the user on success, or `null` on failure.
   */
  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const me = await getMe();
      setUser(me);
      return me;
    } catch {
      setUser(null);
      clearTokens();
      return null;
    }
  }, []);

  /**
   * On mount: if a token already exists in localStorage, try to
   * load the user profile. If it fails (expired / invalid), we
   * silently clear the tokens so the UI shows the logged-out state.
   */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (isAuthenticated()) {
        try {
          const me = await getMe();
          if (!cancelled) setUser(me);
        } catch {
          if (!cancelled) {
            setUser(null);
            clearTokens();
          }
        }
      }
      if (!cancelled) setIsLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Log in: call the backend, store tokens, then fetch the full
   * user profile so we have all fields (the login endpoint only
   * returns tokens).
   */
  const login = useCallback(
    async (credentials: LoginRequest): Promise<User> => {
      const tokens = await apiLogin(credentials);
      setTokens(tokens.access_token, tokens.refresh_token);

      const me = await getMe();
      setUser(me);
      return me;
    },
    [],
  );

  /**
   * Register: create the account, store tokens, fetch profile.
   */
  const register = useCallback(
    async (payload: RegisterRequest): Promise<User> => {
      const tokens = await apiRegister(payload);
      setTokens(tokens.access_token, tokens.refresh_token);

      const me = await getMe();
      setUser(me);
      return me;
    },
    [],
  );

  /**
   * Log out: invalidate server-side refresh token, clear local
   * tokens, and reset user state.
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiLogout();
    } catch {
      // Best effort -- always clear local state
    }
    setUser(null);
  }, []);

  return { user, isLoading, login, register, logout, refreshUser };
}
