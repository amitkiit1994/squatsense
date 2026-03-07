"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface Injury {
  id: string;
  bodyArea: string;
  side: string;
  notes: string;
}

const BODY_AREAS = [
  "Knee",
  "Hip",
  "Ankle",
  "Lower Back",
  "Upper Back",
  "Shoulder",
  "Wrist",
  "Neck",
  "Hamstring",
  "Quadriceps",
  "Calf",
  "Groin",
  "Other",
];

const SIDES = ["Left", "Right", "Both"];

export default function InjuriesPage() {
  const router = useRouter();

  const [hasInjuries, setHasInjuries] = useState(false);
  const [injuries, setInjuries] = useState<Injury[]>([]);

  // Form state for adding a new injury
  const [bodyArea, setBodyArea] = useState("");
  const [side, setSide] = useState("");
  const [notes, setNotes] = useState("");

  function addInjury() {
    if (!bodyArea || !side) return;

    const newInjury: Injury = {
      id: Date.now().toString(),
      bodyArea,
      side,
      notes,
    };

    setInjuries((prev) => [...prev, newInjury]);
    setBodyArea("");
    setSide("");
    setNotes("");
  }

  function removeInjury(id: string) {
    setInjuries((prev) => prev.filter((i) => i.id !== id));
  }

  function handleNext() {
    try {
      localStorage.setItem(
        "onboarding_injuries",
        JSON.stringify({ hasInjuries, injuries })
      );
    } catch {
      // localStorage not available
    }

    router.push("/onboarding/baseline");
  }

  return (
    <div className="flex flex-1 flex-col">
      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">
            Injury History
          </CardTitle>
          <CardDescription>
            Let us know about any injuries so we can adjust your training
            recommendations and safety thresholds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
            <span className="text-sm font-medium text-white">
              Do you have any current or past injuries?
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={hasInjuries}
              onClick={() => setHasInjuries(!hasInjuries)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                hasInjuries ? "bg-orange-600" : "bg-zinc-600"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  hasInjuries ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {hasInjuries && (
            <>
              {/* Injury list */}
              {injuries.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-zinc-500">
                    Added Injuries
                  </Label>
                  {injuries.map((injury) => (
                    <div
                      key={injury.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 p-3"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">
                          {injury.bodyArea}{" "}
                          <span className="font-normal text-zinc-500">
                            ({injury.side})
                          </span>
                        </p>
                        {injury.notes && (
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {injury.notes}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeInjury(injury.id)}
                        className="ml-3 flex-shrink-0 rounded-md p-1 text-zinc-400 hover:bg-red-950 hover:text-red-500 transition-colors"
                        aria-label={`Remove ${injury.bodyArea} injury`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add injury form */}
              <div className="space-y-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-800/30 p-4">
                <Label className="text-xs uppercase tracking-wide text-zinc-500">
                  Add an Injury
                </Label>

                <div className="space-y-2">
                  <Label htmlFor="bodyArea" className="text-sm">
                    Body Area
                  </Label>
                  <select
                    id="bodyArea"
                    value={bodyArea}
                    onChange={(e) => setBodyArea(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Select area...</option>
                    {BODY_AREAS.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Side</Label>
                  <div className="flex gap-2">
                    {SIDES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSide(s)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          side === s
                            ? "border-orange-500 bg-orange-950 text-orange-300"
                            : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-sm">
                    Notes (optional)
                  </Label>
                  <Input
                    id="notes"
                    type="text"
                    placeholder="e.g. ACL surgery 2023, mostly healed"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={addInjury}
                  disabled={!bodyArea || !side}
                  className="w-full"
                >
                  <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Injury
                </Button>
              </div>
            </>
          )}

          <Button onClick={handleNext} size="lg" className="w-full">
            Next
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
