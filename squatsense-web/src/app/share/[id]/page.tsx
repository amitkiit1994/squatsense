import type { Metadata } from "next";
import ShareClient from "./ShareClient";

// ── OG Metadata ──────────────────────────────────────────────────────────

interface SharePageProps {
  params: Promise<{ id: string }>;
}

async function fetchSessionData(sessionId: string) {
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

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchSessionData(id);

  if (!data) {
    return {
      title: "SquatSense - Score Card",
      description: "Play the 30-second squat game at squatsense.ai",
    };
  }

  const title = `${data.nickname} scored ${data.points_earned.toFixed(1)} Movement Points`;
  const description = `${data.reps_counted} reps | ${Math.round(data.avg_quality * 100)}% quality | x${data.max_combo} max combo -- Can you beat this? Play at squatsense.ai`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://squatsense.ai/share/${id}`,
      siteName: "SquatSense",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function SharePage({ params }: SharePageProps) {
  const { id } = await params;
  const data = await fetchSessionData(id);

  return <ShareClient sessionId={id} initialData={data} />;
}
