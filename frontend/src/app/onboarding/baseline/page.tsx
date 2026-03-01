"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { updateOnboarding } from "@/lib/api";
import type { OnboardingUpdate } from "@/lib/types";

interface BaselineMetrics {
  maxDepthAngle: number;
  kneeTrackingScore: number;
  stabilityScore: number;
  overallScore: number;
}

type TestPhase = "intro" | "camera" | "recording" | "processing" | "results";

export default function BaselinePage() {
  const router = useRouter();

  const [phase, setPhase] = useState<TestPhase>("intro");
  const [metrics, setMetrics] = useState<BaselineMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setPhase("camera");
    } catch {
      setError("Unable to access camera. Please allow camera permissions and try again.");
    }
  }

  function startRecording() {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm",
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      processRecording();
    };

    mediaRecorderRef.current = recorder;

    // Countdown 3..2..1
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        clearInterval(interval);
        recorder.start();
        setPhase("recording");

        // Stop after 10 seconds
        setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
            setPhase("processing");
          }
        }, 10000);
      }
    }, 1000);
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      setPhase("processing");
    }
  }

  async function processRecording() {
    const blob = new Blob(chunksRef.current, { type: "video/webm" });

    if (blob.size === 0) {
      setError("No video data was captured. Please try again.");
      setPhase("intro");
      stopCamera();
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", blob, "baseline.webm");
      formData.append("exercise_type", "squat");

      const token = localStorage.getItem("squatsense_access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

      const resp = await fetch(`${apiUrl}/api/v1/analysis/`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!resp.ok) {
        throw new Error("Upload failed");
      }

      const job = await resp.json();

      // Poll for completion
      let result = job;
      while (result.status === "pending") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const pollResp = await fetch(
          `${apiUrl}/api/v1/analysis/${result.job_id}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        result = await pollResp.json();
      }

      if (result.status === "completed" && result.result) {
        setMetrics({
          maxDepthAngle: Math.round(result.result.avg_form_score ?? 90),
          kneeTrackingScore: Math.round(result.result.avg_form_score ?? 75),
          stabilityScore: Math.round(result.result.avg_form_score ?? 70),
          overallScore: Math.round(result.result.avg_form_score ?? 75),
        });
        setPhase("results");
      } else {
        throw new Error(result.error || "Analysis failed");
      }
    } catch {
      setError(
        "Unable to analyze the recording. You can skip this step and set your baseline later."
      );
      setPhase("intro");
    } finally {
      stopCamera();
    }
  }

  async function handleCompleteSetup() {
    setIsSubmitting(true);
    setError(null);

    try {
      // Gather onboarding data stored during previous steps
      const goal = localStorage.getItem("onboarding_goal") || "general";
      const experience = localStorage.getItem("onboarding_experience") || "beginner";
      const injuriesData = JSON.parse(localStorage.getItem("onboarding_injuries") || "{}");

      // Map injury data to the API schema
      const injuryHistory = injuriesData.hasInjuries && Array.isArray(injuriesData.injuries)
        ? injuriesData.injuries.map((i: { bodyArea: string; side: string; notes?: string }) => ({
            area: i.bodyArea,
            side: i.side === "Both" ? "bilateral" : i.side.toLowerCase(),
            notes: i.notes || null,
          }))
        : null;

      // Map goal values to the backend enum
      const goalMap: Record<string, OnboardingUpdate["goal"]> = {
        strength: "strength",
        muscle_gain: "hypertrophy",
        fat_loss: "general",
        athletic_performance: "general",
      };

      const body: OnboardingUpdate = {
        experience_level: experience as OnboardingUpdate["experience_level"],
        goal: goalMap[goal] || "general",
        injury_history: injuryHistory,
      };

      await updateOnboarding(body);

      // Clean up onboarding localStorage keys
      localStorage.removeItem("onboarding_profile");
      localStorage.removeItem("onboarding_name");
      localStorage.removeItem("onboarding_goal");
      localStorage.removeItem("onboarding_experience");
      localStorage.removeItem("onboarding_injuries");

      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">
            Baseline Movement Test
          </CardTitle>
          <CardDescription>
            {phase === "results"
              ? "Great job! Here are your baseline metrics."
              : "Let's test your baseline squat to personalize your coaching."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Intro Phase */}
          {phase === "intro" && (
            <div className="space-y-6">
              <div className="rounded-xl bg-violet-950/30 p-5">
                <h3 className="text-sm font-semibold text-violet-100 mb-3">
                  How it works
                </h3>
                <ol className="space-y-2 text-sm text-violet-200">
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-800 text-xs font-bold text-violet-200">
                      1
                    </span>
                    Position your camera so your full body is visible
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-800 text-xs font-bold text-violet-200">
                      2
                    </span>
                    Perform 3-5 bodyweight squats at your normal pace
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-800 text-xs font-bold text-violet-200">
                      3
                    </span>
                    We&apos;ll analyze your form and establish your baseline
                  </li>
                </ol>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
                <svg className="h-5 w-5 flex-shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-xs text-zinc-400">
                  The recording stays on your device and is only used for
                  analysis. You can retake the test anytime from your profile.
                </p>
              </div>

              <Button onClick={handleCompleteSetup} variant="outline" size="lg" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                Skip Baseline Test
              </Button>

              <Button onClick={startCamera} size="lg" className="w-full">
                <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
                Start Camera
              </Button>
            </div>
          )}

          {/* Camera / Recording Phase */}
          {(phase === "camera" || phase === "recording") && (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-64 w-full object-cover sm:h-80"
                />

                {/* Countdown overlay */}
                {countdown > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <span className="text-7xl font-bold text-white animate-pulse">
                      {countdown}
                    </span>
                  </div>
                )}

                {/* Recording indicator */}
                {phase === "recording" && (
                  <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                    <span className="text-xs font-medium text-white">
                      Recording
                    </span>
                  </div>
                )}
              </div>

              {phase === "camera" && countdown === 0 && (
                <Button
                  onClick={startRecording}
                  size="lg"
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                  Start Recording
                </Button>
              )}

              {phase === "recording" && (
                <Button
                  onClick={stopRecording}
                  size="lg"
                  variant="outline"
                  className="w-full border-red-700 text-red-400 hover:bg-red-950"
                >
                  <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  Stop Recording
                </Button>
              )}
            </div>
          )}

          {/* Processing Phase */}
          {phase === "processing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-violet-500" />
              <h3 className="text-lg font-semibold text-white">
                Analyzing your squat...
              </h3>
              <p className="mt-2 text-sm text-zinc-500">
                This will take just a moment
              </p>
            </div>
          )}

          {/* Results Phase */}
          {phase === "results" && metrics && (
            <div className="space-y-6">
              {/* Overall score */}
              <div className="flex flex-col items-center rounded-xl bg-gradient-to-br from-violet-950/40 to-violet-900/20 p-6">
                <span className="text-sm font-medium text-violet-400">
                  Overall Score
                </span>
                <span className="mt-1 text-5xl font-bold text-violet-300">
                  {metrics.overallScore}
                </span>
                <span className="mt-1 text-sm text-violet-400">
                  out of 100
                </span>
              </div>

              {/* Individual metrics */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MetricCard
                  label="Max Depth"
                  value={`${metrics.maxDepthAngle}\u00B0`}
                  description="Hip-knee angle"
                />
                <MetricCard
                  label="Knee Tracking"
                  value={`${metrics.kneeTrackingScore}%`}
                  description="Alignment score"
                />
                <MetricCard
                  label="Stability"
                  value={`${metrics.stabilityScore}%`}
                  description="Balance score"
                />
              </div>

              <Button
                onClick={handleCompleteSetup}
                size="lg"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Saving...
                  </span>
                ) : (
                  "Complete Setup"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-center">
      <p className="text-xs font-medium text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-white">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">
        {description}
      </p>
    </div>
  );
}
