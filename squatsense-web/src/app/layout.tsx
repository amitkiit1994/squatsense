import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import AnalyticsInit from "@/components/AnalyticsInit";

export const metadata: Metadata = {
  title: "SquatSense — Move More. Move Better.",
  description: "The 30-second squat game. Play at work. Play at home. Compete everywhere.",
  openGraph: {
    title: "SquatSense",
    description: "The 30-second squat game. Earn Movement Points. Climb the leaderboard.",
    type: "website",
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
