"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/api";
import { getPlayer } from "@/lib/auth";

const RANK_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  elite: "#9333ea",
};

type Period = "today" | "week" | "alltime";

export default function LeaderboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const player = getPlayer();
    if (player) setCurrentPlayerId(player.player_id);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getLeaderboard(period)
      .then(setEntries)
      .catch((err) => {
        setEntries([]);
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      })
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center px-4 py-8">
      {/* Header */}
      <div className="w-full max-w-lg lg:max-w-xl mb-6">
        <h1
          className="text-center text-2xl sm:text-3xl font-bold text-[#00ff88] neon-text mb-2"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          LEADERBOARD
        </h1>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#00ff88]/40 to-transparent" />
      </div>

      {/* Period tabs */}
      <div className="flex gap-2 mb-6">
        {(["today", "week", "alltime"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 text-sm font-mono rounded-lg transition-colors cursor-pointer ${
              period === p
                ? "bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40"
                : "bg-[#141414] text-[#888888] border border-[#2a2a2a] hover:border-[#444]"
            }`}
          >
            {p === "alltime" ? "ALL TIME" : p.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Leaderboard list */}
      <div className="w-full max-w-lg lg:max-w-xl">
        {loading ? (
          <div className="text-center text-[#00ff88] font-mono animate-pulse py-12">
            Loading...
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-[#ff3366] text-lg font-semibold mb-2">Something went wrong</p>
            <p className="text-[#888888] text-sm mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                getLeaderboard(period)
                  .then(setEntries)
                  .catch((err) => {
                    setEntries([]);
                    setError(err instanceof Error ? err.message : "Failed to load leaderboard");
                  })
                  .finally(() => setLoading(false));
              }}
              className="px-6 py-2 text-sm font-bold text-[#00ff88] border border-[#00ff88]/40 rounded-lg hover:bg-[#00ff88]/10 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-[#888888] py-12">
            <p className="text-lg mb-2">No sessions yet</p>
            <p className="text-sm">Be the first to play!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const isMe = entry.player_id === currentPlayerId;
              const rankColor = RANK_COLORS[entry.rank] || "#888888";

              return (
                <div
                  key={entry.player_id}
                  className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-colors ${
                    isMe
                      ? "bg-[#00ff88]/10 border border-[#00ff88]/30"
                      : "bg-[#141414] border border-[#1a1a1a]"
                  }`}
                >
                  {/* Position */}
                  <div
                    className={`w-10 text-center font-mono font-bold text-lg flex flex-col items-center ${
                      entry.position === 1
                        ? "text-[#ffd700]"
                        : entry.position === 2
                        ? "text-[#c0c0c0]"
                        : entry.position === 3
                        ? "text-[#cd7f32]"
                        : "text-[#666666]"
                    }`}
                  >
                    <span>{entry.position}</span>
                    {entry.position === 1 && (
                      <span className="text-[9px] font-bold tracking-wider">1st</span>
                    )}
                    {entry.position === 2 && (
                      <span className="text-[9px] font-bold tracking-wider">2nd</span>
                    )}
                    {entry.position === 3 && (
                      <span className="text-[9px] font-bold tracking-wider">3rd</span>
                    )}
                  </div>

                  {/* Avatar circle */}
                  <div
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold"
                    style={{
                      backgroundColor: `${rankColor}20`,
                      border: `2px solid ${rankColor}60`,
                      color: rankColor,
                    }}
                  >
                    {entry.nickname.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Name + rank */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-semibold truncate ${
                          isMe ? "text-[#00ff88]" : "text-[#f0f0f0]"
                        }`}
                      >
                        {entry.nickname}
                      </span>
                      {isMe && (
                        <span className="text-[10px] text-[#00ff88] bg-[#00ff88]/10 px-1.5 py-0.5 rounded font-mono">
                          YOU
                        </span>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-bold tracking-widest uppercase"
                      style={{ color: rankColor }}
                    >
                      {entry.rank}
                    </span>
                  </div>

                  {/* Points */}
                  <div className="text-right">
                    <div
                      className="text-base sm:text-lg font-bold font-mono tabular-nums text-white"
                      style={{ fontFamily: "'Space Mono', monospace" }}
                    >
                      {entry.value.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-[#888888] tracking-wider">
                      PTS
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex flex-col gap-3 w-full max-w-lg lg:max-w-xl mt-8">
        <button
          onClick={() => router.push("/play")}
          className="w-full py-4 bg-[#00ff88] text-[#0a0a0a] font-bold text-lg rounded-xl
                     hover:bg-[#00cc6e] transition-colors pulse-neon cursor-pointer"
        >
          PLAY BLITZ
        </button>
        <button
          onClick={() => router.push("/")}
          className="w-full py-3 text-[#888888] hover:text-white transition-colors text-sm cursor-pointer"
        >
          HOME
        </button>
      </div>
    </div>
  );
}
