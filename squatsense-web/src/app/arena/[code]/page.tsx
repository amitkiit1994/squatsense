"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { QRCodeSVG } from "qrcode.react";
import {
  getTeam,
  getTeamLeaderboard,
  getTeamToday,
  registerKiosk,
  getKioskPending,
  kioskSessionStarted,
  kioskSessionComplete,
  startSession,
  completeSession,
  type TeamResponse,
  type LeaderboardEntry,
  type CompleteSessionResponse,
  type KioskPendingResponse,
  type KioskSessionCompleteBody,
} from "@/lib/api";
import { useCamera } from "@/hooks/useCamera";
import { useWebSocket } from "@/hooks/useWebSocket";
import { usePoseCalibration } from "@/hooks/usePoseCalibration";
import { getRankProgress, RANK_COLORS } from "@/lib/ranks";
import type { ReplayFrame } from "@/lib/replayStore";
import VideoReplay from "@/components/VideoReplay";

// ── Avatar helper ────────────────────────────────────────────────────────
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

// ── Rank badge ───────────────────────────────────────────────────────────
function RankBadge({ rank, large }: { rank: string; large?: boolean }) {
  const cls = large ? "text-2xl font-bold" : "text-lg font-semibold";
  const labels: Record<string, { label: string; color: string }> = {
    bronze: { label: "BRONZE", color: "#cd7f32" },
    silver: { label: "SILVER", color: "#c0c0c0" },
    gold:   { label: "GOLD",   color: "#ffd700" },
    elite:  { label: "ELITE",  color: "#9333ea" },
  };
  const info = labels[rank] ?? labels.bronze;
  return (
    <span className={cls} style={{ color: info.color }}>
      {info.label}
    </span>
  );
}

// ── Skeleton overlay ─────────────────────────────────────────────────────
const SKELETON_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [27, 31], [28, 30], [28, 32],
];

