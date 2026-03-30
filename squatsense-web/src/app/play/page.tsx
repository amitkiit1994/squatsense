"use client";

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCamera } from "@/hooks/useCamera";
import { useWebSocket } from "@/hooks/useWebSocket";
import { usePoseCalibration } from "@/hooks/usePoseCalibration";
import { startSession, completeSession } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";
import { drawSkeleton, POSE_CONNECTIONS } from "@/lib/drawSkeleton";
import { setReplayData } from "@/lib/replayStore";

const BLITZ_DURATION = 30;
const FRAME_INTERVAL_MS = 100; // ~10fps

type GamePhase = "auth" | "camera" | "countdown" | "active" | "finishing";

export default function PlayPage() {
  const router = useRouter();

  // ── Auth ──────────────────────────────────────────────────────────────
  const tokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // ── Camera + WebSocket hooks ──────────────────────────────────────────
  const {
    videoRef,
    canvasRef,
    isActive: cameraActive,
    isMockVideo,
    error: cameraError,
    startCamera,
    stopCamera,
    resumeCamera,
    captureFrame,
    loadVideoFile,
    playVideo,
    startRecording,
    stopRecording,
  } = useCamera();

  const {
    isConnected,
    connectionStatus,
    formScore,
    landmarks,
    movementPoints,
    currentCombo,
    maxCombo,
    perfectReps,
    countedReps,
    repMultipliers,
    repFormScores,
    lastRepQuality,
    repCount,
    connect,
    disconnect,
    sendFrame,
    sendCommand,
    stopAndWaitForSummary,
    markBlitzStart,
    getFrameData,
  } = useWebSocket();

  // ── Game state ────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<GamePhase>("auth");
  const [countdown, setCountdown] = useState(3);
  const [timer, setTimer] = useState(BLITZ_DURATION);
  const [shaking, setShaking] = useState(false);
  const [flashClass, setFlashClass] = useState<string | null>(null);
  const [pointsKey, setPointsKey] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [calibrationTimedOut, setCalibrationTimedOut] = useState(false);

  // ── Combo milestones ────────────────────────────────────────────────
  const [comboMilestone, setComboMilestone] = useState<number | null>(null);
  const lastMilestoneRef = useRef(0);

  // ── Mock video (dev only) ────────────────────────────────────────────
  const [mockFileName, setMockFileName] = useState<string | null>(null);
  const isDev = process.env.NODE_ENV === "development";

  const handleVideoFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setMockFileName(file.name);
      await loadVideoFile(file);
    },
    [loadVideoFile]
  );

  // ── Calibration hook ─────────────────────────────────────────────────
  const {
    isModelLoading,
    modelError,
    landmarks: calibrationLandmarks,
    calibration,
    isReady: calibrationReady,
    start: startCalibration,
    stop: stopCalibration,
  } = usePoseCalibration();

  const calibrationCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Refs for intervals / cleanup
  const captureLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevRepCountRef = useRef(0);
  const hasCompletedRef = useRef(false);

  // ── 1. Auth check ────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/join");
      return;
    }
    tokenRef.current = token;
    setPhase("camera");
  }, [router]);

  // ── 2. Camera setup ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "camera") return;
    blitzStartedRef.current = false; // Reset guard on re-entry
    startCamera();
  }, [phase, startCamera]);

  // ── Track camera errors ──────────────────────────────────────────────
  useEffect(() => {
    if (cameraError) trackEvent("camera_error", { error: cameraError });
  }, [cameraError]);

  // ── 2b. Start calibration when camera is active ────────────────────
  useEffect(() => {
    if (phase !== "camera" || !cameraActive || isMockVideo) return;
    const video = videoRef.current;
    if (video) startCalibration(video);
    return () => stopCalibration();
  }, [phase, cameraActive, isMockVideo, videoRef, startCalibration, stopCalibration]);

  // ── 2b2. Calibration timeout — show skip button after 30s ─────────
  useEffect(() => {
    if (phase !== "camera" || !cameraActive || isMockVideo || calibrationReady) return;
    setCalibrationTimedOut(false);
    const timeout = setTimeout(() => setCalibrationTimedOut(true), 30_000);
    return () => clearTimeout(timeout);
  }, [phase, cameraActive, isMockVideo, calibrationReady]);

  // ── 2c. Draw calibration skeleton overlay ──────────────────────────
  useEffect(() => {
    const canvas = calibrationCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || phase !== "camera") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    if (!calibrationLandmarks || calibrationLandmarks.length === 0) return;

    const color = "#06b6d4"; // cyan during calibration

    // Draw connection lines (normalized coords → multiply by canvas size)
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

    // Draw landmark dots
    ctx.fillStyle = color;
    ctx.globalAlpha = 1.0;
    for (const lm of calibrationLandmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [calibrationLandmarks, phase, videoRef]);

  // ── Helper: Start the blitz session ──────────────────────────────────
  const blitzStartedRef = useRef(false);

  const beginBlitz = useCallback(async () => {
    if (blitzStartedRef.current) return;
    blitzStartedRef.current = true;

    const token = tokenRef.current;
    if (!token) {
      blitzStartedRef.current = false;
      return;
    }

    stopCalibration();
    setStartError(null);
    try {
      const { session_id } = await startSession(token, "personal");
      sessionIdRef.current = session_id;
      trackEvent("session_started", { session_id, mode: "personal" });
      connect(session_id);
      setPhase("countdown");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start session";
      setStartError(msg);
      blitzStartedRef.current = false;
    }
  }, [connect, stopCalibration]);

  // ── 2d. Auto-start blitz when calibration is ready ─────────────────
  useEffect(() => {
    if (phase !== "camera" || !calibrationReady) return;
    beginBlitz();
  }, [phase, calibrationReady, beginBlitz]);

  // ── 2e. Skip calibration for mock videos — go straight to blitz ────
  useEffect(() => {
    if (phase !== "camera" || !cameraActive || !isMockVideo) return;
    beginBlitz();
  }, [phase, cameraActive, isMockVideo, beginBlitz]);

  // ── 3. Countdown (3-2-1-GO) ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== "countdown") return;

    // Re-apply camera stream to the newly mounted <video> element
    resumeCamera();

    setCountdown(3);
    const iv = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(iv);
          setPhase("active");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(iv);
  }, [phase, resumeCamera]);

  // ── 4. Active blitz: timer + frame capture ───────────────────────────
  useEffect(() => {
    if (phase !== "active") return;

    setTimer(BLITZ_DURATION);

    // Re-apply camera stream or mock video to the newly mounted <video> element
    resumeCamera();
    playVideo();

    // Start recording and frame data collection
    startRecording();
    markBlitzStart();

    // Timer countdown
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          setPhase("finishing");
          return 0;
        }
        return Math.max(0, prev - 1);
      });
    }, 1000);

    // Frame capture loop
    captureLoopRef.current = setInterval(async () => {
      const blob = await captureFrame();
      if (blob) sendFrame(blob);
    }, FRAME_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (captureLoopRef.current) clearInterval(captureLoopRef.current);
    };
  }, [phase, captureFrame, sendFrame, resumeCamera, playVideo, startRecording, markBlitzStart]);

  // ── 5. Finishing: stop, persist, redirect ────────────────────────────
  useEffect(() => {
    if (phase !== "finishing") return;
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;

    // Stop capture loop
    if (captureLoopRef.current) {
      clearInterval(captureLoopRef.current);
      captureLoopRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const finalize = async () => {
      // Send stop command and wait for summary (captures per-rep scoring data)
      const summary = await stopAndWaitForSummary(5000);

      const token = tokenRef.current;
      const sessionId = sessionIdRef.current;

      // Call completeSession API with 10-second timeout
      let serverResult = null;
      let saveError: string | null = null;
      if (token && sessionId) {
        try {
          const SAVE_TIMEOUT_MS = 10_000;
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Save timed out")), SAVE_TIMEOUT_MS)
          );
          serverResult = await Promise.race([
            completeSession(token, sessionId, repFormScores, BLITZ_DURATION),
            timeoutPromise,
          ]);
          trackEvent("session_completed", {
            session_id: sessionId,
            mode: "personal",
            points: serverResult?.points_earned,
            reps: serverResult?.reps_counted,
            quality: serverResult?.avg_quality,
          });
        } catch (err) {
          saveError = err instanceof Error ? err.message : "Failed to save session";
          console.error("completeSession failed:", err);
          setSaveWarning("Could not save session to server. Your score was still recorded locally.");
        }
      }

      // Compute avg quality from multipliers
      const avgQuality =
        repMultipliers.length > 0
          ? Math.round(
              (repMultipliers.reduce((a, b) => a + b, 0) / repMultipliers.length) *
                100
            ) / 100
          : 0;

      // Save results to sessionStorage
      const resultData = {
        session_id: sessionId,
        points_earned: serverResult?.points_earned ?? movementPoints,
        reps_counted: serverResult?.reps_counted ?? countedReps,
        reps_total: serverResult?.reps_total ?? repCount,
        avg_quality: serverResult?.avg_quality ?? avgQuality,
        max_combo: serverResult?.max_combo ?? maxCombo,
        perfect_reps: serverResult?.perfect_reps ?? perfectReps,
        rep_multipliers: repMultipliers,
        total_points: serverResult?.total_points ?? undefined,
        rank: serverResult?.rank ?? undefined,
        current_streak: serverResult?.current_streak ?? undefined,
        streak_multiplier: serverResult?.streak_multiplier ?? undefined,
        total_sessions: serverResult ? 1 : undefined, // will be updated from profile fetch
        save_error: saveError,
        rep_details: summary?.reps ?? null,
      };

      sessionStorage.setItem("squatsense_results", JSON.stringify(resultData));

      // If save timed out, briefly show warning then navigate
      if (saveError) {
        await new Promise((r) => setTimeout(r, 2500));
      }

      // Stop recording and save replay data (must happen before stopCamera)
      const videoBlob = await stopRecording();
      const frames = getFrameData();
      setReplayData(videoBlob, frames);

      // Cleanup
      stopCamera();
      disconnect();

      // Navigate to results
      router.push("/results");
    };

    finalize();
  }, [
    phase,
    movementPoints,
    countedReps,
    repCount,
    maxCombo,
    perfectReps,
    repMultipliers,
    repFormScores,
    stopCamera,
    disconnect,
    router,
    stopAndWaitForSummary,
    stopRecording,
    getFrameData,
  ]);

  // ── Rep detection side effects (shake + flash) ───────────────────────
  useEffect(() => {
    if (repCount > prevRepCountRef.current && phase === "active") {
      setShaking(true);
      setTimeout(() => setShaking(false), 150);
    }
    prevRepCountRef.current = repCount;
  }, [repCount, phase]);

  useEffect(() => {
    if (!lastRepQuality) {
      setFlashClass(null);
      return;
    }
    if (lastRepQuality === "perfect") setFlashClass("flash-perfect");
    else if (lastRepQuality === "good") setFlashClass("flash-good");
    else setFlashClass("flash-weak");
  }, [lastRepQuality]);

  // ── Combo milestone detection (5x, 10x, 15x, 20x) ──────────────────
  useEffect(() => {
    if (phase !== "active") return;
    const milestone = Math.floor(currentCombo / 5) * 5;
    if (milestone >= 5 && milestone > lastMilestoneRef.current) {
      lastMilestoneRef.current = milestone;
      setComboMilestone(milestone);
      setTimeout(() => setComboMilestone(null), 1500);
    }
    if (currentCombo === 0) {
      lastMilestoneRef.current = 0;
    }
  }, [currentCombo, phase]);

  // Animate points counter
  useEffect(() => {
    setPointsKey((k) => k + 1);
  }, [movementPoints]);

  // ── Skeleton overlay drawing ─────────────────────────────────────────
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;

    if (landmarks.length === 0 || phase !== "active") {
      ctx.clearRect(0, 0, w, h);
      return;
    }

    drawSkeleton(ctx, landmarks, formScore, w, h);
  }, [landmarks, formScore, phase, videoRef]);

  // ── Quality multiplier display ───────────────────────────────────────
  const latestMultiplier =
    repMultipliers.length > 0
      ? repMultipliers[repMultipliers.length - 1]
      : null;

  // ── Render ────────────────────────────────────────────────────────────

  // Auth check loading
  if (phase === "auth") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#00ff88] text-xl font-mono animate-pulse">
          Checking auth...
        </div>
      </div>
    );
  }

  // Camera setup screen with calibration
  if (phase === "camera") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 gap-6">
        <h1
          className="text-2xl sm:text-3xl font-bold text-white"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          30-SECOND BLITZ
        </h1>
        <p className="text-[#888888] text-center max-w-sm">
          Position yourself so your full body is visible. Stand back about 6 feet
          from the camera.
        </p>

        {/* Camera preview with calibration skeleton overlay */}
        <div className="relative w-full max-w-md lg:max-w-lg aspect-[4/3] rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#141414]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
          {/* Calibration skeleton overlay */}
          <canvas
            ref={calibrationCanvasRef}
            className="absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none"
          />
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/95 p-6 gap-4">
              <div className="w-12 h-12 rounded-full bg-[#ff3366]/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-[#ff3366]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-white text-sm text-center font-medium max-w-xs">
                Camera access denied.
              </p>
              <p className="text-[#888] text-xs text-center max-w-xs mt-1">
                Open browser settings, allow camera access for this site, then try again.
              </p>
              <button
                onClick={() => startCamera()}
                className="px-6 py-2.5 bg-[#00ff88] hover:bg-[#00cc6a] text-black font-bold text-sm rounded-lg
                           transition-colors cursor-pointer tracking-wider mt-2"
              >
                TRY AGAIN
              </button>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {/* Calibration checklist */}
        {cameraActive && (
          <div className="w-full max-w-sm lg:max-w-md space-y-2">
            {isModelLoading ? (
              <p className="text-[#06b6d4] text-sm text-center animate-pulse font-mono">
                Loading pose model...
              </p>
            ) : modelError ? (
              <p className="text-[#ff3366] text-sm text-center font-mono">
                Pose detection unavailable
              </p>
            ) : (
              <>
                <CalibrationCheckItem
                  label="Full body visible"
                  passed={calibration.bodyVisible}
                />
                <CalibrationCheckItem
                  label="Properly framed"
                  passed={calibration.properlyFramed}
                />
                <CalibrationCheckItem
                  label="Centered in frame"
                  passed={calibration.centered}
                />
              </>
            )}
          </div>
        )}

        {startError && (
          <div className="px-4 py-3 bg-[#ff3366]/10 border border-[#ff3366]/30 rounded-xl max-w-sm text-center space-y-3">
            <p className="text-[#ff3366] text-sm font-mono">{startError}</p>
            <button
              onClick={() => {
                setStartError(null);
                beginBlitz();
              }}
              className="px-6 py-2.5 bg-[#00ff88] hover:bg-[#00cc6a] text-black font-bold text-sm rounded-lg
                         transition-colors cursor-pointer tracking-wider"
            >
              RETRY
            </button>
          </div>
        )}

        {/* Auto-starting indicator when calibration passes */}
        {cameraActive && !isModelLoading && calibrationReady && (
          <div className="flex items-center gap-3 px-6 py-3 bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl">
            <div className="w-3 h-3 rounded-full bg-[#00ff88] animate-pulse" />
            <span className="text-[#00ff88] font-bold font-mono text-lg">
              STARTING BLITZ...
            </span>
          </div>
        )}

        {/* Calibration timeout: allow skipping after 30s */}
        {cameraActive && calibrationTimedOut && !calibrationReady && !modelError && (
          <div className="text-center">
            <p className="text-[#ffbf00] text-sm font-mono mb-3">
              Having trouble detecting your pose? Try adjusting your position.
            </p>
            <button
              onClick={beginBlitz}
              className="px-8 py-4 bg-[#ffbf00] text-black font-bold text-lg rounded-xl
                         hover:bg-[#e6ac00] transition-colors cursor-pointer"
            >
              SKIP CALIBRATION
            </button>
          </div>
        )}

        {/* Fallback: if model fails, allow manual start */}
        {cameraActive && modelError && (
          <div className="text-center">
            <p className="text-[#ff6666] text-sm font-mono mb-3">
              Pose tracking unavailable — reps will not be counted
            </p>
            <button
              onClick={beginBlitz}
              className="px-8 py-4 bg-[#555555] text-white font-bold text-lg rounded-xl
                         hover:bg-[#666666] transition-colors cursor-pointer"
            >
              START ANYWAY
            </button>
          </div>
        )}

        {!cameraActive && !cameraError && (
          <p className="text-[#888888] text-sm animate-pulse">
            Requesting camera permission...
          </p>
        )}

        <button
          onClick={() => router.push("/")}
          className="text-[#888888] text-sm hover:text-white transition-colors cursor-pointer"
        >
          Back to Home
        </button>

        {/* Dev-only: Video mock mode */}
        {isDev && (
          <div className="mt-2 p-3 border border-dashed border-[#333] rounded-lg bg-[#111] max-w-md w-full">
            <p className="text-[#666] text-xs mb-2 font-mono">DEV: Video Mock Mode</p>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[#888] hover:text-white transition-colors">
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoFile}
                className="hidden"
              />
              <span className="px-3 py-1.5 bg-[#222] border border-[#444] rounded text-xs font-mono hover:bg-[#333] transition-colors">
                Choose Video File
              </span>
              {mockFileName && (
                <span className="text-xs text-[#00ff88] truncate max-w-[200px]">
                  {mockFileName}
                </span>
              )}
            </label>
            {isMockVideo && (
              <p className="text-[#ffbf00] text-xs mt-2 font-mono">
                Mock mode active — camera bypassed
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Countdown overlay — same three-zone layout for smooth transition to active
  if (phase === "countdown") {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] overflow-hidden flex flex-col">
        {/* Header bar — connection status during countdown */}
        <div className="shrink-0 h-12 sm:h-14 blitz-bar border-b flex items-center justify-between px-4">
          <span className="text-xs text-[#666] tracking-widest uppercase font-mono">
            30-SECOND BLITZ
          </span>
          {!isConnected && (
            <span className="text-xs text-[#ffbf00] font-mono animate-pulse">
              CONNECTING...
            </span>
          )}
        </div>

        {/* Video zone */}
        <div className="flex-1 flex items-center justify-center p-2 sm:p-4 lg:p-6 min-h-0">
          <div className="relative w-full aspect-[4/3] rounded-xl sm:rounded-2xl overflow-hidden border border-[#2a2a2a] bg-[#141414] sm:max-w-2xl lg:max-w-4xl">
            {/* Video at reduced opacity */}
            <video
              ref={videoRef}
              autoPlay={!isMockVideo}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover -scale-x-100 opacity-30"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Countdown number overlaid on video */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              <div
                className="text-[80px] sm:text-[120px] lg:text-[150px] font-bold text-[#00ff88] neon-text count-animate"
                style={{ fontFamily: "'Space Mono', monospace" }}
                key={countdown}
              >
                {countdown === 0 ? "GO!" : countdown}
              </div>
              <p className="text-[#888888] text-lg">Get ready to squat!</p>
            </div>
          </div>
        </div>

        {/* Footer bar (empty during countdown) */}
        <div className="shrink-0 h-10 sm:h-12 blitz-bar border-t" />
      </div>
    );
  }

  // Active blitz + Finishing state (keep showing UI while finishing)
  return (
    <div className="fixed inset-0 bg-[#0a0a0a] overflow-hidden flex flex-col">
      {/* ── Header Bar ─────────────────────────────────────────────── */}
      <div className="shrink-0 h-12 sm:h-14 blitz-bar border-b flex items-center justify-between px-4 z-20">
        {/* Connection status — left */}
        <div className="flex items-center gap-2 min-w-[100px]">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              connectionStatus === "connected"
                ? "bg-[#00ff88]"
                : connectionStatus === "reconnecting"
                ? "bg-[#ffbf00] animate-pulse"
                : connectionStatus === "reconnect_failed"
                ? "bg-[#ff3366]"
                : "bg-[#ff3366] animate-pulse"
            }`}
          />
          <span className="text-xs text-[#cccccc]">
            {connectionStatus === "connected"
              ? "LIVE"
              : connectionStatus === "reconnecting"
              ? "RECONNECTING..."
              : connectionStatus === "reconnect_failed"
              ? "CONNECTION LOST"
              : "CONNECTING"}
          </span>
          {isMockVideo && (
            <span className="text-xs font-mono text-[#ffbf00] bg-[#ffbf00]/10 px-2 py-0.5 rounded">
              MOCK
            </span>
          )}
        </div>

        {/* Timer — center */}
        <div className="flex flex-col items-center">
          <div
            className={`text-2xl sm:text-3xl lg:text-4xl font-bold ${
              timer <= 5 ? "timer-critical" : "text-white"
            }`}
            style={{ fontFamily: "'Space Mono', monospace" }}
          >
            {timer}
          </div>
        </div>

        {/* Combo counter — right */}
        <div className="min-w-[100px] flex justify-end">
          {currentCombo >= 2 && (
            <div className="combo-shake" key={`combo-${currentCombo}`}>
              <div
                className="text-base sm:text-lg lg:text-xl font-bold text-[#06b6d4]"
                style={{
                  fontFamily: "'Space Mono', monospace",
                  textShadow: "0 0 12px rgba(6, 182, 212, 0.6)",
                }}
              >
                x{currentCombo} COMBO!
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Video Zone ─────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 lg:p-6 min-h-0">
        <div
          className={`relative w-full aspect-[4/3] rounded-xl sm:rounded-2xl overflow-hidden border border-[#2a2a2a] bg-[#141414] sm:max-w-2xl lg:max-w-4xl ${
            shaking ? "screen-shake" : ""
          }`}
        >
          {/* Rep quality flash overlay */}
          {flashClass && (
            <div
              className={`absolute inset-0 z-50 pointer-events-none ${flashClass}`}
              key={`flash-${Date.now()}`}
            />
          )}

          {/* Video feed */}
          <video
            ref={videoRef}
            autoPlay={!isMockVideo}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          />
          {/* Hidden capture canvas */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Skeleton overlay canvas */}
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none z-10"
          />

          {/* Movement Points — center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center bg-black/50 px-4 py-3 sm:px-6 sm:py-4 rounded-2xl backdrop-blur-sm z-20 pointer-events-none">
            <div
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#00ff88] neon-text count-animate"
              key={`pts-${pointsKey}`}
            >
              {movementPoints.toFixed(1)}
            </div>
            <div className="text-sm text-[#cccccc] mt-1 tracking-wider">
              MOVEMENT POINTS
            </div>
            {latestMultiplier !== null && (
              <div className="text-lg text-[#06b6d4] mt-1 font-mono">
                x{latestMultiplier.toFixed(2)}
              </div>
            )}
          </div>

          {/* Per-rep quality flash label */}
          {lastRepQuality && (
            <div className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
              <div
                className={`text-xl sm:text-2xl lg:text-3xl font-black tracking-wider count-animate ${
                  lastRepQuality === "perfect"
                    ? "text-[#00ff88] neon-text"
                    : lastRepQuality === "good"
                    ? "text-[#ffbf00]"
                    : "text-[#ff3366]"
                }`}
                style={{
                  fontFamily: "'Space Mono', monospace",
                  textShadow:
                    lastRepQuality === "perfect"
                      ? "0 0 20px rgba(0,255,136,0.8)"
                      : lastRepQuality === "good"
                      ? "0 0 20px rgba(255,191,0,0.6)"
                      : "0 0 20px rgba(255,51,102,0.5)",
                }}
                key={`quality-${Date.now()}`}
              >
                {lastRepQuality === "perfect"
                  ? "PERFECT!"
                  : lastRepQuality === "good"
                  ? "GOOD"
                  : "WEAK"}
              </div>
            </div>
          )}

          {/* Combo milestone announcement */}
          {comboMilestone && (
            <div
              className="combo-milestone z-40"
              key={`milestone-${comboMilestone}`}
            >
              <div
                className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#06b6d4]"
                style={{
                  fontFamily: "'Space Mono', monospace",
                  textShadow: "0 0 30px rgba(6, 182, 212, 0.8), 0 0 60px rgba(6, 182, 212, 0.4)",
                }}
              >
                {comboMilestone}x COMBO!
              </div>
            </div>
          )}

          {/* WS disconnect overlay */}
          {phase === "active" && connectionStatus === "reconnecting" && (
            <div className="absolute inset-0 bg-[#0a0a0a]/50 flex items-center justify-center z-35 pointer-events-none">
              <div className="flex flex-col items-center gap-3 px-6 py-4 bg-zinc-900/90 border border-[#ffbf00]/40 rounded-2xl backdrop-blur-sm">
                <div className="w-3 h-3 rounded-full bg-[#ffbf00] animate-pulse" />
                <p
                  className="text-[#ffbf00] text-lg font-bold font-mono tracking-wider"
                  style={{ textShadow: "0 0 12px rgba(255, 191, 0, 0.5)" }}
                >
                  RECONNECTING...
                </p>
              </div>
            </div>
          )}
          {phase === "active" && connectionStatus === "reconnect_failed" && (
            <div className="absolute inset-0 bg-[#0a0a0a]/60 flex items-center justify-center z-35 pointer-events-none">
              <div className="flex flex-col items-center gap-3 px-6 py-4 bg-zinc-900/90 border border-[#ff3366]/40 rounded-2xl backdrop-blur-sm">
                <div className="w-3 h-3 rounded-full bg-[#ff3366]" />
                <p
                  className="text-[#ff3366] text-lg font-bold font-mono tracking-wider"
                  style={{ textShadow: "0 0 12px rgba(255, 51, 102, 0.5)" }}
                >
                  CONNECTION LOST
                </p>
              </div>
            </div>
          )}

          {/* Finishing overlay */}
          {phase === "finishing" && (
            <div className="absolute inset-0 bg-[#0a0a0a]/70 flex items-center justify-center z-30">
              <div className="flex flex-col items-center gap-3 px-6">
                <div
                  className="text-4xl font-bold text-[#00ff88] neon-text"
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  TIME!
                </div>
                {saveWarning ? (
                  <div className="px-4 py-3 bg-[#ffbf00]/10 border border-[#ffbf00]/30 rounded-xl max-w-sm text-center">
                    <p className="text-[#ffbf00] text-sm font-mono">{saveWarning}</p>
                  </div>
                ) : (
                  <p className="text-[#888888] text-sm animate-pulse">
                    Saving results...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer Bar ─────────────────────────────────────────────── */}
      <div className="shrink-0 h-10 sm:h-12 blitz-bar border-t flex items-center justify-between px-4 z-20">
        {/* Rep counter — left */}
        <div
          className="text-sm sm:text-base font-bold text-white"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          REPS: {countedReps}
        </div>

        {/* Form score — right */}
        {formScore !== null && (
          <div
            className={`text-sm font-mono ${
              formScore >= 80
                ? "text-[#00ff88]"
                : formScore >= 60
                ? "text-[#ffbf00]"
                : "text-[#ff3366]"
            }`}
          >
            FORM: {formScore}%
          </div>
        )}
      </div>
    </div>
  );
}

// ── Calibration check item ─────────────────────────────────────────────
function CalibrationCheckItem({
  label,
  passed,
}: {
  label: string;
  passed: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#141414] border border-[#2a2a2a]">
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
          passed
            ? "bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40"
            : "bg-[#ff3366]/20 text-[#ff3366] border border-[#ff3366]/40"
        }`}
      >
        {passed ? "\u2713" : "\u2717"}
      </div>
      <span
        className={`text-sm font-mono ${
          passed ? "text-[#00ff88]" : "text-[#888888]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
