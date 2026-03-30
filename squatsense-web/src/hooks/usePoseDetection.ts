"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Constants ───────────────────────────────────────────────────────────────
const DETECT_INTERVAL_MS = 80; // ~12fps for game-time detection

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// ── Types ───────────────────────────────────────────────────────────────────
export interface NormalizedLandmark {
  x: number; // 0-1
  y: number; // 0-1
  z: number;
  visibility?: number;
}

export interface WorldLandmark {
  x: number; // meters, hip-centered
  y: number;
  z: number;
}

export interface UsePoseDetectionReturn {
  isModelLoading: boolean;
  modelError: string | null;
  landmarks: NormalizedLandmark[] | null;
  worldLandmarks: WorldLandmark[] | null;
  /** Refs for reading latest values inside intervals/closures without stale state */
  landmarksRef: React.RefObject<NormalizedLandmark[] | null>;
  worldLandmarksRef: React.RefObject<WorldLandmark[] | null>;
  start: (videoElement: HTMLVideoElement) => void;
  stop: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function usePoseDetection(): UsePoseDetectionReturn {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [worldLandmarks, setWorldLandmarks] = useState<WorldLandmark[] | null>(null);

  // Refs for reading latest values inside intervals/closures
  const landmarksRefOut = useRef<NormalizedLandmark[] | null>(null);
  const worldLandmarksRefOut = useRef<WorldLandmark[] | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const landmarkerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

    lastTimestampRef.current = 0;
  }, []);

  const start = useCallback(
    (videoElement: HTMLVideoElement) => {
      if (activeRef.current) return;
      activeRef.current = true;

      setIsModelLoading(true);
      setModelError(null);
      setLandmarks(null);
      setWorldLandmarks(null);
      lastTimestampRef.current = 0;

      (async () => {
        try {
          const MODEL_LOAD_TIMEOUT_MS = 30_000;

          const vision = await import("@mediapipe/tasks-vision");
          const { PoseLandmarker, FilesetResolver } = vision;

          const loadModel = async () => {
            const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);

            // Try GPU first, fall back to CPU
            try {
              return await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
                runningMode: "VIDEO",
                numPoses: 1,
              });
            } catch {
              return await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
                runningMode: "VIDEO",
                numPoses: 1,
              });
            }
          };

          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(
              "Pose model took too long to load. Check your internet connection and try again."
            )), MODEL_LOAD_TIMEOUT_MS)
          );

          const landmarker = await Promise.race([loadModel(), timeout]);

          landmarkerRef.current = landmarker;
          setIsModelLoading(false);

          if (!activeRef.current) {
            landmarker.close();
            return;
          }

          // Detection loop at ~12fps
          intervalRef.current = setInterval(() => {
            if (!activeRef.current || !landmarkerRef.current) return;
            if (videoElement.readyState < 2) return;

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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const lms: NormalizedLandmark[] = result.landmarks[0].map((lm: any) => ({
                  x: lm.x,
                  y: lm.y,
                  z: lm.z,
                  visibility: lm.visibility,
                }));
                setLandmarks(lms);
                landmarksRefOut.current = lms;

                // World landmarks (3D, hip-centered, in meters)
                if (
                  result.worldLandmarks &&
                  result.worldLandmarks.length > 0 &&
                  result.worldLandmarks[0].length >= 33
                ) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const wlms: WorldLandmark[] = result.worldLandmarks[0].map((lm: any) => ({
                    x: lm.x,
                    y: lm.y,
                    z: lm.z,
                  }));
                  setWorldLandmarks(wlms);
                  worldLandmarksRefOut.current = wlms;
                } else {
                  setWorldLandmarks(null);
                  worldLandmarksRefOut.current = null;
                }
              } else {
                setLandmarks(null);
                setWorldLandmarks(null);
                landmarksRefOut.current = null;
                worldLandmarksRefOut.current = null;
              }
            } catch {
              // Detection error — skip frame
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

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    isModelLoading,
    modelError,
    landmarks,
    worldLandmarks,
    landmarksRef: landmarksRefOut,
    worldLandmarksRef: worldLandmarksRefOut,
    start,
    stop,
  };
}
