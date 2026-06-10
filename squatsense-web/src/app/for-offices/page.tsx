"use client";

import { useState } from "react";
import Link from "next/link";
import KinelyBar from "@/components/KinelyBar";

const howItWorks = [
  {
    number: "01",
    title: "PUT UP A SCREEN",
    description:
      "Any TV or monitor with a browser and webcam. Chrome, fullscreen, done. No app installs, no hardware purchases.",
  },
  {
    number: "02",
    title: "EMPLOYEES SCAN & PLAY",
    description:
      "QR code on the screen. Phone scan, pick a nickname, squat for 30 seconds. The AI scores form and counts reps in real time.",
  },
  {
    number: "03",
    title: "LEADERBOARD COMPETITION",
    description:
      "The TV shows a live leaderboard. Departments compete. Streaks build. Movement culture grows on its own.",
  },
];

const benefits = [
  {
    title: "Zero hardware cost",
    description: "A TV with a browser and a webcam. That is it. No wearables, no sensors, no app downloads.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "30 seconds, not 30 minutes",
    description: "A micro-break that fits between meetings. No changing clothes, no shower, no commute to a gym.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Builds team culture",
    description: "Shared leaderboards, department rivalries, daily streaks. Movement becomes something people talk about.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    title: "Tracks participation",
    description: "See who is playing, how often, and how the office stacks up. Real data for your wellness program.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

const pricing = [
  {
    name: "STARTER",
    price: "Free",
    description: "One kiosk, unlimited players",
    features: [
      "Single office location",
      "Unlimited employees",
      "Live leaderboard display",
      "QR code join flow",
      "Real-time AI form scoring",
    ],
    cta: "Set Up Now",
    href: "/setup",
    accent: "#00ff88",
    highlighted: false,
  },
  {
    name: "ENTERPRISE",
    price: "Contact us",
    description: "Multi-location, custom branding",
    features: [
      "Multiple office locations",
      "Cross-office leaderboards",
      "Company branding on kiosk",
      "Admin dashboard",
      "Participation analytics",
      "Dedicated support",
    ],
    cta: "Get in Touch",
    href: "#contact",
    accent: "#06b6d4",
    highlighted: true,
  },
];

interface FormData {
  companyName: string;
  contactName: string;
  email: string;
  numberOfOffices: string;
  estimatedEmployees: string;
  message: string;
}

function ContactForm() {
  const [form, setForm] = useState<FormData>({
    companyName: "",
    contactName: "",
    email: "",
    numberOfOffices: "",
    estimatedEmployees: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const inputClass =
    "w-full bg-[#141414] border-2 border-[#2a2a2a] rounded-xl px-5 py-3.5 text-base text-white placeholder-[#555555] outline-none focus:border-[#06b6d4] transition-colors";

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim() || !form.contactName.trim() || !form.email.trim()) return;

    setStatus("sending");

    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.companyName,
          contact_name: form.contactName,
          email: form.email,
          number_of_offices: form.numberOfOffices,
          estimated_employees: form.estimatedEmployees,
          message: form.message,
        }),
      });

      if (res.ok) {
        setStatus("sent");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center py-12">
        <div className="text-4xl font-black text-[#00ff88] mb-4">GOT IT</div>
        <p className="text-[#888888] text-lg">
          We will be in touch within 24 hours.
        </p>
        <button
          onClick={() => { setStatus("idle"); setForm({ companyName: "", contactName: "", email: "", numberOfOffices: "", estimatedEmployees: "", message: "" }); }}
          className="mt-6 text-[#06b6d4] hover:text-white text-sm transition-colors cursor-pointer"
        >
          Send another inquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
            COMPANY NAME *
          </label>
          <input
            type="text"
            name="companyName"
            value={form.companyName}
            onChange={handleChange}
            placeholder="Acme Corp"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
            YOUR NAME *
          </label>
          <input
            type="text"
            name="contactName"
            value={form.contactName}
            onChange={handleChange}
            placeholder="Jane Smith"
            required
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
          WORK EMAIL *
        </label>
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="jane@acme.com"
          required
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
            NUMBER OF OFFICES
          </label>
          <select
            name="numberOfOffices"
            value={form.numberOfOffices}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="">Select</option>
            <option value="1">1</option>
            <option value="2-5">2 - 5</option>
            <option value="6-20">6 - 20</option>
            <option value="20+">20+</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
            ESTIMATED EMPLOYEES
          </label>
          <select
            name="estimatedEmployees"
            value={form.estimatedEmployees}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="">Select</option>
            <option value="1-50">1 - 50</option>
            <option value="51-200">51 - 200</option>
            <option value="201-1000">201 - 1,000</option>
            <option value="1000+">1,000+</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
          ANYTHING ELSE?
        </label>
        <textarea
          name="message"
          value={form.message}
          onChange={handleChange}
          rows={3}
          placeholder="Tell us about your wellness goals..."
          className={inputClass + " resize-none"}
        />
      </div>

      {status === "error" && (
        <div className="bg-[#ff3366]/10 border border-[#ff3366]/30 text-[#ff3366] text-sm px-4 py-3 rounded-lg">
          Something went wrong. Please email us at hello@squatsense.ai instead.
        </div>
      )}

      <button
        type="submit"
        disabled={status === "sending" || !form.companyName.trim() || !form.contactName.trim() || !form.email.trim()}
        className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${
          status !== "sending" && form.companyName.trim() && form.contactName.trim() && form.email.trim()
            ? "bg-[#06b6d4] text-black hover:bg-[#0891b2] cursor-pointer"
            : "bg-[#2a2a2a] text-[#555555] cursor-not-allowed"
        }`}
      >
        {status === "sending" ? "SENDING..." : "GET IN TOUCH"}
      </button>
    </form>
  );
}

export default function ForOfficesPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block text-xs font-bold tracking-[0.3em] text-[#06b6d4] uppercase mb-6 px-4 py-2 border border-[#06b6d4]/30 rounded-full">
            FOR OFFICES & CORPORATE WELLNESS
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black leading-none tracking-tighter mb-4">
            <span className="text-white">TURN YOUR OFFICE INTO</span>
            <br />
            <span className="text-white">A MOVEMENT ZONE</span>
            <span className="text-[#00ff88]">.</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#888888] max-w-2xl mx-auto mb-12">
            The 30-second wellness break that actually works. No gym required. No equipment needed. Just a TV in the break room and a little competitive spirit.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/setup"
              className="pulse-neon bg-[#00ff88] text-black font-bold text-base sm:text-lg px-8 sm:px-10 py-3 sm:py-4 rounded-xl hover:bg-[#00e07a] transition-colors"
            >
              SET UP YOUR FIRST KIOSK
            </Link>
            <a
              href="#contact"
              className="border-2 border-[#06b6d4] text-[#06b6d4] font-bold text-base sm:text-lg px-8 sm:px-10 py-3 sm:py-4 rounded-xl hover:bg-[#06b6d4]/10 transition-colors"
            >
              TALK TO US
            </a>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-sm font-bold tracking-[0.3em] text-[#888888] uppercase mb-4">
            How It Works
          </h2>
          <p className="text-center text-[#888888] max-w-xl mx-auto mb-16">
            Three steps. Two minutes to set up. Zero ongoing maintenance.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {howItWorks.map((step) => (
              <div
                key={step.number}
                className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8 text-center hover:border-[#00ff88]/30 transition-colors"
              >
                <div className="text-5xl font-black text-[#00ff88] mb-4 font-[family-name:var(--font-mono,'Space_Mono',monospace)]">
                  {step.number}
                </div>
                <h3 className="text-xl font-black text-white tracking-wide mb-3">
                  {step.title}
                </h3>
                <p className="text-[#888888] leading-relaxed text-sm">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="px-6 py-20 border-t border-[#2a2a2a]/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-sm font-bold tracking-[0.3em] text-[#888888] uppercase mb-4">
            Why It Works
          </h2>
          <p className="text-center text-2xl sm:text-3xl font-bold text-white max-w-2xl mx-auto mb-16">
            Corporate wellness that people actually use<span className="text-[#00ff88]">.</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 sm:p-8 hover:border-[#00ff88]/20 transition-colors"
              >
                <div className="text-[#00ff88] mb-4">{benefit.icon}</div>
                <h3 className="text-lg font-bold text-white mb-2">{benefit.title}</h3>
                <p className="text-[#888888] text-sm leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Stats */}
      <section className="px-6 py-20 border-t border-[#2a2a2a]/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-sm font-bold tracking-[0.3em] text-[#888888] uppercase mb-12">
            Early Traction
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: "30s", label: "Per game" },
              { value: "0", label: "Hardware cost" },
              { value: "2min", label: "Setup time" },
              { value: "100%", label: "Browser-based" },
            ].map((stat) => (
              <div key={stat.label} className="py-4">
                <div
                  className="text-3xl sm:text-4xl font-black text-[#00ff88] mb-1"
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  {stat.value}
                </div>
                <div className="text-xs text-[#888888] uppercase tracking-widest">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20 border-t border-[#2a2a2a]/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-sm font-bold tracking-[0.3em] text-[#888888] uppercase mb-4">
            Pricing
          </h2>
          <p className="text-center text-[#888888] max-w-xl mx-auto mb-12">
            Start free. Scale when you are ready.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {pricing.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-6 sm:p-8 ${
                  plan.highlighted
                    ? "bg-[#141414] border-2 border-[#06b6d4]/40"
                    : "bg-[#141414] border border-[#2a2a2a]"
                }`}
              >
                <div
                  className="text-xs font-bold tracking-[0.2em] mb-3"
                  style={{ color: plan.accent }}
                >
                  {plan.name}
                </div>
                <div className="text-3xl font-black text-white mb-1">
                  {plan.price}
                </div>
                <p className="text-sm text-[#888888] mb-6">{plan.description}</p>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <svg
                        className="w-4 h-4 mt-0.5 shrink-0"
                        style={{ color: plan.accent }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[#cccccc]">{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.href.startsWith("#") ? (
                  <a
                    href={plan.href}
                    className={`block w-full py-3.5 rounded-xl text-center font-bold transition-colors ${
                      plan.highlighted
                        ? "bg-[#06b6d4] text-black hover:bg-[#0891b2]"
                        : "border-2 border-[#00ff88]/50 text-[#00ff88] hover:bg-[#00ff88]/10"
                    }`}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    href={plan.href}
                    className={`block w-full py-3.5 rounded-xl text-center font-bold transition-colors ${
                      plan.highlighted
                        ? "bg-[#06b6d4] text-black hover:bg-[#0891b2]"
                        : "border-2 border-[#00ff88]/50 text-[#00ff88] hover:bg-[#00ff88]/10"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section id="contact" className="px-6 py-20 border-t border-[#2a2a2a]/50">
        <div className="max-w-xl mx-auto">
          <h2 className="text-center text-sm font-bold tracking-[0.3em] text-[#888888] uppercase mb-4">
            Get In Touch
          </h2>
          <p className="text-center text-2xl sm:text-3xl font-bold text-white mb-2">
            Bring SquatSense to your office<span className="text-[#00ff88]">.</span>
          </p>
          <p className="text-center text-[#888888] mb-10">
            Tell us about your company and we will help you get set up.
          </p>

          <ContactForm />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-20 text-center border-t border-[#2a2a2a]/50">
        <p className="text-2xl sm:text-3xl font-bold text-white mb-3">
          Set up your first kiosk in 2 minutes<span className="text-[#00ff88]">.</span>
        </p>
        <p className="text-[#888888] mb-8">
          Free for a single location. No credit card required.
        </p>
        <Link
          href="/setup"
          className="pulse-neon inline-block bg-[#00ff88] text-black font-bold text-lg px-10 py-4 rounded-xl hover:bg-[#00e07a] transition-colors"
        >
          SET UP YOUR FIRST KIOSK
        </Link>
      </section>

      <KinelyBar current="squatsense" />
    </div>
  );
}
