"use client";

/**
 * Camera access hook for live workout analysis.
 *
 * Manages a `getUserMedia` video stream, renders to a hidden
 * `<canvas>` for frame capture, and exposes a `captureFrame()`
 * function that returns a JPEG `Blob` suitable for sending over
 * the WebSocket to the backend.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCameraReturn {
  /** Ref to attach to a `<video>` element. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Ref to an off-screen `<canvas>` used for frame capture. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Whether the camera stream is actively playing. */
  isActive: boolean;
  /** Human-readable error if camera access fails. */
  error: string | null;
  /** Current facing mode ("user" = front, "environment" = rear). */
  facingMode: "user" | "environment";
  /** Request camera access and start the video stream. */
  startCamera: () => Promise<void>;
  /** Stop the camera stream and release hardware. */
  stopCamera: () => void;
  /** Toggle between front and rear cameras. */
  flipCamera: () => Promise<void>;
  /**
   * Capture the current video frame as a JPEG `Blob`.
   * Returns `null` if the camera is not active.
   */
  captureFrame: () => Promise<Blob | null>;
  /**
   * Load a local video file as the source instead of the camera.
   * `captureFrame()` works the same way as with a live camera.
   * @param options.loop - Whether to loop the video (default: false).
   * @param options.onEnded - Callback fired when the video finishes playing.
   */
  loadVideoFile: (file: File, options?: { loop?: boolean; onEnded?: () => void }) => void;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  /**
   * Request camera access and pipe the stream into the video element.
   */
  const startCamera = useCallback(async () => {
    setError(null);

    // Guard: getUserMedia may not be available (e.g. insecure context)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not supported in this browser or context.");
      return;
    }

    // Stop any existing stream before requesting a new one (handles
    // React strict-mode double-mount and manual retries).
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode,
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // If rear camera fails, fallback to front camera
      if (facingMode === "environment") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
          setFacingMode("user");
        } catch (err2) {
          const message =
            err2 instanceof DOMException
              ? cameraErrorMessage(err2)
              : "Failed to access camera.";
          setError(message);
          setIsActive(false);
          return;
        }
      } else {
        const message =
          err instanceof DOMException
            ? cameraErrorMessage(err)
            : "Failed to access camera.";
        setError(message);
        setIsActive(false);
        return;
      }
    }

    streamRef.current = stream!;

    if (videoRef.current) {
      videoRef.current.srcObject = stream!;
      try {
        await videoRef.current.play();
      } catch {
        // Autoplay may be blocked — not a camera error.
      }
    }

    setIsActive(true);
  }, [facingMode]);

  /**
   * Toggle between front and rear cameras.
   */
  const flipCamera = useCallback(async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);

    // If currently active, restart with new facing mode
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (!navigator.mediaDevices?.getUserMedia) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }
      setIsActive(true);
    } catch {
      setError(`Could not switch to ${newMode === "user" ? "front" : "rear"} camera.`);
    }
  }, [facingMode]);

  /**
   * Stop all tracks and release the camera.
   */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsActive(false);
  }, []);

  /**
   * Draw the current video frame onto the canvas and convert to
   * a JPEG Blob for transmission to the backend.
   */
  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !isActive || video.readyState < 2) {
      return null;
    }

    // Match canvas dimensions to the actual video resolution
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        "image/jpeg",
        0.8, // quality
      );
    });
  }, [isActive]);

  /**
   * Load a video file instead of using the camera.
   * Sets the video element's src to a blob URL.
   * @param file - The video file to load.
   * @param options.loop - Whether to loop the video (default: false).
   * @param options.onEnded - Callback fired when the video finishes playing.
   */
  const loadVideoFile = useCallback(
    (file: File, options?: { loop?: boolean; onEnded?: () => void }) => {
      setError(null);

      // Stop any existing camera stream
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }

      const video = videoRef.current;
      if (!video) {
        setError("Video element not available.");
        return;
      }

      // Clear camera srcObject so the file src takes effect
      video.srcObject = null;

      const url = URL.createObjectURL(file);
      video.src = url;
      video.loop = options?.loop ?? false;
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        video.play().catch(() => {});
        setIsActive(true);
      };

      video.onended = () => {
        options?.onEnded?.();
      };

      video.onerror = () => {
        setError("Failed to load video file.");
        URL.revokeObjectURL(url);
      };
    },
    [],
  );

  /**
   * Cleanup on unmount: stop the camera so the hardware is released.
   */
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };
  }, []);

  return { videoRef, canvasRef, isActive, error, facingMode, startCamera, stopCamera, flipCamera, captureFrame, loadVideoFile };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map common DOMException names to user-friendly messages.
 */
function cameraErrorMessage(err: DOMException): string {
  switch (err.name) {
    case "NotAllowedError":
      return "Camera permission was denied. Please allow camera access in your browser settings.";
    case "NotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "Camera is already in use by another application.";
    case "OverconstrainedError":
      return "Camera does not support the requested resolution. Try a different device.";
    case "AbortError":
      return "Camera access was aborted.";
    default:
      return `Camera error: ${err.message}`;
  }
}
