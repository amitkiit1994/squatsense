"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTeam, getTeam, type TeamResponse } from "@/lib/api";

type Step = "choose" | "create" | "join" | "ready";

export default function SetupPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Create team fields
  const [teamName, setTeamName] = useState("");

  // Join existing team
  const [teamCode, setTeamCode] = useState("");

  // Result
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const getArenaUrl = useCallback(() => {
    if (!team) return "";
    if (typeof window === "undefined") return `/arena/${team.code}`;
    return `${window.location.origin}/arena/${team.code}`;
  }, [team]);

  async function copyArenaLink() {
    try {
      await navigator.clipboard.writeText(getArenaUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  }

  const inputClass =
    "w-full bg-[#141414] border-2 border-[#2a2a2a] rounded-xl px-5 py-3.5 text-base text-white placeholder-[#555555] outline-none focus:border-[#00ff88] transition-colors";

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim() || loading) return;

    setError("");
    setLoading(true);

    try {
      const res = await createTeam(teamName.trim());
      setTeam(res);
      setStep("ready");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!teamCode.trim() || loading) return;

    setError("");
    setLoading(true);

    try {
      const res = await getTeam(teamCode.trim());
      setTeam(res);
      setStep("ready");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Team not found");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center text-[#888888] hover:text-white text-sm mb-8 sm:mb-12 transition-colors"
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          BACK
        </Link>

        {/* Header */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-2">
          SET UP YOUR OFFICE<span className="text-[#00ff88]">.</span>
        </h1>
        <p className="text-[#888888] mb-10">
          Create a team for your office. Get a shared leaderboard and arena display.
        </p>

        {/* Error */}
        {error && (
          <div className="bg-[#ff3366]/10 border border-[#ff3366]/30 text-[#ff3366] text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Step: Choose */}
        {step === "choose" && (
          <div className="space-y-4">
            <button
              onClick={() => { setStep("create"); setError(""); }}
              className="w-full p-5 rounded-xl bg-[#141414] border-2 border-[#2a2a2a] hover:border-[#00ff88]/50 transition-colors text-left cursor-pointer group"
            >
              <div className="text-lg font-bold text-white group-hover:text-[#00ff88] transition-colors">
                Create a New Team
              </div>
              <p className="text-sm text-[#888888] mt-1">
                Set up a new office team and get a shareable code
              </p>
            </button>

            <button
              onClick={() => { setStep("join"); setError(""); }}
              className="w-full p-5 rounded-xl bg-[#141414] border-2 border-[#2a2a2a] hover:border-[#06b6d4]/50 transition-colors text-left cursor-pointer group"
            >
              <div className="text-lg font-bold text-white group-hover:text-[#06b6d4] transition-colors">
                Use Existing Team Code
              </div>
              <p className="text-sm text-[#888888] mt-1">
                Already have a team code? Launch the arena display
              </p>
            </button>
          </div>
        )}

        {/* Step: Create Team */}
        {step === "create" && (
          <form onSubmit={handleCreateTeam} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
                TEAM NAME
              </label>
              <input
                type="text"
                autoFocus
                value={teamName}
                onChange={(e) => { setTeamName(e.target.value); setError(""); }}
                placeholder="e.g. Engineering, Marketing, Floor 3"
                maxLength={50}
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={!teamName.trim() || loading}
              className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${
                teamName.trim() && !loading
                  ? "bg-[#00ff88] text-black hover:bg-[#00e07a] pulse-neon cursor-pointer"
                  : "bg-[#2a2a2a] text-[#555555] cursor-not-allowed"
              }`}
            >
              {loading ? "CREATING..." : "CREATE TEAM"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("choose"); setError(""); }}
              className="w-full py-3 text-[#888888] hover:text-white transition-colors text-sm cursor-pointer"
            >
              Back
            </button>
          </form>
        )}

        {/* Step: Join Existing */}
        {step === "join" && (
          <form onSubmit={handleJoinTeam} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-[#888888] tracking-[0.15em] mb-2">
                TEAM CODE
              </label>
              <input
                type="text"
                autoFocus
                value={teamCode}
                onChange={(e) => { setTeamCode(e.target.value.toUpperCase()); setError(""); }}
                placeholder="e.g. A3F1B2"
                maxLength={20}
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={!teamCode.trim() || loading}
              className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${
                teamCode.trim() && !loading
                  ? "bg-[#06b6d4] text-black hover:bg-[#0891b2] cursor-pointer"
                  : "bg-[#2a2a2a] text-[#555555] cursor-not-allowed"
              }`}
            >
              {loading ? "LOOKING UP..." : "FIND TEAM"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("choose"); setError(""); }}
              className="w-full py-3 text-[#888888] hover:text-white transition-colors text-sm cursor-pointer"
            >
              Back
            </button>
          </form>
        )}

        {/* Step: Ready — team found/created */}
        {step === "ready" && team && (
          <div className="space-y-6">
            {/* Team card */}
            <div className="p-6 rounded-2xl bg-[#141414] border border-[#2a2a2a]">
              <div className="text-center">
                <div className="text-2xl font-black text-white mb-1">
                  {team.name}
                </div>
                <div className="text-sm text-[#888888] mb-4">
                  {team.member_count} member{team.member_count !== 1 ? "s" : ""}
                </div>

                {/* Team code display */}
                <div className="inline-block bg-[#0a0a0a] border border-[#00ff88]/30 rounded-xl px-6 py-3">
                  <div className="text-xs text-[#888888] tracking-widest mb-1">
                    TEAM CODE
                  </div>
                  <div
                    className="text-2xl sm:text-3xl font-black text-[#00ff88] tracking-[0.2em]"
                    style={{ fontFamily: "'Space Mono', monospace" }}
                  >
                    {team.code}
                  </div>
                </div>

                <p className="text-xs text-[#888888] mt-4">
                  Share this code with your team so they can join when signing up
                </p>
              </div>
            </div>

            {/* Deployment guidance */}
            <div className="p-5 rounded-xl bg-[#0a0a0a] border border-[#2a2a2a]">
              <h3 className="text-sm font-bold text-[#00ff88] tracking-widest uppercase mb-3">
                HOW TO DEPLOY
              </h3>
              <ol className="space-y-2 text-sm text-[#cccccc]">
                <li className="flex gap-2">
                  <span className="text-[#00ff88] font-mono font-bold shrink-0">1.</span>
                  Open Chrome on your TV/monitor
                </li>
                <li className="flex gap-2">
                  <span className="text-[#00ff88] font-mono font-bold shrink-0">2.</span>
                  Navigate to the arena URL below
                </li>
                <li className="flex gap-2">
                  <span className="text-[#00ff88] font-mono font-bold shrink-0">3.</span>
                  Allow camera access when prompted
                </li>
                <li className="flex gap-2">
                  <span className="text-[#00ff88] font-mono font-bold shrink-0">4.</span>
                  Press F11 for fullscreen
                </li>
              </ol>
            </div>

            {/* Arena URL + copy */}
            <div className="p-4 rounded-xl bg-[#141414] border border-[#2a2a2a]">
              <div className="text-xs text-[#888888] tracking-widest mb-1">ARENA URL</div>
              <div className="text-sm text-[#06b6d4] font-mono break-all mb-3">
                {typeof window !== "undefined" ? `${window.location.origin}/arena/${team.code}` : `/arena/${team.code}`}
              </div>
              <button
                onClick={copyArenaLink}
                className="w-full py-3 rounded-lg bg-[#06b6d4]/20 border border-[#06b6d4]/40 text-[#06b6d4] text-sm font-bold
                           hover:bg-[#06b6d4]/30 transition-colors cursor-pointer"
              >
                {copied ? "COPIED!" : "COPY ARENA LINK"}
              </button>
            </div>

            {/* Requirements */}
            <div className="text-center text-xs text-[#888888] px-4">
              <span className="font-bold text-[#666666]">Requirements:</span>{" "}
              Webcam, TV/monitor, stable WiFi, Chrome browser
            </div>

            {/* Actions */}
            <a
              href={`/arena/${team.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 bg-[#00ff88] text-[#0a0a0a] font-bold text-lg rounded-xl text-center
                         hover:bg-[#00cc6e] transition-colors pulse-neon cursor-pointer"
            >
              LAUNCH ARENA DISPLAY
            </a>

            <p className="text-center text-xs text-[#888888]">
              Open this on a TV or large screen in your office.
              <br />
              Team members scan the QR code to play.
            </p>

            <button
              onClick={() => { setStep("choose"); setTeam(null); setError(""); setCopied(false); }}
              className="w-full py-3 text-[#888888] hover:text-white transition-colors text-sm cursor-pointer"
            >
              Set up a different team
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
