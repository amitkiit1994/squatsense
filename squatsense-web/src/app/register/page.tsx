"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerLeague, loginLeague, leagueForgotPassword } from "@/lib/api";
import { saveAuth, isLoggedIn } from "@/lib/auth";
import { trackEvent, identifyUser } from "@/lib/analytics";

type Tab = "signup" | "login";

export default function RegisterPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("signup");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => { setAuthed(isLoggedIn()); }, []);

  // Sign Up fields
  const [nickname, setNickname] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [teamCode, setTeamCode] = useState("");

  // Log In fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Forgot password fields
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  function clearError() {
    setError("");
  }

  const signupValid =
    nickname.trim().length >= 3 &&
    nickname.trim().length <= 20 &&
    signupEmail.trim().length > 0 &&
    signupPassword.length >= 8;

  const loginValid =
    loginEmail.trim().length > 0 && loginPassword.length >= 1;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!signupValid || loading) return;

    setError("");
    setLoading(true);

    try {
      const res = await registerLeague(
        nickname.trim(),
        signupEmail.trim(),
        signupPassword,
        teamCode.trim() || undefined
      );
      saveAuth(res.access_token, {
        player_id: res.player_id,
        nickname: res.nickname,
        team_code: res.team_code,
      });
      identifyUser(res.player_id, { email: signupEmail.trim() });
      trackEvent("league_registered", { player_id: res.player_id, nickname: res.nickname, team_code: res.team_code });
      router.push("/play");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      if (message.includes("409") || message.toLowerCase().includes("taken")) {
        setError("That email or nickname is already taken.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginValid || loading) return;

    setError("");
    setLoading(true);

    try {
      const res = await loginLeague(loginEmail.trim(), loginPassword);
      saveAuth(res.access_token, {
        player_id: res.player_id,
        nickname: res.nickname,
        team_code: res.team_code,
      });
      router.push("/play");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      if (message.includes("401") || message.toLowerCase().includes("credentials")) {
        setError("Invalid email or password.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim() || forgotLoading) return;

    setForgotLoading(true);
    setForgotMessage("");

    try {
      await leagueForgotPassword(forgotEmail.trim());
      setForgotMessage("If an account exists, a reset link has been sent.");
    } catch {
      setForgotMessage("If an account exists, a reset link has been sent.");
    } finally {
      setForgotLoading(false);
    }
  }

  const inputClass =
    "w-full bg-[#141414] border-2 border-[#2a2a2a] rounded-xl px-4 py-3 sm:px-5 sm:py-3.5 text-base text-white placeholder-[#555555] outline-none focus:border-[#00ff88] transition-colors";

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Back — go to previous page (profile, join, or landing) */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center text-[#888888] hover:text-white text-sm mb-8 sm:mb-12 transition-colors cursor-pointer"
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          BACK
        </button>

        {/* Tabs */}
        <div className="flex mb-10 border-b border-[#2a2a2a]">
          <button
            onClick={() => {
              setTab("signup");
              clearError();
            }}
            className={`flex-1 pb-4 text-xs sm:text-sm font-bold tracking-[0.15em] transition-colors cursor-pointer ${
              tab === "signup"
                ? "text-[#00ff88] border-b-2 border-[#00ff88]"
                : "text-[#888888] hover:text-white"
            }`}
          >
            SIGN UP
          </button>
          <button
            onClick={() => {
              setTab("login");
              clearError();
            }}
            className={`flex-1 pb-4 text-xs sm:text-sm font-bold tracking-[0.15em] transition-colors cursor-pointer ${
              tab === "login"
                ? "text-[#00ff88] border-b-2 border-[#00ff88]"
                : "text-[#888888] hover:text-white"
            }`}
          >
            LOG IN
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-[#ff3366]/10 border border-[#ff3366]/30 text-[#ff3366] text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Sign Up Form */}
        {tab === "signup" && (
          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
                NICKNAME
              </label>
              <input
                type="text"
                autoFocus
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  clearError();
                }}
                placeholder="3-20 characters"
                maxLength={20}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
                EMAIL
              </label>
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => {
                  setSignupEmail(e.target.value);
                  clearError();
                }}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
                PASSWORD
              </label>
              <input
                type="password"
                value={signupPassword}
                onChange={(e) => {
                  setSignupPassword(e.target.value);
                  clearError();
                }}
                placeholder="8+ characters"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
                TEAM CODE{" "}
                <span className="text-[#555555] font-normal tracking-normal">
                  (optional)
                </span>
              </label>
              <input
                type="text"
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                placeholder="e.g. ACME-1234"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={!signupValid || loading}
              className={`w-full py-4 rounded-xl text-lg font-bold transition-all mt-2 ${
                signupValid && !loading
                  ? "bg-[#00ff88] text-black hover:bg-[#00e07a] pulse-neon cursor-pointer"
                  : "bg-[#2a2a2a] text-[#555555] cursor-not-allowed"
              }`}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  CREATING ACCOUNT...
                </span>
              ) : (
                "CREATE ACCOUNT"
              )}
            </button>
          </form>
        )}

        {/* Log In Form */}
        {tab === "login" && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
                EMAIL
              </label>
              <input
                type="email"
                autoFocus
                value={loginEmail}
                onChange={(e) => {
                  setLoginEmail(e.target.value);
                  clearError();
                }}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
                PASSWORD
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => {
                  setLoginPassword(e.target.value);
                  clearError();
                }}
                placeholder="Your password"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => {
                  setShowForgot(!showForgot);
                  setForgotMessage("");
                  setForgotEmail(loginEmail);
                }}
                className="text-[#06b6d4] hover:text-[#22d3ee] text-xs font-medium mt-2 transition-colors cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            {/* Forgot password inline form */}
            {showForgot && (
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
                <p className="text-xs text-[#888888]">
                  Enter your email and we will send a reset link.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => {
                      setForgotEmail(e.target.value);
                      setForgotMessage("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleForgotPassword(e as unknown as React.FormEvent);
                      }
                    }}
                    placeholder="you@example.com"
                    className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555555] outline-none focus:border-[#06b6d4] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={(e) => handleForgotPassword(e as unknown as React.FormEvent)}
                    disabled={!forgotEmail.trim() || forgotLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                      forgotEmail.trim() && !forgotLoading
                        ? "bg-[#06b6d4] text-black cursor-pointer hover:bg-[#0891b2]"
                        : "bg-[#2a2a2a] text-[#555555] cursor-not-allowed"
                    }`}
                  >
                    {forgotLoading ? "..." : "SEND"}
                  </button>
                </div>
                {forgotMessage && (
                  <p className="text-xs text-[#00ff88]">{forgotMessage}</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!loginValid || loading}
              className={`w-full py-4 rounded-xl text-lg font-bold transition-all mt-2 ${
                loginValid && !loading
                  ? "bg-[#00ff88] text-black hover:bg-[#00e07a] pulse-neon cursor-pointer"
                  : "bg-[#2a2a2a] text-[#555555] cursor-not-allowed"
              }`}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  LOGGING IN...
                </span>
              ) : (
                "LOG IN"
              )}
            </button>
          </form>
        )}

        {/* Quick join link — only for unauthenticated users */}
        {!authed && (
          <p className="text-center text-[#888888] text-sm mt-10">
            Just want to try it?{" "}
            <Link
              href="/join"
              className="text-[#06b6d4] hover:text-[#22d3ee] font-medium transition-colors"
            >
              Quick join with a nickname
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
