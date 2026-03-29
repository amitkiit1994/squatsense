"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Landmark indices needed for calibration checks ───────────────────────────
const REQUIRED_INDICES = [
  11, // LEFT_SHOULDER
  12, // RIGHT_SHOULDER
  23, // LEFT_HIP
  24, // RIGHT_HIP
  25, // LEFT_KNEE
  26, // RIGHT_KNEE
  27, // LEFT_ANKLE
  28, // RIGHT_ANKLE
];

const VISIBILITY_THRESHOLD = 0.5;
const DETECT_INTERVAL_MS = 200; // ~5fps
const READY_HOLD_MS = 1000; // must pass all checks for 1 second

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// ── Types ────────────────────────────────────────────────────────────────────
export interface NormalizedLandmark {
  x: number; // 0-1
  y: number; // 0-1
  z: number;
  visibility?: number;
}

export interface CalibrationStatus {
  bodyVisible: boolean;
  properlyFramed: boolean;
  centered: boolean;
}

export interface UsePoseCalibrationReturn {
  isModelLoading: boolean;
  modelError: string | null;
  landmarks: NormalizedLandmark[] | null;
  calibration: CalibrationStatus;
  isReady: boolean;
  start: (videoElement: HTMLVideoElement) => void;
  stop: () => void;
}

// ── Calibration check logic ──────────────────────────────────────────────────
function computeCalibration(
  landmarks: NormalizedLandmark[]
): CalibrationStatus {
  const required = REQUIRED_INDICES.map((i) => landmarks[i]);

  // Check 1: All 8 key landmarks detected with sufficient visibility
  const bodyVisible = required.every(
    (lm) => lm && (lm.visibility ?? 0) > VISIBILITY_THRESHOLD
  );

  // Check 2: Body height occupies 40-85% of frame
  const ys = required.filter((lm) => lm).map((lm) => lm.y);
  const bodyHeight = Math.max(...ys) - Math.min(...ys);
  const properlyFramed = bodyHeight >= 0.4 && bodyHeight <= 0.85;

  // Check 3: Body center within middle 60% of frame horizontally
  const xs = required.filter((lm) => lm).map((lm) => lm.x);
  const centerX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const centered = centerX >= 0.2 && centerX <= 0.8;

  return { bodyVisible, properlyFramed, centered };
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePoseCalibration(): UsePoseCalibrationReturn {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [calibration, setCalibration] = useState<CalibrationStatus>({
    bodyVisible: false,
    properlyFramed: false,
    centered: false,
  });
  const [isReady, setIsReady] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const landmarkerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyStartRef = useRef<number | null>(null);
  const lastTimestampRef = useRef(0);
  const activeRef = useRef(false);

  const stop = useCallback(() => {
    activeRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (landmarkerRef.current) {
      try {
        landmarkerRef.current.close();
      } catch {
        // ignore cleanup errors
      }
      landmarkerRef.current = null;
    }

    readyStartRef.current = null;
    lastTimestampRef.current = 0;
  }, []);

  const start = useCallback(
    (videoElement: HTMLVideoElement) => {
      // Prevent double-init
      if (activeRef.current) return;
      activeRef.current = true;

      setIsModelLoading(true);
      setModelError(null);
      setLandmarks(null);
      setCalibration({ bodyVisible: false, properlyFramed: false, centered: false });
      setIsReady(false);
      readyStartRef.current = null;
      lastTimestampRef.current = 0;

      (async () => {
        try {
          // Dynamic import to avoid SSR issues
          const vision = await import("@mediapipe/tasks-vision");
          const { PoseLandmarker, FilesetResolver } = vision;

          const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);

          // Try GPU first, fall back to CPU
          let landmarker;
          try {
            landmarker = await PoseLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
              runningMode: "VIDEO",
              numPoses: 1,
            });
          } catch {
            landmarker = await PoseLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
              runningMode: "VIDEO",
              numPoses: 1,
            });
          }

          landmarkerRef.current = landmarker;
          setIsModelLoading(false);

          if (!activeRef.current) {
            landmarker.close();
            return;
          }

          // Start detection loop
          intervalRef.current = setInterval(() => {
            if (!activeRef.current || !landmarkerRef.current) return;
            if (videoElement.readyState < 2) return; // Video not ready

            // Ensure strictly increasing timestamp
            const now = performance.now();
            const timestamp = Math.max(
              Math.round(now),
              lastTimestampRef.current + 1
            );
            lastTimestampRef.current = timestamp;

            try {
              const result = landmarkerRef.current.detectForVideo(
                videoElement,
                timestamp
              );

              if (
                result.landmarks &&
                result.landmarks.length > 0 &&
                result.landmarks[0].length >= 33
              ) {
                const lms: NormalizedLandmark[] = result.landmarks[0].map(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (lm: any) => ({
                    x: lm.x,
                    y: lm.y,
                    z: lm.z,
                    visibility: lm.visibility,
                  })
                );

                setLandmarks(lms);
                const cal = computeCalibration(lms);
                setCalibration(cal);

                // Check if all criteria pass
                const allPass =
                  cal.bodyVisible && cal.properlyFramed && cal.centered;

                if (allPass) {
                  if (readyStartRef.current === null) {
                    readyStartRef.current = Date.now();
                  } else if (
                    Date.now() - readyStartRef.current >=
                    READY_HOLD_MS
                  ) {
                    setIsReady(true);
                  }
                } else {
                  readyStartRef.current = null;
                  setIsReady(false);
                }
              } else {
                // No pose detected
                setLandmarks(null);
                setCalibration({
                  bodyVisible: false,
                  properlyFramed: false,
                  centered: false,
                });
                readyStartRef.current = null;
                setIsReady(false);
              }
            } catch {
              // Detection error (video not playing, etc.) — skip frame
            }
          }, DETECT_INTERVAL_MS);
        } catch (err) {
          setIsModelLoading(false);
          setModelError(
            err instanceof Error ? err.message : "Failed to load pose model"
          );
        }
      })();
    },
    [stop]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    isModelLoading,
    modelError,
    landmarks,
    calibration,
    isReady,
    start,
    stop,
  };
}
