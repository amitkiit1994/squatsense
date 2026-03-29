"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getProfile,
  getHistory,
  leagueSendVerification,
  type PlayerProfile,
  type SessionHistoryEntry,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { getRankProgress, RANK_COLORS } from "@/lib/ranks";

// ── Rank config ──────────────────────────────────────────────────────────
const RANK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  bronze: { label: "BRONZE", color: "#cd7f32", bg: "rgba(205,127,50,0.15)" },
  silver: { label: "SILVER", color: "#c0c0c0", bg: "rgba(192,192,192,0.15)" },
  gold:   { label: "GOLD",   color: "#ffd700", bg: "rgba(255,215,0,0.15)" },
  elite:  { label: "ELITE",  color: "#9333ea", bg: "rgba(147,51,234,0.15)" },
};

function RankBadge({ rank }: { rank: string }) {
  const cfg = RANK_CONFIG[rank] ?? RANK_CONFIG.bronze;
  return (
    <span
      className="inline-block px-4 py-1.5 rounded-full text-sm font-black tracking-widest"
      style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color = "#f0f0f0",
  suffix,
}: {
  label: string;
  value: string | number;
  color?: string;
  suffix?: string;
}) {
  return (
    <div className="gradient-card p-5 flex flex-col items-center justify-center text-center">
      <p className="text-3xl font-black font-mono tabular-nums" style={{ color }}>
        {value}
        {suffix && <span className="text-lg">{suffix}</span>}
      </p>
      <p className="text-xs text-[#888] font-semibold mt-1 tracking-wider uppercase">
        {label}
      </p>
    </div>
  );
}

