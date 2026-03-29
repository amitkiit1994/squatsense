"use client";

import { useCallback, useRef, useState } from "react";

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isActive: boolean;
  isMockVideo: boolean;
  error: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  resumeCamera: () => void;
  captureFrame: () => Promise<Blob | null>;
  loadVideoFile: (file: File) => Promise<void>;
  playVideo: () => Promise<void>;
  pauseVideo: () => void;
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const mockFileRef = useRef<File | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isMockVideo, setIsMockVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    if (isMockVideo) return; // Skip camera if mock video is loaded

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Camera access denied";
      setError(msg);
      setIsActive(false);
    }
  }, [isMockVideo]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = "";
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    mockFileRef.current = null;
    setIsMockVideo(false);
    setIsActive(false);
  }, []);

  // Re-apply the camera stream after React remounts the <video> element
  // (phase transitions destroy the old element and create a new one).
  const resumeCamera = useCallback(() => {
    const video = videoRef.current;
    if (!video || isMockVideo || !streamRef.current) return;

    if (!video.srcObject) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, [isMockVideo]);

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isActive) return null;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
    });
  }, [isActive]);

  const loadVideoFile = useCallback(async (file: File) => {
    // Stop any existing camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Revoke any prior object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    mockFileRef.current = file;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.loop = true;
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;

      // Wait for metadata to load so dimensions are available
      await new Promise<void>((resolve) => {
        videoRef.current!.onloadedmetadata = () => resolve();
      });

      // Pause — playVideo() will be called when the blitz starts
      videoRef.current.pause();
    }

    setIsMockVideo(true);
    setIsActive(true);
    setError(null);
  }, []);

  const playVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isMockVideo || !objectUrlRef.current) return;

    // React remounts <video> elements across phase transitions, losing the src.
    // Re-apply the stored Object URL if the element has no data.
    if (video.readyState === 0) {
      video.srcObject = null;
      video.src = objectUrlRef.current;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
    }

    video.play().catch(() => {});
  }, [isMockVideo]);

  const pauseVideo = useCallback(() => {
    if (videoRef.current && isMockVideo) {
      videoRef.current.pause();
    }
  }, [isMockVideo]);

  const startRecording = useCallback(() => {
    if (isMockVideo || !streamRef.current) return;
    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.start(1000); // 1-second chunks
      mediaRecorderRef.current = recorder;
    } catch {
      // MediaRecorder not supported — recording silently skipped
      mediaRecorderRef.current = null;
    }
  }, [isMockVideo]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    // For mock videos, return the original uploaded file as the replay blob
    if (isMockVideo && mockFileRef.current) {
      return Promise.resolve(mockFileRef.current as Blob);
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        const blob = new Blob(chunks, { type: chunks[0].type });
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return {
    videoRef, canvasRef, isActive, isMockVideo, error,
    startCamera, stopCamera, resumeCamera, captureFrame,
    loadVideoFile, playVideo, pauseVideo, startRecording, stopRecording,
  };
}
