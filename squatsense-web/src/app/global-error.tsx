"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-black text-[#ff3366] mb-4">
            Something went wrong
          </h1>
          <p className="text-[#888] mb-8">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            className="px-8 py-3 rounded-xl bg-[#00ff88] text-[#0a0a0a] font-bold hover:bg-[#00e07a] transition-colors"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
