"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/api";
import { getToken, getPlayer } from "@/lib/auth";
import { getRankProgress, checkAndUpdatePB } from "@/lib/ranks";
import { trackEvent } from "@/lib/analytics";
import { getReplayData, clearReplayData } from "@/lib/replayStore";
import type { ReplayData } from "@/lib/replayStore";
import VideoReplay from "@/components/VideoReplay";

interface SessionResult {
  session_id: string | null;
  points_earned: number;
  reps_counted: number;
  reps_total: number;
  avg_quality: number;
  max_combo: number;
  perfect_reps: number;
  rep_multipliers: number[];
  total_points?: number;
  rank?: string;
  current_streak?: number;
  streak_multiplier?: number;
  total_sessions?: number;
  save_error?: string | null;
  rep_details?: Array<{
    rep_number: number;
    composite_score: number;
    depth_score: number;
    stability_score: number;
    symmetry_score: number;
    tempo_score: number;
    rom_score: number;
  }> | null;
}

const RANK_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  elite: "#9333ea",
};

export default function ResultsPage() {
  const router = useRouter();

  const [results, setResults] = useState<SessionResult | null>(null);
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [nickname, setNickname] = useState("Player");
  const [rank, setRank] = useState("bronze");
  const [streak, setStreak] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [shareSupported, setShareSupported] = useState(false);

  const [isNewPB, setIsNewPB] = useState(false);
  const [streakMultiplier, setStreakMultiplier] = useState(1.0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [playerEmail, setPlayerEmail] = useState<string | null>(null);

  const [replayData, setReplayDataState] = useState<ReplayData | null>(null);
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasCompletedRef = useRef(false);

  // ── Rank progress (derived) ────────────────────────────────────────────
  const rankProgress = useMemo(() => getRankProgress(totalPoints), [totalPoints]);

  // ── Form feedback (derived from rep_details) ─────────────────────────
  const formFeedback = useMemo(() => {
    const reps = results?.rep_details;
    if (!reps || reps.length < 2) return null;

    const dims = [
      { key: "depth", label: "DEPTH", accessor: (r: (typeof reps)[0]) => r.depth_score },
      { key: "stability", label: "STABILITY", accessor: (r: (typeof reps)[0]) => r.stability_score },
      { key: "symmetry", label: "SYMMETRY", accessor: (r: (typeof reps)[0]) => r.symmetry_score },
      { key: "tempo", label: "TEMPO", accessor: (r: (typeof reps)[0]) => r.tempo_score },
      { key: "rom", label: "ROM", accessor: (r: (typeof reps)[0]) => r.rom_score },
    ] as const;

    const messages: Record<string, { low: string; mid: string; high: string }> = {
      depth: {
        low: "Go deeper — aim for your hip crease below your knees.",
        mid: "Getting close to parallel. Push a little deeper.",
        high: "Great depth — you're hitting parallel consistently.",
      },
      stability: {
        low: "Too much wobble — keep your heels planted and brace your core.",
        mid: "Fairly steady. Focus on keeping weight over mid-foot.",
        high: "Rock solid balance. Nice control.",
      },
      symmetry: {
        low: "Knees caving in — push your knees out over your toes.",
        mid: "Slight left-right imbalance. Even out your weight.",
        high: "Great symmetry — even weight distribution.",
      },
      tempo: {
        low: "Pace is all over the place — try a controlled 2-count down, 2-count up.",
        mid: "Getting more consistent. Match each rep's speed.",
        high: "Metronome-level consistency. Locked in.",
      },
      rom: {
        low: "Short range — go all the way down and fully stand up at the top.",
        mid: "Decent range. Extend fully at the top.",
        high: "Full range of motion every rep.",
      },
    };

    const scored = dims.map((d) => {
      const avg = Math.round(reps.reduce((s, r) => s + d.accessor(r), 0) / reps.length);
      const tier = avg >= 75 ? "high" : avg >= 50 ? "mid" : "low";
      return { ...d, avg, tier, message: messages[d.key][tier] };
    });

    const sorted = [...scored].sort((a, b) => a.avg - b.avg);
    const weakest = sorted[0];
    const strongest = sorted[sorted.length - 1];
    const allStrong = scored.every((s) => s.avg >= 75);

    // Best and worst rep
    let bestRep = reps[0];
    let worstRep = reps[0];
    for (const r of reps) {
      if (r.composite_score > bestRep.composite_score) bestRep = r;
      if (r.composite_score < worstRep.composite_score) worstRep = r;
    }

    return { scored, weakest, strongest, allStrong, bestRep, worstRep };
  }, [results]);

  // ── Achievement badges (derived) ─────────────────────────────────────
  const achievements = useMemo(() => {
    if (!results) return [];
    const badges: { icon: string; label: string }[] = [];

    // FIRST BLOOD: first session ever
    if (totalSessions === 1) {
      badges.push({ icon: "\u{1F3AF}", label: "FIRST BLOOD" });
    }
    // PERFECT FORM: avg_quality >= 0.90
    if (results.avg_quality >= 0.90) {
      badges.push({ icon: "\u{2728}", label: "PERFECT FORM" });
    }
    // COMBO KING: max_combo >= 10
    if (results.max_combo >= 10) {
      badges.push({ icon: "\u{1F451}", label: "COMBO KING" });
    }
    // IRON LEGS: reps_counted >= 20
    if (results.reps_counted >= 20) {
      badges.push({ icon: "\u{1F9BF}", label: "IRON LEGS" });
    }
    // CONSISTENCY: current_streak >= 7
    if (streak >= 7) {
      badges.push({ icon: "\u{1F525}", label: "CONSISTENCY" });
    }

    return badges;
  }, [results, totalSessions, streak]);

  // ── Track achievements ────────────────────────────────────────────────
  useEffect(() => {
    if (achievements.length === 0) return;
    achievements.forEach((a) => {
      trackEvent("achievement_earned", { achievement: a.label });
    });
  }, [achievements]);

  // ── Load session data ────────────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem("squatsense_results");
    if (!raw) {
      router.replace("/play");
      return;
    }

    try {
      const data: SessionResult = JSON.parse(raw);
      setResults(data);
      if (data.rank) setRank(data.rank);
      if (data.current_streak) setStreak(data.current_streak);
      if (data.total_points) setTotalPoints(data.total_points);
      if (data.streak_multiplier) setStreakMultiplier(data.streak_multiplier);
      if (data.total_sessions) setTotalSessions(data.total_sessions);

      // Check personal best
      const isPB = checkAndUpdatePB(data.points_earned);
      setIsNewPB(isPB);
    } catch {
      router.replace("/play");
      return;
    }

    // Get player info
    const player = getPlayer();
    if (player?.nickname) setNickname(player.nickname);

    // Load replay data (survives client-side navigation)
    const replay = getReplayData();
    if (replay) setReplayDataState(replay);

    // Check share API
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setShareSupported(true);
    }

    setLoaded(true);
  }, [router]);

  // ── Ensure session is completed server-side ──────────────────────────
  useEffect(() => {
    if (!results || hasCompletedRef.current) return;
    hasCompletedRef.current = true;

    const token = getToken();
    if (!token || !results.session_id) return;

    // Fetch latest profile to get up-to-date rank/streak
    getProfile(token)
      .then((profile) => {
        setRank(profile.rank);
        setStreak(profile.current_streak);
        setTotalPoints(profile.total_points);
        setNickname(profile.nickname);
        setTotalSessions(profile.total_sessions);
        setPlayerEmail(profile.email);
      })
      .catch(() => {
        // Profile fetch is best-effort; we already have session data
      });
  }, [results]);

  // ── Animated points counter ──────────────────────────────────────────
  useEffect(() => {
    if (!results) return;
    const target = results.points_earned;
    const duration = 1500; // ms
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedPoints(Math.round(eased * target * 10) / 10);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [results]);

  // ── Share card canvas rendering ──────────────────────────────────────
  const renderShareCard = useCallback(() => {
    const canvas = shareCanvasRef.current;
    if (!canvas || !results) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1080;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;

    // Clip with rounded corners
    const radius = 40;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(W - radius, 0);
    ctx.quadraticCurveTo(W, 0, W, radius);
    ctx.lineTo(W, H - radius);
    ctx.quadraticCurveTo(W, H, W - radius, H);
    ctx.lineTo(radius, H);
    ctx.quadraticCurveTo(0, H, 0, H - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();

    // Background
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);

    // Subtle grid pattern
    ctx.strokeStyle = "rgba(0, 255, 136, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(W, i);
      ctx.stroke();
    }

    // Top accent line
    const gradient = ctx.createLinearGradient(0, 0, W, 0);
    gradient.addColorStop(0, "#00ff88");
    gradient.addColorStop(1, "#06b6d4");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, 4);

    // "SQUATSENSE" logo text
    ctx.fillStyle = "#00ff88";
    ctx.font = "bold 48px 'Space Mono', monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 255, 136, 0.5)";
    ctx.shadowBlur = 20;
    ctx.fillText("SQUATSENSE", W / 2, 100);
    ctx.shadowBlur = 0;

    // Nickname + rank
    const rankColor = RANK_COLORS[rank] || "#888888";
    ctx.fillStyle = "#f0f0f0";
    ctx.font = "600 32px 'Inter', sans-serif";
    ctx.fillText(nickname, W / 2, 170);

    ctx.fillStyle = rankColor;
    ctx.font = "bold 24px 'Inter', sans-serif";
    ctx.fillText(rank.toUpperCase(), W / 2, 210);

    // Divider
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(140, 250);
    ctx.lineTo(W - 140, 250);
    ctx.stroke();

    // Large points number
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 160px 'Space Mono', monospace";
    ctx.shadowColor = "rgba(0, 255, 136, 0.3)";
    ctx.shadowBlur = 40;
    ctx.fillText(results.points_earned.toFixed(1), W / 2, 440);
    ctx.shadowBlur = 0;

    // "MOVEMENT POINTS" label
    ctx.fillStyle = "#00ff88";
    ctx.font = "bold 28px 'Space Mono', monospace";
    ctx.fillText("MOVEMENT POINTS", W / 2, 500);

    // Stats section — two columns
    const statsY = 580;
    const colLeft = W / 2 - 160;
    const colRight = W / 2 + 160;
    const rowGap = 90;

    const drawStat = (
      x: number,
      y: number,
      label: string,
      value: string,
      color = "#f0f0f0"
    ) => {
      ctx.fillStyle = color;
      ctx.font = "bold 48px 'Space Mono', monospace";
      ctx.fillText(value, x, y);
      ctx.fillStyle = "#888888";
      ctx.font = "500 20px 'Inter', sans-serif";
      ctx.fillText(label, x, y + 32);
    };

    drawStat(colLeft, statsY, "QUALITY", `${Math.round(results.avg_quality * 100)}%`, "#06b6d4");
    drawStat(colRight, statsY, "REPS", `${results.reps_counted}/${results.reps_total}`, "#f0f0f0");
    drawStat(colLeft, statsY + rowGap, "MAX COMBO", `x${results.max_combo}`, "#06b6d4");
    drawStat(colRight, statsY + rowGap, "PERFECT", `${results.perfect_reps}`, "#00ff88");

    // Bottom streak if applicable
    if (streak > 0) {
      ctx.fillStyle = "#ffbf00";
      ctx.font = "bold 28px 'Inter', sans-serif";
      ctx.fillText(`${streak} Day Streak`, W / 2, 830);
    }

    // Bottom divider
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.moveTo(140, 880);
    ctx.lineTo(W - 140, 880);
    ctx.stroke();

    // "squatsense.ai" footer
    ctx.fillStyle = "#00ff88";
    ctx.font = "bold 28px 'Space Mono', monospace";
    ctx.shadowColor = "rgba(0, 255, 136, 0.4)";
    ctx.shadowBlur = 15;
    ctx.fillText("squatsense.ai", W / 2, 940);
    ctx.shadowBlur = 0;

    // Tagline
    ctx.fillStyle = "#888888";
    ctx.font = "400 20px 'Inter', sans-serif";
    ctx.fillText("Move More. Move Better.", W / 2, 980);

    // Bottom accent line
    ctx.fillStyle = gradient;
    ctx.fillRect(0, H - 4, W, 4);
  }, [results, nickname, rank, streak]);

  // Render share card when data loads
  useEffect(() => {
    if (loaded && results) {
      // Small delay to ensure canvas is mounted
      setTimeout(renderShareCard, 100);
    }
  }, [loaded, results, renderShareCard]);

  // ── Download share card ──────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const canvas = shareCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `squatsense-${results?.points_earned ?? 0}pts.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [results]);

  // ── Share ────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const canvas = shareCanvasRef.current;
    if (!canvas) return;

    if (shareSupported) {
      try {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const file = new File([blob], "squatsense-results.png", {
            type: "image/png",
          });
          await navigator.share({
            title: "SquatSense Results",
            text: `I scored ${results?.points_earned ?? 0} Movement Points in 30 seconds! Can you beat that?`,
            files: [file],
          });
        }, "image/png");
      } catch {
        // Share cancelled or failed — fallback to copy
        await navigator.clipboard.writeText(
          `I scored ${results?.points_earned ?? 0} Movement Points on SquatSense! squatsense.ai`
        );
      }
    } else {
      // Fallback: copy text
      await navigator.clipboard.writeText(
        `I scored ${results?.points_earned ?? 0} Movement Points on SquatSense! squatsense.ai`
      );
      alert("Link copied to clipboard!");
    }
  }, [results, shareSupported]);

  // ── Loading state ────────────────────────────────────────────────────
  if (!loaded || !results) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#00ff88] text-xl font-mono animate-pulse">
          Loading results...
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center px-4 py-8 overflow-y-auto">
      {/* Save error warning */}
      {results.save_error && (
        <div className="fade-in-up w-full max-w-lg lg:max-w-xl mb-4">
          <div className="px-4 py-3 bg-[#ffbf00]/10 border border-[#ffbf00]/30 rounded-xl text-center">
            <p className="text-[#ffbf00] text-sm font-mono">
              Session not saved: {results.save_error}
            </p>
            <p className="text-[#888888] text-xs mt-1">
              Results below are from this device only.
            </p>
          </div>
        </div>
      )}

      {/* SESSION COMPLETE header */}
      <div className="fade-in-up w-full max-w-lg lg:max-w-xl">
        <h1
          className="text-center text-3xl font-bold text-[#00ff88] neon-text mb-2"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          SESSION COMPLETE
        </h1>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#00ff88]/40 to-transparent mb-8" />
      </div>

      {/* Personal best celebration */}
      {isNewPB && (
        <div className="fade-in-up w-full max-w-lg lg:max-w-xl mb-4">
          <div className="personal-best-glow text-center text-xl sm:text-2xl font-black tracking-wider"
            style={{ fontFamily: "'Space Mono', monospace" }}
          >
            NEW PERSONAL BEST!
          </div>
        </div>
      )}

      {/* Big animated points counter */}
      <div
        className="fade-in-up flex flex-col items-center mb-8"
        style={{ animationDelay: "0.15s" }}
      >
        <div
          className="text-5xl sm:text-6xl lg:text-7xl font-black text-white"
          style={{
            fontFamily: "'Space Mono', monospace",
            textShadow: "0 0 40px rgba(0, 255, 136, 0.3)",
          }}
        >
          {animatedPoints.toFixed(1)}
        </div>
        <div
          className="text-sm text-[#00ff88] tracking-[0.3em] mt-1 font-semibold"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          MOVEMENT POINTS
        </div>
      </div>

      {/* Video replay */}
      {replayData && (
        <div
          className="fade-in-up w-full max-w-lg lg:max-w-xl mb-8"
          style={{ animationDelay: "0.25s" }}
        >
          <h2
            className="text-sm text-[#888888] tracking-widest uppercase mb-3 text-center"
            style={{ fontFamily: "'Space Mono', monospace" }}
          >
            Session Replay
          </h2>
          <VideoReplay
            videoBlob={replayData.videoBlob}
            frameData={replayData.frameData}
            showControls
            repDetails={results.rep_details}
          />
        </div>
      )}

      {/* Stats grid — 2 columns */}
      <div
        className="fade-in-up grid grid-cols-2 gap-4 w-full max-w-lg lg:max-w-xl mb-8"
        style={{ animationDelay: "0.3s" }}
      >
        <StatCard
          label="Reps"
          value={`${results.reps_counted}/${results.reps_total}`}
          color="#f0f0f0"
        />
        <StatCard
          label="Avg Quality"
          value={`${Math.round(results.avg_quality * 100)}%`}
          color="#06b6d4"
        />
        <StatCard
          label="Max Combo"
          value={`x${results.max_combo}`}
          color="#06b6d4"
        />
        <StatCard
          label="Perfect Reps"
          value={`${results.perfect_reps}`}
          color="#00ff88"
        />
      </div>

      {/* Your Form feedback — fallback for 0-1 reps */}
      {!formFeedback && results && results.reps_counted < 2 && results.reps_counted >= 0 && (
        <div
          className="fade-in-up w-full max-w-lg lg:max-w-xl mb-8"
          style={{ animationDelay: "0.32s" }}
        >
          <div className="gradient-card p-5 text-center">
            <p className="text-[#888] text-sm mb-2">
              {results.reps_counted === 0
                ? "No reps detected this round."
                : "Need at least 2 reps for form analysis."}
            </p>
            <p className="text-[#666] text-xs">
              Tip: Face the camera from the side and make sure your full body is visible.
            </p>
          </div>
        </div>
      )}

      {/* Your Form feedback */}
      {formFeedback && (
        <div
          className="fade-in-up w-full max-w-lg lg:max-w-xl mb-8"
          style={{ animationDelay: "0.32s" }}
        >
          <div className="gradient-card p-5">
            <h2
              className="text-sm text-[#888888] tracking-widest uppercase mb-4"
              style={{ fontFamily: "'Space Mono', monospace" }}
            >
              Your Form
            </h2>

            {/* Dimension bars */}
            <div className="flex flex-col gap-3 mb-5">
              {formFeedback.scored.map((d) => {
                const barColor =
                  d.avg >= 75 ? "#00ff88" : d.avg >= 50 ? "#ffbf00" : "#ff3366";
                return (
                  <div key={d.key} className="flex items-center gap-3">
                    <span
                      className="text-xs text-[#888888] w-20 text-right tracking-wider shrink-0"
                      style={{ fontFamily: "'Space Mono', monospace" }}
                    >
                      {d.label}
                    </span>
                    <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${d.avg}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-bold w-8 text-right"
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        color: barColor,
                      }}
                    >
                      {d.avg}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Coaching messages */}
            <div className="flex flex-col gap-2 mb-4">
              {formFeedback.allStrong ? (
                <p className="text-sm text-[#00ff88]">
                  Your form is solid across the board. Keep it up.
                </p>
              ) : (
                <>
                  <p className="text-sm text-[#00ff88]">
                    <span className="font-bold mr-1">*</span>
                    {formFeedback.strongest.message}
                  </p>
                  <p
                    className="text-sm"
                    style={{
                      color:
                        formFeedback.weakest.avg < 50 ? "#ff3366" : "#ffbf00",
                    }}
                  >
                    <span className="font-bold mr-1">&rarr;</span>
                    {formFeedback.weakest.message}
                  </p>
                </>
              )}
            </div>

            {/* Best / Worst rep */}
            <div className="flex items-center justify-between text-xs text-[#888888] border-t border-[#222222] pt-3">
              <span style={{ fontFamily: "'Space Mono', monospace" }}>
                BEST REP:{" "}
                <span className="text-[#00ff88] font-bold">
                  #{formFeedback.bestRep.rep_number} (
                  {Math.round(formFeedback.bestRep.composite_score)})
                </span>
              </span>
              <span style={{ fontFamily: "'Space Mono', monospace" }}>
                WORST:{" "}
                <span className="text-[#ff3366] font-bold">
                  #{formFeedback.worstRep.rep_number} (
                  {Math.round(formFeedback.worstRep.composite_score)})
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Streak bonus display */}
      {streakMultiplier > 1.0 && (
        <div
          className="fade-in-up w-full max-w-lg lg:max-w-xl mb-4"
          style={{ animationDelay: "0.35s" }}
        >
          <div className="text-center">
            <span
              className="inline-block text-lg font-black tracking-widest"
              style={{
                fontFamily: "'Space Mono', monospace",
                color: "#ff8800",
                textShadow: "0 0 12px rgba(255, 136, 0, 0.6), 0 0 24px rgba(255, 136, 0, 0.3)",
              }}
            >
              {streakMultiplier.toFixed(1)}x STREAK BONUS
            </span>
          </div>
        </div>
      )}

      {/* Achievement badges */}
      {achievements.length > 0 && (
        <div
          className="fade-in-up flex flex-wrap justify-center gap-3 w-full max-w-lg lg:max-w-xl mb-6"
          style={{ animationDelay: "0.38s" }}
        >
          {achievements.map((a) => (
            <div
              key={a.label}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/10"
            >
              <span className="text-2xl">{a.icon}</span>
              <span
                className="text-sm font-black tracking-wider text-[#f59e0b]"
                style={{ fontFamily: "'Space Mono', monospace" }}
              >
                {a.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Daily progress */}
      <div
        className="fade-in-up w-full max-w-lg lg:max-w-xl mb-6"
        style={{ animationDelay: "0.45s" }}
      >
        <div className="gradient-card p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-[#888888]">Session Progress</span>
            <span className="text-[#f0f0f0] font-semibold">
              {results.reps_counted}/50 reps today
            </span>
          </div>
          <div className="w-full h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.min((results.reps_counted / 50) * 100, 100)}%`,
                background: "linear-gradient(90deg, #00ff88, #06b6d4)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Streak display + play-tomorrow nudge */}
      {streak > 0 && (
        <div
          className="fade-in-up w-full max-w-lg lg:max-w-xl mb-8"
          style={{ animationDelay: "0.55s" }}
        >
          <div className="gradient-card p-4">
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl streak-pulse" role="img" aria-label="fire">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 23C16.5 23 20 19.5 20 15C20 11 17 8 15 6C14 5 13.5 3 14 1C11 3 9 6 9 8C9 9 8.5 9 8 8.5C7.5 8 7 7 7 6C5 8 4 11 4 14C4 19 7.5 23 12 23Z"
                    fill="#ffbf00"
                    stroke="#ff8800"
                    strokeWidth="1"
                  />
                </svg>
              </span>
              <span
                className="text-xl font-bold text-[#ffbf00]"
                style={{ fontFamily: "'Space Mono', monospace" }}
              >
                {streak} Day Streak!
              </span>
            </div>
            <p className="text-center text-xs text-[#888888] mt-2">
              Play tomorrow to keep your streak alive!
            </p>
          </div>
        </div>
      )}

      {/* Rank progression */}
      {rank && (
        <div
          className="fade-in-up w-full max-w-lg lg:max-w-xl mb-8"
          style={{ animationDelay: "0.6s" }}
        >
          <div className="gradient-card p-4">
            {/* Current rank label */}
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-sm font-bold tracking-widest uppercase"
                style={{ color: RANK_COLORS[rank] || "#888888" }}
              >
                {rank} RANK
              </span>
              {totalPoints > 0 && (
                <span className="text-xs text-[#888888] font-mono">
                  {Math.round(totalPoints)} pts
                </span>
              )}
            </div>

            {/* Progress bar to next rank */}
            {rankProgress.nextRank ? (
              <>
                <div className="w-full h-2.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full rank-progress-bar transition-all duration-1000 ease-out"
                    style={{
                      width: `${Math.max(Math.min(rankProgress.progress * 100, 100), 2)}%`,
                      ["--bar-color" as string]: RANK_COLORS[rank] || "#888",
                      ["--bar-highlight" as string]: RANK_COLORS[rankProgress.nextRank] || "#fff",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-[#888888]">
                    {Math.round(rankProgress.progress * 100)}%
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: RANK_COLORS[rankProgress.nextRank] || "#888" }}
                  >
                    {rankProgress.pointsToNext} pts to {rankProgress.nextRank.toUpperCase()}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center text-xs text-[#9333ea] mt-1 font-semibold">
                Maximum rank achieved!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share Card Preview */}
      <div
        className="fade-in-up w-full max-w-lg lg:max-w-xl mb-6"
        style={{ animationDelay: "0.7s" }}
      >
        <h2
          className="text-sm text-[#888888] tracking-widest uppercase mb-3 text-center"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          Share Card
        </h2>
        <div className="gradient-card p-3 flex justify-center">
          <canvas
            ref={shareCanvasRef}
            className="w-full max-w-xs rounded-lg"
            style={{ aspectRatio: "1/1" }}
          />
        </div>
        <div className="flex gap-3 mt-4 justify-center">
          <button
            onClick={handleDownload}
            className="px-6 py-3 bg-[#141414] text-white font-semibold rounded-xl
                       border border-[#2a2a2a] hover:border-[#00ff88]/50 transition-colors cursor-pointer"
          >
            Download
          </button>
          <button
            onClick={handleShare}
            className="px-6 py-3 bg-[#141414] text-[#06b6d4] font-semibold rounded-xl
                       border border-[#2a2a2a] hover:border-[#06b6d4]/50 transition-colors cursor-pointer"
          >
            {shareSupported ? "Share" : "Copy Link"}
          </button>
        </div>
      </div>

      {/* Account upgrade CTA for anonymous players */}
      {!playerEmail && (
        <div
          className="fade-in-up w-full max-w-lg lg:max-w-xl mb-6"
          style={{ animationDelay: "0.8s" }}
        >
          <div className="gradient-card p-4 border border-[#f59e0b]/30">
            <p
              className="text-center text-sm font-bold tracking-wider text-[#f59e0b] mb-2"
              style={{ fontFamily: "'Space Mono', monospace" }}
            >
              SAVE YOUR PROGRESS
            </p>
            <p className="text-center text-xs text-[#888888] mb-3">
              Create an account to keep your scores, streaks, and rank across devices.
            </p>
            <button
              onClick={() => router.push("/register")}
              className="w-full py-3 bg-[#f59e0b]/10 text-[#f59e0b] font-semibold text-sm rounded-xl
                         border border-[#f59e0b]/30 hover:border-[#f59e0b]/60 hover:bg-[#f59e0b]/20
                         transition-colors cursor-pointer"
            >
              CREATE ACCOUNT
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div
        className="fade-in-up flex flex-col gap-3 w-full max-w-lg lg:max-w-xl mt-4 mb-8"
        style={{ animationDelay: "0.85s" }}
      >
        <button
          onClick={() => {
            sessionStorage.removeItem("squatsense_results");
            clearReplayData();
            router.push("/play");
          }}
          className="w-full py-4 bg-[#00ff88] text-[#0a0a0a] font-bold text-lg rounded-xl
                     hover:bg-[#00cc6e] transition-colors pulse-neon cursor-pointer"
        >
          PLAY AGAIN
        </button>
        <button
          onClick={() => router.push("/leaderboard")}
          className="w-full py-4 bg-[#141414] text-[#06b6d4] font-semibold text-lg rounded-xl
                     border border-[#2a2a2a] hover:border-[#06b6d4]/40 transition-colors cursor-pointer"
        >
          LEADERBOARD
        </button>
        <button
          onClick={() => router.push("/profile")}
          className="w-full py-4 bg-[#141414] text-white font-semibold text-lg rounded-xl
                     border border-[#2a2a2a] hover:border-[#00ff88]/40 transition-colors cursor-pointer"
        >
          VIEW PROFILE
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

// ── StatCard component ─────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="gradient-card p-4 flex flex-col items-center gap-1">
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
