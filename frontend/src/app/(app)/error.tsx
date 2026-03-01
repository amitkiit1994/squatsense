"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <h2 className="text-lg font-bold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
          <div className="flex gap-3">
            <Button onClick={reset}>Try Again</Button>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
