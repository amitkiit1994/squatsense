import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/ui/cookie-consent";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SquatSense",
  description: "AI-powered movement intelligence platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SquatSense",
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
