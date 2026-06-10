"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getTeamAnalytics,
  type TeamAnalyticsResponse,
} from "@/lib/api";

// ── Avatar helper (same palette as arena) ────────────────────────────────
const AVATAR_COLORS = [
  "#00ff88", "#06b6d4", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Stat card ────────────────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 text-center">
      <p
        className="text-4xl sm:text-5xl font-black font-mono tabular-nums mb-2"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="text-xs font-bold text-[#888888] tracking-[0.2em] uppercase">{label}</p>
    </div>
  );
}

// ── CSS-only bar sparkline for the 30-day window ─────────────────────────
function SessionsSparkline({ days }: { days: { date: string; sessions: number }[] }) {
  const max = Math.max(...days.map((d) => d.sessions), 1);
  return (
    <div className="flex items-end gap-[3px] h-28 w-full">
      {days.map((d) => {
        const pct = d.sessions > 0 ? Math.max((d.sessions / max) * 100, 6) : 0;
        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col justify-end h-full"
            title={`${d.date}: ${d.sessions} session${d.sessions !== 1 ? "s" : ""}`}
          >
            <div
              className={`w-full rounded-t-sm ${
                d.sessions > 0 ? "bg-[#00ff88]" : "bg-[#2a2a2a]"
              }`}
              style={{ height: d.sessions > 0 ? `${pct}%` : "2px" }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────
export default function TeamAnalyticsPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  const [data, setData] = useState<TeamAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    getTeamAnalytics(code)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      })
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-[#888888] font-mono animate-pulse">Loading analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-3xl font-black text-[#ff3366] mb-4">COULD NOT LOAD ANALYTICS</p>
        <p className="text-[#888888] mb-8">{error ?? "Team not found."}</p>
        <Link
          href="/setup"
          className="border-2 border-[#00ff88]/50 text-[#00ff88] font-bold px-8 py-3 rounded-xl hover:bg-[#00ff88]/10 transition-colors"
        >
          GO TO SETUP
        </Link>
      </div>
    );
  }

  const hasSessions = data.total_sessions > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-6 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-bold tracking-[0.3em] text-[#06b6d4] uppercase mb-2">
              Team Analytics
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {data.team_name}
              <span className="text-[#00ff88]">.</span>
            </h1>
            <p
              className="text-sm text-[#888888] mt-1 font-mono tracking-[0.2em]"
            >
              CODE: {data.team_code}
            </p>
          </div>
          <Link
            href={`/arena/${data.team_code}`}
            className="shrink-0 border-2 border-[#2a2a2a] text-[#888888] hover:text-[#00ff88] hover:border-[#00ff88]/40 font-bold text-sm px-6 py-3 rounded-xl transition-colors text-center"
          >
            OPEN ARENA DISPLAY
          </Link>
        </div>

        {!hasSessions ? (
          /* Honest empty state */
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl px-8 py-16 text-center">
            <p className="text-3xl font-black text-white mb-3">No sessions yet</p>
            <p className="text-[#888888] max-w-md mx-auto mb-8">
              Analytics will appear here after the first 30-second blitz on your kiosk.
              Put the arena display on a screen and let your team scan the QR code.
            </p>
            <Link
              href={`/arena/${data.team_code}`}
              className="inline-block bg-[#00ff88] text-black font-bold px-8 py-3 rounded-xl hover:bg-[#00e07a] transition-colors"
            >
              LAUNCH ARENA DISPLAY
            </Link>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <StatCard
                label="Total Sessions"
                value={data.total_sessions.toLocaleString()}
                accent="#00ff88"
              />
              <StatCard
                label="Unique Players"
                value={data.unique_players.toLocaleString()}
                accent="#06b6d4"
              />
              <StatCard
                label="Avg Score"
                value={data.avg_score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                accent="#f59e0b"
              />
            </div>

            {/* 30-day activity sparkline */}
            <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-8">
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs font-bold text-[#888888] tracking-[0.2em] uppercase">
                  Sessions per day
                </p>
                <p className="text-xs text-[#555555] font-mono">LAST 30 DAYS</p>
              </div>
              <SessionsSparkline days={data.sessions_per_day} />
              <div className="flex justify-between mt-2 text-[10px] text-[#555555] font-mono">
                <span>{data.sessions_per_day[0]?.date}</span>
                <span>{data.sessions_per_day[data.sessions_per_day.length - 1]?.date}</span>
              </div>
            </div>

            {/* Top players */}
            <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs font-bold text-[#888888] tracking-[0.2em] uppercase mb-5">
                Top players by best score
              </p>
              <div className="space-y-3">
                {data.top_players.map((player, i) => (
                  <div
                    key={player.nickname}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a]"
                  >
                    <span className="w-6 text-center font-black text-[#555555] font-mono">
                      {i + 1}
                    </span>
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[#0a0a0a] shrink-0"
                      style={{ backgroundColor: avatarColor(player.avatar_seed) }}
                    >
                      {player.nickname[0]?.toUpperCase()}
                    </div>
                    <span className="flex-1 font-bold text-white truncate">
                      {player.nickname}
                    </span>
                    <span className="font-black text-[#00ff88] font-mono tabular-nums">
                      {Math.round(player.best_score).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Footnote */}
        <p className="text-center text-xs text-[#555555] mt-10">
          Stats cover real player sessions for this team. Internal test accounts are excluded.
        </p>
      </div>
    </div>
  );
}