function SkeletonOverlay({ landmarks, width, height }: {
  landmarks: [number, number][];
  width: number;
  height: number;
}) {
  if (landmarks.length === 0) return null;
  return (
    <svg
      className="absolute inset-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ pointerEvents: "none" }}
    >
      {/* Note: backend landmarks are already in pixel coordinates */}
      {SKELETON_CONNECTIONS.map(([a, b], i) => {
        if (!landmarks[a] || !landmarks[b]) return null;
        return (
          <line
            key={i}
            x1={landmarks[a][0]}
            y1={landmarks[a][1]}
            x2={landmarks[b][0]}
            y2={landmarks[b][1]}
            stroke="#00ff88"
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
      {landmarks.map((lm, i) => (
        <circle
          key={i}
          cx={lm[0]}
          cy={lm[1]}
          r={5}
          fill="#06b6d4"
          stroke="#0a0a0a"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

// ── Pose connections for calibration skeleton overlay ─────────────────────
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
  [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
];

// ── Calibration check item (used in calibrating phase) ───────────────────
function CalibrationCheckItem({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-4 px-6 py-3 rounded-xl bg-[#141414] border border-[#2a2a2a]">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold ${
          passed
            ? "bg-[#00ff88]/20 text-[#00ff88] border-2 border-[#00ff88]/40"
            : "bg-[#ff3366]/20 text-[#ff3366] border-2 border-[#ff3366]/40"
        }`}
      >
        {passed ? "\u2713" : "\u2717"}
      </div>
      <span
        className={`text-2xl font-mono font-bold ${
          passed ? "text-[#00ff88]" : "text-[#888888]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ── Motivational taglines (rotate on the idle screen) ────────────────────
const TAGLINES = [
  "THINK YOU CAN BEAT THE TOP SCORE?",
  "30 SECONDS. INFINITE GLORY.",
  "YOUR LEGS. YOUR LEGACY.",
  "WHO\u2019S NEXT?",
  "EVERY SQUAT COUNTS.",
  "CRUSH IT. CLIMB THE BOARD.",
  "BE THE ONE EVERYONE\u2019S CHASING.",
  "THE LEADERBOARD AWAITS.",
];

// ── Position medal for top 3 ─────────────────────────────────────────────
function PositionMedal({ position }: { position: number }) {
  if (position === 1) return <span className="text-4xl">&#x1F947;</span>;
  if (position === 2) return <span className="text-4xl">&#x1F948;</span>;
  if (position === 3) return <span className="text-4xl">&#x1F949;</span>;
  return (
    <span className="text-3xl font-black text-[#555] font-mono w-10 text-center">
      {position}
    </span>
  );
}

// ── Achievement badge component ──────────────────────────────────────────
function AchievementBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/10"
      style={{ animation: "fade-in-up 0.5s ease-out both" }}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-black tracking-wider text-[#f59e0b]">
        {label}
      </span>
    </div>
  );
}

// ── Main Arena Page ──────────────────────────────────────────────────────
type Screen = "leaderboard" | "blitz" | "results";

export default function ArenaPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  // ── Screen state ─────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>("leaderboard");

  // ── Team & kiosk ─────────────────────────────────────────────────────
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [kioskId, setKioskId] = useState<string | null>(null);

  // ── Leaderboard ──────────────────────────────────────────────────────
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<"today" | "week">("week"); // (j) default to week
  const [teamStats, setTeamStats] = useState<{
    points_today: number;
    active_players: number;
    reps_today: number;
  } | null>(null);

  // ── Pending player ───────────────────────────────────────────────────
  const [pendingNickname, setPendingNickname] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  // ── Queue display (b) ───────────────────────────────────────────────
  const [queueSize, setQueueSize] = useState(0);
  const [nextUpNickname, setNextUpNickname] = useState<string | null>(null);

  // ── Blitz state ──────────────────────────────────────────────────────
  const [blitzPhase, setBlitzPhase] = useState<"ready" | "calibrating" | "countdown" | "active" | "ending">("ready");
  const [countdown, setCountdown] = useState(3);
  const [timer, setTimer] = useState(30);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const frameLoopRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Results state ────────────────────────────────────────────────────
  const [results, setResults] = useState<CompleteSessionResponse | null>(null);
  const [displayedPoints, setDisplayedPoints] = useState(0);
  const [resultsCountdown, setResultsCountdown] = useState(15); // (c) visible countdown

  // ── Combo milestones ───────────────────────────────────────────────
  const [comboMilestone, setComboMilestone] = useState<number | null>(null);
  const lastMilestoneRef = useRef(0);

  // ── Rotating tagline ──────────────────────────────────────────────
  const [taglineIndex, setTaglineIndex] = useState(0);

  // ── WS disconnect overlay (f) ─────────────────────────────────────
  const [wsDisconnected, setWsDisconnected] = useState(false);

  // ── Init error state ────────────────────────────────────────────────
  const [initError, setInitError] = useState<string | null>(null);

  // ── Idle mode (g) ────────────────────────────────────────────────────
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Personal best (m) ────────────────────────────────────────────────
  const [isPersonalBest, setIsPersonalBest] = useState(false);

  // ── Replay state (video + skeleton overlay for results screen) ──────
  const [replayBlob, setReplayBlob] = useState<Blob | null>(null);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[]>([]);

  // ── Auto-pull pending ref for results timer (d) ─────────────────────
  const pendingDataRef = useRef<KioskPendingResponse | null>(null);

  // ── Hooks ────────────────────────────────────────────────────────────
  const camera = useCamera();
  const ws = useWebSocket();
  const {
    isModelLoading: calibModelLoading,
    modelError: calibModelError,
    landmarks: calibrationLandmarks,
    calibration: calibrationStatus,
    isReady: calibrationReady,
    start: startCalibration,
    stop: stopCalibration,
  } = usePoseCalibration();

  const calibrationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blitzStartedRef = useRef(false);

  // ── Init: fetch team + register kiosk ────────────────────────────────
  useEffect(() => {
    if (!code) return;
    setInitError(null);
    Promise.all([
      getTeam(code).then(setTeam),
      registerKiosk(code).then((res) => setKioskId(res.kiosk_id)),
    ]).catch((err) => {
      console.error("Kiosk init failed:", err);
      setInitError(err instanceof Error ? err.message : "Failed to connect. Check team code and try again.");
    });
  }, [code]);

  // ── Leaderboard polling (every 15s) ──────────────────────────────────
  useEffect(() => {
    if (screen !== "leaderboard" || !code) return;
    let cancelled = false;

    const fetchLb = () => {
      getTeamLeaderboard(code, period).then((data) => {
        if (!cancelled) setLeaderboard(data.slice(0, 10));
      }).catch(console.error);
    };

    fetchLb();
    const iv = setInterval(fetchLb, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [screen, code, period]);

  // ── Toggle period every 15s ──────────────────────────────────────────
  useEffect(() => {
    if (screen !== "leaderboard") return;
    const iv = setInterval(() => {
      setPeriod((p) => (p === "today" ? "week" : "today"));
    }, 15_000);
    return () => clearInterval(iv);
  }, [screen]);

  // ── Team stats polling ───────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "leaderboard" || !code) return;
    let cancelled = false;

    const fetchStats = () => {
      getTeamToday(code).then((data) => {
        if (!cancelled) setTeamStats(data);
      }).catch(console.error);
    };

    fetchStats();
    const iv = setInterval(fetchStats, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [screen, code]);

  // ── Rotate tagline every 5s ─────────────────────────────────────────
  useEffect(() => {
    if (screen !== "leaderboard") return;
    const iv = setInterval(() => {
      setTaglineIndex((i) => (i + 1) % TAGLINES.length);
    }, 5_000);
    return () => clearInterval(iv);
  }, [screen]);

  // ── Poll for pending player (every 2s) ───────────────────────────────
  useEffect(() => {
    if (screen !== "leaderboard" || !kioskId) return;
    let cancelled = false;

    const poll = () => {
      getKioskPending(kioskId).then((data) => {
        if (cancelled) return;

        // (b) Update queue display state
        setQueueSize(data.queue_size ?? 0);
        setNextUpNickname(data.has_pending && data.nickname ? data.nickname : null);

        // (g) Reset idle timer on any queue activity
        if (data.has_pending && data.nickname) {
          setIsIdle(false);
          resetIdleTimer();
        }

        if (data.has_pending && data.nickname) {
          setPendingNickname(data.nickname);
          setPlayerId(data.player_id ?? null);
          setScreen("blitz");
        }
      }).catch(console.error);
    };

    poll();
    const iv = setInterval(poll, 2_000);
    return () => { cancelled = true; clearInterval(iv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, kioskId]);

  // ── Idle mode timer (g) — 5 minutes of inactivity ──────────────────
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setIsIdle(false);
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, 5 * 60 * 1000); // 5 minutes
  }, []);

  useEffect(() => {
    if (screen !== "leaderboard") {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      setIsIdle(false);
      return;
    }
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [screen, resetIdleTimer]);

  // ── WS disconnect detection during blitz (f) ─────────────────────────
  useEffect(() => {
    if (screen === "blitz" && blitzPhase === "active") {
      // If was connected and now disconnected, show overlay
      if (!ws.isConnected && sessionId) {
        setWsDisconnected(true);
      } else {
        setWsDisconnected(false);
      }
    } else {
      setWsDisconnected(false);
    }
  }, [ws.isConnected, screen, blitzPhase, sessionId]);

  // ── Blitz flow ───────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "blitz") return;

    // Phase 1: "GET READY" for 3 seconds, then transition to calibrating
    setBlitzPhase("ready");
    setCountdown(3);
    setTimer(30);
    blitzStartedRef.current = false;

    const readyTimeout = setTimeout(() => {
      setBlitzPhase("calibrating");
    }, 3_000);

    return () => clearTimeout(readyTimeout);
  }, [screen]);

  // ── Start camera when entering calibrating phase ──────────────────
  useEffect(() => {
    if (screen !== "blitz" || blitzPhase !== "calibrating") return;
    camera.startCamera();
  }, [screen, blitzPhase, camera]);

  // ── Start calibration once camera is active ────────────────────────
  useEffect(() => {
    if (screen !== "blitz" || blitzPhase !== "calibrating" || !camera.isActive) return;
    const video = camera.videoRef.current;
    if (video) startCalibration(video);
    return () => stopCalibration();
  }, [screen, blitzPhase, camera.isActive, camera.videoRef, startCalibration, stopCalibration]);

  // ── Draw calibration skeleton overlay ──────────────────────────────
  useEffect(() => {
    const canvas = calibrationCanvasRef.current;
    const video = camera.videoRef.current;
    if (!canvas || !video || blitzPhase !== "calibrating") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    if (!calibrationLandmarks || calibrationLandmarks.length === 0) return;

    const color = "#06b6d4"; // cyan during calibration

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.8;
    for (const [a, b] of POSE_CONNECTIONS) {
      if (a < calibrationLandmarks.length && b < calibrationLandmarks.length) {
        const lmA = calibrationLandmarks[a];
        const lmB = calibrationLandmarks[b];
        ctx.beginPath();
        ctx.moveTo(lmA.x * w, lmA.y * h);
        ctx.lineTo(lmB.x * w, lmB.y * h);
        ctx.stroke();
      }
    }

    ctx.fillStyle = color;
    ctx.globalAlpha = 1.0;
    for (const lm of calibrationLandmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [calibrationLandmarks, blitzPhase, camera.videoRef]);

  // ── Auto-start countdown when calibration passes ───────────────────
  useEffect(() => {
    if (screen !== "blitz" || blitzPhase !== "calibrating" || !calibrationReady) return;
    if (blitzStartedRef.current) return;
    blitzStartedRef.current = true;
    stopCalibration();
    setBlitzPhase("countdown");
  }, [screen, blitzPhase, calibrationReady, stopCalibration]);

  // ── Countdown effect (3-2-1-GO -> active) ───────────────────────────
  useEffect(() => {
    if (screen !== "blitz" || blitzPhase !== "countdown") return;

    let c = 3;
    setCountdown(c);
    const countdownIv = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(countdownIv);
        setBlitzPhase("active");
        startBlitz();
      } else {
        setCountdown(c);
      }
    }, 1_000);

    return () => clearInterval(countdownIv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, blitzPhase]);

  // ── Start the actual blitz (camera + ws + timer) ─────────────────────
  const startBlitz = useCallback(async () => {
    // Notify server that session started and get player token
    let activeToken = playerToken;
    if (kioskId) {
      try {
        const startedRes = await kioskSessionStarted(kioskId);
        if (startedRes.access_token) {
          activeToken = startedRes.access_token;
          setPlayerToken(activeToken);
        }
      } catch (err) {
        console.error("Failed to start kiosk session:", err);
      }
    }

    // Stop calibration to free WASM resources
    stopCalibration();

    // Start session via API
    let sid = "";
    if (activeToken) {
      try {
        const sess = await startSession(activeToken, "arena");
        sid = sess.session_id;
        setSessionId(sid);
        trackEvent("session_started", { session_id: sid, mode: "arena", kiosk_id: kioskId });
      } catch (err) {
        console.error("Failed to start session:", err);
      }
    }

    // Camera is already started from calibrating phase -- no need to start again

    // Start recording + frame data collection for replay
    camera.startRecording();
    ws.markBlitzStart();

    // Connect websocket
    if (sid) ws.connect(sid);

    // Start timer
    let remaining = 30;
    setTimer(remaining);
    timerRef.current = setInterval(() => {
      remaining--;
      setTimer(Math.max(remaining, 0));
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        endBlitz(sid);
      }
    }, 1_000);

    // Start frame capture loop (10fps)
    const captureLoop = async () => {
      if (remaining <= 0) return;
      const frame = await camera.captureFrame();
      if (frame) ws.sendFrame(frame);
      frameLoopRef.current = window.setTimeout(captureLoop, 100);
    };
    captureLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kioskId, playerToken, camera, ws, stopCalibration]);

  // ── End blitz ────────────────────────────────────────────────────────
  const endBlitz = useCallback(async (sid?: string) => {
    setBlitzPhase("ending");
    if (timerRef.current) clearInterval(timerRef.current);
    if (frameLoopRef.current) clearTimeout(frameLoopRef.current);

    // Stop WS and wait for summary
    await ws.stopAndWaitForSummary(5_000);

    // Capture replay data before stopping camera
    const videoBlob = await camera.stopRecording();
    const frames = ws.getFrameData();
    setReplayBlob(videoBlob);
    setReplayFrames(frames);

    camera.stopCamera();
    ws.disconnect();

    // Complete session
    const effectiveSid = sid || sessionId;
    if (effectiveSid && playerToken) {
      try {
        const result = await completeSession(
          playerToken,
          effectiveSid,
          ws.repFormScores,
          30
        );
        setResults(result);
        trackEvent("session_completed", {
          session_id: effectiveSid,
          mode: "arena",
          points: result.points_earned,
          reps: result.reps_counted,
          quality: result.avg_quality,
        });

        // (m) Personal best check using localStorage
        const pbKey = playerId ? `pb_${playerId}` : null;
        if (pbKey) {
          const storedPb = parseInt(localStorage.getItem(pbKey) ?? "0", 10);
          if (result.points_earned > storedPb) {
            setIsPersonalBest(true);
            localStorage.setItem(pbKey, String(result.points_earned));
          } else {
            setIsPersonalBest(false);
          }
        } else {
          // Fallback heuristic: if points_earned == total_points, it's their first/best
          if (result.points_earned >= result.total_points * 0.9 && result.points_earned > 0) {
            setIsPersonalBest(true);
          } else {
            setIsPersonalBest(false);
          }
        }

        // (e) Post results for phone via kioskSessionComplete
        if (kioskId && playerId) {
          const body: KioskSessionCompleteBody = {
            player_id: playerId,
            points_earned: result.points_earned,
            reps_counted: result.reps_counted,
            reps_total: result.reps_total,
            avg_quality: result.avg_quality,
            max_combo: result.max_combo,
            perfect_reps: result.perfect_reps,
            total_points: result.total_points,
            rank: result.rank,
            current_streak: result.current_streak,
            capped: result.capped,
          };
          kioskSessionComplete(kioskId, body).catch(console.error);
        }
      } catch (err) {
        console.error("Failed to complete session:", err);
        setResults({
          points_earned: ws.movementPoints,
          reps_counted: ws.countedReps,
          reps_total: ws.repCount,
          avg_quality: ws.repMultipliers.length
            ? ws.repMultipliers.reduce((a, b) => a + b, 0) / ws.repMultipliers.length
            : 0,
          max_combo: ws.maxCombo,
          perfect_reps: ws.perfectReps,
          total_points: 0,
          rank: "bronze",
          current_streak: 0,
          streak_multiplier: 1.0,
          capped: false,
        });
        setIsPersonalBest(false);
      }
    }

    setScreen("results");
  }, [sessionId, playerToken, playerId, kioskId, ws, camera]);

  // ── Results: animated count-up + auto-return with countdown (c, d) ──
  useEffect(() => {
    if (screen !== "results") return;

    const target = results?.points_earned ?? ws.movementPoints;
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 60));
    const iv = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(iv);
      }
      setDisplayedPoints(current);
    }, 16);

    // (c) Visible countdown from 15s
    let remaining = 15;
    setResultsCountdown(remaining);
    const countdownIv = setInterval(() => {
      remaining--;
      setResultsCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownIv);
      }
    }, 1_000);

    // (c, d) Auto-return after 15s, check for auto-pull
    const returnTimeout = setTimeout(() => {
      handleResultsTimerExpired();
    }, 15_000);

    // (d) Also poll for pending during results screen so we have fresh data
    let pendingPollCancelled = false;
    const pollPending = () => {
      if (!kioskId || pendingPollCancelled) return;
      getKioskPending(kioskId).then((data) => {
        if (!pendingPollCancelled) {
          pendingDataRef.current = data;
        }
      }).catch(console.error);
    };
    pollPending();
    const pendingIv = setInterval(pollPending, 3_000);

    return () => {
      clearInterval(iv);
      clearInterval(countdownIv);
      clearTimeout(returnTimeout);
      pendingPollCancelled = true;
      clearInterval(pendingIv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, results]);

  // ── Handle results timer expiration / skip (d) ─────────────────────
  const handleResultsTimerExpired = useCallback(() => {
    const pending = pendingDataRef.current;
    if (pending?.has_pending && pending.nickname) {
      // (d) Auto-pull: skip leaderboard, go directly to blitz for next player
      setPendingNickname(pending.nickname);
      setPlayerId(pending.player_id ?? null);
      setSessionId(null);
      setResults(null);
      setDisplayedPoints(0);
      setBlitzPhase("ready");
      setTimer(30);
      setIsPersonalBest(false);
      setReplayBlob(null);
      setReplayFrames([]);
      blitzStartedRef.current = false;
      stopCalibration();
      setScreen("blitz");
    } else {
      resetToLeaderboard();
    }
  }, [stopCalibration]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Combo milestone detection (5x, 10x, 15x, 20x) ─────────────────
  useEffect(() => {
    if (screen !== "blitz" || blitzPhase !== "active") return;
    const milestone = Math.floor(ws.currentCombo / 5) * 5;
    if (milestone >= 5 && milestone > lastMilestoneRef.current) {
      lastMilestoneRef.current = milestone;
      setComboMilestone(milestone);
      setTimeout(() => setComboMilestone(null), 2000);
    }
    if (ws.currentCombo === 0) {
      lastMilestoneRef.current = 0;
    }
  }, [ws.currentCombo, screen, blitzPhase]);

  // ── Reset state for leaderboard ──────────────────────────────────────
  const resetToLeaderboard = useCallback(() => {
    setPendingNickname(null);
    setPlayerToken(null);
    setPlayerId(null);
    setSessionId(null);
    setResults(null);
    setDisplayedPoints(0);
    setBlitzPhase("ready");
    setTimer(30);
    setIsPersonalBest(false);
    setReplayBlob(null);
    setReplayFrames([]);
    blitzStartedRef.current = false;
    pendingDataRef.current = null;
    stopCalibration();
    setScreen("leaderboard");
  }, [stopCalibration]);

  // ── Keyboard controls (c, l) ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // (c) Space/Enter to skip results timer
      if (screen === "results" && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault();
        handleResultsTimerExpired();
        return;
      }

      // (l) R to reset to leaderboard
      if (e.code === "KeyR") {
        e.preventDefault();
        resetToLeaderboard();
        return;
      }

      // (l) F for fullscreen toggle
      if (e.code === "KeyF") {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(console.error);
        } else {
          document.documentElement.requestFullscreen().catch(console.error);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [screen, handleResultsTimerExpired, resetToLeaderboard]);

  // ── QR URL ───────────────────────────────────────────────────────────
  const qrUrl =
    typeof window !== "undefined" && kioskId
      ? `${window.location.origin}/kiosk-join/${kioskId}`
      : "";

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  // ── Init error screen ────────────────────────────────────────────────
  if (initError) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] text-center px-10">
        <p className="text-6xl font-black text-[#ff3366] mb-6">CONNECTION FAILED</p>
        <p className="text-2xl text-[#888] mb-10 max-w-2xl">{initError}</p>
        <button
          onClick={() => {
            setInitError(null);
            if (code) {
              Promise.all([
                getTeam(code).then(setTeam),
                registerKiosk(code).then((res) => setKioskId(res.kiosk_id)),
              ]).catch((err) => {
                setInitError(err instanceof Error ? err.message : "Failed to connect.");
              });
            }
          }}
          className="px-10 py-4 bg-[#00ff88] text-black text-2xl font-bold rounded-xl hover:bg-[#00e07a] transition-colors cursor-pointer"
        >
          RETRY
        </button>
      </div>
    );
  }

  // ── Leaderboard screen ───────────────────────────────────────────────
  if (screen === "leaderboard") {
    const topScore = leaderboard.length > 0 ? Math.round(leaderboard[0].value) : 0;

    return (
      <div
        className={`fixed inset-0 flex flex-col bg-[#0a0a0a] overflow-hidden transition-opacity duration-1000 ${
          isIdle ? "opacity-80" : "opacity-100"
        }`}
        style={isIdle ? {
          animation: "idle-gradient 8s ease-in-out infinite",
        } : undefined}
      >
        {/* Top banner */}
        <div className="flex items-center justify-between px-10 py-5 border-b border-[#2a2a2a] bg-[#0a0a0a]">
          <div className="flex items-center gap-4">
            <h1 className="text-5xl 2xl:text-6xl font-black tracking-wider text-[#00ff88] neon-text">
              {team?.name ?? code}
            </h1>
            <span className="text-sm font-bold tracking-[0.2em] text-[#888] border border-[#2a2a2a] px-3 py-1 rounded-full">
              SQUAT ARENA
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className={`text-lg font-bold font-mono transition-colors ${
              period === "today" ? "text-[#00ff88]" : "text-[#888]"
            }`}>
              TODAY
            </span>
            <span className="text-[#555]">/</span>
            <span className={`text-lg font-bold font-mono transition-colors ${
              period === "week" ? "text-[#00ff88]" : "text-[#888]"
            }`}>
              THIS WEEK
            </span>
          </div>
        </div>

        {/* Main area */}
        <div className="flex flex-1 min-h-0">
          {/* Leaderboard */}
          <div className="flex-1 overflow-hidden px-10 py-6">
            {leaderboard.length > 0 ? (
              <div className="space-y-3">
                {leaderboard.map((entry) => {
                  const isTop3 = entry.position <= 3;
                  return (
                    <div
                      key={entry.player_id}
                      className={`flex items-center gap-5 px-6 py-4 rounded-2xl transition-all ${
                        entry.position === 1
                          ? "bg-gradient-to-r from-[#ffd700]/10 to-transparent border border-[#ffd700]/20"
                          : entry.position === 2
                          ? "bg-gradient-to-r from-[#c0c0c0]/10 to-transparent border border-[#c0c0c0]/15"
                          : entry.position === 3
                          ? "bg-gradient-to-r from-[#cd7f32]/10 to-transparent border border-[#cd7f32]/15"
                          : "bg-[#141414]/50 border border-[#1a1a1a]"
                      }`}
                    >
                      {/* Position */}
                      <div className="w-14 flex justify-center shrink-0">
                        <PositionMedal position={entry.position} />
                      </div>

                      {/* Avatar */}
                      <div
                        className={`${isTop3 ? "w-14 h-14 2xl:w-[4.5rem] 2xl:h-[4.5rem] text-2xl 2xl:text-3xl" : "w-11 h-11 2xl:w-14 2xl:h-14 text-lg 2xl:text-xl"} rounded-full flex items-center justify-center font-bold text-[#0a0a0a] shrink-0`}
                        style={{ backgroundColor: avatarColor(entry.avatar_seed) }}
                      >
                        {entry.nickname[0]?.toUpperCase()}
                      </div>

                      {/* Name */}
                      <span className={`${isTop3 ? "text-2xl 2xl:text-3xl" : "text-xl 2xl:text-2xl"} font-bold truncate flex-1`}>
                        {entry.nickname}
                      </span>

                      {/* Rank */}
                      <RankBadge rank={entry.rank} />

                      {/* Points */}
                      <span className={`${isTop3 ? "text-3xl 2xl:text-4xl" : "text-2xl 2xl:text-3xl"} font-black text-[#00ff88] font-mono tabular-nums min-w-[120px] 2xl:min-w-[160px] text-right`}>
                        {Math.round(entry.value).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Empty state -- big CTA */
              <div className="flex flex-col items-center justify-center h-full text-center gap-6">
                <div className="text-8xl mb-2">&#x1F3CB;&#xFE0F;</div>
                <p className="text-4xl font-black text-white">
                  BE THE FIRST TO PLAY!
                </p>
                <p className="text-xl text-[#888] max-w-md">
                  Scan the QR code, do 30 seconds of squats, and claim the #1 spot on the leaderboard.
                </p>
                <div className="flex items-center gap-3 mt-4">
                  <div className="w-3 h-3 rounded-full bg-[#00ff88] animate-pulse" />
                  <span className="text-lg text-[#00ff88] font-mono">WAITING FOR CHALLENGERS...</span>
                </div>
              </div>
            )}
          </div>

          {/* QR code panel -- bigger, more prominent */}
          <div className="flex flex-col items-center justify-center px-10 py-6 border-l border-[#2a2a2a] w-80 2xl:w-[420px] bg-[#0d0d0d]">
            {qrUrl && (
              <div className="flex flex-col items-center gap-6">
                {/* QR with glowing border */}
                <div className="qr-glow-border p-1 rounded-3xl">
                  <div className="bg-white p-5 2xl:p-7 rounded-2xl">
                    <QRCodeSVG value={qrUrl} size={280} level="M" />
                  </div>
                </div>

                {/* CTA */}
                <div className="text-center">
                  <p className="text-3xl font-black text-[#00ff88] neon-text tracking-widest pulse-neon-text">
                    SCAN TO PLAY
                  </p>
                  <p className="text-sm text-[#888] mt-2 font-mono">
                    30-second squat challenge
                  </p>
                </div>

                {/* (b) Queue display */}
                {queueSize > 0 && nextUpNickname && (
                  <div className="text-center mt-1 px-5 py-3 rounded-xl border border-[#f59e0b]/20 bg-[#f59e0b]/5">
                    <p className="text-lg font-black text-[#f59e0b] tracking-wider">
                      NEXT UP: {nextUpNickname.toUpperCase()}
                    </p>
                    <p className="text-sm font-mono text-[#888] mt-1">
                      IN QUEUE: {queueSize}
                    </p>
                  </div>
                )}

                {/* Top score to beat */}
                {topScore > 0 && (
                  <div className="text-center mt-2 px-5 py-3 rounded-xl border border-[#ffd700]/20 bg-[#ffd700]/5">
                    <p className="text-xs text-[#888] tracking-widest mb-1">SCORE TO BEAT</p>
                    <p className="text-4xl font-black text-[#ffd700] font-mono">
                      {topScore.toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Rotating tagline */}
                <p
                  className="text-sm font-bold text-[#555] tracking-widest text-center max-w-[220px] min-h-[40px] flex items-center justify-center"
                  key={taglineIndex}
                  style={{ animation: "fade-in-up 0.5s ease-out" }}
                >
                  {TAGLINES[taglineIndex]}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom stats ticker -- more visual */}
        <div className="flex items-center justify-center gap-8 2xl:gap-16 px-8 py-5 2xl:py-6 border-t border-[#2a2a2a] bg-[#111111]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#x1F4AA;</span>
            <div>
              <span className="text-3xl 2xl:text-4xl font-black text-[#00ff88] font-mono">
                {teamStats?.reps_today?.toLocaleString() ?? 0}
              </span>
              <span className="text-lg 2xl:text-xl text-[#888] ml-2">squats today</span>
            </div>
          </div>
          <div className="w-px h-8 bg-[#2a2a2a]" />
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#x1F465;</span>
            <div>
              <span className="text-3xl 2xl:text-4xl font-black text-[#06b6d4] font-mono">
                {teamStats?.active_players ?? 0}
              </span>
              <span className="text-lg 2xl:text-xl text-[#888] ml-2">players</span>
            </div>
          </div>
          <div className="w-px h-8 bg-[#2a2a2a]" />
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#x2B50;</span>
            <div>
              <span className="text-3xl 2xl:text-4xl font-black text-[#ffd700] font-mono">
                {teamStats?.points_today?.toLocaleString() ?? 0}
              </span>
              <span className="text-lg 2xl:text-xl text-[#888] ml-2">total points</span>
            </div>
          </div>
        </div>

        {/* (g) Idle mode CSS animation injected as style tag */}
        {isIdle && (
          <style>{`
            @keyframes idle-gradient {
              0%, 100% { background: #0a0a0a; }
              50% { background: linear-gradient(135deg, #0a0a0a 0%, #111118 50%, #0a0a0a 100%); }
            }
          `}</style>
        )}
      </div>
    );
  }

  // ── Blitz screen ─────────────────────────────────────────────────────
  if (screen === "blitz") {
    // "GET READY" phase
    if (blitzPhase === "ready") {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0a]">
          <div className="text-center fade-in-up">
            <p className="text-5xl 2xl:text-7xl font-black text-[#00ff88] neon-text tracking-widest mb-4">
              GET READY,
            </p>
            <p className="text-7xl 2xl:text-9xl font-black text-white">
              {pendingNickname?.toUpperCase()}!
            </p>
          </div>
        </div>
      );
    }

    // Calibrating phase -- camera feed + skeleton overlay + positioning checklist
    if (blitzPhase === "calibrating") {
      return (
        <div className="fixed inset-0 bg-[#0a0a0a] overflow-hidden">
          <div className="flex h-full">
            {/* Camera feed -- left side (70%) */}
            <div className="relative flex-1">
              <video
                ref={camera.videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              <canvas ref={camera.canvasRef} className="hidden" />
              {/* Calibration skeleton overlay */}
              <canvas
                ref={calibrationCanvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ transform: "scaleX(-1)" }}
              />
              {/* Gradient overlay for readability */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0a0a0a]/40" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/60 via-transparent to-[#0a0a0a]/40" />

              {/* Player name badge -- top left */}
              <div className="absolute top-8 left-8">
                <p className="text-4xl font-black text-white" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
                  {pendingNickname?.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Calibration panel -- right side (30%) */}
            <div className="w-96 2xl:w-[480px] bg-[#0a0a0a] flex flex-col items-center justify-center px-8 2xl:px-12 py-10 gap-8 border-l border-[#2a2a2a]">
              <div className="text-center">
                <p className="text-4xl 2xl:text-5xl font-black text-[#00ff88] neon-text tracking-widest mb-3">
                  POSITION CHECK
                </p>
                <p className="text-lg text-[#888]">
                  Stand back ~6 feet &bull; Full body visible
                </p>
              </div>

              {/* Checklist */}
              <div className="w-full space-y-3">
                {calibModelLoading ? (
                  <p className="text-[#06b6d4] text-xl text-center animate-pulse font-mono py-6">
                    Loading pose model...
                  </p>
                ) : calibModelError ? (
                  <div className="text-center py-6">
                    <p className="text-[#ff3366] text-lg font-mono mb-2">
                      Pose detection unavailable
                    </p>
                    <p className="text-[#ff6666] text-sm font-mono mb-4">
                      Reps will not be counted
                    </p>
                    <button
                      onClick={() => {
                        blitzStartedRef.current = true;
                        stopCalibration();
                        setBlitzPhase("countdown");
                      }}
                      className="px-8 py-4 bg-[#555555] text-white font-bold text-xl rounded-xl
                                 hover:bg-[#666666] transition-colors cursor-pointer"
                    >
                      START ANYWAY
                    </button>
                  </div>
                ) : (
                  <>
                    <CalibrationCheckItem
                      label="Full body visible"
                      passed={calibrationStatus.bodyVisible}
                    />
                    <CalibrationCheckItem
                      label="Properly framed"
                      passed={calibrationStatus.properlyFramed}
                    />
                    <CalibrationCheckItem
                      label="Centered in frame"
                      passed={calibrationStatus.centered}
                    />
                  </>
                )}
              </div>

              {/* Auto-starting indicator */}
              {calibrationReady && (
                <div className="flex items-center gap-3 px-6 py-4 bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl">
                  <div className="w-4 h-4 rounded-full bg-[#00ff88] animate-pulse" />
                  <span className="text-[#00ff88] font-bold font-mono text-2xl">
                    STARTING BLITZ...
                  </span>
                </div>
              )}

              {/* Waiting indicator when checks aren't all passing */}
              {!calibModelLoading && !calibModelError && !calibrationReady && (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#06b6d4] animate-pulse" />
                  <span className="text-[#888] font-mono text-lg">
                    Waiting for position...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Countdown phase
    if (blitzPhase === "countdown") {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0a]">
          <div className="text-center">
            <p
              className={`font-black text-[#00ff88] neon-text count-animate ${countdown > 0 ? "text-[16rem] 2xl:text-[20rem]" : "text-[12rem] 2xl:text-[16rem]"}`}
              key={countdown}
            >
              {countdown > 0 ? countdown : "GO!"}
            </p>
          </div>
        </div>
      );
    }

    // Active blitz / ending
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] overflow-hidden flex flex-col">
        {/* ── Header Bar ─────────────────────────────────────────── */}
        <div className="shrink-0 h-16 2xl:h-20 blitz-bar border-b flex items-center justify-between px-8 z-20">
          {/* Timer — left/center */}
          <div className="flex-1">
            <p
              className={`text-6xl 2xl:text-8xl font-black font-mono ${
                timer <= 5 ? "timer-critical" : "text-white"
              }`}
            >
              {timer}
            </p>
          </div>

          {/* Combo — right */}
          <div className="flex-1 flex justify-end">
            {ws.currentCombo >= 2 && (
              <div className="text-right combo-shake">
                <p className="text-5xl 2xl:text-7xl font-black text-[#f59e0b]">
                  {ws.currentCombo}x
                </p>
                <p className="text-xl 2xl:text-2xl font-bold text-[#f59e0b]/70">COMBO</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Video Zone ─────────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
          <div className="relative w-full max-w-7xl aspect-[4/3] rounded-3xl overflow-hidden border-2 border-[#2a2a2a] bg-[#141414]">
            {/* Camera feed */}
            <video
              ref={camera.videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              style={{ transform: "scaleX(-1)" }}
            />
            <canvas ref={camera.canvasRef} className="hidden" />

            {/* Skeleton overlay — viewBox matches camera's native resolution */}
            <SkeletonOverlay
              landmarks={ws.landmarks}
              width={camera.videoRef.current?.videoWidth || 640}
              height={camera.videoRef.current?.videoHeight || 480}
            />

            {/* Points — center */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none z-20">
              <p className="text-[10rem] 2xl:text-[12vw] leading-none font-black text-[#00ff88] neon-text font-mono tabular-nums">
                {Math.round(ws.movementPoints)}
              </p>
              <p className="text-3xl 2xl:text-4xl font-bold text-[#888] mt-2">MOVEMENT POINTS</p>
              {ws.repMultipliers.length > 0 && (
                <p className="text-3xl text-[#06b6d4] font-mono mt-1">
                  x{ws.repMultipliers[ws.repMultipliers.length - 1].toFixed(2)}
                </p>
              )}
            </div>

            {/* Combo milestone announcement */}
            {comboMilestone && (
              <div
                className="combo-milestone z-40"
                key={`arena-milestone-${comboMilestone}`}
              >
                <div
                  className="text-8xl font-black text-[#f59e0b]"
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    textShadow: "0 0 40px rgba(245, 158, 11, 0.8), 0 0 80px rgba(245, 158, 11, 0.4)",
                  }}
                >
                  {comboMilestone}x COMBO!
                </div>
              </div>
            )}

            {/* Rep quality flash */}
            {ws.lastRepQuality && (
              <div className="absolute top-[28%] left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <p
                  className={`text-5xl 2xl:text-7xl font-black ${
                    ws.lastRepQuality === "perfect"
                      ? "text-[#00ff88]"
                      : ws.lastRepQuality === "good"
                      ? "text-[#f59e0b]"
                      : "text-[#ff3366]"
                  } count-animate`}
                >
                  {ws.lastRepQuality === "perfect"
                    ? "PERFECT!"
                    : ws.lastRepQuality === "good"
                    ? "GOOD"
                    : "WEAK"}
                </p>
              </div>
            )}

            {/* WS disconnect overlay */}
            {wsDisconnected && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
                <div className="text-center">
                  <p className="text-5xl font-black text-[#ff3366] tracking-wider mb-4"
                     style={{ textShadow: "0 0 20px rgba(255, 51, 102, 0.5)" }}>
                    CONNECTION LOST
                  </p>
                  <p className="text-2xl font-bold text-[#888] animate-pulse">
                    SAVING YOUR SCORE...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer Bar ─────────────────────────────────────────── */}
        <div className="shrink-0 h-16 2xl:h-20 blitz-bar border-t flex items-center justify-between px-8 z-20">
          {/* Player name — left */}
          <div>
            <p className="text-3xl 2xl:text-5xl font-bold text-white">
              {pendingNickname}
            </p>
            <p className="text-lg 2xl:text-xl text-[#888]">
              {ws.countedReps} reps &bull; {ws.perfectReps} perfect
            </p>
          </div>

          {/* Reps — right */}
          <div className="text-right">
            <p className="text-5xl 2xl:text-7xl font-black text-[#06b6d4]">
              {ws.countedReps}
            </p>
            <p className="text-lg 2xl:text-xl text-[#888]">REPS</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Results screen ───────────────────────────────────────────────────
  if (screen === "results") {
    const avgQuality = results?.avg_quality
      ? results.avg_quality.toFixed(2)
      : ws.repMultipliers.length
      ? (ws.repMultipliers.reduce((a, b) => a + b, 0) / ws.repMultipliers.length).toFixed(2)
      : "0.00";

    const totalPts = results?.total_points ?? 0;
    const rankProgress = getRankProgress(totalPts);
    const rankColor = RANK_COLORS[rankProgress.rank] ?? "#cd7f32";
    const nextRankColor = rankProgress.nextRank
      ? RANK_COLORS[rankProgress.nextRank] ?? "#c0c0c0"
      : rankColor;
    const streak = results?.current_streak ?? 0;
    const streakMultiplier = results?.streak_multiplier ?? 1.0;

    // (h) Compute achievements
    const achievements: { icon: string; label: string }[] = [];
    if (results) {
      // FIRST BLOOD: first session (points_earned == total_points means no prior points)
      if (results.points_earned === results.total_points && results.total_points > 0) {
        achievements.push({ icon: "\u{1F3AF}", label: "FIRST BLOOD" });
      }
      // PERFECT FORM: avg_quality >= 0.90
      if (results.avg_quality >= 0.90) {
        achievements.push({ icon: "\u{2728}", label: "PERFECT FORM" });
      }
      // COMBO KING: max_combo >= 10
      if (results.max_combo >= 10) {
        achievements.push({ icon: "\u{1F451}", label: "COMBO KING" });
      }
      // IRON LEGS: reps_counted >= 20
      if (results.reps_counted >= 20) {
        achievements.push({ icon: "\u{1F9BF}", label: "IRON LEGS" });
      }
      // CONSISTENCY: current_streak >= 7
      if (results.current_streak >= 7) {
        achievements.push({ icon: "\u{1F525}", label: "CONSISTENCY" });
      }
    }

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0a] overflow-y-auto">
        <div className="text-center max-w-3xl mx-auto px-8 py-6">
          {/* (m) Personal best celebration */}
          {isPersonalBest && (
            <div className="mb-4 fade-in-up" style={{ animation: "pb-celebrate 1s ease-out" }}>
              <p
                className="text-4xl font-black tracking-widest"
                style={{
                  color: "#ffd700",
                  textShadow: "0 0 20px rgba(255, 215, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.3)",
                  animation: "pb-pulse 1.5s ease-in-out infinite",
                }}
              >
                NEW PERSONAL BEST!
              </p>
              <style>{`
                @keyframes pb-celebrate {
                  0% { transform: scale(0.5); opacity: 0; }
                  60% { transform: scale(1.1); }
                  100% { transform: scale(1); opacity: 1; }
                }
                @keyframes pb-pulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.7; }
                }
              `}</style>
            </div>
          )}

          {/* Player name + rank badge */}
          <div className="fade-in-up mb-4">
            <p className="text-3xl font-bold text-[#888]">
              {pendingNickname?.toUpperCase()}
            </p>
            {results && (
              <RankBadge rank={results.rank} large />
            )}
          </div>

          {/* Points earned */}
          <p
            className="font-black text-[#00ff88] neon-text font-mono tabular-nums fade-in-up text-[10rem] 2xl:text-[14rem] leading-none"
          >
            {Math.round(displayedPoints)}
          </p>
          <p className="text-3xl font-bold text-[#888] mt-2 mb-4 fade-in-up">
            MOVEMENT POINTS
          </p>

          {/* (i) Streak bonus display */}
          {streakMultiplier > 1.0 && (
            <div className="fade-in-up mb-6" style={{ animationDelay: "0.15s" }}>
              <p
                className="text-3xl font-black tracking-wider"
                style={{
                  color: "#ff6b35",
                  textShadow: "0 0 15px rgba(255, 107, 53, 0.5), 0 0 30px rgba(255, 69, 0, 0.3)",
                }}
              >
                {streakMultiplier.toFixed(1)}x STREAK BONUS
              </p>
            </div>
          )}

          {/* Video replay at 2x speed (auto-play, no controls) */}
          {replayBlob && replayFrames.length > 0 && (
            <div className="fade-in-up max-w-md mx-auto mb-6" style={{ animationDelay: "0.15s" }}>
              <VideoReplay
                videoBlob={replayBlob}
                frameData={replayFrames}
                autoPlay
                playbackRate={2}
                showControls={false}
              />
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-6 mb-6">
            <div className="fade-in-up" style={{ animationDelay: "0.2s" }}>
              <p className="text-5xl 2xl:text-7xl font-black text-[#06b6d4] font-mono">
                {avgQuality}x
              </p>
              <p className="text-xl 2xl:text-2xl text-[#888] mt-1">QUALITY</p>
            </div>
            <div className="fade-in-up" style={{ animationDelay: "0.3s" }}>
              <p className="text-5xl 2xl:text-7xl font-black text-white font-mono">
                {results?.reps_counted ?? ws.countedReps}
              </p>
              <p className="text-xl 2xl:text-2xl text-[#888] mt-1">REPS</p>
            </div>
            <div className="fade-in-up" style={{ animationDelay: "0.4s" }}>
              <p className="text-5xl 2xl:text-7xl font-black text-[#f59e0b] font-mono">
                {results?.max_combo ?? ws.maxCombo}x
              </p>
              <p className="text-xl 2xl:text-2xl text-[#888] mt-1">MAX COMBO</p>
            </div>
            <div className="fade-in-up" style={{ animationDelay: "0.5s" }}>
              <p className="text-5xl 2xl:text-7xl font-black text-[#00ff88] font-mono">
                {results?.perfect_reps ?? ws.perfectReps}
              </p>
              <p className="text-xl 2xl:text-2xl text-[#888] mt-1">PERFECT</p>
            </div>
          </div>

          {/* (h) Achievement badges */}
          {achievements.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3 mb-6 fade-in-up" style={{ animationDelay: "0.55s" }}>
              {achievements.map((a) => (
                <AchievementBadge key={a.label} icon={a.icon} label={a.label} />
              ))}
            </div>
          )}

          {/* Rank progression bar */}
          {results && rankProgress.nextRank && (
            <div className="fade-in-up max-w-lg mx-auto mb-6" style={{ animationDelay: "0.6s" }}>
              <div className="flex items-center justify-between text-sm 2xl:text-base font-bold mb-2">
                <span style={{ color: rankColor }}>
                  {rankProgress.rank.toUpperCase()}
                </span>
                <span className="text-[#888] font-mono text-xs">
                  {rankProgress.pointsToNext} pts to {rankProgress.nextRank.toUpperCase()}
                </span>
                <span style={{ color: nextRankColor }}>
                  {rankProgress.nextRank.toUpperCase()}
                </span>
              </div>
              <div className="h-3 bg-[#2a2a2a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full rank-progress-bar transition-all duration-1000"
                  style={{
                    width: `${Math.round(rankProgress.progress * 100)}%`,
                    ["--bar-color" as string]: rankColor,
                    ["--bar-highlight" as string]: nextRankColor,
                  }}
                />
              </div>
            </div>
          )}

          {/* Streak display */}
          {streak > 0 && (
            <div className="fade-in-up mb-4" style={{ animationDelay: "0.7s" }}>
              <p className="text-2xl font-bold text-white">
                <span className="streak-pulse inline-block mr-2">&#x1F525;</span>
                {streak}-DAY STREAK
              </p>
            </div>
          )}

          {/* (c) Progress bar + countdown + controls */}
          <div className="mt-6 w-80 mx-auto">
            <div className="h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00ff88] rounded-full transition-all duration-[15s] ease-linear"
                style={{ width: "100%" }}
              />
            </div>
            <p className="text-lg text-[#888] mt-2 font-mono">
              RETURNING IN {resultsCountdown}s
            </p>
            <p className="text-sm text-[#555] mt-1 font-mono tracking-wider">
              PRESS SPACE TO CONTINUE
            </p>
          </div>

          {/* (k) Scan QR to play again */}
          <div className="mt-6 fade-in-up" style={{ animationDelay: "0.8s" }}>
            <p className="text-lg font-bold text-[#555] tracking-widest">
              SCAN QR TO PLAY AGAIN
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
