"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function ProfilePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");

  // Pre-fill name from localStorage if available (set during registration)
  useEffect(() => {
    try {
      const storedName = localStorage.getItem("onboarding_name");
      if (storedName) {
        setName(storedName);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Store profile data locally for the onboarding flow
    try {
      localStorage.setItem(
        "onboarding_profile",
        JSON.stringify({ name, height, weight, age })
      );
    } catch {
      // localStorage not available
    }

    router.push("/onboarding/goals");
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">
            Tell us about yourself
          </CardTitle>
          <CardDescription>
            This helps us personalize your experience and track your progress
            accurately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  placeholder="175"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  min={100}
                  max={250}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  placeholder="70"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  min={30}
                  max={300}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                placeholder="25"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min={13}
                max={120}
                required
              />
            </div>

            <Button type="submit" size="lg" className="w-full mt-2">
              Next
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
