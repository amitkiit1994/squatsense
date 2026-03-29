"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { leagueVerifyEmail } from "@/lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token provided.");
      return;
    }

    leagueVerifyEmail(token)
      .then((res) => {
        setStatus("success");
        setMessage(res.message || "Email verified!");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed.");
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        {status === "loading" && (
          <>
            <div className="w-12 h-12 border-3 border-[#00ff88] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <p className="text-[#888888] text-lg">Verifying your email...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-16 h-16 rounded-full bg-[#00ff88]/20 border-2 border-[#00ff88] flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-[#00ff88]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-white mb-2">Email Verified!</h1>
            <p className="text-[#888888] mb-8">
              Your email has been successfully verified. You can close this page.
            </p>
            <Link
              href="/profile"
              className="inline-block px-8 py-3 rounded-xl bg-[#00ff88] text-[#0a0a0a] font-bold text-lg hover:bg-[#00e07a] transition-colors"
            >
              Go to Profile
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-16 h-16 rounded-full bg-[#ff3366]/20 border-2 border-[#ff3366] flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-[#ff3366]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-white mb-2">Verification Failed</h1>
            <p className="text-[#ff3366] mb-8">{message}</p>
            <Link
              href="/"
              className="inline-block px-8 py-3 rounded-xl bg-[#2a2a2a] text-white font-bold hover:bg-[#3a3a3a] transition-colors"
            >
              Go Home
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <div className="w-12 h-12 border-3 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
