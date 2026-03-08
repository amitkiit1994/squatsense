import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/ui/cookie-consent";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FreeForm Fitness — AI-Powered Movement Analysis",
  description:
    "Real-time form scoring, fatigue detection, and AI coaching for strength training — using just your phone camera. No wearables needed.",
  manifest: "/manifest.json",
  metadataBase: new URL("https://freeformfitness.ai"),
  openGraph: {
    title: "FreeForm Fitness — AI-Powered Movement Analysis",
    description:
      "Real-time form scoring, fatigue detection, and AI coaching for strength training — using just your phone camera. No wearables needed.",
    url: "https://freeformfitness.ai",
    siteName: "FreeForm Fitness",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "FreeForm Fitness — AI movement analysis from your phone camera",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FreeForm Fitness — AI-Powered Movement Analysis",
    description:
      "Real-time form scoring, fatigue detection, and AI coaching for strength training — using just your phone camera.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FreeForm Fitness",
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-zinc-950 text-zinc-50`}>
        {children}
        <CookieConsent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
                  // In development: unregister any existing service worker to prevent stale caching
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    registrations.forEach(function(registration) { registration.unregister(); });
                  });
                } else {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').catch(function() {});
                  });
                }
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
