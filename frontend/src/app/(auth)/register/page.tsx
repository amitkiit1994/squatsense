"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { ApiResponseError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/* ------------------------------------------------------------------ */
/*  Beta Access Granted confirmation step                             */
/* ------------------------------------------------------------------ */

function BetaAccessGranted({ name, onContinue }: { name: string; onContinue: () => void }) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <img src="/logo.png" alt="FreeForm Fitness" className="mx-auto h-48 w-auto" />
      </div>

      <Card className="glass-card gradient-border border-zinc-800">
        <CardContent className="pt-8 pb-8 text-center">
          {/* Checkmark icon */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-white">Beta Access Granted</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Welcome{name ? `, ${name}` : ""}. You are one of the first to experience
            AI-powered movement analysis.
          </p>

          <div className="mx-auto mt-6 max-w-xs space-y-2 text-left">
            <div className="flex items-start gap-2 text-sm text-zinc-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Real-time form scoring on every rep
            </div>
            <div className="flex items-start gap-2 text-sm text-zinc-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Biomechanical analysis with 33 landmarks
            </div>
            <div className="flex items-start gap-2 text-sm text-zinc-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              No wearables or hardware needed
            </div>
          </div>

          <Button
            size="lg"
            className="mt-8 w-full"
            onClick={onContinue}
          >
            Set Up Your Profile
          </Button>

          <p className="mt-3 text-xs text-zinc-500">
            Takes about 2 minutes. You can skip and do this later.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Registration page                                                 */
/* ------------------------------------------------------------------ */

function RegisterForm() {
  const router = useRouter();
  const { register, isLoading } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showBetaConfirmation, setShowBetaConfirmation] = useState(false);

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

      // Show the beta access confirmation step
      setShowBetaConfirmation(true);
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 403) {
        // Not on the invite list — send them to the waitlist
        router.push("/?invite=denied");
        return;
      }
      if (err instanceof ApiResponseError && err.status === 404) {
        // The account was created and tokens stored, but the profile read
        // lagged behind (read-after-write race). Treat as success — the
        // profile loads on the next screen.
        try {
          localStorage.setItem("onboarding_name", name);
        } catch {
          // localStorage not available
        }
        setShowBetaConfirmation(true);
        return;
      }
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      setSubmitting(false);
    }
  }

  function handleContinueToOnboarding() {
    router.push("/onboarding/profile");
  }

  const loading = submitting || isLoading;

  // Show beta confirmation after successful registration
  if (showBetaConfirmation) {
    return (
      <BetaAccessGranted
        name={name.split(" ")[0]}
        onContinue={handleContinueToOnboarding}
      />
    );
  }

  return (
    <div className="w-full max-w-md">
      {/* Logo / Title */}
      <div className="mb-8 text-center">
        <img src="/logo.png" alt="FreeForm Fitness" className="mx-auto h-48 w-auto" />
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
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus:ring-orange-500"
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
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus:ring-orange-500"
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
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus:ring-orange-500"
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
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus:ring-orange-500"
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

          <p className="mt-4 text-center text-xs text-zinc-500">
            Free during beta. No credit card required.
          </p>

          <div className="mt-4 text-center text-sm text-zinc-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-orange-400 hover:text-orange-300 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