// ── Date formatter ───────────────────────────────────────────────────────
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Rank Progress Bar ─────────────────────────────────────────────────────
function RankProgressBar({ totalPoints, rank }: { totalPoints: number; rank: string }) {
  const rp = useMemo(() => getRankProgress(totalPoints), [totalPoints]);
  const color = RANK_COLORS[rank] || "#888";
  const nextColor = rp.nextRank ? (RANK_COLORS[rp.nextRank] || "#888") : color;

  return (
    <div className="mt-6 gradient-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-sm font-bold tracking-widest uppercase"
          style={{ color }}
        >
          {rank}
        </span>
        {rp.nextRank && (
          <span
            className="text-sm font-bold tracking-widest uppercase opacity-50"
            style={{ color: nextColor }}
          >
            {rp.nextRank}
          </span>
        )}
      </div>
      <div className="w-full h-3 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full rank-progress-bar transition-all duration-1000 ease-out"
          style={{
            width: `${Math.max(Math.min(rp.progress * 100, 100), 2)}%`,
            ["--bar-color" as string]: color,
            ["--bar-highlight" as string]: nextColor,
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-[#888] font-mono">
          {totalPoints.toFixed(1)} pts
        </span>
        {rp.nextRank ? (
          <span className="text-xs font-semibold" style={{ color: nextColor }}>
            {rp.pointsToNext} pts to {rp.nextRank.toUpperCase()}
          </span>
        ) : (
          <span className="text-xs font-semibold text-[#9333ea]">
            Max rank!
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Profile Page ────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [history, setHistory] = useState<SessionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [historyLimit, setHistoryLimit] = useState(20);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  function fetchProfile() {
    const token = getToken();
    if (!token) {
      router.replace("/join");
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([getProfile(token), getHistory(token, historyLimit + 1)])
      .then(([profileData, historyData]) => {
        setProfile(profileData);
        setHasMoreHistory(historyData.length > historyLimit);
        setHistory(historyData.slice(0, historyLimit));
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load profile";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loading state ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#00ff88] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#888] text-lg">Loading profile...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-xl text-[#ff3366] font-bold mb-4">
            {error ?? "Could not load profile"}
          </p>
          <button
            onClick={() => fetchProfile()}
            className="px-8 py-3 rounded-xl bg-[#00ff88] text-[#0a0a0a] font-bold cursor-pointer hover:bg-[#00e07a] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Profile loaded ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-32">
      {/* Header section */}
      <div className="px-6 pt-8 pb-6 border-b border-[#2a2a2a] bg-[#141414]">
        <div className="max-w-lg mx-auto">
          {/* Back button */}
          <button
            onClick={() => router.push("/")}
            className="text-[#888] text-sm font-medium mb-4 flex items-center gap-1 hover:text-[#f0f0f0] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          {/* Avatar + name + rank */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl sm:text-2xl font-black text-[#0a0a0a] shrink-0"
              style={{ backgroundColor: "#00ff88" }}
            >
              {profile.nickname[0]?.toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-black text-[#f0f0f0]">
                {profile.nickname}
              </h1>
              <div className="mt-1">
                <RankBadge rank={profile.rank} />
              </div>
            </div>
          </div>

          {/* Team info */}
          {profile.team_name && (
            <div className="mt-4 px-4 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] inline-flex items-center gap-2">
              <span className="text-sm text-[#888]">Team:</span>
              <span className="text-sm font-bold text-[#06b6d4]">
                {profile.team_name}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6">
        {/* Anonymous upgrade banner */}
        {!profile.email && (
          <div className="mt-6 px-5 py-4 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#00ff88]">Save your progress</p>
                <p className="text-xs text-[#888] mt-0.5">Register to keep your stats forever</p>
              </div>
              <button
                onClick={() => router.push("/register")}
                className="px-4 py-2 rounded-xl bg-[#00ff88] text-[#0a0a0a] text-sm font-bold
                  active:scale-95 transition-transform"
              >
                Upgrade
              </button>
            </div>
          </div>
        )}

        {/* Email verification banner */}
        {profile.email && !profile.email_verified && (
          <div className="mt-6 px-5 py-4 rounded-2xl bg-[#f59e0b]/10 border border-[#f59e0b]/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#f59e0b]">Verify your email</p>
                <p className="text-xs text-[#888] mt-0.5">
                  {verifyStatus === "sent"
                    ? "Verification email sent! Check your inbox."
                    : `We sent a link to ${profile.email}`}
                </p>
              </div>
              <button
                onClick={() => {
                  const token = getToken();
                  if (!token || verifyStatus === "sending" || verifyStatus === "sent") return;
                  setVerifyStatus("sending");
                  leagueSendVerification(token)
                    .then(() => setVerifyStatus("sent"))
                    .catch(() => setVerifyStatus("error"));
                }}
                disabled={verifyStatus === "sending" || verifyStatus === "sent"}
                className="px-4 py-2 rounded-xl bg-[#f59e0b] text-[#0a0a0a] text-sm font-bold
                  active:scale-95 transition-transform disabled:opacity-50"
              >
                {verifyStatus === "sending" ? "Sending..." : verifyStatus === "sent" ? "Sent" : "Resend"}
              </button>
            </div>
          </div>
        )}

        {/* Rank progression bar */}
        <RankProgressBar totalPoints={profile.total_points} rank={profile.rank} />

        {/* Stats grid — 2x2 */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <StatCard
            label="Total Points"
            value={profile.total_points.toFixed(1)}
            color="#00ff88"
          />
          <StatCard
            label="Total Reps"
            value={profile.total_reps.toLocaleString()}
          />
          <StatCard
            label="Best Session"
            value={profile.best_session_points.toFixed(1)}
            color="#06b6d4"
          />
          <StatCard
            label="Best Quality"
            value={(isFinite(profile.best_quality) ? profile.best_quality : 0).toFixed(2)}
            suffix="x"
            color="#f59e0b"
          />
        </div>

        {/* Streak section */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="gradient-card p-5 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-2">
              {profile.current_streak > 0 && (
                <span className="text-2xl streak-pulse" role="img" aria-label="streak">
                  <svg className="w-7 h-7 text-[#f59e0b]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 23c-4.97 0-9-3.58-9-8 0-3.07 2.31-6.64 4.5-9 .37-.4 1-.4 1.37 0C10.18 7.42 11 9.2 11 10.5c0 .28.22.5.5.5s.5-.22.5-.5c0-2.17 1.09-4.66 2.78-6.97a.75.75 0 011.22 0C17.69 5.97 21 9.93 21 15c0 4.42-4.03 8-9 8z" />
                  </svg>
                </span>
              )}
              <p className="text-3xl font-black font-mono text-[#f59e0b]">
                {profile.current_streak}
              </p>
            </div>
            <p className="text-xs text-[#888] font-semibold mt-1 tracking-wider uppercase">
              Current Streak
            </p>
          </div>
          <div className="gradient-card p-5 flex flex-col items-center justify-center text-center">
            <p className="text-3xl font-black font-mono text-[#888]">
              {profile.longest_streak}
            </p>
            <p className="text-xs text-[#888] font-semibold mt-1 tracking-wider uppercase">
              Longest Streak
            </p>
          </div>
        </div>

        {/* Streak continuation prompt */}
        {profile.current_streak > 0 && (
          <div className="mt-3 text-center">
            <p className="text-xs text-[#888]">
              Play tomorrow to keep your {profile.current_streak}-day streak alive!
              <span className="text-[#555] ml-1">(Resets at midnight UTC)</span>
            </p>
          </div>
        )}

        {/* Session history */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-[#f0f0f0] mb-4">Session History</h2>

          {history.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#888] text-lg">No sessions yet</p>
              <p className="text-[#555] text-sm mt-1">Play a round to see your history here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.slice(0, historyLimit).map((session) => (
                <div
                  key={session.id}
                  className="gradient-card p-4"
                >
                  {/* Date + mode */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-[#888] font-medium">
                      {formatDate(session.created_at)}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] uppercase font-semibold tracking-wide">
                      {session.mode}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <p className="text-lg font-black text-[#00ff88] font-mono">
                        {session.points_earned.toFixed(1)}
                      </p>
                      <p className="text-[10px] text-[#888] uppercase tracking-wide">Points</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-[#f0f0f0] font-mono">
                        {session.reps_counted}
                      </p>
                      <p className="text-[10px] text-[#888] uppercase tracking-wide">Reps</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-[#06b6d4] font-mono">
                        {(isFinite(session.avg_quality) ? session.avg_quality : 0).toFixed(2)}x
                      </p>
                      <p className="text-[10px] text-[#888] uppercase tracking-wide">Quality</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-[#f59e0b] font-mono">
                        {session.max_combo}x
                      </p>
                      <p className="text-[10px] text-[#888] uppercase tracking-wide">Combo</p>
                    </div>
                  </div>
                </div>
              ))}
              {hasMoreHistory && (
                <button
                  onClick={() => {
                    const newLimit = historyLimit + 20;
                    setHistoryLimit(newLimit);
                    const token = getToken();
                    if (token) {
                      getHistory(token, newLimit + 1).then((data) => {
                        setHasMoreHistory(data.length > newLimit);
                        setHistory(data.slice(0, newLimit));
                      }).catch(console.error);
                    }
                  }}
                  className="w-full py-3 text-sm font-medium text-[#888] hover:text-[#00ff88] border border-[#2a2a2a] hover:border-[#00ff88]/30 rounded-xl transition-colors cursor-pointer"
                >
                  Show More
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom buttons — fixed */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a] border-t border-[#2a2a2a] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex-1 py-4 rounded-2xl text-lg font-bold
              bg-[#1a1a1a] border border-[#2a2a2a] text-[#f0f0f0]
              active:scale-95 transition-transform"
          >
            HOME
          </button>
          <button
            onClick={() => router.push("/play")}
            className="flex-1 py-4 rounded-2xl text-lg font-black tracking-wider
              bg-[#00ff88] text-[#0a0a0a]
              active:scale-95 transition-transform pulse-neon"
          >
            PLAY AGAIN
          </button>
        </div>
      </div>
    </div>
  );
}
