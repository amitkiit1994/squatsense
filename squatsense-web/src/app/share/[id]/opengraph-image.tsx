import { ImageResponse } from "next/og";

// ── OG image for share links (WhatsApp/social previews) ─────────────────

export const alt = "SquatSense score card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RANK_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  elite: "#9333ea",
};

interface SessionData {
  nickname: string;
  rank: string;
  points_earned: number;
  reps_counted: number;
  reps_total: number;
  avg_quality: number;
  max_combo: number;
}

async function fetchSessionData(sessionId: string): Promise<SessionData | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    const res = await fetch(
      `${apiUrl}/api/v1/league/sessions/${sessionId}/share`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 44, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 20, color: "#888888", letterSpacing: 3, textTransform: "uppercase" }}>
        {label}
      </div>
    </div>
  );
}

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await fetchSessionData(id);

  if (!data) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
          }}
        >
          <div style={{ fontSize: 80, fontWeight: 700, color: "#00ff88", letterSpacing: 6 }}>
            SQUATSENSE
          </div>
          <div style={{ fontSize: 32, color: "#888888", marginTop: 24 }}>
            The 30-second squat game. AI scores your form in real time.
          </div>
        </div>
      ),
      size
    );
  }

  const rankColor = RANK_COLORS[data.rank] || "#888888";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #111111 0%, #0a0a0a 100%)",
          padding: 60,
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: "#00ff88", letterSpacing: 8 }}>
          SQUATSENSE
        </div>

        <div style={{ fontSize: 36, color: "#f0f0f0", marginTop: 36 }}>{data.nickname}</div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: rankColor,
            letterSpacing: 6,
            textTransform: "uppercase",
            marginTop: 8,
          }}
        >
          {data.rank} RANK
        </div>

        <div style={{ fontSize: 140, fontWeight: 900, color: "#ffffff", marginTop: 12 }}>
          {data.points_earned.toFixed(1)}
        </div>
        <div style={{ fontSize: 28, color: "#00ff88", letterSpacing: 10, marginTop: 4 }}>
          MOVEMENT POINTS
        </div>

        <div style={{ display: "flex", gap: 80, marginTop: 48 }}>
          <Stat label="Reps" value={`${data.reps_counted}/${data.reps_total}`} color="#f0f0f0" />
          <Stat label="Quality" value={`${Math.round(data.avg_quality * 100)}%`} color="#06b6d4" />
          <Stat label="Max Combo" value={`x${data.max_combo}`} color="#06b6d4" />
        </div>

        <div style={{ fontSize: 24, color: "#888888", marginTop: 48 }}>
          Can you beat this? Play at squatsense.ai
        </div>
      </div>
    ),
    size
  );
}
