"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  Square,
  StopCircle,
  Timer,
  RotateCcw,
  Gauge,
  SkipForward,
  CheckCircle2,
  FileVideo,
  Dumbbell,
  Pencil,
  Smartphone,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCamera } from "@/hooks/useCamera";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  apiFetch,
  uploadVideo,
  getAnalysisJob,
  populateSetFromAnalysis,
} from "@/lib/api";
import type { AnalysisJobResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// MediaPipe Pose Connections (key joints)
// ---------------------------------------------------------------------------

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
  [27, 29], [29, 31], // left foot
  [28, 30], [30, 32], // right foot
];

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface RealtimeMetrics {
  rep_count: number;
  knee_flexion: number;
  status: string;
  phase: string;
  form_score: number;
}

interface SetData {
  set_number: number;
  reps: number;
  form_score: number;
  duration: number;
}

interface SetSummary {
  set_number: number;
  reps: number;
  avg_form_score: number;
  duration: number;
  load_used: number | null;
  fatigue_risk?: string | null;
}

// ---------------------------------------------------------------------------
// Per-exercise camera placement guide
// ---------------------------------------------------------------------------

interface CameraGuide {
  position: "side" | "front" | "front-diagonal";
  distance: string;
  height: string;
  tip: string;
  why: string;
}

const CAMERA_GUIDES: Record<string, CameraGuide> = {
  squat: {
    position: "side",
    distance: "2-3m",
    height: "hip height",
    tip: "Place camera at your side for accurate knee and hip tracking.",
    why: "Knee flexion and hip depth are measured in the sagittal plane.",
  },
  deadlift: {
    position: "side",
    distance: "2-3m",
    height: "hip height",
    tip: "Side view captures hip hinge, trunk angle, and spine position.",
    why: "Hip hinge and lumbar rounding detection need a side profile.",
  },
  lunge: {
    position: "side",
    distance: "2-3m",
    height: "hip height",
    tip: "Film from the side of your front leg for best knee tracking.",
    why: "Front knee flexion and knee-over-toe check need side view.",
  },
  pushup: {
    position: "side",
    distance: "1.5-2m",
    height: "ground level",
    tip: "Camera at ground level, viewing from the side.",
    why: "Elbow flexion and hip sag are measured from the side profile.",
  },
  bench_press: {
    position: "front-diagonal",
    distance: "2-3m",
    height: "bench height",
    tip: "A 45° front-diagonal angle captures both elbows evenly.",
    why: "Elbow symmetry and bar path are best seen from a front angle.",
  },
  overhead_press: {
    position: "side",
    distance: "2-3m",
    height: "standing height",
    tip: "Side view detects backward lean and full lockout overhead.",
    why: "Trunk lean-back and shoulder angle need sagittal plane view.",
  },
  row: {
    position: "side",
    distance: "2-3m",
    height: "hip height",
    tip: "Side view tracks elbow pull and trunk stability during the row.",
    why: "Trunk angle stability and elbow ROM are sagittal plane metrics.",
  },
  pullup: {
    position: "front",
    distance: "2-3m",
    height: "bar height",
    tip: "Front view captures both arms and detects kipping.",
    why: "Elbow symmetry and hip swing are visible from the front.",
  },
};

function getCameraGuide(exercise: string): CameraGuide {
  return CAMERA_GUIDES[exercise] ?? CAMERA_GUIDES.squat;
}

