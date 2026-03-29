"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { leagueResetPassword } from "@/lib/api";
import { saveAuth } from "@/lib/auth";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const isValid =
    newPassword.length >= 6 &&
    newPassword === confirmPassword &&
    !!token;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || loading || !token) return;

    setError("");
    setLoading(true);

    try {
      const res = await leagueResetPassword(token, newPassword);
      saveAuth(res.access_token, {
        player_id: res.player_id,
        nickname: res.nickname,
        team_code: res.team_code,
      });
      setSuccess(true);
      setTimeout(() => router.push("/profile"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full bg-[#141414] border-2 border-[#2a2a2a] rounded-xl px-5 py-3.5 text-base text-white placeholder-[#555555] outline-none focus:border-[#00ff88] transition-colors";

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-[#ff3366]/20 border-2 border-[#ff3366] flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#ff3366]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Invalid Link</h1>
          <p className="text-[#888888]">No reset token provided. Please use the link from your email.</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-[#00ff88]/20 border-2 border-[#00ff88] flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#00ff88]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Password Reset!</h1>
          <p className="text-[#888888]">Redirecting to your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
          RESET PASSWORD<span className="text-[#00ff88]">.</span>
        </h1>
        <p className="text-[#888888] mb-10">Enter your new password below.</p>

        {error && (
          <div className="bg-[#ff3366]/10 border border-[#ff3366]/30 text-[#ff3366] text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
              NEW PASSWORD
            </label>
            <input
              type="password"
              autoFocus
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setError("");
              }}
              placeholder="6+ characters"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
              CONFIRM PASSWORD
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError("");
              }}
              placeholder="Re-enter password"
              className={inputClass}
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-[#ff3366] text-xs mt-1.5">Passwords do not match.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isValid || loading}
            className={`w-full py-4 rounded-xl text-lg font-bold transition-all mt-2 ${
              isValid && !loading
                ? "bg-[#00ff88] text-black hover:bg-[#00e07a] pulse-neon cursor-pointer"
                : "bg-[#2a2a2a] text-[#555555] cursor-not-allowed"
            }`}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                RESETTING...
              </span>
            ) : (
              "RESET PASSWORD"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <div className="w-12 h-12 border-3 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
