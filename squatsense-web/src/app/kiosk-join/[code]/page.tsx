"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  joinKiosk,
  getKioskPlayerStatus,
  KioskPlayerStatus,
  KioskJoinResponse,
} from "@/lib/api";
import { trackEvent } from "@/lib/analytics";

// ── Recent nicknames helpers ──────────────────────────────────────────
const RECENT_NICKNAMES_KEY = "recent_nicknames";
const MAX_RECENT = 5;

function getRecentNicknames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_NICKNAMES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentNickname(nickname: string) {
  if (typeof window === "undefined") return;
  const existing = getRecentNicknames().filter(
    (n) => n.toLowerCase() !== nickname.toLowerCase()
  );
  const updated = [nickname, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_NICKNAMES_KEY, JSON.stringify(updated));
}

// ── State types ───────────────────────────────────────────────────────
type PageState = "idle" | "joining" | "queued" | "active" | "completed" | "error";

// ── Component ─────────────────────────────────────────────────────────
export default function KioskJoinPage() {
  const params = useParams<{ code: string }>();
  const kioskId = params.code;

  const [state, setState] = useState<PageState>("idle");
  const [nickname, setNickname] = useState("");
  const [recentNicknames, setRecentNicknames] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [playerStatus, setPlayerStatus] = useState<KioskPlayerStatus | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasVibratedRef = useRef(false);

  // Load recent nicknames on mount
  useEffect(() => {
    setRecentNicknames(getRecentNicknames());
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Polling logic ─────────────────────────────────────────────────
  const startPolling = useCallback(
    (pid: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      const poll = async () => {
        try {
          const result = await getKioskPlayerStatus(kioskId, pid);
          setPlayerStatus(result);

          if (result.queue_position !== undefined) {
            setQueuePosition(result.queue_position);
          }

          if (result.status === "active") {
            setState((prev) => {
              if (prev === "queued" && !hasVibratedRef.current) {
                hasVibratedRef.current = true;
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  navigator.vibrate([200, 100, 200]);
                }
              }
              return "active";
            });
          } else if (result.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setState("completed");
          }
        } catch {
          // Silently continue polling on error
        }
      };

      // Poll immediately, then every 2 seconds
      poll();
      pollRef.current = setInterval(poll, 2000);
    },
    [kioskId]
  );

  // ── Join handler ──────────────────────────────────────────────────
  const handleJoin = useCallback(async () => {
    const trimmed = nickname.trim();
    if (!trimmed || !kioskId) return;

    setState("joining");
    setErrorMessage("");
    hasVibratedRef.current = false;

    try {
      const response: KioskJoinResponse = await joinKiosk(kioskId, trimmed);
      saveRecentNickname(trimmed);
      setPlayerId(response.player_id);
      setQueuePosition(response.queue_position);
      trackEvent("kiosk_joined", { kiosk_id: kioskId, player_id: response.player_id, nickname: trimmed });

      setState("queued");
      startPolling(response.player_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg.toLowerCase().includes("not allowed")) {
        setErrorMessage("That nickname is not allowed. Please choose another.");
      } else if (msg.toLowerCase().includes("nickname") || msg.toLowerCase().includes("taken")) {
        setErrorMessage("That nickname is already taken. Try another one!");
      } else if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("kiosk")) {
        setErrorMessage("Kiosk not found. The QR code may have expired.");
      } else {
        setErrorMessage(msg);
      }
      setState("error");
    }
  }, [nickname, kioskId, startPolling]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleJoin();
  };

  // ── Reset to idle ─────────────────────────────────────────────────
  const resetToIdle = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setState("idle");
    setNickname("");
    setErrorMessage("");
    setPlayerId("");
    setQueuePosition(0);
    setPlayerStatus(null);
    hasVibratedRef.current = false;
    setRecentNicknames(getRecentNicknames());
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  // ── Joining screen ────────────────────────────────────────────────
  if (state === "joining") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center max-w-sm mx-auto">
          <svg className="animate-spin h-16 w-16 mx-auto text-[#00ff88] mb-6" viewBox="0 0 24 24">
            <circle
              cx="12" cy="12" r="10"
              stroke="currentColor" strokeWidth="3"
              fill="none" strokeDasharray="31.4 31.4"
            />
          </svg>
          <h1 className="text-2xl font-bold text-zinc-200">
            Joining the queue...
          </h1>
          <p className="text-zinc-500 mt-2">Hang tight</p>
        </div>
      </div>
    );
  }

  // ── Queued screen ─────────────────────────────────────────────────
  if (state === "queued") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center max-w-sm mx-auto">
          <p className="text-zinc-500 text-sm font-semibold tracking-widest uppercase mb-2">
            Your position
          </p>
          <div className="text-8xl sm:text-9xl font-black text-[#00ff88] mb-2 tabular-nums">
            #{queuePosition}
          </div>
          <p className="text-2xl font-bold text-zinc-200 mb-6">
            in line
          </p>

          {/* Pulsing dot indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff88] opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00ff88]" />
            </span>
            <span className="text-zinc-400 text-sm font-medium">Waiting for your turn</span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <p className="text-[#00ff88] text-sm font-semibold">
              Don&apos;t close this page!
            </p>
            <p className="text-zinc-500 text-xs mt-1">
              We&apos;ll notify you when it&apos;s your turn.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Active screen ─────────────────────────────────────────────────
  if (state === "active") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center max-w-sm mx-auto">
          {/* Pulsing ring */}
          <div className="relative mx-auto w-24 h-24 mb-8">
            <span className="absolute inset-0 rounded-full bg-[#00ff88]/20 animate-ping" />
            <span className="absolute inset-2 rounded-full bg-[#00ff88]/30 animate-ping [animation-delay:150ms]" />
            <span className="absolute inset-4 rounded-full bg-[#00ff88]/40 animate-pulse" />
            <div className="relative flex items-center justify-center w-full h-full">
              <svg
                className="w-12 h-12 text-[#00ff88]"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-[#00ff88] animate-pulse mb-4 tracking-wide">
            YOUR BLITZ IS HAPPENING NOW!
          </h1>
          <p className="text-xl text-zinc-400 font-medium">
            Look at the screen and start squatting!
          </p>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 mt-8">
            <p className="text-[#00ff88] text-sm font-semibold">
              Don&apos;t close this page!
            </p>
            <p className="text-zinc-500 text-xs mt-1">
              Your results will appear here when you finish.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Completed screen ──────────────────────────────────────────────
  if (state === "completed" && playerStatus) {
    const avgQualityPct = playerStatus.avg_quality !== undefined
      ? Math.round(playerStatus.avg_quality * 100)
      : null;

    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm mx-auto">
          {/* Results card — screenshot-friendly */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl shadow-[#00ff88]/5">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-black text-[#00ff88] tracking-wide mb-1">
                BLITZ COMPLETE!
              </h1>
              {playerStatus.rank && (
                <p className="text-zinc-400 text-sm font-semibold">
                  Rank: {playerStatus.rank}
                </p>
              )}
            </div>

            {/* Points hero */}
            <div className="text-center mb-6">
              <p className="text-zinc-500 text-xs font-semibold tracking-widest uppercase">
                Points earned
              </p>
              <p className="text-5xl sm:text-6xl font-black text-white tabular-nums mt-1">
                {playerStatus.points_earned ?? playerStatus.total_points ?? 0}
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {/* Reps */}
              <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                <p className="text-zinc-500 text-xs font-semibold uppercase">Reps</p>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums mt-0.5">
                  {playerStatus.reps_counted ?? 0}
                  {playerStatus.reps_total ? (
                    <span className="text-zinc-500 text-base">/{playerStatus.reps_total}</span>
                  ) : null}
                </p>
              </div>

              {/* Avg Quality */}
              <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                <p className="text-zinc-500 text-xs font-semibold uppercase">Avg Quality</p>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums mt-0.5">
                  {avgQualityPct !== null ? `${avgQualityPct}%` : "—"}
                </p>
              </div>

              {/* Max Combo */}
              <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                <p className="text-zinc-500 text-xs font-semibold uppercase">Max Combo</p>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums mt-0.5">
                  {playerStatus.max_combo ?? 0}x
                </p>
              </div>

              {/* Perfect Reps */}
              <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
                <p className="text-zinc-500 text-xs font-semibold uppercase">Perfect Reps</p>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums mt-0.5">
                  {playerStatus.perfect_reps ?? 0}
                </p>
              </div>
            </div>

            {/* Branding footer in card (for screenshots) */}
            <p className="text-center text-zinc-600 text-xs font-semibold tracking-widest">
              SQUATSENSE
            </p>
          </div>

          {/* Action buttons */}
          <div className="mt-6 space-y-3">
            <Link
              href="/register"
              className="block w-full py-4 rounded-2xl text-lg font-black tracking-wider text-center
                bg-[#00ff88] text-black active:scale-95 transition-transform"
            >
              CREATE ACCOUNT
            </Link>
            <button
              type="button"
              onClick={resetToIdle}
              className="w-full py-4 rounded-2xl text-lg font-bold tracking-wider
                bg-zinc-800 text-zinc-200 border border-zinc-700
                active:scale-95 transition-transform"
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error screen ──────────────────────────────────────────────────
  if (state === "error") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center max-w-sm mx-auto">
          {/* Error icon */}
          <div className="mb-6">
            <svg
              className="w-16 h-16 mx-auto text-red-500"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path
                strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-200 mb-2">
            Something went wrong
          </h1>
          <p className="text-zinc-400 mb-8">
            {errorMessage || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={resetToIdle}
            className="w-full max-w-xs mx-auto py-4 rounded-2xl text-lg font-bold tracking-wider
              bg-zinc-800 text-zinc-200 border border-zinc-700
              active:scale-95 transition-transform"
          >
            TRY AGAIN
          </button>
        </div>
      </div>
    );
  }

  // ── Idle screen (default) ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex flex-col px-6 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-[#00ff88] tracking-widest">
          SQUATSENSE
        </h1>
        <p className="text-lg text-zinc-500 mt-2 font-medium">
          Office Arena
        </p>
      </div>

      {/* Form area */}
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        {/* Recent nicknames */}
        {recentNicknames.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-zinc-500 mb-2 font-medium">RECENT</p>
            <div className="flex flex-wrap gap-2">
              {recentNicknames.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNickname(n)}
                  className="px-4 py-2 rounded-full text-sm font-semibold
                    bg-zinc-900 border border-zinc-800 text-zinc-200
                    hover:border-[#00ff88]/50 hover:text-[#00ff88]
                    active:bg-[#00ff88]/10 transition-colors"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nickname input */}
        <div className="mb-6">
          <input
            ref={inputRef}
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="YOUR NICKNAME"
            maxLength={20}
            className="w-full px-5 py-4 sm:px-6 sm:py-5 text-lg sm:text-xl font-bold text-center
              bg-zinc-900 border-2 border-zinc-800 rounded-2xl
              text-zinc-100 placeholder-zinc-600
              focus:border-[#00ff88] focus:outline-none
              transition-colors"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
          />
        </div>

        {/* GO button */}
        <button
          type="button"
          onClick={handleJoin}
          disabled={!nickname.trim()}
          className="w-full py-4 sm:py-5 rounded-2xl text-2xl sm:text-3xl font-black tracking-widest
            bg-[#00ff88] text-black
            disabled:opacity-30 disabled:cursor-not-allowed
            active:scale-95 transition-all"
        >
          GO!
        </button>

        {/* Help text */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          Enter a nickname and get ready to squat!
        </p>
      </div>
    </div>
  );
}
