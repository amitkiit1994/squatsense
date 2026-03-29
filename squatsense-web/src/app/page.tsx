"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isLoggedIn } from "@/lib/auth";

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
  useEffect(() => { if (isLoggedIn()) setPlayHref("/play"); }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-6xl sm:text-8xl font-black leading-none tracking-tighter mb-2">
            <span className="text-white">MOVE MORE</span>
            <span className="text-[#00ff88]">.</span>
          </h1>
          <h1 className="text-6xl sm:text-8xl font-black leading-none tracking-tighter mb-8">
            <span className="text-white">MOVE BETTER</span>
            <span className="text-[#00ff88]">.</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#888888] max-w-xl mx-auto mb-12">
            The 30-second squat game. Play at work. Play at home. Compete everywhere.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={playHref}
              className="pulse-neon bg-[#00ff88] text-black font-bold text-base sm:text-lg px-8 sm:px-10 py-3 sm:py-4 rounded-xl hover:bg-[#00e07a] transition-colors"
            >
              START SQUATTING
            </Link>
            <Link
              href="/setup"
              className="border-2 border-[#06b6d4] text-[#06b6d4] font-bold text-base sm:text-lg px-8 sm:px-10 py-3 sm:py-4 rounded-xl hover:bg-[#06b6d4]/10 transition-colors"
            >
              SET UP YOUR OFFICE
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
    </div>
  );
}
