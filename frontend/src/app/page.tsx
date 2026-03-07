"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/* ------------------------------------------------------------------ */
/*  Waitlist form (reused in hero + bottom CTA)                       */
/* ------------------------------------------------------------------ */
function WaitlistForm({ id, glow }: { id: string; glow?: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setStatus("submitting");
    setErrorMsg("");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const resp = await fetch(`${apiUrl}/api/v1/waitlist/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        throw new Error(data?.detail || "Something went wrong");
      }

      setStatus("success");
      setEmail("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="glass-card rounded-xl border border-emerald-500/30 px-6 py-4 text-emerald-300">
        <p className="font-semibold">You&apos;re on the list!</p>
        <p className="mt-1 text-sm text-emerald-400/80">
          We&apos;ll notify you as soon as FreeForm Fitness is ready. Check your inbox for a confirmation.
        </p>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} id={id} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          placeholder="Enter your email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
          className="flex-1 rounded-xl border border-zinc-700/50 bg-zinc-900/80 px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none backdrop-blur-sm transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className={`rounded-xl bg-orange-600 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:opacity-60 disabled:cursor-not-allowed ${glow ? "animate-glow-pulse" : ""}`}
        >
          {status === "submitting" ? "Joining..." : "Join Waitlist"}
        </button>
      </form>
      {status === "error" && errorMsg && (
        <p className="mt-2 text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper components                                                 */
/* ------------------------------------------------------------------ */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-orange-400 backdrop-blur-sm">
      <span className="h-1 w-1 rounded-full bg-orange-400" />
      {children}
    </span>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="gradient-border glass-card group rounded-2xl p-4 text-left transition-all duration-300 hover:bg-zinc-800/40 active:scale-[0.98] sm:p-6 sm:hover:scale-[1.02]">
      <div className="mb-3 inline-flex rounded-lg bg-orange-500/10 p-2.5 text-orange-400 transition-colors group-hover:bg-orange-500/20">
        {icon}
      </div>
      <h3 className="font-semibold text-zinc-100">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group flex flex-col items-center text-center">
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-lg transition-all group-hover:bg-orange-500/30" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-orange-500/30 bg-zinc-900 text-lg font-bold text-orange-400">
          {step}
        </div>
      </div>
      <h3 className="font-semibold text-zinc-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  );
}

function PersonaCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="gradient-border glass-card rounded-xl p-4 text-center transition-all duration-300 hover:bg-zinc-800/40 active:scale-[0.98] sm:p-5">
      <div className="inline-flex rounded-lg bg-orange-500/10 p-2.5 text-orange-400">{children}</div>
      <h3 className="mt-3 text-sm font-semibold text-zinc-100">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{desc}</p>
    </div>
  );
}

function MovementCard({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="gradient-border glass-card rounded-xl px-3 py-4 text-center transition-all duration-300 hover:bg-zinc-800/40 active:scale-[0.98] sm:px-4 sm:py-5 sm:hover:scale-105">
      <div className="inline-flex text-orange-400">{children}</div>
      <p className="mt-2 text-sm font-medium text-zinc-300">{name}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
function InviteBanner() {
  const searchParams = useSearchParams();
  const denied = searchParams.get("invite") === "denied";
  if (!denied) return null;
  return (
    <div className="relative z-20 border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-300">
      Registration is currently invite-only. Join the waitlist below and we&apos;ll let you know when your spot opens up.
    </div>
  );
}

export default function WaitlistPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-50 bg-grid">

      {/* ── Invite-denied banner ────────────────────────────────── */}
      <Suspense>
        <InviteBanner />
      </Suspense>

      {/* ── Animated aurora background ───────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-aurora absolute -top-1/2 left-1/4 h-[300px] w-[300px] sm:h-[600px] sm:w-[600px] md:h-[800px] md:w-[800px] rounded-full bg-orange-600/8 blur-[80px] sm:blur-[120px] md:blur-[150px]" />
        <div className="animate-aurora-slow absolute -bottom-1/3 right-1/4 h-[200px] w-[200px] sm:h-[400px] sm:w-[400px] md:h-[600px] md:w-[600px] rounded-full bg-blue-600/6 blur-[60px] sm:blur-[100px] md:blur-[120px]" />
        <div className="animate-aurora absolute top-1/3 right-1/3 hidden sm:block h-[400px] w-[400px] rounded-full bg-fuchsia-600/4 blur-[100px]" />
      </div>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 pt-4 pb-16 text-center sm:px-6 sm:pt-8 sm:pb-28 md:pt-12">
        <img src="/logo.png" alt="FreeForm Fitness" className="animate-fade-in-up mb-0 h-36 w-auto sm:h-60" />

        <div className="animate-fade-in-up mb-4 sm:mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/5 px-3 py-1 text-xs sm:text-sm sm:px-4 sm:py-1.5 text-orange-300 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-400" />
          </span>
          Coming Soon
        </div>

        <h1 className="animate-fade-in-up delay-100 text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl md:text-7xl">
          Measure the Movement.
          <br />
          <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-cyan-400 bg-clip-text text-transparent">
            Master the Form.
          </span>
        </h1>

        <p className="animate-fade-in-up delay-200 mt-4 max-w-xl text-sm leading-relaxed text-zinc-400 sm:mt-6 sm:text-lg md:text-xl">
          FreeForm Fitness uses computer vision to analyse your lifts in real-time — tracking
          joint angles, range of motion, bar path, and fatigue across squats, deadlifts,
          bench press, overhead press, and more. No wearables. No hardware. Just your phone camera.
        </p>

        <div className="animate-fade-in-up delay-300 mt-6 w-full max-w-md sm:mt-10">
          <WaitlistForm id="hero-form" glow />
          <p className="mt-3 text-xs text-zinc-500">
            Join the waitlist for early access. No spam, ever.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Already invited?{" "}
            <a
              href="/login"
              className="font-medium text-orange-400 hover:text-orange-300 transition-colors"
            >
              Sign in
            </a>
          </p>
        </div>

        {/* Decorative floating elements — hidden on small screens */}
        <div className="pointer-events-none absolute -right-12 top-1/3 animate-float opacity-20 hidden sm:block">
          <svg viewBox="0 0 48 48" className="h-16 w-16 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="24" cy="24" r="20" />
            <circle cx="24" cy="24" r="8" />
            <line x1="24" y1="4" x2="24" y2="16" />
            <line x1="24" y1="32" x2="24" y2="44" />
            <line x1="4" y1="24" x2="16" y2="24" />
            <line x1="32" y1="24" x2="44" y2="24" />
          </svg>
        </div>
        <div className="pointer-events-none absolute -left-8 top-2/3 animate-float-delayed opacity-15 hidden sm:block">
          <svg viewBox="0 0 32 32" className="h-10 w-10 text-blue-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="4" width="24" height="24" rx="4" />
            <line x1="4" y1="16" x2="28" y2="16" />
            <line x1="16" y1="4" x2="16" y2="28" />
          </svg>
        </div>
      </section>

      {/* ── The Problem ──────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-zinc-800/40 py-14 sm:py-20 md:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <SectionLabel>The Problem</SectionLabel>
          <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">
            Training in the dark
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 leading-relaxed sm:mt-5 sm:text-base">
            Millions of lifters train with free weights daily, yet lack objective feedback on their movement.
            Load progression is guesswork. Form breakdown goes unnoticed until injury hits.
            Personal trainers are expensive. Fitness apps count reps but ignore <em className="text-zinc-300 not-italic">how</em> you move.
          </p>
          <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:mt-14 sm:gap-5 sm:grid-cols-3">
            {[
              { value: "80%", label: "of gym-goers have no form feedback" },
              { value: "$60–150", label: "per session for a personal trainer" },
              { value: "50%", label: "of injuries are from poor form" },
            ].map((stat) => (
              <div key={stat.value} className="gradient-border glass-card rounded-xl p-4 sm:p-6">
                <p className="text-2xl font-bold bg-gradient-to-br from-orange-400 to-blue-400 bg-clip-text text-transparent sm:text-3xl">{stat.value}</p>
                <p className="mt-2 text-sm text-zinc-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-zinc-800/40 py-14 sm:py-20 md:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <SectionLabel>How It Works</SectionLabel>
          <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">
            Three steps to smarter training
          </h2>
          <div className="mt-10 grid gap-8 sm:mt-16 sm:grid-cols-3 sm:gap-8">
            {/* Connector lines between steps (desktop only) */}
            <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 sm:block" style={{ top: "calc(50% - 20px)", width: "60%" }}>
              <div className="h-px w-full bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />
            </div>
            <StepCard
              step="1"
              title="Record"
              description="Prop up your phone and hit record. Our AI locks onto 33 body landmarks in real-time using on-device computer vision."
            />
            <StepCard
              step="2"
              title="Analyse"
              description="FreeForm Fitness measures joint angles, range of motion, bar path, movement tempo, and fatigue markers — frame by frame, rep by rep, across 8 core lifts."
            />
            <StepCard
              step="3"
              title="Improve"
              description="Get instant coaching cues, a per-rep form score, and actionable recommendations to fix your weaknesses."
            />
          </div>
        </div>
      </section>

      {/* ── Core Capabilities ────────────────────────────────────── */}
      <section className="relative z-10 border-t border-zinc-800/40 py-14 sm:py-20 md:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center">
            <SectionLabel>Capabilities</SectionLabel>
            <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">
              Everything a coach sees — automated
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 sm:mt-5 sm:text-base">
              Powered by MediaPipe pose estimation and custom biomechanics algorithms,
              FreeForm Fitness delivers analysis that used to require a sports lab.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:mt-14 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
                </svg>
              }
              title="Real-Time Pose Tracking"
              description="33-point skeleton overlay tracks your body through every phase of each lift. Supports squats, deadlifts, lunges, bench press, overhead press, rows, pull-ups, and push-ups."
            />
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              }
              title="Biomechanical Analysis"
              description="Measures hip, knee, ankle, shoulder, and elbow angles, depth percentage, bar path deviation, and tempo consistency for every exercise."
            />
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              }
              title="Per-Rep Form Scoring"
              description="Every rep gets a 0-100 form score based on range of motion, joint alignment, trunk angle, and symmetry. See exactly where each rep breaks down."
            />
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              }
              title="Fatigue Detection"
              description="Detects rep-to-rep degradation in form, bar speed, and range of motion. Warns you before fatigue compromises your movement."
            />
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              }
              title="AI Coach"
              description="Context-aware coaching cues delivered in real-time for each exercise — from 'Drive your knees out' on squats to 'Lock out at the top' on presses. Like a coach on demand."
            />
            <FeatureCard
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              }
              title="Progress Analytics"
              description="Track volume, form trends, strength progression, and session history over time. Visualise your improvement with detailed charts."
            />
          </div>
        </div>
      </section>

      {/* ── Supported Movements ────────────────────────────────── */}
      <section className="relative z-10 border-t border-zinc-800/40 py-14 sm:py-20 md:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <SectionLabel>8 Core Movements</SectionLabel>
          <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">
            Every lift, covered
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 sm:mt-5 sm:text-base">
            FreeForm Fitness launches with full support for the compound movements that matter most.
            Each exercise has its own biomechanical model and scoring criteria.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-2 sm:mt-12 sm:gap-3 sm:grid-cols-4">
            <MovementCard name="Squat">
              <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="24" cy="8" r="4" />
                <line x1="24" y1="12" x2="22" y2="24" />
                <line x1="22" y1="24" x2="16" y2="28" />
                <line x1="22" y1="24" x2="28" y2="28" />
                <line x1="16" y1="28" x2="14" y2="38" />
                <line x1="28" y1="28" x2="30" y2="38" />
                <line x1="12" y1="14" x2="36" y2="14" strokeWidth="2.5" />
              </svg>
            </MovementCard>
            <MovementCard name="Deadlift">
              <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="26" cy="8" r="4" />
                <line x1="26" y1="12" x2="20" y2="26" />
                <line x1="20" y1="26" x2="18" y2="20" />
                <line x1="20" y1="26" x2="24" y2="20" />
                <line x1="20" y1="26" x2="16" y2="30" />
                <line x1="20" y1="26" x2="26" y2="30" />
                <line x1="16" y1="30" x2="16" y2="40" />
                <line x1="26" y1="30" x2="28" y2="40" />
                <line x1="12" y1="38" x2="36" y2="38" strokeWidth="2.5" />
              </svg>
            </MovementCard>
            <MovementCard name="Bench Press">
              <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="34" x2="40" y2="34" strokeWidth="1.5" />
                <circle cx="14" cy="30" r="3" />
                <line x1="14" y1="30" x2="36" y2="30" />
                <line x1="20" y1="30" x2="20" y2="20" />
                <line x1="28" y1="30" x2="28" y2="20" />
                <line x1="10" y1="20" x2="38" y2="20" strokeWidth="2.5" />
                <line x1="36" y1="30" x2="38" y2="38" />
                <line x1="36" y1="30" x2="40" y2="38" />
              </svg>
            </MovementCard>
            <MovementCard name="Overhead Press">
              <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="24" cy="14" r="4" />
                <line x1="24" y1="18" x2="24" y2="32" />
                <line x1="24" y1="22" x2="18" y2="10" />
                <line x1="24" y1="22" x2="30" y2="10" />
                <line x1="12" y1="10" x2="36" y2="10" strokeWidth="2.5" />
                <line x1="24" y1="32" x2="18" y2="42" />
                <line x1="24" y1="32" x2="30" y2="42" />
              </svg>
            </MovementCard>
            <MovementCard name="Row">
              <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="28" cy="10" r="4" />
                <line x1="28" y1="14" x2="20" y2="26" />
                <line x1="20" y1="26" x2="22" y2="22" />
                <line x1="20" y1="26" x2="18" y2="22" />
                <line x1="20" y1="26" x2="16" y2="30" />
                <line x1="20" y1="26" x2="26" y2="30" />
                <line x1="16" y1="30" x2="14" y2="40" />
                <line x1="26" y1="30" x2="30" y2="40" />
                <line x1="14" y1="32" x2="30" y2="32" strokeWidth="2.5" />
              </svg>
            </MovementCard>
            <MovementCard name="Pull-Up">
              <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="10" y1="8" x2="38" y2="8" strokeWidth="2.5" />
                <line x1="18" y1="8" x2="20" y2="16" />
                <line x1="30" y1="8" x2="28" y2="16" />
                <circle cx="24" cy="20" r="4" />
                <line x1="24" y1="24" x2="24" y2="36" />
                <line x1="24" y1="36" x2="20" y2="44" />
                <line x1="24" y1="36" x2="28" y2="44" />
              </svg>
            </MovementCard>
            <MovementCard name="Lunge">
              <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="24" cy="8" r="4" />
                <line x1="24" y1="12" x2="24" y2="26" />
                <line x1="24" y1="18" x2="18" y2="24" />
                <line x1="24" y1="18" x2="30" y2="24" />
                <line x1="24" y1="26" x2="16" y2="30" />
                <line x1="16" y1="30" x2="14" y2="40" />
                <line x1="24" y1="26" x2="32" y2="34" />
                <line x1="32" y1="34" x2="34" y2="40" />
              </svg>
            </MovementCard>
            <MovementCard name="Push-Up">
              <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="20" r="3" />
                <line x1="13" y1="21" x2="30" y2="24" />
                <line x1="30" y1="24" x2="40" y2="28" />
                <line x1="16" y1="22" x2="14" y2="30" />
                <line x1="22" y1="23" x2="20" y2="30" />
                <line x1="40" y1="28" x2="40" y2="30" />
              </svg>
            </MovementCard>
          </div>
        </div>
      </section>

      {/* ── Differentiator ───────────────────────────────────────── */}
      <section className="relative z-10 border-t border-zinc-800/40 py-14 sm:py-20 md:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <SectionLabel>Why FreeForm Fitness</SectionLabel>
          <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">
            No wearables. No hardware. No expensive kit.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 leading-relaxed sm:mt-5 sm:text-base">
            Other solutions need force plates, depth cameras, or wearable sensors.
            FreeForm Fitness runs entirely on your phone&apos;s camera — the same device you already bring
            to the gym. That means zero setup cost, instant start, and nothing to charge.
          </p>

          <div className="mx-auto mt-8 grid max-w-3xl gap-px overflow-hidden rounded-2xl border border-zinc-800/60 sm:mt-14 sm:grid-cols-2">
            <div className="glass-card p-5 text-left sm:p-7">
              <p className="text-sm font-medium text-zinc-300">Traditional Coaching</p>
              <ul className="mt-4 space-y-3 text-sm text-zinc-500">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-red-400/80">&#x2717;</span>
                  $60–150 per session
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-red-400/80">&#x2717;</span>
                  Subjective, varies by coach
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-red-400/80">&#x2717;</span>
                  No quantitative tracking
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-red-400/80">&#x2717;</span>
                  Scheduling constraints
                </li>
              </ul>
            </div>
            <div className="glass-card p-5 text-left border-t sm:border-t-0 sm:border-l border-zinc-800/60 sm:p-7">
              <p className="text-sm font-medium text-orange-400">FreeForm Fitness</p>
              <ul className="mt-4 space-y-3 text-sm text-zinc-400">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-emerald-400">&#x2713;</span>
                  Free to start, fraction of the cost
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-emerald-400">&#x2713;</span>
                  Objective, data-driven analysis
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-emerald-400">&#x2713;</span>
                  Per-rep metrics tracked over time
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-emerald-400">&#x2713;</span>
                  Available 24/7, anywhere
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who It's For ─────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-zinc-800/40 py-14 sm:py-20 md:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <SectionLabel>Who It&apos;s For</SectionLabel>
          <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">
            Built for lifters who take training seriously
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-5 lg:grid-cols-4">
            <PersonaCard
              title="Strength Athletes"
              desc="Powerlifters, weightlifters, and strongman competitors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h2m14 0h2M6 8v8m12-8v8M8 7v10m8-10v10M10 12h4" />
              </svg>
            </PersonaCard>
            <PersonaCard
              title="CrossFit & Functional"
              desc="High-rep, high-intensity athletes who need consistent form"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
            </PersonaCard>
            <PersonaCard
              title="Beginner Lifters"
              desc="New to barbell training and want to build correct movement patterns"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15v-3.75m0 0h-.008v.008H6.75v-.008z" />
              </svg>
            </PersonaCard>
            <PersonaCard
              title="Coaches & Trainers"
              desc="Monitor multiple athletes with objective, repeatable data"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </PersonaCard>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-zinc-800/40 py-14 sm:py-20 md:py-24">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-orange-600/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl">
            Ready to train smarter?
          </h2>
          <p className="mt-3 text-sm text-zinc-400 sm:mt-4 sm:text-base">
            Be first in line when FreeForm Fitness launches. Early members get free access.
          </p>
          <div className="mt-6 sm:mt-8">
            <WaitlistForm id="bottom-form" />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-zinc-800/40 py-6 text-center text-xs text-zinc-600 sm:py-8 sm:text-sm">
        &copy; {new Date().getFullYear()} FreeForm Fitness. All rights reserved.
      </footer>
    </div>
  );
}
