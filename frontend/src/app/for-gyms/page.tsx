"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import KinelyBar from "@/components/KinelyBar";
import { apiFetch, ApiResponseError } from "@/lib/api";

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

/* ------------------------------------------------------------------ */
/*  Inquiry form                                                      */
/* ------------------------------------------------------------------ */

interface FormData {
  gym_name: string;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
  num_locations: string;
  message: string;
}

const INITIAL_FORM: FormData = {
  gym_name: "",
  contact_name: "",
  email: "",
  phone: "",
  city: "",
  num_locations: "",
  message: "",
};

function GymInquiryForm() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function update(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (status === "error") setStatus("idle");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    try {
      // Backend contract: {gym_name, contact_name, email, phone?, city?, message?} -> {ok: true}
      const messageParts: string[] = [];
      if (form.num_locations) messageParts.push(`Locations: ${form.num_locations}`);
      if (form.message) messageParts.push(form.message);

      const resp = await apiFetch<{ ok: boolean }>("/gym-inquiry", {
        method: "POST",
        body: JSON.stringify({
          gym_name: form.gym_name,
          contact_name: form.contact_name,
          email: form.email,
          phone: form.phone || undefined,
          city: form.city || undefined,
          message: messageParts.length > 0 ? messageParts.join("\n") : undefined,
        }),
      });

      if (!resp?.ok) {
        throw new Error("Something went wrong. Please try again.");
      }

      setStatus("success");
      setForm(INITIAL_FORM);
    } catch (err) {
      const detail =
        err instanceof ApiResponseError && typeof err.detail === "string"
          ? err.detail
          : err instanceof Error && err.message
            ? err.message
            : "Something went wrong. Please try again.";
      setErrorMsg(detail);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="glass-card rounded-xl border border-emerald-500/30 px-6 py-8 text-center text-emerald-300">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="mx-auto mb-3 h-10 w-10 text-emerald-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-lg font-semibold">Inquiry received</p>
        <p className="mt-2 text-sm text-emerald-400/80">
          Our team will reach out within 24 hours to discuss how FreeForm Fitness
          can work for your gym.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-700/50 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none backdrop-blur-sm transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="gym_name" className="mb-1.5 block text-sm text-zinc-300">
            Gym / Chain Name *
          </label>
          <input
            id="gym_name"
            type="text"
            required
            placeholder="e.g. Iron Paradise"
            value={form.gym_name}
            onChange={(e) => update("gym_name", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="contact_name" className="mb-1.5 block text-sm text-zinc-300">
            Contact Name *
          </label>
          <input
            id="contact_name"
            type="text"
            required
            placeholder="Your name"
            value={form.contact_name}
            onChange={(e) => update("contact_name", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm text-zinc-300">
            Email *
          </label>
          <input
            id="email"
            type="email"
            required
            placeholder="you@gym.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm text-zinc-300">
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            placeholder="+91 98765 43210"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className="mb-1.5 block text-sm text-zinc-300">
            City *
          </label>
          <input
            id="city"
            type="text"
            required
            placeholder="e.g. Mumbai"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="num_locations" className="mb-1.5 block text-sm text-zinc-300">
            Number of Locations
          </label>
          <input
            id="num_locations"
            type="number"
            min="1"
            placeholder="e.g. 3"
            value={form.num_locations}
            onChange={(e) => update("num_locations", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm text-zinc-300">
          Message
        </label>
        <textarea
          id="message"
          rows={3}
          placeholder="Tell us about your gym and what you are looking for..."
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          className={`${inputClass} resize-none`}
        />
      </div>

      {status === "error" && errorMsg && (
        <p className="text-xs text-red-400">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-xl bg-orange-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "submitting" ? "Sending..." : "Send Inquiry"}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function ForGymsPage() {
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
          <Link href="/pricing" className="text-zinc-400 hover:text-zinc-200 transition-colors">
            Pricing
          </Link>
          <Link href="/for-gyms" className="font-medium text-orange-400">
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

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-3xl px-4 pt-8 pb-4 text-center sm:px-6 sm:pt-14 sm:pb-8">
        <SectionLabel>For Gyms</SectionLabel>
        <h1 className="animate-fade-in-up text-3xl font-extrabold tracking-tight sm:text-5xl">
          FreeForm Fitness{" "}
          <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-cyan-400 bg-clip-text text-transparent">
            for your gym
          </span>
        </h1>
        <p className="animate-fade-in-up delay-100 mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Give every member access to real-time AI coaching. Camera-based
          movement analysis on the gym floor -- no wearables, no extra hardware
          for members, just better training outcomes.
        </p>
      </section>

      {/* Benefits + Form */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Benefits */}
          <div>
            <h2 className="text-xl font-bold text-zinc-100 sm:text-2xl">
              Why gyms choose FreeForm Fitness
            </h2>
            <div className="mt-6 space-y-5">
              {[
                {
                  title: "Reduce injury liability",
                  desc: "Real-time form correction catches dangerous movement patterns before they cause injury.",
                },
                {
                  title: "Differentiate your gym",
                  desc: "Offer AI-powered coaching that no other gym in your area provides. Members stay longer when they see measurable progress.",
                },
                {
                  title: "Scale coaching without headcount",
                  desc: "One camera station coaches dozens of members per hour. Supplement your trainers, not replace them.",
                },
                {
                  title: "Data-driven member engagement",
                  desc: "Track form improvement, session volume, and training consistency across your member base.",
                },
                {
                  title: "Simple installation",
                  desc: "One camera per station, wall or tripod mounted. We handle setup, calibration, and software updates.",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <div className="mt-1 shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-orange-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-200">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-400">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="glass-card gradient-border rounded-2xl p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-zinc-100">
              Get in touch
            </h3>
            <p className="mt-1 mb-6 text-sm text-zinc-400">
              Tell us about your gym and we will put together a custom proposal.
            </p>
            <GymInquiryForm />
          </div>
        </div>
      </section>

      {/* Stats / social proof */}
      <section className="relative z-10 border-t border-zinc-800/40 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Built for the gym floor
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
            FreeForm Fitness is designed from the ground up for high-traffic gym
            environments. Works with any standard camera, handles multiple users
            per station, and runs reliably all day.
          </p>
          <div className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-3 sm:gap-5">
            {[
              { value: "8", label: "exercises supported" },
              { value: "33", label: "body landmarks tracked per frame" },
              { value: "<200ms", label: "analysis latency" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card gradient-border rounded-xl p-5">
                <p className="text-2xl font-bold bg-gradient-to-br from-orange-400 to-blue-400 bg-clip-text text-transparent sm:text-3xl">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-zinc-400">{stat.label}</p>
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
