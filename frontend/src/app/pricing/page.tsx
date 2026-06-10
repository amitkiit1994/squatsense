"use client";

import Link from "next/link";
import KinelyBar from "@/components/KinelyBar";

/* ------------------------------------------------------------------ */
/*  Plan data                                                         */
/* ------------------------------------------------------------------ */

const FREE_FEATURES = [
  "2 sessions per week",
  "3 exercises (squat, deadlift, bench)",
  "Basic form scoring",
  "Per-rep feedback",
  "Session history",
];

const PRO_FEATURES = [
  "Unlimited sessions",
  "All 8 exercises",
  "AI coaching cues",
  "Fatigue modeling",
  "Adaptive programming",
  "Progress analytics",
  "Priority support",
];

const GYM_FEATURES = [
  "Camera-based coaching for members",
  "Multi-location support",
  "Custom branding",
  "Member analytics dashboard",
  "Dedicated onboarding",
  "Volume licensing",
];

/* ------------------------------------------------------------------ */
/*  Helper components                                                 */
/* ------------------------------------------------------------------ */

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 shrink-0 text-emerald-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-orange-400 backdrop-blur-sm">
      <span className="h-1 w-1 rounded-full bg-orange-400" />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-50 bg-grid">
      {/* Aurora background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-aurora absolute -top-1/2 left-1/4 h-[300px] w-[300px] sm:h-[600px] sm:w-[600px] rounded-full bg-orange-600/8 blur-[80px] sm:blur-[120px]" />
        <div className="animate-aurora-slow absolute -bottom-1/3 right-1/4 h-[200px] w-[200px] sm:h-[400px] sm:w-[400px] rounded-full bg-blue-600/6 blur-[60px] sm:blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="FreeForm Fitness" className="h-10 w-auto" />
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="font-medium text-orange-400">
            Pricing
          </Link>
          <Link href="/for-gyms" className="text-zinc-400 hover:text-zinc-200 transition-colors">
            For Gyms
          </Link>
          <Link
            href="/login"
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Header */}
      <section className="relative z-10 mx-auto max-w-3xl px-4 pt-8 pb-4 text-center sm:px-6 sm:pt-14 sm:pb-8">
        <SectionLabel>Pricing</SectionLabel>
        <h1 className="animate-fade-in-up text-3xl font-extrabold tracking-tight sm:text-5xl">
          Train smarter.{" "}
          <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-cyan-400 bg-clip-text text-transparent">
            Pay less.
          </span>
        </h1>
        <p className="animate-fade-in-up delay-100 mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          All features are free during the beta. The plans below show our
          planned pricing for general availability.
        </p>
        <p className="animate-fade-in-up delay-200 mx-auto mt-3 max-w-xl text-xs leading-relaxed text-zinc-500">
          FreeForm Fitness is currently in beta. Billing is not live yet --
          planned prices are introductory and may change at general
          availability.
        </p>
      </section>

      {/* Pricing cards */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-14">
        <div className="grid gap-5 sm:grid-cols-3">
          {/* ── Free ────────────────────────────────────────────── */}
          <div className="glass-card gradient-border flex flex-col rounded-2xl p-6 sm:p-8">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Free
            </p>
            <p className="mt-3 text-3xl font-bold text-zinc-100">
              &#8377;0
              <span className="text-sm font-normal text-zinc-500">/mo</span>
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Get started with real-time form analysis on 3 core lifts.
            </p>

            <ul className="mt-6 flex-1 space-y-3">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="mt-8 block rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-3 text-center text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700"
            >
              Start Free
            </Link>
          </div>

          {/* ── Pro ─────────────────────────────────────────────── */}
          <div className="relative glass-card flex flex-col rounded-2xl border border-orange-500/40 p-6 sm:p-8">
            {/* Badge */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-600 px-3 py-0.5 text-xs font-semibold text-white">
              Recommended
            </span>
            <p className="text-xs font-medium uppercase tracking-widest text-orange-400">
              Pro
            </p>
            <p className="mt-3 text-3xl font-bold text-zinc-100">
              &#8377;499
              <span className="text-sm font-normal text-zinc-500">/mo</span>
            </p>
            <p className="mt-1 text-xs text-orange-400/80">
              Planned price -- free during beta
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Unlock every exercise, AI coaching, fatigue modeling, and adaptive
              programming.
            </p>

            <ul className="mt-6 flex-1 space-y-3">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="mt-8 block rounded-xl bg-orange-600 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-orange-500 animate-glow-pulse"
            >
              Join Beta
            </Link>
            <p className="mt-2 text-center text-xs text-zinc-500">
              Pro features are free during the beta.
            </p>
          </div>

          {/* ── For Gyms ────────────────────────────────────────── */}
          <div className="glass-card gradient-border flex flex-col rounded-2xl p-6 sm:p-8">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              For Gyms
            </p>
            <p className="mt-3 text-3xl font-bold text-zinc-100">Custom</p>
            <p className="mt-2 text-sm text-zinc-400">
              Camera-based coaching for your members. Volume licensing for
              multi-location chains.
            </p>

            <ul className="mt-6 flex-1 space-y-3">
              {GYM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/for-gyms"
              className="mt-8 block rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-3 text-center text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 border-t border-zinc-800/40 py-14 sm:py-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "What does beta mean for pricing?",
                a: "FreeForm Fitness is in beta. During the beta, accounts are free, every feature is available to everyone, and no credit card is required. Billing has not launched yet -- the plans listed here are planned pricing and may change at general availability.",
              },
              {
                q: "Do I need any special hardware?",
                a: "No. FreeForm Fitness works with your phone camera -- no wearables, depth sensors, or force plates required.",
              },
              {
                q: "Can I cancel anytime?",
                a: "Yes. When billing launches, Pro will be month-to-month with no contract -- cancel anytime from your account settings. During the beta there is nothing to cancel because nothing is charged.",
              },
              {
                q: "Which exercises are included in the free tier?",
                a: "The planned free tier covers squat, deadlift, and bench press, with Pro adding overhead press, row, pull-up, lunge, and push-up. During the beta, all 8 exercises are available to every account.",
              },
              {
                q: "How does gym licensing work?",
                a: "We are onboarding founding gym partners. A FreeForm install puts camera stations in your gym that coach members on screen in real time. Contact us to discuss a pilot based on your number of locations and cameras.",
              },
            ].map((item) => (
              <div
                key={item.q}
                className="glass-card rounded-xl border border-zinc-800/50 px-5 py-4"
              >
                <h3 className="font-medium text-zinc-200">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <KinelyBar current="freeform" />

      <footer className="relative z-10 border-t border-zinc-800/40 py-6 text-center text-xs text-zinc-600 sm:py-8 sm:text-sm">
        &copy; {new Date().getFullYear()} FreeForm Fitness. All rights reserved.
      </footer>
    </div>
  );
}
