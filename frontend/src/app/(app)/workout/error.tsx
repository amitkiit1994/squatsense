"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Workout page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred during your workout. Your session data
          has been preserved on the server.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
          <Button onClick={reset}>Try Again</Button>
        </div>
      </div>
    </div>
  );
}
