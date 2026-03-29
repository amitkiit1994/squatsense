import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import AnalyticsInit from "@/components/AnalyticsInit";

export const metadata: Metadata = {
  metadataBase: new URL("https://squatsense.ai"),
  title: {
    default: "SquatSense — Move More. Move Better.",
    template: "%s | SquatSense",
  },
  description:
    "The 30-second squat game. AI scores your form in real time. Play at work, play at home, compete everywhere.",
  keywords: [
    "squat game",
    "fitness game",
    "AI fitness",
    "squat challenge",
    "movement points",
    "office fitness",
    "squat form checker",
    "real-time pose detection",
  ],
  authors: [{ name: "SquatSense" }],
  creator: "SquatSense",
  openGraph: {
    title: "SquatSense — Move More. Move Better.",
    description:
      "The 30-second squat game. AI scores your form in real time. Earn Movement Points. Climb the leaderboard.",
    url: "https://squatsense.ai",
    siteName: "SquatSense",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SquatSense — Move More. Move Better.",
    description:
      "The 30-second squat game. AI scores your form in real time. Compete everywhere.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://squatsense.ai",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <AnalyticsInit />
        <Navbar />
        {children}
      </body>
    </html>
  );
}