// SVG diagram data per position type
function CameraGuideDiagram({ position }: { position: CameraGuide["position"] }) {
  if (position === "front") {
    return (
      <svg viewBox="0 0 96 80" className="w-full h-full">
        <line x1="0" y1="72" x2="96" y2="72" stroke="#52525b" strokeWidth="1" />
        {/* Person facing camera */}
        <circle cx="48" cy="18" r="5" fill="#a78bfa" />
        <line x1="48" y1="23" x2="48" y2="45" stroke="#a78bfa" strokeWidth="2" />
        <line x1="48" y1="30" x2="36" y2="38" stroke="#a78bfa" strokeWidth="2" />
        <line x1="48" y1="30" x2="60" y2="38" stroke="#a78bfa" strokeWidth="2" />
        <line x1="48" y1="45" x2="40" y2="72" stroke="#a78bfa" strokeWidth="2" />
        <line x1="48" y1="45" x2="56" y2="72" stroke="#a78bfa" strokeWidth="2" />
        {/* Phone below (front) */}
        <rect x="44" y="76" width="8" height="3" rx="1" fill="#22c55e" stroke="#4ade80" strokeWidth="0.5" />
        <line x1="48" y1="76" x2="48" y2="62" stroke="#22c55e" strokeWidth="1" strokeDasharray="2,2" />
        <text x="48" y="60" fill="#4ade80" fontSize="6" textAnchor="middle">FRONT</text>
      </svg>
    );
  }
  if (position === "front-diagonal") {
    return (
      <svg viewBox="0 0 96 80" className="w-full h-full">
        <line x1="0" y1="72" x2="96" y2="72" stroke="#52525b" strokeWidth="1" />
        {/* Person */}
        <circle cx="52" cy="18" r="5" fill="#a78bfa" />
        <line x1="52" y1="23" x2="52" y2="45" stroke="#a78bfa" strokeWidth="2" />
        <line x1="52" y1="30" x2="42" y2="38" stroke="#a78bfa" strokeWidth="2" />
        <line x1="52" y1="30" x2="62" y2="38" stroke="#a78bfa" strokeWidth="2" />
        <line x1="52" y1="45" x2="44" y2="72" stroke="#a78bfa" strokeWidth="2" />
        <line x1="52" y1="45" x2="60" y2="72" stroke="#a78bfa" strokeWidth="2" />
        {/* Phone at 45° */}
        <rect x="8" y="58" width="8" height="14" rx="1" fill="#22c55e" stroke="#4ade80" strokeWidth="0.5" transform="rotate(-20 12 65)" />
        <line x1="18" y1="60" x2="38" y2="48" stroke="#22c55e" strokeWidth="1" strokeDasharray="2,2" />
        <text x="22" y="48" fill="#4ade80" fontSize="5" textAnchor="middle">45°</text>
      </svg>
    );
  }
  // Default: side view
  return (
    <svg viewBox="0 0 96 80" className="w-full h-full">
      <line x1="0" y1="72" x2="96" y2="72" stroke="#52525b" strokeWidth="1" />
      {/* Person (center) */}
      <circle cx="48" cy="18" r="5" fill="#a78bfa" />
      <line x1="48" y1="23" x2="48" y2="45" stroke="#a78bfa" strokeWidth="2" />
      <line x1="48" y1="30" x2="38" y2="38" stroke="#a78bfa" strokeWidth="2" />
      <line x1="48" y1="30" x2="58" y2="38" stroke="#a78bfa" strokeWidth="2" />
      <line x1="48" y1="45" x2="40" y2="72" stroke="#a78bfa" strokeWidth="2" />
      <line x1="48" y1="45" x2="56" y2="72" stroke="#a78bfa" strokeWidth="2" />
      {/* Phone (to the side) */}
      <rect x="8" y="30" width="8" height="14" rx="1" fill="#22c55e" stroke="#4ade80" strokeWidth="0.5" />
      <line x1="16" y1="37" x2="36" y2="37" stroke="#22c55e" strokeWidth="1" strokeDasharray="2,2" />
      <text x="12" y="52" fill="#6ee7b7" fontSize="5" textAnchor="middle">SIDE</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSkeletonColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  return "#ef4444";
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const EXERCISE_OPTIONS = [
  { value: "squat", label: "Squat" },
  { value: "deadlift", label: "Deadlift" },
  { value: "lunge", label: "Lunge" },
  { value: "pushup", label: "Push-Up" },
  { value: "bench_press", label: "Bench Press" },
  { value: "overhead_press", label: "Overhead Press" },
  { value: "row", label: "Row" },
  { value: "pullup", label: "Pull-Up" },
];

function WorkoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultExercise = searchParams.get("exercise") ?? "squat";
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Pre-workout setup state
  const [showSetup, setShowSetup] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState(defaultExercise);
  const [weightInput, setWeightInput] = useState("");
  const [isBodyweight, setIsBodyweight] = useState(false);
  const [sessionWeight, setSessionWeight] = useState<number | null>(null);

  // Upload flow state
  const [uploadMode, setUploadMode] = useState(false);
  const [uploadSetNumber, setUploadSetNumber] = useState(1);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "analyzing" | "saving" | "done" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSetResults, setUploadSetResults] = useState<
    Array<{
      set_number: number;
      reps: number;
      avg_form_score: number | null;
      fatigue_risk: string | null;
    }>
  >([]);

  // Use selected exercise once workout starts (locked after start)
  const exerciseType = showSetup ? selectedExercise : selectedExercise;
  // Per-set weight override (editable on set summary card)
  const [nextSetWeight, setNextSetWeight] = useState("");
  const [editingWeight, setEditingWeight] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(true);
  const [timer, setTimer] = useState(0);
  const [setElapsed, setSetElapsed] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  // Track the cumulative rep count at the start of each set so we can
  // display per-set reps (repCount - setStartRepCount).
  const [setStartRepCount, setSetStartRepCount] = useState(0);
  const [completedSets, setCompletedSets] = useState<SetSummary[]>([]);
  const [showSetSummary, setShowSetSummary] = useState(false);
  const [lastSetSummary, setLastSetSummary] = useState<SetSummary | null>(null);
  const [isWorkoutActive, setIsWorkoutActive] = useState(true);

  // Track per-rep form scores for the current set (to compute avg on end_set)
  const setRepScoresRef = useRef<number[]>([]);

  // Load recommendation from backend
  const [loadRecommendation, setLoadRecommendation] = useState<{
    recommended_load_kg: number;
    change_pct: number;
    reason: string;
    explanation: string;
  } | null>(null);

  // Coaching cue state
  const [coachingCue, setCoachingCue] = useState<string>("");
  const [cueVisible, setCueVisible] = useState(false);
  const cueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rest timer state
  const [restTimeRemaining, setRestTimeRemaining] = useState(90);
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restComplete, setRestComplete] = useState(false);
  const REST_DURATION = 90; // seconds (strength default)

  // Skeleton overlay canvas ref
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const {
    videoRef,
    canvasRef: captureCanvasRef,
    isActive: cameraIsActive,
    error: cameraError,
    facingMode,
    startCamera,
    stopCamera,
    flipCamera,
    captureFrame,
  } = useCamera();

  const {
    isConnected,
    metrics: wsMetrics,
    repCount,
    status: wsStatus,
    phase: wsPhase,
    formScore: wsFormScore,
    fatigue: wsFatigue,
    landmarks,
    lastSetSummary: wsSetSummary,
    connect: wsConnect,
    disconnect: wsDisconnect,
    sendCommand,
    sendFrame,
    stopAndWaitForSummary,
  } = useWebSocket();

  // Per-set rep count (subtract the cumulative count at set start)
  const currentSetReps = repCount - setStartRepCount;

  // Map WS state into the local metrics shape used by the template
  const metrics: RealtimeMetrics = {
    rep_count: currentSetReps,
    knee_flexion: wsMetrics?.knee_flexion_deg ?? 0,
    status: wsStatus,
    phase: wsPhase,
    form_score: wsFormScore ?? 0,
  };

  // -------------------------------------------------------------------------
  // Track per-rep form scores for computing set average
  // -------------------------------------------------------------------------
  const lastRecordedRepCount = useRef(0);
  useEffect(() => {
    // When a new rep is confirmed and we have a form score, record it
    if (
      repCount > lastRecordedRepCount.current &&
      wsFormScore != null &&
      wsFormScore > 0
    ) {
      setRepScoresRef.current.push(wsFormScore);
      lastRecordedRepCount.current = repCount;
    }
  }, [repCount, wsFormScore]);

  // -------------------------------------------------------------------------
  // Handle backend set summary (load recommendation)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (wsSetSummary?.load_recommendation) {
      setLoadRecommendation(wsSetSummary.load_recommendation);
      // Auto-update next set weight if recommendation says to change
      if (wsSetSummary.load_recommendation.reason !== "maintain") {
        setNextSetWeight(String(wsSetSummary.load_recommendation.recommended_load_kg));
      }
    }
  }, [wsSetSummary]);

  // -------------------------------------------------------------------------
  // Update calibration flag from WS status
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Backend sends "Calibrating X/10" during calibration, then "Calibrated"
    // once baseline is established. After that it sends "Tracking".
    if (wsStatus === "Calibrated" || wsStatus === "Tracking") {
      setIsCalibrating(false);
    }
  }, [wsStatus]);

  // -------------------------------------------------------------------------
  // Initialize camera and workout (skip in upload mode)
  // Wait until pre-workout setup is done before starting camera.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (uploadMode || showSetup) return;
    startCamera();
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadMode, showSetup]);

  // -------------------------------------------------------------------------
  // Create session and connect WebSocket after camera is active
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!cameraIsActive) return;

    let cancelled = false;

    async function initSession() {
      try {
        const sessionBody: Record<string, unknown> = {
          exercise_type: exerciseType,
          source: "live",
        };
        if (sessionWeight !== null && sessionWeight > 0) {
          sessionBody.load_used = sessionWeight;
        }
        const session = await apiFetch<{ id: string }>("/sessions/", {
          method: "POST",
          body: JSON.stringify(sessionBody),
        });
        if (!cancelled) {
          setSessionId(session.id);
          wsConnect(exerciseType, session.id);
        }
      } catch (err) {
        console.error("Failed to create session:", err);
        // Still connect WS without session tracking
        if (!cancelled) {
          wsConnect(exerciseType, null);
        }
      }
    }

    initSession();

    return () => {
      cancelled = true;
      wsDisconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseType, cameraIsActive]);

  // -------------------------------------------------------------------------
  // Frame capture and send loop (~10fps)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isConnected || !cameraIsActive || showSetSummary || !isWorkoutActive) {
      return;
    }

    const intervalId = setInterval(async () => {
      const blob = await captureFrame();
      if (blob) {
        sendFrame(blob);
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, [isConnected, cameraIsActive, showSetSummary, isWorkoutActive, captureFrame, sendFrame]);

  // -------------------------------------------------------------------------
  // Main workout timer
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isWorkoutActive) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isWorkoutActive]);

  // -------------------------------------------------------------------------
  // Set timer
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isWorkoutActive || showSetSummary) return;
    const interval = setInterval(() => {
      setSetElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isWorkoutActive, showSetSummary]);

  // -------------------------------------------------------------------------
  // Skeleton overlay drawing
  // -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = skeletonCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas to video display size
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks || landmarks.length === 0) return;

    const color = getSkeletonColor(metrics.form_score);

    // Draw connections
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      if (!start || !end) continue;

      const x1 = start[0] * canvas.width;
      const y1 = start[1] * canvas.height;
      const x2 = end[0] * canvas.width;
      const y2 = end[1] * canvas.height;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw landmark dots
    ctx.fillStyle = color;
    const relevantLandmarks = new Set<number>();
    for (const [a, b] of POSE_CONNECTIONS) {
      relevantLandmarks.add(a);
      relevantLandmarks.add(b);
    }

    for (const idx of relevantLandmarks) {
      const lm = landmarks[idx];
      if (!lm) continue;

      const x = lm[0] * canvas.width;
      const y = lm[1] * canvas.height;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();

      // White inner dot
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = color;
    }
  }, [landmarks, metrics.form_score, videoRef]);

  // -------------------------------------------------------------------------
  // Coaching cue logic
  // -------------------------------------------------------------------------
  const showCue = useCallback((message: string) => {
    // Clear existing timeout
    if (cueTimeoutRef.current) {
      clearTimeout(cueTimeoutRef.current);
    }

    setCoachingCue(message);
    setCueVisible(true);

    // Auto-dismiss after 3 seconds
    cueTimeoutRef.current = setTimeout(() => {
      setCueVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (isCalibrating || showSetSummary) return;

    const score = metrics.form_score;
    const phase = metrics.phase?.toUpperCase() ?? "";
    const kneeFlexion = wsMetrics?.knee_flexion_deg;
    const trunkAngle = wsMetrics?.trunk_angle_deg;

    if (score < 60 && phase === "DESCENDING") {
      showCue("Slow down - control the descent");
    } else if (kneeFlexion != null && kneeFlexion > 110 && phase === "BOTTOM") {
      showCue("Drive deeper - break parallel");
    } else if (trunkAngle != null && trunkAngle < 40) {
      showCue("Chest up - maintain upright torso");
    } else if (score >= 80) {
      showCue("Great form! Keep it up");
    } else if (metrics.status === "Tracking") {
      showCue(getPhaseLabel(metrics.phase));
    }
  }, [metrics.form_score, metrics.phase, metrics.status, wsMetrics, isCalibrating, showSetSummary, showCue]);

  // Cleanup coaching cue timeout
  useEffect(() => {
    return () => {
      if (cueTimeoutRef.current) {
        clearTimeout(cueTimeoutRef.current);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Rest timer logic
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (showSetSummary) {
      setRestTimeRemaining(REST_DURATION);
      setRestTimerActive(true);
      setRestComplete(false);
    } else {
      setRestTimerActive(false);
    }
  }, [showSetSummary]);

  useEffect(() => {
    if (!restTimerActive || restComplete) return;

    const interval = setInterval(() => {
      setRestTimeRemaining((prev) => {
        if (prev <= 1) {
          setRestComplete(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [restTimerActive, restComplete]);

  // -------------------------------------------------------------------------
  // Pause/resume video during set rest
  // -------------------------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (showSetSummary) {
      video.pause();
    } else if (isWorkoutActive) {
      video.play().catch(() => {});
    }
  }, [showSetSummary, isWorkoutActive, videoRef]);

  // -------------------------------------------------------------------------
  // Formatting & color helpers
  // -------------------------------------------------------------------------

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  function getScoreColor(score: number) {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  }

  function getScoreGaugeColor(score: number) {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  }

  function getPhaseLabel(phase: string) {
    switch (phase) {
      case "calibrating":
        return "Calibrating";
      case "descending":
        return "Going Down";
      case "ascending":
        return "Coming Up";
      case "bottom":
        return "Bottom Position";
      case "standing":
        return "Standing";
      default:
        return phase;
    }
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleStartWorkout() {
    const weight = isBodyweight ? null : parseFloat(weightInput);
    if (!isBodyweight && weightInput && (isNaN(weight!) || weight! < 0)) return;
    setSessionWeight(!isBodyweight && weight && weight > 0 ? weight : null);
    setNextSetWeight(!isBodyweight && weight && weight > 0 ? String(weight) : "");
    setShowSetup(false);
  }

  function handleStartUpload() {
    const weight = isBodyweight ? null : parseFloat(weightInput);
    if (!isBodyweight && weightInput && (isNaN(weight!) || weight! < 0)) return;
    setSessionWeight(!isBodyweight && weight && weight > 0 ? weight : null);
    setUploadMode(true);
    setShowSetup(false);
  }

  async function handleUploadSet(file: File) {
    try {
      // Step 1: Upload video
      setUploadStatus("uploading");
      const { job_id } = await uploadVideo(file, selectedExercise);

      // Step 2: Poll for analysis completion
      setUploadStatus("analyzing");
      const result = await pollUntilDone(job_id);

      if (result.status === "failed") {
        throw new Error("error" in result ? result.error : "Analysis failed");
      }
      if (result.status !== "completed" || !("result" in result)) {
        throw new Error("Analysis did not complete");
      }
      if (!result.result.reps || result.result.reps.length === 0) {
        throw new Error("No reps detected in video. Try a clearer angle or longer clip.");
      }

      // Step 3: Create session on first set
      setUploadStatus("saving");
      let sid = sessionId;
      if (!sid) {
        const session = await apiFetch<{ id: string }>("/sessions/", {
          method: "POST",
          body: JSON.stringify({
            exercise_type: selectedExercise,
            source: "upload",
            load_used: sessionWeight,
          }),
        });
        sid = session.id;
        setSessionId(sid);
      }

      // Step 4: Populate set from analysis results
      const setResult = await populateSetFromAnalysis(
        sid,
        uploadSetNumber,
        result.result as Record<string, unknown>,
      );

      // Step 5: Show results
      setUploadSetResults((prev) => [...prev, {
        set_number: setResult.set_number,
        reps: setResult.reps,
        avg_form_score: setResult.avg_form_score,
        fatigue_risk: setResult.fatigue_risk,
      }]);
      setUploadStatus("done");
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadStatus("error");
      setUploadError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    }
  }

  async function pollUntilDone(jobId: string): Promise<AnalysisJobResponse> {
    const maxAttempts = 120; // 2 min at 1s intervals
    for (let i = 0; i < maxAttempts; i++) {
      const job = await getAnalysisJob(jobId);
      if (job.status !== "pending") return job;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Analysis timed out. Try a shorter video.");
  }

  function handleAddAnotherSet() {
    setUploadSetNumber((n) => n + 1);
    setUploadStatus("idle");
    setUploadError(null);
  }

  async function handleFinishUploadWorkout() {
    if (!sessionId) {
      router.push("/dashboard");
      return;
    }
    try {
      const result = await apiFetch<{ id?: string; discarded?: boolean }>(
        `/sessions/${sessionId}/end`,
        { method: "POST" },
      );
      if (result.discarded) {
        router.push("/dashboard");
      } else {
        router.push(`/session/${result.id ?? sessionId}`);
      }
    } catch {
      router.push(`/session/${sessionId}`);
    }
  }

  async function handleEndSet() {
    const currentWeight = nextSetWeight ? parseFloat(nextSetWeight) : sessionWeight;
    const perSetReps = currentSetReps;

    // Compute average form score from the per-rep scores collected during this set
    const repScores = setRepScoresRef.current;
    const avgScore =
      repScores.length > 0
        ? Math.round(
            (repScores.reduce((a, b) => a + b, 0) / repScores.length) * 10
          ) / 10
        : metrics.form_score;

    const setSummary: SetSummary = {
      set_number: currentSet,
      reps: perSetReps,
      avg_form_score: avgScore,
      duration: setElapsed,
      load_used: currentWeight && currentWeight > 0 ? currentWeight : null,
      fatigue_risk: wsFatigue?.fatigue_risk ?? null,
    };

    // Create the set via REST API first (so the WebSocket can find and update it)
    try {
      if (sessionId) {
        const setBody: Record<string, unknown> = {
          target_reps: perSetReps,
        };
        if (currentWeight !== null && currentWeight > 0) {
          setBody.load_used = currentWeight;
        }
        await apiFetch<SetData>(`/sessions/${sessionId}/sets`, {
          method: "POST",
          body: JSON.stringify(setBody),
        });
      }
    } catch (error) {
      console.error("Failed to save set data:", error);
    }

    // Then tell WebSocket to score and attach reps to this set
    // Include load and target reps so backend can generate load recommendation
    sendCommand("end_set", {
      load_used: currentWeight && currentWeight > 0 ? currentWeight : undefined,
      target_reps: perSetReps > 0 ? perSetReps : undefined,
    });

    setCompletedSets((prev) => [...prev, setSummary]);
    setLastSetSummary(setSummary);
    setShowSetSummary(true);
  }

  function handleNextSet() {
    // Save current cumulative rep count so the next set starts from 0
    setSetStartRepCount(repCount);
    setCurrentSet((prev) => prev + 1);
    setSetElapsed(0);
    setShowSetSummary(false);
    setEditingWeight(false);
    // Reset per-rep score tracker for the new set
    setRepScoresRef.current = [];
    sendCommand("start_set");
  }

  function handleSkipRest() {
    setRestTimerActive(false);
    setRestComplete(false);
    handleNextSet();
  }

  async function handleEndWorkout() {
    setIsWorkoutActive(false);

    if (!sessionId) {
      sendCommand("stop");
      stopCamera();
      router.push("/dashboard");
      return;
    }

    // IMPORTANT: send "stop" and wait for the backend to save reps BEFORE
    // stopping the camera. stopCamera() sets cameraIsActive=false which
    // triggers the useEffect cleanup that disconnects the WebSocket.
    await stopAndWaitForSummary(10_000);
    stopCamera();

    try {
      const result = await apiFetch<{ id?: string; discarded?: boolean }>(`/sessions/${sessionId}/end`, {
        method: "POST",
      });
      if (result.discarded) {
        // No reps recorded — session was deleted server-side
        router.push("/dashboard");
      } else {
        router.push(`/session/${result.id ?? sessionId}`);
      }
    } catch (error) {
      console.error("Failed to end workout:", error);
      router.push(`/session/${sessionId}`);
    }
  }

  // -------------------------------------------------------------------------
  // Rest timer progress calculation
  // -------------------------------------------------------------------------
  const restProgress = ((REST_DURATION - restTimeRemaining) / REST_DURATION) * 100;
  const restCircumference = 2 * Math.PI * 54; // radius 54
  const restStrokeDashoffset =
    restCircumference - (restProgress / 100) * restCircumference;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Pre-workout setup screen
  // -------------------------------------------------------------------------
  if (showSetup) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <Dumbbell className="h-10 w-10 mx-auto text-violet-400" />
            <h1 className="text-xl font-bold">Set Up Your Workout</h1>
            <p className="text-sm text-zinc-400">
              Choose your exercise and weight. You can adjust per set during rest.
            </p>
          </div>

          <Card className="border-zinc-800 bg-zinc-900 text-white">
            <CardContent className="pt-6 space-y-4">
              {/* Exercise picker */}
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Exercise
                </label>
                <div className="relative">
                  <select
                    value={selectedExercise}
                    onChange={(e) => setSelectedExercise(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 pr-10 text-white text-sm font-medium capitalize focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    {EXERCISE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>

              {/* Bodyweight toggle */}
              <button
                type="button"
                onClick={() => {
                  setIsBodyweight(!isBodyweight);
                  if (!isBodyweight) setWeightInput("");
                }}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  isBodyweight
                    ? "border-violet-500 bg-violet-500/10 text-violet-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                <span className="font-medium">Bodyweight only</span>
                <span className="block text-xs text-zinc-500 mt-0.5">
                  No external weight added
                </span>
              </button>

              {/* Weight input */}
              {!isBodyweight && (
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Weight (kg)
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    placeholder="e.g. 60"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white text-lg h-12 text-center"
                    autoFocus
                  />
                  {/* Quick weight buttons */}
                  <div className="flex flex-wrap gap-2 justify-center pt-1">
                    {[20, 40, 60, 80, 100].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setWeightInput(String(w))}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          weightInput === String(w)
                            ? "bg-violet-500 text-white"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-500"
                        }`}
                      >
                        {w} kg
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Camera Placement Guide (exercise-specific) */}
          {(() => {
            const guide = getCameraGuide(exerciseType);
            const posLabel =
              guide.position === "side" ? "side view" :
              guide.position === "front" ? "front view" :
              "front-diagonal (45°)";
            return (
              <Card className="border-zinc-800 bg-zinc-900 text-white">
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-violet-400">
                    <Smartphone className="h-4 w-4" />
                    Camera Setup
                  </div>
                  <div className="flex gap-4 items-start">
                    {/* Visual diagram */}
                    <div className="flex-shrink-0 w-24 h-20 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center relative overflow-hidden">
                      <CameraGuideDiagram position={guide.position} />
                    </div>
                    {/* Tips */}
                    <div className="flex-1 space-y-1.5">
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Place camera at{" "}
                        <span className="text-green-400 font-medium">{posLabel}</span>,{" "}
                        {guide.distance} away, at {guide.height}.
                      </p>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {guide.tip}
                      </p>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Full body visible in frame.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full"
              onClick={handleStartWorkout}
              disabled={!isBodyweight && weightInput !== "" && (isNaN(parseFloat(weightInput)) || parseFloat(weightInput) < 0)}
            >
              <Camera className="mr-2 h-4 w-4" />
              Start Live Workout
            </Button>

            <div className="relative flex items-center gap-2">
              <div className="h-px flex-1 bg-zinc-700" />
              <span className="text-xs text-zinc-500 uppercase">or</span>
              <div className="h-px flex-1 bg-zinc-700" />
            </div>

            <Button
              size="lg"
              variant="outline"
              className="w-full border-violet-500/50 text-violet-300 hover:bg-violet-500/10"
              onClick={handleStartUpload}
              disabled={!isBodyweight && weightInput !== "" && (isNaN(parseFloat(weightInput)) || parseFloat(weightInput) < 0)}
            >
              <FileVideo className="mr-2 h-4 w-4" />
              Upload Video
            </Button>
          </div>

          <Button
            variant="ghost"
            className="w-full text-zinc-500 hover:text-zinc-300"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Upload flow screen
  // ---------------------------------------------------------------------------
  if (uploadMode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white px-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Idle: pick a file */}
          {uploadStatus === "idle" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <FileVideo className="h-12 w-12 text-violet-400" />
              <h2 className="text-xl font-bold">
                Upload Set {uploadSetNumber} Video
              </h2>
              <p className="text-sm text-zinc-400 max-w-xs">
                Select a video of your{" "}
                {selectedExercise.replace(/_/g, " ")} set to analyze.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadSet(file);
                  // Reset so same file can be re-selected
                  e.target.value = "";
                }}
              />
              <Button
                size="lg"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileVideo className="mr-2 h-4 w-4" />
                Choose Video File
              </Button>
              <p className="text-xs text-zinc-500">
                Supported: mp4, mov, avi, webm (max 100 MB)
              </p>

              {/* Previously completed sets */}
              {uploadSetResults.length > 0 && (
                <div className="w-full space-y-2 mt-2">
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                    Completed Sets
                  </p>
                  {uploadSetResults.map((s) => (
                    <div
                      key={s.set_number}
                      className="flex items-center justify-between rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
                    >
                      <span className="text-sm font-medium">
                        Set {s.set_number}
                      </span>
                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span>{s.reps} reps</span>
                        {s.avg_form_score != null && (
                          <span className="text-violet-400">
                            {s.avg_form_score.toFixed(1)} form
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Finish if at least one set done */}
              {uploadSetResults.length > 0 && (
                <Button
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={handleFinishUploadWorkout}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Finish Workout ({uploadSetResults.reduce((a, s) => a + s.reps, 0)} total reps)
                </Button>
              )}

              <Button
                variant="ghost"
                className="text-zinc-500 hover:text-zinc-300"
                onClick={() => {
                  setUploadMode(false);
                  setShowSetup(true);
                  setUploadStatus("idle");
                  setUploadSetResults([]);
                  setUploadSetNumber(1);
                  setSessionId(null);
                }}
              >
                Back to Setup
              </Button>
            </div>
          )}

          {/* Uploading / Analyzing / Saving */}
          {(uploadStatus === "uploading" ||
            uploadStatus === "analyzing" ||
            uploadStatus === "saving") && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-violet-400 border-t-transparent" />
              <h2 className="text-xl font-bold">
                {uploadStatus === "uploading" && "Uploading Video..."}
                {uploadStatus === "analyzing" && "Analyzing Your Form..."}
                {uploadStatus === "saving" && "Saving Results..."}
              </h2>
              <p className="text-sm text-zinc-400">
                {uploadStatus === "uploading" &&
                  "Sending your video to our servers."}
                {uploadStatus === "analyzing" &&
                  "Running AI pose detection and scoring. This may take a moment."}
                {uploadStatus === "saving" &&
                  "Creating your session with detailed rep data."}
              </p>
            </div>
          )}

          {/* Done: show set result */}
          {uploadStatus === "done" && uploadSetResults.length > 0 && (() => {
            const latest = uploadSetResults[uploadSetResults.length - 1];
            return (
              <div className="flex flex-col items-center gap-4 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-400" />
                <h2 className="text-xl font-bold">
                  Set {latest.set_number} Analyzed
                </h2>
                <Card className="w-full bg-zinc-900 border-zinc-700">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-white">
                          {latest.reps}
                        </p>
                        <p className="text-xs text-zinc-400">Reps</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-violet-400">
                          {latest.avg_form_score != null
                            ? latest.avg_form_score.toFixed(1)
                            : "—"}
                        </p>
                        <p className="text-xs text-zinc-400">Form Score</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* All sets so far */}
                {uploadSetResults.length > 1 && (
                  <div className="w-full space-y-1">
                    {uploadSetResults.slice(0, -1).map((s) => (
                      <div
                        key={s.set_number}
                        className="flex items-center justify-between rounded bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400"
                      >
                        <span>Set {s.set_number}</span>
                        <span>
                          {s.reps} reps
                          {s.avg_form_score != null &&
                            ` · ${s.avg_form_score.toFixed(1)} form`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex w-full gap-3">
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1 border-zinc-600"
                    onClick={handleAddAnotherSet}
                  >
                    Add Set {uploadSetNumber + 1}
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleFinishUploadWorkout}
                  >
                    Finish
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Error */}
          {uploadStatus === "error" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertTriangle className="h-12 w-12 text-red-400" />
              <h2 className="text-xl font-bold text-red-400">
                Analysis Failed
              </h2>
              <p className="text-sm text-zinc-400">{uploadError}</p>
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  setUploadStatus("idle");
                  setUploadError(null);
                }}
              >
                Try Again
              </Button>
              <Button
                variant="ghost"
                className="text-zinc-500 hover:text-zinc-300"
                onClick={() => {
                  setUploadMode(false);
                  setUploadStatus("idle");
                  setShowSetup(true);
                }}
              >
                Back to Setup
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      {/* Hidden canvas for frame capture (used by useCamera) */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Camera Feed Section */}
      <div className="relative aspect-[3/4] w-full sm:aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Skeleton overlay canvas */}
        <canvas
          ref={skeletonCanvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {/* Camera flip button (mobile) */}
        {cameraIsActive && (
          <button
            type="button"
            onClick={flipCamera}
            className="absolute top-3 right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm border border-white/20 hover:bg-black/70 transition-colors"
            aria-label={`Switch to ${facingMode === "user" ? "rear" : "front"} camera`}
          >
            <RotateCcw className="h-5 w-5 text-white" />
          </button>
        )}

        {/* Calibrating Overlay */}
        {isCalibrating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
              <p className="text-lg font-semibold">Calibrating...</p>
              <p className="text-sm text-white/70">
                Stand in frame and hold a neutral position
              </p>
              {(() => {
                const guide = getCameraGuide(exerciseType);
                const posLabel =
                  guide.position === "side" ? "side view" :
                  guide.position === "front" ? "front view" :
                  "front-diagonal (45°)";
                return (
                  <div className="flex items-start gap-2 rounded-lg bg-zinc-900/80 border border-zinc-700 px-3 py-2 max-w-xs">
                    <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-zinc-400 text-left leading-relaxed">
                      Best results from{" "}
                      <span className="text-amber-300 font-medium">{posLabel}</span>.{" "}
                      {guide.why}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <Camera className="h-10 w-10 text-red-400" />
              <p className="text-lg font-semibold text-red-400">
                Camera Access Required
              </p>
              <p className="text-sm text-white/70">{cameraError}</p>
              <p className="text-xs text-white/50 max-w-xs">
                Camera access is required to track your movement. No data will be recorded without it.
              </p>
              <div className="flex gap-3 mt-2">
                <Button
                  variant="outline"
                  onClick={() => router.back()}
                  className="text-white border-white/30"
                >
                  Go Back
                </Button>
                <Button
                  variant="outline"
                  onClick={startCamera}
                  className="text-white border-white/30"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Top overlay: timer + set counter */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-3">
          <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <Timer className="h-4 w-4" />
            <span className="font-mono text-sm font-bold">
              {formatTime(timer)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="bg-black/60 text-white backdrop-blur-sm"
            >
              Set {currentSet}
            </Badge>
            {sessionWeight !== null && (
              <Badge
                variant="secondary"
                className="bg-black/60 text-white backdrop-blur-sm"
              >
                {nextSetWeight || sessionWeight} kg
              </Badge>
            )}
          </div>
          <Badge
            variant={isConnected ? "default" : "destructive"}
            className="backdrop-blur-sm"
          >
            {isConnected ? "Live" : "Disconnected"}
          </Badge>
        </div>

        {/* Coaching cue banner */}
        {!isCalibrating && coachingCue && (
          <div
            className={`absolute left-0 right-0 top-14 z-10 flex justify-center px-3 transition-all duration-500 ${
              cueVisible
                ? "translate-y-0 opacity-100"
                : "-translate-y-2 opacity-0"
            }`}
          >
            <div className="rounded-full bg-black/70 px-4 py-2 backdrop-blur-sm border border-violet-500/20">
              <p className="text-center text-sm font-medium text-white">
                {coachingCue}
              </p>
            </div>
          </div>
        )}

        {/* Bottom overlay: real-time metrics */}
        {!isCalibrating && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/60">
                  Reps
                </p>
                <p className="text-2xl font-bold">{metrics.rep_count}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/60">
                  Knee Flexion
                </p>
                <p className="text-2xl font-bold">
                  {Math.round(Number(metrics.knee_flexion) || 0)}&deg;
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/60">
                  Phase
                </p>
                <p className="text-sm font-semibold mt-1">
                  {getPhaseLabel(metrics.phase)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Panel */}
      <div className="flex-1 space-y-4 p-4">
        {/* Form Score Gauge */}
        <Card className="border-zinc-800 bg-zinc-900 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gauge className="h-4 w-4" />
              Form Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="relative h-3 overflow-hidden rounded-full bg-zinc-700">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${getScoreGaugeColor(
                      metrics.form_score
                    )}`}
                    style={{ width: `${Math.min(100, metrics.form_score)}%` }}
                  />
                </div>
              </div>
              <span
                className={`text-2xl font-bold ${getScoreColor(
                  metrics.form_score
                )}`}
              >
                {Math.round(Number(metrics.form_score) || 0)}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Status: {metrics.status}
            </p>

            {/* Fatigue Indicator */}
            {wsFatigue && (
              <div className="mt-3 flex items-center gap-3">
                <Activity className="h-4 w-4 text-zinc-400" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-400">Fatigue</span>
                    <span className={`text-xs font-semibold ${
                      wsFatigue.fatigue_risk === "high" ? "text-red-400" :
                      wsFatigue.fatigue_risk === "moderate" ? "text-amber-400" :
                      "text-green-400"
                    }`}>
                      {wsFatigue.fatigue_risk === "high" ? "High" :
                       wsFatigue.fatigue_risk === "moderate" ? "Moderate" :
                       "Fresh"}
                    </span>
                  </div>
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-700">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                        wsFatigue.fatigue_risk === "high" ? "bg-red-500" :
                        wsFatigue.fatigue_risk === "moderate" ? "bg-amber-500" :
                        "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(100, (wsFatigue.fatigue_index ?? 0) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Set Summary with Rest Timer */}
        {showSetSummary && lastSetSummary && (
          <Card className="border-zinc-800 bg-zinc-900 text-white">
            <CardHeader>
              <CardTitle className="text-center text-lg">
                Set {lastSetSummary.set_number} Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-zinc-400">Reps</p>
                  <p className="text-xl font-bold">{lastSetSummary.reps}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Score</p>
                  <p
                    className={`text-xl font-bold ${getScoreColor(
                      lastSetSummary.avg_form_score
                    )}`}
                  >
                    {Math.round(Number(lastSetSummary.avg_form_score) || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Duration</p>
                  <p className="text-xl font-bold">
                    {formatTime(lastSetSummary.duration)}
                  </p>
                </div>
              </div>

              {/* Rest Timer Section */}
              <div className="flex flex-col items-center gap-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Rest Timer
                </p>

                {/* Circular progress */}
                <div className="relative flex items-center justify-center">
                  <svg
                    width="128"
                    height="128"
                    viewBox="0 0 128 128"
                    className="-rotate-90"
                  >
                    {/* Background circle */}
                    <circle
                      cx="64"
                      cy="64"
                      r="54"
                      fill="none"
                      stroke="#3f3f46"
                      strokeWidth="6"
                    />
                    {/* Progress circle */}
                    <circle
                      cx="64"
                      cy="64"
                      r="54"
                      fill="none"
                      stroke={restComplete ? "#22c55e" : "#3b82f6"}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={restCircumference}
                      strokeDashoffset={restStrokeDashoffset}
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    {restComplete ? (
                      <CheckCircle2 className="h-8 w-8 text-green-500 animate-bounce" />
                    ) : (
                      <span className="text-2xl font-bold font-mono">
                        {formatTime(restTimeRemaining)}
                      </span>
                    )}
                    {restComplete && (
                      <span className="text-xs font-semibold text-green-400 mt-1">
                        Rest Complete
                      </span>
                    )}
                  </div>
                </div>

                {/* Load Recommendation */}
                {loadRecommendation && (
                  <div className={`w-full rounded-lg border p-3 ${
                    loadRecommendation.reason === "increase"
                      ? "border-green-700/50 bg-green-950/30"
                      : loadRecommendation.reason === "decrease"
                      ? "border-red-700/50 bg-red-950/30"
                      : "border-zinc-700 bg-zinc-800/50"
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      {loadRecommendation.reason === "increase" ? (
                        <TrendingUp className="h-4 w-4 text-green-400" />
                      ) : loadRecommendation.reason === "decrease" ? (
                        <TrendingDown className="h-4 w-4 text-red-400" />
                      ) : (
                        <Minus className="h-4 w-4 text-zinc-400" />
                      )}
                      <span className={`text-xs font-semibold uppercase tracking-wide ${
                        loadRecommendation.reason === "increase" ? "text-green-400" :
                        loadRecommendation.reason === "decrease" ? "text-red-400" :
                        "text-zinc-400"
                      }`}>
                        {loadRecommendation.reason === "increase" ? "Increase Load" :
                         loadRecommendation.reason === "decrease" ? "Decrease Load" :
                         "Maintain Load"}
                      </span>
                      {loadRecommendation.change_pct !== 0 && (
                        <span className="text-xs text-zinc-500">
                          ({loadRecommendation.change_pct > 0 ? "+" : ""}{Math.round((Number(loadRecommendation.change_pct) || 0) * 10) / 10}%)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {loadRecommendation.explanation}
                    </p>
                    <p className="text-sm font-bold mt-1">
                      Suggested: {loadRecommendation.recommended_load_kg} kg
                    </p>
                  </div>
                )}

                {/* Next Set Preview */}
                <div className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
                    Next Set Preview
                  </p>
                  <div className={`grid gap-2 text-center ${sessionWeight !== null ? "grid-cols-3" : "grid-cols-2"}`}>
                    <div>
                      <p className="text-xs text-zinc-500">Set</p>
                      <p className="text-lg font-bold">{currentSet + 1}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Target Reps</p>
                      <p className="text-lg font-bold">
                        {lastSetSummary.reps}
                      </p>
                    </div>
                    {sessionWeight !== null && (
                      <div>
                        <p className="text-xs text-zinc-500">Weight</p>
                        {editingWeight ? (
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.5"
                            value={nextSetWeight}
                            onChange={(e) => setNextSetWeight(e.target.value)}
                            onBlur={() => setEditingWeight(false)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setEditingWeight(false);
                            }}
                            className="bg-zinc-700 border-zinc-600 text-white text-center h-8 w-20 mx-auto mt-0.5"
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingWeight(true)}
                            className="inline-flex items-center gap-1 text-lg font-bold hover:text-violet-400 transition-colors"
                          >
                            {nextSetWeight || sessionWeight} kg
                            <Pencil className="h-3 w-3 text-zinc-500" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-zinc-600 text-white hover:bg-zinc-800"
                  onClick={handleEndWorkout}
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  End Workout
                </Button>
                <Button className="flex-1" onClick={handleSkipRest}>
                  <SkipForward className="mr-2 h-4 w-4" />
                  {restComplete ? "Next Set" : "Skip Rest"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Completed Sets Overview */}
        {completedSets.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Completed Sets
            </p>
            {completedSets.map((s) => (
              <div
                key={s.set_number}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
              >
                <span className="text-sm text-zinc-300">
                  Set {s.set_number}
                </span>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-zinc-400">{s.reps} reps</span>
                  {s.load_used !== null && (
                    <span className="text-zinc-500">{s.load_used} kg</span>
                  )}
                  <span className={getScoreColor(s.avg_form_score)}>
                    {Math.round(Number(s.avg_form_score) || 0)}
                  </span>
                  {s.fatigue_risk && s.fatigue_risk !== "low" && (
                    <span className={`text-xs ${
                      s.fatigue_risk === "high" ? "text-red-400" : "text-amber-400"
                    }`}>
                      {s.fatigue_risk === "high" ? "⚠ Fatigue" : "~ Moderate"}
                    </span>
                  )}
                  <span className="text-zinc-500">
                    {formatTime(s.duration)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        {!showSetSummary && (
          <div className="flex gap-3 pt-2">
            <Button
              size="lg"
              variant="outline"
              className="flex-1 border-zinc-600 text-white hover:bg-zinc-800"
              onClick={handleEndSet}
              disabled={isCalibrating || !!cameraError}
            >
              <Square className="mr-2 h-4 w-4" />
              End Set
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="flex-1"
              onClick={handleEndWorkout}
              disabled={!!cameraError}
            >
              <StopCircle className="mr-2 h-4 w-4" />
              End Workout
            </Button>
          </div>
        )}
      </div>

      {/* Exercise label */}
      <div className="border-t border-zinc-800 p-3 text-center">
        <p className="text-xs text-zinc-500">
          Exercise:{" "}
          <span className="capitalize font-medium text-zinc-300">
            {exerciseType.replace(/_/g, " ")}
          </span>{" "}
          | Set Timer: {formatTime(setElapsed)}
        </p>
      </div>
    </div>
  );
}

export default function WorkoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
        </div>
      }
    >
      <WorkoutContent />
    </Suspense>
  );
}
