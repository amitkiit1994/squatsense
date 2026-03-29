"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { joinLeague } from "@/lib/api";
import { saveAuth, isLoggedIn } from "@/lib/auth";
import { trackEvent, identifyUser } from "@/lib/analytics";

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
      <JoinPageInner />
    </Suspense>
  );
}

function JoinPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamCode = searchParams.get("team") || undefined;

  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already authenticated — skip to play (unless joining a specific team)
  useEffect(() => {
    if (!teamCode && isLoggedIn()) {
      router.replace("/play");
    }
  }, [router, teamCode]);

  const isValid = nickname.trim().length >= 3 && nickname.trim().length <= 20;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || loading) return;

    setError("");
    setLoading(true);

    try {
      const res = await joinLeague(nickname.trim(), teamCode);
      saveAuth(res.access_token, {
        player_id: res.player_id,
        nickname: res.nickname,
        team_code: res.team_code,
      });
      identifyUser(res.player_id);
      trackEvent("league_joined", { player_id: res.player_id, nickname: res.nickname, team_code: res.team_code });
      router.push("/play");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      if (message.includes("409") || message.toLowerCase().includes("taken")) {
        setError("That nickname is already taken. Try another one.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Back to landing */}
        <Link
          href="/"
          className="inline-flex items-center text-[#888888] hover:text-white text-sm mb-8 sm:mb-12 transition-colors"
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
        </Link>

        {/* Team badge */}
        {teamCode && (
          <div className="mb-6">
            <span className="inline-block bg-[#06b6d4]/15 border border-[#06b6d4]/30 text-[#06b6d4] text-sm font-bold px-4 py-2 rounded-lg tracking-wide">
              JOINING TEAM: {teamCode.toUpperCase()}
            </span>
          </div>
        )}

        {/* Header */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-2">
          WHO ARE YOU<span className="text-[#00ff88]">?</span>
        </h1>
        <p className="text-[#888888] mb-10">
          Pick a nickname. 3-20 characters.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              autoFocus
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setError("");
              }}
              placeholder="Your nickname"
              maxLength={20}
              className="w-full bg-[#141414] border-2 border-[#2a2a2a] rounded-xl px-4 py-3 sm:px-5 sm:py-4 text-lg sm:text-xl text-white placeholder-[#555555] outline-none focus:border-[#00ff88] transition-colors"
            />
            <div className="flex justify-between mt-2 px-1">
              <span
                className={`text-xs ${
                  nickname.trim().length > 0 && nickname.trim().length < 3
                    ? "text-[#ff3366]"
                    : "text-[#888888]"
                }`}
              >
                {nickname.trim().length > 0 && nickname.trim().length < 3
                  ? "Too short"
                  : "\u00A0"}
              </span>
              <span className="text-xs text-[#888888]">
                {nickname.trim().length}/20
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-[#ff3366]/10 border border-[#ff3366]/30 text-[#ff3366] text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!isValid || loading}
            className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${
              isValid && !loading
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
                JOINING...
              </span>
            ) : (
              "LET'S GO"
            )}
          </button>
        </form>

        {/* Alternate link */}
        <p className="text-center text-[#888888] text-sm mt-8">
          Already have an account?{" "}
          <Link
            href="/register"
            className="text-[#06b6d4] hover:text-[#22d3ee] font-medium transition-colors"
          >
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
