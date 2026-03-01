"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Password validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      await register({ name, email, password });

      // Store name for pre-filling the profile onboarding step
      try {
        localStorage.setItem("onboarding_name", name);
      } catch {
        // localStorage not available
      }

      router.push("/onboarding/profile");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      setSubmitting(false);
    }
  }

  const loading = submitting || isLoading;

  return (
    <div className="w-full max-w-md">
      {/* Logo / Title */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 shadow-lg shadow-violet-600/20">
          <svg viewBox="0 0 192 192" className="h-10 w-10" aria-hidden="true">
            <g transform="translate(96,96)" fill="none" stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="0" cy="-38" r="10" fill="#a78bfa" />
              <line x1="0" y1="-28" x2="-4" y2="0" />
              <line x1="-4" y1="-20" x2="-24" y2="-24" />
              <line x1="-4" y1="-20" x2="16" y2="-24" />
              <line x1="-32" y1="-24" x2="24" y2="-24" strokeWidth="4" />
              <rect x="-38" y="-30" width="8" height="12" rx="2" fill="#a78bfa" />
              <rect x="22" y="-30" width="8" height="12" rx="2" fill="#a78bfa" />
              <line x1="-4" y1="0" x2="-16" y2="4" />
              <line x1="-4" y1="0" x2="10" y2="4" />
              <line x1="-16" y1="4" x2="-24" y2="16" />
              <line x1="10" y1="4" x2="18" y2="16" />
              <line x1="-24" y1="16" x2="-20" y2="40" />
              <line x1="18" y1="16" x2="14" y2="40" />
              <line x1="-20" y1="40" x2="-28" y2="42" />
              <line x1="14" y1="40" x2="22" y2="42" />
            </g>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white">SquatSense</h1>
        <p className="mt-1 text-sm text-zinc-400">
          AI-powered movement intelligence
        </p>
      </div>

      <Card className="glass-card gradient-border border-zinc-800">
        <CardHeader className="text-center">
          <CardTitle className="text-white">Create your account</CardTitle>
          <CardDescription className="text-zinc-400">
            Get started with AI-powered movement intelligence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error display */}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-zinc-300">
                Full Name
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-zinc-300">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus:ring-violet-500"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Creating account...
                </span>
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-zinc-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-violet-400 hover:text-violet-300 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
