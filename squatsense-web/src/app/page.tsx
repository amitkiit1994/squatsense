"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { isLoggedIn } from "@/lib/auth";
import KinelyBar from "@/components/KinelyBar";

const steps = [
  {
    number: "01",
    title: "SQUAT",
    description: "Stand in front of your camera. Do squats for 30 seconds.",
  },
  {
    number: "02",
    title: "SCORE",
    description: "AI scores your form. Quality \u00d7 Reps = Movement Points.",
  },
  {
    number: "03",
    title: "COMPETE",
    description: "Climb the leaderboard. Build streaks. Earn ranks.",
  },
];

export default function LandingPage() {
  const [playHref, setPlayHref] = useState("/join");
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { if (isLoggedIn()) setPlayHref("/play"); }, []);

  // Force-mute before autoplay: React doesn't always reflect the `muted`
  // attribute into SSR markup, which can make browsers block autoplay.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => { /* poster stays visible if autoplay is blocked */ });
  }, []);

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !muted;
    v.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) v.play().catch(() => {});
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Hero Section — video first fold */}
      <section className="flex flex-col items-center px-4 sm:px-6 pt-8 sm:pt-12 pb-14">
        <div className="w-full max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-6xl font-black leading-none tracking-tighter mb-3">
            <span className="text-white">MOVE MORE</span>
            <span className="text-[#00ff88]">.</span>{" "}
            <br className="sm:hidden" />
            <span className="text-white">MOVE BETTER</span>
            <span className="text-[#00ff88]">.</span>
          </h1>

          <p className="text-sm sm:text-lg text-[#888888] max-w-xl mx-auto mb-5 sm:mb-7">
            The 30-second squat game. AI judges every rep.
          </p>

          {/* Hero video */}
          <div className="relative w-full max-w-3xl mx-auto mb-6 sm:mb-8">
            <div className="neon-border rounded-2xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                className="block w-full aspect-video object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                poster="/hero-squatsense-poster.jpg"
                aria-label="SquatSense gameplay preview: a 30-second squat blitz scored by AI"
              >
                <source src="/hero-squatsense.mp4" type="video/mp4" />
              </video>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={muted ? "Turn sound on" : "Mute sound"}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-[#00ff88]/40 px-3 py-1.5 text-xs font-bold tracking-wider text-[#00ff88] hover:bg-black/90 hover:border-[#00ff88]/70 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5z" />
                {muted ? (
                  <path d="M16 9.5 21 14.5M21 9.5 16 14.5" />
                ) : (
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" />
                )}
              </svg>
              {muted ? "SOUND ON" : "MUTE"}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link
              href={playHref}
              className="pulse-neon w-full sm:w-auto text-center bg-[#00ff88] text-black font-black text-lg sm:text-xl px-10 sm:px-14 py-4 rounded-xl hover:bg-[#00e07a] transition-colors"
            >
              PLAY NOW
            </Link>
            <Link
              href="/for-offices"
              className="w-full sm:w-auto text-center border-2 border-[#06b6d4] text-[#06b6d4] font-bold text-sm sm:text-base px-6 sm:px-8 py-3 rounded-xl hover:bg-[#06b6d4]/10 transition-colors"
            >
              FOR OFFICES
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-sm font-bold tracking-[0.3em] text-[#888888] uppercase mb-16">
            How It Works
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {steps.map((step) => (
              <div
                key={step.number}
                className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8 text-center hover:border-[#00ff88]/30 transition-colors"
              >
                <div className="text-5xl font-black text-[#00ff88] mb-4 font-[family-name:var(--font-mono,'Space_Mono',monospace)]">
                  {step.number}
                </div>
                <h3 className="text-2xl font-black text-white tracking-wide mb-3">
                  {step.title}
                </h3>
                <p className="text-[#888888] leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-20 text-center">
        <p className="text-2xl sm:text-3xl font-bold text-white mb-8">
          Ready to move<span className="text-[#00ff88]">?</span>
        </p>
        <Link
          href="/join"
          className="pulse-neon inline-block bg-[#00ff88] text-black font-bold text-lg px-10 py-4 rounded-xl hover:bg-[#00e07a] transition-colors"
        >
          START SQUATTING
        </Link>
      </section>

      <KinelyBar current="squatsense" />
    </div>
  );
}
