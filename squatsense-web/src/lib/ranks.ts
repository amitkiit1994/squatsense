// Rank thresholds (must match backend/services/movement_points.py)
const RANKS = [
  { name: "bronze", min: 0, nextAt: 500 },
  { name: "silver", min: 500, nextAt: 2000 },
  { name: "gold", min: 2000, nextAt: 5000 },
  { name: "elite", min: 5000, nextAt: null },
] as const;

export const RANK_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  elite: "#9333ea",
};

export interface RankProgress {
  rank: string;
  progress: number; // 0-1, percentage toward next rank
  pointsToNext: number;
  nextRank: string | null;
  currentMin: number;
  nextAt: number | null;
}

export function getRankProgress(totalPoints: number): RankProgress {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    const r = RANKS[i];
    if (totalPoints >= r.min) {
      if (r.nextAt === null) {
        return { rank: r.name, progress: 1, pointsToNext: 0, nextRank: null, currentMin: r.min, nextAt: null };
      }
      const range = r.nextAt - r.min;
      const earned = totalPoints - r.min;
      return {
        rank: r.name,
        progress: Math.min(earned / range, 1),
        pointsToNext: Math.round(r.nextAt - totalPoints),
        nextRank: RANKS[i + 1]?.name ?? null,
        currentMin: r.min,
        nextAt: r.nextAt,
      };
    }
  }
  return { rank: "bronze", progress: 0, pointsToNext: 500, nextRank: "silver", currentMin: 0, nextAt: 500 };
}

// Personal best tracking
const PB_KEY = "squatsense_pb_v1";

// Migrate from old key name
if (typeof window !== "undefined") {
  const oldPb = localStorage.getItem("squatsense_pb");
  if (oldPb && !localStorage.getItem(PB_KEY)) {
    localStorage.setItem(PB_KEY, oldPb);
  }
  if (oldPb) localStorage.removeItem("squatsense_pb");
}

export function getPersonalBest(): number {
  if (typeof window === "undefined") return 0;
  return parseFloat(localStorage.getItem(PB_KEY) || "0");
}

/** Returns true if this is a new personal best */
export function checkAndUpdatePB(points: number): boolean {
  const current = getPersonalBest();
  if (points > current && points > 0) {
    localStorage.setItem(PB_KEY, String(points));
    return true;
  }
  return false;
}
