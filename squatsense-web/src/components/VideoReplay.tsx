"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplayFrame } from "@/lib/replayStore";
import { drawSkeleton } from "@/lib/drawSkeleton";

interface RepDetail {
  rep_number: number;
  composite_score: number;
  depth_score: number;
  stability_score: number;
  symmetry_score: number;
  tempo_score: number;
  rom_score: number;
}

interface VideoReplayProps {
  videoBlob: Blob;
  frameData: ReplayFrame[];
  /** Auto-play on mount (kiosk mode) */
  autoPlay?: boolean;
  /** Initial playback rate (default 1) */
  playbackRate?: number;
  /** Show playback controls (personal play) or hide (kiosk) */
  showControls?: boolean;
  /** Expected duration in seconds (fallback when blob has no metadata) */
  expectedDuration?: number;
  /** Per-rep scoring details for overlay pills */
  repDetails?: RepDetail[] | null;
}

export default function VideoReplay({
  videoBlob,
  frameData,
  autoPlay = false,
  playbackRate = 1,
  showControls = true,
  expectedDuration = 30,
  repDetails = null,
}: VideoReplayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const blobUrlRef = useRef<string>("");
  const lastRepCountRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(playbackRate);
  const [repPill, setRepPill] = useState<{ rep: number; score: number } | null>(null);

  // Create blob URL on mount, revoke on unmount
  useEffect(() => {
    blobUrlRef.current = URL.createObjectURL(videoBlob);
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [videoBlob]);

  // Find the closest frame for a given video timestamp (in seconds)
  const findClosestFrame = useCallback(
    (timeSec: number): ReplayFrame | null => {
      if (frameData.length === 0) return null;
      const timeMs = timeSec * 1000;
      let closest = frameData[0];
      let minDiff = Math.abs(frameData[0].timestamp - timeMs);
      for (let i = 1; i < frameData.length; i++) {
        const diff = Math.abs(frameData[i].timestamp - timeMs);
        if (diff < minDiff) {
          minDiff = diff;
          closest = frameData[i];
        } else {
          break; // timestamps are ordered, so we can stop early
        }
      }
      return closest;
    },
    [frameData],
  );

  // Animation loop: sync skeleton overlay with video playback
  const renderOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const frame = findClosestFrame(video.currentTime);
    if (frame) {
      drawSkeleton(ctx, frame.landmarks, frame.formScore, w, h);

      // Detect rep transitions for pill overlay
      if (repDetails && frame.repCount > lastRepCountRef.current) {
        const repNum = frame.repCount;
        const detail = repDetails.find((r) => r.rep_number === repNum);
        if (detail) {
          setRepPill({ rep: repNum, score: Math.round(detail.composite_score) });
          setTimeout(() => setRepPill(null), 1500);
        }
        lastRepCountRef.current = repNum;
      }
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    if (!video.paused && !video.ended) {
      animFrameRef.current = requestAnimationFrame(renderOverlay);
    }
  }, [findClosestFrame]);

  // Start/stop animation loop based on play state
  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(renderOverlay);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, renderOverlay]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration);
    } else {
      // MediaRecorder blobs often lack duration metadata — use fallback
      setDuration(expectedDuration);
    }

    video.playbackRate = speed;
    if (autoPlay) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    }
    // Render first frame skeleton
    const frame = findClosestFrame(0);
    const canvas = canvasRef.current;
    if (frame && canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        canvas.width = w;
        canvas.height = h;
        drawSkeleton(ctx, frame.landmarks, frame.formScore, w, h);
      }
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
    // Reset rep counter so pills re-trigger after seeking
    const seekFrame = findClosestFrame(time);
    lastRepCountRef.current = seekFrame?.repCount ?? 0;
    setRepPill(null);
    // Render skeleton at seeked position
    const frame = findClosestFrame(time);
    const canvas = canvasRef.current;
    if (frame && canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawSkeleton(ctx, frame.landmarks, frame.formScore, canvas.width, canvas.height);
      }
    }
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (videoRef.current) videoRef.current.playbackRate = newSpeed;
  };

  const handleEnded = () => {
    setIsPlaying(false);
    cancelAnimationFrame(animFrameRef.current);
  };

  const formatTime = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const s = Math.floor(sec);
    return `0:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-xl overflow-hidden border border-[#222222] bg-[#111111]">
      {/* Video + skeleton overlay container */}
      <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
        <video
          ref={videoRef}
          src={blobUrlRef.current}
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
          playsInline
          muted
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Rep score pill overlay */}
        {repPill && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-bold tracking-wider animate-pulse"
            style={{
              fontFamily: "'Space Mono', monospace",
              backgroundColor:
                repPill.score >= 80
                  ? "rgba(0, 255, 136, 0.9)"
                  : repPill.score >= 60
                    ? "rgba(255, 191, 0, 0.9)"
                    : "rgba(255, 51, 102, 0.9)",
              color: repPill.score >= 60 ? "#000" : "#fff",
            }}
          >
            REP {repPill.rep}: {repPill.score}
          </div>
        )}
      </div>

      {/* Playback controls (personal play only) */}
      {showControls && (
        <div className="px-4 py-3 flex flex-col gap-2">
          {/* Scrub bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center text-[#00ff88] hover:text-white transition-colors cursor-pointer"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="2" width="4" height="12" rx="1" />
                  <rect x="9" y="2" width="4" height="12" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
              )}
            </button>
            <span className="text-[#888888] text-xs font-mono w-8">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={isFinite(duration) && duration > 0 ? duration : 30}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 bg-[#333333] rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-[#00ff88]"
            />
            <span className="text-[#888888] text-xs font-mono w-8">
              {formatTime(duration)}
            </span>
          </div>

          {/* Speed controls */}
          <div className="flex items-center justify-center gap-2">
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={`px-3 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                  speed === s
                    ? "bg-[#00ff88] text-black font-bold"
                    : "bg-[#222222] text-[#888888] hover:text-white"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
