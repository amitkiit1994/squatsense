"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionShare } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";

const RANK_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  elite: "#9333ea",
};

interface SessionData {
  session_id: string;
  nickname: string;
  rank: string;
  points_earned: number;
  reps_counted: number;
  reps_total: number;
  avg_quality: number;
  max_combo: number;
  perfect_reps: number;
  created_at: string;
}

interface ShareClientProps {
  sessionId: string;
  initialData: SessionData | null;
}

export default function ShareClient({ sessionId, initialData }: ShareClientProps) {
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(initialData);
  const [loading, setLoading] = useState(initialData === null);
  const trackedRef = useRef(false);

  // ── Client-side fallback fetch (via Next.js rewrite proxy) ──────────
  useEffect(() => {
    if (initialData !== null) return;
    let cancelled = false;
    getSessionShare(sessionId)
      .then((session) => {
        if (!cancelled) setData(session);
      })
      .catch(() => {
        // Session not found or backend unreachable — show not-found state
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialData, sessionId]);

  // ── Track share page view (once) ─────────────────────────────────────
  useEffect(() => {
    if (!data || trackedRef.current) return;
    trackedRef.current = true;
    trackEvent("share_page_viewed", {
      session_id: sessionId,
      points: data.points_earned,
    });
  }, [data, sessionId]);

  // ── Loading state ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#00ff88] text-xl font-mono animate-pulse">
          Loading score card...
        </div>
      </div>
    );
  }

  // ── Not found state ──────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4">
        <h1
          className="text-2xl font-bold text-[#00ff88] mb-4"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          Session Not Found
        </h1>
        <p className="text-[#888888] text-center mb-8 max-w-md">
          This score card may have expired or the session was not saved.
        </p>
        <button
          onClick={() => router.push("/")}
          className="px-8 py-3 bg-[#00ff88] text-[#0a0a0a] font-bold rounded-xl
                     hover:bg-[#00cc6e] transition-colors cursor-pointer"
        >
          PLAY SQUATSENSE
        </button>
      </div>
    );
  }

  const rankColor = RANK_COLORS[data.rank] || "#888888";

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center px-4 py-8">
      {/* Header */}
      <div className="w-full max-w-lg">
        <h1
          className="text-center text-2xl font-bold text-[#00ff88] mb-1"
          style={{
            fontFamily: "'Space Mono', monospace",
            textShadow: "0 0 20px rgba(0, 255, 136, 0.4)",
          }}
        >
          SQUATSENSE
        </h1>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#00ff88]/40 to-transparent mb-8" />
      </div>

      {/* Score card */}
      <div className="w-full max-w-lg">
        <div
          className="rounded-2xl border border-[#1a1a1a] p-6 sm:p-8"
          style={{
            background: "linear-gradient(180deg, #111111 0%, #0a0a0a 100%)",
          }}
        >
          {/* Player info */}
          <div className="text-center mb-6">
            <p className="text-xl font-semibold text-[#f0f0f0] mb-1">
              {data.nickname}
            </p>
            <p
              className="text-sm font-bold tracking-widest uppercase"
              style={{ color: rankColor }}
            >
              {data.rank} RANK
            </p>
          </div>

          {/* Big points display */}
          <div className="text-center mb-6">
            <div
              className="text-5xl sm:text-6xl font-black text-white mb-1"
              style={{
                fontFamily: "'Space Mono', monospace",
                textShadow: "0 0 40px rgba(0, 255, 136, 0.3)",
              }}
            >
              {data.points_earned.toFixed(1)}
            </div>
            <div
              className="text-sm text-[#00ff88] tracking-[0.3em] font-semibold"
              style={{ fontFamily: "'Space Mono', monospace" }}
            >
              MOVEMENT POINTS
            </div>
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#222222] to-transparent mb-6" />

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <ShareStat
              label="Reps"
              value={`${data.reps_counted}/${data.reps_total}`}
              color="#f0f0f0"
            />
            <ShareStat
              label="Avg Quality"
              value={`${Math.round(data.avg_quality * 100)}%`}
              color="#06b6d4"
            />
            <ShareStat
              label="Max Combo"
              value={`x${data.max_combo}`}
              color="#06b6d4"
            />
            <ShareStat
              label="Perfect Reps"
              value={`${data.perfect_reps}`}
              color="#00ff88"
            />
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="w-full max-w-lg mt-8 flex flex-col gap-3">
        <button
          onClick={() => {
            trackEvent("share_page_play_clicked", { session_id: sessionId });
            router.push("/join");
          }}
          className="w-full py-4 bg-[#00ff88] text-[#0a0a0a] font-bold text-lg rounded-xl
                     hover:bg-[#00cc6e] transition-colors cursor-pointer"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          BEAT THIS SCORE
        </button>
        <p className="text-center text-xs text-[#888888]">
          30-second squat game. AI scores your form in real time.
        </p>
      </div>
    </div>
  );
}

// ── ShareStat component ──────────────────────────────────────────────────

function ShareStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="text-center">
      <div
        className="text-xl sm:text-2xl font-bold"
        style={{ color, fontFamily: "'Space Mono', monospace" }}
      >
        {value}
      </div>
      <div className="text-xs text-[#888888] tracking-wider uppercase">
        {label}
      </div>
    </div>
  );
}
