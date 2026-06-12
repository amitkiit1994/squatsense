"use client";

/**
 * Reusable key gate for founder admin pages (same pattern as /admin/leads).
 *
 * Validates the admin key against GET /api/v1/admin/leads through the
 * same-origin proxy (X-Admin-Key header, no CORS preflight) and persists
 * it under the same localStorage key as the leads dashboard, so unlocking
 * either page unlocks both. The fetched body is discarded — this component
 * only cares whether the key is accepted.
 */

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ADMIN_KEY_STORAGE_KEY, ADMIN_LEADS_ENDPOINT } from "@/lib/admin-key";

type GateState = "checking" | "locked" | "verifying" | "unlocked";

interface AdminKeyGateProps {
  title: string;
  description: string;
  /** Render prop: receives a lock() callback for a header Lock button. */
  children: (lock: () => void) => React.ReactNode;
}

export function AdminKeyGate({
  title,
  description,
  children,
}: AdminKeyGateProps) {
  const [state, setState] = useState<GateState>("checking");
  const [keyInput, setKeyInput] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);

  async function verifyKey(key: string, fromStorage: boolean): Promise<void> {
    setState("verifying");
    setGateError(null);
    try {
      const res = await fetch(ADMIN_LEADS_ENDPOINT, {
        headers: { "X-Admin-Key": key },
        cache: "no-store",
      });

      if (res.status === 401) {
        localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
        setGateError(
          fromStorage
            ? "Your saved admin key was rejected. Enter the key again."
            : "Invalid admin key. Check the key and try again.",
        );
        setState("locked");
        return;
      }

      if (res.status === 503) {
        setGateError(
          "Admin API not configured. Set ADMIN_API_KEY on the backend.",
        );
        setState("locked");
        return;
      }

      if (!res.ok) {
        throw new Error(`Request failed with HTTP ${res.status}`);
      }

      localStorage.setItem(ADMIN_KEY_STORAGE_KEY, key);
      setState("unlocked");
    } catch (err) {
      setGateError(
        err instanceof Error && err.message
          ? err.message
          : "Could not reach the server.",
      );
      setState("locked");
    }
  }

  // On mount: try the stored key, otherwise show the gate.
  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_KEY_STORAGE_KEY);
    if (stored) {
      void verifyKey(stored, true);
    } else {
      setState("locked");
    }
    // Intentionally run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUnlock(e: FormEvent) {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) {
      setGateError("Enter the admin key.");
      return;
    }
    void verifyKey(key, false);
  }

  function lock() {
    localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    setKeyInput("");
    setGateError(null);
    setState("locked");
  }

  if (state === "checking" || state === "verifying") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <p className="text-sm text-zinc-500">Checking admin key…</p>
      </main>
    );
  }

  if (state === "locked") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-sm">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-white">{title}</CardTitle>
              <CardDescription className="text-zinc-400">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUnlock} className="space-y-4">
                {gateError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {gateError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="admin-key" className="text-zinc-300">
                    Admin key
                  </Label>
                  <Input
                    id="admin-key"
                    type="password"
                    placeholder="Admin key"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    autoComplete="off"
                    autoFocus
                    className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Unlock
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return <>{children(lock)}</>;
}
