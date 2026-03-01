"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  LogOut,
  Shield,
  Download,
  Trash2,
  Save,
  Target,
  Dumbbell,
  AlertTriangle,
  Camera,
  Bell,
  Plus,
  X,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiFetch, logout as apiLogout, deleteAccount, exportData } from "@/lib/api";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  goal: string;
  experience_level: string;
  training_max: Record<string, number>;
  injury_history?: InjuryItem[];
}

interface InjuryItem {
  area: string;
  side: string;
  notes?: string;
}

const GOAL_OPTIONS = [
  { value: "general", label: "General Fitness" },
  { value: "strength", label: "Strength / Powerlifting" },
  { value: "hypertrophy", label: "Hypertrophy / Muscle Gain" },
  { value: "rehab", label: "Rehab / Injury Prevention" },
];

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner (0-1 years)" },
  { value: "intermediate", label: "Intermediate (1-3 years)" },
  { value: "advanced", label: "Advanced (3+ years)" },
];

const EXERCISE_TYPES = [
  { key: "squat", label: "Squat" },
  { key: "deadlift", label: "Deadlift" },
  { key: "bench_press", label: "Bench Press" },
  { key: "overhead_press", label: "Overhead Press" },
  { key: "row", label: "Row" },
];

const SIDE_OPTIONS = [
  { value: "bilateral", label: "Both sides" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [trainingMaxes, setTrainingMaxes] = useState<Record<string, number>>(
    {}
  );
  const [storeLandmarks, setStoreLandmarks] = useState(true);

  // Injury history
  const [injuries, setInjuries] = useState<InjuryItem[]>([]);
  const [newInjuryArea, setNewInjuryArea] = useState("");
  const [newInjurySide, setNewInjurySide] = useState("bilateral");
  const [newInjuryNotes, setNewInjuryNotes] = useState("");

  // Camera settings (localStorage)
  const [cameraResolution, setCameraResolution] = useState("720p");
  const [cameraFps, setCameraFps] = useState("30");

  // Notification preferences (localStorage)
  const [workoutReminders, setWorkoutReminders] = useState(false);
  const [formScoreAlerts, setFormScoreAlerts] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchProfile() {
      try {
        const data = await apiFetch<UserProfile>("/users/me", {
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;
        setProfile(data);
        setName(data.name);
        // Normalize legacy goal values to current enum
        const goalMap: Record<string, string> = {
          general_fitness: "general",
          powerlifting: "strength",
          athletic_performance: "general",
          injury_prevention: "rehab",
          rehabilitation: "rehab",
          muscle_gain: "hypertrophy",
          fat_loss: "general",
        };
        setGoal(goalMap[data.goal] ?? data.goal);
        setExperienceLevel(data.experience_level);
        setTrainingMaxes(data.training_max ?? {});
        // store_landmarks is a client-side pref loaded from localStorage below
        setInjuries(data.injury_history ?? []);
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error("Failed to fetch profile:", error);
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }
    fetchProfile();

    // Load client-side preferences from localStorage
    if (typeof window !== "undefined") {
      setCameraResolution(localStorage.getItem("camera_resolution") ?? "720p");
      setCameraFps(localStorage.getItem("camera_fps") ?? "30");
      setWorkoutReminders(localStorage.getItem("pref_workout_reminders") === "true");
      setFormScoreAlerts(localStorage.getItem("pref_form_score_alerts") === "true");
      setWeeklySummary(localStorage.getItem("pref_weekly_summary") === "true");
      const storedLandmarks = localStorage.getItem("pref_store_landmarks");
      setStoreLandmarks(storedLandmarks === null ? true : storedLandmarks === "true");
    }

    return () => abortController.abort();
  }, []);

  // Persist camera settings to localStorage when changed
  function handleCameraResolutionChange(value: string) {
    setCameraResolution(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("camera_resolution", value);
    }
  }

  function handleCameraFpsChange(value: string) {
    setCameraFps(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("camera_fps", value);
    }
  }

  // Persist notification preferences to localStorage when changed
  function handleWorkoutRemindersChange(checked: boolean) {
    setWorkoutReminders(checked);
    if (typeof window !== "undefined") {
      localStorage.setItem("pref_workout_reminders", String(checked));
    }
  }

  function handleFormScoreAlertsChange(checked: boolean) {
    setFormScoreAlerts(checked);
    if (typeof window !== "undefined") {
      localStorage.setItem("pref_form_score_alerts", String(checked));
    }
  }

  function handleWeeklySummaryChange(checked: boolean) {
    setWeeklySummary(checked);
    if (typeof window !== "undefined") {
      localStorage.setItem("pref_weekly_summary", String(checked));
    }
  }

  // Injury management
  function handleAddInjury() {
    if (!newInjuryArea.trim()) return;
    const newInjury: InjuryItem = {
      area: newInjuryArea.trim(),
      side: newInjurySide,
    };
    if (newInjuryNotes.trim()) {
      newInjury.notes = newInjuryNotes.trim();
    }
    setInjuries((prev) => [...prev, newInjury]);
    setNewInjuryArea("");
    setNewInjurySide("bilateral");
    setNewInjuryNotes("");
  }

  function handleRemoveInjury(index: number) {
    setInjuries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/users/me", {
        method: "PUT",
        body: JSON.stringify({
          name,
          goal,
          experience_level: experienceLevel,
          training_maxes: trainingMaxes,
          injury_history: injuries,
        }),
      });
      // Persist privacy setting client-side (no backend column)
      if (typeof window !== "undefined") {
        localStorage.setItem("pref_store_landmarks", String(storeLandmarks));
      }
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              name,
              goal,
              experience_level: experienceLevel,
              training_max: trainingMaxes,
              injury_history: injuries,
            }
          : prev
      );
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleExportData() {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `squatsense-data-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export data:", error);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      await deleteAccount();
      router.push("/");
    } catch (error) {
      console.error("Failed to delete account:", error);
    } finally {
      setDeleting(false);
    }
  }

  async function handleLogout() {
    try {
      await apiLogout();
      router.push("/");
    } catch (error) {
      console.error("Failed to logout:", error);
      router.push("/");
    }
  }

  function updateTrainingMax(exercise: string, value: string) {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setTrainingMaxes((prev) => ({ ...prev, [exercise]: numValue }));
    } else if (value === "") {
      setTrainingMaxes((prev) => {
        const updated = { ...prev };
        delete updated[exercise];
        return updated;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
            Settings
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile and preferences
        </p>
      </div>

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-violet-400" />
            Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-violet-500/20 text-2xl font-bold text-violet-400">
              {name
                ? name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "U"}
            </div>
            <div>
              <p className="font-semibold">{name || "User"}</p>
              <p className="text-sm text-muted-foreground">
                {profile?.email ?? ""}
              </p>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Display Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={profile?.email ?? ""}
              disabled
              className="bg-muted"
            />
          </div>
        </CardContent>
      </Card>

      {/* Training Goals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-violet-400" />
            Training Goals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Goal */}
          <div className="space-y-2">
            <Label>Goal</Label>
            <Select value={goal} onValueChange={setGoal}>
              <SelectTrigger>
                <SelectValue placeholder="Select your goal" />
              </SelectTrigger>
              <SelectContent>
                {GOAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Experience Level */}
          <div className="space-y-2">
            <Label>Experience Level</Label>
            <Select
              value={experienceLevel}
              onValueChange={setExperienceLevel}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select experience level" />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Injury History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-violet-400" />
            Injury History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current injuries list */}
          {injuries.length > 0 ? (
            <div className="space-y-2">
              {injuries.map((injury, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-zinc-800/60 p-3 transition-all duration-200 hover:bg-zinc-800/40"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">{injury.area}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-xs">
                          {SIDE_OPTIONS.find((s) => s.value === injury.side)?.label ?? injury.side}
                        </Badge>
                        {injury.notes && (
                          <span className="text-xs text-muted-foreground">
                            {injury.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveInjury(index)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No injuries recorded. Add any current or past injuries below.
            </p>
          )}

          {/* Add new injury form */}
          <div className="rounded-lg border border-dashed p-4 space-y-3">
            <p className="text-sm font-medium">Add Injury</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Body Area</Label>
                <Input
                  value={newInjuryArea}
                  onChange={(e) => setNewInjuryArea(e.target.value)}
                  placeholder="e.g., Left knee"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Side</Label>
                <Select value={newInjurySide} onValueChange={setNewInjurySide}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIDE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  value={newInjuryNotes}
                  onChange={(e) => setNewInjuryNotes(e.target.value)}
                  placeholder="e.g., ACL tear 2023"
                  className="h-9"
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddInjury}
              disabled={!newInjuryArea.trim()}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Training Maxes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Dumbbell className="h-5 w-5 text-violet-400" />
            Training Maxes (lbs/kg)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {EXERCISE_TYPES.map((exercise) => (
            <div
              key={exercise.key}
              className="flex items-center justify-between gap-4"
            >
              <Label className="min-w-[120px] text-sm">
                {exercise.label}
              </Label>
              <Input
                type="number"
                min="0"
                step="2.5"
                value={trainingMaxes[exercise.key] ?? ""}
                onChange={(e) =>
                  updateTrainingMax(exercise.key, e.target.value)
                }
                placeholder="0"
                className="w-28"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-violet-400" />
            Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Store Landmarks Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                Store Landmark Data
              </Label>
              <p className="text-xs text-muted-foreground">
                Save pose landmark data for detailed analysis replay
              </p>
            </div>
            <Switch
              checked={storeLandmarks}
              onCheckedChange={setStoreLandmarks}
            />
          </div>

          {/* Export Data */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Export Data</Label>
              <p className="text-xs text-muted-foreground">
                Download all your training data as JSON
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportData}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>

          {/* Change Password */}
          <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-violet-400" />
              <Label className="text-sm font-medium">Change Password</Label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="password"
                placeholder="Current password"
                id="current-password"
                aria-label="Current password"
              />
              <Input
                type="password"
                placeholder="New password (min 8 chars)"
                id="new-password"
                aria-label="New password"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const current = (document.getElementById("current-password") as HTMLInputElement)?.value;
                const newPw = (document.getElementById("new-password") as HTMLInputElement)?.value;
                if (!current || !newPw) return;
                if (newPw.length < 8) {
                  alert("New password must be at least 8 characters");
                  return;
                }
                try {
                  const { changePassword } = await import("@/lib/api");
                  await changePassword(current, newPw);
                  alert("Password changed successfully");
                  (document.getElementById("current-password") as HTMLInputElement).value = "";
                  (document.getElementById("new-password") as HTMLInputElement).value = "";
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "Failed to change password";
                  alert(message);
                }
              }}
            >
              <Key className="mr-2 h-4 w-4" />
              Update Password
            </Button>
          </div>

          {/* Delete Account */}
          <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-destructive">
                Delete Account
              </Label>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and all data
              </p>
            </div>
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Delete Account
                  </DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete
                    your account and remove all your data from our servers.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-4">
                  <Label htmlFor="confirm-delete">
                    Type <span className="font-bold">DELETE</span> to confirm
                  </Label>
                  <Input
                    id="confirm-delete"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                  />
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteDialogOpen(false);
                      setDeleteConfirmText("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== "DELETE" || deleting}
                  >
                    {deleting ? "Deleting..." : "Delete Account"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-violet-400" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Workout Reminders</Label>
              <p className="text-xs text-muted-foreground">
                Get reminded to complete your scheduled workouts
              </p>
            </div>
            <Switch
              checked={workoutReminders}
              onCheckedChange={handleWorkoutRemindersChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Form Score Alerts</Label>
              <p className="text-xs text-muted-foreground">
                Receive alerts when your form score changes significantly
              </p>
            </div>
            <Switch
              checked={formScoreAlerts}
              onCheckedChange={handleFormScoreAlertsChange}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Weekly Summary</Label>
              <p className="text-xs text-muted-foreground">
                Get a weekly summary of your training progress
              </p>
            </div>
            <Switch
              checked={weeklySummary}
              onCheckedChange={handleWeeklySummaryChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Camera Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Camera className="h-5 w-5 text-violet-400" />
            Camera Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Resolution</Label>
              <p className="text-xs text-muted-foreground">
                Higher resolution uses more bandwidth
              </p>
            </div>
            <Select value={cameraResolution} onValueChange={handleCameraResolutionChange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="480p">480p</SelectItem>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">FPS Preference</Label>
              <p className="text-xs text-muted-foreground">
                Higher FPS gives smoother tracking but uses more resources
              </p>
            </div>
            <Select value={cameraFps} onValueChange={handleCameraFpsChange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 FPS</SelectItem>
                <SelectItem value="30">30 FPS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Save and Logout */}
      <div className="flex flex-col gap-3 pb-8 sm:flex-row">
        <Button
          size="lg"
          className="flex-1 gap-2 animate-glow-pulse rounded-xl"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-1 gap-2"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
