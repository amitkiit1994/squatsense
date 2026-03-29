"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getPlayer, clearAuth, isLoggedIn } from "@/lib/auth";
import type { StoredPlayer } from "@/lib/auth";

// Pages where the navbar should be hidden (immersive/full-screen experiences)
const HIDDEN_PREFIXES = ["/play", "/arena", "/kiosk-join"];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [player, setPlayer] = useState<StoredPlayer | null>(null);
  const [authed, setAuthed] = useState(false);

  // Re-check auth state on every route change
  useEffect(() => {
    setPlayer(getPlayer());
    setAuthed(isLoggedIn());
  }, [pathname]);

  // Hide on immersive pages
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const handleLogout = () => {
    clearAuth();
    sessionStorage.removeItem("squatsense_results");
    setPlayer(null);
    setAuthed(false);
    router.push("/");
  };

  return (
    <nav className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-[#2a2a2a]/50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span
            className="text-lg sm:text-xl font-black text-[#00ff88]"
            style={{ fontFamily: "'Space Mono', monospace" }}
          >
            SquatSense
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Link
            href="/leaderboard"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              pathname === "/leaderboard"
                ? "text-[#00ff88] bg-[#00ff88]/10"
                : "text-[#888] hover:text-[#f0f0f0]"
            }`}
          >
            Leaderboard
          </Link>

          {authed ? (
            <>
              <Link
                href="/profile"
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors truncate max-w-[120px] ${
                  pathname === "/profile"
                    ? "text-[#00ff88] bg-[#00ff88]/10"
                    : "text-[#888] hover:text-[#f0f0f0]"
                }`}
              >
                {player?.nickname || "Profile"}
              </Link>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm font-medium text-[#888] hover:text-[#ff3366] rounded-lg transition-colors cursor-pointer"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/join"
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                pathname === "/join" || pathname === "/register"
                  ? "text-[#00ff88] bg-[#00ff88]/10"
                  : "text-[#888] hover:text-[#f0f0f0]"
              }`}
            >
              Join
            </Link>
          )}

          <Link
            href="/play"
            className="ml-1 px-4 py-1.5 text-sm font-bold bg-[#00ff88] text-[#0a0a0a] rounded-lg hover:bg-[#00e07a] transition-colors"
          >
            Play
          </Link>
        </div>
      </div>
    </nav>
  );
}
