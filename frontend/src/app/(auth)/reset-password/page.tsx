"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Card className="glass-card gradient-border border-zinc-800">
        <CardContent className="pt-6">
          <div className="space-y-4 text-center">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Invalid reset link. No token provided.
            </div>
            <Link
              href="/forgot-password"
              className="inline-block text-sm font-medium text-orange-400 hover:text-orange-300 transition-colors"
            >
              Request a new reset link
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

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
      const tokens = await resetPassword(token!, password);
      setTokens(tokens.access_token, tokens.refresh_token);
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset password";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <Card className="glass-card gradient-border border-zinc-800">
      <CardHeader className="text-center">
        <CardTitle className="text-white">Set new password</CardTitle>
        <CardDescription className="text-zinc-400">
          Enter your new password below
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
              {error.includes("expired") || error.includes("already been used") ? (
                <div className="mt-2">
                  <Link
                    href="/forgot-password"
                    className="font-medium text-red-300 underline hover:text-red-200"
                  >
                    Request a new reset link
                  </Link>
                </div>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">
              New Password
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
              Confirm New Password
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
            disabled={submitting}
          >
            {submitting ? (
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
                Resetting...
              </span>
            ) : (
              "Reset password"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-400">
          <Link
            href="/login"
            className="font-medium text-orange-400 hover:text-orange-300 transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-md">
      {/* Logo / Title */}
      <div className="mb-8 text-center">
        <img src="/logo.png" alt="FreeForm Fitness" className="mx-auto h-48 w-auto" />
      </div>

      <Suspense
        fallback={
          <Card className="glass-card gradient-border border-zinc-800">
            <CardContent className="pt-6 text-center text-zinc-400">
              Loading...
            </CardContent>
          </Card>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
