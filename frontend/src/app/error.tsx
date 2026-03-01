"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-bold text-zinc-100">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred. Please try again or return to the
        dashboard.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try Again</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
          Dashboard
        </Button>
      </div>
    </div>
  );
}
